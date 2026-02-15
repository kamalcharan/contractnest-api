// src/types/resourcesTypes.ts

// =============================================================================
// CORE RESOURCE INTERFACES
// =============================================================================

/**
 * Resource Type from m_catalog_resource_types table
 */
export interface ResourceType {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  pricing_model: 'hourly' | 'per_unit' | 'fixed';
  requires_human_assignment: boolean;
  has_capacity_limits: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Resource from t_catalog_resources table
 */
export interface Resource {
  id: string;
  tenant_id: string;
  is_live: boolean;
  resource_type_id: string;
  name: string;
  description: string | null;
  code: string | null;
  contact_id: string | null;
  attributes: Record<string, any> | null;
  availability_config: Record<string, any> | null;
  is_custom: boolean;
  master_template_id: string | null;
  status: 'active' | 'inactive' | 'maintenance' | 'retired';
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  display_name: string | null;
  hexcolor: string | null;
  sequence_no: number | null;
  is_deletable: boolean;
  tags: Record<string, any> | null;
  form_settings: Record<string, any> | null;
  sub_category: string | null;
  // Populated from joins
  contact?: Contact | null;
  resource_type?: ResourceType | null;
}

/**
 * Contact interface for contact-based resources
 */
export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
  contact_classification: 'buyer' | 'seller' | 'vendor' | 'partner' | 'team_member';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// REQUEST/RESPONSE INTERFACES
// =============================================================================

/**
 * Create resource request
 */
export interface CreateResourceRequest {
  resource_type_id: string;
  name: string;
  display_name: string;
  description?: string;
  code?: string;
  hexcolor?: string;
  sequence_no?: number;
  contact_id?: string;
  attributes?: Record<string, any>;
  availability_config?: Record<string, any>;
  tags?: Record<string, any>;
  form_settings?: Record<string, any>;
  sub_category?: string;
  is_active?: boolean;
  is_deletable?: boolean;
}

/**
 * Update resource request
 */
export interface UpdateResourceRequest {
  name?: string;
  display_name?: string;
  description?: string;
  code?: string;
  hexcolor?: string;
  sequence_no?: number;
  contact_id?: string;
  attributes?: Record<string, any>;
  availability_config?: Record<string, any>;
  tags?: Record<string, any>;
  form_settings?: Record<string, any>;
  sub_category?: string;
  status?: 'active' | 'inactive' | 'maintenance' | 'retired';
  is_deletable?: boolean;
}

/**
 * Query parameters for getting resources
 */
export interface GetResourcesQuery {
  resourceTypeId?: string;
  resourceId?: string;
  nextSequence?: string | boolean;
  include_deleted?: string;
}

/**
 * Next sequence response
 */
export interface NextSequenceResponse {
  nextSequence: number;
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
// INTERNAL API INTERFACES
// =============================================================================

/**
 * Internal signature headers for edge function communication
 */
export interface InternalSignatureHeaders {
  'x-internal-signature': string;
}

/**
 * Edge function request structure
 */
export interface EdgeFunctionRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  body?: string;
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
 * Resource validation rules
 */
export const ResourceValidationRules = {
  name: {
    required: true,
    minLength: 1,
    maxLength: 255,
    // Relaxed pattern - allows letters, numbers, spaces, and common punctuation
    pattern: /^[a-zA-Z0-9\s\-_.()&]+$/,
  },
  display_name: {
    required: true,
    minLength: 1,
    maxLength: 255,
  },
  description: {
    maxLength: 2000,
  },
  code: {
    maxLength: 50,
    pattern: /^[a-zA-Z0-9\-_]+$/, // No spaces in codes
  },
  hexcolor: {
    pattern: /^#[0-9A-Fa-f]{6}$/,
  },
  sequence_no: {
    min: 1,
    max: 9999,
  },
} as const;

// =============================================================================
// HTTP STATUS CODES
// =============================================================================

export enum ResourcesHttpStatus {
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
 * Resource service configuration
 */
export interface ResourceServiceConfig {
  tenant_id: string;
  is_live: boolean;
  timeout?: number;
  retries?: number;
}

/**
 * Contact classification mapping for resource types
 */
export const CONTACT_CLASSIFICATION_MAP: Record<string, string> = {
  'team_staff': 'team_member',
  'partner': 'vendor',
} as const;

/**
 * Resource type behavior flags
 */
export interface ResourceTypeBehavior {
  requires_human_assignment: boolean;
  has_capacity_limits: boolean;
  allows_manual_entry: boolean; // Computed: !requires_human_assignment
  contact_classification?: string; // Only for human assignment types
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Resource for frontend display (transformed from DB format)
 */
export type ResourceForFrontend = Omit<Resource, 'tenant_id' | 'is_live' | 'created_by' | 'updated_by'> & {
  is_active: boolean; // Computed from status === 'active'
};

/**
 * Resource type for frontend display
 */
export type ResourceTypeForFrontend = ResourceType;

/**
 * Create resource data (omit computed fields)
 */
export type ResourceCreateData = Omit<
  Resource, 
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'contact' | 'resource_type'
>;

/**
 * Update resource data (partial, omit computed fields)
 */
export type ResourceUpdateData = Partial<Omit<
  Resource, 
  'id' | 'tenant_id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'contact' | 'resource_type'
>>;

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Resource error types
 */
export type ResourceErrorType = 
  | 'validation_error'
  | 'not_found'
  | 'conflict'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'service_unavailable'
  | 'internal_error';

/**
 * Resource error structure
 */
export interface ResourceError {
  type: ResourceErrorType;
  message: string;
  details?: ValidationError[];
  requestId?: string;
  timestamp?: string;
}

// =============================================================================
// EXPORT DEFAULT (for backwards compatibility)
// =============================================================================

export default {
  ResourceValidationRules,
  ResourcesHttpStatus,
  CONTACT_CLASSIFICATION_MAP,
};