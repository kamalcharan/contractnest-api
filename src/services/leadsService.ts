// ============================================================================
// Leads Service — contacts tagged 'lead' + t_contact_interests (migration 039)
// ============================================================================
// Thin RPC wrappers over get_leads / lead_capture / lead_set_stage. Service
// role client; every call carries the tenant explicitly.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface LeadsResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface LeadsFilters {
  tab?: 'reach' | 'asked';
  stage?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

class LeadsService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<LeadsResult> {
    const supabase = this.client();
    if (!supabase) return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[LeadsService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      if (data && data.success === false) {
        return { success: false, error: { code: data.error_code || 'REFUSED', message: data.error || 'Request refused' }, data };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[LeadsService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  list(tenantId: string, isLive: boolean, f: LeadsFilters) {
    return this.call('get_leads', {
      p_tenant_id: tenantId, p_is_live: isLive, p_tab: f.tab || 'reach', p_stage: f.stage || null,
      p_q: f.q || null, p_limit: f.limit ?? 50, p_offset: f.offset ?? 0,
    });
  }
  capture(tenantId: string, isLive: boolean, contact: Record<string, unknown>, interest: Record<string, unknown>, actor: Record<string, unknown> | null) {
    return this.call('lead_capture', { p_tenant_id: tenantId, p_is_live: isLive, p_contact: contact, p_interest: interest, p_actor: actor });
  }
  setStage(tenantId: string, interestId: string, stage: string | null, note: string | null, actorName: string | null) {
    return this.call('lead_set_stage', { p_tenant_id: tenantId, p_interest_id: interestId, p_stage: stage, p_note: note, p_actor_name: actorName });
  }
}

export default new LeadsService();
