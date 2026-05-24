// src/services/seedTenantOnIndustryConfirmedService.ts
// Onboarding seed skill — runs once when a tenant confirms their industry.
//
// What it does (in order):
//   1. Idempotency guard — checks existing data, skips if already seeded
//   2. Clone KT (global m_cat_blocks) → tenant-scoped blocks (is_live=false, is_seed=true)
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

  // ── Step 2: Clone global KT blocks for this industry ────────────────────
  let catalogBlocksSeeded = 0;
  const tagsFilter = JSON.stringify([industryId]);

  const { count: existingSeedCount } = await supabase
    .from('m_cat_blocks')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_seed', true)
    .filter('tags', 'cs', tagsFilter);

  if ((existingSeedCount ?? 0) > 0) {
    catalogBlocksSeeded = existingSeedCount ?? 0;
    console.log('[seedTenantOnIndustryConfirmed] KT blocks already cloned, skipping');
  } else {
    const { data: ktBlocks, error: fetchError } = await supabase
      .from('m_cat_blocks')
      .select('*')
      .is('tenant_id', null)
      .filter('tags', 'cs', tagsFilter);

    if (fetchError) {
      errors.push(`KT blocks fetch failed: ${fetchError.message}`);
    } else if (ktBlocks && ktBlocks.length > 0) {
      const tenantBlocks = ktBlocks.map(
        ({ created_at, updated_at, created_by, updated_by, ...block }) => ({
          ...block,
          id: randomUUID(),
          tenant_id: tenantId,
          is_live: false,
          is_seed: true,
          is_active: true,
          created_by: null,
          updated_by: null,
        })
      );

      const { error: insertError } = await supabase.from('m_cat_blocks').insert(tenantBlocks);

      if (insertError) {
        console.warn('[seedTenantOnIndustryConfirmed] KT block clone skipped:', insertError.message);
      } else {
        catalogBlocksSeeded = tenantBlocks.length;
        console.log(`[seedTenantOnIndustryConfirmed] Cloned ${catalogBlocksSeeded} KT blocks`);
      }
    } else {
      console.log('[seedTenantOnIndustryConfirmed] No global KT blocks found for:', industryId);
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
    (existingSeedCount ?? 0) > 0 &&
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
