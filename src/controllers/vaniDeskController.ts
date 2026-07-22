// ============================================================================
// VaNi Desk Controller — vani-trial-and-briefing batch
// ============================================================================
//   GET  /api/vani/entitlement  → entitlement + trial state (landing page CTA)
//   POST /api/vani/trial/start  → start the 7-day trial (idempotent)
//   GET  /api/vani/briefing     → Briefing page payload (gated by entitlement)
//
// Context extraction mirrors vaniComposerController: tenant/environment from
// headers (authenticate middleware runs before us).
// ============================================================================

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError, internalError, ERROR_CODES } from '../utils/apiResponseHelpers';
import vaniDeskService from '../services/vaniDeskService';
import vaniEntitlementService from '../services/vaniEntitlementService';

class VaniDeskController {
  private tenantId(req: AuthRequest): string {
    return (req.headers['x-tenant-id'] as string) || '';
  }

  private isLive(req: AuthRequest): boolean {
    return ((req.headers['x-environment'] as string) || 'live') === 'live';
  }

  /** GET /api/vani/entitlement */
  getEntitlement = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const details = await vaniEntitlementService.getDetails(this.tenantId(req));
      sendSuccess(res, details);
    } catch (error) {
      console.error('[VaniDeskController] getEntitlement error:', error);
      internalError(res, 'Failed to load VaNi entitlement');
    }
  };

  /** POST /api/vani/trial/start */
  startTrial = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);
      const result = await vaniDeskService.startTrial(tenantId);

      if (!result.success) {
        sendError(
          res,
          ERROR_CODES.INTERNAL_ERROR,
          result.error?.message || 'Could not start the VaNi trial',
          500
        );
        return;
      }

      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[VaniDeskController] startTrial error:', error);
      internalError(res, 'Failed to start the VaNi trial');
    }
  };

  /** GET /api/vani/rules — visible to every tenant (read is free) */
  getRules = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await vaniDeskService.getRules(this.tenantId(req));

      if (!result.success) {
        sendError(res, ERROR_CODES.INTERNAL_ERROR,
          result.error?.message || 'Could not load the rules', 500);
        return;
      }

      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[VaniDeskController] getRules error:', error);
      internalError(res, 'Failed to load automation rules');
    }
  };

  /**
   * PUT /api/vani/rules/:ruleKey — EDIT is the paywall
   * ("defaults run for everyone; controlling the automation is VaNi").
   */
  updateRule = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);

      // Owner decision (2026-07-22): automation rules are the tenant's own
      // standing instructions — editing is NOT gated behind the VaNi
      // entitlement (the system/VaNi merely executes them). The entitlement
      // continues to gate VaNi's premium surfaces (briefing etc.).

      const ruleKey = String(req.params.ruleKey || '');
      const { config, is_enabled, expected_version } = req.body || {};

      if (!ruleKey) {
        sendError(res, ERROR_CODES.BAD_REQUEST, 'ruleKey is required', 400);
        return;
      }
      if (config !== undefined && (typeof config !== 'object' || Array.isArray(config) || config === null)) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'config must be an object of numeric fields', 400);
        return;
      }
      if (is_enabled !== undefined && typeof is_enabled !== 'boolean') {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'is_enabled must be a boolean', 400);
        return;
      }

      const result = await vaniDeskService.updateRule(
        tenantId,
        ruleKey,
        config ?? null,
        is_enabled ?? null,
        Number.isFinite(Number(expected_version)) ? Number(expected_version) : null,
        req.user?.id || null
      );

      if (!result.success) {
        const code = result.error?.code;
        const status =
          code === 'VERSION_CONFLICT' ? 409 :
          code === 'OUT_OF_BOUNDS' || code === 'UNKNOWN_FIELD' || code === 'INVALID_TYPE' ? 400 :
          code === 'UNKNOWN_RULE' ? 404 : 500;
        sendError(res,
          status === 409 ? ERROR_CODES.VERSION_CONFLICT :
          status === 400 ? ERROR_CODES.VALIDATION_ERROR :
          status === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.INTERNAL_ERROR,
          result.error?.message || 'Could not update the rule', status);
        return;
      }

      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[VaniDeskController] updateRule error:', error);
      internalError(res, 'Failed to update the rule');
    }
  };

  /** GET /api/vani/briefing?days=7 */
  getBriefing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);

      // Gate: Briefing is a VaNi surface (mode=open passes everyone through)
      const entitled = await vaniEntitlementService.isEntitled(tenantId);
      if (!entitled) {
        sendError(res, ERROR_CODES.FORBIDDEN, 'VaNi trial or subscription required', 403);
        return;
      }

      const daysRaw = parseInt(String(req.query.days ?? '7'), 10);
      const feedDays = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 30) : 7;

      const result = await vaniDeskService.getBriefing(tenantId, this.isLive(req), feedDays);

      if (!result.success) {
        sendError(
          res,
          ERROR_CODES.INTERNAL_ERROR,
          result.error?.message || 'Could not load the briefing',
          500
        );
        return;
      }

      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[VaniDeskController] getBriefing error:', error);
      internalError(res, 'Failed to load the VaNi briefing');
    }
  };
}

export default VaniDeskController;
