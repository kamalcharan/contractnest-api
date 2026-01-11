// src/validators/tenantProfile.ts
import { body, ValidationChain } from 'express-validator';

/**
 * Validation rules for creating a tenant profile
 */
export const createTenantProfileValidation: ValidationChain[] = [
  // Required fields
  body('business_name')
    .notEmpty().withMessage('Business name is required')
    .isString().withMessage('Business name must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Business name must be between 2 and 100 characters'),
  
  body('business_type_id')
    .notEmpty().withMessage('Business type is required')
    .isString().withMessage('Business type must be a string'),
  
  body('industry_id')
    .notEmpty().withMessage('Industry is required')
    .isString().withMessage('Industry must be a string'),
  
  // Optional fields with validation when present
  body('logo_url')
    .optional()
    .isURL().withMessage('Logo URL must be a valid URL'),
  
  body('business_email')
    .optional()
    .isEmail().withMessage('Business email must be a valid email address'),
  
  body('website_url')
    .optional()
    .isURL().withMessage('Website URL must be a valid URL'),
  
  body('business_phone')
    .optional()
    .isString().withMessage('Business phone must be a string')
    .matches(/^[0-9]+$/).withMessage('Business phone must contain only numbers'),
  
  body('business_phone_country_code')
    .optional()
    .isString().withMessage('Country code must be a string')
    .matches(/^\+?[0-9]+$/).withMessage('Country code must contain only numbers with an optional plus sign'),
  
  body('country_code')
    .optional()
    .isString().withMessage('Country code must be a string')
    .isLength({ min: 2, max: 3 }).withMessage('Country code must be 2 or 3 characters'),
  
  body('state_code')
    .optional()
    .isString().withMessage('State code must be a string'),
  
  body('city')
    .optional()
    .isString().withMessage('City must be a string')
    .isLength({ max: 100 }).withMessage('City must be at most 100 characters'),
  
  body('address_line1')
    .optional()
    .isString().withMessage('Address line 1 must be a string')
    .isLength({ max: 200 }).withMessage('Address line 1 must be at most 200 characters'),
  
  body('address_line2')
    .optional()
    .isString().withMessage('Address line 2 must be a string')
    .isLength({ max: 200 }).withMessage('Address line 2 must be at most 200 characters'),
  
  body('postal_code')
    .optional()
    .isString().withMessage('Postal code must be a string')
    .isLength({ max: 20 }).withMessage('Postal code must be at most 20 characters'),
  
  body('primary_color')
    .optional()
    .isString().withMessage('Primary color must be a string')
    .matches(/^#([0-9A-F]{3}){1,2}$/i).withMessage('Primary color must be a valid hex color code'),
  
  body('secondary_color')
    .optional()
    .isString().withMessage('Secondary color must be a string')
    .matches(/^#([0-9A-F]{3}){1,2}$/i).withMessage('Secondary color must be a valid hex color code'),

  // ✅ ADDED: Contact person and booking fields
  body('booking_url')
    .optional()
    .isURL().withMessage('Booking URL must be a valid URL'),

  body('contact_first_name')
    .optional()
    .isString().withMessage('Contact first name must be a string')
    .isLength({ max: 100 }).withMessage('Contact first name must be at most 100 characters'),

  body('contact_last_name')
    .optional()
    .isString().withMessage('Contact last name must be a string')
    .isLength({ max: 100 }).withMessage('Contact last name must be at most 100 characters')
];

/**
 * Validation rules for updating a tenant profile
 * Similar to create but all fields are optional
 */
export const updateTenantProfileValidation: ValidationChain[] = [
  // All fields are optional for update, but validate them if present
  body('business_name')
    .optional()
    .isString().withMessage('Business name must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Business name must be between 2 and 100 characters'),
  
  body('business_type_id')
    .optional()
    .isString().withMessage('Business type must be a string'),
  
  body('industry_id')
    .optional()
    .isString().withMessage('Industry must be a string'),
  
  // Same validation for other fields
  body('logo_url')
    .optional()
    .isURL().withMessage('Logo URL must be a valid URL'),
  
  body('business_email')
    .optional()
    .isEmail().withMessage('Business email must be a valid email address'),
  
  body('website_url')
    .optional()
    .isURL().withMessage('Website URL must be a valid URL'),
  
  body('business_phone')
    .optional()
    .isString().withMessage('Business phone must be a string')
    .matches(/^[0-9]+$/).withMessage('Business phone must contain only numbers'),
  
  body('business_phone_country_code')
    .optional()
    .isString().withMessage('Country code must be a string')
    .matches(/^\+?[0-9]+$/).withMessage('Country code must contain only numbers with an optional plus sign'),
  
  body('country_code')
    .optional()
    .isString().withMessage('Country code must be a string')
    .isLength({ min: 2, max: 3 }).withMessage('Country code must be 2 or 3 characters'),
  
  body('state_code')
    .optional()
    .isString().withMessage('State code must be a string'),
  
  body('city')
    .optional()
    .isString().withMessage('City must be a string')
    .isLength({ max: 100 }).withMessage('City must be at most 100 characters'),
  
  body('address_line1')
    .optional()
    .isString().withMessage('Address line 1 must be a string')
    .isLength({ max: 200 }).withMessage('Address line 1 must be at most 200 characters'),
  
  body('address_line2')
    .optional()
    .isString().withMessage('Address line 2 must be a string')
    .isLength({ max: 200 }).withMessage('Address line 2 must be at most 200 characters'),
  
  body('postal_code')
    .optional()
    .isString().withMessage('Postal code must be a string')
    .isLength({ max: 20 }).withMessage('Postal code must be at most 20 characters'),
  
  body('primary_color')
    .optional()
    .isString().withMessage('Primary color must be a string')
    .matches(/^#([0-9A-F]{3}){1,2}$/i).withMessage('Primary color must be a valid hex color code'),
  
  body('secondary_color')
    .optional()
    .isString().withMessage('Secondary color must be a string')
    .matches(/^#([0-9A-F]{3}){1,2}$/i).withMessage('Secondary color must be a valid hex color code'),

  // ✅ ADDED: Contact person and booking fields
  body('booking_url')
    .optional()
    .isURL().withMessage('Booking URL must be a valid URL'),

  body('contact_first_name')
    .optional()
    .isString().withMessage('Contact first name must be a string')
    .isLength({ max: 100 }).withMessage('Contact first name must be at most 100 characters'),

  body('contact_last_name')
    .optional()
    .isString().withMessage('Contact last name must be a string')
    .isLength({ max: 100 }).withMessage('Contact last name must be at most 100 characters')
];