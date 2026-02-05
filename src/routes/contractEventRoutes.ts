// ============================================================================
// Contract Event Routes
// ============================================================================
// Purpose: Define contract events (timeline) API endpoints
// Pattern: Routes define WHAT endpoints exist, validators enforce contracts
// ============================================================================

import express from 'express';
import ContractEventController from '../controllers/contractEventController';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import {
  listContractEventsValidation,
  dateSummaryValidation,
  createContractEventsValidation,
  updateContractEventValidation
} from '../validators/contractEventValidators';

const router = express.Router();
const contractEventController = new ContractEventController();

// =================================================================
// MIDDLEWARE (all routes require authentication)
// =================================================================

// Authentication
router.use(authenticate);

// Tenant ID validation
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

// Rate limiting
const eventRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutes
  max: 200,                             // 200 requests per window (higher for list/dates)
  message: {
    success: false,
    error: 'Too many contract event requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const createEventRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutes
  max: 50,                              // 50 bulk creates per window
  message: {
    success: false,
    error: 'Too many contract event creation requests, please try again later',
    code: 'CREATE_RATE_LIMIT_EXCEEDED'
  }
});

router.use(eventRateLimit);

// =================================================================
// READ ENDPOINTS
// =================================================================

/**
 * @route GET /api/contract-events/dates
 * @description Get date summary (buckets: overdue, today, tomorrow, this_week, next_week, later)
 * @query {string} contract_id - Filter by contract UUID
 * @query {string} contact_id - Filter by customer UUID
 * @query {string} assigned_to - Filter by assignee UUID
 * @query {string} event_type - Filter by event type (service, billing)
 * @returns {DateSummaryResponse}
 */
router.get(
  '/dates',
  dateSummaryValidation,
  contractEventController.getDateSummary
);

/**
 * @route GET /api/contract-events/health
 * @description Health check for contract events service
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'contract-events',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route GET /api/contract-events
 * @description List contract events with filtering and pagination
 * @query {string} contract_id - Filter by contract UUID
 * @query {string} contact_id - Filter by customer UUID
 * @query {string} assigned_to - Filter by assignee UUID
 * @query {string} status - Filter by status (scheduled, in_progress, completed, cancelled, overdue)
 * @query {string} event_type - Filter by event type (service, billing)
 * @query {string} date_from - Filter from date (ISO)
 * @query {string} date_to - Filter to date (ISO)
 * @query {number} page - Page number (default: 1)
 * @query {number} per_page - Items per page (default: 20, max: 100)
 * @query {string} sort_by - Sort field (default: scheduled_date)
 * @query {string} sort_order - Sort direction: asc | desc (default: asc)
 * @returns {ListContractEventsResponse}
 */
router.get(
  '/',
  listContractEventsValidation,
  contractEventController.listEvents
);

// =================================================================
// WRITE ENDPOINTS
// =================================================================

/**
 * @route POST /api/contract-events
 * @description Create contract events (bulk insert, max 500)
 * @header {string} x-idempotency-key - Idempotency key (recommended)
 * @body {CreateContractEventsRequest}
 * @returns {CreateContractEventsResponse} 201 Created
 */
router.post(
  '/',
  createEventRateLimit,
  createContractEventsValidation,
  contractEventController.createEvents
);

/**
 * @route PATCH /api/contract-events/:id
 * @description Update a single contract event (status, date, assignee, notes)
 * @param {string} id - Event UUID
 * @body {UpdateContractEventRequest} - Must include version field
 * @returns {UpdateContractEventResponse}
 */
router.patch(
  '/:id',
  updateContractEventValidation,
  contractEventController.updateEvent
);

export default router;
