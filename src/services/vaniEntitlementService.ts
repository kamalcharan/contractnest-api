// ============================================================================
// VaNi Entitlement Service
// ============================================================================
// Business rule (owner decision): the Agent is visible only to tenants who
// subscribe to VaNi; everyone else gets the manual product.
//
// Pricing/billing integration is deliberately deferred, so the POLICY is
// pluggable via env while the GATE (this service + route middleware + UI
// visibility) is permanent:
//
//   VANI_ENTITLEMENT_MODE=open          → every tenant entitled (default; dev
//                                         and pre-billing rollout)
//   VANI_ENTITLEMENT_MODE=subscription  → tenant must have a t_bm_tenant_subscription
//                                         row with status in ('active','trial').
//                                         The billing workstream will refine this
//                                         (product_code / feature reference) without
//                                         touching callers.
//
// Results are cached for 5 minutes per tenant to keep the gate off the hot path.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const ENTITLED_STATUSES = ['active', 'trial', 'trialing'];

class VaniEntitlementService {
  private supabase: SupabaseClient | null = null;
  private cache = new Map<string, { entitled: boolean; expires: number }>();

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (url && key) {
      this.supabase = createClient(url, key);
    }
  }

  getMode(): 'open' | 'subscription' {
    return process.env.VANI_ENTITLEMENT_MODE === 'subscription' ? 'subscription' : 'open';
  }

  async isEntitled(tenantId: string): Promise<boolean> {
    if (this.getMode() === 'open') return true;
    if (!tenantId) return false;

    const cached = this.cache.get(tenantId);
    if (cached && cached.expires > Date.now()) return cached.entitled;

    let entitled = false;
    try {
      if (this.supabase) {
        const { data, error } = await this.supabase
          .from('t_bm_tenant_subscription')
          .select('subscription_id, status')
          .eq('tenant_id', tenantId)
          .in('status', ENTITLED_STATUSES)
          .limit(1);
        entitled = !error && Array.isArray(data) && data.length > 0;
      }
    } catch (e: any) {
      console.warn('⚠️ VaniEntitlement check failed (treating as not entitled):', e.message);
      entitled = false;
    }

    this.cache.set(tenantId, { entitled, expires: Date.now() + CACHE_TTL_MS });
    return entitled;
  }
}

export const vaniEntitlementService = new VaniEntitlementService();
export default vaniEntitlementService;
