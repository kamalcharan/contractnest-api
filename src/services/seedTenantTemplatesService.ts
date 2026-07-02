// src/services/seedTenantTemplatesService.ts
// Template-scoped onboarding seeder — called from POST /api/seeds/tenant/templates
//
// Sprint 1 rework (legibility probe B0.5):
//   1. Tenant intent is PERSISTED first (t_tenant_selected_resources, S8) and the
//      seed then runs from that table — not from transient request state.
//      purpose='sell' → seller catalog leg (KT mapper → cat-blocks/bulk, test+live)
//      purpose='own'  → buyer registry leg (seed_onboarding_registry_assets RPC:
//                       equipment → /equipment-registry, asset → /facility-registry)
//   2. Industry coverage is validated through the canonical
//      resolve_industry_resource_templates RPC (recursive parent_id walk).
//      Zero tagged/junction matches ⇒ status 'no_coverage' — NEVER silent success.
//      Requested templates outside the resolved set are dropped with a warning.
//   3. Personas run sequentially in one call: seller leg then buyer leg; each leg
//      fails independently and is independently idempotent, so a retry re-runs
//      only what didn't land.
//
// Concurrency / idempotency:
//   - Selections upsert on (tenant_id, resource_template_id, purpose).
//   - cat-blocks/bulk checks (tenant_id, resource_template_id, is_live) before insert
//     and m_cat_blocks has unique index ux_cat_blocks_seed_template_env_name
//     (tenant_id, resource_template_id, is_live, name) WHERE is_seed = true.
//   - seed_onboarding_registry_assets uses ON CONFLICT DO NOTHING on
//     ux_car_onboarding_seed_template (tenant_id, template_id) for onboarding seeds.

import axios from 'axios';
import crypto from 'crypto';
import { ktCatBlockMapperService, CatBlockPayload } from './ktCatBlockMapperService';
import { seedSampleContacts } from './seedSampleContactsService';
import { SEQUENCE_SEED_DATA } from '../seeds';
import {
  persistSelectedResources,
  getSelectedResources,
  resolveIndustryTemplates,
  ResourceSelection,
} from './onboardingIntentService';

export interface SeedTemplatesInput {
  tenantId:               string;
  equipmentTemplateIds:   string[];   // ResourceTemplate IDs selected on ResourcePickStep
  facilityTemplateIds:    string[];   // ResourceTemplate IDs selected on ResourcePickStep
  serviceTemplateIds?:    string[];   // Service template IDs (no KT required — flat pricing)
  businessType:           'buyer' | 'seller' | 'both';
  industryId:             string;     // primary industry (legacy single-value)
  industryIds?:           string[];   // all selected industries (preferred)
  authToken:              string;
  userId?:                string | null;
}

export interface PerTemplateResult {
  templateId:    string;
  templateName:  string;
  blocksCreated: number;
  status:        'success' | 'failed' | 'skipped';
  error?:        string;
}

export type SeedStatus = 'success' | 'partial' | 'no_coverage' | 'error';

export interface SeedTemplatesResult {
  success:               boolean;
  status:                SeedStatus;
  statusDetail:          string;
  industryIds:           string[];
  equipmentBlocksSeeded: number;   // catalog blocks created in test + live envs combined
  serviceBlocksSeeded:   number;   // service catalog blocks (no KT — flat pricing)
  registryAssetsSeeded:  number;   // buyer registry entries created (is_live=false)
  facilityNodesSeeded:   number;   // kept for response compatibility (= registryAssetsSeeded)
  sampleContactsSeeded:  number;
  sequencesSeeded:       boolean;
  perTemplate:           PerTemplateResult[];
  droppedTemplateIds:    string[]; // requested but outside the industry resolution set
  errors:                string[];
}

const SUPABASE_EDGE = () => process.env.SUPABASE_URL;

// Edge functions reject unsigned writes ("Direct access ... is not allowed"):
// every non-GET call must carry x-timestamp + x-internal-signature
// (HMAC-SHA256 base64 of `${timestamp}.${body}`, INTERNAL_SIGNING_SECRET).
// The pre-Sprint-1 seeder posted raw axios with neither header, so the bulk
// seed ALWAYS 403'd — one more reason no tenant ever had seeded blocks.
function signedHeaders(requestBody: string, tenantId: string, authToken: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: authToken,
    'x-tenant-id': tenantId,
    'x-is-admin': 'false',
    'x-timestamp': timestamp,
  };
  const secret = process.env.INTERNAL_SIGNING_SECRET || '';
  if (secret) {
    headers['x-internal-signature'] = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${requestBody}`)
      .digest('base64');
  } else {
    console.warn('[seedTenantTemplates] INTERNAL_SIGNING_SECRET not set — bulk seed will be rejected by the edge');
  }
  return headers;
}

// Call the cat-blocks/bulk edge function for one environment
async function callBulkSeed(
  kts: Array<{ resource_template_id: string; kt_name: string; blocks: CatBlockPayload[] }>,
  tenantId:  string,
  authToken: string,
  isLive:    boolean,
): Promise<{ blocksCreated: number; alreadySeeded: number; errors: string[] }> {
  const url = `${SUPABASE_EDGE()}/functions/v1/cat-blocks/bulk`;
  const errors: string[] = [];
  let blocksCreated = 0;
  let alreadySeeded = 0;

  try {
    const bodyObj = { kts, tenant_id: tenantId, is_live: isLive };
    const requestBody = JSON.stringify(bodyObj);
    const resp = await axios.post(url, requestBody, {
      headers: signedHeaders(requestBody, tenantId, authToken),
      timeout: 60000,
    });

    const summary = resp.data?.data?.summary;
    blocksCreated = summary?.blocks_created ?? 0;

    const results = resp.data?.data?.results || [];
    alreadySeeded = results.filter((r: any) => r.skip_reason === 'already_seeded').length;

    const failed = results.filter((r: any) => r.status === 'failed');
    for (const f of failed) {
      errors.push(`${f.kt_name}: ${f.error || 'insert failed'}`);
    }
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || 'cat-blocks/bulk call failed';
    errors.push(`[${isLive ? 'live' : 'test'}] ${msg}`);
  }

  return { blocksCreated, alreadySeeded, errors };
}

// ── Service template → flat cat-block (no KT lookup) ─────────────────────────
// Services don't have KT variants or checkpoints. One block per template,
// priced at 0 (user sets in pricing-review), pricingMode=independent.
const BLOCK_TYPE_SERVICE   = 'ae7050b4-3cca-4ed9-aa02-4a1f697b75cc';
const PRICING_MODE_INDEPENDENT = '718f839d-9d41-4212-b2b0-553a2198fb86';

async function buildServiceCatBlocks(
  serviceTemplateIds: string[],
  authToken: string,
): Promise<Array<{ resource_template_id: string; kt_name: string; blocks: CatBlockPayload[] }>> {
  if (!serviceTemplateIds.length) return [];

  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!;
  const sb  = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: process.env.SUPABASE_SERVICE_ROLE_KEY ? undefined : { headers: { Authorization: authToken } },
  });

  const { data: templates, error } = await sb
    .from('m_catalog_resource_templates')
    .select('id, name, description, sub_category')
    .in('id', serviceTemplateIds)
    .eq('is_active', true);

  if (error || !templates?.length) {
    console.warn('[buildServiceCatBlocks] Failed to fetch service templates:', error?.message);
    return [];
  }

  return templates.map((tmpl: any) => ({
    resource_template_id: tmpl.id,
    kt_name: tmpl.name,
    blocks: [{
      name:                 tmpl.name,
      display_name:         tmpl.name,
      description:          tmpl.description ?? null,
      block_type_id:        BLOCK_TYPE_SERVICE,
      pricing_mode_id:      PRICING_MODE_INDEPENDENT,
      base_price:           0,
      currency:             'INR',
      resource_template_id: tmpl.id,
      knowledge_tree_ref:   { resource_template_id: tmpl.id },
      config: {
        selectedResources:    [],
        selectedVariants:     [],
        pricingMode:          'independent',
        priceType:            'fixed',
        deliveryMode:         'onsite',
        pricingRecords:       [{ id: '1', currency: 'INR', amount: 0, price_type: 'fixed', tax_inclusion: 'exclusive', taxes: [], is_active: true }],
        variantPricingMode:   'all',
        kt_reference_price:   null,
        kt_service_activity:  'service_delivery',
      },
      is_seed:   true,
      is_active: true,
      visible:   true,
    }],
  }));
}

// Persona → selection purposes:
//   seller: equipment picks are things the tenant SERVICES → 'sell'
//   buyer:  equipment + facility picks are things the tenant OWNS → 'own'
//   both:   equipment picks are BOTH serviced and owned ('sell' + 'own');
//           facility picks are owned ('own')   [founder-approved dual-intent rule]
function buildSelections(
  businessType: 'buyer' | 'seller' | 'both',
  equipmentTemplateIds: string[],
  facilityTemplateIds: string[],
): ResourceSelection[] {
  const selections: ResourceSelection[] = [];
  const isSeller = businessType === 'seller' || businessType === 'both';
  const isBuyer  = businessType === 'buyer'  || businessType === 'both';

  if (isSeller) {
    for (const id of equipmentTemplateIds) selections.push({ resource_template_id: id, purpose: 'sell' });
  }
  if (isBuyer) {
    for (const id of equipmentTemplateIds) selections.push({ resource_template_id: id, purpose: 'own' });
    for (const id of facilityTemplateIds)  selections.push({ resource_template_id: id, purpose: 'own' });
  }
  return selections;
}

// Single-equipment seed (Catalog Studio "Seed with VaNi") — the per-equipment
// primitive the founder's design is built on. Persists the pick (S8), maps,
// and bulk-loads both environments. Idempotent per (tenant, template, env).
export async function seedSingleEquipment(input: {
  tenantId: string;
  resourceTemplateId: string;
  purpose?: 'sell' | 'own';
  authToken: string;
  userId?: string | null;
}): Promise<{
  success: boolean;
  status: 'success' | 'already_seeded' | 'no_kt_data' | 'error';
  blocksCreated: number;
  alreadySeeded: boolean;
  errors: string[];
}> {
  const { tenantId, resourceTemplateId, purpose = 'sell', authToken, userId = null } = input;
  const errors: string[] = [];

  const persist = await persistSelectedResources(
    tenantId,
    [{ resource_template_id: resourceTemplateId, purpose }],
    'settings',
    userId,
    authToken,
  );
  errors.push(...persist.errors.map(e => `Selection: ${e}`));

  let blocks: CatBlockPayload[] = [];
  let ktName = resourceTemplateId;
  try {
    const built = await ktCatBlockMapperService.buildBlocksForTemplate(resourceTemplateId, authToken);
    blocks = built.blocks;
    ktName = blocks[0]?.config?.selectedResources?.[0]?.resource_name || resourceTemplateId;
  } catch (err: any) {
    return { success: false, status: 'error', blocksCreated: 0, alreadySeeded: false, errors: [...errors, err?.message || 'mapper error'] };
  }

  if (!blocks.length) {
    return { success: false, status: 'no_kt_data', blocksCreated: 0, alreadySeeded: false, errors };
  }

  const kts = [{ resource_template_id: resourceTemplateId, kt_name: ktName, blocks }];
  const [testResult, liveResult] = await Promise.all([
    callBulkSeed(kts, tenantId, authToken, false),
    callBulkSeed(kts, tenantId, authToken, true),
  ]);
  errors.push(...testResult.errors, ...liveResult.errors);

  const blocksCreated = testResult.blocksCreated + liveResult.blocksCreated;
  const alreadySeeded = testResult.alreadySeeded + liveResult.alreadySeeded > 0;
  const status = errors.length && blocksCreated === 0 && !alreadySeeded
    ? 'error'
    : blocksCreated > 0 ? 'success'
    : alreadySeeded ? 'already_seeded'
    : 'error';

  return { success: status === 'success' || status === 'already_seeded', status, blocksCreated, alreadySeeded, errors };
}

export async function seedTenantTemplates(
  input: SeedTemplatesInput,
): Promise<SeedTemplatesResult> {
  const {
    tenantId,
    equipmentTemplateIds,
    facilityTemplateIds,
    serviceTemplateIds = [],
    businessType,
    industryId,
    industryIds,
    authToken,
    userId = null,
  } = input;

  const errors: string[] = [];
  const perTemplate: PerTemplateResult[] = [];
  const droppedTemplateIds: string[] = [];
  let equipmentBlocksSeeded = 0;
  let serviceBlocksSeeded   = 0;
  let catalogAlreadySeeded  = 0;
  let registryAssetsSeeded  = 0;

  const allIndustryIds = [...new Set([...(industryIds || []), industryId].filter(Boolean))];

  console.log('[seedTenantTemplates] Starting', {
    tenantId, equipmentTemplateIds, facilityTemplateIds, serviceTemplateIds, businessType, allIndustryIds,
  });

  // ── Step -1: Seed services (no KT — always runs before coverage check) ───────
  if (serviceTemplateIds.length > 0) {
    try {
      const serviceSelections: ResourceSelection[] = serviceTemplateIds.map(id => ({
        resource_template_id: id, purpose: 'sell',
      }));
      await persistSelectedResources(tenantId, serviceSelections, 'onboarding', userId, authToken);

      const svcKts = await buildServiceCatBlocks(serviceTemplateIds, authToken);
      if (svcKts.length > 0) {
        const [testRes, liveRes] = await Promise.all([
          callBulkSeed(svcKts, tenantId, authToken, false),
          callBulkSeed(svcKts, tenantId, authToken, true),
        ]);
        serviceBlocksSeeded = testRes.blocksCreated + liveRes.blocksCreated;
        errors.push(...testRes.errors, ...liveRes.errors);
        console.log(`[seedTenantTemplates] Services seeded: test=${testRes.blocksCreated} live=${liveRes.blocksCreated} blocks`);
      }
    } catch (err: any) {
      errors.push(`Services: ${err?.message || 'service seed failed'}`);
      console.error('[seedTenantTemplates] Service seed error:', err?.message);
    }
  }

  // ── Step 0a: Persist intent (S8) — upsert, race-safe ─────────────────────────
  const requestedSelections = buildSelections(businessType, equipmentTemplateIds, facilityTemplateIds);
  if (requestedSelections.length > 0) {
    const persistResult = await persistSelectedResources(tenantId, requestedSelections, 'onboarding', userId, authToken);
    errors.push(...persistResult.errors.map(e => `Selections: ${e}`));
  }

  // ── Step 0b: Canonical industry resolution (Task 2) ──────────────────────────
  // The seed runs ONLY on templates the resolution admits. Zero coverage is an
  // explicit, honest outcome — not an empty green checkmark.
  let resolvedIds = new Set<string>();
  let hasCoverage = false;
  try {
    const resolution = await resolveIndustryTemplates(allIndustryIds, authToken);
    hasCoverage = resolution.hasCoverage;
    resolvedIds = new Set(resolution.templates.map(t => t.resource_template_id));
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      statusDetail: `Industry resolution failed: ${err?.message || 'unknown error'}`,
      industryIds: allIndustryIds,
      equipmentBlocksSeeded: 0,
      serviceBlocksSeeded,
      registryAssetsSeeded: 0,
      facilityNodesSeeded: 0,
      sampleContactsSeeded: 0,
      sequencesSeeded: false,
      perTemplate: [],
      droppedTemplateIds: [],
      errors: [...errors, err?.message || 'resolution error'],
    };
  }

  if (!hasCoverage) {
    console.warn(`[seedTenantTemplates] NO COVERAGE for industries [${allIndustryIds.join(', ')}] — tenant ${tenantId}`);
    return {
      success: serviceBlocksSeeded > 0,
      status: serviceBlocksSeeded > 0 ? 'success' : 'no_coverage',
      statusDetail: serviceBlocksSeeded > 0
        ? `No equipment KT coverage, but ${serviceBlocksSeeded} service blocks seeded.`
        : `No resource templates are mapped to industry "${allIndustryIds.join(', ')}" yet. Nothing was seeded.`,
      industryIds: allIndustryIds,
      equipmentBlocksSeeded: 0,
      serviceBlocksSeeded,
      registryAssetsSeeded: 0,
      facilityNodesSeeded: 0,
      sampleContactsSeeded: 0,
      sequencesSeeded: false,
      perTemplate: [],
      droppedTemplateIds: [],
      errors,
    };
  }

  // ── Step 0c: Read intent back from the durable table — the table drives the
  // seed (covers rows persisted earlier by ResourcePickStep too), intersected
  // with the industry resolution set. Out-of-coverage requests are dropped loudly.
  const persisted = await getSelectedResources(tenantId, undefined, authToken);
  const inCoverage = (id: string) => resolvedIds.has(id);

  const sellTemplateIds = [...new Set(
    persisted.filter(s => s.purpose === 'sell').map(s => s.resource_template_id),
  )];
  const ownTemplateIds = [...new Set(
    persisted.filter(s => s.purpose === 'own').map(s => s.resource_template_id),
  )];

  // Coverage filter applies only to sell-leg (KT mapper requires it).
  // Registry entries (purpose='own') do NOT need KT coverage — drop only sell IDs.
  for (const id of sellTemplateIds) {
    if (!inCoverage(id) && !droppedTemplateIds.includes(id)) {
      droppedTemplateIds.push(id);
      console.warn(`[seedTenantTemplates] Dropping sell template ${id}: outside industry resolution set`);
    }
  }

  const sellIds = sellTemplateIds.filter(inCoverage);
  const ownIds  = ownTemplateIds; // registry doesn't require KT coverage

  // ── Step 1: SELLER leg — catalog blocks from the KT mapper ───────────────────
  const isSeller = businessType === 'seller' || businessType === 'both';

  if (isSeller && sellIds.length > 0) {
    const kts: Array<{ resource_template_id: string; kt_name: string; blocks: CatBlockPayload[] }> = [];

    for (const templateId of sellIds) {
      try {
        const { blocks } = await ktCatBlockMapperService.buildBlocksForTemplate(templateId, authToken);
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

    // Seed both environments (test = review surface, live = working catalog)
    if (kts.length > 0) {
      const [testResult, liveResult] = await Promise.all([
        callBulkSeed(kts, tenantId, authToken, false),
        callBulkSeed(kts, tenantId, authToken, true),
      ]);

      equipmentBlocksSeeded = testResult.blocksCreated + liveResult.blocksCreated;
      catalogAlreadySeeded = testResult.alreadySeeded + liveResult.alreadySeeded;
      errors.push(...testResult.errors, ...liveResult.errors);

      for (const kt of kts) {
        const entry = perTemplate.find(p => p.templateId === kt.resource_template_id);
        if (entry) entry.blocksCreated = kt.blocks.length;
      }

      console.log(`[seedTenantTemplates] Catalog seeded: test=${testResult.blocksCreated} live=${liveResult.blocksCreated} blocks`);
    }
  }

  // ── Step 2: BUYER leg — template-driven registry entries ─────────────────────
  // (Replaces the consent-blind placeholder hierarchy: seed_onboarding_facility_nodes.)
  const isBuyer = businessType === 'buyer' || businessType === 'both';

  if (isBuyer && ownIds.length > 0) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          // SECURITY DEFINER RPC — callable as authenticated; JWT forwarded
          global: { headers: { Authorization: authToken } },
        },
      );

      const { data: rpcResult, error: rpcError } = await sb.rpc(
        'seed_onboarding_registry_assets',
        { p_tenant_id: tenantId, p_template_ids: ownIds, p_created_by: userId },
      );

      if (rpcError) {
        errors.push(`Registry seeding: ${rpcError.message}`);
      } else {
        registryAssetsSeeded = rpcResult?.assetsSeeded ?? 0;
        console.log(`[seedTenantTemplates] Registry: ${registryAssetsSeeded} assets seeded, ${rpcResult?.skipped ?? 0} already present`);
      }
    } catch (err: any) {
      errors.push(`Registry seeding: ${err?.message || 'rpc error'}`);
    }
  }

  // ── Step 3: Sample contacts (non-fatal) ──────────────────────────────────────
  let sampleContactsSeeded = 0;
  if (industryId) {
    const contactResult = await seedSampleContacts({ tenantId, industryId });
    if (!contactResult.success) {
      errors.push(...contactResult.errors.map((e: string) => `Contacts: ${e}`));
    } else {
      sampleContactsSeeded = contactResult.contactsSeeded;
    }
  }

  // ── Step 4: Sequences (both environments, non-fatal) ─────────────────────────
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

  // ── Status: a covered industry that produced nothing (and skipped/errored
  // nothing) is an ERROR, not success (probe break-point 2 kill-switch). ───────
  const expectedSeller = isSeller && sellIds.length > 0;
  const expectedBuyer  = isBuyer && ownIds.length > 0;
  const sellerZeroUnexplained =
    expectedSeller && equipmentBlocksSeeded === 0 && catalogAlreadySeeded === 0 &&
    !perTemplate.some(p => p.status === 'skipped') && errors.length === 0;
  const anyLegFailed = errors.length > 0;

  let status: SeedStatus;
  let statusDetail: string;

  if (sellerZeroUnexplained) {
    status = 'error';
    statusDetail = 'Industry is covered but the catalog seed produced zero blocks — investigate KT data for the selected templates.';
  } else if (anyLegFailed && (equipmentBlocksSeeded > 0 || registryAssetsSeeded > 0)) {
    status = 'partial';
    statusDetail = 'Some seeding steps failed; see errors.';
  } else if (anyLegFailed && (expectedSeller || expectedBuyer)) {
    status = 'error';
    statusDetail = 'Seeding failed; see errors.';
  } else {
    status = 'success';
    statusDetail = 'Seed completed.';
  }

  const result: SeedTemplatesResult = {
    success: status === 'success',
    status,
    statusDetail,
    industryIds: allIndustryIds,
    equipmentBlocksSeeded,
    serviceBlocksSeeded,
    registryAssetsSeeded,
    facilityNodesSeeded: registryAssetsSeeded, // response compatibility
    sampleContactsSeeded,
    sequencesSeeded,
    perTemplate,
    droppedTemplateIds,
    errors,
  };

  console.log('[seedTenantTemplates] Done', {
    status, equipmentBlocksSeeded, serviceBlocksSeeded, registryAssetsSeeded, sampleContactsSeeded,
    dropped: droppedTemplateIds.length, errorCount: errors.length,
  });

  return result;
}
