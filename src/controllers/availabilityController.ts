// ============================================================================
// Availability Controller — /api/availability (migration jtd-nucleus/024)
// ============================================================================
//   GET    /users/:userId              a person's effective hours, own overrides, tenant defaults, leave
//   PUT    /users/:userId              { work_start?, work_end?, weekly_off? }  — all null = inherit the tenant's
//   POST   /users/:userId/leave        { date:'YYYY-MM-DD', part:'full'|'am'|'pm', label? }
//   DELETE /users/:userId/leave?date=  remove one day
//   GET    /team?days=60               everyone, with hours and leave, for the board and the timeboard
// ============================================================================

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError, internalError, ERROR_CODES } from '../utils/apiResponseHelpers';
import availabilityService from '../services/availabilityService';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

class AvailabilityController {
  private tenantId(req: AuthRequest): string { return (req.headers['x-tenant-id'] as string) || ''; }
  private userId(req: AuthRequest): string | null { const id = String(req.params.userId || ''); return UUID.test(id) ? id : null; }

  private refuse(res: Response, error: { code: string; message: string; details?: any }) {
    const status = error.code === 'user_not_in_tenant' ? 404
      : ['bad_hours', 'bad_weekday', 'bad_part', 'date_required', 'user_required'].includes(error.code) ? 400
      : error.code === 'RPC_ERROR' || error.code === 'UNEXPECTED' || error.code === 'CONFIG' ? 500 : 409;
    res.status(status).json({
      success: false,
      error: { code: error.code, message: error.message, details: error.details ?? null },
      metadata: { timestamp: new Date().toISOString() }
    });
  }

  getUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = this.tenantId(req); const userId = this.userId(req);
      if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
      if (!userId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'userId is required', 400); return; }
      const result = await availabilityService.getUser(tenantId, userId);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[AvailabilityController] getUser error:', error);
      internalError(res, 'Failed to load availability');
    }
  };

  setUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = this.tenantId(req); const userId = this.userId(req);
      if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
      if (!userId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'userId is required', 400); return; }
      const b = req.body || {};
      const workStart = b.work_start == null || b.work_start === '' ? null : String(b.work_start);
      const workEnd = b.work_end == null || b.work_end === '' ? null : String(b.work_end);
      if ((workStart && !HHMM.test(workStart)) || (workEnd && !HHMM.test(workEnd))) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'work_start and work_end must be HH:MM', 400); return; }
      let weeklyOff: number[] | null = null;
      if (Array.isArray(b.weekly_off)) {
        weeklyOff = b.weekly_off.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6);
      }
      const result = await availabilityService.setUser(tenantId, userId, workStart, workEnd, weeklyOff, req.user?.id || null);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[AvailabilityController] setUser error:', error);
      internalError(res, 'Failed to save availability');
    }
  };

  addLeave = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = this.tenantId(req); const userId = this.userId(req);
      if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
      if (!userId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'userId is required', 400); return; }
      const date = String(req.body?.date || '');
      if (!ISO_DAY.test(date) || Number.isNaN(Date.parse(date))) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'date must be YYYY-MM-DD', 400); return; }
      const part = String(req.body?.part || 'full');
      if (!['full', 'am', 'pm'].includes(part)) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'part must be full, am or pm', 400); return; }
      const label = req.body?.label == null ? null : String(req.body.label).trim().slice(0, 120) || null;
      const result = await availabilityService.addLeave(tenantId, userId, date, part as 'full' | 'am' | 'pm', label, req.user?.id || null);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[AvailabilityController] addLeave error:', error);
      internalError(res, 'Failed to add leave');
    }
  };

  removeLeave = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = this.tenantId(req); const userId = this.userId(req);
      if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
      if (!userId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'userId is required', 400); return; }
      const date = String(req.query.date || '');
      if (!ISO_DAY.test(date)) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'date must be YYYY-MM-DD', 400); return; }
      const result = await availabilityService.removeLeave(tenantId, userId, date);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[AvailabilityController] removeLeave error:', error);
      internalError(res, 'Failed to remove leave');
    }
  };

  team = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);
      if (!tenantId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Tenant is required', 400); return; }
      const days = Math.min(Math.max(parseInt(String(req.query.days ?? '60'), 10) || 60, 1), 366);
      const result = await availabilityService.team(tenantId, days);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[AvailabilityController] team error:', error);
      internalError(res, 'Failed to load team availability');
    }
  };
}

export default new AvailabilityController();
