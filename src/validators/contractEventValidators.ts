// ============================================================================
// Contract Event Validators
// ============================================================================
// Purpose: Input validation for contract events API endpoints
// Pattern: Validate at API layer before calling Edge
// ============================================================================

import { body, query, param, ValidationChain } from 'express-validator';

// Valid enum values (kept in sync with contractEventTypes.ts)
const EVENT_TYPES = ['service', 'billing'];
const EVENT_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'];
const BILLING_SUB_TYPES = ['advance', 'milestone', 'recurring', 'final'];
const SORT_ORDERS = ['asc', 'desc'];
const SORT_FIELDS = ['scheduled_date', 'created_at', 'updated_at', 'status', 'event_type', 'amount'];

// ============================================================================
// LIST / GET
// ============================================================================

/**
 * Validation rules for listing contract events
 * GET /api/contract-events
 */
export const listContractEventsValidation: ValidationChain[] = [
  query('contract_id')
    .optional()
    .isUUID().withMessage('contract_id must be a valid UUID'),

  query('contact_id')
    .optional()
    .isUUID().withMessage('contact_id must be a valid UUID'),

  query('assigned_to')
    .optional()
    .isUUID().withMessage('assigned_to must be a valid UUID'),

  query('status')
    .optional()
    .isIn(EVENT_STATUSES).withMessage(`status must be one of: ${EVENT_STATUSES.join(', ')}`),

  query('event_type')
    .optional()
    .isIn(EVENT_TYPES).withMessage(`event_type must be one of: ${EVENT_TYPES.join(', ')}`),

  query('date_from')
    .optional()
    .isISO8601().withMessage('date_from must be a valid ISO date'),

  query('date_to')
    .optional()
    .isISO8601().withMessage('date_to must be a valid ISO date'),

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
 * Validation rules for date summary
 * GET /api/contract-events/dates
 */
export const dateSummaryValidation: ValidationChain[] = [
  query('contract_id')
    .optional()
    .isUUID().withMessage('contract_id must be a valid UUID'),

  query('contact_id')
    .optional()
    .isUUID().withMessage('contact_id must be a valid UUID'),

  query('assigned_to')
    .optional()
    .isUUID().withMessage('assigned_to must be a valid UUID'),

  query('event_type')
    .optional()
    .isIn(EVENT_TYPES).withMessage(`event_type must be one of: ${EVENT_TYPES.join(', ')}`)
];

// ============================================================================
// CREATE (BULK INSERT)
// ============================================================================

/**
 * Validation rules for creating contract events (bulk)
 * POST /api/contract-events
 */
export const createContractEventsValidation: ValidationChain[] = [
  body('contract_id')
    .notEmpty().withMessage('contract_id is required')
    .isUUID().withMessage('contract_id must be a valid UUID'),

  body('events')
    .isArray({ min: 1, max: 500 }).withMessage('events must be an array with 1-500 items'),

  body('events.*.block_id')
    .notEmpty().withMessage('events[].block_id is required')
    .isUUID().withMessage('events[].block_id must be a valid UUID'),

  body('events.*.block_name')
    .notEmpty().withMessage('events[].block_name is required')
    .isString().withMessage('events[].block_name must be a string')
    .isLength({ min: 1, max: 255 }).withMessage('events[].block_name must be 1-255 characters'),

  body('events.*.category_id')
    .optional()
    .isUUID().withMessage('events[].category_id must be a valid UUID'),

  body('events.*.event_type')
    .notEmpty().withMessage('events[].event_type is required')
    .isIn(EVENT_TYPES).withMessage(`events[].event_type must be one of: ${EVENT_TYPES.join(', ')}`),

  body('events.*.billing_sub_type')
    .optional()
    .isIn(BILLING_SUB_TYPES).withMessage(`events[].billing_sub_type must be one of: ${BILLING_SUB_TYPES.join(', ')}`),

  body('events.*.billing_cycle_label')
    .optional()
    .isString().withMessage('events[].billing_cycle_label must be a string')
    .isLength({ max: 100 }).withMessage('events[].billing_cycle_label cannot exceed 100 characters'),

  body('events.*.sequence_number')
    .notEmpty().withMessage('events[].sequence_number is required')
    .isInt({ min: 1 }).withMessage('events[].sequence_number must be a positive integer'),

  body('events.*.total_occurrences')
    .notEmpty().withMessage('events[].total_occurrences is required')
    .isInt({ min: 1 }).withMessage('events[].total_occurrences must be a positive integer'),

  body('events.*.scheduled_date')
    .notEmpty().withMessage('events[].scheduled_date is required')
    .isISO8601().withMessage('events[].scheduled_date must be a valid ISO date'),

  body('events.*.amount')
    .optional()
    .isFloat({ min: 0 }).withMessage('events[].amount must be a non-negative number'),

  body('events.*.currency')
    .optional()
    .isString().withMessage('events[].currency must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('events[].currency must be a 3-letter ISO code'),

  body('events.*.assigned_to')
    .optional()
    .isUUID().withMessage('events[].assigned_to must be a valid UUID'),

  body('events.*.assigned_to_name')
    .optional()
    .isString().withMessage('events[].assigned_to_name must be a string')
    .isLength({ max: 255 }).withMessage('events[].assigned_to_name cannot exceed 255 characters'),

  body('events.*.notes')
    .optional()
    .isString().withMessage('events[].notes must be a string')
    .isLength({ max: 2000 }).withMessage('events[].notes cannot exceed 2000 characters')
];

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Validation rules for updating a contract event
 * PATCH /api/contract-events/:id
 */
export const updateContractEventValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Event ID must be a valid UUID'),

  body('version')
    .notEmpty().withMessage('version is required for optimistic concurrency')
    .isInt({ min: 1 }).withMessage('version must be a positive integer'),

  body('status')
    .optional()
    .isIn(EVENT_STATUSES).withMessage(`status must be one of: ${EVENT_STATUSES.join(', ')}`),

  body('scheduled_date')
    .optional()
    .isISO8601().withMessage('scheduled_date must be a valid ISO date'),

  body('assigned_to')
    .optional()
    .isUUID().withMessage('assigned_to must be a valid UUID'),

  body('assigned_to_name')
    .optional()
    .isString().withMessage('assigned_to_name must be a string')
    .isLength({ max: 255 }).withMessage('assigned_to_name cannot exceed 255 characters'),

  body('notes')
    .optional()
    .isString().withMessage('notes must be a string')
    .isLength({ max: 2000 }).withMessage('notes cannot exceed 2000 characters'),

  body('amount')
    .optional()
    .isFloat({ min: 0 }).withMessage('amount must be a non-negative number'),

  body('reason')
    .optional()
    .isString().withMessage('reason must be a string')
    .isLength({ max: 500 }).withMessage('reason cannot exceed 500 characters')
];

/**
 * Validation rules for getting a single event by ID
 * GET /api/contract-events/:id
 */
export const getContractEventByIdValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Event ID must be a valid UUID')
];
