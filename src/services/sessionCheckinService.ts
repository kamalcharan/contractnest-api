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
  checkinForm(token: string) {
    return this.call('gs_checkin_form', { p_token: token });
  }
  paymentConfig(token: string) {
    return this.call('gs_checkin_payment_config', { p_token: token });
  }
  guestCheckin(token: string, payload: {
    name: string; phone?: string | null; company?: string | null; email?: string | null;
    status?: string; responses?: Record<string, unknown> | null;
    form_template_id?: string | null; form_template_version?: number | null;
  }) {
    return this.call('gs_checkin_guest', {
      p_token: token,
      p_name: payload.name,
      p_phone: payload.phone ?? null,
      p_company: payload.company ?? null,
      p_email: payload.email ?? null,
      p_status: payload.status ?? 'present',
      p_responses: payload.responses ?? null,
      p_form_template_id: payload.form_template_id ?? null,
      p_form_template_version: payload.form_template_version ?? null,
    });
  }
  substituteCheckin(token: string, payload: {
    member_id: string; sub_name: string; sub_phone?: string | null;
    status?: string; responses?: Record<string, unknown> | null;
    form_template_id?: string | null; form_template_version?: number | null;
  }) {
    return this.call('gs_checkin_substitute', {
      p_token: token,
      p_member: payload.member_id,
      p_sub_name: payload.sub_name,
      p_sub_phone: payload.sub_phone ?? null,
      p_status: payload.status ?? 'present',
      p_responses: payload.responses ?? null,
      p_form_template_id: payload.form_template_id ?? null,
      p_form_template_version: payload.form_template_version ?? null,
    });
  }
  submit(token: string, payload: {
    member_id?: string | null; member_name?: string | null; member_phone?: string | null;
    status?: string; payment?: Record<string, unknown> | null;
    responses?: Record<string, unknown> | null;
    form_template_id?: string | null; form_template_version?: number | null;
  }) {
    return this.call('gs_submit_checkin', {
      p_token: token,
      p_member: payload.member_id ?? null,
      p_member_name: payload.member_name ?? null,
      p_member_phone: payload.member_phone ?? null,
      p_status: payload.status ?? 'present',
      p_payment: payload.payment ?? null,
      p_responses: payload.responses ?? null,
      p_form_template_id: payload.form_template_id ?? null,
      p_form_template_version: payload.form_template_version ?? null,
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
