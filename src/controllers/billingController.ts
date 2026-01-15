// ============================================================================
// Billing Controller
// ============================================================================
// Purpose: Handle billing API requests - validation and routing to service
// Pattern: Controller validates → calls service → returns response
// Note: NO business logic here - validation + service calls only
// ============================================================================

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { captureException } from '../utils/sentry';
import { validateSupabaseConfig } from '../utils/supabaseConfig';
import { billingService } from '../services/billingService';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Standard error response handler
 */
function handleError(res: Response, error: any, context: string): Response {
  console.error(`Error in ${context}:`, error);

  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'billing_controller', action: context },
    status: error.response?.status
  });

  const status = error.response?.status || 500;
  const message = error.response?.data?.error || error.message || 'An unknown error occurred';

  return res.status(status).json({
    success: false,
    error: message,
    code: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'
  });
}

/**
 * Check for validation errors
 */
function checkValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array()
    });
    return false;
  }
  return true;
}

/**
 * Extract auth token and tenant ID from request
 */
function extractAuth(req: Request): { authToken: string | null; tenantId: string | null } {
  return {
    authToken: req.headers.authorization || null,
    tenantId: req.headers['x-tenant-id'] as string || null
  };
}

// ============================================================================
// GET ENDPOINTS
// ============================================================================

/**
 * GET /api/billing/status/:tenantId
 * Get comprehensive billing status (bot-friendly)
 */
export const getBillingStatus = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'getBillingStatus')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);
    const targetTenantId = req.params.tenantId || tenantId;

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const result = await billingService.getBillingStatus(authToken, targetTenantId);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'getBillingStatus');
  }
};

/**
 * GET /api/billing/subscription/:tenantId
 * Get subscription details
 */
export const getSubscriptionDetails = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'getSubscriptionDetails')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);
    const targetTenantId = req.params.tenantId || tenantId;

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const result = await billingService.getSubscriptionDetails(authToken, targetTenantId);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'getSubscriptionDetails');
  }
};

/**
 * GET /api/billing/credits/:tenantId
 * Get credit balances
 */
export const getCreditBalance = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'getCreditBalance')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);
    const targetTenantId = req.params.tenantId || tenantId;

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const result = await billingService.getCreditBalance(authToken, targetTenantId);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'getCreditBalance');
  }
};

/**
 * GET /api/billing/usage/:tenantId
 * Get usage summary
 */
export const getUsageSummary = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'getUsageSummary')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);
    const targetTenantId = req.params.tenantId || tenantId;

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const periodStart = req.query.period_start as string | undefined;
    const periodEnd = req.query.period_end as string | undefined;

    const result = await billingService.getUsageSummary(
      authToken,
      targetTenantId,
      periodStart,
      periodEnd
    );
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'getUsageSummary');
  }
};

/**
 * GET /api/billing/invoice-estimate/:tenantId
 * Get invoice estimate for current period
 */
export const getInvoiceEstimate = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'getInvoiceEstimate')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);
    const targetTenantId = req.params.tenantId || tenantId;

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const result = await billingService.getInvoiceEstimate(authToken, targetTenantId);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'getInvoiceEstimate');
  }
};

/**
 * GET /api/billing/alerts/:tenantId
 * Get billing alerts
 */
export const getBillingAlerts = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'getBillingAlerts')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);
    const targetTenantId = req.params.tenantId || tenantId;

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const result = await billingService.getBillingAlerts(authToken, targetTenantId);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'getBillingAlerts');
  }
};

/**
 * GET /api/billing/topup-packs
 * Get available topup packs
 */
export const getTopupPacks = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'getTopupPacks')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const productCode = req.query.product_code as string | undefined;
    const creditType = req.query.credit_type as string | undefined;

    const result = await billingService.getTopupPacks(
      authToken,
      tenantId || '',
      productCode,
      creditType
    );
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'getTopupPacks');
  }
};

// ============================================================================
// POST ENDPOINTS
// ============================================================================

/**
 * POST /api/billing/usage
 * Record usage event
 */
export const recordUsage = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'recordUsage')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const targetTenantId = req.body.tenant_id || tenantId;
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const result = await billingService.recordUsage(authToken, targetTenantId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'recordUsage');
  }
};

/**
 * POST /api/billing/credits/deduct
 * Deduct credits from balance
 */
export const deductCredits = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'deductCredits')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const targetTenantId = req.body.tenant_id || tenantId;
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const result = await billingService.deductCredits(authToken, targetTenantId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'deductCredits');
  }
};

/**
 * POST /api/billing/credits/add
 * Add credits to balance
 */
export const addCredits = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'addCredits')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const targetTenantId = req.body.tenant_id || tenantId;
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const result = await billingService.addCredits(authToken, targetTenantId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'addCredits');
  }
};

/**
 * POST /api/billing/credits/topup
 * Purchase topup pack
 */
export const purchaseTopup = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'purchaseTopup')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const targetTenantId = req.body.tenant_id || tenantId;
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const result = await billingService.purchaseTopup(authToken, targetTenantId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'purchaseTopup');
  }
};

/**
 * POST /api/billing/credits/check
 * Check credit availability without deducting
 */
export const checkCreditAvailability = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('billing', 'checkCreditAvailability')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId } = extractAuth(req);

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const targetTenantId = req.body.tenant_id || tenantId;
    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const result = await billingService.checkCreditAvailability(authToken, targetTenantId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'checkCreditAvailability');
  }
};
