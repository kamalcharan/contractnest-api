// ============================================================================
// Admin JTD Validators
// ============================================================================
// Purpose: Input validation for Admin JTD Management endpoints (R1 + R2)
// Pattern: Validate at API layer before calling Edge — matches contractValidators.ts
// ============================================================================

import { query, param, body, ValidationChain } from 'express-validator';

// Valid enum values
const JTD_STATUSES = [
  'created', 'pending', 'queued', 'scheduled', 'processing', 'executing',
  'sent', 'delivered', 'read', 'failed', 'bounced', 'cancelled',
  'no_credits', 'expired', 'confirmed', 'completed', 'in_progress',
  'assigned', 'blocked', 'reminded', 'dispatched', 'rescheduled',
  'no_show', 'viewed', 'signed', 'rejected'
];

const EVENT_TYPES = [
  'notification', 'reminder', 'appointment', 'service_visit',
  'task', 'payment', 'document'
];

const CHANNELS = ['email', 'sms', 'whatsapp', 'push', 'inapp'];

const SOURCE_TYPES = [
  'user_invite', 'user_created', 'user_role_changed',
  'contract_created', 'contract_updated', 'contract_status_changed',
  'payment_request', 'payment_received', 'payment_overdue',
  'service_scheduled', 'service_reminder', 'service_completed'
];

const TENANT_SORT_FIELDS = ['total_jtds', 'failed', 'total_cost', 'tenant_name'];
const EVENT_SORT_FIELDS = ['created_at', 'priority', 'status'];
const SORT_DIRS = ['asc', 'desc'];

// ============================================================================
// GET /api/admin/jtd/queue/metrics
// No query params — no validation needed
// ============================================================================

// ============================================================================
// GET /api/admin/jtd/tenants/stats
// ============================================================================

/**
 * Validation rules for listing tenant JTD stats
 * GET /api/admin/jtd/tenants/stats
 */
export const listTenantStatsValidation: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),

  query('search')
    .optional()
    .isString().withMessage('search must be a string')
    .isLength({ max: 200 }).withMessage('search cannot exceed 200 characters')
    .trim(),

  query('sort_by')
    .optional()
    .isIn(TENANT_SORT_FIELDS).withMessage(`sort_by must be one of: ${TENANT_SORT_FIELDS.join(', ')}`),

  query('sort_dir')
    .optional()
    .isIn(SORT_DIRS).withMessage('sort_dir must be asc or desc')
];

// ============================================================================
// GET /api/admin/jtd/events
// ============================================================================

/**
 * Validation rules for listing JTD events
 * GET /api/admin/jtd/events
 */
export const listEventsValidation: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),

  query('tenant_id')
    .optional()
    .isUUID().withMessage('tenant_id must be a valid UUID'),

  query('status')
    .optional()
    .isIn(JTD_STATUSES).withMessage(`status must be one of: ${JTD_STATUSES.join(', ')}`),

  query('event_type')
    .optional()
    .isIn(EVENT_TYPES).withMessage(`event_type must be one of: ${EVENT_TYPES.join(', ')}`),

  query('channel')
    .optional()
    .isIn(CHANNELS).withMessage(`channel must be one of: ${CHANNELS.join(', ')}`),

  query('source_type')
    .optional()
    .isString().withMessage('source_type must be a string')
    .isLength({ max: 50 }).withMessage('source_type cannot exceed 50 characters'),

  query('search')
    .optional()
    .isString().withMessage('search must be a string')
    .isLength({ max: 200 }).withMessage('search cannot exceed 200 characters')
    .trim(),

  query('date_from')
    .optional()
    .isISO8601().withMessage('date_from must be a valid ISO 8601 date'),

  query('date_to')
    .optional()
    .isISO8601().withMessage('date_to must be a valid ISO 8601 date'),

  query('sort_by')
    .optional()
    .isIn(EVENT_SORT_FIELDS).withMessage(`sort_by must be one of: ${EVENT_SORT_FIELDS.join(', ')}`),

  query('sort_dir')
    .optional()
    .isIn(SORT_DIRS).withMessage('sort_dir must be asc or desc')
];

// ============================================================================
// GET /api/admin/jtd/events/:id
// ============================================================================

/**
 * Validation rules for getting a JTD event by ID
 * GET /api/admin/jtd/events/:id
 */
export const getEventDetailValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Event ID must be a valid UUID')
];

// ============================================================================
// GET /api/admin/jtd/worker/health
// No query params — no validation needed
// ============================================================================

// ============================================================================
// R2 — ACTION VALIDATORS
// ============================================================================

/** POST /api/admin/jtd/actions/retry */
export const retryEventValidation: ValidationChain[] = [
  body('jtd_id')
    .isUUID().withMessage('jtd_id must be a valid UUID'),
  body('reason')
    .optional()
    .isString().withMessage('reason must be a string')
    .isLength({ max: 500 }).withMessage('reason cannot exceed 500 characters')
    .trim()
];

/** POST /api/admin/jtd/actions/cancel */
export const cancelEventValidation: ValidationChain[] = [
  body('jtd_id')
    .isUUID().withMessage('jtd_id must be a valid UUID'),
  body('reason')
    .optional()
    .isString().withMessage('reason must be a string')
    .isLength({ max: 500 }).withMessage('reason cannot exceed 500 characters')
    .trim()
];

/** POST /api/admin/jtd/actions/force-complete */
export const forceCompleteValidation: ValidationChain[] = [
  body('jtd_id')
    .isUUID().withMessage('jtd_id must be a valid UUID'),
  body('target_status')
    .isIn(['sent', 'failed']).withMessage('target_status must be "sent" or "failed"'),
  body('reason')
    .optional()
    .isString().withMessage('reason must be a string')
    .isLength({ max: 500 }).withMessage('reason cannot exceed 500 characters')
    .trim()
];

/** GET /api/admin/jtd/dlq/messages */
export const listDlqValidation: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100')
];

/** POST /api/admin/jtd/actions/requeue-dlq */
export const requeueDlqValidation: ValidationChain[] = [
  body('msg_id')
    .isInt({ min: 1 }).withMessage('msg_id must be a positive integer')
];
