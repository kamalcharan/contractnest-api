// src/validators/taxSettingsValidators.ts
// Complete validation middleware for Tax Settings functionality

import { body, param, query, ValidationChain, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { TAX_CONSTANTS, TaxErrorCode, TAX_ERROR_MESSAGES } from '../types/taxTypes';

/**
 * Middleware to handle validation results
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.type === 'field' ? (error as any).path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? (error as any).value : undefined
    }));

    console.log('Validation errors:', errorMessages);
    
    return res.status(400).json({
      error: 'Validation failed',
      details: errorMessages,
      code: TaxErrorCode.VALIDATION_ERROR
    });
  }
  
  next();
};

/**
 * Validation for tax settings request body
 */
export const validateTaxSettingsRequest: ValidationChain[] = [
  body('display_mode')
    .notEmpty()
    .withMessage('Display mode is required')
    .isIn([TAX_CONSTANTS.DISPLAY_MODES.INCLUDING_TAX, TAX_CONSTANTS.DISPLAY_MODES.EXCLUDING_TAX])
    .withMessage(`Display mode must be either "${TAX_CONSTANTS.DISPLAY_MODES.INCLUDING_TAX}" or "${TAX_CONSTANTS.DISPLAY_MODES.EXCLUDING_TAX}"`),
    
  body('default_tax_rate_id')
    .optional({ nullable: true })
    .isUUID()
    .withMessage('Default tax rate ID must be a valid UUID'),
];

/**
 * Validation for creating a new tax rate
 */
export const validateCreateTaxRateRequest: ValidationChain[] = [
  body('name')
    .notEmpty()
    .withMessage('Tax rate name is required')
    .trim()
    .isLength({ min: 1, max: TAX_CONSTANTS.VALIDATION.MAX_NAME_LENGTH })
    .withMessage(`Name must be between 1 and ${TAX_CONSTANTS.VALIDATION.MAX_NAME_LENGTH} characters`)
    .matches(/^[a-zA-Z0-9\s\-_()%]+$/)
    .withMessage('Name can only contain letters, numbers, spaces, hyphens, underscores, parentheses, and percent signs'),
    
  body('rate')
    .notEmpty()
    .withMessage('Tax rate is required')
    .isFloat({ min: TAX_CONSTANTS.VALIDATION.MIN_RATE, max: TAX_CONSTANTS.VALIDATION.MAX_RATE })
    .withMessage(`Rate must be between ${TAX_CONSTANTS.VALIDATION.MIN_RATE} and ${TAX_CONSTANTS.VALIDATION.MAX_RATE}`)
    .toFloat(),
    
  body('description')
    .optional()
    .trim()
    .isLength({ max: TAX_CONSTANTS.VALIDATION.MAX_DESCRIPTION_LENGTH })
    .withMessage(`Description cannot exceed ${TAX_CONSTANTS.VALIDATION.MAX_DESCRIPTION_LENGTH} characters`),
    
  body('is_default')
    .optional()
    .isBoolean()
    .withMessage('is_default must be a boolean value')
    .toBoolean(),
];

/**
 * Validation for updating a tax rate
 */
export const validateUpdateTaxRateRequest: ValidationChain[] = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: TAX_CONSTANTS.VALIDATION.MAX_NAME_LENGTH })
    .withMessage(`Name must be between 1 and ${TAX_CONSTANTS.VALIDATION.MAX_NAME_LENGTH} characters`)
    .matches(/^[a-zA-Z0-9\s\-_()%]+$/)
    .withMessage('Name can only contain letters, numbers, spaces, hyphens, underscores, parentheses, and percent signs'),
    
  body('rate')
    .optional()
    .isFloat({ min: TAX_CONSTANTS.VALIDATION.MIN_RATE, max: TAX_CONSTANTS.VALIDATION.MAX_RATE })
    .withMessage(`Rate must be between ${TAX_CONSTANTS.VALIDATION.MIN_RATE} and ${TAX_CONSTANTS.VALIDATION.MAX_RATE}`)
    .toFloat(),
    
  body('description')
    .optional()
    .trim()
    .isLength({ max: TAX_CONSTANTS.VALIDATION.MAX_DESCRIPTION_LENGTH })
    .withMessage(`Description cannot exceed ${TAX_CONSTANTS.VALIDATION.MAX_DESCRIPTION_LENGTH} characters`),
    
  body('is_default')
    .optional()
    .isBoolean()
    .withMessage('is_default must be a boolean value')
    .toBoolean(),
    
  // Ensure at least one field is provided for update
  body()
    .custom((value, { req }) => {
      const allowedFields = ['name', 'rate', 'description', 'is_default'];
      const providedFields = Object.keys(req.body).filter(key => allowedFields.includes(key));
      
      if (providedFields.length === 0) {
        throw new Error('At least one field must be provided for update');
      }
      
      return true;
    }),
];

/**
 * Validation for tax rate ID parameter
 */
export const validateTaxRateId: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('Tax rate ID is required')
    .isUUID()
    .withMessage('Tax rate ID must be a valid UUID'),
];

/**
 * Validation for required headers
 */
export const validateRequiredHeaders: ValidationChain[] = [
  // Note: express-validator doesn't validate headers directly in the same way
  // We'll handle this with custom middleware below
];

/**
 * Custom middleware to validate required headers
 */
export const validateHeaders = (req: Request, res: Response, next: NextFunction) => {
  const errors: Array<{ field: string; message: string }> = [];
  
  // Validate Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    errors.push({
      field: 'authorization',
      message: 'Authorization header is required'
    });
  } else if (!authHeader.startsWith('Bearer ')) {
    errors.push({
      field: 'authorization', 
      message: 'Authorization header must start with "Bearer "'
    });
  }
  
  // Validate x-tenant-id header
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) {
    errors.push({
      field: 'x-tenant-id',
      message: 'x-tenant-id header is required'
    });
  } else if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    errors.push({
      field: 'x-tenant-id',
      message: 'x-tenant-id header must be a non-empty string'
    });
  }
  
  // Validate idempotency-key header if present
  const idempotencyKey = req.headers['idempotency-key'];
  if (idempotencyKey && typeof idempotencyKey !== 'string') {
    errors.push({
      field: 'idempotency-key',
      message: 'idempotency-key header must be a string'
    });
  }
  
  if (errors.length > 0) {
    console.log('Header validation errors:', errors);
    return res.status(400).json({
      error: 'Header validation failed',
      details: errors,
      code: TaxErrorCode.VALIDATION_ERROR
    });
  }
  
  next();
};

/**
 * Validation for query parameters (if needed for filtering)
 */
export const validateQueryParams: ValidationChain[] = [
  query('active_only')
    .optional()
    .isBoolean()
    .withMessage('active_only must be a boolean value')
    .toBoolean(),
    
  query('include_default')
    .optional()
    .isBoolean()
    .withMessage('include_default must be a boolean value')
    .toBoolean(),
    
  query('sort_by')
    .optional()
    .isIn(['name', 'rate', 'sequence_no', 'created_at'])
    .withMessage('sort_by must be one of: name, rate, sequence_no, created_at'),
    
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be either "asc" or "desc"'),
];

/**
 * Custom validation middleware for business rules
 */
export const validateBusinessRules = (req: Request, res: Response, next: NextFunction) => {
  const errors: Array<{ field: string; message: string }> = [];
  
  // For tax rate creation/update, validate rate precision
  if (req.body.rate !== undefined) {
    const rate = parseFloat(req.body.rate);
    
    // Check for reasonable decimal precision (max 2 decimal places)
    const decimalPlaces = (rate.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      errors.push({
        field: 'rate',
        message: 'Rate cannot have more than 2 decimal places'
      });
    }
  }
  
  // For tax rate creation, validate name format (but NOT uniqueness - that's handled by the Edge function)
  if (req.body.name !== undefined) {
    const name = req.body.name.trim();
    
    // Check for reserved names
    const reservedNames = ['default', 'none', 'null', 'undefined', 'exempt'];
    if (reservedNames.includes(name.toLowerCase())) {
      errors.push({
        field: 'name',
        message: `"${name}" is a reserved name and cannot be used`
      });
    }
  }
  
  if (errors.length > 0) {
    console.log('Business rule validation errors:', errors);
    return res.status(400).json({
      error: 'Business rule validation failed',
      details: errors,
      code: TaxErrorCode.BUSINESS_RULE_VIOLATION
    });
  }
  
  next();
};

/**
 * Sanitization middleware to clean and normalize input data
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Remove sequence_no if provided by user - it's auto-generated
    if (req.body.sequence_no !== undefined) {
      delete req.body.sequence_no;
    }
    
    // Sanitize string fields
    if (req.body.name) {
      req.body.name = req.body.name.trim().replace(/\s+/g, ' '); // Normalize whitespace
    }
    
    if (req.body.description) {
      req.body.description = req.body.description.trim().replace(/\s+/g, ' ');
      // Remove empty description
      if (req.body.description === '') {
        req.body.description = null;
      }
    }
    
    // Normalize display mode
    if (req.body.display_mode) {
      req.body.display_mode = req.body.display_mode.toLowerCase().trim();
    }
    
    // Ensure numeric fields are properly typed
    if (req.body.rate !== undefined) {
      req.body.rate = parseFloat(req.body.rate);
    }
    
    // Normalize boolean fields
    if (req.body.is_default !== undefined) {
      req.body.is_default = Boolean(req.body.is_default);
    }
    
    console.log('Input sanitized successfully');
    next();
  } catch (error) {
    console.error('Error during input sanitization:', error);
    return res.status(400).json({
      error: 'Input sanitization failed',
      details: ['Invalid input format'],
      code: TaxErrorCode.VALIDATION_ERROR
    });
  }
};

/**
 * Composed validation chains for different endpoints
 */
export const taxSettingsValidation = [
  validateHeaders,
  ...validateTaxSettingsRequest,
  handleValidationErrors,
  sanitizeInput,
  validateBusinessRules
];

export const createTaxRateValidation = [
  validateHeaders,
  ...validateCreateTaxRateRequest,
  handleValidationErrors,
  sanitizeInput,
  validateBusinessRules
];

export const updateTaxRateValidation = [
  validateHeaders,
  ...validateTaxRateId,
  ...validateUpdateTaxRateRequest,
  handleValidationErrors,
  sanitizeInput,
  validateBusinessRules
];

export const deleteTaxRateValidation = [
  validateHeaders,
  ...validateTaxRateId,
  handleValidationErrors
];

export const getTaxRatesValidation = [
  validateHeaders,
  ...validateQueryParams,
  handleValidationErrors
];

/**
 * Generic validation for GET endpoints
 */
export const getValidation = [
  validateHeaders,
  handleValidationErrors
];

/**
 * Validation summary for documentation
 */
export const VALIDATION_RULES = {
  taxSettings: {
    display_mode: 'Required. Must be "including_tax" or "excluding_tax"',
    default_tax_rate_id: 'Optional. Must be a valid UUID if provided'
  },
  taxRate: {
    name: 'Required for create, optional for update. 1-100 characters, alphanumeric with special chars',
    rate: 'Required for create, optional for update. Number between 0-100 with max 2 decimal places',
    description: 'Optional. Max 500 characters',
    is_default: 'Optional. Boolean value'
  },
  headers: {
    authorization: 'Required. Must start with "Bearer "',
    'x-tenant-id': 'Required. Non-empty string',
    'idempotency-key': 'Optional. String value for write operations'
  },
  businessRules: {
    name: 'Cannot use reserved names: default, none, null, undefined, exempt',
    rate: 'Cannot have more than 2 decimal places'
  }
};