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
  description?:         string | null;
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
  // variant_based for services with KT variants, independent for spares —
  // must agree with the top-level pricing_mode_id (founder finding #2)
  pricingMode:            'independent' | 'variant_based';
  priceType:              'fixed';
  deliveryMode:           'onsite';

  // Service cadence from KT (m_service_cycles.frequency_*) — shape consumed by
  // Catalog Studio BlockEditorPanel and the contract wizard (founder finding #3)
  serviceCycles?:         { enabled: boolean; days: number; gracePeriod: number };

  // Catalog-studio PricingStep — base pricing card
  pricingRecords: PricingRecord[];

  // Catalog-studio PricingStep — per-variant pricing
  variantPricingMode:    'per_variant' | 'all';
  variantPricingRecords?: VariantPricingRecord[];

  // KT reference for pricing-review step (user sees suggestion, sets final price)
  kt_reference_price:    number | null;
  kt_price_min?:         number | null;
  kt_price_max?:         number | null;
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

// m_checkpoint_variant_map: which variants a checkpoint applies to, with
// optional per-variant price overrides (founder finding: variants were
// "dumped" — every service got all variants at one flat price)
interface VariantMapRow {
  checkpoint_id: string;
  variant_id:    string;
  override_min:  number | null;
  override_max:  number | null;
}

// catalog_name and price_median are now nullable — relaxed from original
interface ServiceGroupRow {
  service_name:     string;
  service_activity: string;
  catalog_name:     string | null;
  price_min:        number | null;
  price_median:     number | null;
  price_max:        number | null;
  price_currency:   string;
  checkpoint_id:    string;
  cycle_id?:        string | null;   // Layer 2: keys per-variant multipliers
  frequency_value:  number | null;
  frequency_unit:   string | null;
  alert_overdue_days: number | null;
}

interface SparePartRow {
  id:             string;
  name:           string;
  description:    string | null;
  price_min:      number | null;
  price_median:   number | null;
  price_max:      number | null;
  price_currency: string;
  price_unit:     string | null;
  prices?:        Array<{ currency: string; price_min: number | null; price_median: number | null; price_max: number | null }>;
}

interface ResourceTemplateRow {
  id:               string;
  name:             string;
  resource_type_id: string;
}

export class KtCatBlockMapperService {
  private supabase: SupabaseClient;
  private hasServiceKey: boolean;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) {
      throw new Error('KtCatBlockMapperService: Missing SUPABASE_URL or SUPABASE_KEY');
    }
    this.hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    this.supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    console.log('✅ KtCatBlockMapperService: Initialized');
  }

  // The API layer holds only the ANON key by design; KT master tables are
  // RLS-read-restricted to authenticated/service_role. Forwarding the caller's
  // JWT makes reads run as 'authenticated' — without it (and without a service
  // key) the mapper silently reads an EMPTY knowledge tree.
  private clientFor(authToken?: string): SupabaseClient {
    if (this.hasServiceKey || !authToken) return this.supabase;
    return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authToken } },
    });
  }

  async buildBlocksForTemplate(resourceTemplateId: string, authToken?: string): Promise<{
    blocks:   CatBlockPayload[];
    skipped:  { serviceGroups: number; spareParts: number };
  }> {
    const sb = this.clientFor(authToken);
    const [resourceTemplate, variants, serviceRows, spareRows, variantMap, serviceDefs] = await Promise.all([
      this.fetchResourceTemplate(sb, resourceTemplateId),
      this.fetchVariants(sb, resourceTemplateId),
      this.fetchServiceCycleRows(sb, resourceTemplateId),
      this.fetchSparePartRows(sb, resourceTemplateId),
      this.fetchVariantMap(sb, resourceTemplateId),
      this.fetchServiceDefinitions(sb, resourceTemplateId),
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

    // Layer 2: currency-neutral per-variant multipliers, keyed by service cycle
    const multipliers = await this.fetchVariantMultipliers(sb, serviceRows);

    const { blocks: serviceBlocks, skipped: skippedServiceGroups } =
      this.buildServiceBlocks(serviceRows, variants, variantMap, serviceDefs, multipliers, resourceTemplateId, selectedResource);

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
    variantMap:       VariantMapRow[],
    serviceDefs:      Map<string, string | null>,
    multipliers:      Map<string, Map<string, number>>,
    resourceTemplateId: string,
    selectedResource: SelectedResource,
  ): { blocks: CatBlockPayload[]; skipped: number } {
    // Group rows into chargeable Services (founder taxonomy):
    //   named work packages (cycle.catalog_name) first — e.g. "DG Set
    //   Preventive Maintenance — Comprehensive"; per-section jobs
    //   (checkpoint.service_name) for everything else. Each group becomes
    //   exactly ONE block; cadence rides along as serviceCycles data.
    const groups = new Map<string, ServiceGroupRow[]>();
    for (const row of rows) {
      const key = row.catalog_name || row.service_name;
      if (!key) continue;
      const existing = groups.get(key) || [];
      existing.push(row);
      groups.set(key, existing);
    }

    // checkpoint → applicable variant rows (with optional price overrides)
    const mapByCheckpoint = new Map<string, VariantMapRow[]>();
    for (const m of variantMap) {
      const arr = mapByCheckpoint.get(m.checkpoint_id) || [];
      arr.push(m);
      mapByCheckpoint.set(m.checkpoint_id, arr);
    }

    const blocks: CatBlockPayload[] = [];

    for (const [serviceName, groupRows] of groups) {
      const ktCheckpointIds = [...new Set(groupRows.map(r => r.checkpoint_id))];

      // Multi-currency: one pricing entry per currency present on the group's
      // cycles (KT holds one currency per cycle row, per geo). Primary currency
      // prefers INR, else the first currency seen.
      const byCurrency = new Map<string, ServiceGroupRow>();
      for (const r of groupRows) {
        if (r.price_median != null && !byCurrency.has(r.price_currency || 'INR')) {
          byCurrency.set(r.price_currency || 'INR', r);
        }
      }
      const currencies = [...byCurrency.keys()];
      const primaryCurrency = currencies.includes('INR') ? 'INR' : (currencies[0] || 'INR');
      const representative = byCurrency.get(primaryCurrency) || groupRows[0];
      const referencePrice = representative.price_median ?? 0;
      const currency = primaryCurrency;

      // KT market range across the group, primary currency only
      const primaryRows = groupRows.filter(r => (r.price_currency || 'INR') === primaryCurrency);
      const rangeRows = primaryRows.length ? primaryRows : groupRows;
      const mins = rangeRows.map(r => r.price_min).filter((v): v is number => v != null);
      const maxs = rangeRows.map(r => r.price_max).filter((v): v is number => v != null);
      const ktPriceMin = mins.length ? Math.min(...mins) : null;
      const ktPriceMax = maxs.length ? Math.max(...maxs) : null;

      // Variant applicability (founder finding): only the variants this
      // service's checkpoints are mapped to — falling back to ALL variants
      // when KT has no map rows for the group. Per-variant price = override
      // midpoint when KT provides one, else the group reference price.
      const groupMapRows = ktCheckpointIds.flatMap(id => mapByCheckpoint.get(id) || []);
      const overrideByVariant = new Map<string, number>();
      for (const m of groupMapRows) {
        if (!overrideByVariant.has(m.variant_id) && (m.override_min != null || m.override_max != null)) {
          const lo = m.override_min ?? m.override_max!;
          const hi = m.override_max ?? m.override_min!;
          overrideByVariant.set(m.variant_id, Math.round((lo + hi) / 2));
        }
      }
      const applicableIds = new Set(groupMapRows.map(m => m.variant_id));
      const applicableVariants = applicableIds.size > 0
        ? variants.filter(v => applicableIds.has(v.id))
        : variants;

      // Layer 2 multipliers: currency-neutral, relative to the cycle median.
      // First multiplier found across the group's cycles wins per variant.
      const multByVariant = new Map<string, number>();
      for (const r of groupRows) {
        const cm = r.cycle_id ? multipliers.get(r.cycle_id) : undefined;
        if (!cm) continue;
        for (const [variantId, mult] of cm) {
          if (!multByVariant.has(variantId)) multByVariant.set(variantId, mult);
        }
      }

      // Precedence: absolute override midpoint (hand-curated era) > median × multiplier > flat median
      const variantPrice = (v: KtVariant) => {
        const override = overrideByVariant.get(v.id);
        if (override != null) return override;
        const mult = multByVariant.get(v.id);
        if (mult != null && referencePrice > 0) return Math.round(referencePrice * mult);
        return referencePrice;
      };

      const selectedVariants: SelectedVariant[] = applicableVariants.map(v => ({
        variant_id:     v.id,
        variant_name:   v.name,
        capacity_range: v.capacity_range,
      }));

      // Service cadence: only calendar ('days') cycles translate to the
      // serviceCycles shape; 'visits'/'hours' cadences are usage-based.
      // Prefer the cycle that supplied the reference price, else the most
      // frequent day-based cycle in the group.
      const dayCycles = groupRows.filter(r => r.frequency_unit === 'days' && (r.frequency_value ?? 0) > 0);
      const cycleSource =
        dayCycles.find(r => r.price_median != null && r.price_median === representative.price_median) ||
        dayCycles.sort((a, b) => (a.frequency_value ?? 0) - (b.frequency_value ?? 0))[0];
      const serviceCycles = cycleSource
        ? { enabled: true, days: cycleSource.frequency_value!, gracePeriod: cycleSource.alert_overdue_days ?? 0 }
        : undefined;

      // variant_pricing top-level column (KT reference — used by contract pricing engine)
      const variantPricing = applicableVariants.length > 0
        ? { variants: applicableVariants.map(v => ({ id: v.id, name: v.name, capacity_range: v.capacity_range, price: variantPrice(v) })) }
        : undefined;

      // Per-variant pricing records for the wizard's PricingStep (primary currency;
      // KT overrides have no currency dimension yet)
      const variantPricingRecords: VariantPricingRecord[] = applicableVariants.map(v => ({
        id:             `vp-${v.id}`,
        variant_id:     v.id,
        variant_name:   v.name,
        capacity_range: v.capacity_range,
        currency,
        amount:         variantPrice(v),
        price_type:     'fixed',
        tax_inclusion:  'exclusive',
        taxes:          [],
        is_active:      true,
      }));

      // One pricing record per currency present in KT (multi-currency support)
      const pricingRecords: PricingRecord[] = (currencies.length ? currencies : [currency]).map((cur, i) => ({
        id:            String(i + 1),
        currency:      cur,
        amount:        byCurrency.get(cur)?.price_median ?? referencePrice,
        price_type:    'fixed' as const,
        tax_inclusion: 'exclusive' as const,
        taxes:         [] as [],
        is_active:     true,
      }));

      const config: BlockConfig = {
        selectedResources:    [selectedResource],
        selectedVariants,
        pricingMode:          applicableVariants.length > 0 ? 'variant_based' : 'independent',
        priceType:            'fixed',
        deliveryMode:         'onsite',
        serviceCycles,
        pricingRecords,
        variantPricingMode:    applicableVariants.length > 0 ? 'per_variant' : 'all',
        variantPricingRecords: applicableVariants.length > 0 ? variantPricingRecords : undefined,
        // KT reference — pricing review step uses these to show suggested prices
        kt_reference_price:    representative.price_median,
        kt_price_min:          ktPriceMin,
        kt_price_max:          ktPriceMax,
        kt_service_activity:   representative.service_activity || 'pm',
      };

      blocks.push({
        name:                 serviceName,
        display_name:         serviceName,
        description:          serviceDefs.get(serviceName) ?? null,
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
      // Multi-currency: all active geo-pricings, INR primary when present
      const priceList = (spare.prices && spare.prices.length)
        ? spare.prices
        : [{ currency: spare.price_currency || 'INR', price_min: spare.price_min, price_median: spare.price_median, price_max: spare.price_max }];
      const primary = priceList.find(p => p.currency === 'INR') || priceList[0];
      const price    = primary.price_median ?? 0;
      const currency = primary.currency || 'INR';

      blocks.push({
        name:                 spare.name,
        display_name:         spare.name,
        description:          spare.description ?? null,
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
          pricingRecords:       priceList.map((pv, i) => ({
            id:            String(i + 1),
            currency:      pv.currency || 'INR',
            amount:        pv.price_median ?? 0,
            price_type:    'fixed' as const,
            tax_inclusion: 'exclusive' as const,
            taxes:         [] as [],
            is_active:     true,
          })),
          variantPricingMode:   'all',
          kt_reference_price:   primary.price_median,
          kt_price_min:         primary.price_min,
          kt_price_max:         primary.price_max,
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

  private async fetchResourceTemplate(sb: SupabaseClient, id: string): Promise<ResourceTemplateRow | null> {
    const { data, error } = await sb
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

  private async fetchVariants(sb: SupabaseClient, resourceTemplateId: string): Promise<KtVariant[]> {
    const { data, error } = await sb
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

  private async fetchServiceCycleRows(sb: SupabaseClient, resourceTemplateId: string): Promise<ServiceGroupRow[]> {
    const { data, error } = await sb.rpc('kt_service_cycle_rows_for_template', {
      p_resource_template_id: resourceTemplateId,
    });
    if (error) {
      return this.fetchServiceCycleRowsFallback(sb, resourceTemplateId);
    }
    return (data || []) as ServiceGroupRow[];
  }

  private async fetchServiceCycleRowsFallback(sb: SupabaseClient, resourceTemplateId: string): Promise<ServiceGroupRow[]> {
    // Founder model: every chargeable non-part is a Service. Blocks come from
    // (a) named work packages — cycles carrying catalog_name (e.g. "DG Set
    //     Preventive Maintenance" scope), even when checkpoints aren't named;
    // (b) service_name groupings (per-section jobs: repair/install/decomm).
    // So fetch ALL active checkpoints; rows are emitted only when a group key
    // (catalog_name ?? service_name) exists.
    const { data: checkpoints, error: cpError } = await sb
      .from('m_equipment_checkpoints')
      .select('id, service_name, service_activity')
      .eq('resource_template_id', resourceTemplateId)
      .eq('is_active', true);

    if (cpError || !checkpoints?.length) return [];

    const checkpointIds = checkpoints.map((c: any) => c.id);

    // Fetch cycles — NO longer filter by catalog_name or price_median being non-null
    const { data: cycles, error: cyError } = await sb
      .from('m_service_cycles')
      .select('id, checkpoint_id, catalog_name, price_min, price_median, price_max, price_currency, frequency_value, frequency_unit, alert_overdue_days')
      .in('checkpoint_id', checkpointIds)
      .eq('is_active', true);

    const checkpointMap = new Map(checkpoints.map((c: any) => [c.id, c]));

    // Multi-pricing (m_kt_prices): every active geo/currency per cycle.
    // Falls back to the legacy single-slot columns when a cycle has no rows.
    const cycleIds = (cycles || []).map((c: any) => c.id);
    let ktPriceRows: any[] = [];
    if (cycleIds.length) {
      const { data: pr } = await sb
        .from('m_kt_prices')
        .select('entity_id, currency, geo, price_min, price_median, price_max')
        .eq('entity_type', 'service_cycle')
        .in('entity_id', cycleIds);
      ktPriceRows = pr || [];
    }
    const pricesByCycle = new Map<string, any[]>();
    for (const r of ktPriceRows) {
      const arr = pricesByCycle.get(r.entity_id) || [];
      arr.push(r);
      pricesByCycle.set(r.entity_id, arr);
    }

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
        // One row per (cycle × active geo-pricing); legacy slot as fallback.
        // Rows without any group key (no catalog_name AND unnamed checkpoint)
        // are skipped — nothing chargeable to sell yet.
        for (const cycle of cpCycles) {
          if (!cycle.catalog_name && !cp.service_name) continue;
          const priceVariants = pricesByCycle.get(cycle.id);
          const priceList = priceVariants?.length
            ? priceVariants
            : [{ currency: cycle.price_currency || 'INR', price_min: cycle.price_min, price_median: cycle.price_median, price_max: cycle.price_max }];
          for (const pv of priceList) {
            rows.push({
              service_name:     cp.service_name,
              service_activity: cp.service_activity,
              catalog_name:     cycle.catalog_name,
              price_min:        pv.price_min,
              price_median:     pv.price_median,      // may be null — user sets in pricing review
              price_max:        pv.price_max,
              price_currency:   pv.currency || 'INR',
              checkpoint_id:    cp.id,
              cycle_id:         cycle.id,
              frequency_value:  cycle.frequency_value,
              frequency_unit:   cycle.frequency_unit,
              alert_overdue_days: cycle.alert_overdue_days,
            });
          }
        }
      } else if (cp.service_name) {
        // No cycles for this checkpoint — still part of its named job (price = 0)
        rows.push({
          service_name:     cp.service_name,
          service_activity: cp.service_activity,
          catalog_name:     null,
          price_min:        null,
          price_median:     null,
          price_max:        null,
          price_currency:   'INR',
          checkpoint_id:    cp.id,
          cycle_id:         null,
          frequency_value:  null,
          frequency_unit:   null,
          alert_overdue_days: null,
        });
      }
    }

    return rows;
  }

  // Layer 2: currency-neutral per-variant multipliers (cycleId → variantId → multiplier).
  // Empty map = flat pricing; the variantPrice precedence handles absence gracefully.
  private async fetchVariantMultipliers(
    sb: SupabaseClient,
    serviceRows: ServiceGroupRow[],
  ): Promise<Map<string, Map<string, number>>> {
    const result = new Map<string, Map<string, number>>();
    const cycleIds = [...new Set(serviceRows.map(r => r.cycle_id).filter((id): id is string => !!id))];
    if (!cycleIds.length) return result;

    const { data, error } = await sb
      .from('m_kt_variant_price_multipliers')
      .select('service_cycle_id, variant_id, multiplier')
      .in('service_cycle_id', cycleIds);
    if (error) {
      console.error('KtCatBlockMapper: fetchVariantMultipliers error', error.message);
      return result;
    }
    for (const row of data || []) {
      const m = result.get(row.service_cycle_id) || new Map<string, number>();
      m.set(row.variant_id, Number(row.multiplier));
      result.set(row.service_cycle_id, m);
    }
    return result;
  }

  private async fetchServiceDefinitions(sb: SupabaseClient, resourceTemplateId: string): Promise<Map<string, string | null>> {
    // One row per sellable service (m_kt_service_definitions) — description
    // stored once and seeded into m_cat_blocks.description (founder decision)
    const { data, error } = await sb
      .from('m_kt_service_definitions')
      .select('service_name, description')
      .eq('resource_template_id', resourceTemplateId);
    if (error) {
      console.error('KtCatBlockMapper: fetchServiceDefinitions error', error.message);
      return new Map();
    }
    return new Map((data || []).map((d: any) => [d.service_name, d.description ?? null]));
  }

  private async fetchVariantMap(sb: SupabaseClient, resourceTemplateId: string): Promise<VariantMapRow[]> {
    // Two-step (checkpoints for template → map rows) keeps this anon/JWT-safe
    const { data: cps, error: cpErr } = await sb
      .from('m_equipment_checkpoints')
      .select('id')
      .eq('resource_template_id', resourceTemplateId)
      .eq('is_active', true);
    if (cpErr || !cps?.length) return [];

    const { data, error } = await sb
      .from('m_checkpoint_variant_map')
      .select('checkpoint_id, variant_id, override_min, override_max')
      .in('checkpoint_id', cps.map((c: any) => c.id));
    if (error) {
      console.error('KtCatBlockMapper: fetchVariantMap error', error.message);
      return [];
    }
    return data || [];
  }

  private async fetchSparePartRows(sb: SupabaseClient, resourceTemplateId: string): Promise<SparePartRow[]> {
    const { data, error } = await sb
      .from('m_equipment_spare_parts')
      .select('id, name, description, price_min, price_median, price_max, price_currency, price_unit')
      .eq('resource_template_id', resourceTemplateId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('KtCatBlockMapper: fetchSparePartRows error', error.message);
      return [];
    }
    const spares = (data || []) as SparePartRow[];

    // Attach multi-pricing rows (m_kt_prices) per spare
    if (spares.length) {
      const { data: pr } = await sb
        .from('m_kt_prices')
        .select('entity_id, currency, price_min, price_median, price_max')
        .eq('entity_type', 'spare_part')
        .in('entity_id', spares.map(sp => sp.id));
      const byId = new Map<string, any[]>();
      for (const r of (pr || [])) {
        const arr = byId.get(r.entity_id) || [];
        arr.push(r);
        byId.set(r.entity_id, arr);
      }
      for (const sp of spares) sp.prices = byId.get(sp.id) as any;
    }
    return spares;
  }
}

export const ktCatBlockMapperService = new KtCatBlockMapperService();
