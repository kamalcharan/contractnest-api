// src/controllers/evidenceController.ts
// ============================================================================
// Evidence Controller — HTTP shape only.
// ============================================================================
// Derives the caller (tenant from x-tenant-id, user from the JWT, environment
// from x-environment), validates the body shape, and maps the RPCs' machine-
// readable `reason` onto an HTTP status the UI can turn into copy. No business
// rules here: who may read, who may write and whether there is room are all
// decided in Postgres.

import { Response } from 'express';
import { Request } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError, ERROR_CODES } from '../utils/apiResponseHelpers';
import evidenceStorageService, { EvidenceScope, AssetKind } from '../services/evidenceStorageService';
import { isConfigured } from '../utils/firebaseStorageAdmin';

// Refusals that are the caller's doing vs. everything else (500).
const REFUSAL_STATUS: Record<string, number> = {
  // 400 — malformed request
  bad_scope: 400,
  bad_asset_kind: 400,
  contract_required: 400,
  file_name_required: 400,
  size_required: 400,
  // 401/403
  actor_required: 401,
  forbidden: 403,
  not_owner: 403,
  not_contract_creator: 403,
  // 404
  contract_not_found: 404,
  evidence_not_found: 404,
  tenant_not_found: 404,
  not_available: 404,
  object_missing: 404,
  // 409 — state
  not_pending: 409,
  // 413/422 — the request is well formed but cannot be honoured
  cap_reached: 413,
  mime_not_allowed: 415,
  // 500 — NEVER 503. This app's axios interceptor treats ANY 503 as
  // "the platform is in maintenance": it writes maintenance_info into
  // sessionStorage, and maintenanceService reads that cache first and returns
  // it forever, with no expiry and no re-validation. One 503 from a single
  // failed upload therefore locks the WHOLE UI behind the maintenance screen
  // for the rest of the browser session — surviving env changes and server
  // restarts, because nothing ever clears the key.
  not_configured: 500,
  sign_failed: 500,
};

const REFUSAL_MESSAGE: Record<string, string> = {
  cap_reached:
    'Storage is full. Top up to add more evidence — the files already uploaded are unaffected.',
  mime_not_allowed: 'That file type cannot be uploaded as evidence.',
  not_contract_creator: 'Only the contract owner can add evidence to it.',
  forbidden: 'You do not have access to this file.',
  object_missing: 'The upload did not complete. Please try again.',
  not_configured:
    'Evidence storage is not configured on this server. The Firebase service-account '
    + 'environment variables (FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are missing.',
};

function fail(res: Response, reason: string, detail?: any): void {
  const status = REFUSAL_STATUS[reason] ?? 500;
  const message = REFUSAL_MESSAGE[reason] ?? reason.replace(/_/g, ' ');
  const code =
    status === 403 ? ERROR_CODES.FORBIDDEN
    : status === 404 ? ERROR_CODES.NOT_FOUND
    : status === 401 ? ERROR_CODES.UNAUTHORIZED
    : status === 409 ? ERROR_CODES.CONFLICT
    : status >= 500 ? ERROR_CODES.INTERNAL_ERROR
    : ERROR_CODES.BAD_REQUEST;

  sendError(res, code, message, status, { details: { reason, ...(detail ? { detail } : {}) } });
}

class EvidenceController {
  private tenantId(req: AuthRequest): string {
    return (req.headers['x-tenant-id'] as string) || '';
  }
  private userId(req: AuthRequest): string | null {
    return req.user?.id || null;
  }
  private isLive(req: AuthRequest | Request): boolean {
    return ((req.headers['x-environment'] as string) || 'live') === 'live';
  }

  // ── POST /api/evidence/slot ───────────────────────────────────────────────
  // Requested at the START of the evidence step, so a technician learns about a
  // full quota before committing effort — not after the visit.
  slot = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!isConfigured()) return fail(res, 'not_configured');

      const {
        scope, contract_id, event_id, form_submission_id, asset_kind,
        file_name, mime_type, size_bytes, is_compressed, original_size_bytes
      } = req.body || {};

      if (!file_name || typeof file_name !== 'string') {
        return fail(res, 'file_name_required');
      }
      if (!mime_type || typeof mime_type !== 'string') {
        return sendError(res, ERROR_CODES.MISSING_REQUIRED_FIELD, 'mime_type is required', 400);
      }
      const size = Number(size_bytes);
      if (!Number.isFinite(size) || size <= 0) {
        return fail(res, 'size_required');
      }

      const result = await evidenceStorageService.requestSlot(
        this.tenantId(req),
        this.userId(req),
        this.isLive(req),
        {
          scope: (scope as EvidenceScope) || 'contract',
          contractId: contract_id || null,
          eventId: event_id || null,
          formSubmissionId: form_submission_id || null,
          assetKind: (asset_kind as AssetKind) || null,
          fileName: file_name,
          mimeType: mime_type,
          sizeBytes: size,
          isCompressed: Boolean(is_compressed),
          originalSizeBytes: original_size_bytes ? Number(original_size_bytes) : null
        }
      );

      if (!result.success) return fail(res, result.reason!, result.detail);
      sendSuccess(res, result.data, 201);
    } catch (error: any) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, error?.message || 'Failed to request an upload slot', 500);
    }
  };

  // ── POST /api/evidence/:evidenceId/confirm ────────────────────────────────
  // Verifies the object really exists and records its TRUE size.
  confirm = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await evidenceStorageService.confirm(this.tenantId(req), req.params.evidenceId);
      if (!result.success) return fail(res, result.reason!, result.detail);
      sendSuccess(res, result.data);
    } catch (error: any) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, error?.message || 'Failed to confirm the upload', 500);
    }
  };

  // ── GET /api/evidence/:evidenceId/url ─────────────────────────────────────
  // Short-TTL, minted fresh per viewer per request, never persisted.
  readUrl = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await evidenceStorageService.readUrl(
        req.params.evidenceId, this.tenantId(req), null, null
      );
      if (!result.success) return fail(res, result.reason!, result.detail);
      res.set('Cache-Control', 'no-store');
      sendSuccess(res, result.data);
    } catch (error: any) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, error?.message || 'Failed to create a read URL', 500);
    }
  };

  // ── GET /api/evidence/contract/:contractId ────────────────────────────────
  listForContract = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await evidenceStorageService.listForContract(
        this.tenantId(req), req.params.contractId, null, null, this.isLive(req)
      );
      if (!result.success) return fail(res, result.reason!, result.detail);
      sendSuccess(res, result.data);
    } catch (error: any) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, error?.message || 'Failed to list evidence', 500);
    }
  };

  // ── DELETE /api/evidence/:evidenceId ──────────────────────────────────────
  // Marks the row; the StorageCleanup sweeper reclaims the bytes.
  remove = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await evidenceStorageService.remove(this.tenantId(req), req.params.evidenceId);
      if (!result.success) return fail(res, result.reason!, result.detail);
      sendSuccess(res, result.data);
    } catch (error: any) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, error?.message || 'Failed to delete evidence', 500);
    }
  };

  // ── GET /api/evidence/usage ───────────────────────────────────────────────
  usage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await evidenceStorageService.usage(this.tenantId(req));
      if (!result.success) return fail(res, result.reason!, result.detail);
      sendSuccess(res, result.data);
    } catch (error: any) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, error?.message || 'Failed to read storage usage', 500);
    }
  };

  // ── POST /api/evidence/contract/:contractId/revoke-access ─────────────────
  // Turning a CNAK off also revokes files already delivered, because the URLs
  // handed out were short-lived and nothing durable was ever shared.
  revokeAccess = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await evidenceStorageService.revokeAccess(
        this.tenantId(req), req.params.contractId, req.body?.cnak || null
      );
      if (!result.success) return fail(res, result.reason!, result.detail);
      sendSuccess(res, result.data);
    } catch (error: any) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, error?.message || 'Failed to revoke access', 500);
    }
  };

  // ══ PUBLIC (CNAK) ═════════════════════════════════════════════════════════
  // The counterparty who has never used ContractNest: they follow the link they
  // were sent and verify what they are paying for. No account, same object.

  publicList = async (req: Request, res: Response): Promise<void> => {
    try {
      const { cnak, secret, contractId } = req.params;
      const result = await evidenceStorageService.listForContract(
        null, contractId, cnak, secret, this.isLive(req)
      );
      if (!result.success) return fail(res, result.reason!, result.detail);
      sendSuccess(res, result.data);
    } catch (error: any) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, error?.message || 'Failed to list evidence', 500);
    }
  };

  publicReadUrl = async (req: Request, res: Response): Promise<void> => {
    try {
      const { cnak, secret, evidenceId } = req.params;
      const result = await evidenceStorageService.readUrl(evidenceId, null, cnak, secret);
      if (!result.success) return fail(res, result.reason!, result.detail);
      sendSuccess(res, result.data);
    } catch (error: any) {
      sendError(res, ERROR_CODES.INTERNAL_ERROR, error?.message || 'Failed to create a read URL', 500);
    }
  };
}

export default new EvidenceController();
