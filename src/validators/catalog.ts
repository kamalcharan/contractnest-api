// src/validators/catalog.ts
// Comprehensive validation schemas for catalog operations
// Uses express-validator for consistency across the product

import { body, param, query, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

// ===================================================================
// COMMON VALIDATION HELPERS
// ===================================================================

/**
 * Common validation patterns used across catalog operations
 */
const commonValidations = {
  // Basic field validators
  uuid: () => body().isUUID().withMessage('Must be a valid UUID'),
  name: () => body().notEmpty().withMessage('Name is required')
    .isString().withMessage('Name must be a string')
    .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters')
    .trim(),
  
  description: () => body().optional()
    .isString().withMessage('Description must be a string')
    .isLength({ max: 10000 }).withMessage('Description must be 10000 characters or less'),
  
  shortDescription: () => body().optional()
    .isString().withMessage('Short description must be a string')
    .isLength({ max: 500 }).withMessage('Short description must be 500 characters or less'),
  
  currency: () => body().optional()
    .isString().withMessage('Currency must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters')
    .toUpperCase(),
  
  amount: () => body().isNumeric().withMessage('Amount must be a number')
    .isFloat({ min: 0, max: 99999999.99 }).withMessage('Amount must be between 0 and 99,999,999.99'),
  
  percentage: () => body().isNumeric().withMessage('Percentage must be a number')
    .isFloat({ min: 0, max: 100 }).withMessage('Percentage must be between 0 and 100'),
  
  positiveInteger: () => body().isInt({ min: 1 }).withMessage('Must be a positive integer'),
  
  nonNegativeInteger: () => body().isInt({ min: 0 }).withMessage('Must be a non-negative integer'),
  
  boolean: () => body().isBoolean().withMessage('Must be a boolean value'),
  
  date: () => body().isISO8601().withMessage('Must be a valid ISO 8601 date'),
  
  // Enum validators
  catalogItemType: () => body().isIn(['service', 'equipment', 'spare_part', 'asset'])
    .withMessage('Type must be one of: service, equipment, spare_part, asset'),
  
  catalogItemStatus: () => body().isIn(['active', 'inactive', 'draft'])
    .withMessage('Status must be one of: active, inactive, draft'),
  
  pricingType: () => body().isIn(['fixed', 'unit_price', 'hourly', 'daily', 'monthly', 'package', 'subscription', 'price_range'])
    .withMessage('Pricing type must be one of: fixed, unit_price, hourly, daily, monthly, package, subscription, price_range'),
  
  billingMode: () => body().isIn(['manual', 'automatic'])
    .withMessage('Billing mode must be either manual or automatic'),
  
  contentFormat: () => body().optional().isIn(['plain', 'markdown', 'html'])
    .withMessage('Content format must be one of: plain, markdown, html'),
  
  sortDirection: () => query().optional().isIn(['asc', 'desc'])
    .withMessage('Sort direction must be either asc or desc')
};

// ===================================================================
// CREATE CATALOG ITEM VALIDATION
// ===================================================================

/**
 * Validation rules for creating a catalog item
 */
export const createCatalogItemValidation: ValidationChain[] = [
  // Required fields
  body('name')
    .notEmpty().withMessage('Item name is required')
    .isString().withMessage('Item name must be a string')
    .isLength({ min: 2, max: 255 }).withMessage('Item name must be between 2 and 255 characters')
    .trim(),
  
  body('type')
    .notEmpty().withMessage('Item type is required')
    .isIn(['service', 'equipment', 'spare_part', 'asset'])
    .withMessage('Type must be one of: service, equipment, spare_part, asset'),
  
  // Price attributes validation
  body('price_attributes')
    .notEmpty().withMessage('Price attributes are required')
    .isObject().withMessage('Price attributes must be an object'),
  
  body('price_attributes.type')
    .notEmpty().withMessage('Pricing type is required')
    .isIn(['fixed', 'unit_price', 'hourly', 'daily', 'monthly', 'package', 'subscription', 'price_range'])
    .withMessage('Invalid pricing type'),
  
  body('price_attributes.base_amount')
    .notEmpty().withMessage('Base amount is required')
    .isFloat({ min: 0 }).withMessage('Base amount must be a positive number'),
  
  body('price_attributes.currency')
    .optional()
    .isString().withMessage('Currency must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters')
    .toUpperCase(),
  
  body('price_attributes.billing_mode')
    .notEmpty().withMessage('Billing mode is required')
    .isIn(['manual', 'automatic']).withMessage('Billing mode must be manual or automatic'),
  
  // Price range specific validation
  body('price_attributes.min_amount')
    .if(body('price_attributes.type').equals('price_range'))
    .notEmpty().withMessage('Min amount is required for price range pricing')
    .isFloat({ min: 0 }).withMessage('Min amount must be a positive number'),
  
  body('price_attributes.max_amount')
    .if(body('price_attributes.type').equals('price_range'))
    .notEmpty().withMessage('Max amount is required for price range pricing')
    .isFloat({ min: 0 }).withMessage('Max amount must be a positive number')
    .custom((value, { req }) => {
      const minAmount = req.body.price_attributes?.min_amount;
      if (minAmount && value <= minAmount) {
        throw new Error('Max amount must be greater than min amount');
      }
      return true;
    }),
  
  // Package pricing validation
  body('price_attributes.package_details')
    .if(body('price_attributes.type').equals('package'))
    .notEmpty().withMessage('Package details are required for package pricing')
    .isObject().withMessage('Package details must be an object'),
  
  body('price_attributes.package_details.sessions')
    .if(body('price_attributes.type').equals('package'))
    .notEmpty().withMessage('Package sessions count is required')
    .isInt({ min: 1 }).withMessage('Package sessions must be a positive integer'),
  
  body('price_attributes.package_details.validity_days')
    .if(body('price_attributes.type').equals('package'))
    .notEmpty().withMessage('Package validity days is required')
    .isInt({ min: 1 }).withMessage('Package validity must be a positive integer'),
  
  body('price_attributes.package_details.discount_percentage')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Discount percentage must be between 0 and 100'),
  
  // Subscription pricing validation
  body('price_attributes.subscription_details')
    .if(body('price_attributes.type').equals('subscription'))
    .notEmpty().withMessage('Subscription details are required for subscription pricing')
    .isObject().withMessage('Subscription details must be an object'),
  
  body('price_attributes.subscription_details.billing_cycle')
    .if(body('price_attributes.type').equals('subscription'))
    .notEmpty().withMessage('Billing cycle is required for subscription pricing')
    .isIn(['monthly', 'quarterly', 'yearly']).withMessage('Billing cycle must be monthly, quarterly, or yearly'),
  
  body('price_attributes.subscription_details.setup_fee')
    .optional()
    .isFloat({ min: 0 }).withMessage('Setup fee must be a positive number'),
  
  body('price_attributes.subscription_details.trial_days')
    .optional()
    .isInt({ min: 0 }).withMessage('Trial days must be a non-negative integer'),
  
  // Hourly/Daily rate validation
  body('price_attributes.hourly_rate')
    .if(body('price_attributes.type').equals('hourly'))
    .optional()
    .isFloat({ min: 0 }).withMessage('Hourly rate must be a positive number'),
  
  body('price_attributes.daily_rate')
    .if(body('price_attributes.type').equals('daily'))
    .optional()
    .isFloat({ min: 0 }).withMessage('Daily rate must be a positive number'),
  
  // Optional classification
  body('industry_id')
    .optional()
    .isUUID().withMessage('Industry ID must be a valid UUID'),
  
  body('category_id')
    .optional()
    .isUUID().withMessage('Category ID must be a valid UUID'),
  
  // Optional content
  body('short_description')
    .optional()
    .isString().withMessage('Short description must be a string')
    .isLength({ max: 500 }).withMessage('Short description must be 500 characters or less'),
  
  body('description_content')
    .optional()
    .isString().withMessage('Description content must be a string')
    .isLength({ max: 10000 }).withMessage('Description content must be 10000 characters or less'),
  
  body('description_format')
    .optional()
    .isIn(['plain', 'markdown', 'html']).withMessage('Description format must be plain, markdown, or html'),
  
  body('terms_content')
    .optional()
    .isString().withMessage('Terms content must be a string')
    .isLength({ max: 20000 }).withMessage('Terms content must be 20000 characters or less'),
  
  body('terms_format')
    .optional()
    .isIn(['plain', 'markdown', 'html']).withMessage('Terms format must be plain, markdown, or html'),
  
  // Service hierarchy validation
  body('service_parent_id')
    .optional()
    .isUUID().withMessage('Service parent ID must be a valid UUID'),
  
  body('is_variant')
    .optional()
    .isBoolean().withMessage('is_variant must be a boolean')
    .custom((value, { req }) => {
      // Business rule: variants must have a service parent
      if (value && !req.body.service_parent_id) {
        throw new Error('Variant items must have a service_parent_id');
      }
      // Business rule: only services can be variants
      if (value && req.body.type !== 'service') {
        throw new Error('Only service items can be variants');
      }
      return true;
    }),
  
  body('variant_attributes')
    .optional()
    .isObject().withMessage('Variant attributes must be an object'),
  
  // Tax configuration
  body('tax_config')
    .optional()
    .isObject().withMessage('Tax config must be an object'),
  
  body('tax_config.use_tenant_default')
    .if(body('tax_config').exists())
    .notEmpty().withMessage('use_tenant_default is required in tax config')
    .isBoolean().withMessage('use_tenant_default must be a boolean'),
  
  body('tax_config.display_mode')
    .optional()
    .isIn(['including_tax', 'excluding_tax']).withMessage('Tax display mode must be including_tax or excluding_tax'),
  
  body('tax_config.specific_tax_rates')
    .optional()
    .isArray().withMessage('Specific tax rates must be an array')
    .custom((rates) => {
      if (rates && rates.some((rate: any) => typeof rate !== 'string')) {
        throw new Error('All tax rate IDs must be strings');
      }
      return true;
    }),
  
  body('tax_config.tax_exempt')
    .optional()
    .isBoolean().withMessage('tax_exempt must be a boolean'),
  
  body('tax_config.exemption_reason')
    .if(body('tax_config.tax_exempt').equals(true))
    .notEmpty().withMessage('Exemption reason is required when tax_exempt is true')
    .isString().withMessage('Exemption reason must be a string')
    .isLength({ max: 500 }).withMessage('Exemption reason must be 500 characters or less'),
  
  // Optional configuration
  body('metadata')
    .optional()
    .isObject().withMessage('Metadata must be an object'),
  
  body('specifications')
    .optional()
    .isObject().withMessage('Specifications must be an object'),
  
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'draft']).withMessage('Status must be active, inactive, or draft'),
  
  body('is_live')
    .optional()
    .isBoolean().withMessage('is_live must be a boolean')
];

// ===================================================================
// UPDATE CATALOG ITEM VALIDATION
// ===================================================================

/**
 * Validation rules for updating a catalog item
 */
export const updateCatalogItemValidation: ValidationChain[] = [
  // Version management
  body('version_reason')
    .optional()
    .isString().withMessage('Version reason must be a string')
    .isLength({ min: 3, max: 500 }).withMessage('Version reason must be between 3 and 500 characters'),
  
  // Optional fields that can be updated
  body('name')
    .optional()
    .isString().withMessage('Item name must be a string')
    .isLength({ min: 2, max: 255 }).withMessage('Item name must be between 2 and 255 characters')
    .trim(),
  
  body('short_description')
    .optional()
    .isString().withMessage('Short description must be a string')
    .isLength({ max: 500 }).withMessage('Short description must be 500 characters or less'),
  
  body('description_content')
    .optional()
    .isString().withMessage('Description content must be a string')
    .isLength({ max: 10000 }).withMessage('Description content must be 10000 characters or less'),
  
  body('description_format')
    .optional()
    .isIn(['plain', 'markdown', 'html']).withMessage('Description format must be plain, markdown, or html'),
  
  body('terms_content')
    .optional()
    .isString().withMessage('Terms content must be a string')
    .isLength({ max: 20000 }).withMessage('Terms content must be 20000 characters or less'),
  
  body('terms_format')
    .optional()
    .isIn(['plain', 'markdown', 'html']).withMessage('Terms format must be plain, markdown, or html'),
  
  // Price attributes validation (if provided)
  body('price_attributes')
    .optional()
    .isObject().withMessage('Price attributes must be an object')
    .custom((value, { req }) => {
      // If price_attributes is being updated, version_reason should be provided
      if (value && !req.body.version_reason) {
        throw new Error('Pricing updates should include a version_reason');
      }
      return true;
    }),
  
  body('price_attributes.type')
    .if(body('price_attributes').exists())
    .notEmpty().withMessage('Pricing type is required')
    .isIn(['fixed', 'unit_price', 'hourly', 'daily', 'monthly', 'package', 'subscription', 'price_range'])
    .withMessage('Invalid pricing type'),
  
  body('price_attributes.base_amount')
    .if(body('price_attributes').exists())
    .notEmpty().withMessage('Base amount is required')
    .isFloat({ min: 0 }).withMessage('Base amount must be a positive number'),
  
  body('price_attributes.billing_mode')
    .if(body('price_attributes').exists())
    .notEmpty().withMessage('Billing mode is required')
    .isIn(['manual', 'automatic']).withMessage('Billing mode must be manual or automatic'),
  
  // Tax configuration updates
  body('tax_config')
    .optional()
    .isObject().withMessage('Tax config must be an object'),
  
  // Status change validation
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'draft']).withMessage('Status must be active, inactive, or draft')
    .custom((value, { req }) => {
      // If status is changing to inactive, version_reason should be provided
      if (value === 'inactive' && !req.body.version_reason) {
        throw new Error('Status changes should include a version_reason');
      }
      return true;
    }),
  
  body('variant_attributes')
    .optional()
    .isObject().withMessage('Variant attributes must be an object'),
  
  body('metadata')
    .optional()
    .isObject().withMessage('Metadata must be an object'),
  
  body('specifications')
    .optional()
    .isObject().withMessage('Specifications must be an object'),
  
  // Classification changes
  body('industry_id')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined && typeof value !== 'string') {
        throw new Error('Industry ID must be a string or null');
      }
      if (value && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        throw new Error('Industry ID must be a valid UUID');
      }
      return true;
    }),
  
  body('category_id')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined && typeof value !== 'string') {
        throw new Error('Category ID must be a string or null');
      }
      if (value && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        throw new Error('Category ID must be a valid UUID');
      }
      return true;
    }),
  
  // Ensure at least one field is being updated
  body()
    .custom((value) => {
      const updateFields = [
        'name', 'short_description', 'description_content', 'description_format',
        'terms_content', 'terms_format', 'price_attributes', 'tax_config',
        'metadata', 'specifications', 'status', 'variant_attributes',
        'industry_id', 'category_id'
      ];
      
      const hasUpdate = updateFields.some(field => value[field] !== undefined);
      if (!hasUpdate) {
        throw new Error('At least one field must be provided for update');
      }
      return true;
    })
];

// ===================================================================
// QUERY AND FILTER VALIDATION
// ===================================================================

/**
 * Validation for query parameters
 */
export const queryCatalogItemsValidation: ValidationChain[] = [
  // Basic filters
  query('type')
    .optional()
    .custom((value) => {
      const validTypes = ['service', 'equipment', 'spare_part', 'asset'];
      if (typeof value === 'string') {
        if (!validTypes.includes(value)) {
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
      const validStatuses = ['active', 'inactive', 'draft'];
      if (typeof value === 'string') {
        if (!validStatuses.includes(value)) {
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
  
  query('is_active')
    .optional()
    .isBoolean().withMessage('is_active must be a boolean'),
  
  query('is_live')
    .optional()
    .isBoolean().withMessage('is_live must be a boolean'),
  
  // Classification filters
  query('industry_id')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
          throw new Error('Industry ID must be a valid UUID');
        }
      } else if (Array.isArray(value)) {
        if (!value.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
          throw new Error('All industry IDs must be valid UUIDs');
        }
      } else {
        throw new Error('Industry ID must be a string or array of strings');
      }
      return true;
    }),
  
  query('category_id')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
          throw new Error('Category ID must be a valid UUID');
        }
      } else if (Array.isArray(value)) {
        if (!value.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
          throw new Error('All category IDs must be valid UUIDs');
        }
      } else {
        throw new Error('Category ID must be a string or array of strings');
      }
      return true;
    }),
  
  // Text search
  query('search')
    .optional()
    .isString().withMessage('Search must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Search must be between 2 and 100 characters'),
  
  // Service hierarchy
  query('service_parent_id')
    .optional()
    .isUUID().withMessage('Service parent ID must be a valid UUID'),
  
  query('is_variant')
    .optional()
    .isBoolean().withMessage('is_variant must be a boolean'),
  
  query('include_variants')
    .optional()
    .isBoolean().withMessage('include_variants must be a boolean'),
  
  // Pricing filters
  query('pricing_type')
    .optional()
    .custom((value) => {
      const validTypes = ['fixed', 'unit_price', 'hourly', 'daily', 'monthly', 'package', 'subscription', 'price_range'];
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
    .isFloat({ min: 0 }).withMessage('Min price must be a positive number'),
  
  query('max_price')
    .optional()
    .isFloat({ min: 0 }).withMessage('Max price must be a positive number')
    .custom((value, { req }) => {
      const minPrice = req.query.min_price;
      if (minPrice && parseFloat(value) <= parseFloat(minPrice as string)) {
        throw new Error('Max price must be greater than min price');
      }
      return true;
    }),
  
  query('currency')
    .optional()
    .isString().withMessage('Currency must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  
  // Date filters
  query('created_after')
    .optional()
    .isISO8601().withMessage('created_after must be a valid ISO 8601 date'),
  
  query('created_before')
    .optional()
    .isISO8601().withMessage('created_before must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      const createdAfter = req.query.created_after;
      if (createdAfter && new Date(value) <= new Date(createdAfter as string)) {
        throw new Error('created_before must be after created_after');
      }
      return true;
    }),
  
  query('updated_after')
    .optional()
    .isISO8601().withMessage('updated_after must be a valid ISO 8601 date'),
  
  query('updated_before')
    .optional()
    .isISO8601().withMessage('updated_before must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      const updatedAfter = req.query.updated_after;
      if (updatedAfter && new Date(value) <= new Date(updatedAfter as string)) {
        throw new Error('updated_before must be after updated_after');
      }
      return true;
    }),
  
  query('created_by')
    .optional()
    .isUUID().withMessage('created_by must be a valid UUID'),
  
  // Pagination
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  
  // Sorting
  query('sort_by')
    .optional()
    .isIn(['name', 'created_at', 'updated_at', 'version_number', 'base_amount', 'type', 'status'])
    .withMessage('Sort by must be one of: name, created_at, updated_at, version_number, base_amount, type, status'),
  
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  
  // Include flags
  query('include_related')
    .optional()
    .isBoolean().withMessage('include_related must be a boolean'),
  
  query('include_versions')
    .optional()
    .isBoolean().withMessage('include_versions must be a boolean'),
  
  query('include_history')
    .optional()
    .isBoolean().withMessage('include_history must be a boolean'),
  
  query('environment')
    .optional()
    .isIn(['live', 'test']).withMessage('Environment must be live or test')
];

// ===================================================================
// BULK OPERATIONS VALIDATION
// ===================================================================

/**
 * Validation for bulk operations
 */
export const bulkOperationValidation: ValidationChain[] = [
  body('operation')
    .notEmpty().withMessage('Operation is required')
    .isIn(['create', 'update', 'delete', 'activate', 'deactivate', 'copy'])
    .withMessage('Operation must be one of: create, update, delete, activate, deactivate, copy'),
  
  body('items')
    .notEmpty().withMessage('Items array is required')
    .isArray().withMessage('Items must be an array')
    .isLength({ min: 1, max: 1000 }).withMessage('Items array must contain between 1 and 1000 items'),
  
  body('options')
    .optional()
    .isObject().withMessage('Options must be an object'),
  
  body('options.continue_on_error')
    .optional()
    .isBoolean().withMessage('continue_on_error must be a boolean'),
  
  body('options.batch_size')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Batch size must be between 1 and 100'),
  
  body('options.is_live')
    .optional()
    .isBoolean().withMessage('is_live must be a boolean'),
  
  body('options.dry_run')
    .optional()
    .isBoolean().withMessage('dry_run must be a boolean'),
  
  body('options.notification_email')
    .optional()
    .isEmail().withMessage('Notification email must be a valid email address'),
  
  body('options.version_reason')
    .optional()
    .isString().withMessage('Version reason must be a string')
    .isLength({ min: 3, max: 500 }).withMessage('Version reason must be between 3 and 500 characters'),
  
  body('options.target_status')
    .optional()
    .isIn(['active', 'inactive', 'draft']).withMessage('Target status must be active, inactive, or draft'),
  
  body('options.copy_pricing')
    .optional()
    .isBoolean().withMessage('copy_pricing must be a boolean'),
  
  body('options.copy_variants')
    .optional()
    .isBoolean().withMessage('copy_variants must be a boolean'),
  
  // Custom validation based on operation type
  body()
    .custom((value) => {
      const { operation, items } = value;
      
      switch (operation) {
        case 'delete':
        case 'activate':
        case 'deactivate':
          // These operations just need item IDs
          const validIds = items.every((item: any) => {
            if (typeof item === 'string') {
              return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item);
            }
            if (typeof item === 'object' && item.id) {
              return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id);
            }
            return false;
          });
          
          if (!validIds) {
            throw new Error('All items must be valid UUIDs or objects with valid id field');
          }
          break;
          
        case 'update':
          // Update operations need item ID and at least one update field
          const validUpdates = items.every((item: any) => {
            if (!item.id || typeof item.id !== 'string') {
              return false;
            }
            
            const updateFields = ['name', 'short_description', 'price_attributes', 'status'];
            return updateFields.some(field => item[field] !== undefined);
          });
          
          if (!validUpdates) {
            throw new Error('All update items must have id and at least one update field');
          }
          break;
          
        case 'copy':
          // Copy operations need source_id
          const validCopies = items.every((item: any) => {
            return item.source_id && typeof item.source_id === 'string' &&
                   /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.source_id);
          });
          
          if (!validCopies) {
            throw new Error('All copy items must have valid source_id');
          }
          break;
          
        case 'create':
          // Create operations need valid create data - this would be more complex validation
          // For now, just check that items are objects
          const validCreates = items.every((item: any) => {
            return typeof item === 'object' && item.name && item.type && item.price_attributes;
          });
          
          if (!validCreates) {
            throw new Error('All create items must have name, type, and price_attributes');
          }
          break;
      }
      
      return true;
    })
];

// ===================================================================
// PATH PARAMETER VALIDATION
// ===================================================================

/**
 * Validation for item ID parameter
 */
export const itemIdValidation: ValidationChain[] = [
  param('id')
    .notEmpty().withMessage('Item ID is required')
    .isUUID().withMessage('Item ID must be a valid UUID')
];

// ===================================================================
// VALIDATION ERROR HANDLER MIDDLEWARE
// ===================================================================

/**
 * Middleware to handle validation errors
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'general',
      message: error.msg,
      code: 'VALIDATION_ERROR',
      value: error.type === 'field' ? error.value : undefined
    }));
    
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

/**
 * Combine validation chains with error handler
 */
export const validateAndHandle = (validationChains: ValidationChain[]) => {
  return [...validationChains, handleValidationErrors];
};