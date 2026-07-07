// ============================================================================
// AppointmentController — Stage 3 Appointments
// Board feed + create (manual request) + transitions.
// Mirrors financeController conventions.
// ============================================================================

import { Response } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { sendError, internalError, ERROR_CODES } from '../utils/apiResponseHelpers';
import AppointmentService from '../services/appointmentService';

class AppointmentController {
  private appointmentService: AppointmentService;

  constructor() {
    this.appointmentService = new AppointmentService();
  }

  /**
   * GET /api/appointments?status=
   */
  listAppointments = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const status = req.query.status as string | undefined;

      const result = await this.appointmentService.listAppointments(status, userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[AppointmentController] Error in listAppointments:', error);
      internalError(res, 'Failed to load appointments');
    }
  };

  /**
   * POST /api/appointments — manual request for a service event
   * Body: { event_id, notes? }
   */
  createAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || null;
      const userName = req.user?.name || req.user?.email || null;

      const result = await this.appointmentService.createAppointment(
        {
          event_id: req.body.event_id,
          notes: req.body.notes,
          performed_by: userId,
          performed_by_name: userName
        },
        userJWT,
        tenantId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('[AppointmentController] Error in createAppointment:', error);
      internalError(res, 'Failed to create appointment');
    }
  };

  /**
   * PATCH /api/appointments/:appointmentId — transition / edit
   * Body: { status?, scheduled_at?, notes?, proposed_slots?, assigned_to?, version? }
   */
  updateAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || null;
      const userName = req.user?.name || req.user?.email || null;

      const result = await this.appointmentService.updateAppointment(
        req.params.appointmentId,
        {
          status: req.body.status,
          scheduled_at: req.body.scheduled_at,
          notes: req.body.notes,
          proposed_slots: req.body.proposed_slots,
          assigned_to: req.body.assigned_to,
          assigned_to_name: req.body.assigned_to_name,
          version: req.body.version,
          performed_by: userId,
          performed_by_name: userName
        },
        userJWT,
        tenantId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[AppointmentController] Error in updateAppointment:', error);
      internalError(res, 'Failed to update appointment');
    }
  };

  private mapEdgeErrorToResponse(res: Response, result: any): void {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      INVALID_TRANSITION: 422,
      INVALID_EVENT_TYPE: 422,
      INVALID_STATUS: 409,
      MISSING_SCHEDULED_AT: 422,
      APPOINTMENT_EXISTS: 409,
      VERSION_CONFLICT: 409,
      MISSING_TENANT_ID: 400,
      MISSING_ID: 400,
      MISSING_SIGNATURE: 401,
      INVALID_SIGNATURE: 403,
      RPC_ERROR: 502,
      EDGE_FUNCTION_ERROR: 502,
      NETWORK_ERROR: 503
    };

    const status = statusMap[result.code] || 400;
    res.status(status).json({
      success: false,
      error: {
        code: result.code || 'REQUEST_FAILED',
        message: result.error || 'Request failed'
      },
      metadata: { timestamp: new Date().toISOString() }
    });
  }
}

export default AppointmentController;
