// ============================================================================
// Finance validators — Stage 1 Finance AR/AP
// express-validator chains for /api/finance routes.
// ============================================================================

import { body, param, ValidationChain } from 'express-validator';

export const invoiceActionValidation: ValidationChain[] = [
  param('invoiceId')
    .isUUID().withMessage('invoiceId must be a valid UUID')
];

export const cancelInvoiceValidation: ValidationChain[] = [
  param('invoiceId')
    .isUUID().withMessage('invoiceId must be a valid UUID'),

  body('contract_id')
    .isUUID().withMessage('contract_id must be a valid UUID'),

  body('reason')
    .optional()
    .isString().withMessage('reason must be a string')
    .isLength({ max: 500 }).withMessage('reason must be at most 500 characters')
];
