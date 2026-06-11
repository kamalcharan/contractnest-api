// src/services/ktCatBlockMapperService.ts
// Maps KT (Knowledge Tree) data → m_cat_blocks insert payloads
// Used by seedTenantTemplatesService via the cat-blocks/bulk edge function.
//
// Key design decisions:
//   - Does NOT require catalog_name or price_median to be non-null.
//     KT provides reference pricing; user sets final price in pricing-review step.
//   - Builds full config JSONB so catalog-studio view/edit wizard works correctly:
//     config.pricingRecords, config.selectedVariants, config.variantPricingRecords,
//     config.selectedResources, config.pricingMode, config.priceType
//   - Groups checkpoints by service_name — one block per unique service name.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BLOCK_TYPE_SERVICE = 'ae7050b4-3cca-4ed9-aa02-4a1f697b75cc';
const BLOCK_TYPE_SPARE   = '1221e2dd-a603-47fb-9063-c393193514b7';
const PRICING_MODE_VARIANT_BASED = '1843511a-cc69-40bb-8d06-77cfc023a7f4';
const PRICING_MODE_INDEPENDENT   = '718f839d-9d41-4212-b2b0-553a2198fb86';

export interface CatBlockPayload {
  name:                 string;
  display_name:         string;
  block_type_id:        string;
  pricing_mode_id:      string;
  base_price:           number;
  currency:             string;
  resource_template_id: string;
  kt_checkpoint_ids?:   string[];
  variant_pricing?:     { variants: VariantPricingItem[] };
  knowledge_tree_ref:   KnowledgeTreeRef;
  config:               BlockConfig;
  is_seed:              boolean;
  is_active:            boolean;
  visible:              boolean;
}

interface VariantPricingItem {
  id:             string;
  name:           string;
  capacity_range: string | null;
  price:          number;
}

interface KnowledgeTreeRef {
  resource_template_id: string;
  service_activity?:    string;
}

interface BlockConfig {
  // Catalog-studio ResourceDependencyStep
  selectedResources:      SelectedResource[];
  selectedVariants:       SelectedVariant[];
  pricingMode:            'independent';
  priceType:              'fixed';
  deliveryMode:           'onsite';

  // Catalog-studio PricingStep — base pricing card
  pricingRecords: PricingRecord[];

  // Catalog-studio PricingStep — per-variant pricing
  variantPricingMode:    'per_variant' | 'all';
  variantPricingRecords?: VariantPricingRecord[];

  // KT reference for pricing-review step (user sees suggestion, sets final price)
  kt_reference_price:    number | null;
  kt_service_activity:   string;
  kt_price_geo?:         string;
}

interface SelectedResource {
  resource_id:      string;
  resource_type_id: 'equipment' | 'asset';
  resource_name:    string;
  quantity:         number;
  is_required:      boolean;
}

interface SelectedVariant {
  variant_id:     string;
  variant_name:   string;
  capacity_range: string | null;
}

interface PricingRecord {
  id:            string;
  currency:      string;
  amount:        number;
  price_type:    'fixed';
  tax_inclusion: 'exclusive';
  taxes:         [];
  is_active:     boolean;
}

interface VariantPricingRecord {
  id:             string;
  variant_id:     string;
  variant_name:   string;
  capacity_range: string | null;
  currency:       string;
  amount:         number;
  price_type:     'fixed';
  tax_inclusion:  'exclusive';
  taxes:          [];
  is_active:      boolean;
}

interface KtVariant {
  id:             string;
  name:           string;
  capacity_range: string | null;
}

// catalog_name and price_median are now nullable — relaxed from original
interface ServiceGroupRow {
  service_name:     string;
  service_activity: string;
  catalog_name:     string | null;
  price_median:     number | null;
  price_currency:   string;
  checkpoint_id:    string;
}

interface SparePartRow {
  id:             string;
  name:           string;
  price_median:   number | null;
  price_currency: string;
  price_unit:     string | null;
}

interface ResourceTemplateRow {
  id:               string;
  name:             string;
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

  async buildBlocksForTemplate(resourceTemplateId: string): Promise<{
    blocks:   CatBlockPayload[];
    skipped:  { serviceGroups: number; spareParts: number };
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
      resource_id:      resourceTemplateId,
      resource_type_id: resourceTypeId,
      resource_name:    resourceTemplate.name,
      quantity:         1,
      is_required:      true,
    };

    const { blocks: serviceBlocks, skipped: skippedServiceGroups } =
      this.buildServiceBlocks(serviceRows, variants, resourceTemplateId, selectedResource);

    const { blocks: spareBlocks, skipped: skippedSpareParts } =
      this.buildSpareBlocks(spareRows, resourceTemplateId, selectedResource);

    return {
      blocks:  [...serviceBlocks, ...spareBlocks],
      skipped: { serviceGroups: skippedServiceGroups, spareParts: skippedSpareParts },
    };
  }

  // ---------------------------------------------------------------------------
  // Service blocks — one block per unique service_name
  // ---------------------------------------------------------------------------

  private buildServiceBlocks(
    rows:             ServiceGroupRow[],
    variants:         KtVariant[],
    resourceTemplateId: string,
    selectedResource: SelectedResource,
  ): { blocks: CatBlockPayload[]; skipped: number } {
    // Group rows by service_name
    const groups = new Map<string, ServiceGroupRow[]>();
    for (const row of rows) {
      const existing = groups.get(row.service_name) || [];
      existing.push(row);
      groups.set(row.service_name, existing);
    }

    // Build SelectedVariant list from KT variants (for wizard pre-population)
    const selectedVariants: SelectedVariant[] = variants.map(v => ({
      variant_id:     v.id,
      variant_name:   v.name,
      capacity_range: v.capacity_range,
    }));

    const blocks: CatBlockPayload[] = [];

    for (const [serviceName, groupRows] of groups) {
      const representative = groupRows[0];
      const referencePrice = representative.price_median ?? 0;
      const currency       = representative.price_currency || 'INR';

      const ktCheckpointIds = [...new Set(groupRows.map(r => r.checkpoint_id))];

      // variant_pricing top-level column (KT reference — used by contract pricing engine)
      const variantPricing = variants.length > 0
        ? { variants: variants.map(v => ({ id: v.id, name: v.name, capacity_range: v.capacity_range, price: referencePrice })) }
        : undefined;

      // Per-variant pricing records for the wizard's PricingStep
      const variantPricingRecords: VariantPricingRecord[] = variants.map(v => ({
        id:             `vp-${v.id}`,
        variant_id:     v.id,
        variant_name:   v.name,
        capacity_range: v.capacity_range,
        currency,
        amount:         referencePrice,
        price_type:     'fixed',
        tax_inclusion:  'exclusive',
        taxes:          [],
        is_active:      true,
      }));

      const config: BlockConfig = {
        selectedResources:    [selectedResource],
        selectedVariants,
        pricingMode:          'independent',
        priceType:            'fixed',
        deliveryMode:         'onsite',
        pricingRecords:       [{
          id:            '1',
          currency,
          amount:        referencePrice,
          price_type:    'fixed',
          tax_inclusion: 'exclusive',
          taxes:         [],
          is_active:     true,
        }],
        variantPricingMode:    variants.length > 0 ? 'per_variant' : 'all',
        variantPricingRecords: variants.length > 0 ? variantPricingRecords : undefined,
        // KT reference — pricing review step uses these to show suggested prices
        kt_reference_price:    representative.price_median,
        kt_service_activity:   representative.service_activity,
      };

      blocks.push({
        name:                 serviceName,
        display_name:         representative.catalog_name || serviceName,
        block_type_id:        BLOCK_TYPE_SERVICE,
        pricing_mode_id:      PRICING_MODE_VARIANT_BASED,
        base_price:           referencePrice,
        currency,
        resource_template_id: resourceTemplateId,
        kt_checkpoint_ids:    ktCheckpointIds,
        variant_pricing:      variantPricing,
        knowledge_tree_ref:   {
          resource_template_id: resourceTemplateId,
          service_activity:     representative.service_activity,
        },
        config,
        is_seed:   true,
        is_active: true,
        visible:   true,
      });
    }

    return { blocks, skipped: 0 };
  }

  // ---------------------------------------------------------------------------
  // Spare blocks — one block per spare part
  // ---------------------------------------------------------------------------

  private buildSpareBlocks(
    rows:             SparePartRow[],
    resourceTemplateId: string,
    selectedResource: SelectedResource,
  ): { blocks: CatBlockPayload[]; skipped: number } {
    const blocks: CatBlockPayload[] = [];

    for (const spare of rows) {
      const price    = spare.price_median ?? 0;
      const currency = spare.price_currency || 'INR';

      blocks.push({
        name:                 spare.name,
        display_name:         spare.name,
        block_type_id:        BLOCK_TYPE_SPARE,
        pricing_mode_id:      PRICING_MODE_INDEPENDENT,
        base_price:           price,
        currency,
        resource_template_id: resourceTemplateId,
        knowledge_tree_ref:   { resource_template_id: resourceTemplateId },
        config: {
          selectedResources:    [selectedResource],
          selectedVariants:     [],
          pricingMode:          'independent',
          priceType:            'fixed',
          deliveryMode:         'onsite',
          pricingRecords:       [{
            id:            '1',
            currency,
            amount:        price,
            price_type:    'fixed',
            tax_inclusion: 'exclusive',
            taxes:         [],
            is_active:     true,
          }],
          variantPricingMode:   'all',
          kt_reference_price:   spare.price_median,
          kt_service_activity:  'spare_part',
        },
        is_seed:   true,
        is_active: true,
        visible:   true,
      });
    }

    return { blocks, skipped: 0 };
  }

  // ---------------------------------------------------------------------------
  // DB queries
  // ---------------------------------------------------------------------------

  private async fetchResourceTemplate(id: string): Promise<ResourceTemplateRow | null> {
    const { data, error } = await this.supabase
      .from('m_catalog_resource_templates')
      .select('id, name, resource_type_id')
      .eq('id', id)
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

  private async fetchServiceCycleRows(resourceTemplateId: string): Promise<ServiceGroupRow[]> {
    const { data, error } = await this.supabase.rpc('kt_service_cycle_rows_for_template', {
      p_resource_template_id: resourceTemplateId,
    });
    if (error) {
      return this.fetchServiceCycleRowsFallback(resourceTemplateId);
    }
    return (data || []) as ServiceGroupRow[];
  }

  private async fetchServiceCycleRowsFallback(resourceTemplateId: string): Promise<ServiceGroupRow[]> {
    // Fetch checkpoints — service_name must be non-null (it's the block name)
    const { data: checkpoints, error: cpError } = await this.supabase
      .from('m_equipment_checkpoints')
      .select('id, service_name, service_activity')
      .eq('resource_template_id', resourceTemplateId)
      .eq('is_active', true)
      .not('service_name', 'is', null);

    if (cpError || !checkpoints?.length) return [];

    const checkpointIds = checkpoints.map((c: any) => c.id);

    // Fetch cycles — NO longer filter by catalog_name or price_median being non-null
    const { data: cycles, error: cyError } = await this.supabase
      .from('m_service_cycles')
      .select('id, checkpoint_id, catalog_name, price_median, price_currency')
      .in('checkpoint_id', checkpointIds)
      .eq('is_active', true);

    const checkpointMap = new Map(checkpoints.map((c: any) => [c.id, c]));

    // Group cycles by checkpoint
    const cyclesByCheckpoint = new Map<string, any[]>();
    for (const cycle of (cycles || [])) {
      const arr = cyclesByCheckpoint.get(cycle.checkpoint_id) || [];
      arr.push(cycle);
      cyclesByCheckpoint.set(cycle.checkpoint_id, arr);
    }

    const rows: ServiceGroupRow[] = [];

    for (const cp of checkpoints) {
      const cpCycles = cyclesByCheckpoint.get(cp.id) || [];

      if (cpCycles.length > 0) {
        // One row per cycle for this checkpoint
        for (const cycle of cpCycles) {
          rows.push({
            service_name:     cp.service_name,
            service_activity: cp.service_activity,
            catalog_name:     cycle.catalog_name,   // may be null — display_name fallback
            price_median:     cycle.price_median,    // may be null — user sets in pricing review
            price_currency:   cycle.price_currency || 'INR',
            checkpoint_id:    cp.id,
          });
        }
      } else {
        // No cycles for this checkpoint — still create a block (price = 0)
        rows.push({
          service_name:     cp.service_name,
          service_activity: cp.service_activity,
          catalog_name:     null,
          price_median:     null,
          price_currency:   'INR',
          checkpoint_id:    cp.id,
        });
      }
    }

    return rows;
  }

  private async fetchSparePartRows(resourceTemplateId: string): Promise<SparePartRow[]> {
    const { data, error } = await this.supabase
      .from('m_equipment_spare_parts')
      .select('id, name, price_median, price_currency, price_unit')
      .eq('resource_template_id', resourceTemplateId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('KtCatBlockMapper: fetchSparePartRows error', error.message);
      return [];
    }
    return data || [];
  }
}

export const ktCatBlockMapperService = new KtCatBlockMapperService();
