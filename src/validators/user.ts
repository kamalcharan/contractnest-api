// src/validators/user.ts
import { body, ValidationChain } from 'express-validator';

/**
 * Validation rules for updating user profile (current user)
 */
export const updateProfileValidation: ValidationChain[] = [
  body('first_name')
    .optional()
    .isString().withMessage('First name must be a string')
    .isLength({ min: 1, max: 100 }).withMessage('First name must be between 1 and 100 characters')
    .trim(),
  
  body('last_name')
    .optional()
    .isString().withMessage('Last name must be a string')
    .isLength({ min: 1, max: 100 }).withMessage('Last name must be between 1 and 100 characters')
    .trim(),
  
  body('mobile_number')
    .optional()
    .isString().withMessage('Mobile number must be a string')
    .matches(/^[+]?[\d\s-()]+$/).withMessage('Invalid mobile number format'),
  
  body('country_code')
    .optional()
    .isString().withMessage('Country code must be a string')
    .isLength({ min: 2, max: 5 }).withMessage('Invalid country code'),
  
  body('preferred_language')
    .optional()
    .isString().withMessage('Preferred language must be a string')
    .isIn(['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh']).withMessage('Invalid language code'),
  
  body('preferred_theme')
    .optional()
    .isString().withMessage('Preferred theme must be a string')
    .isIn(['light', 'dark', 'system']).withMessage('Invalid theme'),
  
  body('timezone')
    .optional()
    .isString().withMessage('Timezone must be a string')
    .isLength({ max: 50 }).withMessage('Timezone too long')
];

/**
 * Validation rules for updating user (admin)
 */
export const updateUserValidation: ValidationChain[] = [
  body('first_name')
    .optional()
    .isString().withMessage('First name must be a string')
    .isLength({ min: 1, max: 100 }).withMessage('First name must be between 1 and 100 characters')
    .trim(),
  
  body('last_name')
    .optional()
    .isString().withMessage('Last name must be a string')
    .isLength({ min: 1, max: 100 }).withMessage('Last name must be between 1 and 100 characters')
    .trim(),
  
  body('mobile_number')
    .optional()
    .isString().withMessage('Mobile number must be a string')
    .matches(/^[+]?[\d\s-()]+$/).withMessage('Invalid mobile number format'),
  
  body('country_code')
    .optional()
    .isString().withMessage('Country code must be a string')
    .isLength({ min: 2, max: 5 }).withMessage('Invalid country code'),
  
  body('department')
    .optional()
    .isString().withMessage('Department must be a string')
    .isLength({ max: 100 }).withMessage('Department name too long'),
  
  body('employee_id')
    .optional()
    .isString().withMessage('Employee ID must be a string')
    .isLength({ max: 50 }).withMessage('Employee ID too long'),
  
  body('preferred_language')
    .optional()
    .isString().withMessage('Preferred language must be a string')
    .isIn(['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh']).withMessage('Invalid language code'),
  
  body('preferred_theme')
    .optional()
    .isString().withMessage('Preferred theme must be a string')
    .isIn(['light', 'dark', 'system']).withMessage('Invalid theme'),
  
  body('timezone')
    .optional()
    .isString().withMessage('Timezone must be a string')
    .isLength({ max: 50 }).withMessage('Timezone too long'),
  
  // Ensure at least one field is being updated
  body().custom((value) => {
    const allowedFields = [
      'first_name', 'last_name', 'mobile_number', 'country_code',
      'department', 'employee_id', 'preferred_language', 'preferred_theme', 'timezone'
    ];
    
    const hasValidField = allowedFields.some(field => value[field] !== undefined);
    
    if (!hasValidField) {
      throw new Error('At least one field must be provided for update');
    }
    
    return true;
  })
];

/**
 * Validation rules for assigning role to user
 */
export const assignRoleValidation: ValidationChain[] = [
  body('role_id')
    .notEmpty().withMessage('Role ID is required')
    .isUUID().withMessage('Role ID must be a valid UUID')
];