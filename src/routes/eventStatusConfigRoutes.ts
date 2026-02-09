// ============================================================================
// Event Status Config Routes
// ============================================================================
// Purpose: Define event status configuration API endpoints
// Pattern: Routes define WHAT endpoints exist, validators enforce contracts
// ============================================================================

import express from 'express';
import EventStatusConfigController from '../controllers/eventStatusConfigController';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import { query, body } from 'express-validator';

const router = express.Router();
const controller = new EventStatusConfigController();

// =================================================================
// MIDDLEWARE (all routes require authentication)
// =================================================================

router.use(authenticate);

const ensureTenant = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'x-tenant-id header is required'
      },
      metadata: { timestamp: new Date().toISOString() }
    });
  }
  next();
};

router.use(ensureTenant);

const configRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(configRateLimit);

// =================================================================
// VALIDATORS
// =================================================================

const getStatusesValidation = [
  query('event_type')
    .notEmpty().withMessage('event_type is required')
    .isString().withMessage('event_type must be a string')
    .trim()
];

const getTransitionsValidation = [
  query('event_type')
    .notEmpty().withMessage('event_type is required')
    .isString().withMessage('event_type must be a string')
    .trim(),
  query('from_status')
    .optional()
    .isString().withMessage('from_status must be a string')
    .trim()
];

const upsertStatusValidation = [
  body('event_type')
    .notEmpty().withMessage('event_type is required')
    .isString().trim(),
  body('status_code')
    .notEmpty().withMessage('status_code is required')
    .isString().trim()
    .matches(/^[a-z][a-z0-9_]*$/).withMessage('status_code must be lowercase with underscores only'),
  body('display_name')
    .notEmpty().withMessage('display_name is required')
    .isString().trim()
    .isLength({ max: 100 }).withMessage('display_name must be 100 chars or less'),
  body('description')
    .optional()
    .isString().trim(),
  body('hex_color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('hex_color must be a valid hex color (#RRGGBB)'),
  body('icon_name')
    .optional()
    .isString().trim(),
  body('display_order')
    .optional()
    .isInt({ min: 0 }).withMessage('display_order must be a non-negative integer'),
  body('is_initial')
    .optional()
    .isBoolean().withMessage('is_initial must be a boolean'),
  body('is_terminal')
    .optional()
    .isBoolean().withMessage('is_terminal must be a boolean')
];

const deleteStatusValidation = [
  body('event_type')
    .notEmpty().withMessage('event_type is required')
    .isString().trim(),
  body('status_code')
    .notEmpty().withMessage('status_code is required')
    .isString().trim()
];

const upsertTransitionValidation = [
  body('event_type')
    .notEmpty().withMessage('event_type is required')
    .isString().trim(),
  body('from_status')
    .notEmpty().withMessage('from_status is required')
    .isString().trim(),
  body('to_status')
    .notEmpty().withMessage('to_status is required')
    .isString().trim(),
  body('requires_reason')
    .optional()
    .isBoolean().withMessage('requires_reason must be a boolean'),
  body('requires_evidence')
    .optional()
    .isBoolean().withMessage('requires_evidence must be a boolean')
];

const deleteTransitionValidation = [
  body('id')
    .notEmpty().withMessage('id is required')
    .isUUID().withMessage('id must be a valid UUID')
];

// =================================================================
// READ ENDPOINTS
// =================================================================

/**
 * @route GET /api/event-status-config/statuses
 * @description Get status definitions for an event type (tenant override or system defaults)
 * @query {string} event_type - Event type (e.g. 'service', 'spare_part', 'billing')
 * @returns {GetEventStatusConfigResponse}
 */
router.get(
  '/statuses',
  getStatusesValidation,
  controller.getStatuses
);

/**
 * @route GET /api/event-status-config/transitions
 * @description Get valid transitions for an event type
 * @query {string} event_type - Event type (required)
 * @query {string} from_status - Filter transitions from this status (optional)
 * @returns {GetEventStatusTransitionsResponse}
 */
router.get(
  '/transitions',
  getTransitionsValidation,
  controller.getTransitions
);

// =================================================================
// WRITE ENDPOINTS
// =================================================================

/**
 * @route POST /api/event-status-config/statuses
 * @description Create or update a status definition for this tenant
 * @body {UpsertStatusRequest}
 * @returns {{ success: boolean, id: string }}
 */
router.post(
  '/statuses',
  upsertStatusValidation,
  controller.upsertStatus
);

/**
 * @route DELETE /api/event-status-config/statuses
 * @description Soft-delete a status (also deactivates related transitions)
 * @body {DeleteStatusRequest}
 * @returns {{ success: boolean }}
 */
router.delete(
  '/statuses',
  deleteStatusValidation,
  controller.deleteStatus
);

/**
 * @route POST /api/event-status-config/transitions
 * @description Create or update a status transition
 * @body {UpsertTransitionRequest}
 * @returns {{ success: boolean, id: string }}
 */
router.post(
  '/transitions',
  upsertTransitionValidation,
  controller.upsertTransition
);

/**
 * @route DELETE /api/event-status-config/transitions
 * @description Remove a transition
 * @body {DeleteTransitionRequest}
 * @returns {{ success: boolean }}
 */
router.delete(
  '/transitions',
  deleteTransitionValidation,
  controller.deleteTransition
);

/**
 * @route POST /api/event-status-config/seed
 * @description Seed system default statuses + transitions for this tenant
 * @returns {SeedEventStatusResponse}
 */
router.post(
  '/seed',
  controller.seedDefaults
);

export default router;
