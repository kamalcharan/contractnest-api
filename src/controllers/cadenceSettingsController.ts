// ============================================================================
// Cadence Settings Controller — Group Session / smart Service Cycles (batch 2a)
// ============================================================================
// Tenant-scoped holiday calendar + default shift policy. Tenant comes from the
// x-tenant-id header (authenticate middleware runs first). Thin — the RPCs own
// the logic.
// ============================================================================

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import cadenceSettingsService from '../services/cadenceSettingsService';
import { sendSuccess, sendError, ERROR_CODES } from '../utils/apiResponseHelpers';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

class CadenceSettingsController {
  private tenantId(req: AuthRequest): string {
    return (req.headers['x-tenant-id'] as string) || '';
  }

  getSettings = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
    const result = await cadenceSettingsService.getSettings(tenantId);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to load cadence settings', 500); return; }
    sendSuccess(res, result.data);
  };

  updateSettings = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }

    const body = req.body || {};
    const weeklyHolidays = Array.isArray(body.weekly_holidays) ? body.weekly_holidays : [];
    const defaultShift = body.default_shift;

    if (!weeklyHolidays.every((d: unknown) => typeof d === 'number' && WEEKDAYS.includes(d))) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'weekly_holidays must be weekday indices 0–6', 400); return;
    }
    if (defaultShift !== 'next' && defaultShift !== 'previous') {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, "default_shift must be 'next' or 'previous'", 400); return;
    }

    const result = await cadenceSettingsService.updateSettings(tenantId, weeklyHolidays, defaultShift);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to update cadence settings', 500); return; }
    sendSuccess(res, result.data);
  };

  addHoliday = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
    const { date, label } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'date (YYYY-MM-DD) is required', 400); return;
    }
    const result = await cadenceSettingsService.addHoliday(tenantId, date, label);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to add holiday', 500); return; }
    sendSuccess(res, result.data);
  };

  removeHoliday = async (req: AuthRequest, res: Response): Promise<void> => {
    const tenantId = this.tenantId(req);
    if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
    const date = (req.query?.date as string) || (req.body?.date as string);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'date (YYYY-MM-DD) is required', 400); return;
    }
    const result = await cadenceSettingsService.removeHoliday(tenantId, date);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Failed to remove holiday', 500); return; }
    sendSuccess(res, result.data);
  };
}

export default new CadenceSettingsController();
