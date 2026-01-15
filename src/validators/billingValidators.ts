// ============================================================================
// Billing Validators
// ============================================================================
// Purpose: Input validation for billing API endpoints
// Pattern: Validate at API layer before calling Edge
// ============================================================================

import { body, query, param, ValidationChain } from 'express-validator';

/**
 * Validation rules for recording usage
 * POST /api/billing/usage
 */
export const recordUsageValidation: ValidationChain[] = [
  body('metric_type')
    .notEmpty().withMessage('metric_type is required')
    .isString().withMessage('metric_type must be a string')
    .isIn(['contract', 'user', 'storage_mb', 'notification_email', 'notification_sms', 'notification_whatsapp', 'ai_report', 'api_call'])
    .withMessage('Invalid metric_type'),

  body('quantity')
    .optional()
    .isInt({ min: 1 }).withMessage('quantity must be a positive integer'),

  body('metadata')
    .optional()
    .isObject().withMessage('metadata must be an object'),

  body('tenant_id')
    .optional()
    .isUUID().withMessage('tenant_id must be a valid UUID')
];

/**
 * Validation rules for deducting credits
 * POST /api/billing/credits/deduct
 */
export const deductCreditsValidation: ValidationChain[] = [
  body('credit_type')
    .notEmpty().withMessage('credit_type is required')
    .isString().withMessage('credit_type must be a string')
    .isIn(['notification', 'ai_report'])
    .withMessage('Invalid credit_type'),

  body('quantity')
    .notEmpty().withMessage('quantity is required')
    .isInt({ min: 1 }).withMessage('quantity must be a positive integer'),

  body('channel')
    .optional()
    .isString().withMessage('channel must be a string')
    .isIn(['email', 'sms', 'whatsapp'])
    .withMessage('Invalid channel'),

  body('reference_type')
    .optional()
    .isString().withMessage('reference_type must be a string'),

  body('reference_id')
    .optional()
    .isUUID().withMessage('reference_id must be a valid UUID'),

  body('description')
    .optional()
    .isString().withMessage('description must be a string')
    .isLength({ max: 500 }).withMessage('description cannot exceed 500 characters'),

  body('tenant_id')
    .optional()
    .isUUID().withMessage('tenant_id must be a valid UUID')
];

/**
 * Validation rules for adding credits
 * POST /api/billing/credits/add
 */
export const addCreditsValidation: ValidationChain[] = [
  body('credit_type')
    .notEmpty().withMessage('credit_type is required')
    .isString().withMessage('credit_type must be a string')
    .isIn(['notification', 'ai_report'])
    .withMessage('Invalid credit_type'),

  body('quantity')
    .notEmpty().withMessage('quantity is required')
    .isInt({ min: 1 }).withMessage('quantity must be a positive integer'),

  body('channel')
    .optional()
    .isString().withMessage('channel must be a string')
    .isIn(['email', 'sms', 'whatsapp'])
    .withMessage('Invalid channel'),

  body('source')
    .optional()
    .isString().withMessage('source must be a string')
    .isIn(['topup', 'subscription', 'manual', 'bonus', 'refund'])
    .withMessage('Invalid source'),

  body('reference_id')
    .optional()
    .isUUID().withMessage('reference_id must be a valid UUID'),

  body('description')
    .optional()
    .isString().withMessage('description must be a string')
    .isLength({ max: 500 }).withMessage('description cannot exceed 500 characters'),

  body('tenant_id')
    .optional()
    .isUUID().withMessage('tenant_id must be a valid UUID')
];

/**
 * Validation rules for purchasing topup
 * POST /api/billing/credits/topup
 */
export const purchaseTopupValidation: ValidationChain[] = [
  body('pack_id')
    .notEmpty().withMessage('pack_id is required')
    .isUUID().withMessage('pack_id must be a valid UUID'),

  body('payment_reference')
    .optional()
    .isString().withMessage('payment_reference must be a string'),

  body('tenant_id')
    .optional()
    .isUUID().withMessage('tenant_id must be a valid UUID')
];

/**
 * Validation rules for checking credit availability
 * POST /api/billing/credits/check
 */
export const checkCreditsValidation: ValidationChain[] = [
  body('credit_type')
    .notEmpty().withMessage('credit_type is required')
    .isString().withMessage('credit_type must be a string'),

  body('quantity')
    .notEmpty().withMessage('quantity is required')
    .isInt({ min: 1 }).withMessage('quantity must be a positive integer'),

  body('channel')
    .optional()
    .isString().withMessage('channel must be a string'),

  body('tenant_id')
    .optional()
    .isUUID().withMessage('tenant_id must be a valid UUID')
];

/**
 * Validation for tenant ID path parameter
 * GET /api/billing/status/:tenantId
 * GET /api/billing/subscription/:tenantId
 * GET /api/billing/credits/:tenantId
 * GET /api/billing/usage/:tenantId
 * GET /api/billing/invoice-estimate/:tenantId
 * GET /api/billing/alerts/:tenantId
 */
export const tenantIdParamValidation: ValidationChain[] = [
  param('tenantId')
    .notEmpty().withMessage('tenantId is required')
    .isUUID().withMessage('tenantId must be a valid UUID')
];

/**
 * Validation for usage summary query params
 * GET /api/billing/usage/:tenantId?period_start=&period_end=
 */
export const usageSummaryQueryValidation: ValidationChain[] = [
  query('period_start')
    .optional()
    .isISO8601().withMessage('period_start must be a valid ISO date'),

  query('period_end')
    .optional()
    .isISO8601().withMessage('period_end must be a valid ISO date')
];

/**
 * Validation for topup packs query params
 * GET /api/billing/topup-packs?product_code=&credit_type=
 */
export const topupPacksQueryValidation: ValidationChain[] = [
  query('product_code')
    .optional()
    .isString().withMessage('product_code must be a string')
    .isIn(['contractnest', 'familyknows', 'kaladristi'])
    .withMessage('Invalid product_code'),

  query('credit_type')
    .optional()
    .isString().withMessage('credit_type must be a string')
    .isIn(['notification', 'ai_report'])
    .withMessage('Invalid credit_type')
];
