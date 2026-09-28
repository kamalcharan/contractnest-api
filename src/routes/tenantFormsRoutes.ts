// ============================================================================
// Tenant Forms Routes — Selections + Submissions
// ============================================================================

import { Router, Request, Response } from 'express';
import { tenantFormsService } from '../services/tenantFormsService';
import { validateRequest } from '../middleware/validateRequest';
import {
  listSelectionsValidation,
  toggleSelectionValidation,
  listSubmissionsValidation,
  getSubmissionValidation,
  createSubmissionValidation,
  updateSubmissionValidation,
  listMappingsValidation,
} from '../validators/tenantFormsValidators';
import { handleEdgeError, generateRequestId } from '../utils/apiErrors';

const router = Router();

// ============================================================================
// TEMPLATES — Approved form templates (B2.4 block picker)
// ============================================================================

// GET /api/forms/templates — List form templates (approved by default)
router.get('/templates', async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';

    const result = await tenantFormsService.listTemplates(authHeader, tenantId, {
      status: (req.query.status as string) || 'approved',
      category: req.query.category as string | undefined,
      form_type: req.query.form_type as string | undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (error: any) {
    console.error(`[TenantFormsRoutes] GET /templates error [${requestId}]:`, error.message);
    return handleEdgeError(res, error, requestId);
  }
});

// GET /api/forms/templates/:id — Single template with schema (B3.4 form-fill)
router.get('/templates/:id', getSubmissionValidation, validateRequest, async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';

    const result = await tenantFormsService.getTemplate(authHeader, tenantId, req.params.id);
    res.json(result);
  } catch (error: any) {
    console.error(`[TenantFormsRoutes] GET /templates/:id error [${requestId}]:`, error.message);
    return handleEdgeError(res, error, requestId);
  }
});

// ============================================================================
// MAPPINGS — Resolved form mappings for a contract (B2.5 read path)
// ============================================================================

// GET /api/forms/mappings?contract_id=... — Active resolved mappings + template names
router.get(
  '/mappings',
  listMappingsValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const result = await tenantFormsService.listMappings(
        authHeader,
        tenantId,
        req.query.contract_id as string
      );
      res.json(result);
    } catch (error: any) {
      console.error(`[TenantFormsRoutes] GET /mappings error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// SELECTIONS — Tenant bookmarks for approved templates
// ============================================================================

// GET /api/forms/selections — List tenant's selected templates
router.get(
  '/selections',
  listSelectionsValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const result = await tenantFormsService.listSelections(authHeader, tenantId);
      res.json(result);
    } catch (error: any) {
      console.error(`[TenantFormsRoutes] GET /selections error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// POST /api/forms/selections — Toggle template selection on/off
router.post(
  '/selections',
  toggleSelectionValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const result = await tenantFormsService.toggleSelection(authHeader, tenantId, {
        form_template_id: req.body.form_template_id,
      });
      res.json(result);
    } catch (error: any) {
      console.error(`[TenantFormsRoutes] POST /selections error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// SUBMISSIONS — Form data filled by tenant users
// ============================================================================

// GET /api/forms/submissions — List submissions (filter by event, contract, template)
router.get(
  '/submissions',
  listSubmissionsValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const result = await tenantFormsService.listSubmissions(authHeader, tenantId, {
        event_id: (req.query.event_id as string) || undefined,
        contract_id: (req.query.contract_id as string) || undefined,
        template_id: (req.query.template_id as string) || undefined,
      });
      res.json(result);
    } catch (error: any) {
      console.error(`[TenantFormsRoutes] GET /submissions error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// GET /api/forms/submissions/start-check — preflight the database start rule
router.get('/submissions/start-check', async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  try {
    const eventId = String(req.query.event_id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId))
      return res.status(400).json({ error: 'Invalid service' });
    const result = await tenantFormsService.getServiceStartProblem(
      req.headers.authorization || '', String(req.headers['x-tenant-id'] || ''), eventId,
    );
    return res.json(result);
  } catch (error: any) {
    console.error(`[TenantFormsRoutes] GET /submissions/start-check error [${requestId}]:`, error.message);
    return handleEdgeError(res, error, requestId);
  }
});

// GET /api/forms/submissions/context — trusted registry/service values
router.get('/submissions/context', async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  try {
    const eventId = String(req.query.event_id || '');
    const templateId = String(req.query.template_id || '');
    const eventAssetId = req.query.event_asset_id ? String(req.query.event_asset_id) : undefined;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(eventId) || !uuid.test(templateId) || (eventAssetId && !uuid.test(eventAssetId)))
      return res.status(400).json({ error: 'Invalid form context' });
    const result = await tenantFormsService.getExecutionContext(
      req.headers.authorization || '', String(req.headers['x-tenant-id'] || ''),
      eventId, templateId, eventAssetId,
    );
    return res.json(result);
  } catch (error: any) {
    console.error(`[TenantFormsRoutes] GET /submissions/context error [${requestId}]:`, error.message);
    return handleEdgeError(res, error, requestId);
  }
});

// GET /api/forms/submissions/:id — Get single submission
router.get(
  '/submissions/:id',
  getSubmissionValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const result = await tenantFormsService.getSubmission(authHeader, tenantId, req.params.id);
      res.json(result);
    } catch (error: any) {
      console.error(`[TenantFormsRoutes] GET /submissions/:id error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// POST /api/forms/submissions — Create submission
router.post(
  '/submissions',
  createSubmissionValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const result = await tenantFormsService.createSubmission(authHeader, tenantId, {
        status: req.body.status,
        form_template_id: req.body.form_template_id,
        service_event_id: req.body.service_event_id,
        contract_id: req.body.contract_id,
        mapping_id: req.body.mapping_id,
        event_asset_id: req.body.event_asset_id,
        responses: req.body.responses,
        computed_values: req.body.computed_values,
        device_info: req.body.device_info,
      });
      res.status(201).json(result);
    } catch (error: any) {
      console.error(`[TenantFormsRoutes] POST /submissions error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// PUT /api/forms/submissions/:id — Update submission (draft/submitted only)
router.put(
  '/submissions/:id',
  updateSubmissionValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const result = await tenantFormsService.updateSubmission(authHeader, tenantId, req.params.id, {
        responses: req.body.responses,
        computed_values: req.body.computed_values,
        status: req.body.status,
      });
      res.json(result);
    } catch (error: any) {
      console.error(`[TenantFormsRoutes] PUT /submissions/:id error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

export default router;
