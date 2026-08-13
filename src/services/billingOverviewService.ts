// src/services/billingOverviewService.ts
//
// One read behind the Subscription page and the Billing page.
//
// Calls get_tenant_billing_overview (migration 038) directly with the
// service-role client rather than hopping through the billing Edge function
// — the same pattern publicPaymentService.ts and sessionCheckinService.ts
// already use. It is a pure read of tables that already exist, so the extra
// network hop and the extra deploy step buy nothing.
//
// NOTHING about contracts, invoices or receipts is created here. The Pay
// action on these pages reuses the existing checkout end to end:
//   useCreateOrder -> payment-gateway -> verify_gateway_payment
//     -> record_invoice_payment   (the single money-writer)
// This service only tells the UI which invoice to point that at.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface BillingOverviewResult {
  success: boolean;
  error?: string;
  code?: string;
  [key: string]: any;
}

class BillingOverviewService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false } });
  }

  /**
   * p_tenant_id is the SUBSCRIBER — always taken from the authenticated
   * x-tenant-id header by the controller, never from the request body, so a
   * tenant cannot read another tenant's billing by tampering with a payload.
   */
  async getOverview(tenantId: string): Promise<BillingOverviewResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: 'Supabase is not configured', code: 'CONFIG' };
    }
    if (!tenantId) {
      return { success: false, error: 'tenant_id is required', code: 'VALIDATION_ERROR' };
    }

    try {
      const { data, error } = await supabase.rpc('get_tenant_billing_overview', {
        p_tenant_id: tenantId,
      });

      if (error) {
        console.error('[BillingOverviewService] rpc failed:', error.message);
        return { success: false, error: error.message, code: 'RPC_ERROR' };
      }

      // The RPC returns its own {success, ...} envelope.
      return data as BillingOverviewResult;
    } catch (e: any) {
      console.error('[BillingOverviewService] error:', e?.message);
      return { success: false, error: e?.message || 'Unexpected error', code: 'UNEXPECTED' };
    }
  }
}

export const billingOverviewService = new BillingOverviewService();
export default billingOverviewService;
