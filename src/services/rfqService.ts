// ============================================================================
// RFQ Service — vendor quote responses + buyer award
// ============================================================================
// Server-side Supabase client (service role); the SECURITY DEFINER RPCs added
// in migration 072_rfq_cycle own the logic. This is deliberately thin.
//
// Two audiences, two trust levels:
//   * The VENDOR is not a tenant and never will be. They arrive with a
//     (cnak, secret) pair from a link — the same shape the public check-in page
//     uses. rfq_resolve_for_vendor / rfq_submit_quote validate that pair and
//     scope every read to the caller's own row.
//   * The BUYER is an authenticated tenant. rfq_award is called behind
//     authenticate + x-tenant-id, and the RPC re-checks tenant ownership
//     rather than trusting the header.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface RfqServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

class RfqService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<RfqServiceResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[RfqService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      // The RPCs return their own { success, error, error_code } envelope.
      // Surface a business failure as a failure rather than a 200 with a
      // success:false body the caller has to remember to check.
      if (data && data.success === false) {
        return {
          success: false,
          error: { code: data.error_code || 'RFQ_ERROR', message: data.error || 'Request failed' },
        };
      }
      return { success: true, data: data?.data ?? data };
    } catch (e: any) {
      console.error(`[RfqService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  // ── vendor-facing (cnak + secret, no auth) ──────────────────────────────

  resolveForVendor(cnak: string, secret: string) {
    return this.call('rfq_resolve_for_vendor', { p_cnak: cnak, p_secret: secret });
  }

  submitQuote(
    cnak: string,
    secret: string,
    payload: {
      quoted_amount?: number | null;
      quote_notes?: string | null;
      breakdown?: unknown[] | null;
      valid_until?: string | null;
      decline?: boolean;
      decline_reason?: string | null;
    }
  ) {
    return this.call('rfq_submit_quote', {
      p_cnak: cnak,
      p_secret: secret,
      p_quoted_amount: payload.quoted_amount ?? null,
      p_quote_notes: payload.quote_notes ?? null,
      p_breakdown: payload.breakdown ?? null,
      p_valid_until: payload.valid_until ?? null,
      p_decline: payload.decline === true,
      p_decline_reason: payload.decline_reason ?? null,
    });
  }

  // ── buyer-facing (authenticated) ────────────────────────────────────────

  award(
    contractId: string,
    tenantId: string,
    vendorId: string,
    userId: string | null,
    userName: string | null,
    note: string | null
  ) {
    return this.call('rfq_award', {
      p_contract_id: contractId,
      p_tenant_id: tenantId,
      p_vendor_id: vendorId,
      p_user_id: userId,
      p_user_name: userName,
      p_note: note,
    });
  }
}

export default new RfqService();
