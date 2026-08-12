// src/services/publicPaymentService.ts
// CNAK-scoped public payment infrastructure — no JWT, no x-tenant-id header.
// Callers authenticate via {cnak, secret_code} only; every RPC here re-checks
// that pair against t_contract_access before touching tenant data (migration
// 032/034). Server-side Supabase client (service role) — same pattern as
// sessionCheckinService.ts.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PublicPaymentResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  [key: string]: any;
}

class PublicPaymentService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false } });
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<PublicPaymentResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: 'Supabase is not configured', code: 'CONFIG' };
    }
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[PublicPaymentService] ${fn} failed:`, error.message);
        return { success: false, error: error.message, code: 'RPC_ERROR' };
      }
      // Every RPC here returns a jsonb {success, ...} envelope itself
      return data as PublicPaymentResult;
    } catch (e: any) {
      console.error(`[PublicPaymentService] ${fn} error:`, e.message);
      return { success: false, error: e.message || 'Unexpected error', code: 'UNEXPECTED' };
    }
  }

  /**
   * Validates CNAK+secret, confirms acceptance_method='payment', idempotently
   * generates the pending invoice, and returns {tenant_id, invoice_id, amount, currency}.
   * Every other public payment method needs this first to resolve tenant_id.
   */
  getPaymentContext(cnak: string, secretCode: string) {
    return this.call('get_public_contract_payment_context', {
      p_cnak: cnak,
      p_secret_code: secretCode,
    });
  }

  getOfflineUpiConfig(cnak: string, secretCode: string) {
    return this.call('get_public_offline_upi_config', {
      p_cnak: cnak,
      p_secret_code: secretCode,
    });
  }

  declarePayment(
    cnak: string,
    secretCode: string,
    payload: { reference: string; amount?: number; declarer_name?: string; declarer_contact?: string }
  ) {
    return this.call('declare_public_contract_payment', {
      p_cnak: cnak,
      p_secret_code: secretCode,
      p_reference: payload.reference,
      p_amount: payload.amount ?? null,
      p_declarer_name: payload.declarer_name ?? null,
      p_declarer_contact: payload.declarer_contact ?? null,
    });
  }

  /**
   * Existence check only — does this tenant have Razorpay (a real online
   * gateway, not offline UPI) actively configured? Explicitly pins
   * p_provider='razorpay': get_tenant_gateway_credentials filters by the
   * shared 'payment_gateway' integration TYPE, which offline_upi also sits
   * under, so an unpinned lookup could match offline_upi and misreport.
   * Never decrypts credentials — only checks the RPC's success flag.
   */
  async checkGatewayConfigured(tenantId: string): Promise<boolean> {
    const supabase = this.client();
    if (!supabase || !tenantId) return false;
    try {
      const { data, error } = await supabase.rpc('get_tenant_gateway_credentials', {
        p_tenant_id: tenantId,
        p_provider: 'razorpay',
      });
      if (error) return false;
      return !!data?.success;
    } catch {
      return false;
    }
  }

  // ── Tenant-side (authenticated) ──
  listDeclarations(tenantId: string, status: string | null = 'pending') {
    return this.call('list_public_payment_declarations', {
      p_tenant_id: tenantId,
      p_status: status,
    });
  }

  confirmDeclaration(declarationId: string, tenantId: string, userId: string, confirm: boolean) {
    return this.call('confirm_public_payment_declaration', {
      p_declaration_id: declarationId,
      p_tenant_id: tenantId,
      p_user_id: userId || null,
      p_confirm: confirm,
    });
  }
}

export default new PublicPaymentService();
