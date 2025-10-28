// src/validators/serviceCatalogValidator.ts
// Service Catalog Validator - Production grade validation
// UPDATED: Support for pricing_records array and optional category/industry

import {
  CreateServiceRequest,
  UpdateServiceRequest,
  ValidationResult,
  ValidationError,
  ServiceValidationRules,
  ServiceCatalogServiceConfig,
  Service,
  MasterData
} from '../types/serviceCatalogTypes';

/**
 * Helper function to unwrap edge function responses
 */
function unwrapEdgeResponse(response: any): any {
  console.log('VALIDATOR - Unwrapping response:', response);
  
  // Handle edge function format: { success: true, data: [...] }
  if (response?.success && response?.data !== undefined) {
    console.log('VALIDATOR - Extracted data:', response.data);
    return response.data;
  }
  
  // Handle direct values
  console.log('VALIDATOR - Using direct response:', response);
  return response;
}

/**
 * Service Catalog Validator - Validates service entries
 * Delegates all data access to the service layer
 */
export class ServiceCatalogValidator {
  private serviceLayer: any; // Will be injected
  private config: ServiceCatalogServiceConfig;

  constructor(serviceLayer: any, config: ServiceCatalogServiceConfig) {
    this.serviceLayer = serviceLayer;
    this.config = config;
  }

  /**
   * Validate create service request
   */
  async validateCreateRequest(data: CreateServiceRequest): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    try {
      // 1. Validate required fields
      this.validateRequiredFields(data, errors);

      // 2. Validate field formats and constraints
      this.validateFieldFormats(data, errors);

      // 3. Validate master data references (if provided and basic validation passes)
      if (errors.length === 0) {
        const masterDataValidation = await this.validateMasterDataReferences(data);
        if (!masterDataValidation.isValid) {
          errors.push(...masterDataValidation.errors);
        }
      }

      // 4. Check for duplicate names (if basic validation passes)
      if (errors.length === 0 && data.category_id) {
        const duplicateValidation = await this.validateUniqueServiceName(
          data.service_name,
          data.category_id
        );
        if (!duplicateValidation.isValid) {
          errors.push(...duplicateValidation.errors);
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };

    } catch (error: any) {
      console.error('Error in validateCreateRequest:', error);
      return {
        isValid: false,
        errors: [{
          field: 'system',
          message: 'Validation system error',
          code: 'VALIDATION_SYSTEM_ERROR'
        }]
      };
    }
  }

  /**
   * Validate update service request
   */
  async validateUpdateRequest(
    serviceId: string,
    data: UpdateServiceRequest
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    try {
      // 1. Get current service
      const currentService = await this.getCurrentService(serviceId);
      if (!currentService) {
        return {
          isValid: false,
          errors: [{
            field: 'serviceId',
            message: 'Service not found',
            code: 'SERVICE_NOT_FOUND'
          }]
        };
      }

      // 2. Validate fields being updated
      this.validateUpdateFields(data, errors);

      // 3. Check for duplicate names if name is changing
      if (data.service_name && data.service_name !== currentService.service_name) {
        const categoryId = currentService.category_id;
        if (categoryId) {
          const duplicateValidation = await this.validateUniqueServiceName(
            data.service_name,
            categoryId,
            serviceId
          );
          if (!duplicateValidation.isValid) {
            errors.push(...duplicateValidation.errors);
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };

    } catch (error: any) {
      console.error('Error in validateUpdateRequest:', error);
      return {
        isValid: false,
        errors: [{
          field: 'system',
          message: 'Validation system error',
          code: 'VALIDATION_SYSTEM_ERROR'
        }]
      };
    }
  }

  /**
   * Validate that a service can be deleted
   */
  async validateDeleteRequest(serviceId: string): Promise<ValidationResult> {
    try {
      const currentService = await this.getCurrentService(serviceId);
      
      if (!currentService) {
        return {
          isValid: false,
          errors: [{
            field: 'serviceId',
            message: 'Service not found',
            code: 'SERVICE_NOT_FOUND'
          }]
        };
      }

      if (!currentService.is_active) {
        return {
          isValid: false,
          errors: [{
            field: 'is_active',
            message: 'Service is already inactive',
            code: 'ALREADY_INACTIVE'
          }]
        };
      }

      return {
        isValid: true,
        errors: []
      };

    } catch (error: any) {
      console.error('Error in validateDeleteRequest:', error);
      return {
        isValid: false,
        errors: [{
          field: 'system',
          message: 'Validation system error',
          code: 'VALIDATION_SYSTEM_ERROR'
        }]
      };
    }
  }

  // ============================================================================
  // PRIVATE VALIDATION METHODS
  // ============================================================================

  /**
   * Validate required fields for create request
   * ✅ UPDATED: category_id and industry_id are now OPTIONAL
   * ✅ UPDATED: Accept either pricing_config OR pricing_records
   */
  private validateRequiredFields(data: CreateServiceRequest, errors: ValidationError[]): void {
    // Service name is always required
    if (!data.service_name || data.service_name.trim().length === 0) {
      errors.push({
        field: 'service_name',
        message: 'Service name is required',
        code: 'REQUIRED_FIELD'
      });
    }

    // ✅ CHANGED: category_id is now optional (will be validated for format if provided)
    // ✅ CHANGED: industry_id is now optional (will be validated for format if provided)

    // ✅ CHANGED: Accept either pricing_config OR pricing_records
    const hasPricingConfig = data.pricing_config && typeof data.pricing_config === 'object';
    const hasPricingRecords = Array.isArray(data.pricing_records) && data.pricing_records.length > 0;

    if (!hasPricingConfig && !hasPricingRecords) {
      errors.push({
        field: 'pricing',
        message: 'Pricing information is required (either pricing_config or pricing_records)',
        code: 'REQUIRED_FIELD'
      });
      return; // Don't validate further if no pricing provided
    }

    // ✅ NEW: Validate pricing_records array format
    if (hasPricingRecords) {
      const firstPricing = data.pricing_records![0];
      
      if (firstPricing.amount === undefined || firstPricing.amount === null) {
        errors.push({
          field: 'pricing_records[0].amount',
          message: 'Pricing amount is required',
          code: 'REQUIRED_FIELD'
        });
      }

      if (!firstPricing.currency || firstPricing.currency.trim().length === 0) {
        errors.push({
          field: 'pricing_records[0].currency',
          message: 'Currency is required',
          code: 'REQUIRED_FIELD'
        });
      }

      if (!firstPricing.price_type || firstPricing.price_type.trim().length === 0) {
        errors.push({
          field: 'pricing_records[0].price_type',
          message: 'Price type is required',
          code: 'REQUIRED_FIELD'
        });
      }
    }

    // Legacy pricing_config validation (kept for backward compatibility)
    if (hasPricingConfig && !hasPricingRecords) {
      if (data.pricing_config!.base_price === undefined || data.pricing_config!.base_price === null) {
        errors.push({
          field: 'pricing_config.base_price',
          message: 'Base price is required',
          code: 'REQUIRED_FIELD'
        });
      }

      if (!data.pricing_config!.currency || data.pricing_config!.currency.trim().length === 0) {
        errors.push({
          field: 'pricing_config.currency',
          message: 'Currency is required',
          code: 'REQUIRED_FIELD'
        });
      }

      if (!data.pricing_config!.pricing_model || data.pricing_config!.pricing_model.trim().length === 0) {
        errors.push({
          field: 'pricing_config.pricing_model',
          message: 'Pricing model is required',
          code: 'REQUIRED_FIELD'
        });
      }
    }
  }

  /**
 * Validate field formats and constraints
 */
private validateFieldFormats(data: CreateServiceRequest | UpdateServiceRequest, errors: ValidationError[]): void {
  // Validate service_name
  if (data.service_name !== undefined) {
    const rules = ServiceValidationRules.service_name;
    
    if (data.service_name && data.service_name.length > rules.maxLength) {
      errors.push({
        field: 'service_name',
        message: `Service name must be ${rules.maxLength} characters or less`,
        code: 'FIELD_TOO_LONG'
      });
    }

    if (data.service_name && data.service_name.length < rules.minLength) {
      errors.push({
        field: 'service_name',
        message: `Service name must be at least ${rules.minLength} characters`,
        code: 'FIELD_TOO_SHORT'
      });
    }

    if (data.service_name && !rules.pattern.test(data.service_name)) {
      errors.push({
        field: 'service_name',
        message: 'Service name contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.',
        code: 'INVALID_FORMAT'
      });
    }
  }

  // Validate description
  if (data.description !== undefined && data.description) {
    if (data.description.length > ServiceValidationRules.description.maxLength) {
      errors.push({
        field: 'description',
        message: `Description must be ${ServiceValidationRules.description.maxLength} characters or less`,
        code: 'FIELD_TOO_LONG'
      });
    }
  }

  // Validate SKU
  if (data.sku !== undefined && data.sku) {
    const rules = ServiceValidationRules.sku;
    
    if (data.sku.length > rules.maxLength) {
      errors.push({
        field: 'sku',
        message: `SKU must be ${rules.maxLength} characters or less`,
        code: 'FIELD_TOO_LONG'
      });
    }

    if (!rules.pattern.test(data.sku)) {
      errors.push({
        field: 'sku',
        message: 'SKU can only contain letters, numbers, hyphens, and underscores',
        code: 'INVALID_FORMAT'
      });
    }
  }

  // Cast once at the beginning to avoid duplicate declarations
  const typedData = data as any;
  
  // Validate pricing_records OR pricing_config
  if (typedData.pricing_records !== undefined) {
    this.validatePricingRecords(typedData.pricing_records, errors);
  }
  
  if (typedData.pricing_config !== undefined) {
    this.validatePricingConfig(typedData.pricing_config, errors);
  }

  // Validate duration_minutes
  if (data.duration_minutes !== undefined && data.duration_minutes !== null) {
    const rules = ServiceValidationRules.duration_minutes;
    
    if (!Number.isInteger(data.duration_minutes) || 
        data.duration_minutes < rules.min || 
        data.duration_minutes > rules.max) {
      errors.push({
        field: 'duration_minutes',
        message: `Duration must be an integer between ${rules.min} and ${rules.max} minutes`,
        code: 'INVALID_RANGE'
      });
    }
  }

  // Validate sort_order
  if (data.sort_order !== undefined && data.sort_order !== null) {
    const rules = ServiceValidationRules.sort_order;
    
    if (!Number.isInteger(data.sort_order) || 
        data.sort_order < rules.min || 
        data.sort_order > rules.max) {
      errors.push({
        field: 'sort_order',
        message: `Sort order must be an integer between ${rules.min} and ${rules.max}`,
        code: 'INVALID_RANGE'
      });
    }
  }

  // Validate resource_requirements array
  if (typedData.resource_requirements !== undefined) {
    this.validateResourceRequirements(typedData.resource_requirements, errors);
  }

  // Validate tags
  if (data.tags !== undefined) {
    this.validateTags(data.tags, errors);
  }
  
  // Additional field validations
  if (typedData.status !== undefined) {
    this.validateStatus(typedData.status, errors);
  }
  
  if (typedData.service_type !== undefined) {
    this.validateServiceType(typedData.service_type, errors);
  }
  
  if (typedData.is_variant !== undefined) {
    this.validateIsVariant(typedData.is_variant, errors);
  }
  
  if (typedData.parent_id !== undefined) {
    this.validateParentId(typedData.parent_id, errors);
  }
  
  // Validate relationships
  this.validateVariantRelationship(data, errors);
}

  /**
   * ✅ NEW: Validate pricing_records array
   */
  private validatePricingRecords(pricingRecords: any[], errors: ValidationError[]): void {
    if (!Array.isArray(pricingRecords)) {
      errors.push({
        field: 'pricing_records',
        message: 'Pricing records must be an array',
        code: 'INVALID_FORMAT'
      });
      return;
    }

    if (pricingRecords.length === 0) {
      errors.push({
        field: 'pricing_records',
        message: 'At least one pricing record is required',
        code: 'REQUIRED_FIELD'
      });
      return;
    }

    pricingRecords.forEach((pricing, index) => {
      // Validate amount
      if (pricing.amount !== undefined && pricing.amount !== null) {
        if (typeof pricing.amount !== 'number' || isNaN(pricing.amount)) {
          errors.push({
            field: `pricing_records[${index}].amount`,
            message: 'Amount must be a valid number',
            code: 'INVALID_NUMBER'
          });
        } else if (pricing.amount < 0) {
          errors.push({
            field: `pricing_records[${index}].amount`,
            message: 'Amount must be non-negative',
            code: 'PRICE_TOO_LOW'
          });
        } else if (pricing.amount > 999999999.99) {
          errors.push({
            field: `pricing_records[${index}].amount`,
            message: 'Amount exceeds maximum allowed value',
            code: 'PRICE_TOO_HIGH'
          });
        }
      }

      // Validate currency
      if (pricing.currency !== undefined) {
        if (typeof pricing.currency !== 'string' || pricing.currency.trim().length === 0) {
          errors.push({
            field: `pricing_records[${index}].currency`,
            message: 'Currency must be a non-empty string',
            code: 'INVALID_CURRENCY_FORMAT'
          });
        }
      }

      // Validate price_type
      if (pricing.price_type !== undefined) {
        if (typeof pricing.price_type !== 'string' || pricing.price_type.trim().length === 0) {
          errors.push({
            field: `pricing_records[${index}].price_type`,
            message: 'Price type must be a non-empty string',
            code: 'INVALID_PRICE_TYPE_FORMAT'
          });
        }
      }

      // Validate tax_inclusion
      if (pricing.tax_inclusion !== undefined) {
        const validValues = ['inclusive', 'exclusive'];
        if (!validValues.includes(pricing.tax_inclusion)) {
          errors.push({
            field: `pricing_records[${index}].tax_inclusion`,
            message: 'Tax inclusion must be either "inclusive" or "exclusive"',
            code: 'INVALID_TAX_INCLUSION'
          });
        }
      }
    });
  }

  /**
   * ✅ NEW: Validate resource_requirements array
   */
  private validateResourceRequirements(requirements: any[], errors: ValidationError[]): void {
    if (!Array.isArray(requirements)) {
      errors.push({
        field: 'resource_requirements',
        message: 'Resource requirements must be an array',
        code: 'INVALID_FORMAT'
      });
      return;
    }

    const rules = ServiceValidationRules.required_resources;
    
    if (requirements.length > rules.maxCount) {
      errors.push({
        field: 'resource_requirements',
        message: `Maximum ${rules.maxCount} resource requirements allowed`,
        code: 'TOO_MANY_RESOURCES'
      });
    }

    requirements.forEach((requirement, index) => {
      if (!requirement.resource_id) {
        errors.push({
          field: `resource_requirements[${index}].resource_id`,
          message: `Resource ${index + 1}: resource_id is required`,
          code: 'REQUIRED_FIELD'
        });
      }

      if (requirement.quantity !== undefined) {
        if (typeof requirement.quantity !== 'number' || requirement.quantity < 1) {
          errors.push({
            field: `resource_requirements[${index}].quantity`,
            message: `Resource ${index + 1}: quantity must be a positive number`,
            code: 'INVALID_RESOURCE_QUANTITY'
          });
        }
      }
    });
  }

  /**
   * Validate pricing configuration (legacy format)
   */
  private validatePricingConfig(pricingConfig: any, errors: ValidationError[]): void {
    if (!pricingConfig || typeof pricingConfig !== 'object') {
      errors.push({
        field: 'pricing_config',
        message: 'Pricing configuration must be a valid object',
        code: 'INVALID_FORMAT'
      });
      return;
    }

    const rules = ServiceValidationRules.pricing_config;

    // Validate base_price
    if (pricingConfig.base_price !== undefined && pricingConfig.base_price !== null) {
      if (typeof pricingConfig.base_price !== 'number' || isNaN(pricingConfig.base_price)) {
        errors.push({
          field: 'pricing_config.base_price',
          message: 'Base price must be a valid number',
          code: 'INVALID_NUMBER'
        });
      } else {
        if (pricingConfig.base_price < rules.base_price.min) {
          errors.push({
            field: 'pricing_config.base_price',
            message: 'Base price must be non-negative',
            code: 'PRICE_TOO_LOW'
          });
        }

        if (pricingConfig.base_price > rules.base_price.max) {
          errors.push({
            field: 'pricing_config.base_price',
            message: 'Base price exceeds maximum allowed value',
            code: 'PRICE_TOO_HIGH'
          });
        }

        const decimalPlaces = (pricingConfig.base_price.toString().split('.')[1] || '').length;
        if (decimalPlaces > rules.base_price.decimalPlaces) {
          errors.push({
            field: 'pricing_config.base_price',
            message: `Base price can have maximum ${rules.base_price.decimalPlaces} decimal places`,
            code: 'TOO_MANY_DECIMAL_PLACES'
          });
        }
      }
    }

    // Validate currency
    if (pricingConfig.currency !== undefined) {
      if (typeof pricingConfig.currency !== 'string' || pricingConfig.currency.trim().length === 0) {
        errors.push({
          field: 'pricing_config.currency',
          message: 'Currency must be a non-empty string',
          code: 'INVALID_CURRENCY_FORMAT'
        });
      }
    }

    // Validate pricing_model
    if (pricingConfig.pricing_model !== undefined) {
      if (typeof pricingConfig.pricing_model !== 'string' || pricingConfig.pricing_model.trim().length === 0) {
        errors.push({
          field: 'pricing_config.pricing_model',
          message: 'Pricing model must be a non-empty string',
          code: 'INVALID_PRICING_MODEL_FORMAT'
        });
      }
    }

    // Validate billing_cycle
    if (pricingConfig.billing_cycle !== undefined && pricingConfig.billing_cycle !== null) {
      if (typeof pricingConfig.billing_cycle !== 'string') {
        errors.push({
          field: 'pricing_config.billing_cycle',
          message: 'Billing cycle must be a string',
          code: 'INVALID_BILLING_CYCLE_FORMAT'
        });
      }
    }
  }

  /**
   * Validate required resources (legacy format)
   */
  private validateRequiredResources(resources: any[], errors: ValidationError[]): void {
    if (!Array.isArray(resources)) {
      errors.push({
        field: 'required_resources',
        message: 'Required resources must be an array',
        code: 'INVALID_RESOURCES_FORMAT'
      });
      return;
    }

    const rules = ServiceValidationRules.required_resources;
    
    if (resources.length > rules.maxCount) {
      errors.push({
        field: 'required_resources',
        message: `Maximum ${rules.maxCount} required resources allowed`,
        code: 'TOO_MANY_RESOURCES'
      });
    }

    resources.forEach((resource, index) => {
      if (!resource.resource_id) {
        errors.push({
          field: `required_resources[${index}].resource_id`,
          message: `Resource ${index + 1}: resource_id is required`,
          code: 'REQUIRED_FIELD'
        });
      }

      if (resource.quantity !== undefined) {
        if (typeof resource.quantity !== 'number' || resource.quantity < 1) {
          errors.push({
            field: `required_resources[${index}].quantity`,
            message: `Resource ${index + 1}: quantity must be a positive number`,
            code: 'INVALID_RESOURCE_QUANTITY'
          });
        }
      }
    });
  }

  /**
   * Validate tags
   */
  private validateTags(tags: any[], errors: ValidationError[]): void {
    if (!Array.isArray(tags)) {
      errors.push({
        field: 'tags',
        message: 'Tags must be an array',
        code: 'INVALID_TAGS_FORMAT'
      });
      return;
    }

    const rules = ServiceValidationRules.tags;
    
    if (tags.length > rules.maxCount) {
      errors.push({
        field: 'tags',
        message: `Maximum ${rules.maxCount} tags allowed`,
        code: 'TOO_MANY_TAGS'
      });
    }

    tags.forEach((tag, index) => {
      if (typeof tag !== 'string') {
        errors.push({
          field: `tags[${index}]`,
          message: `Tag ${index + 1}: must be a string`,
          code: 'INVALID_TAG_TYPE'
        });
      } else if (tag.length === 0) {
        errors.push({
          field: `tags[${index}]`,
          message: `Tag ${index + 1}: cannot be empty`,
          code: 'EMPTY_TAG'
        });
      } else if (tag.length > rules.maxTagLength) {
        errors.push({
          field: `tags[${index}]`,
          message: `Tag ${index + 1}: cannot exceed ${rules.maxTagLength} characters`,
          code: 'TAG_TOO_LONG'
        });
      }
    });
  }

  /**
   * Validate fields being updated
   */
  private validateUpdateFields(data: UpdateServiceRequest, errors: ValidationError[]): void {
    // Check that required fields are not being set to empty
    if (data.service_name !== undefined && (!data.service_name || data.service_name.trim().length === 0)) {
      errors.push({
        field: 'service_name',
        message: 'Service name cannot be empty',
        code: 'REQUIRED_FIELD'
      });
    }

    // Apply format validation
    this.validateFieldFormats(data, errors);
  }

  /**
   * ✅ UPDATED: Validate master data references (category, industry)
   * Now OPTIONAL - only validates if provided
   */
  private async validateMasterDataReferences(data: CreateServiceRequest): Promise<ValidationResult> {
    try {
      console.log('VALIDATOR - Getting master data for validation');
      
      const masterDataResponse = await this.serviceLayer.getMasterData();
      const masterData = unwrapEdgeResponse(masterDataResponse) as MasterData;
      
      const errors: ValidationError[] = [];

      if (!masterData) {
        // If we can't get master data, skip validation but warn
        console.warn('VALIDATOR - Unable to fetch master data for validation');
        return { isValid: true, errors: [] };
      }

      // ✅ CHANGED: Only validate category_id if provided
      if (data.category_id) {
        const categoryExists = masterData.categories?.some(cat => cat.id === data.category_id && cat.is_active);
        if (!categoryExists) {
          errors.push({
            field: 'category_id',
            message: 'Invalid or inactive category',
            code: 'INVALID_CATEGORY'
          });
        }
      }

      // ✅ CHANGED: Only validate industry_id if provided
      if (data.industry_id) {
        const industryExists = masterData.industries?.some(ind => ind.id === data.industry_id && ind.is_active);
        if (!industryExists) {
          errors.push({
            field: 'industry_id',
            message: 'Invalid or inactive industry',
            code: 'INVALID_INDUSTRY'
          });
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };

    } catch (error) {
      console.error('Error validating master data references:', error);
      // Don't fail validation if master data check fails
      return { isValid: true, errors: [] };
    }
  }

  /**
   * Check for duplicate service names within the same category
   */
  private async validateUniqueServiceName(
    name: string,
    categoryId: string,
    excludeServiceId?: string
  ): Promise<ValidationResult> {
    try {
      console.log('VALIDATOR - Checking name uniqueness:', name, categoryId, excludeServiceId);
      
      const duplicateResponse = await this.serviceLayer.checkServiceNameExists(
        name.trim(),
        categoryId,
        excludeServiceId
      );

      const isDuplicate = unwrapEdgeResponse(duplicateResponse);
      
      console.log('VALIDATOR - Name exists check result:', isDuplicate);

      if (isDuplicate === true) {
        return {
          isValid: false,
          errors: [{
            field: 'service_name',
            message: 'A service with this name already exists in this category',
            code: 'DUPLICATE_NAME'
          }]
        };
      }

      return {
        isValid: true,
        errors: []
      };

    } catch (error) {
      console.error('Error checking service name uniqueness:', error);
      // Don't fail validation if uniqueness check fails
      return { isValid: true, errors: [] };
    }
  }

  /**
   * Get current service from service layer
   */
  private async getCurrentService(serviceId: string): Promise<Service | null> {
    try {
      console.log('VALIDATOR - Getting current service:', serviceId);
      
      const serviceResponse = await this.serviceLayer.getServiceById(serviceId);
      const service = unwrapEdgeResponse(serviceResponse);
      
      console.log('VALIDATOR - Got current service:', !!service);
      
      return service || null;
    } catch (error) {
      console.error('Error getting current service:', error);
      return null;
    }
  }

  /**
   * Quick validation for basic field format (without DB calls)
   */
  validateFieldsOnly(data: CreateServiceRequest | UpdateServiceRequest): ValidationResult {
    const errors: ValidationError[] = [];

    // For create requests, validate required fields
    if ('pricing_config' in data || 'pricing_records' in data) {
      this.validateRequiredFields(data as CreateServiceRequest, errors);
    }

    // For update requests, validate update constraints
    if (!('pricing_config' in data) && !('pricing_records' in data)) {
      this.validateUpdateFields(data as UpdateServiceRequest, errors);
    } else {
      // Apply format validation
      this.validateFieldFormats(data, errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
// ADD THESE VALIDATIONS TO: src/validators/serviceCatalogValidator.ts
// Insert these methods in the "PRIVATE VALIDATION METHODS" section

/**
 * ✅ NEW: Validate status field (boolean)
 */
private validateStatus(status: any, errors: ValidationError[]): void {
  if (status !== undefined && status !== null) {
    if (typeof status !== 'boolean') {
      errors.push({
        field: 'status',
        message: 'Status must be a boolean (true or false)',
        code: 'INVALID_STATUS_TYPE'
      });
    }
  }
}

/**
 * ✅ NEW: Validate service_type field
 */
private validateServiceType(serviceType: any, errors: ValidationError[]): void {
  if (serviceType !== undefined && serviceType !== null) {
    const validTypes = ['independent', 'resource_based'];
    
    if (typeof serviceType !== 'string') {
      errors.push({
        field: 'service_type',
        message: 'Service type must be a string',
        code: 'INVALID_SERVICE_TYPE_FORMAT'
      });
    } else if (!validTypes.includes(serviceType)) {
      errors.push({
        field: 'service_type',
        message: 'Service type must be either "independent" or "resource_based"',
        code: 'INVALID_SERVICE_TYPE'
      });
    }
  }
}

/**
 * ✅ NEW: Validate is_variant field (boolean)
 */
private validateIsVariant(isVariant: any, errors: ValidationError[]): void {
  if (isVariant !== undefined && isVariant !== null) {
    if (typeof isVariant !== 'boolean') {
      errors.push({
        field: 'is_variant',
        message: 'is_variant must be a boolean (true or false)',
        code: 'INVALID_VARIANT_TYPE'
      });
    }
  }
}

/**
 * ✅ NEW: Validate parent_id field (UUID format)
 */
private validateParentId(parentId: any, errors: ValidationError[]): void {
  if (parentId !== undefined && parentId !== null) {
    if (typeof parentId !== 'string') {
      errors.push({
        field: 'parent_id',
        message: 'parent_id must be a string (UUID)',
        code: 'INVALID_PARENT_ID_TYPE'
      });
    } else {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(parentId)) {
        errors.push({
          field: 'parent_id',
          message: 'parent_id must be a valid UUID',
          code: 'INVALID_PARENT_ID_FORMAT'
        });
      }
    }
  }
}

/**
 * ✅ NEW: Validate variant and parent_id relationship
 * Rule: If is_variant = true, then parent_id is required
 */
private validateVariantRelationship(data: CreateServiceRequest | UpdateServiceRequest, errors: ValidationError[]): void {
  const typedData = data as any;
  
  if (typedData.is_variant === true) {
    if (!typedData.parent_id || typedData.parent_id.trim().length === 0) {
      errors.push({
        field: 'parent_id',
        message: 'parent_id is required when is_variant is true',
        code: 'PARENT_ID_REQUIRED_FOR_VARIANT'
      });
    }
  }
}


}