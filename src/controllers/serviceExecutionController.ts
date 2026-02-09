// ============================================================================
// Service Execution Controller
// ============================================================================
// Purpose: Handle HTTP requests for service execution (tickets, evidence, audit)
// Pattern: Validate → Extract context → Call service → Map response
// ============================================================================

import { Response } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import ServiceExecutionService from '../services/serviceExecutionService';
import {
  sendError,
  internalError,
  ERROR_CODES
} from '../utils/apiResponseHelpers';

class ServiceExecutionController {
  private service: ServiceExecutionService;

  constructor() {
    this.service = new ServiceExecutionService();
  }

  // ==========================================================
  // TICKET ENDPOINTS
  // ==========================================================

  listTickets = async (req: AuthRequest, res: Response): Promise<void> => {
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
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const filters = {
        contract_id: req.query.contract_id as string,
        status: req.query.status as string,
        assigned_to: req.query.assigned_to as string,
        date_from: req.query.date_from as string,
        date_to: req.query.date_to as string,
        page: parseInt(req.query.page as string || '1', 10),
        per_page: Math.min(parseInt(req.query.per_page as string || '20', 10), 100),
      };

      const result = await this.service.listTickets(filters, userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ServiceExecutionController] Error in listTickets:', error);
      internalError(res, 'Failed to list service tickets');
    }
  };

  getTicketDetail = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const { ticketId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const result = await this.service.getTicketDetail(ticketId, userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ServiceExecutionController] Error in getTicketDetail:', error);
      internalError(res, 'Failed to get ticket detail');
    }
  };

  createTicket = async (req: AuthRequest, res: Response): Promise<void> => {
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
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';
      const idempotencyKey = req.headers['x-idempotency-key'] as string;

      const result = await this.service.createTicket(
        req.body, userJWT, tenantId, userId, environment, idempotencyKey
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('[ServiceExecutionController] Error in createTicket:', error);
      internalError(res, 'Failed to create service ticket');
    }
  };

  updateTicket = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const { ticketId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';
      const userName = req.user?.name || req.user?.email || 'Unknown User';

      const result = await this.service.updateTicket(
        ticketId, req.body, userJWT, tenantId, userId, userName, environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ServiceExecutionController] Error in updateTicket:', error);
      internalError(res, 'Failed to update service ticket');
    }
  };

  // ==========================================================
  // EVIDENCE ENDPOINTS
  // ==========================================================

  listEvidence = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const ticketId = req.params.ticketId || null;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const filters = {
        contract_id: req.query.contract_id as string,
        evidence_type: req.query.evidence_type as string,
        status: req.query.status as string,
      };

      const result = await this.service.listEvidence(ticketId, filters, userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ServiceExecutionController] Error in listEvidence:', error);
      internalError(res, 'Failed to list evidence');
    }
  };

  createEvidence = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const { ticketId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';

      const result = await this.service.createEvidence(
        ticketId, req.body, userJWT, tenantId, userId, environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('[ServiceExecutionController] Error in createEvidence:', error);
      internalError(res, 'Failed to create evidence');
    }
  };

  updateEvidence = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const { ticketId, evidenceId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';
      const userName = req.user?.name || req.user?.email || 'Unknown User';

      const result = await this.service.updateEvidence(
        ticketId, evidenceId, req.body, userJWT, tenantId, userId, userName, environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ServiceExecutionController] Error in updateEvidence:', error);
      internalError(res, 'Failed to update evidence');
    }
  };

  // ==========================================================
  // AUDIT ENDPOINT
  // ==========================================================

  getAuditLog = async (req: AuthRequest, res: Response): Promise<void> => {
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
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const filters = {
        contract_id: req.query.contract_id as string,
        entity_type: req.query.entity_type as string,
        entity_id: req.query.entity_id as string,
        category: req.query.category as string,
        performed_by: req.query.performed_by as string,
        date_from: req.query.date_from as string,
        date_to: req.query.date_to as string,
        page: parseInt(req.query.page as string || '1', 10),
        per_page: Math.min(parseInt(req.query.per_page as string || '20', 10), 100),
      };

      const result = await this.service.getAuditLog(filters, userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ServiceExecutionController] Error in getAuditLog:', error);
      internalError(res, 'Failed to get audit log');
    }
  };

  // ==========================================================
  // HELPERS
  // ==========================================================

  private mapEdgeErrorToResponse(res: Response, result: any): void {
    const codeToStatus: Record<string, number> = {
      'NOT_FOUND': 404,
      'VERSION_CONFLICT': 409,
      'VALIDATION_ERROR': 400,
      'FORBIDDEN': 403,
      'UNAUTHORIZED': 401,
      'EDGE_FUNCTION_ERROR': 502,
      'NETWORK_ERROR': 503
    };

    const statusCode = codeToStatus[result.code] || 400;
    res.status(statusCode).json(result);
  }
}

export default ServiceExecutionController;
