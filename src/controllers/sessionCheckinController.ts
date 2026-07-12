// ============================================================================
// Session Check-in Controller — Group Session attendance + BAU dues (Batch 3)
// ============================================================================
// Public endpoints (token in the URL, no auth) drive the member check-in page;
// chair endpoints (authenticate + x-tenant-id) mint tokens and confirm the
// declared BAU payments. Thin — the RPCs own the logic.
// ============================================================================

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import sessionCheckinService from '../services/sessionCheckinService';
import { sendSuccess, sendError, ERROR_CODES } from '../utils/apiResponseHelpers';

class SessionCheckinController {
  // ── public (token-gated) ──
  resolve = async (req: Request, res: Response): Promise<void> => {
    const token = req.params.token;
    if (!token) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'token is required', 400); return; }
    const result = await sessionCheckinService.resolve(token);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to resolve check-in', 500); return; }
    sendSuccess(res, result.data);
  };

  lookup = async (req: Request, res: Response): Promise<void> => {
    const token = req.params.token;
    const phone = (req.body?.phone as string) || '';
    if (!token) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'token is required', 400); return; }
    if (!phone) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'phone is required', 400); return; }
    const result = await sessionCheckinService.lookupMember(token, phone);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Lookup failed', 500); return; }
    sendSuccess(res, result.data);
  };

  history = async (req: Request, res: Response): Promise<void> => {
    const { token, memberId } = req.params;
    if (!token || !memberId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'token and memberId are required', 400); return; }
    const result = await sessionCheckinService.memberHistory(token, memberId);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to load history', 500); return; }
    sendSuccess(res, result.data);
  };

  submit = async (req: Request, res: Response): Promise<void> => {
    const token = req.params.token;
    if (!token) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'token is required', 400); return; }
    const b = req.body || {};
    const result = await sessionCheckinService.submit(token, {
      member_id: b.member_id ?? null,
      member_name: b.member_name ?? null,
      member_phone: b.member_phone ?? null,
      status: b.status === 'apologies' ? 'apologies' : 'present',
      payment: b.payment ?? null,
    });
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Check-in failed', 500); return; }
    // RPC-level failures (invalid token / no session today) come back as { ok:false, reason }
    if (result.data && result.data.ok === false) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, result.data.reason || 'Check-in not possible', 422);
      return;
    }
    sendSuccess(res, result.data);
  };

  // ── chair (authenticated) ──
  private tenantId(req: AuthRequest): string {
    return (req.headers['x-tenant-id'] as string) || '';
  }

  ensureToken = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    const contractId = req.body?.contract_id as string;
    if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
    if (!contractId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'contract_id is required', 400); return; }
    const result = await sessionCheckinService.ensureToken(tenantId, contractId);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to create token', 500); return; }
    sendSuccess(res, result.data);
  };

  pendingDeclarations = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
    const result = await sessionCheckinService.pendingDeclarations(tenantId);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to load declarations', 500); return; }
    sendSuccess(res, result.data);
  };

  confirmDeclaration = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    const declarationId = req.params.id;
    const confirm = req.body?.confirm !== false; // default true
    const userId = req.user?.id || '';
    if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
    if (!declarationId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'declaration id is required', 400); return; }
    const result = await sessionCheckinService.confirmDeclaration(tenantId, declarationId, confirm, userId);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to confirm', 500); return; }
    sendSuccess(res, result.data);
  };
}

export default new SessionCheckinController();
