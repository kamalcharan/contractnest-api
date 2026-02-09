// ============================================================================
// Admin Forms Validators
// ============================================================================
// Purpose: Input validation for Admin Smart Forms endpoints
// Pattern: Validate at API layer before calling Edge — matches adminJtdValidators.ts
// ============================================================================

import { query, param, body, ValidationChain } from 'express-validator';

// Valid enum values
const FORM_STATUSES = ['draft', 'in_review', 'approved', 'past'];

const FORM_CATEGORIES = [
  'calibration', 'inspection', 'audit', 'maintenance',
  'clinical', 'pharma', 'compliance', 'onboarding', 'general'
];

const FORM_TYPES = ['pre_service', 'post_service', 'during_service', 'standalone'];

// ============================================================================
// GET /api/admin/forms — List templates
// ============================================================================

export const listTemplatesValidation: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),

  query('status')
    .optional()
    .isIn(FORM_STATUSES).withMessage(`status must be one of: ${FORM_STATUSES.join(', ')}`),

  query('category')
    .optional()
    .isIn(FORM_CATEGORIES).withMessage(`category must be one of: ${FORM_CATEGORIES.join(', ')}`),

  query('form_type')
    .optional()
    .isIn(FORM_TYPES).withMessage(`form_type must be one of: ${FORM_TYPES.join(', ')}`),

  query('search')
    .optional()
    .isString().withMessage('search must be a string')
    .isLength({ max: 200 }).withMessage('search cannot exceed 200 characters')
    .trim()
];

// ============================================================================
// GET /api/admin/forms/:id — Get single template
// ============================================================================

export const getTemplateValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Template ID must be a valid UUID')
];

// ============================================================================
// POST /api/admin/forms — Create template
// ============================================================================

export const createTemplateValidation: ValidationChain[] = [
  body('name')
    .isString().withMessage('name must be a string')
    .isLength({ min: 1, max: 255 }).withMessage('name must be between 1 and 255 characters')
    .trim(),

  body('description')
    .optional()
    .isString().withMessage('description must be a string')
    .isLength({ max: 2000 }).withMessage('description cannot exceed 2000 characters')
    .trim(),

  body('category')
    .isIn(FORM_CATEGORIES).withMessage(`category must be one of: ${FORM_CATEGORIES.join(', ')}`),

  body('form_type')
    .isIn(FORM_TYPES).withMessage(`form_type must be one of: ${FORM_TYPES.join(', ')}`),

  body('tags')
    .optional()
    .isArray().withMessage('tags must be an array'),

  body('tags.*')
    .optional()
    .isString().withMessage('each tag must be a string')
    .isLength({ max: 50 }).withMessage('each tag cannot exceed 50 characters'),

  body('schema')
    .isObject().withMessage('schema must be an object')
    .notEmpty().withMessage('schema is required')
];

// ============================================================================
// PUT /api/admin/forms/:id — Update draft
// ============================================================================

export const updateTemplateValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Template ID must be a valid UUID'),

  body('name')
    .optional()
    .isString().withMessage('name must be a string')
    .isLength({ min: 1, max: 255 }).withMessage('name must be between 1 and 255 characters')
    .trim(),

  body('description')
    .optional()
    .isString().withMessage('description must be a string')
    .isLength({ max: 2000 }).withMessage('description cannot exceed 2000 characters')
    .trim(),

  body('category')
    .optional()
    .isIn(FORM_CATEGORIES).withMessage(`category must be one of: ${FORM_CATEGORIES.join(', ')}`),

  body('form_type')
    .optional()
    .isIn(FORM_TYPES).withMessage(`form_type must be one of: ${FORM_TYPES.join(', ')}`),

  body('tags')
    .optional()
    .isArray().withMessage('tags must be an array'),

  body('tags.*')
    .optional()
    .isString().withMessage('each tag must be a string')
    .isLength({ max: 50 }).withMessage('each tag cannot exceed 50 characters'),

  body('schema')
    .optional()
    .isObject().withMessage('schema must be an object')
];

// ============================================================================
// DELETE /api/admin/forms/:id — Delete draft
// ============================================================================

export const deleteTemplateValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Template ID must be a valid UUID')
];

// ============================================================================
// POST /api/admin/forms/validate — Validate schema (no DB)
// ============================================================================

export const validateSchemaValidation: ValidationChain[] = [
  body('schema')
    .isObject().withMessage('schema must be an object')
    .notEmpty().withMessage('schema is required')
];

// ============================================================================
// POST /api/admin/forms/:id/clone
// ============================================================================

export const cloneTemplateValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Template ID must be a valid UUID')
];

// ============================================================================
// POST /api/admin/forms/:id/submit-review
// ============================================================================

export const submitReviewValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Template ID must be a valid UUID')
];

// ============================================================================
// POST /api/admin/forms/:id/approve
// ============================================================================

export const approveTemplateValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Template ID must be a valid UUID'),

  body('notes')
    .optional()
    .isString().withMessage('notes must be a string')
    .isLength({ max: 1000 }).withMessage('notes cannot exceed 1000 characters')
    .trim()
];

// ============================================================================
// POST /api/admin/forms/:id/reject
// ============================================================================

export const rejectTemplateValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Template ID must be a valid UUID'),

  body('notes')
    .isString().withMessage('notes must be a string')
    .isLength({ min: 1, max: 1000 }).withMessage('notes must be between 1 and 1000 characters')
    .trim()
];

// ============================================================================
// POST /api/admin/forms/:id/new-version
// ============================================================================

export const newVersionValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Template ID must be a valid UUID')
];

// ============================================================================
// POST /api/admin/forms/:id/archive
// ============================================================================

export const archiveTemplateValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Template ID must be a valid UUID')
];
