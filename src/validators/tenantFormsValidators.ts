// ============================================================================
// Tenant Forms Validators — Selections + Submissions
// ============================================================================

import { query, param, body, ValidationChain } from 'express-validator';

// ---- SELECTIONS ----

export const listSelectionsValidation: ValidationChain[] = [];

export const toggleSelectionValidation: ValidationChain[] = [
  body('form_template_id')
    .isUUID().withMessage('form_template_id must be a valid UUID'),
];

// ---- SUBMISSIONS ----

export const listSubmissionsValidation: ValidationChain[] = [
  query('event_id')
    .optional()
    .isUUID().withMessage('event_id must be a valid UUID'),

  query('contract_id')
    .optional()
    .isUUID().withMessage('contract_id must be a valid UUID'),

  query('template_id')
    .optional()
    .isUUID().withMessage('template_id must be a valid UUID'),
];

export const getSubmissionValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Submission ID must be a valid UUID'),
];

export const createSubmissionValidation: ValidationChain[] = [
  body('form_template_id')
    .isUUID().withMessage('form_template_id must be a valid UUID'),

  body('service_event_id')
    .isUUID().withMessage('service_event_id must be a valid UUID'),

  body('contract_id')
    .isUUID().withMessage('contract_id must be a valid UUID'),

  body('mapping_id')
    .optional()
    .isUUID().withMessage('mapping_id must be a valid UUID'),

  // B2.5: per-asset submission binding (gated server-side by trigger)
  body('event_asset_id')
    .optional()
    .isUUID().withMessage('event_asset_id must be a valid UUID'),

  body('responses')
    .optional()
    .isObject().withMessage('responses must be an object'),

  body('computed_values')
    .optional()
    .isObject().withMessage('computed_values must be an object'),

  body('device_info')
    .optional()
    .isObject().withMessage('device_info must be an object'),
];

// ---- MAPPINGS (B2.5: resolved form mappings for a contract) ----

export const listMappingsValidation: ValidationChain[] = [
  query('contract_id')
    .isUUID().withMessage('contract_id must be a valid UUID'),
];

export const updateSubmissionValidation: ValidationChain[] = [
  param('id')
    .isUUID().withMessage('Submission ID must be a valid UUID'),

  body('responses')
    .optional()
    .isObject().withMessage('responses must be an object'),

  body('computed_values')
    .optional()
    .isObject().withMessage('computed_values must be an object'),

  body('status')
    .optional()
    .isIn(['draft', 'submitted']).withMessage('status must be draft or submitted'),
];
