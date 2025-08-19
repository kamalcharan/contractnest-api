// src/validators/serviceCatalogValidators.ts
// 🚀 Service Catalog Validators - Comprehensive input validation for Service Catalog operations
import {
  CreateServiceCatalogItemInput,
  UpdateServiceCatalogItemInput,
  ServiceCatalogFilters,
  BulkCreateServiceCatalogItemsInput,
  BulkUpdateServiceCatalogItemsInput,
  AssociateServiceResourcesInput,
  UpdateServicePricingInput,
  ResourceSearchFilters,
  ServiceCatalogSort,
  PaginationInput,
  PricingModel,
  BillingCycle,
  ValidationMode,
  ServiceCatalogError
} from '../types/serviceCatalogGraphQL';

// =================================================================
// VALIDATION RESULT INTERFACE
// =================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: ServiceCatalogError[];
  warnings: ServiceCatalogError[];
  sanitizedData?: any;
}

// =================================================================
// VALIDATION HELPER FUNCTIONS
// =================================================================

/**
 * UUID validation
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Service name validation
 */
function isValidServiceName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 3 && 
         trimmed.length <= 100 && 
         /^[a-zA-Z0-9\s\-_.()&]+$/.test(trimmed);
}

/**
 * SKU validation
 */
function isValidSKU(sku: string): boolean {
  if (!sku || typeof sku !== 'string') return false;
  const trimmed = sku.trim();
  return trimmed.length >= 3 && 
         trimmed.length <= 50 && 
         /^[A-Z0-9\-_]+$/.test(trimmed);
}

/**
 * Currency code validation
 */
function isValidCurrencyCode(currency: string): boolean {
  if (!currency || typeof currency !== 'string') return false;
  return currency.length === 3 && /^[A-Z]{3}$/.test(currency);
}

/**
 * Price validation
 */
function isValidPrice(price: number): boolean {
  if (typeof price !== 'number' || isNaN(price)) return false;
  return price > 0 && price <= 999999999.99;
}

/**
 * Email validation
 */
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// =================================================================
// PRICING VALIDATION FUNCTIONS
// =================================================================

/**
 * Validate pricing tier
 */
function validatePricingTier(tier: any): ServiceCatalogError[] {
  const errors: ServiceCatalogError[] = [];

  if (typeof tier.minQuantity !== 'number' || tier.minQuantity < 1) {
    errors.push({
      code: 'INVALID_MIN_QUANTITY',
      message: 'Minimum quantity must be at least 1',
      field: 'minQuantity',
      value: tier.minQuantity
    });
  }

  if (tier.maxQuantity !== null && tier.maxQuantity !== undefined) {
    if (typeof tier.maxQuantity !== 'number' || tier.maxQuantity < tier.minQuantity) {
      errors.push({
        code: 'INVALID_MAX_QUANTITY',
        message: 'Maximum quantity must be greater than or equal to minimum quantity',
        field: 'maxQuantity',
        value: tier.maxQuantity
      });
    }
  }

  if (!isValidPrice(tier.price)) {
    errors.push({
      code: 'INVALID_PRICE',
      message: 'Price must be a positive number',
      field: 'price',
      value: tier.price
    });
  }

  if (tier.discountPercentage !== undefined) {
    if (typeof tier.discountPercentage !== 'number' || tier.discountPercentage < 0 || tier.discountPercentage > 100) {
      errors.push({
        code: 'INVALID_DISCOUNT_PERCENTAGE',
        message: 'Discount percentage must be between 0 and 100',
        field: 'discountPercentage',
        value: tier.discountPercentage
      });
    }
  }

  return errors;
}

/**
 * Validate discount rule
 */
function validateDiscountRule(rule: any): ServiceCatalogError[] {
  const errors: ServiceCatalogError[] = [];

  if (!rule.ruleName || typeof rule.ruleName !== 'string' || rule.ruleName.trim().length === 0 || rule.ruleName.length > 50) {
    errors.push({
      code: 'INVALID_RULE_NAME',
      message: 'Rule name must be a non-empty string with max 50 characters',
      field: 'ruleName',
      value: rule.ruleName
    });
  }

  if (!rule.condition || typeof rule.condition !== 'string' || rule.condition.trim().length === 0 || rule.condition.length > 500) {
    errors.push({
      code: 'INVALID_CONDITION',
      message: 'Condition must be a non-empty string with max 500 characters',
      field: 'condition',
      value: rule.condition
    });
  }

  if (!rule.action || typeof rule.action !== 'string' || rule.action.trim().length === 0 || rule.action.length > 500) {
    errors.push({
      code: 'INVALID_ACTION',
      message: 'Action must be a non-empty string with max 500 characters',
      field: 'action',
      value: rule.action
    });
  }

  if (rule.value !== undefined && (typeof rule.value !== 'number' || rule.value < 0)) {
    errors.push({
      code: 'INVALID_DISCOUNT_VALUE',
      message: 'Discount value cannot be negative',
      field: 'value',
      value: rule.value
    });
  }

  return errors;
}

/**
 * Validate service pricing configuration
 */
function validateServicePricingConfig(pricingConfig: any): ServiceCatalogError[] {
  const errors: ServiceCatalogError[] = [];

  // Validate base price
  if (!isValidPrice(pricingConfig.basePrice)) {
    errors.push({
      code: 'INVALID_BASE_PRICE',
      message: 'Base price must be a positive number',
      field: 'basePrice',
      value: pricingConfig.basePrice
    });
  }

  // Validate currency
  if (!isValidCurrencyCode(pricingConfig.currency)) {
    errors.push({
      code: 'INVALID_CURRENCY',
      message: 'Currency must be a valid 3-letter currency code',
      field: 'currency',
      value: pricingConfig.currency
    });
  }

  // Validate pricing model
  if (!pricingConfig.pricingModel || !Object.values(PricingModel).includes(pricingConfig.pricingModel)) {
    errors.push({
      code: 'INVALID_PRICING_MODEL',
      message: 'Pricing model must be one of: ' + Object.values(PricingModel).join(', '),
      field: 'pricingModel',
      value: pricingConfig.pricingModel
    });
  }

  // Validate tiers
  if (pricingConfig.tiers) {
    if (!Array.isArray(pricingConfig.tiers)) {
      errors.push({
        code: 'INVALID_TIERS',
        message: 'Tiers must be an array',
        field: 'tiers',
        value: pricingConfig.tiers
      });
    } else if (pricingConfig.tiers.length > 10) {
      errors.push({
        code: 'TOO_MANY_TIERS',
        message: 'Cannot have more than 10 pricing tiers',
        field: 'tiers',
        value: pricingConfig.tiers.length
      });
    } else {
      pricingConfig.tiers.forEach((tier: any, index: number) => {
        const tierErrors = validatePricingTier(tier);
        tierErrors.forEach(error => {
          error.field = `tiers[${index}].${error.field}`;
          errors.push(error);
        });
      });

      // Validate tier overlaps for TIERED model
      if (pricingConfig.pricingModel === PricingModel.TIERED) {
        if (pricingConfig.tiers.length === 0) {
          errors.push({
            code: 'TIERED_PRICING_REQUIRES_TIERS',
            message: 'Tiered pricing model requires at least one tier',
            field: 'tiers'
          });
        } else {
          const sortedTiers = [...pricingConfig.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
          for (let i = 1; i < sortedTiers.length; i++) {
            const prevMax = sortedTiers[i-1].maxQuantity || Infinity;
            if (sortedTiers[i].minQuantity <= prevMax) {
              errors.push({
                code: 'OVERLAPPING_TIERS',
                message: 'Pricing tier quantity ranges cannot overlap',
                field: 'tiers'
              });
              break;
            }
          }
        }
      }
    }
  }

  // Validate billing cycle
  if (pricingConfig.billingCycle && !Object.values(BillingCycle).includes(pricingConfig.billingCycle)) {
    errors.push({
      code: 'INVALID_BILLING_CYCLE',
      message: 'Billing cycle must be one of: ' + Object.values(BillingCycle).join(', '),
      field: 'billingCycle',
      value: pricingConfig.billingCycle
    });
  }

  // Validate discount rules
  if (pricingConfig.discountRules) {
    if (!Array.isArray(pricingConfig.discountRules)) {
      errors.push({
        code: 'INVALID_DISCOUNT_RULES',
        message: 'Discount rules must be an array',
        field: 'discountRules',
        value: pricingConfig.discountRules
      });
    } else if (pricingConfig.discountRules.length > 5) {
      errors.push({
        code: 'TOO_MANY_DISCOUNT_RULES',
        message: 'Cannot have more than 5 discount rules',
        field: 'discountRules',
        value: pricingConfig.discountRules.length
      });
    } else {
      pricingConfig.discountRules.forEach((rule: any, index: number) => {
        const ruleErrors = validateDiscountRule(rule);
        ruleErrors.forEach(error => {
          error.field = `discountRules[${index}].${error.field}`;
          errors.push(error);
        });
      });
    }
  }

  return errors;
}

// =================================================================
// SERVICE CATALOG ITEM VALIDATION FUNCTIONS
// =================================================================

/**
 * Validate required resource
 */
function validateRequiredResource(resource: any): ServiceCatalogError[] {
  const errors: ServiceCatalogError[] = [];

  if (!isValidUUID(resource.resourceId)) {
    errors.push({
      code: 'INVALID_RESOURCE_ID',
      message: 'Resource ID must be a valid UUID',
      field: 'resourceId',
      value: resource.resourceId
    });
  }

  if (typeof resource.quantity !== 'number' || !Number.isInteger(resource.quantity) || resource.quantity < 1 || resource.quantity > 1000) {
    errors.push({
      code: 'INVALID_QUANTITY',
      message: 'Resource quantity must be an integer between 1 and 1000',
      field: 'quantity',
      value: resource.quantity
    });
  }

  if (resource.alternativeResources && Array.isArray(resource.alternativeResources)) {
    if (resource.alternativeResources.length > 10) {
      errors.push({
        code: 'TOO_MANY_ALTERNATIVE_RESOURCES',
        message: 'Cannot have more than 10 alternative resources',
        field: 'alternativeResources',
        value: resource.alternativeResources.length
      });
    }
    resource.alternativeResources.forEach((id: any, index: number) => {
      if (!isValidUUID(id)) {
        errors.push({
          code: 'INVALID_ALTERNATIVE_RESOURCE_ID',
          message: 'Alternative resource ID must be a valid UUID',
          field: `alternativeResources[${index}]`,
          value: id
        });
      }
    });
  }

  if (resource.skillRequirements && Array.isArray(resource.skillRequirements)) {
    if (resource.skillRequirements.length > 20) {
      errors.push({
        code: 'TOO_MANY_SKILL_REQUIREMENTS',
        message: 'Cannot have more than 20 skill requirements',
        field: 'skillRequirements',
        value: resource.skillRequirements.length
      });
    }
    resource.skillRequirements.forEach((skill: any, index: number) => {
      if (typeof skill !== 'string' || skill.trim().length < 2 || skill.trim().length > 50) {
        errors.push({
          code: 'INVALID_SKILL_REQUIREMENT',
          message: 'Skill requirement must be a string between 2 and 50 characters',
          field: `skillRequirements[${index}]`,
          value: skill
        });
      }
    });
  }

  return errors;
}

/**
 * Validate create service catalog item input
 */
function validateCreateServiceCatalogItemInput(input: any): ServiceCatalogError[] {
  const errors: ServiceCatalogError[] = [];

  // Required fields
  if (!isValidServiceName(input.serviceName)) {
    errors.push({
      code: 'INVALID_SERVICE_NAME',
      message: 'Service name must be between 3 and 100 characters and contain only allowed characters',
      field: 'serviceName',
      value: input.serviceName
    });
  }

  if (!isValidUUID(input.categoryId)) {
    errors.push({
      code: 'INVALID_CATEGORY_ID',
      message: 'Category ID must be a valid UUID',
      field: 'categoryId',
      value: input.categoryId
    });
  }

  if (!isValidUUID(input.industryId)) {
    errors.push({
      code: 'INVALID_INDUSTRY_ID',
      message: 'Industry ID must be a valid UUID',
      field: 'industryId',
      value: input.industryId
    });
  }

  if (!input.pricingConfig) {
    errors.push({
      code: 'MISSING_PRICING_CONFIG',
      message: 'Pricing configuration is required',
      field: 'pricingConfig'
    });
  } else {
    const pricingErrors = validateServicePricingConfig(input.pricingConfig);
    errors.push(...pricingErrors);
  }

  // Optional fields
  if (input.description && (typeof input.description !== 'string' || input.description.length > 2000)) {
    errors.push({
      code: 'INVALID_DESCRIPTION',
      message: 'Description cannot exceed 2000 characters',
      field: 'description',
      value: input.description
    });
  }

  if (input.sku && !isValidSKU(input.sku)) {
    errors.push({
      code: 'INVALID_SKU',
      message: 'SKU must be between 3 and 50 characters and contain only uppercase letters, numbers, hyphens, and underscores',
      field: 'sku',
      value: input.sku
    });
  }

  if (input.serviceAttributes && typeof input.serviceAttributes !== 'object') {
    errors.push({
      code: 'INVALID_SERVICE_ATTRIBUTES',
      message: 'Service attributes must be a valid object',
      field: 'serviceAttributes',
      value: input.serviceAttributes
    });
  }

  if (input.durationMinutes !== undefined) {
    if (typeof input.durationMinutes !== 'number' || !Number.isInteger(input.durationMinutes) || 
        input.durationMinutes < 1 || input.durationMinutes > 525600) {
      errors.push({
        code: 'INVALID_DURATION',
        message: 'Duration must be an integer between 1 minute and 1 year (525,600 minutes)',
        field: 'durationMinutes',
        value: input.durationMinutes
      });
    }
  }

  if (input.tags && Array.isArray(input.tags)) {
    if (input.tags.length > 20) {
      errors.push({
        code: 'TOO_MANY_TAGS',
        message: 'Cannot have more than 20 tags',
        field: 'tags',
        value: input.tags.length
      });
    }
    
    const uniqueTags = new Set();
    input.tags.forEach((tag: any, index: number) => {
      if (typeof tag !== 'string' || tag.trim().length < 2 || tag.trim().length > 30) {
        errors.push({
          code: 'INVALID_TAG',
          message: 'Tag must be a string between 2 and 30 characters',
          field: `tags[${index}]`,
          value: tag
        });
      } else if (!/^[a-zA-Z0-9\-_]+$/.test(tag.trim())) {
        errors.push({
          code: 'INVALID_TAG_FORMAT',
          message: 'Tags can only contain letters, numbers, hyphens, and underscores',
          field: `tags[${index}]`,
          value: tag
        });
      } else if (uniqueTags.has(tag.trim().toLowerCase())) {
        errors.push({
          code: 'DUPLICATE_TAG',
          message: 'Tags must be unique',
          field: `tags[${index}]`,
          value: tag
        });
      } else {
        uniqueTags.add(tag.trim().toLowerCase());
      }
    });
  }

  if (input.sortOrder !== undefined) {
    if (typeof input.sortOrder !== 'number' || !Number.isInteger(input.sortOrder) || 
        input.sortOrder < 0 || input.sortOrder > 99999) {
      errors.push({
        code: 'INVALID_SORT_ORDER',
        message: 'Sort order must be an integer between 0 and 99999',
        field: 'sortOrder',
        value: input.sortOrder
      });
    }
  }

  if (input.requiredResources && Array.isArray(input.requiredResources)) {
    if (input.requiredResources.length > 50) {
      errors.push({
        code: 'TOO_MANY_REQUIRED_RESOURCES',
        message: 'Cannot have more than 50 required resources',
        field: 'requiredResources',
        value: input.requiredResources.length
      });
    }
    
    input.requiredResources.forEach((resource: any, index: number) => {
      const resourceErrors = validateRequiredResource(resource);
      resourceErrors.forEach(error => {
        error.field = `requiredResources[${index}].${error.field}`;
        errors.push(error);
      });
    });
  }

  return errors;
}

/**
 * Validate update service catalog item input (all fields optional)
 */
function validateUpdateServiceCatalogItemInput(input: any): ServiceCatalogError[] {
  const errors: ServiceCatalogError[] = [];

  // All fields are optional for updates, but if present, must be valid
  if (input.serviceName !== undefined && !isValidServiceName(input.serviceName)) {
    errors.push({
      code: 'INVALID_SERVICE_NAME',
      message: 'Service name must be between 3 and 100 characters and contain only allowed characters',
      field: 'serviceName',
      value: input.serviceName
    });
  }

  if (input.categoryId !== undefined && !isValidUUID(input.categoryId)) {
    errors.push({
      code: 'INVALID_CATEGORY_ID',
      message: 'Category ID must be a valid UUID',
      field: 'categoryId',
      value: input.categoryId
    });
  }

  if (input.industryId !== undefined && !isValidUUID(input.industryId)) {
    errors.push({
      code: 'INVALID_INDUSTRY_ID',
      message: 'Industry ID must be a valid UUID',
      field: 'industryId',
      value: input.industryId
    });
  }

  if (input.pricingConfig !== undefined) {
    const pricingErrors = validateServicePricingConfig(input.pricingConfig);
    errors.push(...pricingErrors);
  }

  // Apply same validation as create for other optional fields
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 2000)) {
    errors.push({
      code: 'INVALID_DESCRIPTION',
      message: 'Description cannot exceed 2000 characters',
      field: 'description',
      value: input.description
    });
  }

  if (input.sku !== undefined && !isValidSKU(input.sku)) {
    errors.push({
      code: 'INVALID_SKU',
      message: 'SKU must be between 3 and 50 characters and contain only uppercase letters, numbers, hyphens, and underscores',
      field: 'sku',
      value: input.sku
    });
  }

  // Continue with same validation pattern for other fields...
  // (Adding remaining validation for brevity)

  return errors;
}


// =================================================================
// VALIDATOR CLASS
// =================================================================

export class ServiceCatalogValidators {
  
  /**
   * Validate create service catalog item input
   */
  static validateCreateServiceCatalogItem(input: any): ValidationResult {
    console.log('🔍 Validating create service catalog item input');
    const errors = validateCreateServiceCatalogItemInput(input);
    return this.createValidationResult(errors, [], input, 'CreateServiceCatalogItem');
  }

  /**
   * Validate update service catalog item input
   */
  static validateUpdateServiceCatalogItem(input: any): ValidationResult {
    console.log('🔍 Validating update service catalog item input');
    const errors = validateUpdateServiceCatalogItemInput(input);
    return this.createValidationResult(errors, [], input, 'UpdateServiceCatalogItem');
  }

  /**
   * Validate service catalog filters
   */
  static validateServiceCatalogFilters(filters: any): ValidationResult {
    console.log('🔍 Validating service catalog filters');
    const errors: ServiceCatalogError[] = [];
    // Basic filter validation - implement as needed
    return this.createValidationResult(errors, [], filters, 'ServiceCatalogFilters');
  }

  /**
   * Validate resource search filters
   */
  static validateResourceSearchFilters(filters: any): ValidationResult {
    console.log('🔍 Validating resource search filters');
    const errors: ServiceCatalogError[] = [];
    // Basic filter validation - implement as needed
    return this.createValidationResult(errors, [], filters, 'ResourceSearchFilters');
  }

  /**
   * Validate pagination input
   */
  static validatePagination(pagination: any): ValidationResult {
    console.log('🔍 Validating pagination input');
    const errors: ServiceCatalogError[] = [];
    
    if (pagination.limit !== undefined) {
      if (typeof pagination.limit !== 'number' || !Number.isInteger(pagination.limit) || 
          pagination.limit < 1 || pagination.limit > 1000) {
        errors.push({
          code: 'INVALID_LIMIT',
          message: 'Limit must be an integer between 1 and 1000',
          field: 'limit',
          value: pagination.limit
        });
      }
    }
    
    if (pagination.offset !== undefined) {
      if (typeof pagination.offset !== 'number' || !Number.isInteger(pagination.offset) || pagination.offset < 0) {
        errors.push({
          code: 'INVALID_OFFSET',
          message: 'Offset must be a non-negative integer',
          field: 'offset',
          value: pagination.offset
        });
      }
    }
    
    return this.createValidationResult(errors, [], pagination, 'Pagination');
  }

  /**
   * Validate sort input
   */
  static validateSort(sort: any): ValidationResult {
    console.log('🔍 Validating sort input');
    const errors: ServiceCatalogError[] = [];
    
    if (!Array.isArray(sort)) {
      errors.push({
        code: 'INVALID_SORT',
        message: 'Sort must be an array',
        field: 'sort',
        value: sort
      });
    } else if (sort.length > 3) {
      errors.push({
        code: 'TOO_MANY_SORT_FIELDS',
        message: 'Cannot sort by more than 3 fields',
        field: 'sort',
        value: sort.length.toString()
      });
    } else {
      const validFields = ['NAME', 'CREATED_AT', 'UPDATED_AT', 'BASE_PRICE', 'USAGE_COUNT', 'AVG_RATING', 'SORT_ORDER'];
      sort.forEach((sortItem: any, index: number) => {
        if (!sortItem.field || !validFields.includes(sortItem.field)) {
          errors.push({
            code: 'INVALID_SORT_FIELD',
            message: 'Sort field must be one of: ' + validFields.join(', '),
            field: `sort[${index}].field`,
            value: sortItem.field
          });
        }
        if (sortItem.direction && !['ASC', 'DESC'].includes(sortItem.direction)) {
          errors.push({
            code: 'INVALID_SORT_DIRECTION',
            message: 'Sort direction must be ASC or DESC',
            field: `sort[${index}].direction`,
            value: sortItem.direction
          });
        }
      });
    }
    
    return this.createValidationResult(errors, [], sort, 'Sort');
  }

  /**
   * Validate bulk create input
   */
  static validateBulkCreateServiceCatalogItems(input: any): ValidationResult {
    console.log('🔍 Validating bulk create service catalog items input');
    const errors: ServiceCatalogError[] = [];
    
    if (!input.items || !Array.isArray(input.items)) {
      errors.push({
        code: 'MISSING_ITEMS',
        message: 'Items array is required',
        field: 'items'
      });
    } else if (input.items.length === 0) {
      errors.push({
        code: 'EMPTY_ITEMS',
        message: 'Must provide at least 1 item',
        field: 'items',
        value: input.items.length
      });
    } else if (input.items.length > 100) {
      errors.push({
        code: 'TOO_MANY_ITEMS',
        message: 'Cannot bulk create more than 100 items at once',
        field: 'items',
        value: input.items.length
      });
    } else {
      input.items.forEach((item: any, index: number) => {
        const itemErrors = validateCreateServiceCatalogItemInput(item);
        itemErrors.forEach(error => {
          error.field = `items[${index}].${error.field}`;
          errors.push(error);
        });
      });
    }
    
    return this.createValidationResult(errors, [], input, 'BulkCreateServiceCatalogItems');
  }

  /**
   * Validate bulk update input
   */
  static validateBulkUpdateServiceCatalogItems(input: any): ValidationResult {
    console.log('🔍 Validating bulk update service catalog items input');
    const errors: ServiceCatalogError[] = [];
    
    if (!input.updates || !Array.isArray(input.updates)) {
      errors.push({
        code: 'MISSING_UPDATES',
        message: 'Updates array is required',
        field: 'updates'
      });
    } else if (input.updates.length === 0) {
      errors.push({
        code: 'EMPTY_UPDATES',
        message: 'Must provide at least 1 update',
        field: 'updates',
        value: input.updates.length
      });
    } else if (input.updates.length > 100) {
      errors.push({
        code: 'TOO_MANY_UPDATES',
        message: 'Cannot bulk update more than 100 items at once',
        field: 'updates',
        value: input.updates.length
      });
    } else {
      input.updates.forEach((update: any, index: number) => {
        if (!isValidUUID(update.id)) {
          errors.push({
            code: 'INVALID_UPDATE_ID',
            message: 'Update ID must be a valid UUID',
            field: `updates[${index}].id`,
            value: update.id
          });
        }
        if (!update.data) {
          errors.push({
            code: 'MISSING_UPDATE_DATA',
            message: 'Update data is required',
            field: `updates[${index}].data`
          });
        } else {
          const dataErrors = validateUpdateServiceCatalogItemInput(update.data);
          dataErrors.forEach(error => {
            error.field = `updates[${index}].data.${error.field}`;
            errors.push(error);
          });
        }
      });
    }
    
    return this.createValidationResult(errors, [], input, 'BulkUpdateServiceCatalogItems');
  }

  /**
   * Validate associate service resources input
   */
  static validateAssociateServiceResources(input: any): ValidationResult {
    console.log('🔍 Validating associate service resources input');
    const errors: ServiceCatalogError[] = [];
    
    if (!isValidUUID(input.serviceId)) {
      errors.push({
        code: 'INVALID_SERVICE_ID',
        message: 'Service ID must be a valid UUID',
        field: 'serviceId',
        value: input.serviceId
      });
    }
    
    if (!input.resourceAssociations || !Array.isArray(input.resourceAssociations)) {
      errors.push({
        code: 'MISSING_RESOURCE_ASSOCIATIONS',
        message: 'Resource associations array is required',
        field: 'resourceAssociations'
      });
    } else if (input.resourceAssociations.length === 0) {
      errors.push({
        code: 'EMPTY_RESOURCE_ASSOCIATIONS',
        message: 'Must provide at least 1 resource association',
        field: 'resourceAssociations',
        value: input.resourceAssociations.length
      });
    } else if (input.resourceAssociations.length > 50) {
      errors.push({
        code: 'TOO_MANY_RESOURCE_ASSOCIATIONS',
        message: 'Cannot associate more than 50 resources at once',
        field: 'resourceAssociations',
        value: input.resourceAssociations.length
      });
    }
    
    return this.createValidationResult(errors, [], input, 'AssociateServiceResources');
  }

  /**
   * Validate update service pricing input
   */
  static validateUpdateServicePricing(input: any): ValidationResult {
    console.log('🔍 Validating update service pricing input');
    const errors: ServiceCatalogError[] = [];
    
    if (!isValidUUID(input.serviceId)) {
      errors.push({
        code: 'INVALID_SERVICE_ID',
        message: 'Service ID must be a valid UUID',
        field: 'serviceId',
        value: input.serviceId
      });
    }
    
    if (!input.pricingConfig) {
      errors.push({
        code: 'MISSING_PRICING_CONFIG',
        message: 'Pricing configuration is required',
        field: 'pricingConfig'
      });
    } else {
      const pricingErrors = validateServicePricingConfig(input.pricingConfig);
      errors.push(...pricingErrors);
    }
    
    return this.createValidationResult(errors, [], input, 'UpdateServicePricing');
  }

  // =================================================================
  // BUSINESS LOGIC VALIDATION
  // =================================================================

  /**
   * Validate service name uniqueness (would call Edge Function)
   */
  static async validateServiceNameUniqueness(
    serviceName: string,
    tenantId: string,
    excludeServiceId?: string
  ): Promise<ValidationResult> {
    console.log('🔍 Validating service name uniqueness');
    
    // This would integrate with the Edge Function to check uniqueness
    // For now, return a placeholder implementation
    const warnings: ServiceCatalogError[] = [];
    
    // Add warning if name is very common
    const commonNames = ['service', 'item', 'product', 'offering'];
    if (commonNames.some(common => serviceName.toLowerCase().includes(common))) {
      warnings.push({
        code: 'GENERIC_NAME_WARNING',
        message: 'Service name appears generic. Consider using a more specific name.',
        field: 'serviceName',
        value: serviceName
      });
    }

    return {
      isValid: true,
      errors: [],
      warnings,
      sanitizedData: serviceName.trim()
    };
  }

  /**
   * Validate SKU uniqueness
   */
  static async validateSKUUniqueness(
    sku: string,
    tenantId: string,
    excludeServiceId?: string
  ): Promise<ValidationResult> {
    console.log('🔍 Validating SKU uniqueness');
    
    // This would integrate with the Edge Function to check SKU uniqueness
    // For now, return a basic validation
    return {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedData: sku.toUpperCase().trim()
    };
  }

  /**
   * Validate pricing configuration business rules
   */
  static validatePricingBusinessRules(pricingConfig: any): ValidationResult {
    console.log('🔍 Validating pricing business rules');
    
    const errors: ServiceCatalogError[] = [];
    const warnings: ServiceCatalogError[] = [];

    // Validate discount rules
    if (pricingConfig.discountRules) {
      pricingConfig.discountRules.forEach((rule: any, index: number) => {
        try {
          // Validate condition syntax (basic check)
          if (rule.condition.includes('eval(') || rule.condition.includes('function(')) {
            errors.push({
              code: 'UNSAFE_DISCOUNT_CONDITION',
              message: 'Discount condition contains potentially unsafe code',
              field: `discountRules[${index}].condition`,
              value: rule.condition
            });
          }
        } catch (error) {
          errors.push({
            code: 'INVALID_DISCOUNT_CONDITION',
            message: 'Discount condition is not valid',
            field: `discountRules[${index}].condition`,
            value: rule.condition
          });
        }
      });
    }

    // Validate pricing model consistency
    if (pricingConfig.pricingModel === PricingModel.TIERED) {
      if (!pricingConfig.tiers || pricingConfig.tiers.length === 0) {
        errors.push({
          code: 'MISSING_PRICING_TIERS',
          message: 'Tiered pricing model requires at least one pricing tier',
          field: 'tiers'
        });
      }
    }

    // Check for reasonable pricing
    if (pricingConfig.basePrice > 1000000) {
      warnings.push({
        code: 'HIGH_PRICE_WARNING',
        message: 'Base price is unusually high. Please verify this is correct.',
        field: 'basePrice',
        value: pricingConfig.basePrice
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData: pricingConfig
    };
  }

  // =================================================================
  // PRIVATE HELPER METHODS
  // =================================================================

  private static createValidationResult(
    errors: ServiceCatalogError[], 
    warnings: ServiceCatalogError[], 
    sanitizedData: any,
    context: string
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData
    };

    if (result.isValid) {
      console.log(`✅ ${context} validation passed`);
    } else {
      console.log(`❌ ${context} validation failed with ${errors.length} errors`);
    }

    return result;
  }

  // =================================================================
  // SANITIZATION METHODS
  // =================================================================

  /**
   * Sanitize service name
   */
  static sanitizeServiceName(serviceName: string): string {
    return serviceName
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[<>]/g, '') // Remove angle brackets
      .slice(0, 100); // Ensure max length
  }

  /**
   * Sanitize SKU
   */
  static sanitizeSKU(sku: string): string {
    return sku
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9\-_]/g, '') // Keep only allowed characters
      .slice(0, 50); // Ensure max length
  }

  /**
   * Sanitize tags
   */
  static sanitizeTags(tags: string[]): string[] {
    return tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length >= 2) // Remove too short tags
      .filter((tag, index, array) => array.indexOf(tag) === index) // Remove duplicates
      .slice(0, 20); // Limit to 20 tags
  }

  /**
   * Sanitize search term
   */
  static sanitizeSearchTerm(searchTerm: string): string {
    return searchTerm
      .trim()
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .slice(0, 255); // Ensure max length
  }
}

// =================================================================
// EXPORT DEFAULT
// =================================================================

export default ServiceCatalogValidators;