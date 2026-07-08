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
//                                         row with product_code='vani' and either
//                                         status='active' or a still-valid trial
//                                         (status='trial' AND trial_ends > now).
//
// vani-trial-and-briefing batch: refined to be product-aware ('vani' rows,
// created by the landing-page trial CTA via start_vani_trial RPC) and to
// expose getDetails() so the UI can render trial state (days left / expired).
//
// Results are cached for 5 minutes per tenant to keep the gate off the hot path.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface VaniEntitlementDetails {
  entitled: boolean;
  mode: 'open' | 'subscription';
  has_subscription: boolean;
  status: string | null;           // 'trial' | 'active' | 'expired' | ...
  trial_start_date: string | null;
  trial_ends: string | null;
  trial_active: boolean;
}

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

  getMode(): 'open' | 'subscription' {
    return process.env.VANI_ENTITLEMENT_MODE === 'subscription' ? 'subscription' : 'open';
  }

  /** Drop the cached entitlement for a tenant (call after starting a trial). */
  clearCache(tenantId: string): void {
    if (tenantId) this.cache.delete(tenantId);
  }

  /**
   * Full entitlement + trial state. Even in 'open' mode the subscription row
   * (if any) is returned so the landing page can show trial progress.
   */
  async getDetails(tenantId: string): Promise<VaniEntitlementDetails> {
    const mode = this.getMode();
    const base: VaniEntitlementDetails = {
      entitled: mode === 'open',
      mode,
      has_subscription: false,
      status: null,
      trial_start_date: null,
      trial_ends: null,
      trial_active: false
    };

    if (!tenantId) return { ...base, entitled: mode === 'open' };

    const cached = this.cache.get(tenantId);
    if (cached && cached.expires > Date.now()) return cached.details;

    let details = base;
    try {
      if (this.supabase) {
        const { data, error } = await this.supabase
          .from('t_bm_tenant_subscription')
          .select('subscription_id, status, trial_start_date, trial_ends')
          .eq('tenant_id', tenantId)
          .eq('product_code', 'vani')
          .limit(1);

        if (!error && Array.isArray(data) && data.length > 0) {
          const row = data[0];
          const trialActive =
            row.status === 'trial' &&
            !!row.trial_ends &&
            new Date(row.trial_ends).getTime() > Date.now();
          const subscribed = row.status === 'active' || trialActive;
          details = {
            entitled: mode === 'open' ? true : subscribed,
            mode,
            has_subscription: true,
            status: row.status,
            trial_start_date: row.trial_start_date,
            trial_ends: row.trial_ends,
            trial_active: trialActive
          };
        }
      }
    } catch (e: any) {
      console.warn('⚠️ VaniEntitlement details failed (returning mode default):', e.message);
    }

    this.cache.set(tenantId, { details, expires: Date.now() + CACHE_TTL_MS });
    return details;
  }

  async isEntitled(tenantId: string): Promise<boolean> {
    if (this.getMode() === 'open') return true;
    if (!tenantId) return false;
    const details = await this.getDetails(tenantId);
    return details.entitled;
  }
}

export const vaniEntitlementService = new VaniEntitlementService();
export default vaniEntitlementService;
