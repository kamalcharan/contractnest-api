// ============================================================================
// Sandbox Controller — clear a tenant's transactional data
// ============================================================================
// Authenticated; the tenant comes from x-tenant-id, so a caller can only ever
// reset their OWN tenant. Thin — the RPCs own the deletes.

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import sandboxService from '../services/sandboxService';
import { sendSuccess, sendError, ERROR_CODES } from '../utils/apiResponseHelpers';

class SandboxController {
  private tenantId(req: AuthRequest): string {
    return (req.headers['x-tenant-id'] as string) || '';
  }

  // The environment header decides which slice of data we ever see or delete.
  // is_live=true → Live, false → Test/Sandbox. Default to Live (the safe read:
  // it shows/deletes Live only if that is genuinely the active environment).
  private isLive(req: AuthRequest): boolean {
    const environment = (req.headers['x-environment'] as string) || 'live';
    return environment === 'live';
  }

  preview = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
    const result = await sandboxService.preview(tenantId, this.isLive(req));
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to load preview', 500); return; }
    sendSuccess(res, result.data);
  };

  reset = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
    const body = req.body || {};
    const includeContacts = body.include_contacts === true;
    const includeEquipment = body.include_equipment === true;
    const result = await sandboxService.reset(tenantId, this.isLive(req), includeContacts, includeEquipment);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Reset failed', 500); return; }
    sendSuccess(res, result.data);
  };
}

export default new SandboxController();
