// ============================================================================
// Service Execution Validators
// ============================================================================
// Purpose: Input validation for service execution API endpoints
// Pattern: Validate at API layer before calling Edge
// ============================================================================

import { body, query, param, ValidationChain } from 'express-validator';

// Valid enum values
const TICKET_STATUSES = ['created', 'assigned', 'in_progress', 'evidence_uploaded', 'completed', 'cancelled'];
const EVIDENCE_TYPES = ['upload-form', 'otp', 'service-form'];
const EVIDENCE_STATUSES = ['pending', 'uploaded', 'verified', 'rejected'];
const EVIDENCE_ACTIONS = ['verify', 'reject', 'verify_otp', 'update_file', 'update_form'];
const AUDIT_CATEGORIES = ['status', 'content', 'assignment', 'evidence', 'billing'];
const ENTITY_TYPES = ['contract', 'service_ticket', 'evidence', 'event'];

// ============================================================================
// TICKET: LIST
// ============================================================================

export const listTicketsValidation: ValidationChain[] = [
  query('contract_id')
    .optional()
    .isUUID().withMessage('contract_id must be a valid UUID'),

  query('status')
    .optional()
    .isIn(TICKET_STATUSES).withMessage(`status must be one of: ${TICKET_STATUSES.join(', ')}`),

  query('assigned_to')
    .optional()
    .isUUID().withMessage('assigned_to must be a valid UUID'),

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
    .isInt({ min: 1, max: 100 }).withMessage('per_page must be between 1 and 100')
];

// ============================================================================
// TICKET: GET DETAIL
// ============================================================================

export const getTicketDetailValidation: ValidationChain[] = [
  param('ticketId')
    .isUUID().withMessage('ticketId must be a valid UUID')
];

// ============================================================================
// TICKET: CREATE
// ============================================================================

export const createTicketValidation: ValidationChain[] = [
  body('contract_id')
    .notEmpty().withMessage('contract_id is required')
    .isUUID().withMessage('contract_id must be a valid UUID'),

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

  body('created_by_name')
    .optional()
    .isString().withMessage('created_by_name must be a string')
    .isLength({ max: 255 }).withMessage('created_by_name cannot exceed 255 characters'),

  body('notes')
    .optional()
    .isString().withMessage('notes must be a string')
    .isLength({ max: 2000 }).withMessage('notes cannot exceed 2000 characters'),

  body('event_ids')
    .optional()
    .isArray().withMessage('event_ids must be an array'),

  body('event_ids.*')
    .optional()
    .isUUID().withMessage('Each event_id must be a valid UUID')
];

// ============================================================================
// TICKET: UPDATE
// ============================================================================

export const updateTicketValidation: ValidationChain[] = [
  param('ticketId')
    .isUUID().withMessage('ticketId must be a valid UUID'),

  body('version')
    .optional()
    .isInt({ min: 1 }).withMessage('version must be a positive integer'),

  body('status')
    .optional()
    .isIn(TICKET_STATUSES).withMessage(`status must be one of: ${TICKET_STATUSES.join(', ')}`),

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

  body('completion_notes')
    .optional()
    .isString().withMessage('completion_notes must be a string')
    .isLength({ max: 2000 }).withMessage('completion_notes cannot exceed 2000 characters')
];

// ============================================================================
// EVIDENCE: LIST
// ============================================================================

export const listEvidenceValidation: ValidationChain[] = [
  query('contract_id')
    .optional()
    .isUUID().withMessage('contract_id must be a valid UUID'),

  query('evidence_type')
    .optional()
    .isIn(EVIDENCE_TYPES).withMessage(`evidence_type must be one of: ${EVIDENCE_TYPES.join(', ')}`),

  query('status')
    .optional()
    .isIn(EVIDENCE_STATUSES).withMessage(`status must be one of: ${EVIDENCE_STATUSES.join(', ')}`)
];

export const listTicketEvidenceValidation: ValidationChain[] = [
  param('ticketId')
    .isUUID().withMessage('ticketId must be a valid UUID'),

  ...listEvidenceValidation
];

// ============================================================================
// EVIDENCE: CREATE
// ============================================================================

export const createEvidenceValidation: ValidationChain[] = [
  param('ticketId')
    .isUUID().withMessage('ticketId must be a valid UUID'),

  body('evidence_type')
    .notEmpty().withMessage('evidence_type is required')
    .isIn(EVIDENCE_TYPES).withMessage(`evidence_type must be one of: ${EVIDENCE_TYPES.join(', ')}`),

  body('event_id')
    .optional()
    .isUUID().withMessage('event_id must be a valid UUID'),

  body('block_id')
    .optional()
    .isString().withMessage('block_id must be a string'),

  body('block_name')
    .optional()
    .isString().withMessage('block_name must be a string')
    .isLength({ max: 255 }).withMessage('block_name cannot exceed 255 characters'),

  body('label')
    .optional()
    .isString().withMessage('label must be a string')
    .isLength({ max: 255 }).withMessage('label cannot exceed 255 characters'),

  body('description')
    .optional()
    .isString().withMessage('description must be a string')
    .isLength({ max: 2000 }).withMessage('description cannot exceed 2000 characters'),

  // File fields
  body('file_url')
    .optional()
    .isString().withMessage('file_url must be a string'),

  body('file_name')
    .optional()
    .isString().withMessage('file_name must be a string')
    .isLength({ max: 500 }).withMessage('file_name cannot exceed 500 characters'),

  body('file_type')
    .optional()
    .isString().withMessage('file_type must be a string'),

  // OTP fields
  body('otp_sent_to')
    .optional()
    .isString().withMessage('otp_sent_to must be a string'),

  // Form fields
  body('form_template_name')
    .optional()
    .isString().withMessage('form_template_name must be a string'),

  body('form_data')
    .optional()
    .isObject().withMessage('form_data must be a JSON object'),

  body('uploaded_by_name')
    .optional()
    .isString().withMessage('uploaded_by_name must be a string')
    .isLength({ max: 255 }).withMessage('uploaded_by_name cannot exceed 255 characters')
];

// ============================================================================
// EVIDENCE: UPDATE
// ============================================================================

export const updateEvidenceValidation: ValidationChain[] = [
  param('ticketId')
    .isUUID().withMessage('ticketId must be a valid UUID'),

  param('evidenceId')
    .isUUID().withMessage('evidenceId must be a valid UUID'),

  body('action')
    .notEmpty().withMessage('action is required')
    .isIn(EVIDENCE_ACTIONS).withMessage(`action must be one of: ${EVIDENCE_ACTIONS.join(', ')}`),

  body('payload')
    .optional()
    .isObject().withMessage('payload must be a JSON object')
];

// ============================================================================
// AUDIT: LIST
// ============================================================================

export const getAuditLogValidation: ValidationChain[] = [
  query('contract_id')
    .optional()
    .isUUID().withMessage('contract_id must be a valid UUID'),

  query('entity_type')
    .optional()
    .isIn(ENTITY_TYPES).withMessage(`entity_type must be one of: ${ENTITY_TYPES.join(', ')}`),

  query('entity_id')
    .optional()
    .isUUID().withMessage('entity_id must be a valid UUID'),

  query('category')
    .optional()
    .isIn(AUDIT_CATEGORIES).withMessage(`category must be one of: ${AUDIT_CATEGORIES.join(', ')}`),

  query('performed_by')
    .optional()
    .isUUID().withMessage('performed_by must be a valid UUID'),

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
    .isInt({ min: 1, max: 100 }).withMessage('per_page must be between 1 and 100')
];
