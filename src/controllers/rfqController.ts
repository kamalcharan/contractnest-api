// ============================================================================
// RFQ Controller — vendor quote responses + buyer award
// ============================================================================
// Public endpoints (cnak + secret in the URL, no auth) drive the vendor quote
// page; the award endpoint is authenticated + x-tenant-id. Thin — the RPCs own
// the logic, including every ownership and state check.
// ============================================================================

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import rfqService from '../services/rfqService';
import { sendSuccess, sendError, ERROR_CODES } from '../utils/apiResponseHelpers';

// Map the RPC's own error codes onto HTTP status. Anything unmapped is a 500,
// which is the honest answer for "we did not anticipate this".
const STATUS_FOR: Record<string, number> = {
  MISSING_CREDENTIALS: 400,
  INVALID_LINK: 404,
  RFQ_CLOSED: 409,
  AMOUNT_REQUIRED: 400,
  NOT_FOUND: 404,
  VENDOR_NOT_ON_RFQ: 404,
  NO_QUOTE: 409,
};

class RfqController {
  private tenantId(req: AuthRequest): string {
    return (req.headers['x-tenant-id'] as string) || '';
  }

  private fail(res: Response, err?: { code: string; message: string }, fallback = 'Request failed') {
    const code = err?.code || 'RFQ_ERROR';
    const status = STATUS_FOR[code] ?? 500;
    // The RPC's message is written for the vendor to read — pass it through
    // rather than replacing it with a generic string.
    sendError(
      res,
      status === 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.VALIDATION_ERROR,
      err?.message || fallback,
      status
    );
  }

  // ── public (cnak + secret) ──────────────────────────────────────────────

  // GET /api/quote/:cnak/:secret
  resolve = async (req: Request, res: Response): Promise<void> => {
    const { cnak, secret } = req.params;
    if (!cnak || !secret) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'This link is incomplete', 400);
      return;
    }
    const result = await rfqService.resolveForVendor(cnak, secret);
    if (!result.success) { this.fail(res, result.error, 'Failed to open request'); return; }
    sendSuccess(res, result.data);
  };

  // POST /api/quote/:cnak/:secret
  submit = async (req: Request, res: Response): Promise<void> => {
    const { cnak, secret } = req.params;
    if (!cnak || !secret) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'This link is incomplete', 400);
      return;
    }

    const b = req.body || {};
    const decline = b.decline === true;

    // A quote needs either a figure or a breakdown; the RPC computes the
    // headline from the breakdown when only that is given. Validated there
    // too — this is the early, friendlier copy of the same rule.
    if (!decline) {
      const hasAmount = b.quoted_amount !== undefined && b.quoted_amount !== null && b.quoted_amount !== '';
      const hasBreakdown = Array.isArray(b.breakdown) && b.breakdown.length > 0;
      if (!hasAmount && !hasBreakdown) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Enter a quote amount, or price the individual items', 400);
        return;
      }
      if (hasAmount && (Number.isNaN(Number(b.quoted_amount)) || Number(b.quoted_amount) <= 0)) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Enter a quote amount greater than zero', 400);
        return;
      }
    }

    const result = await rfqService.submitQuote(cnak, secret, {
      quoted_amount: decline ? null : (b.quoted_amount === undefined || b.quoted_amount === null || b.quoted_amount === '' ? null : Number(b.quoted_amount)),
      quote_notes: b.quote_notes ?? null,
      breakdown: Array.isArray(b.breakdown) && b.breakdown.length > 0 ? b.breakdown : null,
      valid_until: b.valid_until ?? null,
      decline,
      decline_reason: b.decline_reason ?? null,
    });

    if (!result.success) { this.fail(res, result.error, 'Failed to submit quote'); return; }
    sendSuccess(res, result.data);
  };

  // ── authenticated (buyer) ───────────────────────────────────────────────

  // POST /api/rfq/:contractId/award   body: { vendor_id, note? }
  award = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    const contractId = req.params.contractId;
    const vendorId = req.body?.vendor_id as string;

    if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
    if (!contractId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'contractId is required', 400); return; }
    if (!vendorId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'vendor_id is required', 400); return; }

    const userId = req.user?.id || req.user?.user_id || null;
    const userName = req.user?.name || req.user?.full_name || req.user?.email || null;

    const result = await rfqService.award(
      contractId,
      tenantId,
      vendorId,
      userId,
      userName,
      (req.body?.note as string) || null
    );

    if (!result.success) { this.fail(res, result.error, 'Failed to award RFQ'); return; }
    sendSuccess(res, result.data);
  };
}

export default new RfqController();
