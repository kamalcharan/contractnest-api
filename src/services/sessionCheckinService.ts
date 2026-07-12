// ============================================================================
// Session Check-in Service — Group Session attendance + BAU dues (Batch 3)
// ============================================================================
// Server-side Supabase client (service role); the SECURITY DEFINER RPCs
// (migration 017) own the logic. Public check-in RPCs are gated by an opaque
// token; chair RPCs are called behind authenticate + x-tenant-id.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface CheckinServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

class SessionCheckinService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<CheckinServiceResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[SessionCheckinService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[SessionCheckinService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  // ── public (token-gated) ──
  resolve(token: string) {
    return this.call('gs_resolve_checkin', { p_token: token });
  }
  lookupMember(token: string, phone: string) {
    return this.call('gs_lookup_member', { p_token: token, p_phone: phone });
  }
  memberHistory(token: string, memberId: string) {
    return this.call('gs_member_history', { p_token: token, p_member: memberId });
  }
  submit(token: string, payload: {
    member_id?: string | null; member_name?: string | null; member_phone?: string | null;
    status?: string; payment?: Record<string, unknown> | null;
  }) {
    return this.call('gs_submit_checkin', {
      p_token: token,
      p_member: payload.member_id ?? null,
      p_member_name: payload.member_name ?? null,
      p_member_phone: payload.member_phone ?? null,
      p_status: payload.status ?? 'present',
      p_payment: payload.payment ?? null,
    });
  }

  // ── chair (authenticated) ──
  ensureToken(tenantId: string, contractId: string) {
    return this.call('gs_ensure_token', { p_tenant: tenantId, p_contract: contractId });
  }
  pendingDeclarations(tenantId: string) {
    return this.call('gs_pending_declarations', { p_tenant: tenantId });
  }
  confirmDeclaration(tenantId: string, declarationId: string, confirm: boolean, userId: string) {
    return this.call('gs_confirm_declaration', {
      p_tenant: tenantId, p_declaration: declarationId, p_confirm: confirm, p_user: userId,
    });
  }
}

export default new SessionCheckinService();
