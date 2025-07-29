// src/middleware/catalogValidation.ts
import { Request, Response, NextFunction } from 'express';
import { body, validationResult, query } from 'express-validator';
import { 
  CatalogType, 
  PriceType,
  CatalogItemType,
  PricingType,
  isCatalogType
} from '../types/catalogTypes'; // FIXED: Updated import path

// Define field constraints locally since they might not be in the base types
const FIELD_CONSTRAINTS = {
  NAME_MAX_LENGTH: 255,
  DESCRIPTION_MAX_LENGTH: 10000,
  MIN_PRICE: 0,
  MAX_PRICE: 99999999.99
};

// Define supported currencies locally
const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];

// Helper functions
const isPriceType = (value: any): boolean => {
  return ['Fixed', 'Unit Price', 'Hourly', 'Daily'].includes(value);
};

const isValidCurrency = (value: any): boolean => {
  return typeof value === 'string' && 
         value.length === 3 && 
         SUPPORTED_CURRENCIES.includes(value.toUpperCase());
};

/**
 * Validation middleware for catalog operations
 */
export const validateCatalogInput = (operation: 'create' | 'update') => {
  const validations = [];

  if (operation === 'create') {
    // Required fields for creation
    validations.push(
      body('catalog_type')
        .notEmpty().withMessage('Catalog type is required')
        .isInt({ min: 1, max: 4 }).withMessage('Catalog type must be between 1 and 4')
        .custom(isCatalogType).withMessage('Invalid catalog type'),
      
      body('name')
        .notEmpty().withMessage('Name is required')
        .trim()
        .isLength({ min: 1, max: FIELD_CONSTRAINTS.NAME_MAX_LENGTH })
        .withMessage(`Name must be between 1 and ${FIELD_CONSTRAINTS.NAME_MAX_LENGTH} characters`),
      
      body('description')
        .notEmpty().withMessage('Description is required')
        .trim()
        .isLength({ min: 1, max: FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH })
        .withMessage(`Description must be between 1 and ${FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`)
    );
  } else {
    // Optional fields for update
    validations.push(
      body('catalog_type')
        .optional()
        .isInt({ min: 1, max: 4 }).withMessage('Catalog type must be between 1 and 4')
        .custom(isCatalogType).withMessage('Invalid catalog type'),
      
      body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: FIELD_CONSTRAINTS.NAME_MAX_LENGTH })
        .withMessage(`Name must be between 1 and ${FIELD_CONSTRAINTS.NAME_MAX_LENGTH} characters`),
      
      body('description')
        .optional()
        .trim()
        .isLength({ min: 1, max: FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH })
        .withMessage(`Description must be between 1 and ${FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`)
    );
  }

  // Common optional fields
  validations.push(
    body('service_terms')
      .optional()
      .trim()
      .isLength({ max: FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH })
      .withMessage(`Service terms must not exceed ${FIELD_CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`),
    
    body('attributes')
      .optional()
      .isObject().withMessage('Attributes must be an object'),
    
    body('pricing')
      .optional()
      .isArray().withMessage('Pricing must be an array')
      .custom((value) => {
        if (!Array.isArray(value)) return true;
        
        for (let i = 0; i < value.length; i++) {
          const price = value[i];
          
          if (!price.price_type || !isPriceType(price.price_type)) {
            throw new Error(`Pricing[${i}]: Invalid price type`);
          }
          
          if (!price.currency || !isValidCurrency(price.currency)) {
            throw new Error(`Pricing[${i}]: Invalid currency code`);
          }
          
          if (price.price === undefined || price.price === null || 
              isNaN(Number(price.price)) || 
              Number(price.price) < FIELD_CONSTRAINTS.MIN_PRICE ||
              Number(price.price) > FIELD_CONSTRAINTS.MAX_PRICE) {
            throw new Error(`Pricing[${i}]: Price must be between ${FIELD_CONSTRAINTS.MIN_PRICE} and ${FIELD_CONSTRAINTS.MAX_PRICE}`);
          }
          
          if (price.tax_included !== undefined && typeof price.tax_included !== 'boolean') {
            throw new Error(`Pricing[${i}]: tax_included must be a boolean`);
          }
        }
        
        return true;
      })
  );

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
    body('price_type')
      .notEmpty().withMessage('Price type is required')
      .custom(isPriceType).withMessage('Invalid price type'),
    
    body('currency')
      .notEmpty().withMessage('Currency is required')
      .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code')
      .isAlpha().withMessage('Currency must contain only letters')
      .toUpperCase()
      .custom(isValidCurrency).withMessage('Invalid currency code'),
    
    body('price')
      .notEmpty().withMessage('Price is required')
      .isFloat({ min: FIELD_CONSTRAINTS.MIN_PRICE, max: FIELD_CONSTRAINTS.MAX_PRICE })
      .withMessage(`Price must be between ${FIELD_CONSTRAINTS.MIN_PRICE} and ${FIELD_CONSTRAINTS.MAX_PRICE}`),
    
    body('tax_included')
      .optional()
      .isBoolean().withMessage('tax_included must be a boolean'),
    
    body('tax_rate_id')
      .optional()
      .isUUID().withMessage('tax_rate_id must be a valid UUID'),
    
    body('attributes')
      .optional()
      .isObject().withMessage('Attributes must be an object'),
    
    handleValidationErrors
  ];
};

/**
 * Handle validation errors
 */
const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.type === 'field' ? err.path : undefined,
        message: err.msg
      }))
    });
  }
  
  next();
};