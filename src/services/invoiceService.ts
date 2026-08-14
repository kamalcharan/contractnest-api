// ============================================================================
// Invoice Service — standalone (non-contract-scoped) invoice operations
// ============================================================================
// Contract-linked invoices are still created server-side (run_contract_event_scanner)
// and paid via contractService.recordPayment (edge-function proxy). This service
// is for the newer contact-less path: create_adhoc_invoice (bbb-foundation/adhoc-invoice)
// creates an invoice + settling receipt in one transaction, no contract required.
// Same direct-RPC pattern as groupSessionsDashboardService — the SECURITY DEFINER
// RPC owns all validation/logic; this service only forwards tenant/actor/payload.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface InvoiceServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

class InvoiceService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<InvoiceServiceResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[InvoiceService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[InvoiceService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  /**
   * Create a contact-less invoice, settled at creation (invoice + receipt in
   * one transaction — see create_adhoc_invoice). lineItems are server-totalled;
   * the RPC never trusts a client-sent total.
   */
  createAdhocInvoice(params: {
    tenantId: string;
    contactId: string;
    isLive: boolean;
    currency: string;
    lineItems: Array<{ block_id?: string | null; name: string; qty: number; unit_price: number; amount: number }>;
    taxAmount?: number;
    paymentMethod: string;
    paymentDate?: string | null;
    referenceNumber?: string | null;
    notes?: string | null;
    createdBy?: string | null;
    /** Group Session declaration this invoice settles, if any — stamped
     * onto t_session_payment_declarations.adhoc_invoice_id in the same
     * transaction as the invoice/receipt. */
    declarationId?: string | null;
  }) {
    return this.call('create_adhoc_invoice', {
      p_payload: {
        tenant_id: params.tenantId,
        contact_id: params.contactId,
        is_live: params.isLive,
        currency: params.currency,
        line_items: params.lineItems,
        tax_amount: params.taxAmount ?? 0,
        payment_method: params.paymentMethod,
        payment_date: params.paymentDate ?? null,
        reference_number: params.referenceNumber ?? null,
        notes: params.notes ?? null,
        created_by: params.createdBy ?? null,
        declaration_id: params.declarationId ?? null,
      },
    });
  }

  /**
   * One invoice as a complete document — header, line items, receipts and
   * the bill-to contact. Contract-optional, so it serves ad-hoc invoices
   * (which have no contract to hang a viewer off) and contract-linked ones
   * through the same page. See bbb-foundation/069.
   */
  getInvoiceDetail(params: { tenantId: string; invoiceId: string; isLive: boolean }) {
    return this.call('get_invoice_detail', {
      p_tenant: params.tenantId,
      p_invoice: params.invoiceId,
      p_is_live: params.isLive,
    });
  }

  /**
   * The tenant's offline UPI settings for THIS environment. Shared body behind
   * the public CNAK and check-in-token variants (bbb-foundation/071) — this is
   * the authenticated door onto it. Generic: tenant + environment only.
   */
  getTenantPaymentConfig(params: { tenantId: string; isLive: boolean }) {
    return this.call('get_tenant_payment_config', {
      p_tenant: params.tenantId,
      p_is_live: params.isLive,
    });
  }

  /**
   * Queue ONE invoice notification. The RPC owns every refusal (rule off,
   * cancelled, nothing owed, no address…) and returns {ok:false, reason}
   * rather than throwing — so the caller can show the user WHY nothing was
   * sent instead of a generic failure.
   *
   * paymentLink / qrUrl are decided by the CALLER, mirroring how
   * getPublicPaymentContext resolves collection: gateway short URL when
   * Razorpay is configured, the UPI intent/QR when it is not, neither when
   * the tenant cannot collect at all. The RPC stays free of gateway knowledge.
   */
  sendInvoice(params: {
    tenantId: string;
    invoiceId: string;
    channel: 'email' | 'whatsapp';
    userId?: string | null;
    dryRun?: boolean;
    paymentLink?: string | null;
    qrUrl?: string | null;
    upiId?: string | null;
  }) {
    return this.call('fn_enqueue_invoice_notification', {
      p_tenant: params.tenantId,
      p_invoice: params.invoiceId,
      p_channel: params.channel,
      p_user: params.userId ?? null,
      p_dry_run: params.dryRun ?? false,
      p_payment_link: params.paymentLink ?? null,
      p_qr_url: params.qrUrl ?? null,
      p_upi_id: params.upiId ?? null,
    });
  }
}

export const invoiceService = new InvoiceService();
export default invoiceService;
