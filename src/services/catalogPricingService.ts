// src/services/catalogPricingService.ts
// ONE place that decides the currency and the taxes a newly seeded catalog
// block carries (migration catalog-studio/008).
//
// Every seeding path goes through here — onboarding seed, VaNi Seeding
// "Load into my catalog", sync, service-only blocks, bulk seed and the
// preview — so a seeded block always matches the tenant's setup:
//   currency  = the business currency (Business Profile), ONE pricing record.
//             KT prices in other currencies are dropped, never converted.
//   taxes     = the rates the user CHOSE where they seeded (onboarding Tax
//             screen / VaNi Seeding picker), looked up in the tax master;
//             none chosen → the tax master's default rate; none set up or
//             "No tax" → no taxes. Nothing is invented.
//   inclusion = the tax master's display mode.
// The contract wizard reads pricingRecords[].taxes, the composer and lists read
// m_cat_blocks.tax_rate — both are written from the same lookup.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface CatalogTaxLine {
  id:   string;
  name: string;
  rate: number;
}

export interface CatalogTax {
  display_mode: 'including_tax' | 'excluding_tax' | 'no_tax';
  inclusion:    'inclusive' | 'exclusive';
  taxes:        CatalogTaxLine[];
  total:        number;
  source:       'chosen' | 'default' | 'none' | 'no_tax';
  currency:     string;
}

export class CatalogTaxError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'CatalogTaxError';
  }
}

function clientFor(authToken?: string): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  // Anon key + the caller's JWT: the RPC checks the caller belongs to the tenant.
  return createClient(url, process.env.SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authToken ? { headers: { Authorization: authToken } } : undefined,
  });
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

/**
 * The tenant's currency + the taxes for new catalog items.
 * rateIds: undefined/null = the tax master's default; [] = no tax; ids = those rates.
 * Throws CatalogTaxError — a seed must not quietly fall back to a made-up rate.
 */
export async function resolveCatalogTax(
  tenantId: string,
  rateIds?: string[] | null,
  authToken?: string,
): Promise<CatalogTax> {
  const ids = Array.isArray(rateIds) ? [...new Set(rateIds.filter(Boolean))] : null;
  const { data, error } = await clientFor(authToken).rpc('fn_resolve_catalog_tax', {
    p_tenant: tenantId,
    p_rate_ids: ids,
  });
  if (error) throw new CatalogTaxError(`Could not read your tax settings: ${error.message}`, 'TAX_LOOKUP_FAILED');
  if (!data?.success) throw new CatalogTaxError('Not allowed to read this tenant\'s tax settings', data?.reason || 'TAX_LOOKUP_REFUSED');
  if (Array.isArray(data.unknown_ids) && data.unknown_ids.length > 0) {
    throw new CatalogTaxError('One or more chosen tax rates no longer exist — pick them again', 'UNKNOWN_TAX_RATE');
  }
  return {
    display_mode: data.display_mode,
    inclusion:    data.inclusion === 'inclusive' ? 'inclusive' : 'exclusive',
    taxes:        (data.taxes || []).map((t: any) => ({ id: t.id, name: t.name, rate: num(t.rate) })),
    total:        num(data.total),
    source:       data.source,
    currency:     String(data.currency || '').toUpperCase(),
  };
}

/** Business currency only (seed preview / UI defaults). */
export async function getTenantCurrency(tenantId: string, authToken?: string): Promise<string> {
  const { data, error } = await clientFor(authToken).rpc('fn_tenant_currency', { p_tenant: tenantId });
  if (error || !data) throw new CatalogTaxError(`Could not read your business currency: ${error?.message || 'empty'}`, 'CURRENCY_LOOKUP_FAILED');
  return String(data).toUpperCase();
}

/**
 * Applies currency + taxes to one seed block (mapper / service-template shape).
 * Keeps only the business-currency record; when the KT has no price in that
 * currency the block is seeded at 0 in that currency (kt_currency_missing) so
 * the tenant prices it — a foreign-currency figure is never relabelled.
 * Returns a new object; also sets tax_rate (sum of the chosen rates).
 */
export function applyCatalogPricing<B extends Record<string, any>>(block: B, tax: CatalogTax): B & { tax_rate: number } {
  const cur = tax.currency;
  const taxes = tax.taxes.map((t) => ({ id: t.id, name: t.name, rate: t.rate }));
  const stamp = (rec: any) => ({ ...rec, currency: cur, tax_inclusion: tax.inclusion, taxes });

  const config: Record<string, any> = { ...(block.config || {}) };
  const records: any[] = Array.isArray(config.pricingRecords) ? config.pricingRecords : [];
  const own = records.filter((r) => String(r?.currency || '').toUpperCase() === cur);
  const currencyMissing = records.length > 0 && own.length === 0;

  config.pricingRecords = (own.length ? own : [{ id: '1', amount: 0, price_type: 'fixed', is_active: true }])
    .slice(0, 1)
    .map((r) => stamp({ ...r, id: '1', amount: currencyMissing ? 0 : num(r.amount) }));

  if (Array.isArray(config.variantPricingRecords)) {
    config.variantPricingRecords = config.variantPricingRecords.map((r: any) => {
      const sameCurrency = String(r?.currency || '').toUpperCase() === cur;
      return stamp({ ...r, amount: sameCurrency ? num(r.amount) : 0 });
    });
  }

  let variantPricing = block.variant_pricing;
  if (currencyMissing) {
    config.kt_currency_missing = true;
    config.kt_reference_price = null;
    config.kt_price_min = null;
    config.kt_price_max = null;
    if (variantPricing?.variants) {
      variantPricing = { ...variantPricing, variants: variantPricing.variants.map((v: any) => ({ ...v, price: 0 })) };
    }
  }

  return {
    ...block,
    currency:        cur,
    base_price:      num(config.pricingRecords[0].amount),
    variant_pricing: variantPricing,
    config,
    tax_rate:        tax.total,
  };
}
