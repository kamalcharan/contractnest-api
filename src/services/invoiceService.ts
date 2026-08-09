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
}

export const invoiceService = new InvoiceService();
export default invoiceService;
