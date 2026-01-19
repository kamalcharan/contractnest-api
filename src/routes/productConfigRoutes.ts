// ============================================================================
// Product Config Routes
// ============================================================================
// Purpose: Define product config API endpoints
// Pattern: Routes define WHAT endpoints exist, validators enforce contracts
// ============================================================================

import express from 'express';
import { param, body } from 'express-validator';
import * as productConfigController from '../controllers/productConfigController';

const router = express.Router();

// ============================================================================
// VALIDATORS
// ============================================================================

const productCodeValidation = [
  param('productCode')
    .trim()
    .notEmpty()
    .withMessage('Product code is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Product code must be between 2 and 50 characters')
    .matches(/^[a-z][a-z0-9_-]*$/)
    .withMessage('Product code must start with lowercase letter and contain only lowercase letters, numbers, underscores, and hyphens')
];

const updateConfigValidation = [
  ...productCodeValidation,
  body('billing_config')
    .notEmpty()
    .withMessage('billing_config is required')
    .isObject()
    .withMessage('billing_config must be an object'),
  body('billing_config.plan_types')
    .optional()
    .isArray()
    .withMessage('plan_types must be an array'),
  body('billing_config.features')
    .optional()
    .isArray()
    .withMessage('features must be an array'),
  body('changelog')
    .optional()
    .isString()
    .withMessage('changelog must be a string')
    .isLength({ max: 500 })
    .withMessage('changelog must be less than 500 characters')
];

// ============================================================================
// GET ENDPOINTS - Read Operations
// ============================================================================

/**
 * @route GET /api/v1/product-config
 * @description List all active product configurations
 * @returns {ListProductConfigsResponse}
 */
router.get(
  '/',
  productConfigController.listProductConfigs
);

/**
 * @route GET /api/v1/product-config/:productCode
 * @description Get configuration for a specific product
 * @param {string} productCode - Product identifier (e.g., 'contractnest', 'familyknows')
 * @returns {GetProductConfigResponse}
 */
router.get(
  '/:productCode',
  productCodeValidation,
  productConfigController.getProductConfig
);

/**
 * @route GET /api/v1/product-config/:productCode/history
 * @description Get version history for a product configuration
 * @param {string} productCode - Product identifier
 * @returns {GetProductConfigHistoryResponse}
 */
router.get(
  '/:productCode/history',
  productCodeValidation,
  productConfigController.getProductConfigHistory
);

// ============================================================================
// PUT ENDPOINTS - Update Operations
// ============================================================================

/**
 * @route PUT /api/v1/product-config/:productCode
 * @description Update a product configuration (creates new version)
 * @param {string} productCode - Product identifier
 * @body {object} billing_config - New billing configuration
 * @body {string} [changelog] - Description of changes
 * @returns {UpdateProductConfigResponse}
 */
router.put(
  '/:productCode',
  updateConfigValidation,
  productConfigController.updateProductConfig
);

export default router;
