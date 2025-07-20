// src/validators/invitation.ts
import { body, ValidationChain } from 'express-validator';

/**
 * Validation rules for creating an invitation
 */
export const createInvitationValidation: ValidationChain[] = [
  body('email')
    .optional()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('mobile_number')
    .optional()
    .isString().withMessage('Mobile number must be a string')
    .matches(/^[+]?[\d\s-()]+$/).withMessage('Invalid mobile number format'),
  
  body('invitation_method')
    .optional()
    .isIn(['email', 'sms', 'whatsapp']).withMessage('Invalid invitation method'),
  
  body('role_id')
    .optional()
    .isUUID().withMessage('Role ID must be a valid UUID'),
  
  body('custom_message')
    .optional()
    .isString().withMessage('Custom message must be a string')
    .isLength({ max: 500 }).withMessage('Custom message must not exceed 500 characters'),
  
  // Custom validation to ensure at least email or mobile is provided
  body().custom((value) => {
    if (!value.email && !value.mobile_number) {
      throw new Error('Either email or mobile number is required');
    }
    return true;
  })
];

/**
 * Validation rules for validating an invitation
 */
export const validateInvitationValidation: ValidationChain[] = [
  body('user_code')
    .notEmpty().withMessage('User code is required')
    .isString().withMessage('User code must be a string')
    .isLength({ min: 5, max: 20 }).withMessage('Invalid user code length'),
  
  body('secret_code')
    .notEmpty().withMessage('Secret code is required')
    .isString().withMessage('Secret code must be a string')
    .isLength({ min: 5, max: 10 }).withMessage('Invalid secret code length')
];

/**
 * Validation rules for accepting an invitation
 * Now accepts either user_id OR email for existing users
 */
export const acceptInvitationValidation: ValidationChain[] = [
  body('user_code')
    .notEmpty().withMessage('User code is required')
    .isString().withMessage('User code must be a string')
    .isLength({ min: 5, max: 20 }).withMessage('Invalid user code length'),
  
  body('secret_code')
    .notEmpty().withMessage('Secret code is required')
    .isString().withMessage('Secret code must be a string')
    .isLength({ min: 5, max: 10 }).withMessage('Invalid secret code length'),
  
  body('user_id')
    .optional()
    .isUUID().withMessage('User ID must be a valid UUID'),
  
  body('email')
    .optional()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  // Custom validation to ensure either user_id or email is provided
  body().custom((value) => {
    if (!value.user_id && !value.email) {
      throw new Error('Either user_id or email is required');
    }
    return true;
  })
];