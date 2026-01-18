// src/middleware/contactValidators.ts
import { body, validationResult, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { CONTACT_FORM_TYPES, CONTACT_STATUS, CONTACT_CLASSIFICATIONS } from '../utils/constants/contacts';
import {
  validatePhoneLengthForCountry,
  validateIndividualName,
  validateCompanyName,
  NAME_PATTERN,
  COMPANY_NAME_PATTERN
} from '../utils/constants/countries';

// Validation constants (copied from constants file)
const VALIDATION_RULES = {
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  PHONE_MIN_LENGTH: 7,
  PHONE_MAX_LENGTH: 15,
  EMAIL_MAX_LENGTH: 200,
  NOTES_MAX_LENGTH: 1000,
  SEARCH_QUERY_MAX_LENGTH: 100,
  TAG_MAX_COUNT: 10
};

const CHANNEL_TYPES = ['mobile', 'phone', 'email', 'whatsapp', 'linkedin', 'website', 'telegram', 'skype'];
const ADDRESS_TYPES = ['home', 'office', 'billing', 'shipping', 'factory', 'warehouse', 'other'];

/**
 * Handle validation errors middleware
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      validation_errors: formattedErrors
    });
  }
  
  next();
};

/**
 * Common validation chains
 */
const contactTypeValidation = (): ValidationChain => 
  body('type')
    .notEmpty()
    .withMessage('Contact type is required')
    .isIn(Object.values(CONTACT_FORM_TYPES))
    .withMessage(`Contact type must be one of: ${Object.values(CONTACT_FORM_TYPES).join(', ')}`);

const contactStatusValidation = (): ValidationChain => 
  body('status')
    .optional()
    .isIn(Object.values(CONTACT_STATUS))
    .withMessage(`Status must be one of: ${Object.values(CONTACT_STATUS).join(', ')}`);

const classificationsValidation = (): ValidationChain => 
  body('classifications')
    .isArray({ min: 1 })
    .withMessage('At least one classification is required')
    .custom((classifications) => {
      const validClassifications = Object.values(CONTACT_CLASSIFICATIONS);
      const invalidOnes = classifications.filter((c: string) => !validClassifications.includes(c as any));
      if (invalidOnes.length > 0) {
        throw new Error(`Invalid classifications: ${invalidOnes.join(', ')}`);
      }
      return true;
    });

const nameValidation = (field: string, isRequired: boolean = true, isCompany: boolean = false): ValidationChain => {
  let validation = body(field);

  if (isRequired) {
    validation = validation.notEmpty().withMessage(`${field} is required`);
  } else {
    validation = validation.optional();
  }

  return validation
    .isLength({ min: VALIDATION_RULES.NAME_MIN_LENGTH, max: VALIDATION_RULES.NAME_MAX_LENGTH })
    .withMessage(`${field} must be between ${VALIDATION_RULES.NAME_MIN_LENGTH} and ${VALIDATION_RULES.NAME_MAX_LENGTH} characters`)
    .trim()
    .custom((value) => {
      if (!value) return true;

      // Use appropriate pattern based on field type
      const pattern = isCompany ? COMPANY_NAME_PATTERN : NAME_PATTERN;
      if (!pattern.test(value)) {
        throw new Error(
          isCompany
            ? `${field} contains invalid characters`
            : `${field} can only contain letters, spaces, hyphens, apostrophes, and periods`
        );
      }

      // Check for consecutive special characters
      if (/[\-'.]{2,}/.test(value)) {
        throw new Error(`${field} cannot have consecutive special characters`);
      }

      // Name shouldn't start or end with special characters (except period for titles)
      if (!isCompany && /^[\-',]|[\-',]$/.test(value)) {
        throw new Error(`${field} cannot start or end with special characters`);
      }

      return true;
    });
};

const notesValidation = (): ValidationChain => 
  body('notes')
    .optional()
    .isLength({ max: VALIDATION_RULES.NOTES_MAX_LENGTH })
    .withMessage(`Notes must not exceed ${VALIDATION_RULES.NOTES_MAX_LENGTH} characters`)
    .trim();

/**
 * Contact channels validation
 */
const contactChannelsValidation = (): ValidationChain =>
  body('contact_channels')
    .isArray({ min: 1 })
    .withMessage('At least one contact channel is required')
    .custom((channels) => {
      let hasPrimary = false;
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

      for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];

        // Channel type validation
        if (!channel.channel_type || !CHANNEL_TYPES.includes(channel.channel_type)) {
          throw new Error(`Channel ${i + 1}: Invalid channel type. Must be one of: ${CHANNEL_TYPES.join(', ')}`);
        }

        // Value validation
        if (!channel.value || typeof channel.value !== 'string' || channel.value.trim().length === 0) {
          throw new Error(`Channel ${i + 1}: Value is required`);
        }

        // Type-specific validation
        if (channel.channel_type === 'email') {
          if (!emailRegex.test(channel.value)) {
            throw new Error(`Channel ${i + 1}: Invalid email format`);
          }
          if (channel.value.length > VALIDATION_RULES.EMAIL_MAX_LENGTH) {
            throw new Error(`Channel ${i + 1}: Email too long (max ${VALIDATION_RULES.EMAIL_MAX_LENGTH} characters)`);
          }
          // Check for consecutive dots
          if (channel.value.includes('..')) {
            throw new Error(`Channel ${i + 1}: Email cannot contain consecutive dots`);
          }
          // Ensure domain has at least one dot
          const [, domain] = channel.value.split('@');
          if (!domain || !domain.includes('.')) {
            throw new Error(`Channel ${i + 1}: Please enter a valid email domain`);
          }
        }

        // Phone-based channels (mobile, phone, whatsapp)
        if (['mobile', 'phone', 'whatsapp'].includes(channel.channel_type)) {
          // Extract digits only for validation
          const digitsOnly = channel.value.replace(/\D/g, '');

          // Default to IN if country_code not provided (defensive fallback for backwards compatibility)
          const countryCode = channel.country_code || 'IN';

          // Auto-populate country_code if missing to ensure data consistency
          if (!channel.country_code) {
            channel.country_code = countryCode;
          }

          // Validate phone length based on country
          const phoneValidation = validatePhoneLengthForCountry(digitsOnly, countryCode);
          if (!phoneValidation.isValid) {
            throw new Error(`Channel ${i + 1}: ${phoneValidation.error}`);
          }
        }

        // LinkedIn validation
        if (channel.channel_type === 'linkedin') {
          const value = channel.value.trim();
          if (value.includes('linkedin.com')) {
            // URL format - basic check
            if (!value.match(/^https?:\/\//i) && !value.startsWith('linkedin.com')) {
              throw new Error(`Channel ${i + 1}: Invalid LinkedIn URL format`);
            }
          } else {
            // Username format
            if (!/^[a-zA-Z0-9\-]{3,100}$/.test(value)) {
              throw new Error(`Channel ${i + 1}: LinkedIn username must be 3-100 characters (letters, numbers, hyphens)`);
            }
          }
        }

        // Telegram/Skype validation
        if (['telegram', 'skype'].includes(channel.channel_type)) {
          const value = channel.value.trim();
          if (value.length < 3) {
            throw new Error(`Channel ${i + 1}: ${channel.channel_type} username must be at least 3 characters`);
          }
          if (value.length > 50) {
            throw new Error(`Channel ${i + 1}: ${channel.channel_type} username is too long`);
          }
          if (!/^@?[a-zA-Z0-9_]+$/.test(value)) {
            throw new Error(`Channel ${i + 1}: ${channel.channel_type} username can only contain letters, numbers, and underscores`);
          }
        }

        // Website validation
        if (channel.channel_type === 'website') {
          let urlToValidate = channel.value.trim();
          if (!urlToValidate.match(/^https?:\/\//i)) {
            urlToValidate = 'https://' + urlToValidate;
          }
          try {
            const parsedUrl = new URL(urlToValidate);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
              throw new Error(`Channel ${i + 1}: Please enter a valid website URL`);
            }
          } catch {
            throw new Error(`Channel ${i + 1}: Please enter a valid website URL`);
          }
        }

        // Primary channel validation
        if (channel.is_primary === true) {
          if (hasPrimary) {
            throw new Error('Only one contact channel can be marked as primary');
          }
          hasPrimary = true;
        }
      }

      if (!hasPrimary) {
        throw new Error('At least one contact channel must be marked as primary');
      }

      return true;
    });

/**
 * Contact addresses validation
 */
const addressesValidation = (): ValidationChain => 
  body('addresses')
    .optional()
    .isArray()
    .custom((addresses) => {
      if (!addresses || addresses.length === 0) return true;

      let hasPrimary = false;

      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];

        // Address type validation
        if (!address.type || !ADDRESS_TYPES.includes(address.type)) {
          throw new Error(`Address ${i + 1}: Invalid address type. Must be one of: ${ADDRESS_TYPES.join(', ')}`);
        }

        // Required fields
        if (!address.address_line1 || address.address_line1.trim().length === 0) {
          throw new Error(`Address ${i + 1}: Address line 1 is required`);
        }

        if (!address.city || address.city.trim().length === 0) {
          throw new Error(`Address ${i + 1}: City is required`);
        }

        if (!address.country_code || address.country_code.trim().length === 0) {
          throw new Error(`Address ${i + 1}: Country code is required`);
        }

        // Length validations
        if (address.address_line1.length > 200) {
          throw new Error(`Address ${i + 1}: Address line 1 too long (max 200 characters)`);
        }

        if (address.city.length > 100) {
          throw new Error(`Address ${i + 1}: City name too long (max 100 characters)`);
        }

        // Primary address validation
        if (address.is_primary === true) {
          if (hasPrimary) {
            throw new Error('Only one address can be marked as primary');
          }
          hasPrimary = true;
        }
      }

      return true;
    });

/**
 * Tags validation
 */
const tagsValidation = (): ValidationChain => 
  body('tags')
    .optional()
    .isArray({ max: VALIDATION_RULES.TAG_MAX_COUNT })
    .withMessage(`Maximum ${VALIDATION_RULES.TAG_MAX_COUNT} tags allowed`)
    .custom((tags) => {
      if (!tags || tags.length === 0) return true;

      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        
        if (!tag.tag_value || typeof tag.tag_value !== 'string') {
          throw new Error(`Tag ${i + 1}: tag_value is required and must be a string`);
        }
        
        if (!tag.tag_label || typeof tag.tag_label !== 'string') {
          throw new Error(`Tag ${i + 1}: tag_label is required and must be a string`);
        }
      }

      return true;
    });

/**
 * Compliance numbers validation (for corporate contacts)
 */
const complianceNumbersValidation = (): ValidationChain => 
  body('compliance_numbers')
    .optional()
    .isArray()
    .custom((complianceNumbers) => {
      if (!complianceNumbers || complianceNumbers.length === 0) return true;

      for (let i = 0; i < complianceNumbers.length; i++) {
        const compliance = complianceNumbers[i];
        
        if (!compliance.type_value || typeof compliance.type_value !== 'string') {
          throw new Error(`Compliance ${i + 1}: type_value is required`);
        }
        
        if (!compliance.number || typeof compliance.number !== 'string') {
          throw new Error(`Compliance ${i + 1}: number is required`);
        }

        if (compliance.number.length > 50) {
          throw new Error(`Compliance ${i + 1}: number too long (max 50 characters)`);
        }
      }

      return true;
    });

/**
 * Individual contact validation
 */
const individualContactValidation = (): ValidationChain =>
  body()
    .custom((body) => {
      if (body.type === CONTACT_FORM_TYPES.INDIVIDUAL) {
        if (!body.name || body.name.trim().length < VALIDATION_RULES.NAME_MIN_LENGTH) {
          throw new Error('Name is required for individual contacts');
        }

        // Validate name using the utility function
        const nameValidation = validateIndividualName(body.name);
        if (!nameValidation.isValid) {
          throw new Error(nameValidation.error || 'Invalid name');
        }

        // Individual contacts shouldn't have corporate-specific fields
        if (body.company_name) {
          throw new Error('Individual contacts cannot have company_name');
        }

        if (body.compliance_numbers && body.compliance_numbers.length > 0) {
          throw new Error('Individual contacts cannot have compliance numbers');
        }
      }
      return true;
    });

/**
 * Corporate contact validation
 */
const corporateContactValidation = (): ValidationChain =>
  body()
    .custom((body) => {
      if (body.type === CONTACT_FORM_TYPES.CORPORATE) {
        if (!body.company_name || body.company_name.trim().length < VALIDATION_RULES.NAME_MIN_LENGTH) {
          throw new Error('Company name is required for corporate contacts');
        }

        // Validate company name using the utility function
        const companyValidation = validateCompanyName(body.company_name);
        if (!companyValidation.isValid) {
          throw new Error(companyValidation.error || 'Invalid company name');
        }

        // Corporate contacts shouldn't have individual-specific fields
        if (body.name) {
          throw new Error('Corporate contacts should not have individual name');
        }
      }
      return true;
    });

// ==========================================================
// Main Validation Middleware Functions
// ==========================================================

/**
 * Validate contact creation input
 */
export const validateContactInput = [
  contactTypeValidation(),
  contactStatusValidation(),
  classificationsValidation(),
  contactChannelsValidation(),
  addressesValidation(),
  tagsValidation(),
  complianceNumbersValidation(),
  notesValidation(),
  individualContactValidation(),
  corporateContactValidation(),
  handleValidationErrors
];

/**
 * Validate contact update input
 */
export const validateContactUpdate = [
  // Type is not required for updates, but if provided, should be valid
  body('type')
    .optional()
    .isIn(Object.values(CONTACT_FORM_TYPES))
    .withMessage(`Contact type must be one of: ${Object.values(CONTACT_FORM_TYPES).join(', ')}`),
  
  contactStatusValidation(),
  
  // Classifications optional for updates
  body('classifications')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Classifications must be a non-empty array if provided')
    .custom((classifications) => {
      const validClassifications = Object.values(CONTACT_CLASSIFICATIONS);
      const invalidOnes = classifications.filter((c: string) => !validClassifications.includes(c as any));
      if (invalidOnes.length > 0) {
        throw new Error(`Invalid classifications: ${invalidOnes.join(', ')}`);
      }
      return true;
    }),
  
  // Name validations (optional for updates)
  nameValidation('name', false, false),
  nameValidation('company_name', false, true),
  
  // Optional field validations
  addressesValidation(),
  tagsValidation(),
  complianceNumbersValidation(),
  notesValidation(),
  
  handleValidationErrors
];

/**
 * Validate search input
 */
export const validateContactSearch = [
  body('query')
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 1, max: VALIDATION_RULES.SEARCH_QUERY_MAX_LENGTH })
    .withMessage(`Search query must be between 1 and ${VALIDATION_RULES.SEARCH_QUERY_MAX_LENGTH} characters`)
    .trim()
    .escape(), // Escape HTML entities for security
  
  body('filters')
    .optional()
    .isObject()
    .withMessage('Filters must be an object'),
  
  body('filters.status')
    .optional()
    .isIn(Object.values(CONTACT_STATUS))
    .withMessage(`Status filter must be one of: ${Object.values(CONTACT_STATUS).join(', ')}`),
  
  body('filters.type')
    .optional()
    .isIn(Object.values(CONTACT_FORM_TYPES))
    .withMessage(`Type filter must be one of: ${Object.values(CONTACT_FORM_TYPES).join(', ')}`),
  
  body('filters.classifications')
    .optional()
    .isArray()
    .withMessage('Classifications filter must be an array'),
  
  body('filters.page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Page must be between 1 and 1000'),
  
  body('filters.limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

/**
 * Validate status update
 */
export const validateStatusUpdate = [
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(Object.values(CONTACT_STATUS))
    .withMessage(`Status must be one of: ${Object.values(CONTACT_STATUS).join(', ')}`),
  
  handleValidationErrors
];

/**
 * Validate duplicate check input
 */
export const validateDuplicateCheck = [
  body('contact_channels')
    .isArray({ min: 1 })
    .withMessage('At least one contact channel is required for duplicate checking')
    .custom((channels) => {
      for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        
        if (!channel.channel_type || !CHANNEL_TYPES.includes(channel.channel_type)) {
          throw new Error(`Channel ${i + 1}: Invalid channel type`);
        }
        
        if (!channel.value || channel.value.trim().length === 0) {
          throw new Error(`Channel ${i + 1}: Value is required`);
        }
        
        // Only check mobile and email for duplicates
        if (!['mobile', 'email'].includes(channel.channel_type)) {
          throw new Error(`Channel ${i + 1}: Only mobile and email channels can be checked for duplicates`);
        }
      }
      return true;
    }),
  
  handleValidationErrors
];

/**
 * Validate UUID parameters
 */
// export const validateUUIDParam = (paramName: string = 'id') => [
  // body() // This will be replaced with param validation in the route
    // .custom((value, { req }) => {
     // const paramValue = req.params[paramName];
      // const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
     // if (!paramValue || !uuidRegex.test(paramValue)) {
       // throw new Error(`Invalid ${paramName} format. Must be a valid UUID.`);
     // }
      
     // return true;
   // }),
  
 // handleValidationErrors
// ];

/**
 * Sanitize and validate file upload for import
 */
export const validateImportFile = [
  body() // This will be used with multer for file uploads
    .custom((value, { req }) => {
      if (!req.file) {
        throw new Error('File is required for import');
      }
      
      const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        throw new Error('File must be CSV or Excel format');
      }
      
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (req.file.size > maxSize) {
        throw new Error('File size must not exceed 5MB');
      }
      
      return true;
    }),
  
  handleValidationErrors
];

// ==========================================================
// Utility Functions
// ==========================================================

/**
 * Custom validator for checking if value exists in array
 */
export const isInArray = (allowedValues: string[]) => (value: string) => {
  return allowedValues.includes(value);
};

/**
 * Custom validator for email format
 */
export const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Custom validator for phone number format
 */
export const isValidPhone = (phone: string) => {
  const phoneRegex = /^[0-9+\-\s()]{10,20}$/;
  return phoneRegex.test(phone);
};

/**
 * Custom validator for UUID format
 */
export const isValidUUID = (uuid: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};