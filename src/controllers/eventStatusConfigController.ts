// ============================================================================
// Event Status Config Controller
// ============================================================================
// Purpose: Handle HTTP requests for event status configuration
// Pattern: Validate -> Extract context -> Call service -> Map response
// No business logic - just request/response handling
// ============================================================================

import { Response } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import EventStatusConfigService from '../services/eventStatusConfigService';
import {
  sendError,
  internalError,
  ERROR_CODES
} from '../utils/apiResponseHelpers';

class EventStatusConfigController {
  private service: EventStatusConfigService;

  constructor() {
    this.service = new EventStatusConfigService();
  }

  /**
   * GET /api/event-status-config/statuses?event_type=service
   */
  getStatuses = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';

      const result = await this.service.getStatuses(
        req.query.event_type as string,
        tenantId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[EventStatusConfigController] getStatuses error:', error);
      internalError(res);
    }
  };

  /**
   * GET /api/event-status-config/transitions?event_type=service&from_status=scheduled
   */
  getTransitions = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';

      const result = await this.service.getTransitions(
        req.query.event_type as string,
        tenantId,
        environment,
        req.query.from_status as string || undefined
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[EventStatusConfigController] getTransitions error:', error);
      internalError(res);
    }
  };

  /**
   * POST /api/event-status-config/statuses
   */
  upsertStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';

      const result = await this.service.upsertStatus(
        req.body,
        tenantId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[EventStatusConfigController] upsertStatus error:', error);
      internalError(res);
    }
  };

  /**
   * DELETE /api/event-status-config/statuses
   */
  deleteStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';

      const result = await this.service.deleteStatus(
        req.body,
        tenantId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[EventStatusConfigController] deleteStatus error:', error);
      internalError(res);
    }
  };

  /**
   * POST /api/event-status-config/transitions
   */
  upsertTransition = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';

      const result = await this.service.upsertTransition(
        req.body,
        tenantId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[EventStatusConfigController] upsertTransition error:', error);
      internalError(res);
    }
  };

  /**
   * DELETE /api/event-status-config/transitions
   */
  deleteTransition = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';

      const result = await this.service.deleteTransition(
        req.body,
        tenantId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[EventStatusConfigController] deleteTransition error:', error);
      internalError(res);
    }
  };

  /**
   * POST /api/event-status-config/seed
   */
  seedDefaults = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';

      const result = await this.service.seedDefaults(
        tenantId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[EventStatusConfigController] seedDefaults error:', error);
      internalError(res);
    }
  };

  // =================================================================
  // HELPERS
  // =================================================================

  private mapEdgeErrorToResponse(res: Response, result: any): void {
    const statusMap: Record<string, number> = {
      'VALIDATION_ERROR': 400,
      'MISSING_TENANT_ID': 400,
      'MISSING_SIGNATURE': 401,
      'INVALID_SIGNATURE': 403,
      'INVALID_PATH': 404,
      'METHOD_NOT_ALLOWED': 405,
      'RPC_ERROR': 500,
      'INTERNAL_ERROR': 500
    };

    const status = statusMap[result.code] || 500;
    res.status(status).json({
      success: false,
      error: {
        code: result.code || 'EDGE_FUNCTION_ERROR',
        message: result.error || 'An error occurred'
      },
      metadata: { timestamp: new Date().toISOString() }
    });
  }
}

export default EventStatusConfigController;
