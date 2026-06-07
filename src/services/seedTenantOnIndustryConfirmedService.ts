// src/services/seedTenantOnIndustryConfirmedService.ts
// Onboarding seed skill — runs once when a tenant confirms their industry.
//
// What it does (in order):
//   1. Idempotency guard — checks existing data, skips if already seeded
//   2. KT-based catalog seeding: query m_catalog_resource_templates for the industry
//      → insert one m_cat_block per template (seller/both only)
//   3. Buyer/both only: create placeholder facility hierarchy via SECURITY DEFINER RPC
//   4. Seed 3 industry-specific sample contacts via SECURITY DEFINER RPC
//   5. Seed sequence numbers for both live + test environments (silent, non-fatal)
//
// Auth model:
//   The API server uses only the anon key (SUPABASE_KEY). The anon-key client
//   is sufficient for reads against permissive-SELECT tables and for calling
//   SECURITY DEFINER functions via supabase.rpc() — the DB function runs as
//   the DB owner and bypasses RLS internally.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { SEQUENCE_SEED_DATA } from '../seeds';
import { seedSampleContacts } from './seedSampleContactsService';

export interface SeedIndustryInput {
  tenantId: string;
  industryId: string;
  businessType: 'buyer' | 'seller' | 'both';
  authToken: string;
}

export interface SeedIndustryResult {
  success: boolean;
  alreadySeeded: boolean;
  catalogBlocksSeeded: number;
  facilityNodesSeeded: number;
  sampleContactsSeeded: number;
  sequencesSeeded: boolean;
  errors: string[];
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('[seedTenantOnIndustryConfirmed] Missing SUPABASE_URL or Supabase key');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function seedTenantOnIndustryConfirmed(
  input: SeedIndustryInput
): Promise<SeedIndustryResult> {
  const { tenantId, industryId, businessType, authToken } = input;
  const supabase = buildSupabase();
  const errors: string[] = [];

  console.log('[seedTenantOnIndustryConfirmed] Starting', { tenantId, industryId, businessType });

  // ── Step 1: Application-level idempotency ────────────────────────────────
  let alreadySeeded = false;

  // ── Step 2: KT-based catalog seeding (seller/both only) ─────────────────
  let catalogBlocksSeeded = 0;
  const isSeller = businessType === 'seller' || businessType === 'both';

  let existingSeedCount = 0;

  if (isSeller) {
    // Idempotency: check if we already seeded catalog blocks for this tenant+industry
    const { count: seedCount } = await supabase
      .from('m_cat_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_seed', true)
      .contains('tags', [industryId]);

    existingSeedCount = seedCount ?? 0;

    if (existingSeedCount > 0) {
      catalogBlocksSeeded = existingSeedCount;
      console.log('[seedTenantOnIndustryConfirmed] Catalog blocks already seeded, skipping');
    } else {
      // Resolve block_type_id for 'service' from master data
      let blockTypeId: string | null = null;

      try {
        const { data: masterRow } = await supabase
          .from('m_category_master')
          .select('id')
          .eq('category_name', 'cat_block_type')
          .single();

        if (masterRow?.id) {
          const { data: detailRow } = await supabase
            .from('m_category_details')
            .select('id')
            .eq('category_id', masterRow.id)
            .eq('sub_cat_name', 'service')
            .single();

          blockTypeId = detailRow?.id ?? null;
        }
      } catch (lookupErr: any) {
        console.warn(
          '[seedTenantOnIndustryConfirmed] block_type_id lookup failed (non-fatal):',
          lookupErr?.message
        );
      }

      if (!blockTypeId) {
        errors.push(
          'block_type_id for "service" not found in m_category_details — catalog seeding skipped'
        );
        console.warn(
          '[seedTenantOnIndustryConfirmed] Skipping catalog seed: block_type_id not resolved'
        );
      } else {
        // Query KT resource templates for this industry
        const { data: templates, error: templateError } = await supabase
          .from('m_catalog_resource_templates')
          .select('id, name, description')
          .eq('industry_id', industryId)
          .eq('is_active', true);

        if (templateError) {
          errors.push(`KT template fetch failed: ${templateError.message}`);
          console.error(
            '[seedTenantOnIndustryConfirmed] Template fetch error:',
            templateError.message
          );
        } else if (templates && templates.length > 0) {
          const tenantBlocks = templates.map(template => ({
            id: randomUUID(),
            tenant_id: tenantId,
            block_type_id: blockTypeId as string,
            name: template.name,
            description: template.description ?? null,
            tags: [industryId],
            resource_template_id: template.id,
            is_seed: true,
            is_live: false,
            is_active: true,
            config: {},
          }));

          const { error: insertError } = await supabase
            .from('m_cat_blocks')
            .insert(tenantBlocks);

          if (insertError) {
            errors.push(`Catalog block insert failed: ${insertError.message}`);
            console.error(
              '[seedTenantOnIndustryConfirmed] Insert error:',
              insertError.message
            );
          } else {
            catalogBlocksSeeded = tenantBlocks.length;
            console.log(
              `[seedTenantOnIndustryConfirmed] Seeded ${catalogBlocksSeeded} catalog blocks from KT`
            );
          }
        } else {
          console.log(
            '[seedTenantOnIndustryConfirmed] No KT templates found for industry:',
            industryId
          );
        }
      }
    }
  }

  // ── Step 3: Facility placeholders (buyer/both only) ──────────────────────
  let facilityNodesSeeded = 0;
  let existingPlaceholderCount = 0;
  const isBuyer = businessType === 'buyer' || businessType === 'both';

  if (isBuyer) {
    const { count: placeholderCount } = await supabase
      .from('t_client_asset_registry')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('ownership_type', 'self')
      .filter('specifications->>is_placeholder', 'eq', 'true');

    existingPlaceholderCount = placeholderCount ?? 0;

    if (existingPlaceholderCount > 0) {
      facilityNodesSeeded = existingPlaceholderCount;
      console.log('[seedTenantOnIndustryConfirmed] Facility placeholders already exist, skipping');
    } else {
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'seed_onboarding_facility_nodes',
        { p_tenant_id: tenantId, p_industry_id: industryId }
      );

      if (rpcError) {
        errors.push(`Facility node seeding failed: ${rpcError.message}`);
        console.error('[seedTenantOnIndustryConfirmed] RPC error:', rpcError);
      } else if (rpcResult) {
        facilityNodesSeeded = rpcResult.facilityNodesSeeded ?? 0;
        console.log(
          `[seedTenantOnIndustryConfirmed] Created ${facilityNodesSeeded} facility nodes` +
            (rpcResult.skipped ? ' (skipped — already existed)' : '')
        );
      }
    }
  }

  // ── Step 4: Sample contacts (all business types) ─────────────────────────
  let sampleContactsSeeded = 0;

  const contactResult = await seedSampleContacts({ tenantId, industryId });

  if (!contactResult.success) {
    errors.push(...contactResult.errors.map(e => `Sample contacts: ${e}`));
  } else {
    sampleContactsSeeded = contactResult.contactsSeeded;
  }

  // Mark as already seeded if all application-level checks showed existing data
  if (
    (!isSeller || existingSeedCount > 0) &&
    (!isBuyer || existingPlaceholderCount > 0) &&
    contactResult.alreadySeeded
  ) {
    alreadySeeded = true;
  }

  // ── Step 5: Seed sequence numbers (both environments, non-fatal) ─────────
  let sequencesSeeded = false;
  try {
    for (const environment of ['live', 'test']) {
      await axios.post(
        `${process.env.SUPABASE_URL}/functions/v1/sequences/seed`,
        { seedData: SEQUENCE_SEED_DATA },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'x-environment': environment,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
    }
    sequencesSeeded = true;
    console.log('[seedTenantOnIndustryConfirmed] Sequences seeded for live + test');
  } catch (seqError: any) {
    console.warn(
      '[seedTenantOnIndustryConfirmed] Sequences seed skipped (non-fatal):',
      seqError.response?.data?.error || seqError.message
    );
  }

  const result: SeedIndustryResult = {
    success: errors.length === 0,
    alreadySeeded,
    catalogBlocksSeeded,
    facilityNodesSeeded,
    sampleContactsSeeded,
    sequencesSeeded,
    errors,
  };

  console.log('[seedTenantOnIndustryConfirmed] Done', {
    success: result.success,
    catalogBlocksSeeded,
    facilityNodesSeeded,
    sampleContactsSeeded,
    sequencesSeeded,
    errorCount: errors.length,
  });

  return result;
}
