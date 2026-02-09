// ============================================================================
// Admin Forms Routes — Smart Forms Template Management
// ============================================================================
// Purpose: Define API routes for Admin Smart Forms endpoints
// Pattern: matches adminJtdRoutes.ts — thin handler, service proxy, edge function
// ============================================================================

import { Router, Request, Response } from 'express';
import { adminFormsService } from '../services/adminFormsService';
import { validateRequest } from '../middleware/validateRequest';
import {
  listTemplatesValidation,
  getTemplateValidation,
  createTemplateValidation,
  updateTemplateValidation,
  deleteTemplateValidation,
  validateSchemaValidation,
  cloneTemplateValidation,
  submitReviewValidation,
  approveTemplateValidation,
  rejectTemplateValidation,
  newVersionValidation,
  archiveTemplateValidation,
} from '../validators/adminFormsValidators';
import {
  handleEdgeError,
  generateRequestId,
} from '../utils/apiErrors';

import type {
  ListTemplatesRequest,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  ValidateSchemaRequest,
  ApproveTemplateRequest,
  RejectTemplateRequest,
} from '../types/adminForms.dto';

const router = Router();

// ============================================================================
// GET /api/admin/forms — List templates
// ============================================================================

/**
 * @route   GET /api/admin/forms
 * @desc    List form templates with filters and pagination
 * @access  Admin only (x-is-admin: true)
 * @query   {number} page      - Page number (default: 1)
 * @query   {number} limit     - Items per page (1-100, default: 20)
 * @query   {string} status    - draft | in_review | approved | past
 * @query   {string} category  - calibration | inspection | audit | etc.
 * @query   {string} form_type - pre_service | post_service | during_service | standalone
 * @query   {string} search    - Search name + description
 * @returns {ListTemplatesResponse}
 */
router.get(
  '/',
  listTemplatesValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const filters: ListTemplatesRequest = {
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        status: (req.query.status as string) || undefined,
        category: (req.query.category as string) || undefined,
        form_type: (req.query.form_type as string) || undefined,
        search: (req.query.search as string) || undefined,
      };

      const result = await adminFormsService.listTemplates(authHeader, tenantId, filters);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] GET / error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// GET /api/admin/forms/:id — Get single template
// ============================================================================

/**
 * @route   GET /api/admin/forms/:id
 * @desc    Get a single form template by ID
 * @access  Admin only
 * @param   {string} id - Template UUID
 * @returns {FormTemplateResponse}
 */
router.get(
  '/:id',
  getTemplateValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const templateId = req.params.id;

      const result = await adminFormsService.getTemplate(authHeader, tenantId, templateId);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] GET /:id error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// POST /api/admin/forms — Create template
// ============================================================================

/**
 * @route   POST /api/admin/forms
 * @desc    Create a new form template (starts as draft)
 * @access  Admin only
 * @body    {string} name       - Template name (required)
 * @body    {string} category   - Form category (required)
 * @body    {string} form_type  - Form type (required)
 * @body    {object} schema     - Form schema JSON (required)
 * @body    {string} [description] - Optional description
 * @body    {string[]} [tags]   - Optional tags
 * @returns {FormTemplateResponse}
 */
router.post(
  '/',
  createTemplateValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const body: CreateTemplateRequest = {
        name: req.body.name,
        description: req.body.description,
        category: req.body.category,
        form_type: req.body.form_type,
        tags: req.body.tags,
        schema: req.body.schema,
      };

      const result = await adminFormsService.createTemplate(authHeader, tenantId, body);

      res.status(201).json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] POST / error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// POST /api/admin/forms/validate — Validate schema (no DB)
// ============================================================================

/**
 * @route   POST /api/admin/forms/validate
 * @desc    Validate a form schema JSON without saving to DB
 * @access  Admin only
 * @body    {object} schema - Form schema JSON to validate
 * @returns {ValidateSchemaResponse}
 */
router.post(
  '/validate',
  validateSchemaValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const body: ValidateSchemaRequest = {
        schema: req.body.schema,
      };

      const result = await adminFormsService.validateSchema(authHeader, tenantId, body);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] POST /validate error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// PUT /api/admin/forms/:id — Update draft
// ============================================================================

/**
 * @route   PUT /api/admin/forms/:id
 * @desc    Update a draft form template (only drafts can be edited)
 * @access  Admin only
 * @param   {string} id - Template UUID
 * @body    {string} [name]        - Updated name
 * @body    {string} [description] - Updated description
 * @body    {string} [category]    - Updated category
 * @body    {string} [form_type]   - Updated form type
 * @body    {string[]} [tags]      - Updated tags
 * @body    {object} [schema]      - Updated schema
 * @returns {FormTemplateResponse}
 */
router.put(
  '/:id',
  updateTemplateValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const templateId = req.params.id;

      const body: UpdateTemplateRequest = {};
      if (req.body.name !== undefined) body.name = req.body.name;
      if (req.body.description !== undefined) body.description = req.body.description;
      if (req.body.category !== undefined) body.category = req.body.category;
      if (req.body.form_type !== undefined) body.form_type = req.body.form_type;
      if (req.body.tags !== undefined) body.tags = req.body.tags;
      if (req.body.schema !== undefined) body.schema = req.body.schema;

      const result = await adminFormsService.updateTemplate(authHeader, tenantId, templateId, body);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] PUT /:id error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// DELETE /api/admin/forms/:id — Delete draft
// ============================================================================

/**
 * @route   DELETE /api/admin/forms/:id
 * @desc    Delete a draft form template (only drafts can be deleted)
 * @access  Admin only
 * @param   {string} id - Template UUID
 * @returns {DeleteTemplateResponse}
 */
router.delete(
  '/:id',
  deleteTemplateValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const templateId = req.params.id;

      const result = await adminFormsService.deleteTemplate(authHeader, tenantId, templateId);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] DELETE /:id error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

// ============================================================================
// WORKFLOW ACTIONS — Status Transitions + Multi-Step RPCs
// ============================================================================

/**
 * @route   POST /api/admin/forms/:id/clone
 * @desc    Clone a template to a new draft (any status source OK)
 * @access  Admin only
 * @param   {string} id - Template UUID to clone
 * @returns {FormTemplateResponse}
 */
router.post(
  '/:id/clone',
  cloneTemplateValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const templateId = req.params.id;

      const result = await adminFormsService.cloneTemplate(authHeader, tenantId, templateId);

      res.status(201).json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] POST /:id/clone error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

/**
 * @route   POST /api/admin/forms/:id/submit-review
 * @desc    Submit a draft template for review (draft → in_review)
 * @access  Admin only
 * @param   {string} id - Template UUID
 * @returns {FormTemplateResponse}
 */
router.post(
  '/:id/submit-review',
  submitReviewValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const templateId = req.params.id;

      const result = await adminFormsService.submitForReview(authHeader, tenantId, templateId);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] POST /:id/submit-review error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

/**
 * @route   POST /api/admin/forms/:id/approve
 * @desc    Approve a template (in_review → approved)
 * @access  Admin only
 * @param   {string} id - Template UUID
 * @body    {string} [notes] - Optional approval notes
 * @returns {FormTemplateResponse}
 */
router.post(
  '/:id/approve',
  approveTemplateValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const templateId = req.params.id;

      const body: ApproveTemplateRequest = {
        notes: req.body.notes,
      };

      const result = await adminFormsService.approveTemplate(authHeader, tenantId, templateId, body);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] POST /:id/approve error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

/**
 * @route   POST /api/admin/forms/:id/reject
 * @desc    Reject a template (in_review → draft, notes required)
 * @access  Admin only
 * @param   {string} id - Template UUID
 * @body    {string} notes - Rejection notes (required)
 * @returns {FormTemplateResponse}
 */
router.post(
  '/:id/reject',
  rejectTemplateValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const templateId = req.params.id;

      const body: RejectTemplateRequest = {
        notes: req.body.notes,
      };

      const result = await adminFormsService.rejectTemplate(authHeader, tenantId, templateId, body);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] POST /:id/reject error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

/**
 * @route   POST /api/admin/forms/:id/new-version
 * @desc    Create new version from approved template (approved → past + new draft v+1)
 * @access  Admin only
 * @param   {string} id - Template UUID (must be approved)
 * @returns {FormTemplateResponse}
 */
router.post(
  '/:id/new-version',
  newVersionValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const templateId = req.params.id;

      const result = await adminFormsService.newVersion(authHeader, tenantId, templateId);

      res.status(201).json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] POST /:id/new-version error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

/**
 * @route   POST /api/admin/forms/:id/archive
 * @desc    Archive an approved template (approved → past)
 * @access  Admin only
 * @param   {string} id - Template UUID (must be approved)
 * @returns {FormTemplateResponse}
 */
router.post(
  '/:id/archive',
  archiveTemplateValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    const requestId = generateRequestId();
    try {
      const authHeader = req.headers.authorization || '';
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const templateId = req.params.id;

      const result = await adminFormsService.archiveTemplate(authHeader, tenantId, templateId);

      res.json(result);
    } catch (error: any) {
      console.error(`[AdminFormsRoutes] POST /:id/archive error [${requestId}]:`, error.message);
      return handleEdgeError(res, error, requestId);
    }
  }
);

export default router;
