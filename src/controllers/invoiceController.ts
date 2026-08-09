// ============================================================================
// Invoice Controller — standalone (non-contract-scoped) invoice operations
// ============================================================================
// tenant/environment come from headers (authenticate middleware runs before
// us), mirroring groupSessionsDashboardController's convention.
// ============================================================================

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError, ERROR_CODES } from '../utils/apiResponseHelpers';
import invoiceService from '../services/invoiceService';

interface AdhocLineItemInput {
  block_id?: string | null;
  name?: string;
  qty?: number;
  unit_price?: number;
  amount?: number;
}

class InvoiceController {
  private tenantId(req: AuthRequest): string {
    return (req.headers['x-tenant-id'] as string) || '';
  }

  private isLive(req: AuthRequest): boolean {
    return ((req.headers['x-environment'] as string) || 'live') === 'live';
  }

  /** POST /api/invoices/adhoc — create a contact-less invoice, settled at creation */
  createAdhocInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    if (!tenantId) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400);
      return;
    }

    const { contact_id, currency, line_items, tax_amount, payment_method, payment_date, reference_number, notes, declaration_id } =
      req.body || {};

    if (!contact_id) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'contact_id is required', 400);
      return;
    }
    if (!Array.isArray(line_items) || line_items.length === 0) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'At least one line item is required', 400);
      return;
    }
    const cleanItems = (line_items as AdhocLineItemInput[]).map((li) => ({
      block_id: li.block_id ?? null,
      name: String(li.name || '').trim(),
      qty: Number(li.qty) || 1,
      unit_price: Number(li.unit_price) || 0,
      amount: Number(li.amount) || 0,
    }));
    if (cleanItems.some((li) => !li.name || li.amount <= 0)) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Each line item needs a name and a positive amount', 400);
      return;
    }
    if (!payment_method) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'payment_method is required', 400);
      return;
    }

    const result = await invoiceService.createAdhocInvoice({
      tenantId,
      contactId: contact_id,
      isLive: this.isLive(req),
      currency: currency || 'INR',
      lineItems: cleanItems,
      taxAmount: Number(tax_amount) || 0,
      paymentMethod: payment_method,
      paymentDate: payment_date || null,
      referenceNumber: reference_number || null,
      notes: notes || null,
      createdBy: req.user?.id || null,
      declarationId: declaration_id || null,
    });

    if (!result.success) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to create invoice', 500);
      return;
    }

    // The RPC self-reports success/failure inside its jsonb payload (same
    // convention as every gs_* RPC) — a business-logic failure (e.g. contact
    // not found, empty total) surfaces here, not as a Supabase-level error.
    if (result.data && result.data.success === false) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, result.data.error || 'Failed to create invoice', 400);
      return;
    }

    sendSuccess(res, result.data?.data ?? result.data, 201);
  };
}

export default new InvoiceController();
