// src/types/resource.ts
// ===================================================================
// CORE TYPE DEFINITIONS
// ===================================================================

export type ResourceType = 'team_staff' | 'equipment' | 'consumable' | 'asset' | 'partner';

export type ResourceStatus = 'active' | 'inactive' | 'maintenance' | 'retired';

export type SortDirection = 'asc' | 'desc';

// ===================================================================
// MAIN INTERFACE
// ===================================================================

export interface Resource {
  id: string;
  tenant_id: string;
  is_live: boolean; // ✅ CRITICAL: Environment segregation
  
  // Core fields
  resource_type_id: ResourceType;
  name: string;
  display_name: string;
  description?: string;
  
  // Visual and ordering
  hexcolor?: string;
  icon_name?: string;
  sequence_no?: number;
  
  // Special fields
  contact_id?: string; // Only for team_staff
  tags?: string[];
  form_settings?: any;
  
  // Status
  status: ResourceStatus;
  is_active: boolean;
  is_deletable: boolean;
  
  // Metadata
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface ResourceDetailed extends Resource {
  // Additional computed/joined fields
  environment_label: string;
  contact?: Contact; // Joined contact data for team_staff
  resource_type?: ResourceTypeMaster; // Joined resource type data
}

export interface ResourceTypeMaster {
  id: string;
  name: string;
  description: string;
  icon: string;
  pricing_model: string;
  requires_human_assignment: boolean;
  has_capacity_limits: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  contact_classification: string;
}

// ===================================================================
// REQUEST INTERFACES
// ===================================================================

export interface CreateResourceRequest {
  resource_type_id: ResourceType;
  name: string;
  display_name: string;
  description?: string;
  hexcolor?: string;
  icon_name?: string;
  sequence_no?: number;
  contact_id?: string; // Required for team_staff
  tags?: string[];
  form_settings?: any;
  status?: ResourceStatus;
  is_active?: boolean;
  is_deletable?: boolean;
}

export interface UpdateResourceRequest {
  name?: string;
  display_name?: string;
  description?: string;
  hexcolor?: string;
  icon_name?: string;
  sequence_no?: number;
  tags?: string[];
  form_settings?: any;
  status?: ResourceStatus;
  is_active?: boolean;
  is_deletable?: boolean;
}

// ===================================================================
// QUERY INTERFACES
// ===================================================================

export interface ResourceQuery {
  filters?: ResourceFilters;
  sort?: ResourceSort[];
  pagination?: {
    page: number;
    limit: number;
  };
}

export interface ResourceFilters {
  resource_type_id?: ResourceType | ResourceType[];
  status?: ResourceStatus | ResourceStatus[];
  is_active?: boolean;
  is_live?: boolean; // ✅ CRITICAL: Environment filtering
  search_query?: string;
  contact_id?: string;
  has_contact?: boolean;
  created_after?: string;
  created_before?: string;
}

export interface ResourceSort {
  field: 'name' | 'display_name' | 'created_at' | 'updated_at' | 'sequence_no' | 'status';
  direction: SortDirection;
}

// ===================================================================
// RESPONSE INTERFACES
// ===================================================================

export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Array<{ field: string; message: string }>;
  warnings?: Array<{ field: string; message: string }>;
}

export interface ResourceResponse extends ServiceResponse<ResourceDetailed> {}

export interface ResourceListResponse extends ServiceResponse<ResourceDetailed[]> {
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ===================================================================
// ERROR CLASSES
// ===================================================================

export class ResourceError extends Error {
  constructor(message: string, public code: string, public statusCode: number = 500) {
    super(message);
    this.name = 'ResourceError';
  }
}

export class ResourceNotFoundError extends ResourceError {
  constructor(id: string) {
    super(`Resource with ID ${id} not found`, 'NOT_FOUND', 404);
    this.name = 'ResourceNotFoundError';
  }
}

export class ResourceValidationError extends ResourceError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ResourceValidationError';
  }
}

// ===================================================================
// SERVICE CONFIGURATION
// ===================================================================

export interface ResourceServiceConfig {
  tenant_id: string;
  user_id: string;
  is_live: boolean; // ✅ CRITICAL: Environment segregation
}

// ===================================================================
// VALIDATION FUNCTIONS
// ===================================================================

export function validateResourceType(type: string): { isValid: boolean; error?: string } {
  if (!type || typeof type !== 'string') {
    return { isValid: false, error: 'Resource type is required and must be a string' };
  }
  
  if (!['team_staff', 'equipment', 'consumable', 'asset', 'partner'].includes(type)) {
    return { isValid: false, error: 'Invalid resource type' };
  }
  
  return { isValid: true };
}

// ===================================================================
// CONSTANTS
// ===================================================================

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100
} as const;

export const DEFAULT_RESOURCE_ATTRIBUTES = {
  status: 'active' as ResourceStatus,
  hexcolor: '#40E0D0',
  is_active: true,
  is_deletable: true
} as const;