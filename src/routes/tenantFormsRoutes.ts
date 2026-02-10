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
} from '../validators/tenantFormsValidators';
import { handleEdgeError, generateRequestId } from '../utils/apiErrors';

const router = Router();

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
        form_template_id: req.body.form_template_id,
        service_event_id: req.body.service_event_id,
        contract_id: req.body.contract_id,
        mapping_id: req.body.mapping_id,
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
