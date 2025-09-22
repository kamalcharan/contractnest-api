// src/types/productMasterdata.ts

export interface CategoryMaster {
  id: string;
  category_name: string;
  description: string | null;
  sequence_no: number;
  is_active: boolean;
  tenant_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryDetail {
  id: string;
  category_id: string;
  detail_name: string;
  detail_value: string;
  description: string | null;
  sequence_no: number;
  is_active: boolean;
  tenant_id?: string;
  created_at: string;
  updated_at: string;
  // Frontend-specific fields
  display_name?: string;
  is_selectable?: boolean;
}

export interface CategoryInfo {
  id: string;
  name: string;
  description: string | null;
}

export interface MasterDataResponse {
  success: boolean;
  data: CategoryDetail[];
  category_info?: CategoryInfo;
  tenant_id?: string;
  total_count?: number;
  error?: string;
  code?: string;
  message?: string;
  timestamp?: string;
}

export interface CategoryListResponse {
  success: boolean;
  data: CategoryMaster[];
  total_count?: number;
  tenant_id?: string;
  error?: string;
  code?: string;
  message?: string;
  timestamp?: string;
}

export interface MasterDataFilters {
  category_name: string;
  is_active?: boolean;
  tenant_id?: string;
}

export interface GetMasterDataRequest {
  category_name: string;
  is_active?: boolean;
}

export interface GetCategoriesRequest {
  is_active?: boolean;
}

// Edge Function specific types
export interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
  category_info?: CategoryInfo;
  tenant_id?: string;
  total_count?: number;
}

// Service response types
export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
  timestamp?: string;
}

// Common error codes
export enum MasterDataErrorCodes {
  MISSING_CATEGORY_NAME = 'MISSING_CATEGORY_NAME',
  MISSING_TENANT_ID = 'MISSING_TENANT_ID',
  INVALID_CATEGORY_NAME = 'INVALID_CATEGORY_NAME',
  CATEGORY_NOT_FOUND = 'CATEGORY_NOT_FOUND',
  EDGE_FUNCTION_ERROR = 'EDGE_FUNCTION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVICE_ERROR = 'SERVICE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  // NEW: Enhanced error codes for new functionality
  INVALID_PAGINATION_PARAMS = 'INVALID_PAGINATION_PARAMS',
  INVALID_SEARCH_PARAMS = 'INVALID_SEARCH_PARAMS',
  INVALID_INDUSTRY_ID = 'INVALID_INDUSTRY_ID',
  PAGINATION_LIMIT_EXCEEDED = 'PAGINATION_LIMIT_EXCEEDED'
}

// Common category names (for reference)
export enum CommonCategories {
  PRICING_TYPE = 'pricing_type',
  STATUS_TYPE = 'status_type',
  PRIORITY_TYPE = 'priority_type',
  CLASSIFICATION_TYPE = 'classification_type',
  DOCUMENT_TYPE = 'document_type',
  CURRENCY_TYPE = 'currency_type',
  COUNTRY_TYPE = 'country_type',
  PAYMENT_TERMS = 'payment_terms',
  DELIVERY_TERMS = 'delivery_terms',
  CONTACT_TYPE = 'contact_type'
}

// Validation types
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Cache types (for future use)
export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in seconds
  key_prefix: string;
}

export interface CachedMasterData {
  data: CategoryDetail[];
  category_info?: CategoryInfo;
  cached_at: string;
  expires_at: string;
}

// Request context types
export interface RequestContext {
  user_id?: string;
  tenant_id?: string;
  jwt_token: string;
  request_id?: string;
  user_agent?: string;
  ip_address?: string;
}

// Audit types (for future use)
export interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  user_id?: string;
  tenant_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

// Health check types
export interface HealthCheckResult {
  service_healthy: boolean;
  edge_function_healthy: boolean;
  database_healthy?: boolean;
  last_check: string;
  details?: Record<string, any>;
}

// Constants interface
export interface MasterDataConstants {
  endpoints: string[];
  query_parameters: string[];
  required_headers: Record<string, string[]>;
  common_categories: string[];
  max_category_name_length: number;
  min_category_name_length: number;
  allowed_category_name_pattern: string;
}

// Transform options
export interface TransformOptions {
  include_inactive?: boolean;
  include_metadata?: boolean;
  sort_by?: 'sequence_no' | 'detail_name' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

// Bulk operations (for future use)
export interface BulkMasterDataRequest {
  categories: string[];
  is_active?: boolean;
  tenant_id?: string;
}

export interface BulkMasterDataResponse {
  success: boolean;
  results: Record<string, MasterDataResponse>;
  failed_categories?: string[];
  error?: string;
  code?: string;
  timestamp?: string;
}

// =================================================================
// NEW: Industry-First Onboarding Types (Enhancement)
// =================================================================

// Industry master data
export interface Industry {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Category-Industry mapping
export interface CategoryIndustryMap {
  id: string;
  category_id: string;
  industry_id: string;
  display_name: string;
  display_order: number;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Pagination metadata
export interface PaginationMetadata {
  current_page: number;
  total_pages: number;
  total_records: number;
  limit: number;
  has_next: boolean;
  has_prev: boolean;
}

// Enhanced response types for new endpoints
export interface IndustryResponse extends ServiceResponse<Industry[]> {
  pagination?: PaginationMetadata;
}

export interface CategoryMapResponse extends ServiceResponse<CategoryIndustryMap[]> {
  industry_id?: string;
  filters?: {
    is_primary_only: boolean;
    search_applied: boolean;
  };
  pagination?: PaginationMetadata;
}

// Enhanced request types for new endpoints
export interface GetIndustriesRequest {
  page?: number;
  limit?: number;
  search?: string;
  is_active?: boolean;
}

export interface GetAllCategoriesRequest {
  page?: number;
  limit?: number;
  search?: string;
  is_active?: boolean;
}

export interface GetIndustryCategoriesRequest {
  industry_id: string;
  is_primary?: boolean;
  page?: number;
  limit?: number;
  search?: string;
  is_active?: boolean;
}

// Enhanced edge function response types
export interface IndustryEdgeFunctionResponse extends EdgeFunctionResponse<Industry[]> {
  pagination?: PaginationMetadata;
}

export interface CategoryMapEdgeFunctionResponse extends EdgeFunctionResponse<CategoryIndustryMap[]> {
  industry_id?: string;
  filters?: {
    is_primary_only: boolean;
    search_applied: boolean;
  };
  pagination?: PaginationMetadata;
}

// Pagination and search validation types
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface SearchParams {
  search: string;
  minimum_length: number;
}

// Industry-specific validation types
export interface IndustryValidationParams {
  industry_id: string;
  is_primary?: boolean;
}

// Enhanced master data constants
export interface EnhancedMasterDataConstants extends MasterDataConstants {
  // Pagination limits
  default_page_size: number;
  max_page_size: number;
  min_page_size: number;
  
  // Search constraints
  min_search_length: number;
  max_search_length: number;
  
  // Industry-specific
  industry_id_pattern: string;
  
  // New endpoints
  industry_endpoints: string[];
}

// Enhanced filter options
export interface EnhancedFilterOptions extends TransformOptions {
  page?: number;
  limit?: number;
  search?: string;
  industry_id?: string;
  is_primary?: boolean;
}

// Enhanced bulk operations for industries
export interface BulkIndustryRequest {
  industry_ids: string[];
  include_categories?: boolean;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export interface BulkIndustryResponse {
  success: boolean;
  results: Record<string, IndustryResponse>;
  failed_industries?: string[];
  error?: string;
  code?: string;
  timestamp?: string;
  pagination?: PaginationMetadata;
}