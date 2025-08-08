// src/validators/catalog.ts
// Comprehensive validation schemas for catalog operations
// CLEAN VERSION - Complete validation rules aligned with Edge Functions

import { body, param, query, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import {
  CATALOG_ITEM_TYPES,
  PRICING_TYPES,
  BILLING_MODES,
  CATALOG_ITEM_STATUS,
  SUPPORTED_CURRENCIES,
  CONTENT_FORMATS
} from '../utils/constants/catalog';
import type { PAGINATION_DEFAULTS } from '../types/catalogTypes';

// =================================================================
// VALIDATION CONSTANTS AND CONSTRAINTS
// =================================================================

const VALIDATION_CONSTRAINTS = {
  // Text field constraints
  NAME: { MIN: 1, MAX: 255 },
  DESCRIPTION: { MAX: 10000 },
  SHORT_DESCRIPTION: { MAX: 500 },
  SERVICE_TERMS: { MAX: 20000 },
  VERSION_REASON: { MIN: 3, MAX: 500 },
  SEARCH: { MIN: 2, MAX: 100 },
  
  // Numeric constraints
  PRICE: { MIN: 0, MAX: 99999999.99 },
  PERCENTAGE: { MIN: 0, MAX: 100 },
  PAGE: { MIN: 1, MAX: 10000 },
  LIMIT: { MIN: 1, MAX: 100 },
  
  // Format constraints
  CURRENCY_LENGTH: 3,
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  CURRENCY_PATTERN: /^[A-Z]{3}$/,
  
  // Array constraints
  MAX_PRICING_ENTRIES: 10,
  MAX_TAX_RATES: 5,
  MAX_BULK_OPERATIONS: 1000
};

const VALID_CATALOG_TYPES = [1, 2, 3, 4] as const;
const VALID_PRICE_TYPES_API = ['Fixed', 'Unit Price', 'Hourly', 'Daily'] as const;
const VALID_SORT_FIELDS = [
  'name', 'created_at', 'updated_at', 'version_number', 
  'base_amount', 'type', 'status'
] as const;
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;

// =================================================================
// UTILITY VALIDATION FUNCTIONS
// =================================================================

/**
 * Enhanced UUID validation with better error messages
 */
const validateUUID = (value: any, fieldName: string = 'ID'): boolean => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${fieldName} is required and must be a string`);
  }
  if (!VALIDATION_CONSTRAINTS.UUID_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a valid UUID format`);
  }
  return true;
};

/**
 * Enhanced currency validation
 */
const validateCurrency = (value: any): boolean => {
  if (!value || typeof value !== 'string') {
    throw new Error('Currency is required and must be a string');
  }
  if (value.length !== VALIDATION_CONSTRAINTS.CURRENCY_LENGTH) {
    throw new Error('Currency must be exactly 3 characters long');
  }
  if (!VALIDATION_CONSTRAINTS.CURRENCY_PATTERN.test(value.toUpperCase())) {
    throw new Error('Currency must contain only letters');
  }
  if (!SUPPORTED_CURRENCIES.includes(value.toUpperCase() as any)) {
    throw new Error(`Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }
  return true;
};

/**
 * Enhanced price validation with context
 */
const validatePrice = (value: any, context: string = 'Price'): boolean => {
  if (value === undefined || value === null) {
    throw new Error(`${context} is required`);
  }
  const numValue = Number(value);
  if (isNaN(numValue)) {
    throw new Error(`${context} must be a valid number`);
  }
  if (numValue < VALIDATION_CONSTRAINTS.PRICE.MIN) {
    throw new Error(`${context} must be non-negative`);
  }
  if (numValue > VALIDATION_CONSTRAINTS.PRICE.MAX) {
    throw new Error(`${context} cannot exceed ${VALIDATION_CONSTRAINTS.PRICE.MAX.toLocaleString()}`);
  }
  return true;
};

/**
 * Comprehensive pricing array validation
 */
const validatePricingArray = (value: any, { req }: { req: Request }): boolean => {
  if (!Array.isArray(value)) {
    throw new Error('Pricing must be an array');
  }
  
  if (value.length === 0) {
    throw new Error('At least one pricing entry is required');
  }
  
  if (value.length > VALIDATION_CONSTRAINTS.MAX_PRICING_ENTRIES) {
    throw new Error(`Maximum ${VALIDATION_CONSTRAINTS.MAX_PRICING_ENTRIES} pricing entries allowed`);
  }
  
  const currencies = new Set<string>();
  let baseCurrencyCount = 0;
  
  value.forEach((pricing: any, index: number) => {
    const context = `Pricing entry ${index + 1}`;
    
    // Validate price_type
    if (!pricing.price_type) {
      throw new Error(`${context}: price_type is required`);
    }
    if (!VALID_PRICE_TYPES_API.includes(pricing.price_type)) {
      throw new Error(`${context}: price_type must be one of: ${VALID_PRICE_TYPES_API.join(', ')}`);
    }
    
    // Validate currency
    try {
      validateCurrency(pricing.currency);
    } catch (error) {
      throw new Error(`${context}: ${error.message}`);
    }
    
    // Check for duplicate currencies
    const currencyUpper = pricing.currency.toUpperCase();
    if (currencies.has(currencyUpper)) {
      throw new Error(`${context}: Duplicate currency ${currencyUpper} found`);
    }
    currencies.add(currencyUpper);
    
    // Validate price
    try {
      validatePrice(pricing.price, `${context} price`);
    } catch (error) {
      throw new Error(error.message);
    }
    
    // Validate base currency
    if (pricing.is_base_currency === true) {
      baseCurrencyCount++;
    }
    
    // Validate optional fields
    if (pricing.tax_included !== undefined && typeof pricing.tax_included !== 'boolean') {
      throw new Error(`${context}: tax_included must be a boolean`);
    }
    
    if (pricing.tax_rate_id !== undefined && pricing.tax_rate_id !== null) {
      try {
        validateUUID(pricing.tax_rate_id, `${context} tax_rate_id`);
      } catch (error) {
        throw new Error(error.message);
      }
    }
    
    if (pricing.attributes !== undefined && 
        (typeof pricing.attributes !== 'object' || Array.isArray(pricing.attributes))) {
      throw new Error(`${context}: attributes must be an object`);
    }
  });
  
  // Validate base currency rules
  if (baseCurrencyCount > 1) {
    throw new Error('Only one base currency is allowed across all pricing entries');
  }
  
  return true;
};

/**
 * Multi-currency pricing validation
 */
const validateMultiCurrencyPricing = (value: any): boolean => {
  if (!value || typeof value !== 'object') {
    throw new Error('Multi-currency pricing data must be an object');
  }
  
  // Validate catalog_id
  if (value.catalog_id) {
    try {
      validateUUID(value.catalog_id, 'catalog_id');
    } catch (error) {
      throw new Error(error.message);
    }
  }
  
  // Validate price_type
  if (!value.price_type) {
    throw new Error('price_type is required for multi-currency pricing');
  }
  
  const validPriceTypes = [...Object.values(PRICING_TYPES), ...VALID_PRICE_TYPES_API];
  if (!validPriceTypes.includes(value.price_type)) {
    throw new Error(`price_type must be one of: ${validPriceTypes.join(', ')}`);
  }
  
  // Validate currencies array
  if (!value.currencies || !Array.isArray(value.currencies)) {
    throw new Error('currencies must be an array');
  }
  
  try {
    validatePricingArray(value.currencies, { req: {} as Request });
  } catch (error) {
    throw new Error(`currencies validation failed: ${error.message}`);
  }
  
  return true;
};

/**
 * Bulk operation validation
 */
const validateBulkOperation = (value: any): boolean => {
  if (!value || typeof value !== 'object') {
    throw new Error('Bulk operation data must be an object');
  }
  
  if (!value.operation) {
    throw new Error('operation field is required');
  }
  
  const validOperations = ['create', 'update', 'delete', 'activate', 'deactivate', 'copy'];
  if (!validOperations.includes(value.operation)) {
    throw new Error(`operation must be one of: ${validOperations.join(', ')}`);
  }
  
  if (!value.items || !Array.isArray(value.items)) {
    throw new Error('items must be an array');
  }
  
  if (value.items.length === 0) {
    throw new Error('items array cannot be empty');
  }
  
  if (value.items.length > VALIDATION_CONSTRAINTS.MAX_BULK_OPERATIONS) {
    throw new Error(`Maximum ${VALIDATION_CONSTRAINTS.MAX_BULK_OPERATIONS} items allowed in bulk operation`);
  }
  
  return true;
};

// =================================================================
// CREATE CATALOG ITEM VALIDATION
// =================================================================

/**
 * Comprehensive validation rules for creating a catalog item
 */
export const createCatalogItemValidation: ValidationChain[] = [
  // Core required fields
  body('name')
    .notEmpty()
    .withMessage('Item name is required')
    .isString()
    .withMessage('Item name must be a string')
    .trim()
    .isLength({ 
      min: VALIDATION_CONSTRAINTS.NAME.MIN, 
      max: VALIDATION_CONSTRAINTS.NAME.MAX 
    })
    .withMessage(`Item name must be between ${VALIDATION_CONSTRAINTS.NAME.MIN} and ${VALIDATION_CONSTRAINTS.NAME.MAX} characters`)
    .matches(/^[a-zA-Z0-9\s\-_.,()&]+$/)
    .withMessage('Item name contains invalid characters'),
  
  // Type validation (supports both frontend and API formats)
  body('type')
    .optional()
    .isIn(Object.values(CATALOG_ITEM_TYPES))
    .withMessage(`Type must be one of: ${Object.values(CATALOG_ITEM_TYPES).join(', ')}`),
  
  body('catalog_type')
    .optional()
    .isInt({ min: 1, max: 4 })
    .withMessage('catalog_type must be between 1 and 4')
    .custom((value) => {
      if (!VALID_CATALOG_TYPES.includes(value)) {
        throw new Error('catalog_type must be 1 (Service), 2 (Assets), 3 (Spare Parts), or 4 (Equipment)');
      }
      return true;
    }),
  
  // Ensure either type or catalog_type is provided
  body()
    .custom((value) => {
      if (!value.type && !value.catalog_type) {
        throw new Error('Either type or catalog_type must be provided');
      }
      return true;
    }),
  
  // Description fields (multiple formats supported)
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.DESCRIPTION.MAX })
    .withMessage(`Description must not exceed ${VALIDATION_CONSTRAINTS.DESCRIPTION.MAX} characters`),
  
  body('description_content')
    .optional()
    .isString()
    .withMessage('Description content must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.DESCRIPTION.MAX })
    .withMessage(`Description content must not exceed ${VALIDATION_CONSTRAINTS.DESCRIPTION.MAX} characters`),
  
  body('short_description')
    .optional()
    .isString()
    .withMessage('Short description must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.SHORT_DESCRIPTION.MAX })
    .withMessage(`Short description must not exceed ${VALIDATION_CONSTRAINTS.SHORT_DESCRIPTION.MAX} characters`),
  
  body('description_format')
    .optional()
    .isIn(['plain', 'markdown', 'html'])
    .withMessage('Description format must be plain, markdown, or html'),
  
  // Service terms fields
  body('service_terms')
    .optional()
    .isString()
    .withMessage('Service terms must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.SERVICE_TERMS.MAX })
    .withMessage(`Service terms must not exceed ${VALIDATION_CONSTRAINTS.SERVICE_TERMS.MAX} characters`),
  
  body('terms_content')
    .optional()
    .isString()
    .withMessage('Terms content must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.SERVICE_TERMS.MAX })
    .withMessage(`Terms content must not exceed ${VALIDATION_CONSTRAINTS.SERVICE_TERMS.MAX} characters`),
  
  body('terms_format')
    .optional()
    .isIn(['plain', 'markdown', 'html'])
    .withMessage('Terms format must be plain, markdown, or html'),
  
  // Price attributes validation (new format)
  body('price_attributes')
    .optional()
    .isObject()
    .withMessage('Price attributes must be an object'),
  
  body('price_attributes.type')
    .if(body('price_attributes').exists())
    .notEmpty()
    .withMessage('Price type is required when price_attributes is provided')
    .isIn(Object.values(PRICING_TYPES))
    .withMessage(`Price type must be one of: ${Object.values(PRICING_TYPES).join(', ')}`),
  
  body('price_attributes.base_amount')
    .if(body('price_attributes').exists())
    .notEmpty()
    .withMessage('Base amount is required when price_attributes is provided')
    .custom((value) => validatePrice(value, 'Base amount')),
  
  body('price_attributes.currency')
    .if(body('price_attributes').exists())
    .optional()
    .custom(validateCurrency),
  
  body('price_attributes.billing_mode')
    .if(body('price_attributes').exists())
    .notEmpty()
    .withMessage('Billing mode is required when price_attributes is provided')
    .isIn(Object.values(BILLING_MODES))
    .withMessage(`Billing mode must be one of: ${Object.values(BILLING_MODES).join(', ')}`),
  
  // Legacy pricing validation (backward compatibility)
  body('pricing')
    .optional()
    .custom(validatePricingArray),
  
  // Tax configuration
  body('tax_config')
    .optional()
    .isObject()
    .withMessage('Tax config must be an object'),
  
  body('tax_config.use_tenant_default')
    .if(body('tax_config').exists())
    .notEmpty()
    .withMessage('use_tenant_default is required in tax config')
    .isBoolean()
    .withMessage('use_tenant_default must be a boolean'),
  
  body('tax_config.display_mode')
    .optional()
    .isIn(['including_tax', 'excluding_tax'])
    .withMessage('Tax display mode must be including_tax or excluding_tax'),
  
  body('tax_config.specific_tax_rates')
    .optional()
    .isArray()
    .withMessage('Specific tax rates must be an array')
    .custom((rates) => {
      if (rates && rates.length > VALIDATION_CONSTRAINTS.MAX_TAX_RATES) {
        throw new Error(`Maximum ${VALIDATION_CONSTRAINTS.MAX_TAX_RATES} tax rates allowed`);
      }
      if (rates && rates.some((rate: any) => !validateUUID(rate, 'Tax rate ID'))) {
        throw new Error('All tax rate IDs must be valid UUIDs');
      }
      return true;
    }),
  
  body('tax_config.tax_exempt')
    .optional()
    .isBoolean()
    .withMessage('tax_exempt must be a boolean'),
  
  body('tax_config.exemption_reason')
    .if(body('tax_config.tax_exempt').equals(true))
    .notEmpty()
    .withMessage('Exemption reason is required when tax_exempt is true')
    .isString()
    .withMessage('Exemption reason must be a string')
    .isLength({ max: 500 })
    .withMessage('Exemption reason must be 500 characters or less'),
  
  // Service hierarchy
  body('service_parent_id')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined) return true;
      return validateUUID(value, 'Service parent ID');
    }),
  
  body('is_variant')
    .optional()
    .isBoolean()
    .withMessage('is_variant must be a boolean')
    .custom((value, { req }) => {
      // Business rule: variants must have a service parent
      if (value && !req.body.service_parent_id) {
        throw new Error('Variant items must have a service_parent_id');
      }
      return true;
    }),
  
  body('variant_attributes')
    .optional()
    .isObject()
    .withMessage('Variant attributes must be an object'),
  
  // Metadata and specifications
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
    .custom((value) => {
      if (value && JSON.stringify(value).length > 10000) {
        throw new Error('Metadata JSON must not exceed 10KB');
      }
      return true;
    }),
  
  body('specifications')
    .optional()
    .isObject()
    .withMessage('Specifications must be an object')
    .custom((value) => {
      if (value && JSON.stringify(value).length > 10000) {
        throw new Error('Specifications JSON must not exceed 10KB');
      }
      return true;
    }),
  
  body('attributes')
    .optional()
    .isObject()
    .withMessage('Attributes must be an object'),
  
  // Status and flags
  body('status')
    .optional()
    .isIn(Object.values(CATALOG_ITEM_STATUS))
    .withMessage(`Status must be one of: ${Object.values(CATALOG_ITEM_STATUS).join(', ')}`),
  
  body('is_live')
    .optional()
    .isBoolean()
    .withMessage('is_live must be a boolean'),
  
  // Classification (optional)
  body('industry_id')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined) return true;
      return validateUUID(value, 'Industry ID');
    }),
  
  body('category_id')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined) return true;
      return validateUUID(value, 'Category ID');
    })
];

// =================================================================
// UPDATE CATALOG ITEM VALIDATION
// =================================================================

/**
 * Validation rules for updating a catalog item
 */
export const updateCatalogItemValidation: ValidationChain[] = [
  // Version management
  body('version_reason')
    .optional()
    .isString()
    .withMessage('Version reason must be a string')
    .trim()
    .isLength({ 
      min: VALIDATION_CONSTRAINTS.VERSION_REASON.MIN, 
      max: VALIDATION_CONSTRAINTS.VERSION_REASON.MAX 
    })
    .withMessage(`Version reason must be between ${VALIDATION_CONSTRAINTS.VERSION_REASON.MIN} and ${VALIDATION_CONSTRAINTS.VERSION_REASON.MAX} characters`),
  
  // Optional fields that can be updated (same validation as create but optional)
  body('name')
    .optional()
    .isString()
    .withMessage('Item name must be a string')
    .trim()
    .isLength({ 
      min: VALIDATION_CONSTRAINTS.NAME.MIN, 
      max: VALIDATION_CONSTRAINTS.NAME.MAX 
    })
    .withMessage(`Item name must be between ${VALIDATION_CONSTRAINTS.NAME.MIN} and ${VALIDATION_CONSTRAINTS.NAME.MAX} characters`)
    .matches(/^[a-zA-Z0-9\s\-_.,()&]+$/)
    .withMessage('Item name contains invalid characters'),
  
  // Description fields
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.DESCRIPTION.MAX })
    .withMessage(`Description must not exceed ${VALIDATION_CONSTRAINTS.DESCRIPTION.MAX} characters`),
  
  body('description_content')
    .optional()
    .isString()
    .withMessage('Description content must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.DESCRIPTION.MAX })
    .withMessage(`Description content must not exceed ${VALIDATION_CONSTRAINTS.DESCRIPTION.MAX} characters`),
  
  body('short_description')
    .optional()
    .isString()
    .withMessage('Short description must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.SHORT_DESCRIPTION.MAX })
    .withMessage(`Short description must not exceed ${VALIDATION_CONSTRAINTS.SHORT_DESCRIPTION.MAX} characters`),
  
  body('service_terms')
    .optional()
    .isString()
    .withMessage('Service terms must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.SERVICE_TERMS.MAX })
    .withMessage(`Service terms must not exceed ${VALIDATION_CONSTRAINTS.SERVICE_TERMS.MAX} characters`),
  
  body('terms_content')
    .optional()
    .isString()
    .withMessage('Terms content must be a string')
    .trim()
    .isLength({ max: VALIDATION_CONSTRAINTS.SERVICE_TERMS.MAX })
    .withMessage(`Terms content must not exceed ${VALIDATION_CONSTRAINTS.SERVICE_TERMS.MAX} characters`),
  
  // Price attributes (if being updated)
  body('price_attributes')
    .optional()
    .isObject()
    .withMessage('Price attributes must be an object')
    .custom((value, { req }) => {
      // If price_attributes is being updated, suggest version_reason
      if (value && !req.body.version_reason) {
        // This is just a warning, not an error
        console.warn('Price attribute updates should include a version_reason');
      }
      return true;
    }),
  
  // Tax configuration updates
  body('tax_config')
    .optional()
    .isObject()
    .withMessage('Tax config must be an object'),
  
  // Status changes
  body('status')
    .optional()
    .isIn(Object.values(CATALOG_ITEM_STATUS))
    .withMessage(`Status must be one of: ${Object.values(CATALOG_ITEM_STATUS).join(', ')}`)
    .custom((value, { req }) => {
      // Suggest version_reason for status changes
      if (value && !req.body.version_reason) {
        console.warn('Status changes should include a version_reason');
      }
      return true;
    }),
  
  // Metadata updates
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
    .custom((value) => {
      if (value && JSON.stringify(value).length > 10000) {
        throw new Error('Metadata JSON must not exceed 10KB');
      }
      return true;
    }),
  
  body('specifications')
    .optional()
    .isObject()
    .withMessage('Specifications must be an object')
    .custom((value) => {
      if (value && JSON.stringify(value).length > 10000) {
        throw new Error('Specifications JSON must not exceed 10KB');
      }
      return true;
    }),
  
  body('variant_attributes')
    .optional()
    .isObject()
    .withMessage('Variant attributes must be an object'),
  
  body('attributes')
    .optional()
    .isObject()
    .withMessage('Attributes must be an object'),
  
  // Classification updates
  body('industry_id')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        return validateUUID(value, 'Industry ID');
      }
      return true;
    }),
  
  body('category_id')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        return validateUUID(value, 'Category ID');
      }
      return true;
    }),
  
  // Ensure at least one field is being updated
  body()
    .custom((value) => {
      const updateFields = [
        'name', 'description', 'description_content', 'short_description',
        'service_terms', 'terms_content', 'price_attributes', 'tax_config',
        'metadata', 'specifications', 'status', 'variant_attributes',
        'industry_id', 'category_id', 'attributes'
      ];
      
      const hasUpdate = updateFields.some(field => value[field] !== undefined);
      if (!hasUpdate) {
        throw new Error(`At least one field must be provided for update. Available fields: ${updateFields.join(', ')}`);
      }
      return true;
    })
];

// =================================================================
// QUERY PARAMETERS VALIDATION
// =================================================================

/**
 * Comprehensive validation for query parameters
 */
export const queryCatalogItemsValidation: ValidationChain[] = [
  // Basic filters
  query('type')
    .optional()
    .custom((value) => {
      const validTypes = Object.values(CATALOG_ITEM_TYPES);
      if (typeof value === 'string') {
        if (!validTypes.includes(value as any)) {
          throw new Error(`Type must be one of: ${validTypes.join(', ')}`);
        }
      } else if (Array.isArray(value)) {
        if (!value.every(type => validTypes.includes(type))) {
          throw new Error(`All types must be one of: ${validTypes.join(', ')}`);
        }
      } else {
        throw new Error('Type must be a string or array of strings');
      }
      return true;
    }),
  
  query('status')
    .optional()
    .custom((value) => {
      const validStatuses = Object.values(CATALOG_ITEM_STATUS);
      if (typeof value === 'string') {
        if (!validStatuses.includes(value as any)) {
          throw new Error(`Status must be one of: ${validStatuses.join(', ')}`);
        }
      } else if (Array.isArray(value)) {
        if (!value.every(status => validStatuses.includes(status))) {
          throw new Error(`All statuses must be one of: ${validStatuses.join(', ')}`);
        }
      } else {
        throw new Error('Status must be a string or array of strings');
      }
      return true;
    }),
  
  query('catalogType')
    .optional()
    .isInt({ min: 1, max: 4 })
    .withMessage('catalogType must be between 1 and 4')
    .custom((value) => {
      if (!VALID_CATALOG_TYPES.includes(value)) {
        throw new Error('catalogType must be 1 (Service), 2 (Assets), 3 (Spare Parts), or 4 (Equipment)');
      }
      return true;
    }),
  
  query('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean'),
  
  query('includeInactive')
    .optional()
    .isBoolean()
    .withMessage('includeInactive must be a boolean'),
  
  query('is_live')
    .optional()
    .isBoolean()
    .withMessage('is_live must be a boolean'),
  
  // Text search
  query('search')
    .optional()
    .isString()
    .withMessage('Search must be a string')
    .trim()
    .isLength({ 
      min: VALIDATION_CONSTRAINTS.SEARCH.MIN, 
      max: VALIDATION_CONSTRAINTS.SEARCH.MAX 
    })
    .withMessage(`Search must be between ${VALIDATION_CONSTRAINTS.SEARCH.MIN} and ${VALIDATION_CONSTRAINTS.SEARCH.MAX} characters`)
    .matches(/^[a-zA-Z0-9\s\-_.,()&]+$/)
    .withMessage('Search contains invalid characters'),
  
  // Service hierarchy filters
  query('service_parent_id')
    .optional()
    .custom((value) => validateUUID(value, 'Service parent ID')),
  
  query('is_variant')
    .optional()
    .isBoolean()
    .withMessage('is_variant must be a boolean'),
  
  query('include_variants')
    .optional()
    .isBoolean()
    .withMessage('include_variants must be a boolean'),
  
  // Pricing filters
  query('pricing_type')
    .optional()
    .custom((value) => {
      const validTypes = [...Object.values(PRICING_TYPES), ...VALID_PRICE_TYPES_API];
      if (typeof value === 'string') {
        if (!validTypes.includes(value)) {
          throw new Error(`Pricing type must be one of: ${validTypes.join(', ')}`);
        }
      } else if (Array.isArray(value)) {
        if (!value.every(type => validTypes.includes(type))) {
          throw new Error(`All pricing types must be one of: ${validTypes.join(', ')}`);
        }
      } else {
        throw new Error('Pricing type must be a string or array of strings');
      }
      return true;
    }),
  
  query('min_price')
    .optional()
    .isFloat({ min: VALIDATION_CONSTRAINTS.PRICE.MIN })
    .withMessage(`Min price must be at least ${VALIDATION_CONSTRAINTS.PRICE.MIN}`),
  
  query('max_price')
    .optional()
    .isFloat({ min: VALIDATION_CONSTRAINTS.PRICE.MIN, max: VALIDATION_CONSTRAINTS.PRICE.MAX })
    .withMessage(`Max price must be between ${VALIDATION_CONSTRAINTS.PRICE.MIN} and ${VALIDATION_CONSTRAINTS.PRICE.MAX}`)
    .custom((value, { req }) => {
      const minPrice = req.query.min_price;
      if (minPrice && parseFloat(value) <= parseFloat(minPrice as string)) {
        throw new Error('Max price must be greater than min price');
      }
      return true;
    }),
  
  query('currency')
    .optional()
    .custom(validateCurrency),
  
  query('base_currency')
    .optional()
    .custom(validateCurrency),
  
  // Date filters with proper validation
  query('created_after')
    .optional()
    .isISO8601()
    .withMessage('created_after must be a valid ISO 8601 date'),
  
  query('created_before')
    .optional()
    .isISO8601()
    .withMessage('created_before must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      const createdAfter = req.query.created_after;
      if (createdAfter && new Date(value) <= new Date(createdAfter as string)) {
        throw new Error('created_before must be after created_after');
      }
      return true;
    }),
  
  query('updated_after')
    .optional()
    .isISO8601()
    .withMessage('updated_after must be a valid ISO 8601 date'),
  
  query('updated_before')
    .optional()
    .isISO8601()
    .withMessage('updated_before must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      const updatedAfter = req.query.updated_after;
      if (updatedAfter && new Date(value) <= new Date(updatedAfter as string)) {
        throw new Error('updated_before must be after updated_after');
      }
      return true;
    }),
  
  query('created_by')
    .optional()
    .custom((value) => validateUUID(value, 'created_by')),
  
  // Pagination with enhanced validation
  query('page')
    .optional()
    .isInt({ 
      min: VALIDATION_CONSTRAINTS.PAGE.MIN, 
      max: VALIDATION_CONSTRAINTS.PAGE.MAX 
    })
    .withMessage(`Page must be between ${VALIDATION_CONSTRAINTS.PAGE.MIN} and ${VALIDATION_CONSTRAINTS.PAGE.MAX}`),
  
  query('limit')
    .optional()
    .isInt({ 
      min: VALIDATION_CONSTRAINTS.LIMIT.MIN, 
      max: VALIDATION_CONSTRAINTS.LIMIT.MAX 
    })
    .withMessage(`Limit must be between ${VALIDATION_CONSTRAINTS.LIMIT.MIN} and ${VALIDATION_CONSTRAINTS.LIMIT.MAX}`),
  
  // Sorting with comprehensive validation
  query('sortBy')
    .optional()
    .isIn(VALID_SORT_FIELDS)
    .withMessage(`Sort by must be one of: ${VALID_SORT_FIELDS.join(', ')}`),
  
  query('sortOrder')
    .optional()
    .isIn(VALID_SORT_ORDERS)
    .withMessage(`Sort order must be one of: ${VALID_SORT_ORDERS.join(', ')}`),
  
  // Include flags
  query('include_related')
    .optional()
    .isBoolean()
    .withMessage('include_related must be a boolean'),
  
  query('include_versions')
    .optional()
    .isBoolean()
    .withMessage('include_versions must be a boolean'),
  
  query('include_history')
    .optional()
    .isBoolean()
    .withMessage('include_history must be a boolean'),
  
  query('detailed')
    .optional()
    .isBoolean()
    .withMessage('detailed must be a boolean'),
  
  // Environment filter
  query('environment')
    .optional()
    .isIn(['live', 'test'])
    .withMessage('Environment must be live or test'),
  
  // Price type for deletion operations
  query('price_type')
    .optional()
    .isIn(VALID_PRICE_TYPES_API)
    .withMessage(`Price type must be one of: ${VALID_PRICE_TYPES_API.join(', ')}`)
];

// =================================================================
// PRICING VALIDATION
// =================================================================

/**
 * Validation for pricing operations (both single and multi-currency)
 */
export const pricingValidation: ValidationChain[] = [
  // Detect pricing type and validate accordingly
  body()
    .custom((value) => {
      if (value.currencies && Array.isArray(value.currencies)) {
        // Multi-currency validation
        return validateMultiCurrencyPricing(value);
      } else {
        // Single currency validation (legacy)
        if (!value.price_type) {
          throw new Error('price_type is required');
        }
        if (!VALID_PRICE_TYPES_API.includes(value.price_type)) {
          throw new Error(`price_type must be one of: ${VALID_PRICE_TYPES_API.join(', ')}`);
        }
        if (!value.currency) {
          throw new Error('currency is required');
        }
        validateCurrency(value.currency);
        if (value.price === undefined || value.price === null) {
          throw new Error('price is required');
        }
        validatePrice(value.price);
      }
      return true;
    }),
  
  // Multi-currency specific fields
  body('catalog_id')
    .optional()
    .custom((value) => validateUUID(value, 'catalog_id')),
  
  body('price_type')
    .optional()
    .custom((value) => {
      const validTypes = [...Object.values(PRICING_TYPES), ...VALID_PRICE_TYPES_API];
      if (!validTypes.includes(value)) {
        throw new Error(`price_type must be one of: ${validTypes.join(', ')}`);
      }
      return true;
    }),
  
  body('currencies')
    .optional()
    .custom(validatePricingArray),
  
  // Single currency fields (legacy)
  body('currency')
    .optional()
    .custom(validateCurrency),
  
  body('price')
    .optional()
    .custom((value) => validatePrice(value)),
  
  body('tax_included')
    .optional()
    .isBoolean()
    .withMessage('tax_included must be a boolean'),
  
  body('tax_rate_id')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined) return true;
      return validateUUID(value, 'tax_rate_id');
    }),
  
  body('is_base_currency')
    .optional()
    .isBoolean()
    .withMessage('is_base_currency must be a boolean'),
  
  body('attributes')
    .optional()
    .isObject()
    .withMessage('attributes must be an object')
];

// =================================================================
// PATH PARAMETERS VALIDATION
// =================================================================

/**
 * Validation for path parameters
 */
export const pathParametersValidation: ValidationChain[] = [
  param('id')
    .optional()
    .custom((value) => validateUUID(value, 'ID')),
  
  param('catalogId')
    .optional()
    .custom((value) => validateUUID(value, 'Catalog ID')),
  
  param('currency')
    .optional()
    .custom(validateCurrency),
  
  param('pricingId')
    .optional()
    .custom((value) => validateUUID(value, 'Pricing ID'))
];

// =================================================================
// BULK OPERATIONS VALIDATION
// =================================================================

/**
 * Validation for bulk operations
 */
export const bulkOperationValidation: ValidationChain[] = [
  body()
    .custom(validateBulkOperation),
  
  body('options')
    .optional()
    .isObject()
    .withMessage('Options must be an object'),
  
  body('options.continue_on_error')
    .optional()
    .isBoolean()
    .withMessage('continue_on_error must be a boolean'),
  
  body('options.batch_size')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Batch size must be between 1 and 100'),
  
  body('options.dry_run')
    .optional()
    .isBoolean()
    .withMessage('dry_run must be a boolean'),
  
  body('options.notification_email')
    .optional()
    .isEmail()
    .withMessage('Notification email must be a valid email address'),
  
  body('options.version_reason')
    .optional()
    .isString()
    .withMessage('Version reason must be a string')
    .isLength({ 
      min: VALIDATION_CONSTRAINTS.VERSION_REASON.MIN, 
      max: VALIDATION_CONSTRAINTS.VERSION_REASON.MAX 
    })
    .withMessage(`Version reason must be between ${VALIDATION_CONSTRAINTS.VERSION_REASON.MIN} and ${VALIDATION_CONSTRAINTS.VERSION_REASON.MAX} characters`)
];

// =================================================================
// CURRENCY PRICING VALIDATION
// =================================================================

/**
 * Validation for currency-specific pricing operations
 */
export const currencyPricingValidation: ValidationChain[] = [
  // Path parameters
  param('catalogId')
    .notEmpty()
    .withMessage('Catalog ID is required')
    .custom((value) => validateUUID(value, 'Catalog ID')),
  
  param('currency')
    .notEmpty()
    .withMessage('Currency is required')
    .custom(validateCurrency),
  
  // Body parameters (for updates)
  body('price')
    .optional()
    .custom((value) => validatePrice(value)),
  
  body('price_type')
    .optional()
    .isIn(VALID_PRICE_TYPES_API)
    .withMessage(`Price type must be one of: ${VALID_PRICE_TYPES_API.join(', ')}`),
  
  body('tax_included')
    .optional()
    .isBoolean()
    .withMessage('tax_included must be a boolean'),
  
  body('tax_rate_id')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined) return true;
      return validateUUID(value, 'tax_rate_id');
    }),
  
  body('attributes')
    .optional()
    .isObject()
    .withMessage('attributes must be an object'),
  
  // Query parameters (for deletion)
  query('price_type')
    .optional()
    .isIn(VALID_PRICE_TYPES_API)
    .withMessage(`Price type must be one of: ${VALID_PRICE_TYPES_API.join(', ')}`)
];

// =================================================================
// ERROR HANDLER MIDDLEWARE
// =================================================================

/**
 * Enhanced validation error handler with detailed error information
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'general',
      message: error.msg,
      code: 'VALIDATION_ERROR',
      value: error.type === 'field' ? error.value : undefined,
      location: error.type === 'field' ? error.location : 'body',
      param: error.type === 'field' ? error.path : undefined
    }));
    
    // Group errors by field for better readability
    const errorsByField = formattedErrors.reduce((acc, error) => {
      if (!acc[error.field]) {
        acc[error.field] = [];
      }
      acc[error.field].push(error);
      return acc;
    }, {} as Record<string, any[]>);
    
    console.error('[CatalogValidation] Validation errors:', {
      endpoint: `${req.method} ${req.originalUrl}`,
      errorCount: formattedErrors.length,
      errors: errorsByField
    });
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: `Found ${formattedErrors.length} validation error(s)`,
      validation_errors: formattedErrors,
      errors_by_field: errorsByField,
      timestamp: new Date().toISOString(),
      request_id: req.headers['x-request-id'] || undefined
    });
  }
  
  next();
};

// =================================================================
// COMBINED VALIDATION HELPERS
// =================================================================

/**
 * Combine validation chains with error handler for easier use
 */
export const validateAndHandle = (validationChains: ValidationChain[]) => {
  return [...validationChains, handleValidationErrors];
};

// =================================================================
// EXPORT VALIDATION CONSTANTS
// =================================================================

export const CATALOG_VALIDATION_CONSTANTS = {
  VALIDATION_CONSTRAINTS,
  VALID_CATALOG_TYPES,
  VALID_PRICE_TYPES_API,
  VALID_SORT_FIELDS,
  VALID_SORT_ORDERS
};