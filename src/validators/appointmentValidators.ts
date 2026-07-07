// ============================================================================
// Appointment validators — Stage 3 Appointments
// ============================================================================

import { body, param, ValidationChain } from 'express-validator';

const APPOINTMENT_STATUSES = ['requested', 'accepted', 'declined', 'rescheduled', 'completed', 'no_response'];

export const createAppointmentValidation: ValidationChain[] = [
  body('event_id')
    .isUUID().withMessage('event_id must be a valid UUID'),

  body('notes')
    .optional()
    .isString().withMessage('notes must be a string')
    .isLength({ max: 1000 }).withMessage('notes must be at most 1000 characters')
];

export const updateAppointmentValidation: ValidationChain[] = [
  param('appointmentId')
    .isUUID().withMessage('appointmentId must be a valid UUID'),

  body('status')
    .optional()
    .isIn(APPOINTMENT_STATUSES).withMessage(`status must be one of: ${APPOINTMENT_STATUSES.join(', ')}`),

  body('scheduled_at')
    .optional()
    .isISO8601().withMessage('scheduled_at must be an ISO-8601 datetime'),

  body('notes')
    .optional()
    .isString().withMessage('notes must be a string')
    .isLength({ max: 1000 }).withMessage('notes must be at most 1000 characters'),

  body('version')
    .optional()
    .isInt({ min: 1 }).withMessage('version must be a positive integer')
];
