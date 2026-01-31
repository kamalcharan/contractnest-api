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
        sort_order: req.query.sort_order as string || 'desc'
      };

      const result = await this.contractService.listContracts(filters, userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      // Transform RPC response to match UI ContractListResponse shape
      // DB stores 'name' but UI Contract type expects 'title'
      const pagination = result.pagination || {} as any;
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

      const result = await this.contractService.getContractStats(userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      // Transform RPC response to match UI ContractStatsResponse shape
      const statsData = result.data || {} as any;
      const transformedResult = {
        success: true,
        data: {
          total: statsData.total_count || 0,
          by_status: statsData.by_status || {},
          by_record_type: statsData.by_record_type || {},
          by_contract_type: statsData.by_contract_type || {},
          total_value: statsData.financials?.total_value || 0,
          currency_breakdown: [],
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
