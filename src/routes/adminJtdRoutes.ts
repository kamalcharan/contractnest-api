// ============================================================================
// Admin JTD Management Routes — Release 1 + Release 2
// ============================================================================
// Purpose: Define API routes for Admin JTD dashboard endpoints
// R1: Observability (queue metrics, tenant stats, events, event detail, worker health)
// R2: Actions (retry, cancel, force-complete, DLQ list/requeue/purge)
// Pattern: matches contractValidators.ts + apiErrors.ts patterns
// ============================================================================

import { Router, Request, Response } from 'express';
import { adminJtdService } from '../services/adminJtdService';
import { validateRequest } from '../middleware/validateRequest';
import {
  listTenantStatsValidation,
  listEventsValidation,
  getEventDetailValidation,
  retryEventValidation,
  cancelEventValidation,
  forceCompleteValidation,
  listDlqValidation,
  requeueDlqValidation,
} from '../validators/adminJtdValidators';
import {
  handleEdgeError,
  generateRequestId,
} from '../utils/apiErrors';

import type {
  ListTenantStatsRequest,
  ListEventsRequest,
  RetryEventRequest,
  CancelEventRequest,
  ForceCompleteRequest,
  RequeueDlqRequest,
  ListDlqRequest,
} from '../types/adminJtd.dto';

const router = Router();

// ============================================================================
// GET /api/admin/jtd/queue/metrics
// ============================================================================

/**
 * @route   GET /api/admin/jtd/queue/metrics
 * @desc    Live queue depth, DLQ count, status distribution, actionable counts
 * @access  Admin only (x-is-admin: true)
 * @returns {QueueMetricsResponse}
 */
router.get('/queue/metrics', async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';

    const result = await adminJtdService.getQueueMetrics(authHeader, tenantId);

    res.json(result);
  } catch (error: any) {
    console.error(`[AdminJtdRoutes] GET /queue/metrics error [${requestId}]:`, error.message);
    return handleEdgeError(res, error, requestId);
  }
});

// ============================================================================
// GET /api/admin/jtd/tenants/stats
// ============================================================================

/**
 * @route   GET /api/admin/jtd/tenants/stats
 * @desc    Per-tenant JTD volume, channel mix, success/failure rates, costs
 * @access  Admin only
 * @query   {number} page      - Page number (default: 1)
 * @query   {number} limit     - Items per page (1-100, default: 20)
 * @query   {string} search    - Search tenant name (max 200 chars)
 * @query   {string} sort_by   - total_jtds | failed | total_cost | tenant_name
 * @query   {string} sort_dir  - asc | desc
 * @returns {TenantStatsResponse}
 */
router.get(
  '/tenants/stats',
  listTenantStatsValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const filters: ListTenantStatsRequest = {
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        search: (req.query.search as string) || undefined,
        sort_by: (req.query.sort_by as ListTenantStatsRequest['sort_by']) || undefined,
        sort_dir: (req.query.sort_dir as ListTenantStatsRequest['sort_dir']) || undefined,
      };

      const result = await adminJtdService.getTenantStats(authHeader, tenantId, filters);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminJtdRoutes] GET /tenants/stats error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// GET /api/admin/jtd/events
// ============================================================================

/**
 * @route   GET /api/admin/jtd/events
 * @desc    Paginated, filterable JTD event list across all tenants
 * @access  Admin only
 * @query   {number} page        - Page number (default: 1)
 * @query   {number} limit       - Items per page (1-100, default: 50)
 * @query   {string} tenant_id   - UUID — filter by specific tenant
 * @query   {string} status      - JTD status code (e.g. sent, failed, no_credits)
 * @query   {string} event_type  - notification | reminder | appointment | service_visit | task | payment | document
 * @query   {string} channel     - email | sms | whatsapp | push | inapp
 * @query   {string} source_type - Source type code (e.g. user_invite, contract_created)
 * @query   {string} search      - Recipient name, contact, source ref, or JTD ID
 * @query   {string} date_from   - ISO 8601 date (e.g. 2025-01-01)
 * @query   {string} date_to     - ISO 8601 date
 * @query   {string} sort_by     - created_at | priority | status
 * @query   {string} sort_dir    - asc | desc
 * @returns {EventsListResponse}
 */
router.get(
  '/events',
  listEventsValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const filters: ListEventsRequest = {
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        tenant_id: (req.query.tenant_id as string) || undefined,
        status: (req.query.status as string) || undefined,
        event_type: (req.query.event_type as string) || undefined,
        channel: (req.query.channel as string) || undefined,
        source_type: (req.query.source_type as string) || undefined,
        search: (req.query.search as string) || undefined,
        date_from: (req.query.date_from as string) || undefined,
        date_to: (req.query.date_to as string) || undefined,
        sort_by: (req.query.sort_by as ListEventsRequest['sort_by']) || undefined,
        sort_dir: (req.query.sort_dir as ListEventsRequest['sort_dir']) || undefined,
      };

      const result = await adminJtdService.getEvents(authHeader, tenantId, filters);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminJtdRoutes] GET /events error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// GET /api/admin/jtd/events/:id
// ============================================================================

/**
 * @route   GET /api/admin/jtd/events/:id
 * @desc    Full JTD record with status history timeline for drill-down
 * @access  Admin only
 * @param   {string} id - JTD UUID
 * @returns {EventDetailResponse}
 */
router.get(
  '/events/:id',
  getEventDetailValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const jtdId = req.params.id;

      const result = await adminJtdService.getEventDetail(authHeader, tenantId, jtdId);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminJtdRoutes] GET /events/:id error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// GET /api/admin/jtd/worker/health
// ============================================================================

/**
 * @route   GET /api/admin/jtd/worker/health
 * @desc    Worker status (healthy|idle|degraded|stalled|unknown), throughput, error rates, queue state
 * @access  Admin only
 * @returns {WorkerHealthResponse}
 */
router.get('/worker/health', async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';

    const result = await adminJtdService.getWorkerHealth(authHeader, tenantId);

    res.json(result);
  } catch (error: any) {
    console.error(`[AdminJtdRoutes] GET /worker/health error [${requestId}]:`, error.message);
    return handleEdgeError(res, error, requestId);
  }
});

// ============================================================================
// R2 — ADMIN ACTION ROUTES
// ============================================================================

/**
 * @route   POST /api/admin/jtd/actions/retry
 * @desc    Retry a failed JTD event — resets to queued and re-enqueues
 * @access  Admin only
 * @body    {string} jtd_id - UUID of the failed event
 * @body    {string} [reason] - Optional reason for retry
 * @returns {ActionResponse}
 */
router.post(
  '/actions/retry',
  retryEventValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const adminName = (req.headers['x-admin-name'] as string) || 'Admin';

      const body: RetryEventRequest = {
        jtd_id: req.body.jtd_id,
        reason: req.body.reason,
      };

      const result = await adminJtdService.retryEvent(authHeader, tenantId, adminName, body);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminJtdRoutes] POST /actions/retry error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

/**
 * @route   POST /api/admin/jtd/actions/cancel
 * @desc    Cancel a pending/queued/scheduled JTD event
 * @access  Admin only
 * @body    {string} jtd_id - UUID of the event to cancel
 * @body    {string} [reason] - Optional reason for cancellation
 * @returns {ActionResponse}
 */
router.post(
  '/actions/cancel',
  cancelEventValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const adminName = (req.headers['x-admin-name'] as string) || 'Admin';

      const body: CancelEventRequest = {
        jtd_id: req.body.jtd_id,
        reason: req.body.reason,
      };

      const result = await adminJtdService.cancelEvent(authHeader, tenantId, adminName, body);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminJtdRoutes] POST /actions/cancel error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

/**
 * @route   POST /api/admin/jtd/actions/force-complete
 * @desc    Force-complete a stuck processing event as sent or failed
 * @access  Admin only
 * @body    {string} jtd_id - UUID of the stuck event
 * @body    {string} target_status - "sent" or "failed"
 * @body    {string} [reason] - Optional reason
 * @returns {ActionResponse}
 */
router.post(
  '/actions/force-complete',
  forceCompleteValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const adminName = (req.headers['x-admin-name'] as string) || 'Admin';

      const body: ForceCompleteRequest = {
        jtd_id: req.body.jtd_id,
        target_status: req.body.target_status,
        reason: req.body.reason,
      };

      const result = await adminJtdService.forceComplete(authHeader, tenantId, adminName, body);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminJtdRoutes] POST /actions/force-complete error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

/**
 * @route   GET /api/admin/jtd/dlq/messages
 * @desc    Paginated list of dead-letter queue messages with JTD context
 * @access  Admin only
 * @query   {number} page  - Page number (default: 1)
 * @query   {number} limit - Items per page (1-100, default: 20)
 * @returns {DlqListResponse}
 */
router.get(
  '/dlq/messages',
  listDlqValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const filters: ListDlqRequest = {
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      };

      const result = await adminJtdService.listDlqMessages(authHeader, tenantId, filters);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminJtdRoutes] GET /dlq/messages error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

/**
 * @route   POST /api/admin/jtd/actions/requeue-dlq
 * @desc    Move a single DLQ message back to the main processing queue
 * @access  Admin only
 * @body    {number} msg_id - DLQ message ID
 * @returns {ActionResponse}
 */
router.post(
  '/actions/requeue-dlq',
  requeueDlqValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const adminName = (req.headers['x-admin-name'] as string) || 'Admin';

      const body: RequeueDlqRequest = {
        msg_id: req.body.msg_id,
      };

      const result = await adminJtdService.requeueDlqMessage(authHeader, tenantId, adminName, body);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminJtdRoutes] POST /actions/requeue-dlq error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

/**
 * @route   POST /api/admin/jtd/actions/purge-dlq
 * @desc    Delete all messages from the dead-letter queue
 * @access  Admin only
 * @returns {ActionResponse}
 */
router.post('/actions/purge-dlq', async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';
    const adminName = (req.headers['x-admin-name'] as string) || 'Admin';

    const result = await adminJtdService.purgeDlq(authHeader, tenantId, adminName);

    res.json(result);
  } catch (error: any) {
    console.error(`[AdminJtdRoutes] POST /actions/purge-dlq error [${requestId}]:`, error.message);
    return handleEdgeError(res, error, requestId);
  }
});

export default router;
