// ============================================================================
// Contract Controller
// ============================================================================
// Purpose: Handle HTTP requests for contract & RFQ operations
// Pattern: Validate → Extract context → Call service → Map response
// No business logic — just request/response handling
// ============================================================================

import { Response } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import ContractService from '../services/contractService';
import {
  sendError,
  internalError,
  ERROR_CODES
} from '../utils/apiResponseHelpers';

class ContractController {
  private contractService: ContractService;

  constructor() {
    this.contractService = new ContractService();
  }

  /**
   * GET /api/contracts
   * List contracts with filtering and pagination
   */
  listContracts = async (req: AuthRequest, res: Response): Promise<void> => {
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
        record_type: req.query.record_type as string,
        contract_type: req.query.contract_type as string,
        status: req.query.status as string,
        search: req.query.search as string,
        page: parseInt(req.query.page as string || '1', 10),
        per_page: Math.min(parseInt(req.query.per_page as string || req.query.limit as string || '20', 10), 100),
        sort_by: req.query.sort_by as string || 'created_at',
        sort_order: req.query.sort_order as string || req.query.sort_direction as string || 'desc',
        group_by: req.query.group_by as string || undefined,
      };

      const result = await this.contractService.listContracts(filters, userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      // Transform RPC response to match UI response shape
      // DB stores 'name' but UI Contract type expects 'title'
      const pagination = result.pagination || {} as any;
      const pageInfo = {
        has_next_page: (pagination.page || 1) < (pagination.total_pages || 1),
        has_prev_page: (pagination.page || 1) > 1,
        current_page: pagination.page || 1,
        total_pages: pagination.total_pages || 0,
      };

      // Grouped mode: RPC returns { groups: [...] } instead of { data: [...] }
      if (filters.group_by && Array.isArray(result.groups)) {
        const groups = result.groups.map((group: any) => ({
          ...group,
          contracts: (group.contracts || []).map((item: any) => ({
            ...item,
            title: item.title || item.name || '',
          })),
        }));
        res.status(200).json({
          success: true,
          data: {
            groups,
            total_count: pagination.total || 0,
            page_info: pageInfo,
            filters_applied: filters,
          }
        });
        return;
      }

      // Flat mode (default)
      const items = Array.isArray(result.data)
        ? result.data.map((item: any) => ({
            ...item,
            title: item.title || item.name || '',
          }))
        : [];
      const transformedResult = {
        success: true,
        data: {
          items,
          total_count: pagination.total || 0,
          page_info: pageInfo,
          filters_applied: filters,
        }
      };

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('[ContractController] Error in listContracts:', error);
      internalError(res, 'Failed to list contracts');
    }
  };

  /**
   * GET /api/contracts/stats
   * Get contract dashboard statistics
   */
  getContractStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const contractType = req.query.contract_type as string | undefined;

      const result = await this.contractService.getContractStats(userJWT, tenantId, environment, contractType);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      // Transform RPC response to match UI ContractStatsResponse shape
          // Transform RPC response to match UI ContractStatsResponse shape
      // Edge function returns RPC data at root level (not wrapped in .data)
      const statsData = result.data || result || {} as any;
      const portfolio = statsData.portfolio || {} as any;
      const transformedResult = {
        success: true,
        data: {
          total: statsData.total || statsData.total_count || 0,
          by_status: statsData.by_status || {},
          by_record_type: statsData.by_record_type || {},
          by_contract_type: statsData.by_contract_type || {},
          total_value: statsData.total_value || statsData.financials?.total_value || 0,
          currency_breakdown: [],
          // Portfolio aggregates (from enriched get_contract_stats)
          portfolio: {
            total_overdue_events: portfolio.total_overdue_events || 0,
            total_invoiced: portfolio.total_invoiced || 0,
            total_collected: portfolio.total_collected || 0,
            outstanding: portfolio.outstanding || 0,
            avg_health_score: portfolio.avg_health_score || 0,
            needs_attention_count: portfolio.needs_attention_count || 0,
          },
        }
      };


      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('[ContractController] Error in getContractStats:', error);
      internalError(res, 'Failed to get contract stats');
    }
  };

  /**
   * GET /api/contracts/:id
   * Get single contract by ID
   */
  getContract = async (req: AuthRequest, res: Response): Promise<void> => {
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

      const result = await this.contractService.getContractById(id, userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ContractController] Error in getContract:', error);
      internalError(res, 'Failed to get contract');
    }
  };

  /**
   * POST /api/contracts
   * Create new contract or RFQ
   */
  createContract = async (req: AuthRequest, res: Response): Promise<void> => {
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

      const result = await this.contractService.createContract(
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
      console.error('[ContractController] Error in createContract:', error);
      internalError(res, 'Failed to create contract');
    }
  };

  /**
   * PUT /api/contracts/:id
   * Update existing contract
   */
  updateContract = async (req: AuthRequest, res: Response): Promise<void> => {
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
      const idempotencyKey = req.headers['x-idempotency-key'] as string;

      const result = await this.contractService.updateContract(
        id,
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

      res.status(200).json(result);
    } catch (error) {
      console.error('[ContractController] Error in updateContract:', error);
      internalError(res, 'Failed to update contract');
    }
  };

  /**
   * PATCH /api/contracts/:id/status
   * Update contract status
   */
  updateContractStatus = async (req: AuthRequest, res: Response): Promise<void> => {
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

      const { status, note, version } = req.body;

      const result = await this.contractService.updateContractStatus(
        id,
        { status, note, version },
        userJWT,
        tenantId,
        userId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ContractController] Error in updateContractStatus:', error);
      internalError(res, 'Failed to update contract status');
    }
  };

  /**
   * DELETE /api/contracts/:id
   * Soft delete contract
   */
  deleteContract = async (req: AuthRequest, res: Response): Promise<void> => {
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

      const { version, note } = req.body || {};

      const result = await this.contractService.deleteContract(
        id,
        { version, note },
        userJWT,
        tenantId,
        userId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ContractController] Error in deleteContract:', error);
      internalError(res, 'Failed to delete contract');
    }
  };

  // ==========================================================
  // PRIVATE HELPERS
  // ==========================================================

  /**
   * Map Edge function error codes to HTTP status codes
   * Edge returns { success: false, error: string, code: string }
   * We map the code to the appropriate HTTP status
   */
  // =================================================================
  // NOTIFICATION ENDPOINTS
  // =================================================================

  /**
   * POST /api/contracts/:id/notify
   * Send sign-off notification to buyer via email/WhatsApp
   */
  sendNotification = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const result = await this.contractService.sendNotification(
        id,
        req.body,
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
      console.error('[ContractController] Error in sendNotification:', error);
      internalError(res, 'Failed to send notification');
    }
  };

  // =================================================================
  // INVOICE & PAYMENT ENDPOINTS
  // =================================================================

  getContractInvoices = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const contractId = req.params.id;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const result = await this.contractService.getContractInvoices(
        contractId,
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
      console.error('[ContractController] Error in getContractInvoices:', error);
      internalError(res, 'Failed to fetch invoices');
    }
  };

  recordPayment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const contractId = req.params.id;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';

      const result = await this.contractService.recordPayment(
        contractId,
        req.body,
        userJWT,
        tenantId,
        userId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('[ContractController] Error in recordPayment:', error);
      internalError(res, 'Failed to record payment');
    }
  };

  cancelInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const contractId = req.params.id;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';

      const { invoice_id, action, reason } = req.body;

      if (!invoice_id || !action) {
        res.status(400).json({ success: false, error: 'invoice_id and action are required' });
        return;
      }

      const result = await this.contractService.cancelInvoice(
        contractId,
        { invoice_id, action, reason },
        userJWT,
        tenantId,
        userId,
        environment
      );

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ContractController] Error in cancelInvoice:', error);
      internalError(res, 'Failed to process invoice action');
    }
  };

  // =================================================================
  // PUBLIC ENDPOINTS (no auth required)
  // =================================================================

  /**
   * POST /api/contracts/public/validate
   * Validate contract access via CNAK + secret_code
   */
  validateContractAccess = async (req: any, res: Response): Promise<void> => {
    try {
      const { cnak, secret_code } = req.body;

      if (!cnak || !secret_code) {
        res.status(400).json({ valid: false, error: 'CNAK and secret code are required' });
        return;
      }

      const result = await this.contractService.validateContractAccess(cnak, secret_code);
      res.status(200).json(result);
    } catch (error) {
      console.error('[ContractController] Error in validateContractAccess:', error);
      internalError(res, 'Failed to validate contract access');
    }
  };

  /**
   * POST /api/contracts/public/respond
   * Accept or reject a contract via CNAK + secret_code
   */
  respondToContract = async (req: any, res: Response): Promise<void> => {
    try {
      const { cnak, secret_code, action, responded_by, responder_name, responder_email, rejection_reason } = req.body;

      if (!cnak || !secret_code || !action) {
        res.status(400).json({ success: false, error: 'CNAK, secret code, and action are required' });
        return;
      }

      if (!['accept', 'reject'].includes(action)) {
        res.status(400).json({ success: false, error: 'Action must be accept or reject' });
        return;
      }

      const result = await this.contractService.respondToContract({
        cnak,
        secret_code,
        action,
        responded_by,
        responder_name,
        responder_email,
        rejection_reason
      });

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('[ContractController] Error in respondToContract:', error);
      internalError(res, 'Failed to respond to contract');
    }
  };

  /**
   * POST /api/contracts/claim
   * Claim a contract using CNAK code (authenticated)
   */
  claimContract = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { cnak } = req.body;
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';

      if (!cnak) {
        res.status(400).json({ success: false, error: 'CNAK is required' });
        return;
      }

      if (!tenantId) {
        res.status(400).json({ success: false, error: 'x-tenant-id header is required' });
        return;
      }

      const result = await this.contractService.claimContract(
        cnak,
        userJWT,
        tenantId,
        userId
      );

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('[ContractController] Error in claimContract:', error);
      internalError(res, 'Failed to claim contract');
    }
  };

  // ==========================================================
  // PRIVATE HELPERS
  // ==========================================================

  private mapEdgeErrorToResponse(res: Response, result: any): void {
    const codeToStatus: Record<string, number> = {
      'NOT_FOUND': 404,
      'VERSION_CONFLICT': 409,
      'VALIDATION_ERROR': 400,
      'INVALID_TRANSITION': 422,
      'DELETE_NOT_ALLOWED': 422,
      'DUPLICATE_FOUND': 409,
      'FORBIDDEN': 403,
      'UNAUTHORIZED': 401,
      'EDGE_FUNCTION_ERROR': 502,
      'NETWORK_ERROR': 503
    };

    const statusCode = codeToStatus[result.code] || 400;
    res.status(statusCode).json(result);
  }
}

export default ContractController;
