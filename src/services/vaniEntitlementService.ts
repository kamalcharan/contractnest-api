// ============================================================================
// VaNi Entitlement Service
// ============================================================================
// Business rule (owner decision): VaNi — the agent, its Briefing, the LLM
// composer and the automation that runs a tenant's rules — is on only for
// tenants who have it. Everyone else gets the manual product.
//
// THE TRUTH IS THE TENANT TABLE (owner, 2026-09-16: "VaNi enabled or not
// should be part of the tenant table; VaNi is part of subscriptions"):
//
//   t_tenants.vani_enabled / vani_enabled_until / vani_enabled_source
//   vani_is_enabled(tenant_id)  → admin tenant always true (computed from
//                                 is_admin); otherwise the column, expiry
//                                 evaluated at read time.
//
// This service reads that ONE function — the same one get_tenant_context
// emits as flags.vani_enabled — so the tenant-context API, the landing page,
// Automation Rules, the Briefing gate and the composer gate can never
// disagree. Writers: start_vani_trial (trial, until trial_ends), the plan
// entitlement functions (open-ended), admin.
//
// History: until batch vani-landing-tenant-flag this service decided
// entitlement from env VANI_ENTITLEMENT_MODE ('open' = everyone entitled,
// the production default; 'subscription' = a t_bm_tenant_subscription row
// for product 'vani'). That env switch is GONE — a second switch beside the
// tenant column would be a second truth. The 'vani' subscription row is
// still read, but only for trial detail (has it been used, when it ends).
//
// Cache: 60s per tenant (the tenant-context API caches 30s). Cleared on
// trial start. Lookup failures are NOT cached and resolve to "off" — premium
// surfaces fail closed; message sending has its own fail-open gate in the
// jtd-worker.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CACHE_TTL_MS = 60 * 1000;

export interface VaniEntitlementDetails {
  /** vani_is_enabled(tenant) — the single truth. */
  entitled: boolean;
  /** Always 'tenant' now; kept so older UI builds (typed 'open' | 'subscription') still parse. */
  mode: 'tenant';
  /** A 'vani' subscription row exists (a trial was started at some point). */
  has_subscription: boolean;
  status: string | null;           // subscription row status: 'trial' | 'active' | ...
  trial_start_date: string | null;
  trial_ends: string | null;
  /** VaNi is on AND time-boxed (vani_enabled_until set) — i.e. running on a trial. */
  trial_active: boolean;
  /** When VaNi lapses; null = open-ended. */
  until: string | null;
  /** 'trial' | 'plan' | 'admin' | 'admin_tenant' | null */
  source: string | null;
}

const OFF: Omit<VaniEntitlementDetails, 'entitled'> & { entitled: false } = {
  entitled: false,
  mode: 'tenant',
  has_subscription: false,
  status: null,
  trial_start_date: null,
  trial_ends: null,
  trial_active: false,
  until: null,
  source: null
};

class VaniEntitlementService {
  private supabase: SupabaseClient | null = null;
  private cache = new Map<string, { details: VaniEntitlementDetails; expires: number }>();

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (url && key) {
      this.supabase = createClient(url, key);
    }
  }

  /** Kept for callers that echo it (composer /entitlement). There is one mode now. */
  getMode(): 'tenant' {
    return 'tenant';
  }

  /** Drop the cached entitlement for a tenant (call after starting a trial). */
  clearCache(tenantId: string): void {
    if (tenantId) this.cache.delete(tenantId);
  }

  /**
   * Full VaNi state for a tenant: the truth (entitled) plus trial detail for
   * the landing page / Briefing copy.
   */
  async getDetails(tenantId: string): Promise<VaniEntitlementDetails> {
    if (!tenantId) return { ...OFF };

    const cached = this.cache.get(tenantId);
    if (cached && cached.expires > Date.now()) return cached.details;

    if (!this.supabase) {
      console.warn('⚠️ VaniEntitlement: Supabase not configured — VaNi reads as off');
      return { ...OFF };
    }

    try {
      const [enabledRes, tenantRes, subRes] = await Promise.all([
        this.supabase.rpc('vani_is_enabled', { p_tenant_id: tenantId }),
        this.supabase
          .from('t_tenants')
          .select('vani_enabled_until, vani_enabled_source, is_admin')
          .eq('id', tenantId)
          .limit(1),
        this.supabase
          .from('t_bm_tenant_subscription')
          .select('subscription_id, status, trial_start_date, trial_ends')
          .eq('tenant_id', tenantId)
          .eq('product_code', 'vani')
          .limit(1)
      ]);

      if (enabledRes.error) throw enabledRes.error;
      if (tenantRes.error) throw tenantRes.error;
      // The subscription row is detail only — a failure there must not turn VaNi off.
      if (subRes.error) {
        console.warn('⚠️ VaniEntitlement: subscription detail lookup failed:', subRes.error.message);
      }

      const entitled = enabledRes.data === true;
      const t = Array.isArray(tenantRes.data) ? tenantRes.data[0] : null;
      const s = !subRes.error && Array.isArray(subRes.data) ? subRes.data[0] : null;
      const until: string | null = t?.vani_enabled_until ?? null;
      const source: string | null = t?.is_admin ? 'admin_tenant' : (t?.vani_enabled_source ?? null);

      const details: VaniEntitlementDetails = {
        entitled,
        mode: 'tenant',
        has_subscription: !!s,
        status: s?.status ?? null,
        trial_start_date: s?.trial_start_date ?? null,
        trial_ends: s?.trial_ends ?? null,
        trial_active: entitled && !!until,
        until,
        source
      };

      this.cache.set(tenantId, { details, expires: Date.now() + CACHE_TTL_MS });
      return details;
    } catch (e: any) {
      // Not cached: the next call retries. Premium surfaces fail closed.
      console.warn('⚠️ VaniEntitlement lookup failed (VaNi reads as off for this call):', e?.message || e);
      return { ...OFF };
    }
  }

  async isEntitled(tenantId: string): Promise<boolean> {
    if (!tenantId) return false;
    const details = await this.getDetails(tenantId);
    return details.entitled;
  }
}

export const vaniEntitlementService = new VaniEntitlementService();
export default vaniEntitlementService;
