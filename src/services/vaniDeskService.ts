// ============================================================================
// VaNi Desk Service — vani-trial-and-briefing batch
// ============================================================================
// Backend for the real VaNi surfaces (trial start + Briefing feed).
// Follows the vani-composer precedent: server-side Supabase client (service
// role), RPCs do the transactional work:
//   start_vani_trial(p_tenant_id)                       — migration 015
//   get_vani_briefing(p_tenant_id, p_is_live, p_feed_days)
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import vaniEntitlementService from './vaniEntitlementService';

export interface VaniServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

class VaniDeskService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  /**
   * Start (or return the existing) 7-day VaNi trial for the tenant.
   * Idempotent at the DB level (partial unique index + ON CONFLICT DO NOTHING),
   * so double-clicks and retries are safe.
   */
  async startTrial(tenantId: string): Promise<VaniServiceResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }

    try {
      const { data, error } = await supabase.rpc('start_vani_trial', {
        p_tenant_id: tenantId
      });

      if (error) {
        console.error('[VaniDeskService] start_vani_trial failed:', error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      if (!data?.success) {
        return {
          success: false,
          error: { code: data?.error || 'TRIAL_FAILED', message: 'Could not start the VaNi trial' }
        };
      }

      // Entitlement may flip immediately — don't serve a stale cached "no"
      vaniEntitlementService.clearCache(tenantId);

      return { success: true, data };
    } catch (e: any) {
      console.error('[VaniDeskService] startTrial error:', e.message);
      return { success: false, error: { code: 'INTERNAL', message: e.message } };
    }
  }

  /** Automation rules: templates merged with the tenant's config (read is free). */
  async getRules(tenantId: string): Promise<VaniServiceResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }

    try {
      const { data, error } = await supabase.rpc('get_vani_rules', {
        p_tenant_id: tenantId
      });

      if (error) {
        console.error('[VaniDeskService] get_vani_rules failed:', error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      if (!data?.success) {
        return {
          success: false,
          error: { code: data?.error || 'RULES_FAILED', message: 'Could not load the rules' }
        };
      }

      return { success: true, data };
    } catch (e: any) {
      console.error('[VaniDeskService] getRules error:', e.message);
      return { success: false, error: { code: 'INTERNAL', message: e.message } };
    }
  }

  /**
   * Update one rule (validated + bounded in the RPC; optimistic concurrency
   * via expectedVersion). Entitlement is enforced by the controller —
   * "defaults run for everyone; controlling the automation is VaNi".
   */
  async updateRule(
    tenantId: string,
    ruleKey: string,
    config: Record<string, number> | null,
    isEnabled: boolean | null,
    expectedVersion: number | null,
    updatedBy: string | null
  ): Promise<VaniServiceResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }

    try {
      const { data, error } = await supabase.rpc('update_vani_rule', {
        p_tenant_id: tenantId,
        p_rule_key: ruleKey,
        p_config: config,
        p_is_enabled: isEnabled,
        p_expected_version: expectedVersion,
        p_updated_by: updatedBy
      });

      if (error) {
        console.error('[VaniDeskService] update_vani_rule failed:', error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      if (!data?.success) {
        return {
          success: false,
          error: {
            code: data?.error || 'UPDATE_FAILED',
            message:
              data?.error === 'VERSION_CONFLICT'
                ? 'This rule was changed elsewhere — reload and try again'
                : data?.error === 'OUT_OF_BOUNDS'
                  ? `Value for ${data?.field} must be between ${data?.min} and ${data?.max}`
                  : 'Could not update the rule'
          }
        };
      }

      return { success: true, data };
    } catch (e: any) {
      console.error('[VaniDeskService] updateRule error:', e.message);
      return { success: false, error: { code: 'INTERNAL', message: e.message } };
    }
  }

  /** Briefing page payload: header counts + "Needs you" + "What VaNi did". */
  async getBriefing(
    tenantId: string,
    isLive: boolean,
    feedDays: number
  ): Promise<VaniServiceResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }

    try {
      const { data, error } = await supabase.rpc('get_vani_briefing', {
        p_tenant_id: tenantId,
        p_is_live: isLive,
        p_feed_days: feedDays
      });

      if (error) {
        console.error('[VaniDeskService] get_vani_briefing failed:', error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      if (!data?.success) {
        return {
          success: false,
          error: { code: data?.error || 'BRIEFING_FAILED', message: 'Could not load the briefing' }
        };
      }

      return { success: true, data };
    } catch (e: any) {
      console.error('[VaniDeskService] getBriefing error:', e.message);
      return { success: false, error: { code: 'INTERNAL', message: e.message } };
    }
  }
}

export const vaniDeskService = new VaniDeskService();
export default vaniDeskService;
