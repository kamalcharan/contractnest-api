// src/validators/businessModel.ts

import { body, ValidationChain } from 'express-validator';

/**
 * Validation rules for creating a pricing plan
 */
export const createPlanValidation: ValidationChain[] = [
  body('name')
    .notEmpty().withMessage('Plan name is required')
    .isString().withMessage('Plan name must be a string')
    .isLength({ max: 255 }).withMessage('Plan name must be 255 characters or less'),
  
  body('description')
    .optional()
    .isString().withMessage('Description must be a string'),
  
  body('plan_type')
    .notEmpty().withMessage('Plan type is required')
    .isIn(['Per User', 'Per Contract']).withMessage('Plan type must be "Per User" or "Per Contract"'),
  
  body('trial_duration')
    .optional()
    .isInt({ min: 0 }).withMessage('Trial duration must be a non-negative integer'),
  
  body('is_visible')
    .optional()
    .isBoolean().withMessage('is_visible must be a boolean'),
  
  body('default_currency_code')
    .notEmpty().withMessage('Default currency code is required')
    .isString().withMessage('Default currency code must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('Currency code must be 3 characters'),
  
  body('supported_currencies')
    .notEmpty().withMessage('Supported currencies are required')
    .isArray().withMessage('Supported currencies must be an array')
    .custom((values, { req }) => {
      if (values.length === 0) {
        throw new Error('At least one supported currency is required');
      }
      
      // Check if default currency is included
      if (req.body.default_currency_code && !values.includes(req.body.default_currency_code)) {
        throw new Error('Default currency must be included in supported currencies');
      }
      
      return true;
    })
];

/**
 * Validation rules for updating a pricing plan
 */
export const updatePlanValidation: ValidationChain[] = [
  body('name')
    .optional()
    .isString().withMessage('Plan name must be a string')
    .isLength({ max: 255 }).withMessage('Plan name must be 255 characters or less'),
  
  body('description')
    .optional()
    .isString().withMessage('Description must be a string'),
  
  body('trial_duration')
    .optional()
    .isInt({ min: 0 }).withMessage('Trial duration must be a non-negative integer'),
  
  body('default_currency_code')
    .optional()
    .isString().withMessage('Default currency code must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('Currency code must be 3 characters'),
  
  body('supported_currencies')
    .optional()
    .isArray().withMessage('Supported currencies must be an array')
    .custom((values, { req }) => {
      if (values && values.length === 0) {
        throw new Error('At least one supported currency is required');
      }
      
      // Check if default currency is included
      if (req.body.default_currency_code && values && !values.includes(req.body.default_currency_code)) {
        throw new Error('Default currency must be included in supported currencies');
      }
      
      return true;
    })
];

/**
 * Validation rules for toggling plan visibility
 */
export const togglePlanVisibilityValidation: ValidationChain[] = [
  body('is_visible')
    .notEmpty().withMessage('is_visible field is required')
    .isBoolean().withMessage('is_visible must be a boolean')
];

/**
 * Validation rules for creating a plan version
 */
export const createPlanVersionValidation: ValidationChain[] = [
  body('plan_id')
    .notEmpty().withMessage('Plan ID is required')
    .isUUID().withMessage('Plan ID must be a valid UUID'),
  
  body('version_number')
    .notEmpty().withMessage('Version number is required')
    .isString().withMessage('Version number must be a string')
    .matches(/^\d+\.\d+$/).withMessage('Version number must be in format X.Y (e.g., 1.0)'),
  
  body('effective_date')
    .notEmpty().withMessage('Effective date is required')
    .isISO8601().withMessage('Effective date must be a valid ISO 8601 date'),
  
  body('changelog')
    .optional()
    .isString().withMessage('Changelog must be a string'),
  
  body('activate_immediately')
    .optional()
    .isBoolean().withMessage('activate_immediately must be a boolean'),
  
  // Tiers validation
  body('tiers')
    .notEmpty().withMessage('Tiers are required')
    .isArray().withMessage('Tiers must be an array')
    .custom(tiers => {
      if (tiers.length === 0) {
        throw new Error('At least one pricing tier is required');
      }
      
      // Validate each tier
      tiers.forEach((tier: any, index: number) => {
        if (!tier.tier_id) {
          throw new Error(`Tier ${index + 1}: tier_id is required`);
        }
        
        if (tier.min_value === undefined || tier.min_value === null) {
          throw new Error(`Tier ${index + 1}: min_value is required`);
        }
        
        if (!tier.label) {
          throw new Error(`Tier ${index + 1}: label is required`);
        }
        
        if (!tier.prices || Object.keys(tier.prices).length === 0) {
          throw new Error(`Tier ${index + 1}: At least one currency price is required`);
        }
      });
      
      return true;
    }),
  
  // Features validation
  body('features')
    .notEmpty().withMessage('Features are required')
    .isArray().withMessage('Features must be an array')
    .custom(features => {
      // Check unique feature IDs
      const featureIds = new Set();
      features.forEach((feature: any, index: number) => {
        if (!feature.feature_id) {
          throw new Error(`Feature ${index + 1}: feature_id is required`);
        }
        
        if (featureIds.has(feature.feature_id)) {
          throw new Error(`Feature ${index + 1}: Duplicate feature ID: ${feature.feature_id}`);
        }
        
        featureIds.add(feature.feature_id);
        
        // Check required fields
        if (feature.enabled === undefined) {
          throw new Error(`Feature ${index + 1}: enabled flag is required`);
        }
        
        if (feature.limit === undefined) {
          throw new Error(`Feature ${index + 1}: limit is required`);
        }
        
        // Special feature validation
        if (feature.is_special_feature && (!feature.pricing_period || !feature.prices)) {
          throw new Error(`Feature ${index + 1}: Special features must have pricing_period and prices`);
        }
      });
      
      return true;
    }),
  
  // Notifications validation
  body('notifications')
    .notEmpty().withMessage('Notifications are required')
    .isArray().withMessage('Notifications must be an array')
    .custom(notifications => {
      // Check unique notification method+category combinations
      const notifCombos = new Set();
      notifications.forEach((notification: any, index: number) => {
        if (!notification.notif_type) {
          throw new Error(`Notification ${index + 1}: notif_type is required`);
        }
        
        if (!notification.category) {
          throw new Error(`Notification ${index + 1}: category is required`);
        }
        
        const combo = `${notification.notif_type}-${notification.category}`;
        if (notifCombos.has(combo)) {
          throw new Error(`Notification ${index + 1}: Duplicate type-category combination: ${combo}`);
        }
        
        notifCombos.add(combo);
        
        // Check required fields
        if (notification.enabled === undefined) {
          throw new Error(`Notification ${index + 1}: enabled flag is required`);
        }
        
        if (notification.enabled && (!notification.credits_per_unit || notification.credits_per_unit < 0)) {
          throw new Error(`Notification ${index + 1}: credits_per_unit must be a positive number`);
        }
        
        if (!notification.prices || Object.keys(notification.prices).length === 0) {
          throw new Error(`Notification ${index + 1}: At least one currency price is required`);
        }
      });
      
      return true;
    })
];

/**
 * Validation for edit workflow (creating new version from edit)
 */
export const editPlanValidation: ValidationChain[] = [
  body('plan_id')
    .notEmpty().withMessage('Plan ID is required'),
    
  body('next_version_number')
    .notEmpty().withMessage('Version number is required')
    .matches(/^\d+\.\d+$/).withMessage('Version number must be in format X.Y (e.g., 1.1)'),
    
  body('changelog')
    .notEmpty().withMessage('Changelog is required')
    .isLength({ min: 5 }).withMessage('Changelog must be at least 5 characters long'),
    
  body('tiers')
    .notEmpty().withMessage('Tiers are required')
    .isArray().withMessage('Tiers must be an array')
    .custom(tiers => {
      if (tiers.length === 0) {
        throw new Error('At least one pricing tier is required');
      }
      return true;
    }),
    
  body('features')
    .isArray().withMessage('Features must be an array'),
    
  body('notifications')
    .isArray().withMessage('Notifications must be an array')
];
