// src/middleware/catalogValidation.ts
// Express validation middleware for catalog operations
// CLEAN VERSION - Aligned with catalogTypes and Edge Functions

import { Request, Response, NextFunction } from 'express';
import { body, validationResult, query, param } from 'express-validator';
import { 
  CATALOG_ITEM_TYPES,
  PRICING_TYPES,
  BILLING_MODES,
  CATALOG_ITEM_STATUS,
  SUPPORTED_CURRENCIES
} from '../utils/constants/catalog';
import type { 
  CatalogItemType, 
  PricingType,
  CatalogItemStatus
} from '../types/catalogTypes';
import { PAGINATION_DEFAULTS } from '../types/catalogTypes';

// =================================================================
// VALIDATION CONSTANTS
// =================================================================

const FIELD_CONSTRAINTS = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 255,
  DESCRIPTION_MAX_LENGTH: 10000,
  SHORT_DESCRIPTION_MAX_LENGTH: 500,
  SERVICE_TERMS_MAX_LENGTH: 20000,
  VERSION_REASON_MIN_LENGTH: 3,
  VERSION_REASON_MAX_LENGTH: 500,
  MIN_PRICE: 0,
  MAX_PRICE: 99999999.99,
  CURRENCY_LENGTH: 3,
  SEARCH_MIN_LENGTH: 2,
  SEARCH_MAX_LENGTH: 100
};

const VALID_CATALOG_TYPES = [1, 2, 3, 4] as const;
const VALID_PRICE_TYPES = ['Fixed', 'Unit Price', 'Hourly', 'Daily'] as const;
const VALID_SORT_FIELDS = ['name', 'created_at', 'updated_at', 'type', 'version'] as const;
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * Check if value is a valid catalog type
 */
const isCatalogType = (value: any): boolean => {
  return VALID_CATALOG_TYPES.includes(value);
};

/**
 * Check if value is a valid price type
 */
const isPriceType = (value: any): boolean => {
  return VALID_PRICE_TYPES.includes(value);
};

/**
 * Check if value is a valid currency
 */
const isValidCurrency = (value: any): boolean => {
  return typeof value === 'string' && 
         value.length === FIELD_CONSTRAINTS.CURRENCY_LENGTH && 
         SUPPORTED_CURRENCIES.includes(value.toUpperCase() as any);
};

/**
 * Check if value is a valid UUID
 */
const isValidUUID = (value: any): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof value === 'string' && uuidRegex.test(value);
};

/**
 * Custom validation for pricing array
 */
const validatePricingArray = (value: any) => {
  if (!Array.isArray(value)) {
    throw new Error('Pricing must be an array');
  }
  
  // Check for empty array
  if (value.length === 0) {
    throw new Error('At least one pricing entry is required');
  }
  
  // Validate each pricing entry
  value.forEach((price: any, index: number) => {
    // Validate price_type
    if (!price.price_type || !isPriceType(price.price_type)) {
      throw new Error(`Pricing[${index}]: Invalid price type. Must be one of: ${VALID_PRICE_TYPES.join(', ')}`);
    }
    
    // Validate currency
    if (!price.currency || !isValidCurrency(price.currency)) {
      throw new Error(`Pricing[${index}]: Invalid currency. Must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`);
    }
    
    // Validate price
    if (price.price === undefined || price.price === null || 
        isNaN(Number(price.price)) || 
        Number(price.price) < FIELD_CONSTRAINTS.MIN_PRICE ||
        Number(price.price) > FIELD_CONSTRAINTS.MAX_PRICE) {
      throw new Error(`Pricing[${index}]: Price must be between ${FIELD_CONSTRAINTS.MIN_PRICE} and ${FIELD_CONSTRAINTS.MAX_PRICE}`);
    }
    
    // Validate tax_included (optional)
    if (price.tax_included !== undefined && typeof price.tax_included !== 'boolean') {
      throw new Error(`Pricing[${index}]: tax_included must be a boolean`);
    }
    
    // Validate tax_rate_id (optional)
    if (price.tax_rate_id !== undefined && price.tax_rate_id !== null && !isValidUUID(price.tax_rate_id)) {
      throw new Error(`Pricing[${index}]: tax_rate_id must be a valid UUID`);
    }
    
    // Validate is_base_currency (optional)
    if (price.is_base_currency !== undefined && typeof price.is_base_currency !== 'boolean') {
      throw new Error(`Pricing[${index}]: is_base_currency must be a boolean`);
    }
  });
  
  // Check for duplicate currencies
  const currencies = value.map((p: any) => p.currency.toUpperCase());
  const uniqueCurrencies = new Set(currencies);
  if (currencies.length !== uniqueCurrencies.size) {
    throw new Error('Duplicate currencies are not allowed in pricing array');
  }
  
  // Check for multiple base currencies
  const baseCurrencies = value.filter((p: any) => p.is_base_currency);
  if (baseCurrencies.length > 1) {
    throw new Error('Only one base currency is allowed');
  }
  
  return true;
};

/**
 * Custom validation for multi-currency pricing
 */
const validateMultiCurrencyPricing = (value: any) => {
  if (!value.currencies || !Array.isArray(value.currencies)) {
    throw new Error('currencies field must be an array');
  }
  
  if (value.currencies.length === 0) {
    throw new Error('At least one currency is required');
  }
  
  // Validate price_type
  if (!value.price_type || !Object.values(PRICING_TYPES).includes(value.price_type)) {
    throw new Error(`Invalid price_type. Must be one of: ${Object.values(PRICING_TYPES).join(', ')}`);
  }
  
  // Validate currencies array using existing validator
  validatePricingArray(value.currencies);
  
  return true;
};

// =================================================================
// VALIDATION MIDDLEWARE FUNCTIONS
// =================================================================

/**
 * Validation middleware for catalog item operations
 */
export const validateCatalogInput = (operation: 'create' | 'update') => {
  const validations = [];

  if (operation === 'create') {
    // Required fields for creation
    validations.push(
      body('name')
        .notEmpty()
        .withMessage('Name is required')
        .trim()
        .isLength({ 
          min: FIELD_CONSTRAINTS.NAME_MIN_LENGTH, 
          max: FIELD_CONSTRAINTS.NAME_MAX_LENGTH 
        })
        .withMessage(`Name must be between ${FIELD_CONSTRAINTS.NAME_MIN_LENGTH} and ${FIELD_CONSTRAINTS.NAME_MAX_LENGTH} characters`),
      
      body('type')
        .optional()
        .isIn(Object.values(CATALOG_ITEM_TYPES))
        .withMessage(`Type must be one of: ${Object.values(CATALOG_ITEM_TYPES).join(', ')}`),
      
      // Support both type and catalog_type for backward compatibility
      body('catalog_type')
        .optional()
        .isInt({ min: 1, max: 4 })
        .withMessage('Catalog type must be between 1 and 4')
        .custom(isCatalogType)
        .withMessage('Invalid catalog type. Must be 1 (Service), 2 (Assets), 3 (Spare Parts), or 4 (Equipment)'),
      
      // Ensure at least one of type or catalog_type is provided
      body()
        .custom((value) => {
          if (!value.type && !value.catalog_type) {
            throw new Error('Either type or catalog_type must be provided');
          }
          return true;
        })
    );
  }

  // Common validations for both create and update
  validations.push(
    // Name validation (optional for updates)
    body('name')
      .optional()
      .trim()
      .isLength({ 
        min: FIELD_CONSTRAINTS.NAME_MIN_LENGTH, 
        max: FIELD_CONSTRAINTS.NAME_MAX_LENGTH 
      })
      .withMessage(`Name must be between ${FIELD_CONSTRAINTS.NAME_MIN_LENGTH} and ${FIELD_CONSTRAINTS.NAME_MAX_LENGTH} characters`),
    
    // Description validations (support multiple fields)
    body('description')
      .optional()
      .trim()
      .isLength({ max: FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH })
      .withMessage(`Description must not exceed ${FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`),
    
    body('description_content')
      .optional()
      .trim()
      .isLength({ max: FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH })
      .withMessage(`Description content must not exceed ${FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`),
    
    body('short_description')
      .optional()
      .trim()
      .isLength({ max: FIELD_CONSTRAINTS.SHORT_DESCRIPTION_MAX_LENGTH })
      .withMessage(`Short description must not exceed ${FIELD_CONSTRAINTS.SHORT_DESCRIPTION_MAX_LENGTH} characters`),
    
    // Service terms validations (support multiple fields)
    body('service_terms')
      .optional()
      .trim()
      .isLength({ max: FIELD_CONSTRAINTS.SERVICE_TERMS_MAX_LENGTH })
      .withMessage(`Service terms must not exceed ${FIELD_CONSTRAINTS.SERVICE_TERMS_MAX_LENGTH} characters`),
    
    body('terms_content')
      .optional()
      .trim()
      .isLength({ max: FIELD_CONSTRAINTS.SERVICE_TERMS_MAX_LENGTH })
      .withMessage(`Terms content must not exceed ${FIELD_CONSTRAINTS.SERVICE_TERMS_MAX_LENGTH} characters`),
    
    // Version reason (important for updates)
    body('version_reason')
      .optional()
      .trim()
      .isLength({ 
        min: FIELD_CONSTRAINTS.VERSION_REASON_MIN_LENGTH, 
        max: FIELD_CONSTRAINTS.VERSION_REASON_MAX_LENGTH 
      })
      .withMessage(`Version reason must be between ${FIELD_CONSTRAINTS.VERSION_REASON_MIN_LENGTH} and ${FIELD_CONSTRAINTS.VERSION_REASON_MAX_LENGTH} characters`),
    
    // Status validation
    body('status')
      .optional()
      .isIn(Object.values(CATALOG_ITEM_STATUS))
      .withMessage(`Status must be one of: ${Object.values(CATALOG_ITEM_STATUS).join(', ')}`),
    
    // Metadata and specifications
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    
    body('specifications')
      .optional()
      .isObject()
      .withMessage('Specifications must be an object'),
    
    body('attributes')
      .optional()
      .isObject()
      .withMessage('Attributes must be an object'),
    
    body('variant_attributes')
      .optional()
      .isObject()
      .withMessage('Variant attributes must be an object'),
    
    // Pricing validation (backward compatibility)
    body('pricing')
      .optional()
      .custom(validatePricingArray),
    
    // Price attributes validation (new format)
    body('price_attributes')
      .optional()
      .isObject()
      .withMessage('Price attributes must be an object'),
    
    body('price_attributes.type')
      .optional()
      .isIn(Object.values(PRICING_TYPES))
      .withMessage(`Price type must be one of: ${Object.values(PRICING_TYPES).join(', ')}`),
    
    body('price_attributes.base_amount')
      .optional()
      .isFloat({ min: FIELD_CONSTRAINTS.MIN_PRICE, max: FIELD_CONSTRAINTS.MAX_PRICE })
      .withMessage(`Base amount must be between ${FIELD_CONSTRAINTS.MIN_PRICE} and ${FIELD_CONSTRAINTS.MAX_PRICE}`),
    
    body('price_attributes.currency')
      .optional()
      .isLength({ min: FIELD_CONSTRAINTS.CURRENCY_LENGTH, max: FIELD_CONSTRAINTS.CURRENCY_LENGTH })
      .withMessage('Currency must be a 3-letter code')
      .toUpperCase()
      .custom(isValidCurrency)
      .withMessage(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`),
    
    body('price_attributes.billing_mode')
      .optional()
      .isIn(Object.values(BILLING_MODES))
      .withMessage(`Billing mode must be one of: ${Object.values(BILLING_MODES).join(', ')}`),
    
    // Tax configuration
    body('tax_config')
      .optional()
      .isObject()
      .withMessage('Tax config must be an object'),
    
    body('tax_config.use_tenant_default')
      .optional()
      .isBoolean()
      .withMessage('use_tenant_default must be a boolean'),
    
    body('tax_config.specific_tax_rates')
      .optional()
      .isArray()
      .withMessage('Specific tax rates must be an array'),
    
    body('tax_config.specific_tax_rates.*')
      .optional()
      .custom(isValidUUID)
      .withMessage('All tax rate IDs must be valid UUIDs'),
    
    // Boolean flags
    body('is_live')
      .optional()
      .isBoolean()
      .withMessage('is_live must be a boolean'),
    
    body('is_variant')
      .optional()
      .isBoolean()
      .withMessage('is_variant must be a boolean'),
    
    // UUID fields
    body('service_parent_id')
      .optional()
      .custom((value) => {
        if (value === null || value === undefined) return true;
        return isValidUUID(value);
      })
      .withMessage('Service parent ID must be a valid UUID'),
    
    // Content format validation
    body('description_format')
      .optional()
      .isIn(['plain', 'markdown', 'html'])
      .withMessage('Description format must be plain, markdown, or html'),
    
    body('terms_format')
      .optional()
      .isIn(['plain', 'markdown', 'html'])
      .withMessage('Terms format must be plain, markdown, or html')
  );

  // Add specific validation for updates
  if (operation === 'update') {
    validations.push(
      // Ensure at least one field is being updated
      body()
        .custom((value) => {
          const updateFields = [
            'name', 'description', 'description_content', 'short_description',
            'service_terms', 'terms_content', 'metadata', 'specifications',
            'attributes', 'variant_attributes', 'status', 'price_attributes', 'tax_config'
          ];
          
          const hasUpdate = updateFields.some(field => value[field] !== undefined);
          if (!hasUpdate) {
            throw new Error(`At least one field must be provided for update. Available fields: ${updateFields.join(', ')}`);
          }
          return true;
        })
    );
  }

  return [
    ...validations,
    handleValidationErrors
  ];
};

/**
 * Validation middleware for pricing operations
 */
export const validatePricingInput = () => {
  return [
    // Check if this is multi-currency or single currency request
    body()
      .custom((value) => {
        if (value.currencies && Array.isArray(value.currencies)) {
          // Multi-currency validation
          return validateMultiCurrencyPricing(value);
        } else {
          // Single currency validation (legacy)
          if (!value.price_type || !isPriceType(value.price_type)) {
            throw new Error(`Invalid price_type. Must be one of: ${VALID_PRICE_TYPES.join(', ')}`);
          }
          
          if (!value.currency || !isValidCurrency(value.currency)) {
            throw new Error(`Invalid currency. Must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`);
          }
          
          if (value.price === undefined || value.price === null || 
              isNaN(Number(value.price)) || 
              Number(value.price) < FIELD_CONSTRAINTS.MIN_PRICE ||
              Number(value.price) > FIELD_CONSTRAINTS.MAX_PRICE) {
            throw new Error(`Price must be between ${FIELD_CONSTRAINTS.MIN_PRICE} and ${FIELD_CONSTRAINTS.MAX_PRICE}`);
          }
        }
        return true;
      }),
    
    // Multi-currency specific validations
    body('catalog_id')
      .optional()
      .custom(isValidUUID)
      .withMessage('Catalog ID must be a valid UUID'),
    
    body('price_type')
      .optional()
      .custom((value) => {
        // Allow both frontend and API formats
        return Object.values(PRICING_TYPES).includes(value) || VALID_PRICE_TYPES.includes(value);
      })
      .withMessage(`Price type must be one of: ${Object.values(PRICING_TYPES).join(', ')} or ${VALID_PRICE_TYPES.join(', ')}`),
    
    // Single currency validations (legacy)
    body('currency')
      .optional()
      .isLength({ min: FIELD_CONSTRAINTS.CURRENCY_LENGTH, max: FIELD_CONSTRAINTS.CURRENCY_LENGTH })
      .withMessage('Currency must be a 3-letter code')
      .toUpperCase()
      .custom(isValidCurrency)
      .withMessage(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`),
    
    body('price')
      .optional()
      .isFloat({ min: FIELD_CONSTRAINTS.MIN_PRICE, max: FIELD_CONSTRAINTS.MAX_PRICE })
      .withMessage(`Price must be between ${FIELD_CONSTRAINTS.MIN_PRICE} and ${FIELD_CONSTRAINTS.MAX_PRICE}`),
    
    body('tax_included')
      .optional()
      .isBoolean()
      .withMessage('tax_included must be a boolean'),
    
    body('tax_rate_id')
      .optional()
      .custom((value) => {
        if (value === null || value === undefined) return true;
        return isValidUUID(value);
      })
      .withMessage('tax_rate_id must be a valid UUID'),
    
    body('attributes')
      .optional()
      .isObject()
      .withMessage('Attributes must be an object'),
    
    handleValidationErrors
  ];
};

/**
 * Validation middleware for query parameters
 */
export const validateQueryParams = () => {
  return [
    // Pagination
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: PAGINATION_DEFAULTS.MAX_LIMIT })
      .withMessage(`Limit must be between 1 and ${PAGINATION_DEFAULTS.MAX_LIMIT}`),
    
    // Filtering
    query('catalogType')
      .optional()
      .isInt({ min: 1, max: 4 })
      .withMessage('Catalog type must be between 1 and 4')
      .custom(isCatalogType)
      .withMessage('Invalid catalog type'),
    
    query('includeInactive')
      .optional()
      .isBoolean()
      .withMessage('includeInactive must be a boolean'),
    
    query('search')
      .optional()
      .trim()
      .isLength({ 
        min: FIELD_CONSTRAINTS.SEARCH_MIN_LENGTH, 
        max: FIELD_CONSTRAINTS.SEARCH_MAX_LENGTH 
      })
      .withMessage(`Search must be between ${FIELD_CONSTRAINTS.SEARCH_MIN_LENGTH} and ${FIELD_CONSTRAINTS.SEARCH_MAX_LENGTH} characters`),
    
    // Sorting
    query('sortBy')
      .optional()
      .isIn(VALID_SORT_FIELDS)
      .withMessage(`Sort by must be one of: ${VALID_SORT_FIELDS.join(', ')}`),
    
    query('sortOrder')
      .optional()
      .isIn(VALID_SORT_ORDERS)
      .withMessage(`Sort order must be one of: ${VALID_SORT_ORDERS.join(', ')}`),
    
    // Detailed response flag
    query('detailed')
      .optional()
      .isBoolean()
      .withMessage('detailed must be a boolean'),
    
    // Price type for deletion
    query('price_type')
      .optional()
      .isIn(VALID_PRICE_TYPES)
      .withMessage(`Price type must be one of: ${VALID_PRICE_TYPES.join(', ')}`),
    
    handleValidationErrors
  ];
};

/**
 * Validation middleware for path parameters
 */
export const validatePathParams = () => {
  return [
    param('id')
      .optional()
      .custom(isValidUUID)
      .withMessage('ID must be a valid UUID'),
    
    param('catalogId')
      .optional()
      .custom(isValidUUID)
      .withMessage('Catalog ID must be a valid UUID'),
    
    param('currency')
      .optional()
      .isLength({ min: FIELD_CONSTRAINTS.CURRENCY_LENGTH, max: FIELD_CONSTRAINTS.CURRENCY_LENGTH })
      .withMessage('Currency must be a 3-letter code')
      .isAlpha()
      .withMessage('Currency must contain only letters')
      .toUpperCase()
      .custom(isValidCurrency)
      .withMessage(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`),
    
    handleValidationErrors
  ];
};

/**
 * Validation middleware for headers
 */
export const validateHeaders = () => {
  return [
    body()
      .custom((value, { req }) => {
        // Ensure headers exist
        if (!req.headers) {
          throw new Error('Request headers are missing');
        }
        
        // Check required headers
        if (!req.headers.authorization) {
          throw new Error('Authorization header is required');
        }
        
        if (!req.headers['x-tenant-id']) {
          throw new Error('x-tenant-id header is required');
        }
        
        // Validate tenant ID format
        if (!isValidUUID(req.headers['x-tenant-id'] as string)) {
          throw new Error('x-tenant-id must be a valid UUID');
        }
        
        // Validate authorization format
        const authHeader = req.headers.authorization as string;
        if (!authHeader.startsWith('Bearer ')) {
          throw new Error('Authorization header must be in Bearer token format');
        }
        
        // Validate idempotency key if provided
        const idempotencyKey = req.headers['idempotency-key'];
        if (idempotencyKey && !isValidUUID(idempotencyKey as string)) {
          throw new Error('idempotency-key must be a valid UUID');
        }
        
        return true;
      }),
    
    handleValidationErrors
  ];
};

/**
 * Combined validation for currency pricing operations
 */
export const validateCurrencyPricingInput = () => {
  return [
    // Path parameters
    param('catalogId')
      .notEmpty()
      .withMessage('Catalog ID is required')
      .custom(isValidUUID)
      .withMessage('Catalog ID must be a valid UUID'),
    
    param('currency')
      .notEmpty()
      .withMessage('Currency is required')
      .isLength({ min: FIELD_CONSTRAINTS.CURRENCY_LENGTH, max: FIELD_CONSTRAINTS.CURRENCY_LENGTH })
      .withMessage('Currency must be a 3-letter code')
      .isAlpha()
      .withMessage('Currency must contain only letters')
      .toUpperCase()
      .custom(isValidCurrency)
      .withMessage(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`),
    
    // Body parameters (for updates)
    body('price')
      .optional()
      .isFloat({ min: FIELD_CONSTRAINTS.MIN_PRICE, max: FIELD_CONSTRAINTS.MAX_PRICE })
      .withMessage(`Price must be between ${FIELD_CONSTRAINTS.MIN_PRICE} and ${FIELD_CONSTRAINTS.MAX_PRICE}`),
    
    body('price_type')
      .optional()
      .isIn(VALID_PRICE_TYPES)
      .withMessage(`Price type must be one of: ${VALID_PRICE_TYPES.join(', ')}`),
    
    body('tax_included')
      .optional()
      .isBoolean()
      .withMessage('tax_included must be a boolean'),
    
    body('tax_rate_id')
      .optional()
      .custom((value) => {
        if (value === null || value === undefined) return true;
        return isValidUUID(value);
      })
      .withMessage('tax_rate_id must be a valid UUID'),
    
    body('attributes')
      .optional()
      .isObject()
      .withMessage('Attributes must be an object'),
    
    handleValidationErrors
  ];
};

// =================================================================
// ERROR HANDLER
// =================================================================

/**
 * Handle validation errors middleware
 */
const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'general',
      message: error.msg,
      code: 'VALIDATION_ERROR',
      value: error.type === 'field' ? error.value : undefined,
      location: error.type === 'field' ? error.location : 'body'
    }));
    
    console.log('[CatalogValidation] Validation errors:', formattedErrors);
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: 'The request contains invalid data',
      validation_errors: formattedErrors,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

// =================================================================
// UTILITY FUNCTIONS FOR EXTERNAL USE
// =================================================================

/**
 * Validate catalog data programmatically (for use in services)
 */
export const validateCatalogData = (data: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Basic field validations
  if (data.name && (typeof data.name !== 'string' || data.name.trim().length === 0)) {
    errors.push('Name is required and must be a non-empty string');
  }
  
  if (data.name && data.name.length > FIELD_CONSTRAINTS.NAME_MAX_LENGTH) {
    errors.push(`Name must not exceed ${FIELD_CONSTRAINTS.NAME_MAX_LENGTH} characters`);
  }
  
  if (data.catalog_type && !isCatalogType(data.catalog_type)) {
    errors.push('Invalid catalog type. Must be 1, 2, 3, or 4');
  }
  
  if (data.description && data.description.length > FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH) {
    errors.push(`Description must not exceed ${FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate pricing data programmatically (for use in services)
 */
export const validatePricingData = (data: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!data.price_type || !isPriceType(data.price_type)) {
    errors.push(`Invalid price_type. Must be one of: ${VALID_PRICE_TYPES.join(', ')}`);
  }
  
  if (!data.currency || !isValidCurrency(data.currency)) {
    errors.push(`Invalid currency. Must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }
  
  if (data.price === undefined || data.price === null || 
      isNaN(Number(data.price)) || 
      Number(data.price) < FIELD_CONSTRAINTS.MIN_PRICE ||
      Number(data.price) > FIELD_CONSTRAINTS.MAX_PRICE) {
    errors.push(`Price must be between ${FIELD_CONSTRAINTS.MIN_PRICE} and ${FIELD_CONSTRAINTS.MAX_PRICE}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Export validation constants for external use
export const VALIDATION_CONSTANTS = {
  FIELD_CONSTRAINTS,
  VALID_CATALOG_TYPES,
  VALID_PRICE_TYPES,
  VALID_SORT_FIELDS,
  VALID_SORT_ORDERS
};