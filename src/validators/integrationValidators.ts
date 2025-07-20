// src/validators/integrationValidators.ts
import { body, ValidationChain } from 'express-validator';

/**
 * Validation rules for creating/updating an integration
 */
export const createIntegrationValidation: ValidationChain[] = [
  // Required fields
  body('master_integration_id')
    .notEmpty().withMessage('master_integration_id is required')
    .isString().withMessage('master_integration_id must be a string'),
  
  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active must be a boolean'),
  
  body('is_live')
    .optional()
    .isBoolean().withMessage('is_live must be a boolean'),
  
  body('credentials')
    .optional()
    .isObject().withMessage('credentials must be an object')
];

/**
 * Validation rules for testing an integration connection
 */
export const testConnectionValidation: ValidationChain[] = [
  // Required fields
  body('master_integration_id')
    .notEmpty().withMessage('master_integration_id is required')
    .isString().withMessage('master_integration_id must be a string'),
  
  body('credentials')
    .notEmpty().withMessage('credentials are required')
    .isObject().withMessage('credentials must be an object'),
  
  body('is_live')
    .optional()
    .isBoolean().withMessage('is_live must be a boolean'),
  
  body('save')
    .optional()
    .isBoolean().withMessage('save must be a boolean'),
    
  // New field for testing existing integrations
  body('integration_id')
    .optional()
    .isString().withMessage('integration_id must be a string')
];

/**
 * Validation rules for toggling integration status
 */
export const toggleStatusValidation: ValidationChain[] = [
  body('is_active')
    .notEmpty().withMessage('is_active is required')
    .isBoolean().withMessage('is_active must be a boolean')
];

/**
 * Legacy validation rules - kept for backward compatibility
 */
export const updateIntegrationValidation: ValidationChain[] = [
  // Required fields
  body('id')
    .notEmpty().withMessage('Integration ID is required')
    .isUUID().withMessage('Integration ID must be a valid UUID'),
  
  // All these fields are optional for update, but validate them if present
  body('credentials')
    .optional()
    .isObject().withMessage('Credentials must be an object'),
  
  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active must be a boolean value'),
  
  body('is_live')
    .optional()
    .isBoolean().withMessage('is_live must be a boolean value')
];

// Alias for backward compatibility
export const testIntegrationValidation = testConnectionValidation;