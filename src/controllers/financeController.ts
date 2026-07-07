// ============================================================================
// FinanceController — Stage 1 Finance AR/AP
// Tenant-level receivables/payables + invoice actions (approve / remind /
// cancel). Mirrors contractEventController conventions.
// ============================================================================

import { Response } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { sendError, internalError, ERROR_CODES } from '../utils/apiResponseHelpers';
import FinanceService from '../services/financeService';

class FinanceController {
  private financeService: FinanceService;

  constructor() {
    this.financeService = new FinanceService();
  }

  /**
   * GET /api/finance/receivables
   */
  getReceivables = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const result = await this.financeService.getReceivables(userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[FinanceController] Error in getReceivables:', error);
      internalError(res, 'Failed to load receivables');
    }
  };

  /**
   * GET /api/finance/payables
   */
  getPayables = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const result = await this.financeService.getPayables(userJWT, tenantId, environment);

      if (!result.success) {
        this.mapEdgeErrorToResponse(res, result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[FinanceController] Error in getPayables:', error);
      internalError(res, 'Failed to load payables');
    }
  };

  /**
   * POST /api/finance/invoices/:invoiceId/approve
   */
  approveDraftInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
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
      const invoiceId = req.params.invoiceId;
      const userId = req.user?.id || null;
      const userName = req.user?.name || req.user?.email || null;

      const result = await this.financeService.approveDraftInvoice(
        invoiceId,
        { performed_by: userId, performed_by_name: userName },
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
      console.error('[FinanceController] Error in approveDraftInvoice:', error);
      internalError(res, 'Failed to approve invoice');
    }
  };

  /**
   * POST /api/finance/invoices/:invoiceId/remind
   */
  sendInvoiceReminder = async (req: AuthRequest, res: Response): Promise<void> => {
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
      const invoiceId = req.params.invoiceId;
      const userId = req.user?.id || null;
      const userName = req.user?.name || req.user?.email || null;

      const result = await this.financeService.sendInvoiceReminder(
        invoiceId,
        { performed_by: userId, performed_by_name: userName },
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
      console.error('[FinanceController] Error in sendInvoiceReminder:', error);
      internalError(res, 'Failed to send reminder');
    }
  };

  /**
   * POST /api/finance/invoices/:invoiceId/cancel
   * Body: { contract_id: uuid, reason?: string }
   */
  cancelDraftInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
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
      const invoiceId = req.params.invoiceId;
      const userId = req.user?.id || null;

      const result = await this.financeService.cancelDraftInvoice(
        invoiceId,
        {
          performed_by: userId,
          contract_id: req.body.contract_id,
          reason: req.body.reason
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
      console.error('[FinanceController] Error in cancelDraftInvoice:', error);
      internalError(res, 'Failed to cancel invoice');
    }
  };

  // ─────────────────────────────────────────────
  // Edge error → HTTP status mapping
  // ─────────────────────────────────────────────
  private mapEdgeErrorToResponse(res: Response, result: any): void {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      INVALID_STATUS: 409,
      NO_EMAIL_CONTACT: 422,
      MISSING_TENANT_ID: 400,
      MISSING_ID: 400,
      MISSING_CONTRACT_ID: 400,
      UNKNOWN_ACTION: 400,
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

export default FinanceController;
