// src/utils/catalogHelpers.ts
// Utility functions for Service Catalog operations
// Provides data transformation, validation, formatting, and business logic helpers

import { Request } from 'express';
import { 
  CatalogItemFilters, 
  CatalogItemQuery, 
  CatalogItemSort,
  PriceAttributes,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest
} from '../types/catalog';

// ===================================================================
// DATA TRANSFORMATION HELPERS
// ===================================================================

/**
 * Transform request query parameters to catalog query object
 */
export const transformQueryParams = (query: any): CatalogItemQuery => {
  const {
    // Pagination
    page = '1',
    limit = '50',
    
    // Sorting
    sort_by,
    sort_order = 'desc',
    
    // Filters
    type,
    status,
    is_active,
    industry_id,
    category_id,
    search,
    service_parent_id,
    is_variant,
    pricing_type,
    min_price,
    max_price,
    currency,
    created_after,
    created_before,
    updated_after,
    updated_before,
    created_by,
    
    // Include flags
    include_related,
    include_versions,
    include_history,
    environment
  } = query;

  const catalogQuery: CatalogItemQuery = {
    pagination: {
      page: Math.max(1, parseInt(page as string) || 1),
      limit: Math.min(Math.max(1, parseInt(limit as string) || 50), 1000) // Between 1 and 1000
    },
    filters: {},
    include_related: include_related === 'true',
    include_versions: include_versions === 'true'
  };

  // Build filters object
  const filters: CatalogItemFilters = {};

  // Array or single value filters
  if (type) {
    filters.type = Array.isArray(type) ? type : [type];
  }
  
  if (status) {
    filters.status = Array.isArray(status) ? status : [status];
  }
  
  if (industry_id) {
    filters.industry_id = Array.isArray(industry_id) ? industry_id : industry_id;
  }
  
  if (category_id) {
    filters.category_id = Array.isArray(category_id) ? category_id : category_id;
  }
  
  if (pricing_type) {
    filters.pricing_type = Array.isArray(pricing_type) ? pricing_type : [pricing_type];
  }

  // Boolean filters
  if (is_active !== undefined) {
    filters.is_active = is_active === 'true';
  }
  
  if (is_variant !== undefined) {
    filters.is_variant = is_variant === 'true';
  }

  // String filters
  if (search && typeof search === 'string' && search.trim().length > 0) {
    filters.search = search.trim();
  }
  
  if (service_parent_id && typeof service_parent_id === 'string') {
    filters.service_parent_id = service_parent_id;
  }
  
  if (currency && typeof currency === 'string') {
    filters.currency = currency.toUpperCase();
  }
  
  if (created_by && typeof created_by === 'string') {
    filters.created_by = created_by;
  }

  // Numeric filters
  if (min_price && !isNaN(parseFloat(min_price as string))) {
    filters.min_price = parseFloat(min_price as string);
  }
  
  if (max_price && !isNaN(parseFloat(max_price as string))) {
    filters.max_price = parseFloat(max_price as string);
  }

  // Date filters (validate ISO 8601 format)
  if (created_after && isValidISODate(created_after as string)) {
    filters.created_after = created_after as string;
  }
  
  if (created_before && isValidISODate(created_before as string)) {
    filters.created_before = created_before as string;
  }
  
  if (updated_after && isValidISODate(updated_after as string)) {
    filters.updated_after = updated_after as string;
  }
  
  if (updated_before && isValidISODate(updated_before as string)) {
    filters.updated_before = updated_before as string;
  }

  // Only add filters if we have any
  if (Object.keys(filters).length > 0) {
    catalogQuery.filters = filters;
  }

  // Add sorting
  if (sort_by) {
    const validSortFields = ['name', 'created_at', 'updated_at', 'version_number', 'base_amount', 'type', 'status'];
    if (validSortFields.includes(sort_by as string)) {
      catalogQuery.sort = [{
        field: sort_by as any,
        direction: sort_order === 'asc' ? 'asc' : 'desc'
      }];
    }
  }

  return catalogQuery;
};

/**
 * Transform create request data and set defaults
 */
export const transformCreateRequest = (data: any, tenantId: string, userId?: string): CreateCatalogItemRequest => {
  const transformedData: CreateCatalogItemRequest = {
    // Required fields
    name: data.name?.trim(),
    type: data.type,
    price_attributes: transformPriceAttributes(data.price_attributes),
    
    // Optional classification
    industry_id: data.industry_id || undefined,
    category_id: data.category_id || undefined,
    
    // Optional content
    short_description: data.short_description?.trim() || undefined,
    description_content: data.description_content || undefined,
    description_format: data.description_format || 'markdown',
    terms_content: data.terms_content || undefined,
    terms_format: data.terms_format || 'markdown',
    
    // Service hierarchy
    service_parent_id: data.service_parent_id || undefined,
    is_variant: data.is_variant || false,
    variant_attributes: data.variant_attributes || {},
    
    // Configuration
    tax_config: transformTaxConfig(data.tax_config),
    metadata: data.metadata || {},
    specifications: data.specifications || {},
    status: data.status || 'active',
    
    // Environment
    is_live: data.is_live !== undefined ? data.is_live : true
  };

  return transformedData;
};

/**
 * Transform update request data
 */
export const transformUpdateRequest = (data: any): UpdateCatalogItemRequest => {
  const transformedData: UpdateCatalogItemRequest = {};

  // Only include fields that are provided in the update
  if (data.version_reason !== undefined) {
    transformedData.version_reason = data.version_reason;
  }
  
  if (data.name !== undefined) {
    transformedData.name = data.name?.trim();
  }
  
  if (data.short_description !== undefined) {
    transformedData.short_description = data.short_description?.trim();
  }
  
  if (data.description_content !== undefined) {
    transformedData.description_content = data.description_content;
  }
  
  if (data.description_format !== undefined) {
    transformedData.description_format = data.description_format;
  }
  
  if (data.terms_content !== undefined) {
    transformedData.terms_content = data.terms_content;
  }
  
  if (data.terms_format !== undefined) {
    transformedData.terms_format = data.terms_format;
  }
  
  if (data.price_attributes !== undefined) {
    transformedData.price_attributes = transformPriceAttributes(data.price_attributes);
  }
  
  if (data.tax_config !== undefined) {
    transformedData.tax_config = transformTaxConfig(data.tax_config);
  }
  
  if (data.metadata !== undefined) {
    transformedData.metadata = data.metadata;
  }
  
  if (data.specifications !== undefined) {
    transformedData.specifications = data.specifications;
  }
  
  if (data.status !== undefined) {
    transformedData.status = data.status;
  }
  
  if (data.variant_attributes !== undefined) {
    transformedData.variant_attributes = data.variant_attributes;
  }
  
  if (data.industry_id !== undefined) {
    transformedData.industry_id = data.industry_id;
  }
  
  if (data.category_id !== undefined) {
    transformedData.category_id = data.category_id;
  }

  return transformedData;
};

/**
 * Transform and validate price attributes
 */
export const transformPriceAttributes = (priceAttrs: any): PriceAttributes => {
  if (!priceAttrs || typeof priceAttrs !== 'object') {
    throw new Error('Price attributes are required and must be an object');
  }

  const transformed: PriceAttributes = {
    type: priceAttrs.type,
    base_amount: parseFloat(priceAttrs.base_amount) || 0,
    currency: (priceAttrs.currency || 'INR').toUpperCase(),
    billing_mode: priceAttrs.billing_mode || 'manual'
  };

  // Optional numeric fields
  if (priceAttrs.min_amount !== undefined) {
    transformed.min_amount = parseFloat(priceAttrs.min_amount);
  }
  
  if (priceAttrs.max_amount !== undefined) {
    transformed.max_amount = parseFloat(priceAttrs.max_amount);
  }
  
  if (priceAttrs.hourly_rate !== undefined) {
    transformed.hourly_rate = parseFloat(priceAttrs.hourly_rate);
  }
  
  if (priceAttrs.daily_rate !== undefined) {
    transformed.daily_rate = parseFloat(priceAttrs.daily_rate);
  }
  
  if (priceAttrs.monthly_rate !== undefined) {
    transformed.monthly_rate = parseFloat(priceAttrs.monthly_rate);
  }

  // Package details
  if (priceAttrs.package_details) {
    transformed.package_details = {
      sessions: parseInt(priceAttrs.package_details.sessions) || 1,
      validity_days: parseInt(priceAttrs.package_details.validity_days) || 30,
      discount_percentage: priceAttrs.package_details.discount_percentage 
        ? parseFloat(priceAttrs.package_details.discount_percentage) 
        : undefined
    };
  }

  // Subscription details
  if (priceAttrs.subscription_details) {
    transformed.subscription_details = {
      billing_cycle: priceAttrs.subscription_details.billing_cycle || 'monthly',
      setup_fee: priceAttrs.subscription_details.setup_fee 
        ? parseFloat(priceAttrs.subscription_details.setup_fee) 
        : undefined,
      trial_days: priceAttrs.subscription_details.trial_days 
        ? parseInt(priceAttrs.subscription_details.trial_days) 
        : undefined
    };
  }

  // Custom pricing rules
  if (priceAttrs.custom_pricing_rules && Array.isArray(priceAttrs.custom_pricing_rules)) {
    transformed.custom_pricing_rules = priceAttrs.custom_pricing_rules;
  }

  return transformed;
};

/**
 * Transform tax configuration with defaults
 */
export const transformTaxConfig = (taxConfig: any) => {
  if (!taxConfig) {
    return {
      use_tenant_default: true,
      specific_tax_rates: []
    };
  }

  return {
    use_tenant_default: taxConfig.use_tenant_default !== undefined ? taxConfig.use_tenant_default : true,
    display_mode: taxConfig.display_mode || undefined,
    specific_tax_rates: Array.isArray(taxConfig.specific_tax_rates) ? taxConfig.specific_tax_rates : []
  };
};

// ===================================================================
// VALIDATION HELPERS
// ===================================================================

/**
 * Validate ISO 8601 date string
 */
export const isValidISODate = (dateString: string): boolean => {
  if (!dateString || typeof dateString !== 'string') return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && dateString.includes('T');
};

/**
 * Validate UUID format
 */
export const isValidUUID = (uuid: string): boolean => {
  if (!uuid || typeof uuid !== 'string') return false;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Validate hex color code
 */
export const isValidHexColor = (color: string): boolean => {
  if (!color || typeof color !== 'string') return false;
  
  const hexRegex = /^#([0-9A-F]{3}){1,2}$/i;
  return hexRegex.test(color);
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format (digits only)
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  if (!phone || typeof phone !== 'string') return false;
  
  const phoneRegex = /^[0-9+\-\s()]+$/;
  return phoneRegex.test(phone) && phone.replace(/[^0-9]/g, '').length >= 10;
};

/**
 * Validate currency code (3 letter ISO)
 */
export const isValidCurrencyCode = (currency: string): boolean => {
  if (!currency || typeof currency !== 'string') return false;
  
  const currencyRegex = /^[A-Z]{3}$/;
  return currencyRegex.test(currency.toUpperCase());
};

/**
 * Validate price amount (positive number with max 2 decimal places)
 */
export const isValidPriceAmount = (amount: any): boolean => {
  if (amount === undefined || amount === null) return true; // Optional fields
  
  const num = parseFloat(amount);
  if (isNaN(num) || num < 0) return false;
  
  // Check max 2 decimal places
  const decimals = (amount.toString().split('.')[1] || '').length;
  return decimals <= 2;
};

// ===================================================================
// BUSINESS LOGIC HELPERS
// ===================================================================

/**
 * Check if pricing type requires additional details
 */
export const requiresAdditionalPricingDetails = (pricingType: string): string[] => {
  const requirements: string[] = [];
  
  switch (pricingType) {
    case 'price_range':
      requirements.push('min_amount', 'max_amount');
      break;
    case 'package':
      requirements.push('package_details.sessions', 'package_details.validity_days');
      break;
    case 'subscription':
      requirements.push('subscription_details.billing_cycle');
      break;
    case 'hourly':
      requirements.push('hourly_rate or base_amount');
      break;
    case 'daily':
      requirements.push('daily_rate or base_amount');
      break;
    case 'monthly':
      requirements.push('monthly_rate or base_amount');
      break;
  }
  
  return requirements;
};

/**
 * Calculate effective price for display
 */
export const calculateEffectivePrice = (priceAttrs: PriceAttributes): number => {
  switch (priceAttrs.type) {
    case 'fixed':
    case 'unit_price':
      return priceAttrs.base_amount;
    case 'hourly':
      return priceAttrs.hourly_rate || priceAttrs.base_amount;
    case 'daily':
      return priceAttrs.daily_rate || priceAttrs.base_amount;
    case 'monthly':
      return priceAttrs.monthly_rate || priceAttrs.base_amount;
    case 'package':
      return priceAttrs.base_amount;
    case 'subscription':
      return priceAttrs.base_amount;
    case 'price_range':
      return priceAttrs.min_amount || priceAttrs.base_amount;
    default:
      return priceAttrs.base_amount;
  }
};

/**
 * Generate pricing display text
 */
export const generatePricingDisplayText = (priceAttrs: PriceAttributes): string => {
  const currency = priceAttrs.currency || 'INR';
  const formatAmount = (amount: number) => `${currency} ${amount.toLocaleString()}`;
  
  switch (priceAttrs.type) {
    case 'fixed':
      return formatAmount(priceAttrs.base_amount);
    case 'unit_price':
      return `${formatAmount(priceAttrs.base_amount)} per unit`;
    case 'hourly':
      const hourlyRate = priceAttrs.hourly_rate || priceAttrs.base_amount;
      return `${formatAmount(hourlyRate)} per hour`;
    case 'daily':
      const dailyRate = priceAttrs.daily_rate || priceAttrs.base_amount;
      return `${formatAmount(dailyRate)} per day`;
    case 'monthly':
      const monthlyRate = priceAttrs.monthly_rate || priceAttrs.base_amount;
      return `${formatAmount(monthlyRate)} per month`;
    case 'package':
      const sessions = priceAttrs.package_details?.sessions || 1;
      return `${formatAmount(priceAttrs.base_amount)} for ${sessions} sessions`;
    case 'subscription':
      const cycle = priceAttrs.subscription_details?.billing_cycle || 'monthly';
      return `${formatAmount(priceAttrs.base_amount)} per ${cycle.replace('ly', '')}`;
    case 'price_range':
      if (priceAttrs.min_amount && priceAttrs.max_amount) {
        return `${formatAmount(priceAttrs.min_amount)} - ${formatAmount(priceAttrs.max_amount)}`;
      }
      return formatAmount(priceAttrs.base_amount);
    default:
      return formatAmount(priceAttrs.base_amount);
  }
};

/**
 * Check if item can have variants (business rules)
 */
export const canHaveVariants = (itemType: string): boolean => {
  // Only services can typically have variants
  return itemType === 'service';
};

/**
 * Validate variant relationship
 */
export const validateVariantRelationship = (isVariant: boolean, serviceParentId?: string): string[] => {
  const errors: string[] = [];
  
  if (isVariant && !serviceParentId) {
    errors.push('Variant items must have a service_parent_id');
  }
  
  if (!isVariant && serviceParentId) {
    errors.push('Non-variant items cannot have a service_parent_id');
  }
  
  return errors;
};

// ===================================================================
// RESPONSE FORMATTING HELPERS
// ===================================================================

/**
 * Format standard API response
 */
export const formatAPIResponse = (data: any, success: boolean = true, message?: string) => {
  return {
    success,
    data,
    message,
    timestamp: new Date().toISOString()
  };
};

/**
 * Format error response
 */
export const formatErrorResponse = (error: string, details?: any, statusCode?: number) => {
  return {
    success: false,
    error,
    details,
    statusCode,
    timestamp: new Date().toISOString()
  };
};

/**
 * Format pagination response
 */
export const formatPaginationResponse = (data: any[], total: number, page: number, limit: number) => {
  return {
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      has_more: (page * limit) < total,
      total_pages: Math.ceil(total / limit)
    },
    timestamp: new Date().toISOString()
  };
};

// ===================================================================
// REQUEST CONTEXT HELPERS
// ===================================================================

/**
 * Extract user context from request
 */
export const extractUserContext = (req: Request) => {
  return {
    tenantId: req.headers['x-tenant-id'] as string,
    userId: req.headers['x-user-id'] as string || undefined,
    userEmail: req.headers['x-user-email'] as string || undefined,
    sessionId: req.headers['x-session-id'] as string || undefined,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent']
  };
};

/**
 * Generate correlation ID for request tracking
 */
export const generateCorrelationId = (): string => {
  return `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Extract request metadata for logging
 */
export const extractRequestMetadata = (req: Request) => {
  return {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'x-tenant-id': req.headers['x-tenant-id'],
      'x-request-id': req.headers['x-request-id']
    },
    body_size: req.headers['content-length'] ? parseInt(req.headers['content-length']) : 0,
    timestamp: new Date().toISOString()
  };
};

// ===================================================================
// DATA SANITIZATION HELPERS
// ===================================================================

/**
 * Sanitize string input (remove dangerous characters)
 */
export const sanitizeString = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>\"']/g, '') // Remove potentially dangerous characters
    .substring(0, 1000); // Limit length
};

/**
 * Sanitize object for safe JSON serialization
 */
export const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof key === 'string' && key.length <= 100) {
        sanitized[sanitizeString(key)] = sanitizeObject(value);
      }
    }
    return sanitized;
  }
  
  return obj;
};

// ===================================================================
// EXPORT ALL HELPERS
// ===================================================================

export default {
  // Data transformation
  transformQueryParams,
  transformCreateRequest,
  transformUpdateRequest,
  transformPriceAttributes,
  transformTaxConfig,
  
  // Validation
  isValidISODate,
  isValidUUID,
  isValidHexColor,
  isValidEmail,
  isValidPhoneNumber,
  isValidCurrencyCode,
  isValidPriceAmount,
  
  // Business logic
  requiresAdditionalPricingDetails,
  calculateEffectivePrice,
  generatePricingDisplayText,
  canHaveVariants,
  validateVariantRelationship,
  
  // Response formatting
  formatAPIResponse,
  formatErrorResponse,
  formatPaginationResponse,
  
  // Request context
  extractUserContext,
  generateCorrelationId,
  extractRequestMetadata,
  
  // Data sanitization
  sanitizeString,
  sanitizeObject
};