// ============================================================================
// Tenant Context Controller
// ============================================================================
// Purpose: Handle tenant context API requests - validation and routing to service
// Pattern: Controller validates → calls service → returns response
// Note: NO business logic here - validation + service calls only
// Created: January 2025
// ============================================================================

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { captureException } from '../utils/sentry';
import { validateSupabaseConfig } from '../utils/supabaseConfig';
import { tenantContextService } from '../services/tenantContextService';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Standard error response handler
 */
function handleError(res: Response, error: any, context: string): Response {
  console.error(`Error in ${context}:`, error);

  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'tenant_context_controller', action: context },
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
 * Extract auth token, tenant ID, and product code from request
 */
function extractAuth(req: Request): {
  authToken: string | null;
  tenantId: string | null;
  productCode: string | null;
} {
  return {
    authToken: req.headers.authorization || null,
    tenantId: req.headers['x-tenant-id'] as string || null,
    productCode: req.headers['x-product-code'] as string || null
  };
}

// ============================================================================
// GET ENDPOINTS
// ============================================================================

/**
 * GET /api/tenant-context
 * Get tenant context for current tenant
 */
export const getContext = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('tenant_context', 'getContext')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const { authToken, tenantId, productCode } = extractAuth(req);

    if (!authToken) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
    }
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'x-tenant-id header required'
      });
    }
    if (!productCode) {
      return res.status(400).json({
        success: false,
        error: 'x-product-code header required'
      });
    }

    // Check for cache bypass
    const useCache = req.query.refresh !== 'true';

    const result = await tenantContextService.getContext(
      authToken,
      productCode,
      tenantId,
      useCache
    );

    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    return handleError(res, error, 'getContext');
  }
};

/**
 * GET /api/tenant-context/can-send/:channel
 * Check if tenant can send via specific channel
 */
export const canSendChannel = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('tenant_context', 'canSendChannel')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const { authToken, tenantId, productCode } = extractAuth(req);
    const channel = req.params.channel as 'whatsapp' | 'sms' | 'email' | 'inapp' | 'push';

    if (!authToken) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
    }
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'x-tenant-id header required'
      });
    }
    if (!productCode) {
      return res.status(400).json({
        success: false,
        error: 'x-product-code header required'
      });
    }

    const validChannels = ['whatsapp', 'sms', 'email', 'inapp', 'push'];
    if (!validChannels.includes(channel)) {
      return res.status(400).json({
        success: false,
        error: `Invalid channel. Must be one of: ${validChannels.join(', ')}`
      });
    }

    const canSend = await tenantContextService.canSendChannel(
      authToken,
      productCode,
      tenantId,
      channel
    );

    return res.status(200).json({
      success: true,
      channel,
      can_send: canSend,
      tenant_id: tenantId
    });
  } catch (error) {
    return handleError(res, error, 'canSendChannel');
  }
};

/**
 * GET /api/tenant-context/waiting-jtds
 * Get count of JTDs waiting for credits
 */
export const getWaitingJtdCount = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('tenant_context', 'getWaitingJtdCount')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const { authToken, tenantId } = extractAuth(req);
    const channel = req.query.channel as string | undefined;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
    }
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'x-tenant-id header required'
      });
    }

    const result = await tenantContextService.getWaitingJtdCount(
      authToken,
      tenantId,
      channel
    );

    return res.status(200).json({
      success: true,
      tenant_id: tenantId,
      waiting: result
    });
  } catch (error) {
    return handleError(res, error, 'getWaitingJtdCount');
  }
};

// ============================================================================
// POST ENDPOINTS
// ============================================================================

/**
 * POST /api/tenant-context/init
 * Initialize tenant context (called on signup)
 */
export const initContext = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('tenant_context', 'initContext')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken, tenantId, productCode } = extractAuth(req);
    const { business_name } = req.body;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
    }
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'x-tenant-id header required'
      });
    }
    if (!productCode) {
      return res.status(400).json({
        success: false,
        error: 'x-product-code header required'
      });
    }

    const result = await tenantContextService.initContext(
      authToken,
      productCode,
      tenantId,
      business_name
    );

    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    return handleError(res, error, 'initContext');
  }
};

/**
 * POST /api/tenant-context/invalidate-cache
 * Invalidate cached context for a tenant
 */
export const invalidateCache = async (req: Request, res: Response) => {
  try {
    const { tenantId, productCode } = extractAuth(req);

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'x-tenant-id header required'
      });
    }
    if (!productCode) {
      return res.status(400).json({
        success: false,
        error: 'x-product-code header required'
      });
    }

    tenantContextService.invalidateCache(productCode, tenantId);

    return res.status(200).json({
      success: true,
      message: 'Cache invalidated',
      product_code: productCode,
      tenant_id: tenantId
    });
  } catch (error) {
    return handleError(res, error, 'invalidateCache');
  }
};

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /api/tenant-context/health
 * Health check endpoint
 */
export const health = async (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    service: 'tenant-context',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
};
