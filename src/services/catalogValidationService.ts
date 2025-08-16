// src/services/catalogValidationService.ts
// ✅ PRODUCTION: Express/GraphQL catalog validation service

import { createClient } from '@supabase/supabase-js';
import { 
  CreateCatalogItemRequest, 
  UpdateCatalogItemRequest,
  CreateMultiCurrencyPricingRequest,
  RestoreCatalogItemRequest,
  CurrencyPricingUpdate,
  CatalogItem,
  CatalogServiceConfig,
  ValidationError,
  validateCurrency,
  validatePrice,
  validateCatalogType,
  validatePriceType,
  SUPPORTED_CURRENCIES
} from '../types/catalog';

// =================================================================
// ESSENTIAL RESOURCE CONSTANTS
// =================================================================

export const RESOURCE_CONTACT_CLASSIFICATIONS = {
  TEAM_MEMBER: { display: 'Team Member', alias: 'team_member' },
  PARTNER: { display: 'Partner', alias: 'partner' },
  VENDOR: { display: 'Vendor', alias: 'vendor' },
  BUYER: { display: 'Buyer', alias: 'buyer' },
  SELLER: { display: 'Seller', alias: 'seller' }
} as const;

// Resource type to contact classification mapping
const RESOURCE_CONTACT_ELIGIBILITY: Record<string, string[]> = {
  'team_staff': ['team_member'],
  'partner': ['partner', 'vendor']
} as const;

export class CatalogValidationService {
  private supabase: any;
  private config: CatalogServiceConfig;

  constructor(config: CatalogServiceConfig) {
    this.config = config;
    
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration in Express validation service');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // =================================================================
  // ENHANCED CATALOG ITEM VALIDATION
  // =================================================================

  async validateCreateRequest(data: CreateCatalogItemRequest): Promise<{
    is_valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings?: Array<{ field: string; message: string }>;
  }> {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // Validate catalog type
    const catalogTypeValidation = validateCatalogType(data.type);
    if (!catalogTypeValidation.isValid) {
      errors.push({ field: 'type', message: catalogTypeValidation.error! });
    }

    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Name is required' });
    } else if (data.name.length > 255) {
      errors.push({ field: 'name', message: 'Name must be 255 characters or less' });
    }

    // Validate description
    if (!data.description_content || data.description_content.trim().length === 0) {
      errors.push({ field: 'description_content', message: 'Description is required' });
    } else if (data.description_content.length > 10000) {
      errors.push({ field: 'description_content', message: 'Description must be 10000 characters or less' });
    }

    // Validate service terms (optional)
    if (data.terms_content && data.terms_content.length > 20000) {
      errors.push({ field: 'terms_content', message: 'Service terms must be 20000 characters or less' });
    }

    // ✅ ESSENTIAL: Validate team_staff resources have valid contacts
    if (data.resources && data.resources.length > 0) {
      for (let i = 0; i < data.resources.length; i++) {
        const resource = data.resources[i];
        if (resource.resource_type_id === 'team_staff' || resource.resource_type_id === 'partner') {
          if (!resource.contact_id) {
            errors.push({ 
              field: `resources[${i}].contact_id`, 
              message: `Contact is required for ${resource.resource_type_id} resources` 
            });
          } else {
            const contactValid = await this.validateContactForResource(resource.contact_id, resource.resource_type_id);
            if (!contactValid.is_valid) {
              errors.push({ 
                field: `resources[${i}].contact_id`, 
                message: contactValid.error || 'Invalid contact' 
              });
            }
          }
        }
      }
    }

    // Validate pricing attributes
    if (data.price_attributes) {
      const priceTypeValidation = validatePriceType(data.price_attributes.type);
      if (!priceTypeValidation.isValid) {
        errors.push({ 
          field: 'price_attributes.type', 
          message: priceTypeValidation.error!
        });
      }

      // Validate base amount
      if (data.price_attributes.base_amount !== undefined) {
        const priceValidation = validatePrice(data.price_attributes.base_amount);
        if (!priceValidation.isValid) {
          errors.push({ 
            field: 'price_attributes.base_amount', 
            message: priceValidation.error!
          });
        }
      }

      // Validate currency
      if (data.price_attributes.currency) {
        const currencyValidation = validateCurrency(data.price_attributes.currency);
        if (!currencyValidation.isValid) {
          errors.push({ 
            field: 'price_attributes.currency', 
            message: currencyValidation.error!
          });
        }
      }

      // Validate multi-currency pricing if present
      if (data.price_attributes.currencies && data.price_attributes.currencies.length > 0) {
        data.price_attributes.currencies.forEach((currency, index) => {
          const currencyValidation = validateCurrency(currency.currency);
          if (!currencyValidation.isValid) {
            errors.push({ 
              field: `price_attributes.currencies[${index}].currency`, 
              message: currencyValidation.error!
            });
          }

          const amountValidation = validatePrice(currency.amount);
          if (!amountValidation.isValid) {
            errors.push({ 
              field: `price_attributes.currencies[${index}].amount`, 
              message: amountValidation.error!
            });
          }
        });

        // Check for duplicate currencies
        const currencies = data.price_attributes.currencies.map(c => c.currency.toUpperCase());
        const uniqueCurrencies = new Set(currencies);
        if (currencies.length !== uniqueCurrencies.size) {
          errors.push({ field: 'price_attributes.currencies', message: 'Duplicate currencies are not allowed' });
        }

        // Ensure exactly one base currency
        const baseCurrencies = data.price_attributes.currencies.filter(c => c.is_base);
        if (baseCurrencies.length !== 1) {
          errors.push({ field: 'price_attributes.currencies', message: 'Exactly one base currency is required' });
        }
      }
    }

    // Check for duplicate names
    if (data.name) {
      const { data: existing } = await this.supabase
        .from('t_catalog_items')
        .select('id')
        .eq('tenant_id', this.config.tenant_id)
        .eq('is_live', this.config.is_live)
        .eq('name', data.name.trim())
        .eq('status', 'active')
        .single();

      if (existing) {
        warnings.push({ 
          field: 'name', 
          message: 'An item with this name already exists' 
        });
      }
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  async validateUpdateRequest(
    currentItem: CatalogItem,
    updateData: UpdateCatalogItemRequest
  ): Promise<{
    is_valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings?: Array<{ field: string; message: string }>;
  }> {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // Name validation
    if (updateData.name !== undefined) {
      if (!updateData.name || updateData.name.trim().length === 0) {
        errors.push({ field: 'name', message: 'Name cannot be empty' });
      } else if (updateData.name.length > 255) {
        errors.push({ field: 'name', message: 'Name must be 255 characters or less' });
      }
    }

    // Description validation
    if (updateData.description_content !== undefined) {
      if (!updateData.description_content || updateData.description_content.trim().length === 0) {
        errors.push({ field: 'description_content', message: 'Description cannot be empty' });
      } else if (updateData.description_content.length > 10000) {
        errors.push({ field: 'description_content', message: 'Description must be 10000 characters or less' });
      }
    }

    // Service terms validation
    if (updateData.terms_content !== undefined && updateData.terms_content && updateData.terms_content.length > 20000) {
      errors.push({ field: 'terms_content', message: 'Service terms must be 20000 characters or less' });
    }

    // ✅ ESSENTIAL: Validate resource updates for human resources
    if (updateData.add_resources && updateData.add_resources.length > 0) {
      for (let i = 0; i < updateData.add_resources.length; i++) {
        const resource = updateData.add_resources[i];
        if ((resource.resource_type_id === 'team_staff' || resource.resource_type_id === 'partner') && !resource.contact_id) {
          errors.push({ 
            field: `add_resources[${i}].contact_id`, 
            message: `Contact is required for ${resource.resource_type_id} resources` 
          });
        } else if (resource.contact_id) {
          const contactValid = await this.validateContactForResource(resource.contact_id, resource.resource_type_id);
          if (!contactValid.is_valid) {
            errors.push({ 
              field: `add_resources[${i}].contact_id`, 
              message: contactValid.error || 'Invalid contact' 
            });
          }
        }
      }
    }

    // Validate price attributes updates
    if (updateData.price_attributes) {
      if (updateData.price_attributes.type) {
        const priceTypeValidation = validatePriceType(updateData.price_attributes.type);
        if (!priceTypeValidation.isValid) {
          errors.push({ 
            field: 'price_attributes.type', 
            message: priceTypeValidation.error!
          });
        }
      }

      if (updateData.price_attributes.base_amount !== undefined) {
        const priceValidation = validatePrice(updateData.price_attributes.base_amount);
        if (!priceValidation.isValid) {
          errors.push({ 
            field: 'price_attributes.base_amount', 
            message: priceValidation.error!
          });
        }
      }

      if (updateData.price_attributes.currency) {
        const currencyValidation = validateCurrency(updateData.price_attributes.currency);
        if (!currencyValidation.isValid) {
          errors.push({ 
            field: 'price_attributes.currency', 
            message: currencyValidation.error!
          });
        }
      }
    }

    // Check for duplicate names (if name is being changed)
    if (updateData.name && updateData.name !== currentItem.name) {
      const { data: existing } = await this.supabase
        .from('t_catalog_items')
        .select('id')
        .eq('tenant_id', this.config.tenant_id)
        .eq('is_live', this.config.is_live)
        .eq('name', updateData.name.trim())
        .eq('status', 'active')
        .neq('id', currentItem.id);

      if (existing) {
        warnings.push({ 
          field: 'name', 
          message: 'Another item with this name already exists' 
        });
      }
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  // =================================================================
  // ✅ ESSENTIAL: Contact validation for human resources
  // =================================================================

  /**
   * Validate contact eligibility for team_staff and partner resources
   */
  async validateContactForResource(contactId: string, resourceType: string): Promise<{
    is_valid: boolean;
    error?: string;
  }> {
    try {
      const requiredClassifications = RESOURCE_CONTACT_ELIGIBILITY[resourceType] || [];
      if (requiredClassifications.length === 0) {
        return { is_valid: true };
      }

      const { data: contact, error } = await this.supabase
        .from('t_contacts')
        .select('id, company_name, name, classifications, status')
        .eq('id', contactId)
        .eq('tenant_id', this.config.tenant_id)
        .single();

      if (error || !contact) {
        return { is_valid: false, error: 'Contact not found' };
      }

      if (contact.status !== 'active') {
        return { is_valid: false, error: 'Contact must be active' };
      }

      // STRICT validation: contact.classifications must include required classification
      const hasRequiredClassification = requiredClassifications.some(classification =>
        contact.classifications && contact.classifications.includes(classification)
      );

      if (!hasRequiredClassification) {
        return { 
          is_valid: false, 
          error: `Contact must have classification: ${requiredClassifications.join(' or ')}` 
        };
      }

      return { is_valid: true };

    } catch (error) {
      return { is_valid: false, error: 'Failed to validate contact' };
    }
  }

  // =================================================================
  // EXISTING METHODS (adapted for Express)
  // =================================================================

  async validateRestoreRequest(data: RestoreCatalogItemRequest): Promise<{
    is_valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings?: Array<{ field: string; message: string }>;
  }> {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // Validate catalog_id
    if (!data.catalog_id || typeof data.catalog_id !== 'string') {
      errors.push({ field: 'catalog_id', message: 'Catalog ID is required and must be a string' });
    } else {
      // Check if catalog item exists
      const { data: catalogItem, error } = await this.supabase
        .from('t_catalog_items')
        .select('id, name, status')
        .eq('id', data.catalog_id)
        .eq('tenant_id', this.config.tenant_id)
        .eq('is_live', this.config.is_live)
        .single();

      if (error || !catalogItem) {
        errors.push({ field: 'catalog_id', message: 'Catalog item not found' });
      } else if (catalogItem.status === 'active') {
        errors.push({ field: 'catalog_id', message: 'Catalog item is already active' });
      }
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  async validateMultiCurrencyPricingData(data: CreateMultiCurrencyPricingRequest): Promise<{
    is_valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings?: Array<{ field: string; message: string }>;
  }> {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // Validate catalog_id
    if (!data.catalog_id || typeof data.catalog_id !== 'string') {
      errors.push({ field: 'catalog_id', message: 'Catalog ID is required' });
    }

    // Validate price_type
    if (!data.price_type) {
      errors.push({ field: 'price_type', message: 'Price type is required' });
    } else {
      const priceTypeValidation = validatePriceType(data.price_type);
      if (!priceTypeValidation.isValid) {
        errors.push({ field: 'price_type', message: priceTypeValidation.error! });
      }
    }

    // Validate currencies array
    if (!data.currencies || !Array.isArray(data.currencies) || data.currencies.length === 0) {
      errors.push({ field: 'currencies', message: 'At least one currency is required' });
    } else {
      // Validate each currency
      data.currencies.forEach((currency, index) => {
        const currencyValidation = validateCurrency(currency.currency);
        if (!currencyValidation.isValid) {
          errors.push({ 
            field: `currencies[${index}].currency`, 
            message: currencyValidation.error!
          });
        }

        const priceValidation = validatePrice(currency.price);
        if (!priceValidation.isValid) {
          errors.push({ 
            field: `currencies[${index}].price`, 
            message: priceValidation.error!
          });
        }
      });

      // Check for duplicate currencies
      const currencies = data.currencies.map(c => c.currency.toUpperCase());
      const uniqueCurrencies = new Set(currencies);
      if (currencies.length !== uniqueCurrencies.size) {
        errors.push({ field: 'currencies', message: 'Duplicate currencies are not allowed' });
      }

      // Check for base currency
      const baseCurrencies = data.currencies.filter(c => c.is_base_currency);
      if (baseCurrencies.length !== 1) {
        errors.push({ field: 'currencies', message: 'Exactly one base currency is required' });
      }
    }

    // Check if catalog item exists and is active
    if (data.catalog_id) {
      const { data: catalogItem, error } = await this.supabase
        .from('t_catalog_items')
        .select('id, name, status')
        .eq('id', data.catalog_id)
        .eq('tenant_id', this.config.tenant_id)
        .eq('is_live', this.config.is_live)
        .single();

      if (error || !catalogItem) {
        errors.push({ field: 'catalog_id', message: 'Catalog item not found' });
      } else if (catalogItem.status !== 'active') {
        errors.push({ field: 'catalog_id', message: 'Cannot update pricing for inactive catalog item' });
      }
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  async validateTenantAccess(catalogId: string): Promise<{
    is_valid: boolean;
    error?: string;
  }> {
    try {
      const { data: catalogItem, error } = await this.supabase
        .from('t_catalog_items')
        .select('id, tenant_id')
        .eq('id', catalogId)
        .eq('is_live', this.config.is_live)
        .single();

      if (error || !catalogItem) {
        return { is_valid: false, error: 'Catalog item not found' };
      }

      if (catalogItem.tenant_id !== this.config.tenant_id) {
        return { is_valid: false, error: 'Access denied: catalog item belongs to different tenant' };
      }

      return { is_valid: true };
    } catch (error) {
      return { is_valid: false, error: 'Failed to validate tenant access' };
    }
  }

  validateBulkOperationLimits(itemCount: number, operation: string): {
    is_valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings?: Array<{ field: string; message: string }>;
  } {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    const limits = {
      create: 100,
      update: 100,
      delete: 50,
      restore: 50,
      pricing: 200
    };

    const limit = limits[operation as keyof typeof limits] || 50;

    if (itemCount > limit) {
      errors.push({ 
        field: 'items', 
        message: `Bulk ${operation} operations are limited to ${limit} items. Received ${itemCount} items.` 
      });
    } else if (itemCount > limit * 0.8) {
      warnings.push({
        field: 'items',
        message: `Processing ${itemCount} items may take longer than usual`
      });
    }

    if (itemCount === 0) {
      errors.push({ field: 'items', message: 'At least one item is required for bulk operations' });
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate service attributes
   */
  validateServiceAttributes(attributes: any): {
    is_valid: boolean;
    errors: Array<{ field: string; message: string }>;
  } {
    const errors: Array<{ field: string; message: string }> = [];

    if (attributes.complexity_level && !['low', 'medium', 'high', 'expert'].includes(attributes.complexity_level)) {
      errors.push({ field: 'service_attributes.complexity_level', message: 'Invalid complexity level' });
    }

    if (attributes.requires_customer_presence !== undefined && typeof attributes.requires_customer_presence !== 'boolean') {
      errors.push({ field: 'service_attributes.requires_customer_presence', message: 'Must be a boolean' });
    }

    if (attributes.estimated_duration !== undefined) {
      if (typeof attributes.estimated_duration !== 'number' || attributes.estimated_duration < 0) {
        errors.push({ field: 'service_attributes.estimated_duration', message: 'Must be a positive number' });
      }
    }

    if (attributes.location_requirements && !Array.isArray(attributes.location_requirements)) {
      errors.push({ field: 'service_attributes.location_requirements', message: 'Must be an array' });
    }

    return {
      is_valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate resource requirements
   */
  validateResourceRequirements(requirements: any): {
    is_valid: boolean;
    errors: Array<{ field: string; message: string }>;
  } {
    const errors: Array<{ field: string; message: string }> = [];

    const requiredTypes = ['team_staff', 'equipment', 'consumables', 'assets', 'partners'];
    
    if (!requirements || typeof requirements !== 'object') {
      errors.push({ field: 'resource_requirements', message: 'Resource requirements must be an object' });
      return { is_valid: false, errors };
    }

    requiredTypes.forEach(type => {
      if (!Array.isArray(requirements[type])) {
        errors.push({ field: `resource_requirements.${type}`, message: `Must be an array` });
      }
    });

    return {
      is_valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate tax configuration
   */
  validateTaxConfig(taxConfig: any): {
    is_valid: boolean;
    errors: Array<{ field: string; message: string }>;
  } {
    const errors: Array<{ field: string; message: string }> = [];

    if (taxConfig.use_tenant_default !== undefined && typeof taxConfig.use_tenant_default !== 'boolean') {
      errors.push({ field: 'tax_config.use_tenant_default', message: 'Must be a boolean' });
    }

    if (taxConfig.specific_tax_rates && !Array.isArray(taxConfig.specific_tax_rates)) {
      errors.push({ field: 'tax_config.specific_tax_rates', message: 'Must be an array' });
    }

    if (taxConfig.tax_exempt !== undefined && typeof taxConfig.tax_exempt !== 'boolean') {
      errors.push({ field: 'tax_config.tax_exempt', message: 'Must be a boolean' });
    }

    if (taxConfig.display_mode && !['inclusive', 'exclusive', 'separate'].includes(taxConfig.display_mode)) {
      errors.push({ field: 'tax_config.display_mode', message: 'Invalid display mode' });
    }

    return {
      is_valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate create resource request
   */
  async validateCreateResourceRequest(data: any): Promise<{
    is_valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings?: Array<{ field: string; message: string }>;
  }> {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // Validate resource type
    if (!data.resource_type_id) {
      errors.push({ field: 'resource_type_id', message: 'Resource type is required' });
    } else if (!['team_staff', 'equipment', 'consumable', 'asset', 'partner'].includes(data.resource_type_id)) {
      errors.push({ field: 'resource_type_id', message: 'Invalid resource type' });
    }

    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Name is required' });
    } else if (data.name.length > 255) {
      errors.push({ field: 'name', message: 'Name must be 255 characters or less' });
    }

    // Validate contact for human resources
    if ((data.resource_type_id === 'team_staff' || data.resource_type_id === 'partner') && data.contact_id) {
      const contactValid = await this.validateContactForResource(data.contact_id, data.resource_type_id);
      if (!contactValid.is_valid) {
        errors.push({ 
          field: 'contact_id', 
          message: contactValid.error || 'Invalid contact' 
        });
      }
    }

    // Validate pricing if provided
    if (data.pricing && Array.isArray(data.pricing)) {
      data.pricing.forEach((pricing: any, index: number) => {
        if (!pricing.pricing_type || !['fixed', 'hourly', 'per_use', 'daily', 'monthly', 'per_unit'].includes(pricing.pricing_type)) {
          errors.push({ field: `pricing[${index}].pricing_type`, message: 'Invalid pricing type' });
        }

        const currencyValidation = validateCurrency(pricing.currency);
        if (!currencyValidation.isValid) {
          errors.push({ field: `pricing[${index}].currency`, message: currencyValidation.error! });
        }

        const rateValidation = validatePrice(pricing.rate);
        if (!rateValidation.isValid) {
          errors.push({ field: `pricing[${index}].rate`, message: rateValidation.error! });
        }
      });
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate field length constraints
   */
  validateFieldLengths(data: any, fieldConstraints: Record<string, number>): Array<{ field: string; message: string }> {
    const errors: Array<{ field: string; message: string }> = [];

    Object.entries(fieldConstraints).forEach(([field, maxLength]) => {
      const value = this.getNestedValue(data, field);
      if (value && typeof value === 'string' && value.length > maxLength) {
        errors.push({ 
          field, 
          message: `${field} must be ${maxLength} characters or less` 
        });
      }
    });

    return errors;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Validate required fields
   */
  validateRequiredFields(data: any, requiredFields: string[]): Array<{ field: string; message: string }> {
    const errors: Array<{ field: string; message: string }> = [];

    requiredFields.forEach(field => {
      const value = this.getNestedValue(data, field);
      if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
        errors.push({ 
          field, 
          message: `${field} is required` 
        });
      }
    });

    return errors;
  }

  /**
   * Validate enum values
   */
  validateEnumFields(data: any, enumConstraints: Record<string, string[]>): Array<{ field: string; message: string }> {
    const errors: Array<{ field: string; message: string }> = [];

    Object.entries(enumConstraints).forEach(([field, allowedValues]) => {
      const value = this.getNestedValue(data, field);
      if (value !== undefined && !allowedValues.includes(value)) {
        errors.push({ 
          field, 
          message: `${field} must be one of: ${allowedValues.join(', ')}` 
        });
      }
    });

    return errors;
  }

  /**
   * Comprehensive validation for complex requests
   */
  async validateComplexRequest(data: any, validationType: 'create' | 'update'): Promise<{
    is_valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings?: Array<{ field: string; message: string }>;
  }> {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // Define validation rules based on type
    const validationRules = this.getValidationRules(validationType);

    // Validate required fields
    if (validationRules.requiredFields) {
      errors.push(...this.validateRequiredFields(data, validationRules.requiredFields));
    }

    // Validate field lengths
    if (validationRules.fieldLengths) {
      errors.push(...this.validateFieldLengths(data, validationRules.fieldLengths));
    }

    // Validate enum fields
    if (validationRules.enumFields) {
      errors.push(...this.validateEnumFields(data, validationRules.enumFields));
    }

    // Custom validations
    if (data.service_attributes) {
      const serviceValidation = this.validateServiceAttributes(data.service_attributes);
      errors.push(...serviceValidation.errors);
    }

    if (data.resource_requirements) {
      const resourceValidation = this.validateResourceRequirements(data.resource_requirements);
      errors.push(...resourceValidation.errors);
    }

    if (data.tax_config) {
      const taxValidation = this.validateTaxConfig(data.tax_config);
      errors.push(...taxValidation.errors);
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Get validation rules for different request types
   */
  private getValidationRules(type: 'create' | 'update'): {
    fieldLengths?: Record<string, number>;
    enumFields?: Record<string, string[]>;
    requiredFields?: string[];
  } {
    const baseRules = {
      fieldLengths: {
        'name': 255,
        'short_description': 500,
        'description_content': 10000,
        'terms_content': 20000,
        'code': 50
      },
      enumFields: {
        'type': ['service', 'equipment', 'spare_part', 'asset'],
        'status': ['active', 'inactive', 'draft'],
        'description_format': ['plain', 'markdown', 'html'],
        'terms_format': ['plain', 'markdown', 'html'],
        'service_attributes.complexity_level': ['low', 'medium', 'high', 'expert'],
        'price_attributes.type': ['fixed', 'unit_price', 'hourly', 'daily'],
        'price_attributes.billing_mode': ['manual', 'automatic', 'scheduled']
      }
    };

    if (type === 'create') {
      return {
        ...baseRules,
        requiredFields: ['name', 'type', 'description_content', 'price_attributes']
      };
    }

    return baseRules;
  }
}