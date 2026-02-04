// src/validators/catalogStudio.validators.ts
// Express-validator schemas for CatalogStudio blocks and templates
// Matches Edge Function validation patterns

import { body, param, query, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

// =================================================================
// VALIDATION CONSTANTS
// =================================================================

const VALIDATION_CONSTRAINTS = {
  NAME: { MIN: 1, MAX: 255 },
  DESCRIPTION: { MAX: 5000 },
  ICON: { MAX: 50 },
  CATEGORY: { MAX: 100 },
  TAG: { MAX: 50 },
  MAX_TAGS: 20,
  SEARCH: { MIN: 2, MAX: 100 },
  PAGE: { MIN: 1, MAX: 10000 },
  LIMIT: { MIN: 1, MAX: 100 },
  PRICE: { MIN: 0, MAX: 99999999.99 },
  TAX_RATE: { MIN: 0, MAX: 100 },
  SEQUENCE: { MIN: 0, MAX: 999999 },
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  CURRENCY_PATTERN: /^[A-Z]{3}$/
};

// =================================================================
// UTILITY VALIDATORS
// =================================================================

const isValidUUID = (value: string): boolean => {
  return VALIDATION_CONSTRAINTS.UUID_PATTERN.test(value);
};

const validateUUIDField = (value: any, fieldName: string): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  if (!isValidUUID(value)) {
    throw new Error(`${fieldName} must be a valid UUID`);
  }
  return true;
};

const validateTagsArray = (value: any): boolean => {
  if (!Array.isArray(value)) {
    throw new Error('Tags must be an array');
  }
  if (value.length > VALIDATION_CONSTRAINTS.MAX_TAGS) {
    throw new Error(`Maximum ${VALIDATION_CONSTRAINTS.MAX_TAGS} tags allowed`);
  }
  for (const tag of value) {
    if (typeof tag !== 'string') {
      throw new Error('Each tag must be a string');
    }
    if (tag.length > VALIDATION_CONSTRAINTS.TAG.MAX) {
      throw new Error(`Each tag must be ${VALIDATION_CONSTRAINTS.TAG.MAX} characters or less`);
    }
  }
  return true;
};

const validateConfigObject = (value: any): boolean => {
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Config must be an object');
  }
  if (JSON.stringify(value).length > 50000) {
    throw new Error('Config object too large (max 50KB)');
  }
  return true;
};

const validateBlocksArray = (value: any): boolean => {
  if (!Array.isArray(value)) {
    throw new Error('Blocks must be an array');
  }
  if (value.length > 100) {
    throw new Error('Maximum 100 blocks allowed per template');
  }
  return true;
};

// =================================================================
// BLOCK VALIDATION SCHEMAS
// =================================================================

/**
 * Validation for creating a block
 */
export const createBlockValidation: ValidationChain[] = [
  body('name')
    .notEmpty()
    .withMessage('Block name is required')
    .isString()
    .withMessage('Block name must be a string')
    .trim()
    .isLength({ min: VALIDATION_CONSTRAINTS.NAME.MIN, max: VALIDATION_CONSTRAINTS.NAME.MAX })
    .withMessage(`Block name must be between ${VALIDATION_CONSTRAINTS.NAME.MIN} and ${VALIDATION_CONSTRAINTS.NAME.MAX} characters`),

  body('block_type_id')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') throw new Error('block_type_id must be a string');
      // Accept both UUID format and string names (e.g., 'service', 'spare')
      // Edge function resolves string names to UUIDs
      return true;
    }),

  body('pricing_mode_id')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') throw new Error('pricing_mode_id must be a string');
      return true;
    }),

  // Accept string-based type field as alternative to block_type_id
  body('type')
    .optional()
    .isString()
    .withMessage('type must be a string'),

  body('display_name')
    .optional()
    .isString()
    .withMessage('Display name must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.NAME.MAX })
    .withMessage(`Display name must be ${VALIDATION_CONSTRAINTS.NAME.MAX} characters or less`),

  body('icon')
    .optional()
    .isString()
    .withMessage('Icon must be a string')
    .isLength({ max: VALIDATION_CONSTRAINTS.ICON.MAX })
    .withMessage(`Icon must be ${VALIDATION_CONSTRAINTS.ICON.MAX} characters or less`),

  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.DESCRIPTION.MAX })
    .withMessage(`Description must be ${VALIDATION_CONSTRAINTS.DESCRIPTION.MAX} characters or less`),

  body('category')
    .optional()
    .isString()
    .withMessage('Category must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.CATEGORY.MAX })
    .withMessage(`Category must be ${VALIDATION_CONSTRAINTS.CATEGORY.MAX} characters or less`),

  body('tags')
    .optional()
    .custom(validateTagsArray),

  body('config')
    .optional()
    .custom(validateConfigObject),

  body('base_price')
    .optional()
    .isFloat({ min: VALIDATION_CONSTRAINTS.PRICE.MIN, max: VALIDATION_CONSTRAINTS.PRICE.MAX })
    .withMessage(`Base price must be between ${VALIDATION_CONSTRAINTS.PRICE.MIN} and ${VALIDATION_CONSTRAINTS.PRICE.MAX}`),

  body('currency')
    .optional()
    .isString()
    .matches(VALIDATION_CONSTRAINTS.CURRENCY_PATTERN)
    .withMessage('Currency must be a valid 3-letter code (e.g., INR, USD)'),

  body('tax_rate')
    .optional()
    .isFloat({ min: VALIDATION_CONSTRAINTS.TAX_RATE.MIN, max: VALIDATION_CONSTRAINTS.TAX_RATE.MAX })
    .withMessage(`Tax rate must be between ${VALIDATION_CONSTRAINTS.TAX_RATE.MIN} and ${VALIDATION_CONSTRAINTS.TAX_RATE.MAX}`),

  body('hsn_sac_code')
    .optional()
    .isString()
    .withMessage('HSN/SAC code must be a string')
    .isLength({ max: 20 })
    .withMessage('HSN/SAC code must be 20 characters or less'),

  body('resource_pricing')
    .optional()
    .custom(validateConfigObject),

  body('variant_pricing')
    .optional()
    .custom(validateConfigObject),

  body('is_admin')
    .optional()
    .isBoolean()
    .withMessage('is_admin must be a boolean'),

  body('visible')
    .optional()
    .isBoolean()
    .withMessage('visible must be a boolean'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean'),

  body('is_deletable')
    .optional()
    .isBoolean()
    .withMessage('is_deletable must be a boolean'),

  body('sequence_no')
    .optional()
    .isInt({ min: VALIDATION_CONSTRAINTS.SEQUENCE.MIN, max: VALIDATION_CONSTRAINTS.SEQUENCE.MAX })
    .withMessage(`Sequence number must be between ${VALIDATION_CONSTRAINTS.SEQUENCE.MIN} and ${VALIDATION_CONSTRAINTS.SEQUENCE.MAX}`),

  body('is_seed')
    .optional()
    .isBoolean()
    .withMessage('is_seed must be a boolean'),

  body('tenant_id')
    .optional()
    .custom((value) => {
      if (value === null) return true;
      return validateUUIDField(value, 'tenant_id');
    })
];

/**
 * Validation for updating a block
 */
export const updateBlockValidation: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('Block ID is required')
    .custom((value) => validateUUIDField(value, 'Block ID')),

  body('expected_version')
    .optional()
    .isInt({ min: 1 })
    .withMessage('expected_version must be a positive integer'),

  body('name')
    .optional()
    .isString()
    .withMessage('Block name must be a string')
    .trim()
    .isLength({ min: VALIDATION_CONSTRAINTS.NAME.MIN, max: VALIDATION_CONSTRAINTS.NAME.MAX })
    .withMessage(`Block name must be between ${VALIDATION_CONSTRAINTS.NAME.MIN} and ${VALIDATION_CONSTRAINTS.NAME.MAX} characters`),

  body('display_name')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.NAME.MAX }),

  body('icon')
    .optional()
    .isString()
    .isLength({ max: VALIDATION_CONSTRAINTS.ICON.MAX }),

  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.DESCRIPTION.MAX }),

  body('category')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.CATEGORY.MAX }),

  body('tags')
    .optional()
    .custom(validateTagsArray),

  body('config')
    .optional()
    .custom(validateConfigObject),

  body('base_price')
    .optional()
    .isFloat({ min: VALIDATION_CONSTRAINTS.PRICE.MIN, max: VALIDATION_CONSTRAINTS.PRICE.MAX }),

  body('currency')
    .optional()
    .isString()
    .matches(VALIDATION_CONSTRAINTS.CURRENCY_PATTERN),

  body('tax_rate')
    .optional()
    .isFloat({ min: VALIDATION_CONSTRAINTS.TAX_RATE.MIN, max: VALIDATION_CONSTRAINTS.TAX_RATE.MAX }),

  body('visible')
    .optional()
    .isBoolean(),

  body('is_active')
    .optional()
    .isBoolean(),

  body('is_live')
    .optional()
    .isBoolean(),

  body('sequence_no')
    .optional()
    .isInt({ min: VALIDATION_CONSTRAINTS.SEQUENCE.MIN, max: VALIDATION_CONSTRAINTS.SEQUENCE.MAX })
];

/**
 * Validation for block query parameters
 */
export const queryBlocksValidation: ValidationChain[] = [
  query('block_type_id')
    .optional()
    .custom((value) => validateUUIDField(value, 'block_type_id')),

  query('pricing_mode_id')
    .optional()
    .custom((value) => validateUUIDField(value, 'pricing_mode_id')),

  query('category')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.CATEGORY.MAX }),

  query('tenant_id')
    .optional()
    .custom((value) => {
      if (value === 'null' || value === 'global') return true;
      return validateUUIDField(value, 'tenant_id');
    }),

  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ min: VALIDATION_CONSTRAINTS.SEARCH.MIN, max: VALIDATION_CONSTRAINTS.SEARCH.MAX })
    .withMessage(`Search must be between ${VALIDATION_CONSTRAINTS.SEARCH.MIN} and ${VALIDATION_CONSTRAINTS.SEARCH.MAX} characters`),

  query('is_active')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_active must be true or false'),

  query('visible')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('visible must be true or false'),

  query('page')
    .optional()
    .isInt({ min: VALIDATION_CONSTRAINTS.PAGE.MIN, max: VALIDATION_CONSTRAINTS.PAGE.MAX })
    .withMessage(`Page must be between ${VALIDATION_CONSTRAINTS.PAGE.MIN} and ${VALIDATION_CONSTRAINTS.PAGE.MAX}`),

  query('limit')
    .optional()
    .isInt({ min: VALIDATION_CONSTRAINTS.LIMIT.MIN, max: VALIDATION_CONSTRAINTS.LIMIT.MAX })
    .withMessage(`Limit must be between ${VALIDATION_CONSTRAINTS.LIMIT.MIN} and ${VALIDATION_CONSTRAINTS.LIMIT.MAX}`)
];

// =================================================================
// TEMPLATE VALIDATION SCHEMAS
// =================================================================

/**
 * Validation for creating a template
 */
export const createTemplateValidation: ValidationChain[] = [
  body('name')
    .notEmpty()
    .withMessage('Template name is required')
    .isString()
    .withMessage('Template name must be a string')
    .trim()
    .isLength({ min: VALIDATION_CONSTRAINTS.NAME.MIN, max: VALIDATION_CONSTRAINTS.NAME.MAX })
    .withMessage(`Template name must be between ${VALIDATION_CONSTRAINTS.NAME.MIN} and ${VALIDATION_CONSTRAINTS.NAME.MAX} characters`),

  body('blocks')
    .notEmpty()
    .withMessage('Blocks array is required')
    .custom(validateBlocksArray),

  body('display_name')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.NAME.MAX }),

  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.DESCRIPTION.MAX }),

  body('category')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.CATEGORY.MAX }),

  body('tags')
    .optional()
    .custom(validateTagsArray),

  body('cover_image')
    .optional()
    .isString()
    .isURL()
    .withMessage('Cover image must be a valid URL'),

  body('currency')
    .optional()
    .isString()
    .matches(VALIDATION_CONSTRAINTS.CURRENCY_PATTERN),

  body('tax_rate')
    .optional()
    .isFloat({ min: VALIDATION_CONSTRAINTS.TAX_RATE.MIN, max: VALIDATION_CONSTRAINTS.TAX_RATE.MAX }),

  body('discount_config')
    .optional()
    .isObject()
    .withMessage('Discount config must be an object'),

  body('settings')
    .optional()
    .custom(validateConfigObject),

  body('industry_tags')
    .optional()
    .custom(validateTagsArray),

  body('is_public')
    .optional()
    .isBoolean()
    .withMessage('is_public must be a boolean'),

  body('is_system')
    .optional()
    .isBoolean()
    .withMessage('is_system must be a boolean'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean'),

  body('sequence_no')
    .optional()
    .isInt({ min: VALIDATION_CONSTRAINTS.SEQUENCE.MIN, max: VALIDATION_CONSTRAINTS.SEQUENCE.MAX })
];

/**
 * Validation for updating a template
 */
export const updateTemplateValidation: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('Template ID is required')
    .custom((value) => validateUUIDField(value, 'Template ID')),

  body('expected_version')
    .optional()
    .isInt({ min: 1 })
    .withMessage('expected_version must be a positive integer'),

  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: VALIDATION_CONSTRAINTS.NAME.MIN, max: VALIDATION_CONSTRAINTS.NAME.MAX }),

  body('display_name')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.NAME.MAX }),

  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.DESCRIPTION.MAX }),

  body('category')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.CATEGORY.MAX }),

  body('tags')
    .optional()
    .custom(validateTagsArray),

  body('blocks')
    .optional()
    .custom(validateBlocksArray),

  body('cover_image')
    .optional()
    .custom((value) => {
      if (value === null) return true;
      if (typeof value !== 'string') throw new Error('Cover image must be a string or null');
      return true;
    }),

  body('currency')
    .optional()
    .isString()
    .matches(VALIDATION_CONSTRAINTS.CURRENCY_PATTERN),

  body('tax_rate')
    .optional()
    .isFloat({ min: VALIDATION_CONSTRAINTS.TAX_RATE.MIN, max: VALIDATION_CONSTRAINTS.TAX_RATE.MAX }),

  body('discount_config')
    .optional()
    .isObject(),

  body('settings')
    .optional()
    .custom(validateConfigObject),

  body('industry_tags')
    .optional()
    .custom(validateTagsArray),

  body('is_public')
    .optional()
    .isBoolean(),

  body('is_active')
    .optional()
    .isBoolean(),

  body('sequence_no')
    .optional()
    .isInt({ min: VALIDATION_CONSTRAINTS.SEQUENCE.MIN, max: VALIDATION_CONSTRAINTS.SEQUENCE.MAX })
];

/**
 * Validation for copying a template
 */
export const copyTemplateValidation: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('Source template ID is required')
    .custom((value) => validateUUIDField(value, 'Template ID')),

  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: VALIDATION_CONSTRAINTS.NAME.MIN, max: VALIDATION_CONSTRAINTS.NAME.MAX })
    .withMessage(`New template name must be between ${VALIDATION_CONSTRAINTS.NAME.MIN} and ${VALIDATION_CONSTRAINTS.NAME.MAX} characters`),

  body('display_name')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.NAME.MAX })
];

/**
 * Validation for template query parameters
 */
export const queryTemplatesValidation: ValidationChain[] = [
  query('category')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.CATEGORY.MAX }),

  query('is_system')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_system must be true or false'),

  query('is_public')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_public must be true or false'),

  query('industry')
    .optional()
    .isString()
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.TAG.MAX }),

  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ min: VALIDATION_CONSTRAINTS.SEARCH.MIN, max: VALIDATION_CONSTRAINTS.SEARCH.MAX })
    .withMessage(`Search must be between ${VALIDATION_CONSTRAINTS.SEARCH.MIN} and ${VALIDATION_CONSTRAINTS.SEARCH.MAX} characters`),

  query('page')
    .optional()
    .isInt({ min: VALIDATION_CONSTRAINTS.PAGE.MIN, max: VALIDATION_CONSTRAINTS.PAGE.MAX })
    .withMessage(`Page must be between ${VALIDATION_CONSTRAINTS.PAGE.MIN} and ${VALIDATION_CONSTRAINTS.PAGE.MAX}`),

  query('limit')
    .optional()
    .isInt({ min: VALIDATION_CONSTRAINTS.LIMIT.MIN, max: VALIDATION_CONSTRAINTS.LIMIT.MAX })
    .withMessage(`Limit must be between ${VALIDATION_CONSTRAINTS.LIMIT.MIN} and ${VALIDATION_CONSTRAINTS.LIMIT.MAX}`)
];

// =================================================================
// PATH PARAMETER VALIDATION
// =================================================================

export const validateIdParam: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('ID is required')
    .custom((value) => validateUUIDField(value, 'ID'))
];

// =================================================================
// ERROR HANDLER MIDDLEWARE
// =================================================================

/**
 * Validation error handler middleware
 * Returns standardized error response with detailed field errors
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'general',
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined,
      location: error.type === 'field' ? error.location : 'body'
    }));

    console.error('[CatalogStudio Validation] Errors:', {
      endpoint: `${req.method} ${req.originalUrl}`,
      errorCount: formattedErrors.length,
      errors: formattedErrors
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed with ${formattedErrors.length} error(s)`,
        details: formattedErrors
      },
      timestamp: new Date().toISOString()
    });
    return;
  }

  next();
};

// =================================================================
// COMBINED VALIDATION HELPERS
// =================================================================

/**
 * Combine validation chains with error handler
 */
export const validate = (validationChains: ValidationChain[]) => {
  return [...validationChains, handleValidationErrors];
};

// Export constants for use in other modules
export const CATALOG_STUDIO_VALIDATION_CONSTRAINTS = VALIDATION_CONSTRAINTS;
