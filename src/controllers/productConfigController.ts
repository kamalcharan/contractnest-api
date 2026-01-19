// ============================================================================
// Product Config Controller
// ============================================================================
// Purpose: Handle product config API requests - validation and routing to service
// Pattern: Controller validates → calls service → returns response
// ============================================================================

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { captureException } from '../utils/sentry';
import { validateSupabaseConfig } from '../utils/supabaseConfig';
import { productConfigService } from '../services/productConfigService';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Standard error response handler
 */
function handleError(res: Response, error: any, context: string): Response {
  console.error(`Error in ${context}:`, error);

  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'product_config_controller', action: context },
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
 * Extract auth token from request
 */
function extractAuth(req: Request): { authToken: string | null } {
  return {
    authToken: req.headers.authorization || null
  };
}

// ============================================================================
// GET ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/product-config
 * List all active product configurations
 */
export const listProductConfigs = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('productConfig', 'listProductConfigs')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const { authToken } = extractAuth(req);

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const result = await productConfigService.listProductConfigs(authToken);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'listProductConfigs');
  }
};

/**
 * GET /api/v1/product-config/:productCode
 * Get configuration for a specific product
 */
export const getProductConfig = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('productConfig', 'getProductConfig')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken } = extractAuth(req);
    const { productCode } = req.params;

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    if (!productCode) {
      return res.status(400).json({ error: 'Product code is required' });
    }

    const result = await productConfigService.getProductConfig(authToken, productCode);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'getProductConfig');
  }
};

/**
 * GET /api/v1/product-config/:productCode/history
 * Get version history for a product configuration
 */
export const getProductConfigHistory = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('productConfig', 'getProductConfigHistory')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken } = extractAuth(req);
    const { productCode } = req.params;

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    if (!productCode) {
      return res.status(400).json({ error: 'Product code is required' });
    }

    const result = await productConfigService.getProductConfigHistory(authToken, productCode);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'getProductConfigHistory');
  }
};

// ============================================================================
// PUT ENDPOINTS
// ============================================================================

/**
 * PUT /api/v1/product-config/:productCode
 * Update a product configuration (creates new version)
 */
export const updateProductConfig = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('productConfig', 'updateProductConfig')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!checkValidation(req, res)) return;

    const { authToken } = extractAuth(req);
    const { productCode } = req.params;
    const { billing_config, changelog } = req.body;

    if (!authToken) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    if (!productCode) {
      return res.status(400).json({ error: 'Product code is required' });
    }

    if (!billing_config) {
      return res.status(400).json({ error: 'billing_config is required' });
    }

    const result = await productConfigService.updateProductConfig(authToken, productCode, {
      billing_config,
      changelog,
      updated_by: req.headers['x-user-id'] as string || undefined
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'updateProductConfig');
  }
};
