// ============================================================================
// Contract Validators
// ============================================================================
// Purpose: Input validation for contract API endpoints
// Pattern: Validate at API layer before calling Edge
// ============================================================================

import { body, query, param, ValidationChain } from 'express-validator';

// Valid enum values
const RECORD_TYPES = ['contract', 'rfq'];
const CONTRACT_TYPES = ['client', 'vendor', 'partner', 'fixed_price', 'time_and_materials', 'retainer', 'milestone', 'subscription'];
const CONTRACT_STATUSES = [
  'draft', 'pending_review', 'pending_acceptance', 'active', 'completed', 'cancelled', 'expired',
  'sent', 'quotes_received', 'awarded', 'converted_to_contract'
];
const ACCEPTANCE_METHODS = ['manual', 'auto', 'digital_signature'];
const SORT_ORDERS = ['asc', 'desc'];
const SORT_FIELDS = ['created_at', 'updated_at', 'title', 'contract_number', 'total_value', 'start_date', 'end_date', 'status'];

// ============================================================================
// LIST / GET
// ============================================================================

/**
 * Validation rules for listing contracts
 * GET /api/contracts
 */
export const listContractsValidation: ValidationChain[] = [
  query('record_type')
    .optional()
    .isIn(RECORD_TYPES).withMessage(`record_type must be one of: ${RECORD_TYPES.join(', ')}`),

  query('contract_type')
    .optional()
    .isIn(CONTRACT_TYPES).withMessage(`contract_type must be one of: ${CONTRACT_TYPES.join(', ')}`),

  query('status')
    .optional()
    .isIn(CONTRACT_STATUSES).withMessage(`status must be one of: ${CONTRACT_STATUSES.join(', ')}`),

  query('search')
    .optional()
    .isString().withMessage('search must be a string')
    .isLength({ max: 200 }).withMessage('search cannot exceed 200 characters'),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('page must be a positive integer'),

  query('per_page')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('per_page must be between 1 and 100'),

  query('sort_by')
    .optional()
    .isIn(SORT_FIELDS).withMessage(`sort_by must be one of: ${SORT_FIELDS.join(', ')}`),

  query('sort_order')
    .optional()
    .isIn(SORT_ORDERS).withMessage('sort_order must be asc or desc')
];

/**
 * Validation rules for getting a contract by ID
 * GET /api/contracts/:id
 */
export const getContractByIdValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Contract ID must be a valid UUID')
];

// ============================================================================
// CREATE
// ============================================================================

/**
 * Validation rules for creating a contract
 * POST /api/contracts
 */
export const createContractValidation: ValidationChain[] = [
  body('record_type')
    .notEmpty().withMessage('record_type is required')
    .isIn(RECORD_TYPES).withMessage(`record_type must be one of: ${RECORD_TYPES.join(', ')}`),

  body('title')
    .notEmpty().withMessage('title is required')
    .isString().withMessage('title must be a string')
    .isLength({ min: 1, max: 500 }).withMessage('title must be between 1 and 500 characters'),

  body('contract_type')
    .optional()
    .isIn(CONTRACT_TYPES).withMessage(`contract_type must be one of: ${CONTRACT_TYPES.join(', ')}`),

  body('description')
    .optional()
    .isString().withMessage('description must be a string')
    .isLength({ max: 5000 }).withMessage('description cannot exceed 5000 characters'),

  body('acceptance_method')
    .optional()
    .isIn(ACCEPTANCE_METHODS).withMessage(`acceptance_method must be one of: ${ACCEPTANCE_METHODS.join(', ')}`),

  body('start_date')
    .optional()
    .isISO8601().withMessage('start_date must be a valid ISO date'),

  body('end_date')
    .optional()
    .isISO8601().withMessage('end_date must be a valid ISO date'),

  body('total_value')
    .optional()
    .isFloat({ min: 0 }).withMessage('total_value must be a non-negative number'),

  body('currency')
    .optional()
    .isString().withMessage('currency must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter ISO code'),

  body('payment_terms')
    .optional()
    .isString().withMessage('payment_terms must be a string')
    .isLength({ max: 2000 }).withMessage('payment_terms cannot exceed 2000 characters'),

  body('renewal_terms')
    .optional()
    .isString().withMessage('renewal_terms must be a string')
    .isLength({ max: 2000 }).withMessage('renewal_terms cannot exceed 2000 characters'),

  body('termination_clause')
    .optional()
    .isString().withMessage('termination_clause must be a string')
    .isLength({ max: 2000 }).withMessage('termination_clause cannot exceed 2000 characters'),

  body('notes')
    .optional()
    .isString().withMessage('notes must be a string')
    .isLength({ max: 5000 }).withMessage('notes cannot exceed 5000 characters'),

  body('nomenclature_id')
    .optional()
    .isUUID().withMessage('nomenclature_id must be a valid UUID'),

  body('metadata')
    .optional()
    .isObject().withMessage('metadata must be an object'),

  body('blocks')
    .optional()
    .isArray().withMessage('blocks must be an array'),

  body('blocks.*.block_id')
    .optional()
    .isUUID().withMessage('blocks[].block_id must be a valid UUID'),

  body('blocks.*.sort_order')
    .optional()
    .isInt({ min: 0 }).withMessage('blocks[].sort_order must be a non-negative integer'),

  body('vendors')
    .optional()
    .isArray().withMessage('vendors must be an array'),

  body('vendors.*.contact_id')
    .optional()
    .isUUID().withMessage('vendors[].contact_id must be a valid UUID'),

  body('vendors.*.role')
    .optional()
    .isString().withMessage('vendors[].role must be a string'),

  body('vendors.*.is_primary')
    .optional()
    .isBoolean().withMessage('vendors[].is_primary must be a boolean')
];

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Validation rules for updating a contract
 * PUT /api/contracts/:id
 */
export const updateContractValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Contract ID must be a valid UUID'),

  body('version')
    .notEmpty().withMessage('version is required for optimistic concurrency')
    .isInt({ min: 1 }).withMessage('version must be a positive integer'),

  body('title')
    .optional()
    .isString().withMessage('title must be a string')
    .isLength({ min: 1, max: 500 }).withMessage('title must be between 1 and 500 characters'),

  body('contract_type')
    .optional()
    .isIn(CONTRACT_TYPES).withMessage(`contract_type must be one of: ${CONTRACT_TYPES.join(', ')}`),

  body('description')
    .optional()
    .isString().withMessage('description must be a string')
    .isLength({ max: 5000 }).withMessage('description cannot exceed 5000 characters'),

  body('acceptance_method')
    .optional()
    .isIn(ACCEPTANCE_METHODS).withMessage(`acceptance_method must be one of: ${ACCEPTANCE_METHODS.join(', ')}`),

  body('start_date')
    .optional()
    .isISO8601().withMessage('start_date must be a valid ISO date'),

  body('end_date')
    .optional()
    .isISO8601().withMessage('end_date must be a valid ISO date'),

  body('total_value')
    .optional()
    .isFloat({ min: 0 }).withMessage('total_value must be a non-negative number'),

  body('currency')
    .optional()
    .isString().withMessage('currency must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('currency must be a 3-letter ISO code'),

  body('payment_terms')
    .optional()
    .isString().withMessage('payment_terms must be a string'),

  body('renewal_terms')
    .optional()
    .isString().withMessage('renewal_terms must be a string'),

  body('termination_clause')
    .optional()
    .isString().withMessage('termination_clause must be a string'),

  body('notes')
    .optional()
    .isString().withMessage('notes must be a string'),

  body('nomenclature_id')
    .optional()
    .isUUID().withMessage('nomenclature_id must be a valid UUID'),

  body('metadata')
    .optional()
    .isObject().withMessage('metadata must be an object'),

  body('blocks')
    .optional()
    .isArray().withMessage('blocks must be an array'),

  body('blocks.*.block_id')
    .optional()
    .isUUID().withMessage('blocks[].block_id must be a valid UUID'),

  body('vendors')
    .optional()
    .isArray().withMessage('vendors must be an array'),

  body('vendors.*.contact_id')
    .optional()
    .isUUID().withMessage('vendors[].contact_id must be a valid UUID')
];

// ============================================================================
// STATUS UPDATE
// ============================================================================

/**
 * Validation rules for updating contract status
 * PATCH /api/contracts/:id/status
 */
export const updateContractStatusValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Contract ID must be a valid UUID'),

  body('status')
    .notEmpty().withMessage('status is required')
    .isIn(CONTRACT_STATUSES).withMessage(`status must be one of: ${CONTRACT_STATUSES.join(', ')}`),

  body('version')
    .optional()
    .isInt({ min: 1 }).withMessage('version must be a positive integer'),

  body('note')
    .optional()
    .isString().withMessage('note must be a string')
    .isLength({ max: 2000 }).withMessage('note cannot exceed 2000 characters')
];

// ============================================================================
// DELETE
// ============================================================================

/**
 * Validation rules for deleting a contract
 * DELETE /api/contracts/:id
 */
export const deleteContractValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Contract ID must be a valid UUID'),

  body('version')
    .optional()
    .isInt({ min: 1 }).withMessage('version must be a positive integer'),

  body('note')
    .optional()
    .isString().withMessage('note must be a string')
    .isLength({ max: 2000 }).withMessage('note cannot exceed 2000 characters')
];
