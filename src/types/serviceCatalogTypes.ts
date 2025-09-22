// src/types/serviceCatalogTypes.ts

// =============================================================================
// CORE SERVICE INTERFACES
// =============================================================================

/**
 * Service Pricing Configuration
 */
export interface ServicePricingConfig {
  base_price: number;
  currency: string;
  pricing_model: string; // Dynamic - comes from m_category_details
  tax_inclusive?: boolean;
  billing_cycle?: string; // Dynamic - comes from m_category_details
}

/**
 * Required Resource
 */
export interface RequiredResource {
  resource_id: string;
  quantity?: number;
  is_optional?: boolean;
}

/**
 * Service from t_catalog_items table
 */
export interface Service {
  id: string;
  tenant_id: string;
  service_name: string;
  description?: string;
  sku?: string;
  category_id: string;
  industry_id: string;
  pricing_config: ServicePricingConfig;
  service_attributes?: Record<string, any>;
  duration_minutes?: number;
  is_active: boolean;
  sort_order?: number;
  required_resources?: RequiredResource[];
  tags?: string[];
  slug: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  is_live: boolean;
  status: string;
  // Display fields
  display_name: string;
  formatted_price: string;
  has_resources: boolean;
  resource_count: number;
}

/**
 * Category Master
 */
export interface CategoryMaster {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  parent_id?: string;
  level: number;
  sort_order: number;
  is_active: boolean;
  service_count?: number;
}

/**
 * Industry Master
 */
export interface IndustryMaster {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  is_active: boolean;
  sort_order: number;
}

/**
 * Currency Option
 */
export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  decimal_places: number;
  is_default?: boolean;
}

/**
 * Tax Rate Option
 */
export interface TaxRateOption {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
}

/**
 * Master Data Response
 */
export interface MasterData {
  categories: CategoryMaster[];
  industries: IndustryMaster[];
  currencies: CurrencyOption[];
  tax_rates: TaxRateOption[];
}

// =============================================================================
// REQUEST/RESPONSE INTERFACES
// =============================================================================

/**
 * Create service request
 */
export interface CreateServiceRequest {
  service_name: string;
  description?: string;
  sku?: string;
  category_id: string;
  industry_id: string;
  pricing_config: ServicePricingConfig;
  service_attributes?: Record<string, any>;
  duration_minutes?: number;
  is_active?: boolean;
  sort_order?: number;
  required_resources?: RequiredResource[];
  tags?: string[];
}

/**
 * Update service request
 */
export interface UpdateServiceRequest {
  service_name?: string;
  description?: string;
  sku?: string;
  pricing_config?: ServicePricingConfig;
  service_attributes?: Record<string, any>;
  duration_minutes?: number;
  is_active?: boolean;
  sort_order?: number;
  required_resources?: RequiredResource[];
  tags?: string[];
}

/**
 * Query parameters for getting services
 */
export interface GetServicesQuery {
  search_term?: string;
  category_id?: string;
  industry_id?: string;
  is_active?: boolean;
  price_min?: number;
  price_max?: number;
  currency?: string;
  has_resources?: boolean;
  sort_by?: 'name' | 'price' | 'created_at' | 'sort_order';
  sort_direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Services list response
 */
export interface ServicesListResponse {
  items: Service[];
  total_count: number;
  page_info: {
    has_next_page: boolean;
    has_prev_page: boolean;
    current_page: number;
    total_pages: number;
  };
  filters_applied: GetServicesQuery;
}

/**
 * Service Resources Response
 */
export interface ServiceResourcesResponse {
  service_id: string;
  associated_resources: {
    resource_id: string;
    resource_type_id: string;
    quantity_required: number;
    duration_hours: number;
    unit_cost: number;
    currency_code: string;
    is_billable: boolean;
    required_skills: string[];
    required_attributes: Record<string, any>;
  }[];
  total_resources: number;
  total_estimated_cost: number;
  resource_availability_score: number;
  available_alternatives: any[];
}

// =============================================================================
// API RESPONSE INTERFACES
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp?: string;
  requestId?: string;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  details?: string;
  code?: string;
  requestId?: string;
  timestamp?: string;
}

/**
 * Edge function response format
 */
export interface EdgeFunctionResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  requestId?: string;
}

// =============================================================================
// VALIDATION INTERFACES
// =============================================================================

/**
 * Validation error structure
 */
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: ValidationError[];
}

/**
 * Service validation rules
 */
export const ServiceValidationRules = {
  service_name: {
    required: true,
    minLength: 2,
    maxLength: 255,
    pattern: /^[a-zA-Z0-9\s\-_.,()&]+$/,
  },
  description: {
    maxLength: 2000,
  },
  sku: {
    maxLength: 100,
    pattern: /^[A-Za-z0-9\-_]+$/,
  },
  pricing_config: {
    base_price: {
      required: true,
      min: 0,
      max: 999999999.99,
      decimalPlaces: 2,
    },
    currency: {
      required: true,
      minLength: 1,
    },
    pricing_model: {
      required: true,
      minLength: 1,
    },
  },
  duration_minutes: {
    min: 1,
    max: 525600, // 1 year in minutes
  },
  sort_order: {
    min: 1,
    max: 999999,
  },
  required_resources: {
    maxCount: 50,
  },
  tags: {
    maxCount: 20,
    maxTagLength: 50,
  },
} as const;

// =============================================================================
// HTTP STATUS CODES
// =============================================================================

export enum ServiceCatalogHttpStatus {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  RATE_LIMITED = 429,
  INTERNAL_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

// =============================================================================
// SERVICE CONFIGURATION
// =============================================================================

/**
 * Service catalog service configuration
 */
export interface ServiceCatalogServiceConfig {
  tenant_id: string;
  is_live: boolean;
  timeout?: number;
  retries?: number;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Service catalog error types
 */
export type ServiceCatalogErrorType = 
  | 'validation_error'
  | 'not_found'
  | 'conflict'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'service_unavailable'
  | 'internal_error';

/**
 * Service catalog error structure
 */
export interface ServiceCatalogError {
  type: ServiceCatalogErrorType;
  message: string;
  details?: ValidationError[];
  requestId?: string;
  timestamp?: string;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Service for frontend display (transformed from DB format)
 */
export type ServiceForFrontend = Omit<Service, 'tenant_id' | 'is_live' | 'created_by' | 'updated_by'>;

/**
 * Create service data (omit computed fields)
 */
export type ServiceCreateData = Omit<
  Service, 
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'slug' | 'display_name' | 'formatted_price' | 'has_resources' | 'resource_count'
>;

/**
 * Update service data (partial, omit computed fields)
 */
export type ServiceUpdateData = Partial<Omit<
  Service, 
  'id' | 'tenant_id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'slug' | 'display_name' | 'formatted_price' | 'has_resources' | 'resource_count'
>>;

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Service status values
 */
export const SERVICE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DRAFT: 'draft',
  DELETED: 'deleted',
} as const;

/**
 * Sort options
 */
export const SORT_OPTIONS = {
  NAME: 'name',
  PRICE: 'price',
  CREATED_AT: 'created_at',
  SORT_ORDER: 'sort_order',
} as const;

/**
 * Sort directions
 */
export const SORT_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

// =============================================================================
// EXPORT DEFAULT (for backwards compatibility)
// =============================================================================

export default {
  ServiceValidationRules,
  ServiceCatalogHttpStatus,
  SERVICE_STATUS,
  SORT_OPTIONS,
  SORT_DIRECTIONS,
};