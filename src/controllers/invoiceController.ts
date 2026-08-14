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
import publicPaymentService from '../services/publicPaymentService';
import PaymentGatewayService from '../services/paymentGatewayService';

interface AdhocLineItemInput {
  block_id?: string | null;
  name?: string;
  qty?: number;
  unit_price?: number;
  amount?: number;
}

class InvoiceController {
  // Instantiated like paymentGatewayController does — the service is a class,
  // not a shared singleton.
  private paymentGatewayService = new PaymentGatewayService();

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

  /** GET /api/invoices/:id — one invoice as a document (contract-optional) */
  getInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    const invoiceId = req.params.id;
    if (!tenantId || !invoiceId) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant and invoice id are required', 400);
      return;
    }
    const result = await invoiceService.getInvoiceDetail({ tenantId, invoiceId, isLive: this.isLive(req) });
    if (!result.success) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to load invoice', 500);
      return;
    }
    if (result.data && result.data.success === false) {
      sendError(res, ERROR_CODES.NOT_FOUND, result.data.error || 'Invoice not found', 404);
      return;
    }
    sendSuccess(res, result.data?.data ?? result.data);
  };

  /**
   * POST /api/invoices/:id/send   { channel: 'email' | 'whatsapp' }
   *
   * How the payer is actually going to pay is resolved here, mirroring
   * contractController.getPublicPaymentContext — the app's existing single
   * source of truth for whether a tenant can collect:
   *
   *   Razorpay configured → mint a payment link (gateway_short_url)
   *   else offline UPI    → a upi:// intent, plus the tenant's QR image on
   *                         WhatsApp when one has been uploaded
   *   neither             → send anyway, carrying no pay line
   *
   * That last case is deliberate: a tenant with no payment integration must
   * still be able to invoice and capture payment offline. Nothing here is
   * gated on the gateway — the invoice screen shows a banner pointing at
   * /settings/integrations instead.
   *
   * Generic throughout: tenant and environment come from headers (auth
   * context), never from the body, and no tenant is special-cased.
   */
  sendInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    const invoiceId = req.params.id;
    const isLive = this.isLive(req);
    const channel = (req.body?.channel || 'email') as 'email' | 'whatsapp';

    if (!tenantId || !invoiceId) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant and invoice id are required', 400);
      return;
    }
    if (!['email', 'whatsapp'].includes(channel)) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'channel must be email or whatsapp', 400);
      return;
    }

    let paymentLink: string | null = null;
    let qrUrl: string | null = null;
    let upiId: string | null = null;

    try {
      const gatewayConfigured = await publicPaymentService.checkGatewayConfigured(tenantId);

      if (gatewayConfigured) {
        // Amount and customer are resolved by the RPC, not trusted from the
        // client, so ask it first with a dry run — it also tells us up front
        // if the send would be refused, before we mint a link nobody uses.
        const preview = await invoiceService.sendInvoice({
          tenantId, invoiceId, channel, userId: req.user?.id || null, dryRun: true,
        });
        const p = preview.data;
        if (p?.ok) {
          const { userJWT, userId, environment } = this.gatewayContext(req);
          const link = await this.paymentGatewayService.createLink(
            {
              invoice_id: invoiceId,
              amount: Number(p.amount),
              currency: p.currency,
              collection_mode: channel === 'whatsapp' ? 'whatsapp_link' : 'email_link',
              customer: { name: p.recipient_name, [channel === 'whatsapp' ? 'contact' : 'email']: p.recipient_contact },
              description: `Invoice ${p.invoice_number}`,
              expire_hours: 48,
            },
            userJWT, tenantId, userId, environment
          );
          paymentLink = (link as any)?.data?.gateway_short_url || (link as any)?.gateway_short_url || null;
        }
      } else {
        const cfg = await invoiceService.getTenantPaymentConfig({ tenantId, isLive });
        if (cfg.data?.configured) {
          // Same upi:// intent shape the check-in page uses, including the
          // mc=0000 merchant category NPCI's spec requires.
          const vpa = encodeURIComponent(cfg.data.upi_id);
          const pn = encodeURIComponent(cfg.data.payee_name || '');
          paymentLink = `upi://pay?pa=${vpa}&pn=${pn}&cu=INR&mc=0000`;
          qrUrl = cfg.data.qr_image_url || null;
          // The raw upi:// scheme is unusable inside a message body, so the
          // VPA travels separately and the RPC shows that instead.
          upiId = cfg.data.upi_id || null;
        }
      }
    } catch (e: any) {
      // A link we could not mint must never lose the invoice. Fall through
      // and send without one — the amount, number and due date still reach
      // the payer, and offline capture is unaffected.
      console.error('[InvoiceController] payment link resolution failed:', e?.message);
    }

    const result = await invoiceService.sendInvoice({
      tenantId, invoiceId, channel, userId: req.user?.id || null,
      paymentLink, qrUrl, upiId,
    });

    if (!result.success) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to send invoice', 500);
      return;
    }
    // The RPC reports every refusal as {ok:false, reason, message} so the user
    // is told WHY nothing was sent — a silent no-op reads as success.
    if (result.data && result.data.ok === false) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR,
        result.data.message || result.data.reason || 'Invoice could not be sent', 400,
        { details: { reason: result.data.reason, rule_key: result.data.rule_key } });
      return;
    }
    sendSuccess(res, { ...result.data, payment_link: paymentLink, qr_url: qrUrl });
  };

  /** Same shape paymentGatewayController.extractContext builds. */
  private gatewayContext(req: AuthRequest) {
    return {
      userJWT: (req.headers.authorization as string)?.replace('Bearer ', '') || '',
      userId: req.user?.id || '',
      environment: ((req.headers['x-environment'] as string) || 'live'),
    };
  }
}

export default new InvoiceController();
