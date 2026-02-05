// ============================================================================
// Contract Event Controller
// ============================================================================
// Purpose: Handle HTTP requests for contract events (timeline) operations
// Pattern: Validate -> Extract context -> Call service -> Map response
// No business logic - just request/response handling
// ============================================================================

import { Response } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import ContractEventService from '../services/contractEventService';
import {
  sendError,
  internalError,
  ERROR_CODES
} from '../utils/apiResponseHelpers';

class ContractEventController {
  private contractEventService: ContractEventService;

  constructor() {
    this.contractEventService = new ContractEventService();
  }

  /**
   * GET /api/contract-events
   * List contract events with filtering and pagination
   */
  listEvents = async (req: AuthRequest, res: Response): Promise<void> => {
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
        contact_id: req.query.contact_id as string,
        assigned_to: req.query.assigned_to as string,
        status: req.query.status as string,
        event_type: req.query.event_type as string,
        date_from: req.query.date_from as string,
        date_to: req.query.date_to as string,
        page: parseInt(req.query.page as string || '1', 10),
        per_page: Math.min(parseInt(req.query.per_page as string || '20', 10), 100),
        sort_by: req.query.sort_by as string || 'scheduled_date',
        sort_order: req.query.sort_order as string || 'asc'
      };

      const result = await this.contractEventService.listEvents(
        filters,
        userJWT,
        tenantId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      // Transform response to match expected shape
      const pagination = result.pagination || {} as any;
      const items = Array.isArray(result.data) ? result.data : [];

      const transformedResult = {
        success: true,
        data: {
          items,
          total_count: pagination.total || 0,
          page_info: {
            has_next_page: (pagination.page || 1) < (pagination.total_pages || 1),
            has_prev_page: (pagination.page || 1) > 1,
            current_page: pagination.page || 1,
            total_pages: pagination.total_pages || 0,
          },
          filters_applied: filters,
        }
      };

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('[ContractEventController] Error in listEvents:', error);
      internalError(res, 'Failed to list contract events');
    }
  };

  /**
   * GET /api/contract-events/dates
   * Get date summary (overdue, today, tomorrow, this_week, next_week, later)
   */
  getDateSummary = async (req: AuthRequest, res: Response): Promise<void> => {
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
        contact_id: req.query.contact_id as string,
        assigned_to: req.query.assigned_to as string,
        event_type: req.query.event_type as string
      };

      const result = await this.contractEventService.getDateSummary(
        filters,
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
      console.error('[ContractEventController] Error in getDateSummary:', error);
      internalError(res, 'Failed to get date summary');
    }
  };

  /**
   * POST /api/contract-events
   * Create contract events (bulk insert)
   */
  createEvents = async (req: AuthRequest, res: Response): Promise<void> => {
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

      const result = await this.contractEventService.createEvents(
        req.body,
        userJWT,
        tenantId,
        userId,
        environment,
        idempotencyKey
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('[ContractEventController] Error in createEvents:', error);
      internalError(res, 'Failed to create contract events');
    }
  };

  /**
   * PATCH /api/contract-events/:id
   * Update a single contract event
   */
  updateEvent = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR,
          `Validation failed with ${errors.array().length} error(s)`, 400,
          { details: errors.array() });
        return;
      }

      const { id } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';
      const userName = req.user?.name || req.user?.email || 'Unknown User';

      const result = await this.contractEventService.updateEvent(
        id,
        req.body,
        userJWT,
        tenantId,
        userId,
        userName,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ContractEventController] Error in updateEvent:', error);
      internalError(res, 'Failed to update contract event');
    }
  };

  // ==========================================================
  // PRIVATE HELPERS
  // ==========================================================

  /**
   * Map Edge function error codes to HTTP status codes
   */
  private mapEdgeErrorToResponse(res: Response, result: any): void {
    const codeToStatus: Record<string, number> = {
      'NOT_FOUND': 404,
      'VERSION_CONFLICT': 409,
      'VALIDATION_ERROR': 400,
      'INVALID_TRANSITION': 422,
      'BATCH_TOO_LARGE': 400,
      'FORBIDDEN': 403,
      'UNAUTHORIZED': 401,
      'EDGE_FUNCTION_ERROR': 502,
      'NETWORK_ERROR': 503
    };

    const statusCode = codeToStatus[result.code] || 400;
    res.status(statusCode).json(result);
  }
}

export default ContractEventController;
