// src/routes/seedRoutes.ts
// API routes for Tenant Seed functionality
// Provides endpoints for seeding default data during onboarding

import express from 'express';
import { Request, Response } from 'express';
import axios from 'axios';
import {
  SeedRegistry,
  getAllSeedCategories,
  getRequiredSeedCategories,
  getSeedPreview,
  getAllSeedPreviews,
  getSeedData,
  sortSeedsByDependencies,
  SEQUENCE_SEED_DATA,
  generateSequencePreview
} from '../seeds';
import { SeedResult, TenantSeedResult } from '../seeds/types';
import { seedSampleContacts } from '../services/seedSampleContactsService';
import { seedTenantTemplates } from '../services/seedTenantTemplatesService';

const router = express.Router();

// =================================================================
// Helper: Build headers for edge function calls
// =================================================================
const buildHeaders = (req: Request) => {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'] as string;
  const environment = req.headers['x-environment'] as string || 'live';

  return {
    Authorization: authHeader || '',
    'x-tenant-id': tenantId,
    'x-environment': environment,
    'Content-Type': 'application/json'
  };
};

// =================================================================
// GET /defaults - Get all seed previews
// =================================================================
router.get('/defaults', async (req: Request, res: Response) => {
  try {
    const previews = getAllSeedPreviews();

    return res.status(200).json({
      success: true,
      data: previews,
      categories: getAllSeedCategories(),
      requiredCategories: getRequiredSeedCategories()
    });
  } catch (error: any) {
    console.error('[SeedRoutes] Error getting defaults:', error.message);
    return res.status(500).json({
      error: error.message || 'Failed to get seed defaults'
    });
  }
});

// =================================================================
// GET /defaults/:category - Get preview for specific category
// =================================================================
router.get('/defaults/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;

    const preview = getSeedPreview(category);

    if (!preview) {
      return res.status(404).json({
        error: `Seed category '${category}' not found`,
        availableCategories: getAllSeedCategories()
      });
    }

    return res.status(200).json({
      success: true,
      data: preview
    });
  } catch (error: any) {
    console.error('[SeedRoutes] Error getting category defaults:', error.message);
    return res.status(500).json({
      error: error.message || 'Failed to get seed defaults'
    });
  }
});

// =================================================================
// GET /data/:category - Get raw seed data for a category
// =================================================================
router.get('/data/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;

    if (!SeedRegistry[category]) {
      return res.status(404).json({
        error: `Seed category '${category}' not found`,
        availableCategories: getAllSeedCategories()
      });
    }

    const data = getSeedData(category);

    return res.status(200).json({
      success: true,
      category,
      count: data.length,
      data
    });
  } catch (error: any) {
    console.error('[SeedRoutes] Error getting category data:', error.message);
    return res.status(500).json({
      error: error.message || 'Failed to get seed data'
    });
  }
});

// =================================================================
// POST /tenant - Seed all required data for tenant
// =================================================================
router.post('/tenant', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';
    const isLive = environment === 'live';

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    // Get categories to seed (from body or default to required)
    const requestedCategories = req.body.categories || getRequiredSeedCategories();

    // Sort by dependencies
    const sortedCategories = sortSeedsByDependencies(requestedCategories);

    console.log('[SeedRoutes] POST /tenant', {
      tenantId,
      environment,
      categories: sortedCategories
    });

    const results: SeedResult[] = [];
    let totalInserted = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    // Seed each category
    for (const category of sortedCategories) {
      try {
        const result = await seedCategory(
          category,
          tenantId,
          isLive,
          authHeader
        );
        results.push(result);
        totalInserted += result.inserted;
        totalSkipped += result.skipped;

        if (!result.success) {
          errors.push(...result.errors);
        }
      } catch (error: any) {
        console.error(`[SeedRoutes] Error seeding ${category}:`, error.message);
        results.push({
          success: false,
          category,
          displayName: SeedRegistry[category]?.displayName || category,
          inserted: 0,
          skipped: 0,
          errors: [error.message]
        });
        errors.push(`${category}: ${error.message}`);
      }
    }

    const response: TenantSeedResult = {
      success: errors.length === 0,
      tenantId,
      environment: isLive ? 'live' : 'test',
      results,
      totalInserted,
      totalSkipped,
      errors,
      timestamp: new Date().toISOString()
    };

    return res.status(errors.length === 0 ? 200 : 207).json(response);
  } catch (error: any) {
    console.error('[SeedRoutes] Error seeding tenant:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to seed tenant data'
    });
  }
});

// =================================================================
// Settings → Seed Data (founder request): UI-managed seed lifecycle.
// Overview + reseed run from PERSISTED intent (t_tenant_selected_resources) —
// no onboarding replay needed. Cleanup keeps contract-referenced rows.
// =================================================================
function jwtClient(authToken: string) {
  // API layer holds only the anon key by design; the user's JWT makes the
  // role 'authenticated' and the RPCs below are SECURITY DEFINER.
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authToken } },
    },
  );
}

// GET /tenant/seed-preview?resource_template_id=X — what a seed WOULD create.
// Runs the read-only mapper; nothing is written (Catalog Studio preview modal).
router.get('/tenant/seed-preview', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId   = req.headers['x-tenant-id'] as string;
    const templateId = req.query.resource_template_id as string;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    if (!tenantId)   return res.status(400).json({ error: 'x-tenant-id header is required' });
    if (!templateId) return res.status(400).json({ error: 'resource_template_id is required' });

    const { ktCatBlockMapperService } = await import('../services/ktCatBlockMapperService');
    const { blocks } = await ktCatBlockMapperService.buildBlocksForTemplate(templateId, authHeader);

    const SPARE_TYPE = '1221e2dd-a603-47fb-9063-c393193514b7';
    const services = blocks.filter(b => b.block_type_id !== SPARE_TYPE);
    const spares   = blocks.filter(b => b.block_type_id === SPARE_TYPE);
    const summarize = (b: any) => ({
      name: b.name,
      base_price: b.base_price,
      currency: b.currency,
      currencies: (b.config?.pricingRecords || []).map((r: any) => r.currency),
      cycle_days: b.config?.serviceCycles?.days ?? null,
      variants: (b.config?.selectedVariants || []).length,
      kt_price_min: b.config?.kt_price_min ?? null,
      kt_price_max: b.config?.kt_price_max ?? null,
    });

    const variantIds = new Set<string>();
    blocks.forEach((b: any) => (b.config?.selectedVariants || []).forEach((v: any) => v?.variant_id && variantIds.add(v.variant_id)));

    return res.status(200).json({
      success: true,
      data: {
        resource_template_id: templateId,
        counts: {
          services: services.length,
          spares: spares.length,
          priced: blocks.filter(b => (b.base_price || 0) > 0).length,
          variants: variantIds.size,
          total: blocks.length,
        },
        services: services.map(summarize),
        spares: spares.map(summarize),
      },
    });
  } catch (error: any) {
    console.error('[SeedRoutes] seed-preview error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /tenant/seed-equipment — body { resourceTemplateId, purpose? }
// The single-equipment seed (Catalog Studio "Seed with VaNi" → Load).
router.post('/tenant/seed-equipment', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId   = req.headers['x-tenant-id'] as string;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    if (!tenantId)   return res.status(400).json({ error: 'x-tenant-id header is required' });

    const { resourceTemplateId, purpose } = req.body || {};
    if (!resourceTemplateId) return res.status(400).json({ error: 'resourceTemplateId is required' });

    const { seedSingleEquipment } = await import('../services/seedTenantTemplatesService');
    const result = await seedSingleEquipment({
      tenantId,
      resourceTemplateId,
      purpose: purpose === 'own' ? 'own' : 'sell',
      authToken: authHeader,
      userId: (req as any).user?.id || null,
    });

    return res.status(result.success ? 200 : 207).json({ success: result.success, status: result.status, data: result });
  } catch (error: any) {
    console.error('[SeedRoutes] seed-equipment error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /tenant/seed-overview — what onboarding seeded + picks + recent logs
router.get('/tenant/seed-overview', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId   = req.headers['x-tenant-id'] as string;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    if (!tenantId)   return res.status(400).json({ error: 'x-tenant-id header is required' });

    const sb = jwtClient(authHeader);
    const { data, error } = await sb.rpc('get_tenant_seed_overview', { p_tenant_id: tenantId });
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error('[SeedRoutes] seed-overview error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /tenant/reseed — body { target: 'catalog' | 'registry' | 'all' }
// 1) cleanup (skips contract-referenced rows)  2) re-run the idempotent seed
// from persisted picks; persona + industries are read server-side.
router.post('/tenant/reseed', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId   = req.headers['x-tenant-id'] as string;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    if (!tenantId)   return res.status(400).json({ error: 'x-tenant-id header is required' });

    const target = ['catalog', 'registry', 'all'].includes(req.body?.target) ? req.body.target : 'all';
    const sb = jwtClient(authHeader);

    const { data: cleanup, error: cleanupError } = await sb.rpc('cleanup_tenant_seed_data', {
      p_tenant_id: tenantId,
      p_target: target,
    });
    if (cleanupError) return res.status(500).json({ success: false, error: `Cleanup failed: ${cleanupError.message}` });

    // Server-side intent: persona from profile, industries from served list
    const [{ data: profile }, { data: served }] = await Promise.all([
      sb.from('t_tenant_profiles').select('persona, business_type_id').eq('tenant_id', tenantId).maybeSingle(),
      sb.from('t_tenant_served_industries').select('industry_id').eq('tenant_id', tenantId),
    ]);
    const rawPersona = profile?.persona || profile?.business_type_id || 'seller';
    const businessType = (['seller', 'buyer', 'both'].includes(rawPersona) ? rawPersona : 'seller') as 'seller' | 'buyer' | 'both';
    const industryIds: string[] = (served || []).map((r: any) => r.industry_id).filter(Boolean);

    console.log('[SeedRoutes] reseed', { tenantId, target, businessType, industryIds, cleanup });

    // Picks come from t_tenant_selected_resources inside the seeder (S8)
    const result = await seedTenantTemplates({
      tenantId,
      equipmentTemplateIds: [],
      facilityTemplateIds: [],
      businessType,
      industryId: industryIds[0] || '',
      industryIds,
      authToken: authHeader,
      userId: (req as any).user?.id || null,
    });

    const httpStatus = result.status === 'success' || result.status === 'no_coverage' ? 200 : 207;
    return res.status(httpStatus).json({
      success: result.success,
      status: result.status,
      data: { cleanup, seed: result },
    });
  } catch (error: any) {
    console.error('[SeedRoutes] reseed error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// =================================================================
// POST /tenant/industry-confirmed — REMOVED (Sprint 1, Task 1.3)
// The legacy name-only/price-less seeder (seedTenantOnIndustryConfirmedService)
// was the wrong seeder identified by the legibility probe (B0.5 point 1) and
// had zero remaining UI callers. The KT-aware path is POST /tenant/templates.
// =================================================================

// =================================================================
// POST /tenant/sample-contacts — Standalone sample contact reseed
// Useful for cleanup/reseed flows: delete is_seed contacts then call this
// =================================================================
router.post('/tenant/sample-contacts', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    const { industryId } = req.body;

    if (!industryId) {
      return res.status(400).json({ error: 'industryId is required' });
    }

    console.log('[SeedRoutes] POST /tenant/sample-contacts', { tenantId, industryId });

    const result = await seedSampleContacts({ tenantId, industryId });

    return res.status(result.success ? 200 : 500).json({ success: result.success, data: result });
  } catch (error: any) {
    console.error('[SeedRoutes] Error seeding sample contacts:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// =================================================================
// POST /tenant/templates — Template-scoped onboarding seed
// Seeds ONLY the templates the user selected; both test + live envs.
// Must come BEFORE /tenant/:category catch-all.
// =================================================================
router.post('/tenant/templates', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId   = req.headers['x-tenant-id'] as string;

    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    if (!tenantId)   return res.status(400).json({ error: 'x-tenant-id header is required' });

    const { equipmentTemplateIds = [], facilityTemplateIds = [], businessType, industryId, industryIds } = req.body;

    if (!businessType || !['buyer', 'seller', 'both'].includes(businessType)) {
      return res.status(400).json({ error: 'businessType must be buyer, seller, or both' });
    }
    if (!Array.isArray(equipmentTemplateIds) || !Array.isArray(facilityTemplateIds)) {
      return res.status(400).json({ error: 'equipmentTemplateIds and facilityTemplateIds must be arrays' });
    }

    console.log('[SeedRoutes] POST /tenant/templates', { tenantId, equipmentTemplateIds, facilityTemplateIds, businessType, industryIds });

    const result = await seedTenantTemplates({
      tenantId,
      equipmentTemplateIds,
      facilityTemplateIds,
      businessType,
      industryId: industryId || '',
      industryIds: Array.isArray(industryIds) ? industryIds : undefined,
      authToken: authHeader,
      userId: (req as any).user?.id || null,
    });

    // no_coverage is an honest, non-exceptional outcome — 200 with status field so
    // the UI can render it without tripping error handling. partial/error → 207.
    const httpStatus = result.status === 'success' || result.status === 'no_coverage' ? 200 : 207;
    return res.status(httpStatus).json({ success: result.success, status: result.status, data: result });
  } catch (error: any) {
    console.error('[SeedRoutes] Error in templates seed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// =================================================================
// POST /tenant/:category - Seed specific category for tenant
// NOTE: must come AFTER all /tenant/<named-routes> above
// =================================================================
router.post('/tenant/:category', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';
    const isLive = environment === 'live';
    const { category } = req.params;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!SeedRegistry[category]) {
      return res.status(404).json({
        error: `Seed category '${category}' not found`,
        availableCategories: getAllSeedCategories()
      });
    }

    console.log('[SeedRoutes] POST /tenant/:category', {
      tenantId,
      environment,
      category
    });

    const result = await seedCategory(category, tenantId, isLive, authHeader);

    return res.status(result.success ? 200 : 500).json({
      success: result.success,
      data: result
    });
  } catch (error: any) {
    console.error('[SeedRoutes] Error seeding category:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to seed category'
    });
  }
});

// =================================================================
// GET /status - Check seed status for tenant
// =================================================================
router.get('/status', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    console.log('[SeedRoutes] GET /status', { tenantId, environment });

    // Check sequences status
    const sequencesStatus = await checkSequencesSeeded(tenantId, environment, authHeader);

    const statuses = [
      {
        category: 'sequences',
        displayName: 'Sequence Numbers',
        isSeeded: sequencesStatus.isSeeded,
        count: sequencesStatus.count
      }
      // Add more status checks as needed
    ];

    const allSeeded = statuses.every(s => s.isSeeded);
    const requiredSeeded = statuses
      .filter(s => getRequiredSeedCategories().includes(s.category))
      .every(s => s.isSeeded);

    return res.status(200).json({
      success: true,
      tenantId,
      environment,
      allSeeded,
      requiredSeeded,
      statuses
    });
  } catch (error: any) {
    console.error('[SeedRoutes] Error checking status:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to check seed status'
    });
  }
});

// =================================================================
// Helper: Seed a specific category
// =================================================================
async function seedCategory(
  category: string,
  tenantId: string,
  isLive: boolean,
  authHeader: string
): Promise<SeedResult> {
  const definition = SeedRegistry[category];

  if (!definition) {
    throw new Error(`Seed category '${category}' not found`);
  }

  // For sequences, call the sequences edge function with seed data
  if (category === 'sequences') {
    return await seedSequences(tenantId, isLive, authHeader);
  }

  // Generic handling for other categories (future)
  throw new Error(`Seed execution not implemented for category: ${category}`);
}

// =================================================================
// Helper: Seed sequences via edge function
// Seeds BOTH live and test environments for the tenant
// =================================================================
async function seedSequences(
  tenantId: string,
  isLive: boolean,
  authHeader: string
): Promise<SeedResult> {
  try {
    let totalInserted = 0;
    let totalSkipped = 0;
    const allItems: string[] = [];
    const errors: string[] = [];

    // Seed BOTH environments (live and test)
    for (const environment of ['live', 'test']) {
      console.log(`[SeedRoutes] Seeding sequences for ${environment} environment`);

      try {
        const response = await axios.post(
          `${process.env.SUPABASE_URL}/functions/v1/sequences/seed`,
          {
            seedData: SEQUENCE_SEED_DATA  // Pass data from API layer
          },
          {
            headers: {
              Authorization: authHeader,
              'x-tenant-id': tenantId,
              'x-environment': environment,
              'Content-Type': 'application/json'
            }
          }
        );

        const seededCount = response.data.seeded_count || 0;
        const skippedCount = response.data.skipped_count || 0;
        const sequences = response.data.sequences || [];

        totalInserted += seededCount;
        totalSkipped += skippedCount;

        // Only add unique items
        sequences.forEach((seq: string) => {
          if (!allItems.includes(seq)) {
            allItems.push(seq);
          }
        });

        console.log(`[SeedRoutes] ${environment}: inserted=${seededCount}, skipped=${skippedCount}`);
      } catch (envError: any) {
        console.error(`[SeedRoutes] Error seeding ${environment}:`, envError.message);
        errors.push(`${environment}: ${envError.response?.data?.error || envError.message}`);
      }
    }

    return {
      success: errors.length === 0,
      category: 'sequences',
      displayName: 'Sequence Numbers',
      inserted: totalInserted,
      skipped: totalSkipped,
      errors,
      items: allItems
    };
  } catch (error: any) {
    console.error('[SeedRoutes] Error seeding sequences:', error.message);
    return {
      success: false,
      category: 'sequences',
      displayName: 'Sequence Numbers',
      inserted: 0,
      skipped: 0,
      errors: [error.response?.data?.error || error.message]
    };
  }
}

// =================================================================
// Helper: Check if sequences are already seeded
// =================================================================
async function checkSequencesSeeded(
  tenantId: string,
  environment: string,
  authHeader: string
): Promise<{ isSeeded: boolean; count: number }> {
  try {
    const response = await axios.get(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/configs`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': environment,
          'Content-Type': 'application/json'
        }
      }
    );

    const count = response.data.data?.length || 0;
    return {
      isSeeded: count > 0,
      count
    };
  } catch (error: any) {
    console.error('[SeedRoutes] Error checking sequences:', error.message);
    return { isSeeded: false, count: 0 };
  }
}

export default router;
