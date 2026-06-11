// src/services/seedTenantTemplatesService.ts
// Template-scoped onboarding seeder — called from POST /api/seeds/tenant/templates
//
// Seeds ONLY the templates the user explicitly selected on ResourcePickStep.
// Calls cat-blocks/bulk edge function TWICE per template set:
//   is_live: false  → test environment
//   is_live: true   → live environment
//
// Concurrency safety:
//   cat-blocks/bulk checks (tenant_id, resource_template_id, is_live) before insert.
//   m_cat_blocks has a unique index on (tenant_id, resource_template_id, is_live, name)
//   WHERE is_seed = true, so concurrent inserts use ON CONFLICT DO NOTHING at DB level.

import axios from 'axios';
import { ktCatBlockMapperService, CatBlockPayload } from './ktCatBlockMapperService';
import { seedSampleContacts } from './seedSampleContactsService';
import { SEQUENCE_SEED_DATA } from '../seeds';

export interface SeedTemplatesInput {
  tenantId:               string;
  equipmentTemplateIds:   string[];   // ResourceTemplate IDs selected by user
  facilityTemplateIds:    string[];   // ResourceTemplate IDs selected by user
  businessType:           'buyer' | 'seller' | 'both';
  industryId:             string;     // for sample contacts + facility nodes
  authToken:              string;
}

export interface PerTemplateResult {
  templateId:    string;
  templateName:  string;
  blocksCreated: number;
  status:        'success' | 'failed' | 'skipped';
  error?:        string;
}

export interface SeedTemplatesResult {
  success:              boolean;
  equipmentBlocksSeeded: number;   // blocks created in test + live envs combined
  facilityNodesSeeded:  number;
  sampleContactsSeeded: number;
  sequencesSeeded:      boolean;
  perTemplate:          PerTemplateResult[];
  errors:               string[];
}

const SUPABASE_EDGE = () => process.env.SUPABASE_URL;

// Call the cat-blocks/bulk edge function for one environment
async function callBulkSeed(
  kts: Array<{ resource_template_id: string; kt_name: string; blocks: CatBlockPayload[] }>,
  tenantId:  string,
  authToken: string,
  isLive:    boolean,
): Promise<{ blocksCreated: number; errors: string[] }> {
  const url = `${SUPABASE_EDGE()}/functions/v1/cat-blocks/bulk`;
  const errors: string[] = [];
  let blocksCreated = 0;

  try {
    const resp = await axios.post(
      url,
      { kts, tenant_id: tenantId, is_live: isLive },
      {
        headers: {
          Authorization: authToken,
          'x-tenant-id':  tenantId,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const summary = resp.data?.data?.summary;
    blocksCreated = summary?.blocks_created ?? 0;

    const failed = (resp.data?.data?.results || []).filter((r: any) => r.status === 'failed');
    for (const f of failed) {
      errors.push(`${f.kt_name}: ${f.error || 'insert failed'}`);
    }
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || 'cat-blocks/bulk call failed';
    errors.push(`[${isLive ? 'live' : 'test'}] ${msg}`);
  }

  return { blocksCreated, errors };
}

export async function seedTenantTemplates(
  input: SeedTemplatesInput,
): Promise<SeedTemplatesResult> {
  const {
    tenantId,
    equipmentTemplateIds,
    facilityTemplateIds,
    businessType,
    industryId,
    authToken,
  } = input;

  const errors: string[] = [];
  const perTemplate: PerTemplateResult[] = [];
  let equipmentBlocksSeeded = 0;

  console.log('[seedTenantTemplates] Starting', {
    tenantId,
    equipmentTemplateIds,
    facilityTemplateIds,
    businessType,
  });

  // ── Step 1: Build catalog blocks for selected equipment templates ────────────
  const isSeller = businessType === 'seller' || businessType === 'both';

  if (isSeller && equipmentTemplateIds.length > 0) {
    const kts: Array<{ resource_template_id: string; kt_name: string; blocks: CatBlockPayload[] }> = [];

    for (const templateId of equipmentTemplateIds) {
      try {
        const { blocks } = await ktCatBlockMapperService.buildBlocksForTemplate(templateId);

        // Get template name for logging (use first block's knowledge_tree_ref or fallback)
        const ktName = blocks[0]?.config?.selectedResources?.[0]?.resource_name || templateId;

        kts.push({ resource_template_id: templateId, kt_name: ktName, blocks });

        perTemplate.push({
          templateId,
          templateName: ktName,
          blocksCreated: 0,  // updated after bulk seed
          status: blocks.length > 0 ? 'success' : 'skipped',
        });

        console.log(`[seedTenantTemplates] Built ${blocks.length} blocks for ${ktName}`);
      } catch (err: any) {
        const msg = err?.message || 'mapper error';
        errors.push(`Template ${templateId}: ${msg}`);
        perTemplate.push({ templateId, templateName: templateId, blocksCreated: 0, status: 'failed', error: msg });
      }
    }

    // Seed both environments
    if (kts.length > 0) {
      const [testResult, liveResult] = await Promise.all([
        callBulkSeed(kts, tenantId, authToken, false),
        callBulkSeed(kts, tenantId, authToken, true),
      ]);

      equipmentBlocksSeeded = testResult.blocksCreated + liveResult.blocksCreated;
      errors.push(...testResult.errors, ...liveResult.errors);

      // Update per-template block counts from live result (canonical count)
      for (const kt of kts) {
        const entry = perTemplate.find(p => p.templateId === kt.resource_template_id);
        if (entry) entry.blocksCreated = kt.blocks.length;
      }

      console.log(`[seedTenantTemplates] Seeded: test=${testResult.blocksCreated} live=${liveResult.blocksCreated} blocks`);
    }
  }

  // ── Step 2: Facility nodes (buyer/both) ──────────────────────────────────────
  let facilityNodesSeeded = 0;
  const isBuyer = businessType === 'buyer' || businessType === 'both';

  if (isBuyer && industryId) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );

      const { data: rpcResult, error: rpcError } = await sb.rpc(
        'seed_onboarding_facility_nodes',
        { p_tenant_id: tenantId, p_industry_id: industryId },
      );

      if (rpcError) {
        errors.push(`Facility node seeding: ${rpcError.message}`);
      } else {
        facilityNodesSeeded = rpcResult?.facilityNodesSeeded ?? 0;
        console.log(`[seedTenantTemplates] Created ${facilityNodesSeeded} facility nodes`);
      }
    } catch (err: any) {
      errors.push(`Facility nodes: ${err?.message || 'rpc error'}`);
    }
  }

  // ── Step 3: Sample contacts ──────────────────────────────────────────────────
  let sampleContactsSeeded = 0;
  if (industryId) {
    const contactResult = await seedSampleContacts({ tenantId, industryId });
    if (!contactResult.success) {
      errors.push(...contactResult.errors.map((e: string) => `Contacts: ${e}`));
    } else {
      sampleContactsSeeded = contactResult.contactsSeeded;
    }
  }

  // ── Step 4: Sequences (both environments, non-fatal) ──────────────────────────
  let sequencesSeeded = false;
  try {
    for (const environment of ['live', 'test']) {
      await axios.post(
        `${SUPABASE_EDGE()}/functions/v1/sequences/seed`,
        { seedData: SEQUENCE_SEED_DATA },
        {
          headers: {
            Authorization:  authToken,
            'x-tenant-id':  tenantId,
            'x-environment': environment,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );
    }
    sequencesSeeded = true;
    console.log('[seedTenantTemplates] Sequences seeded for live + test');
  } catch (seqErr: any) {
    console.warn('[seedTenantTemplates] Sequences seed skipped (non-fatal):', seqErr?.message);
  }

  const result: SeedTemplatesResult = {
    success: errors.length === 0,
    equipmentBlocksSeeded,
    facilityNodesSeeded,
    sampleContactsSeeded,
    sequencesSeeded,
    perTemplate,
    errors,
  };

  console.log('[seedTenantTemplates] Done', {
    equipmentBlocksSeeded,
    facilityNodesSeeded,
    sampleContactsSeeded,
    errorCount: errors.length,
  });

  return result;
}
