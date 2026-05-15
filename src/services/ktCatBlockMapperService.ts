// src/services/ktCatBlockMapperService.ts
// Maps KT (Knowledge Tree) data → m_cat_blocks insert payloads
// Used by the Onboarding Agent (seedTenantOnIndustryConfirmed) via the bulk API.
// Skips any KT data where Phase 1 fields (service_name, catalog_name, price_median) are not yet generated.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Stable seed UUIDs from m_category_details — safe to hardcode as they are seeded constants
const BLOCK_TYPE_SERVICE = 'ae7050b4-3cca-4ed9-aa02-4a1f697b75cc';
const BLOCK_TYPE_SPARE = '1221e2dd-a603-47fb-9063-c393193514b7';
const PRICING_MODE_VARIANT_BASED = '1843511a-cc69-40bb-8d06-77cfc023a7f4';
const PRICING_MODE_INDEPENDENT = '718f839d-9d41-4212-b2b0-553a2198fb86';

export interface CatBlockPayload {
  name: string;
  display_name: string;
  block_type_id: string;
  pricing_mode_id: string;
  base_price: number;
  currency: string;
  resource_template_id: string;
  kt_checkpoint_ids?: string[];
  variant_pricing?: { variants: VariantPricingItem[] };
  knowledge_tree_ref: KnowledgeTreeRef;
  config: BlockConfig;
  is_seed: boolean;
  is_active: boolean;
  visible: boolean;
}

interface VariantPricingItem {
  id: string;
  name: string;
  capacity_range: string | null;
  price: number;
}

interface KnowledgeTreeRef {
  resource_template_id: string;
  service_activity?: string;
}

interface BlockConfig {
  selectedResources: SelectedResource[];
}

interface SelectedResource {
  resource_id: string;
  resource_type_id: 'equipment' | 'asset';
  resource_name: string;
}

interface KtVariant {
  id: string;
  name: string;
  capacity_range: string | null;
}

interface ServiceGroupRow {
  service_name: string;
  service_activity: string;
  catalog_name: string;
  price_median: number;
  price_currency: string;
  checkpoint_id: string;
}

interface SparePartRow {
  id: string;
  name: string;
  price_median: number;
  price_currency: string;
  price_unit: string | null;
}

interface ResourceTemplateRow {
  id: string;
  name: string;
  resource_type_id: string;
}

export class KtCatBlockMapperService {
  private supabase: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (!url || !key) {
      throw new Error('KtCatBlockMapperService: Missing SUPABASE_URL or SUPABASE_KEY');
    }

    this.supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log('✅ KtCatBlockMapperService: Initialized');
  }

  /**
   * Build all cat block payloads for a given KT resource template.
   * Returns service blocks + spare blocks. Skips incomplete KT data silently.
   */
  async buildBlocksForTemplate(resourceTemplateId: string): Promise<{
    blocks: CatBlockPayload[];
    skipped: { serviceGroups: number; spareParts: number };
  }> {
    const [resourceTemplate, variants, serviceRows, spareRows] = await Promise.all([
      this.fetchResourceTemplate(resourceTemplateId),
      this.fetchVariants(resourceTemplateId),
      this.fetchServiceCycleRows(resourceTemplateId),
      this.fetchSparePartRows(resourceTemplateId),
    ]);

    if (!resourceTemplate) {
      console.warn(`KtCatBlockMapper: resource template ${resourceTemplateId} not found`);
      return { blocks: [], skipped: { serviceGroups: 0, spareParts: 0 } };
    }

    const resourceTypeId: 'equipment' | 'asset' =
      resourceTemplate.resource_type_id === 'asset' ? 'asset' : 'equipment';

    const selectedResource: SelectedResource = {
      resource_id: resourceTemplateId,
      resource_type_id: resourceTypeId,
      resource_name: resourceTemplate.name,
    };

    const { blocks: serviceBlocks, skipped: skippedServiceGroups } =
      this.buildServiceBlocks(serviceRows, variants, resourceTemplateId, selectedResource);

    const { blocks: spareBlocks, skipped: skippedSpareParts } =
      this.buildSpareBlocks(spareRows, resourceTemplateId, selectedResource);

    return {
      blocks: [...serviceBlocks, ...spareBlocks],
      skipped: {
        serviceGroups: skippedServiceGroups,
        spareParts: skippedSpareParts,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Service blocks — one block per unique service_name
  // ---------------------------------------------------------------------------

  private buildServiceBlocks(
    rows: ServiceGroupRow[],
    variants: KtVariant[],
    resourceTemplateId: string,
    selectedResource: SelectedResource
  ): { blocks: CatBlockPayload[]; skipped: number } {
    // Group rows by service_name — each group becomes one block
    const groups = new Map<string, ServiceGroupRow[]>();
    for (const row of rows) {
      const existing = groups.get(row.service_name) || [];
      existing.push(row);
      groups.set(row.service_name, existing);
    }

    const blocks: CatBlockPayload[] = [];
    let skipped = 0;

    for (const [serviceName, groupRows] of groups) {
      // Use first row for block-level fields (all rows in group share service_name)
      const representative = groupRows[0];

      const ktCheckpointIds = [...new Set(groupRows.map((r) => r.checkpoint_id))];
      const variantPricing = this.buildVariantPricing(variants, representative.price_median);

      blocks.push({
        name: serviceName,
        display_name: representative.catalog_name,
        block_type_id: BLOCK_TYPE_SERVICE,
        pricing_mode_id: PRICING_MODE_VARIANT_BASED,
        base_price: representative.price_median,
        currency: representative.price_currency || 'INR',
        resource_template_id: resourceTemplateId,
        kt_checkpoint_ids: ktCheckpointIds,
        variant_pricing: variantPricing,
        knowledge_tree_ref: {
          resource_template_id: resourceTemplateId,
          service_activity: representative.service_activity,
        },
        config: { selectedResources: [selectedResource] },
        is_seed: true,
        is_active: true,
        visible: true,
      });
    }

    return { blocks, skipped };
  }

  private buildVariantPricing(
    variants: KtVariant[],
    priceMedian: number
  ): { variants: VariantPricingItem[] } {
    return {
      variants: variants.map((v) => ({
        id: v.id,
        name: v.name,
        capacity_range: v.capacity_range,
        price: priceMedian,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Spare blocks — one block per spare part
  // ---------------------------------------------------------------------------

  private buildSpareBlocks(
    rows: SparePartRow[],
    resourceTemplateId: string,
    selectedResource: SelectedResource
  ): { blocks: CatBlockPayload[]; skipped: number } {
    const blocks: CatBlockPayload[] = [];
    let skipped = 0;

    for (const spare of rows) {
      blocks.push({
        name: spare.name,
        display_name: spare.name,
        block_type_id: BLOCK_TYPE_SPARE,
        pricing_mode_id: PRICING_MODE_INDEPENDENT,
        base_price: spare.price_median,
        currency: spare.price_currency || 'INR',
        resource_template_id: resourceTemplateId,
        knowledge_tree_ref: { resource_template_id: resourceTemplateId },
        config: { selectedResources: [selectedResource] },
        is_seed: true,
        is_active: true,
        visible: true,
      });
    }

    return { blocks, skipped };
  }

  // ---------------------------------------------------------------------------
  // DB queries
  // ---------------------------------------------------------------------------

  private async fetchResourceTemplate(
    resourceTemplateId: string
  ): Promise<ResourceTemplateRow | null> {
    const { data, error } = await this.supabase
      .from('m_catalog_resource_templates')
      .select('id, name, resource_type_id')
      .eq('id', resourceTemplateId)
      .single();

    if (error) {
      console.error('KtCatBlockMapper: fetchResourceTemplate error', error.message);
      return null;
    }

    return data;
  }

  private async fetchVariants(resourceTemplateId: string): Promise<KtVariant[]> {
    const { data, error } = await this.supabase
      .from('m_equipment_variants')
      .select('id, name, capacity_range')
      .eq('resource_template_id', resourceTemplateId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('KtCatBlockMapper: fetchVariants error', error.message);
      return [];
    }

    return data || [];
  }

  private async fetchServiceCycleRows(
    resourceTemplateId: string
  ): Promise<ServiceGroupRow[]> {
    // Join checkpoints → service_cycles, filter only rows where Phase 1 is complete
    const { data, error } = await this.supabase.rpc('kt_service_cycle_rows_for_template', {
      p_resource_template_id: resourceTemplateId,
    });

    if (error) {
      // RPC not available — fall back to raw join via two queries
      return this.fetchServiceCycleRowsFallback(resourceTemplateId);
    }

    return (data || []) as ServiceGroupRow[];
  }

  private async fetchServiceCycleRowsFallback(
    resourceTemplateId: string
  ): Promise<ServiceGroupRow[]> {
    const { data: checkpoints, error: cpError } = await this.supabase
      .from('m_equipment_checkpoints')
      .select('id, service_name, service_activity')
      .eq('resource_template_id', resourceTemplateId)
      .eq('is_active', true)
      .not('service_name', 'is', null);

    if (cpError || !checkpoints?.length) return [];

    const checkpointIds = checkpoints.map((c: any) => c.id);

    const { data: cycles, error: cyError } = await this.supabase
      .from('m_service_cycles')
      .select('id, checkpoint_id, catalog_name, price_median, price_currency')
      .in('checkpoint_id', checkpointIds)
      .eq('is_active', true)
      .not('catalog_name', 'is', null)
      .not('price_median', 'is', null);

    if (cyError || !cycles?.length) return [];

    const checkpointMap = new Map(checkpoints.map((c: any) => [c.id, c]));

    const rows: ServiceGroupRow[] = [];
    for (const cycle of cycles) {
      const cp = checkpointMap.get(cycle.checkpoint_id);
      if (!cp) continue;
      rows.push({
        service_name: cp.service_name,
        service_activity: cp.service_activity,
        catalog_name: cycle.catalog_name,
        price_median: cycle.price_median,
        price_currency: cycle.price_currency || 'INR',
        checkpoint_id: cp.id,
      });
    }

    return rows;
  }

  private async fetchSparePartRows(resourceTemplateId: string): Promise<SparePartRow[]> {
    const { data, error } = await this.supabase
      .from('m_equipment_spare_parts')
      .select('id, name, price_median, price_currency, price_unit')
      .eq('resource_template_id', resourceTemplateId)
      .eq('is_active', true)
      .not('price_median', 'is', null)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('KtCatBlockMapper: fetchSparePartRows error', error.message);
      return [];
    }

    return data || [];
  }
}

export const ktCatBlockMapperService = new KtCatBlockMapperService();
