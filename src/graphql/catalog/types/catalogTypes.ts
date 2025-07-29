// src/graphql/catalog/types/catalogTypes.ts
// TypeScript type definitions for Catalog GraphQL schema
// Auto-generated types would go here, plus manual type extensions

import { GraphQLContext } from '../../shared/types/catalogContext';

// =================================================================
// ENUM TYPES
// =================================================================

export enum CatalogItemType {
  SERVICE = 'SERVICE',
  EQUIPMENT = 'EQUIPMENT',
  SPARE_PART = 'SPARE_PART',
  ASSET = 'ASSET'
}

export enum CatalogItemStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DRAFT = 'DRAFT'
}

export enum PricingType {
  FIXED = 'FIXED',
  UNIT_PRICE = 'UNIT_PRICE',
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
  PACKAGE = 'PACKAGE',
  SUBSCRIPTION = 'SUBSCRIPTION',
  PRICE_RANGE = 'PRICE_RANGE'
}

export enum BillingMode {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC'
}

export enum ContentFormat {
  PLAIN = 'PLAIN',
  MARKDOWN = 'MARKDOWN',
  HTML = 'HTML'
}

export enum Environment {
  LIVE = 'LIVE',
  TEST = 'TEST'
}

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC'
}

export enum CatalogItemSortField {
  NAME = 'NAME',
  CREATED_AT = 'CREATED_AT',
  UPDATED_AT = 'UPDATED_AT',
  VERSION_NUMBER = 'VERSION_NUMBER',
  BASE_AMOUNT = 'BASE_AMOUNT'
}

// =================================================================
// INPUT TYPES
// =================================================================

export interface PriceAttributesInput {
  type: PricingType;
  base_amount: number;
  currency?: string;
  billing_mode?: BillingMode;
  min_amount?: number;
  max_amount?: number;
  hourly_rate?: number;
  daily_rate?: number;
  monthly_rate?: number;
  package_details?: PackageDetailsInput;
  subscription_details?: SubscriptionDetailsInput;
  custom_pricing_rules?: any[];
}

export interface PackageDetailsInput {
  sessions: number;
  validity_days: number;
  discount_percentage?: number;
}

export interface SubscriptionDetailsInput {
  billing_cycle: string;
  setup_fee?: number;
  trial_days?: number;
}

export interface TaxConfigInput {
  use_tenant_default?: boolean;
  display_mode?: string;
  specific_tax_rates?: string[];
}

export interface CreateCatalogItemInput {
  name: string;
  type: CatalogItemType;
  price_attributes: PriceAttributesInput;
  industry_id?: string;
  category_id?: string;
  short_description?: string;
  description_content?: string;
  description_format?: ContentFormat;
  terms_content?: string;
  terms_format?: ContentFormat;
  service_parent_id?: string;
  is_variant?: boolean;
  variant_attributes?: any;
  tax_config?: TaxConfigInput;
  metadata?: any;
  specifications?: any;
  status?: CatalogItemStatus;
  is_live?: boolean;
}

export interface UpdateCatalogItemInput {
  version_reason: string;
  name?: string;
  short_description?: string;
  description_content?: string;
  description_format?: ContentFormat;
  terms_content?: string;
  terms_format?: ContentFormat;
  price_attributes?: PriceAttributesInput;
  tax_config?: TaxConfigInput;
  metadata?: any;
  specifications?: any;
  status?: CatalogItemStatus;
  variant_attributes?: any;
  industry_id?: string;
  category_id?: string;
}

export interface CatalogItemFiltersInput {
  type?: CatalogItemType[];
  status?: CatalogItemStatus[];
  is_active?: boolean;
  is_live?: boolean;
  industry_id?: string[];
  category_id?: string[];
  search_query?: string;
  search_fields?: string[];
  service_parent_id?: string;
  is_variant?: boolean;
  include_variants?: boolean;
  pricing_type?: PricingType[];
  min_price?: number;
  max_price?: number;
  currency?: string;
  current_versions_only?: boolean;
  include_inactive?: boolean;
  created_after?: string;
  created_before?: string;
  updated_after?: string;
  updated_before?: string;
  created_by?: string;
}

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface SortInput {
  field?: CatalogItemSortField;
  direction?: SortDirection;
}

export interface CatalogItemQueryInput {
  filters?: CatalogItemFiltersInput;
  pagination?: PaginationInput;
  sort?: SortInput[];
  include_related?: boolean;
  include_versions?: boolean;
}

export interface BulkCatalogItemInput {
  operation: string;
  items: any[];
  options?: any;
}

export interface EnvironmentOperationInput {
  from_environment: Environment;
  to_environment: Environment;
  item_ids?: string[];
}

// =================================================================
// OUTPUT TYPES
// =================================================================

export interface PriceAttributes {
  type: PricingType;
  base_amount: number;
  currency: string;
  billing_mode: BillingMode;
  min_amount?: number;
  max_amount?: number;
  hourly_rate?: number;
  daily_rate?: number;
  monthly_rate?: number;
  package_details?: PackageDetails;
  subscription_details?: SubscriptionDetails;
  custom_pricing_rules?: any[];
}

export interface PackageDetails {
  sessions: number;
  validity_days: number;
  discount_percentage?: number;
}

export interface SubscriptionDetails {
  billing_cycle: string;
  setup_fee?: number;
  trial_days?: number;
}

export interface TaxConfig {
  use_tenant_default: boolean;
  display_mode?: string;
  specific_tax_rates: string[];
}

export interface CatalogIndustry {
  id: string;
  tenant_id: string;
  is_live: boolean;
  industry_code: string;
  name: string;
  description?: string;
  icon?: string;
  common_pricing_rules: any[];
  compliance_requirements: any[];
  is_custom: boolean;
  master_industry_id?: string;
  customization_notes?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface CatalogCategory {
  id: string;
  tenant_id: string;
  industry_id: string;
  is_live: boolean;
  category_code: string;
  name: string;
  description?: string;
  icon?: string;
  default_pricing_model: PricingType;
  suggested_duration?: number;
  common_variants: string[];
  pricing_rule_templates: any[];
  is_custom: boolean;
  master_category_id?: string;
  customization_notes?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  industry?: CatalogIndustry;
}

export interface CatalogItem {
  id: string;
  tenant_id: string;
  is_live: boolean;
  
  // Versioning fields
  original_item_id?: string;
  parent_version_id?: string;
  version_number: number;
  is_current_version: boolean;
  replaced_by_id?: string;
  version_reason?: string;
  
  // Item classification
  type: CatalogItemType;
  industry_id?: string;
  category_id?: string;
  
  // Basic information
  name: string;
  short_description?: string;
  
  // Rich content
  description_format: ContentFormat;
  description_content?: string;
  terms_format: ContentFormat;
  terms_content?: string;
  
  // Service hierarchy
  service_parent_id?: string;
  is_variant: boolean;
  variant_attributes: any;
  
  // Pricing and tax
  price_attributes: PriceAttributes;
  tax_config: TaxConfig;
  
  // Flexible metadata
  metadata: any;
  specifications: any;
  
  // Status
  is_active: boolean;
  status: CatalogItemStatus;
  
  // Audit fields
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  
  // Related data
  industry?: CatalogIndustry;
  category?: CatalogCategory;
  service_parent?: CatalogItem;
  variants?: CatalogItem[];
  
  // Computed fields
  variant_count: number;
  original_id: string;
  total_versions: number;
  
  // Extracted pricing info
  pricing_type: PricingType;
  base_amount: number;
  currency: string;
  billing_mode: BillingMode;
  
  // Tax information
  use_tenant_default_tax: boolean;
  tax_display_mode?: string;
  specific_tax_count: number;
  
  // Environment
  environment_label: string;
}

export interface VersionInfo {
  version_id: string;
  version_number: number;
  version_reason?: string;
  created_at: string;
  created_by?: string;
  created_by_name?: string;
  is_current: boolean;
  price_at_version: PriceAttributes;
  name_at_version: string;
}

export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
  total_pages: number;
}

export interface VersionHistoryResponse {
  versions: VersionInfo[];
  original_item_id: string;
  current_version_id: string;
  total_versions: number;
}

export interface BulkOperationResult {
  total_requested: number;
  successful: number;
  failed: number;
  errors: BulkOperationError[];
  created_ids?: string[];
  updated_ids?: string[];
}

export interface BulkOperationError {
  item_index: number;
  item_id?: string;
  error: string;
  code?: string;
}

export interface EnvironmentOperationResult {
  success: boolean;
  industries_copied?: number;
  categories_copied?: number;
  items_copied?: number;
  message: string;
}

export interface CatalogStatistics {
  total_items: number;
  by_type: CatalogTypeCount[];
  by_status: CatalogStatusCount[];
  by_pricing_type: CatalogPricingCount[];
  by_industry: CatalogIndustryCount[];
  recent_activity: CatalogActivity[];
}

export interface CatalogTypeCount {
  type: CatalogItemType;
  count: number;
}

export interface CatalogStatusCount {
  status: CatalogItemStatus;
  count: number;
}

export interface CatalogPricingCount {
  pricing_type: PricingType;
  count: number;
}

export interface CatalogIndustryCount {
  industry_id: string;
  industry_name: string;
  count: number;
}

export interface CatalogActivity {
  action: string;
  item_id: string;
  item_name: string;
  user_name?: string;
  timestamp: string;
}

export interface CatalogSearchResults {
  items: CatalogItem[];
  pagination: PaginationInfo;
  facets: CatalogSearchFacets;
  query_info: SearchQueryInfo;
}

export interface CatalogSearchFacets {
  types: FacetCount[];
  industries: FacetCount[];
  categories: FacetCount[];
  pricing_types: FacetCount[];
  price_ranges: PriceRangeFacet[];
}

export interface FacetCount {
  value: string;
  label: string;
  count: number;
}

export interface PriceRangeFacet {
  min: number;
  max: number;
  count: number;
  label: string;
}

export interface SearchQueryInfo {
  query?: string;
  total_results: number;
  search_time_ms: number;
  suggestions: string[];
}

export interface ValidationResponse {
  is_valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface CatalogItemResponse {
  item?: CatalogItem;
  validation?: ValidationResponse;
  message?: string;
}

export interface CatalogItemListResponse {
  items: CatalogItem[];
  pagination: PaginationInfo;
  message?: string;
}

export interface MutationResponse {
  success: boolean;
  message: string;
  errors?: string[];
}

// =================================================================
// RESOLVER TYPES
// =================================================================

/**
 * Parent type for resolvers (the object being resolved)
 */
export type ResolverParent = any;

/**
 * Arguments passed to resolvers
 */
export interface ResolverArgs {
  [key: string]: any;
}

/**
 * GraphQL info object
 */
export interface ResolverInfo {
  fieldName: string;
  fieldNodes: any[];
  returnType: any;
  parentType: any;
  path: any;
  schema: any;
  fragments: any;
  rootValue: any;
  operation: any;
  variableValues: any;
}

/**
 * Base resolver function type
 */
export type Resolver<TResult = any, TParent = any, TArgs = any> = (
  parent: TParent,
  args: TArgs,
  context: GraphQLContext,
  info: ResolverInfo
) => Promise<TResult> | TResult;

/**
 * Query resolver interface
 */
export interface CatalogQueryResolvers {
  catalogItem: Resolver<CatalogItemResponse, ResolverParent, { id: string; include_history?: boolean }>;
  catalogItems: Resolver<CatalogItemListResponse, ResolverParent, { query: CatalogItemQueryInput }>;
  searchCatalogItems: Resolver<CatalogSearchResults, ResolverParent, { 
    query: string; 
    filters?: CatalogItemFiltersInput; 
    pagination?: PaginationInput 
  }>;
  catalogItemHistory: Resolver<VersionHistoryResponse, ResolverParent, { id: string }>;
  catalogItemVersion: Resolver<CatalogItemResponse, ResolverParent, { version_id: string }>;
  catalogIndustries: Resolver<CatalogIndustry[], ResolverParent, { is_live?: boolean }>;
  catalogCategories: Resolver<CatalogCategory[], ResolverParent, { industry_id?: string; is_live?: boolean }>;
  catalogStatistics: Resolver<CatalogStatistics, ResolverParent, { is_live?: boolean; date_range?: string[] }>;
  masterIndustries: Resolver<any[], ResolverParent, {}>;
  masterCategories: Resolver<any[], ResolverParent, { industry_ids: string[] }>;
  compareEnvironments: Resolver<any[], ResolverParent, { item_ids?: string[] }>;
  validateCatalogItem: Resolver<ValidationResponse, ResolverParent, { input: CreateCatalogItemInput }>;
  validateCatalogUpdate: Resolver<ValidationResponse, ResolverParent, { id: string; input: UpdateCatalogItemInput }>;
}

/**
 * Mutation resolver interface
 */
export interface CatalogMutationResolvers {
  createCatalogItem: Resolver<CatalogItemResponse, ResolverParent, { input: CreateCatalogItemInput }>;
  updateCatalogItem: Resolver<CatalogItemResponse, ResolverParent, { id: string; input: UpdateCatalogItemInput }>;
  deleteCatalogItem: Resolver<MutationResponse, ResolverParent, { id: string }>;
  duplicateCatalogItem: Resolver<CatalogItemResponse, ResolverParent, { id: string; new_name: string }>;
  activateCatalogItem: Resolver<CatalogItemResponse, ResolverParent, { id: string }>;
  deactivateCatalogItem: Resolver<CatalogItemResponse, ResolverParent, { id: string }>;
  publishCatalogItem: Resolver<CatalogItemResponse, ResolverParent, { id: string }>;
  bulkCreateCatalogItems: Resolver<BulkOperationResult, ResolverParent, { input: BulkCatalogItemInput }>;
  bulkUpdateCatalogItems: Resolver<BulkOperationResult, ResolverParent, { input: BulkCatalogItemInput }>;
  bulkDeleteCatalogItems: Resolver<BulkOperationResult, ResolverParent, { ids: string[] }>;
  bulkActivateCatalogItems: Resolver<BulkOperationResult, ResolverParent, { ids: string[] }>;
  bulkDeactivateCatalogItems: Resolver<BulkOperationResult, ResolverParent, { ids: string[] }>;
  copyLiveToTest: Resolver<EnvironmentOperationResult, ResolverParent, { input?: EnvironmentOperationInput }>;
  promoteTestToLive: Resolver<EnvironmentOperationResult, ResolverParent, { input?: EnvironmentOperationInput }>;
  syncEnvironments: Resolver<EnvironmentOperationResult, ResolverParent, { input?: EnvironmentOperationInput }>;
  setupTenantCatalog: Resolver<EnvironmentOperationResult, ResolverParent, { industry_ids: string[]; copy_to_test?: boolean }>;
  createCustomIndustry: Resolver<CatalogIndustry, ResolverParent, { name: string; description?: string; icon?: string }>;
  createCustomCategory: Resolver<CatalogCategory, ResolverParent, { industry_id: string; name: string; description?: string; icon?: string }>;
  updateCatalogIndustry: Resolver<CatalogIndustry, ResolverParent, { id: string; name?: string; description?: string; icon?: string }>;
  updateCatalogCategory: Resolver<CatalogCategory, ResolverParent, { id: string; name?: string; description?: string; icon?: string }>;
  createServiceVariant: Resolver<CatalogItemResponse, ResolverParent, { parent_id: string; variant_data: CreateCatalogItemInput }>;
  linkServiceVariant: Resolver<MutationResponse, ResolverParent, { parent_id: string; variant_id: string }>;
  unlinkServiceVariant: Resolver<MutationResponse, ResolverParent, { variant_id: string }>;
}

/**
 * Subscription resolver interface
 */
export interface CatalogSubscriptionResolvers {
  catalogItemUpdated: Resolver<CatalogItem, ResolverParent, { tenant_id: string; is_live?: boolean }>;
  catalogItemCreated: Resolver<CatalogItem, ResolverParent, { tenant_id: string; is_live?: boolean }>;
  catalogItemDeleted: Resolver<string, ResolverParent, { tenant_id: string; is_live?: boolean }>;
  bulkOperationProgress: Resolver<any, ResolverParent, { operation_id: string }>;
  environmentSyncProgress: Resolver<any, ResolverParent, { tenant_id: string }>;
  catalogStatisticsUpdated: Resolver<CatalogStatistics, ResolverParent, { tenant_id: string }>;
}

/**
 * Field resolver interface for CatalogItem
 */
export interface CatalogItemFieldResolvers {
  industry: Resolver<CatalogIndustry | null, CatalogItem, {}>;
  category: Resolver<CatalogCategory | null, CatalogItem, {}>;
  service_parent: Resolver<CatalogItem | null, CatalogItem, {}>;
  variants: Resolver<CatalogItem[], CatalogItem, {}>;
  variant_count: Resolver<number, CatalogItem, {}>;
  original_id: Resolver<string, CatalogItem, {}>;
  total_versions: Resolver<number, CatalogItem, {}>;
  pricing_type: Resolver<PricingType, CatalogItem, {}>;
  base_amount: Resolver<number, CatalogItem, {}>;
  currency: Resolver<string, CatalogItem, {}>;
  billing_mode: Resolver<BillingMode, CatalogItem, {}>;
  use_tenant_default_tax: Resolver<boolean, CatalogItem, {}>;
  tax_display_mode: Resolver<string | null, CatalogItem, {}>;
  specific_tax_count: Resolver<number, CatalogItem, {}>;
  environment_label: Resolver<string, CatalogItem, {}>;
}

/**
 * Field resolver interface for CatalogCategory
 */
export interface CatalogCategoryFieldResolvers {
  industry: Resolver<CatalogIndustry | null, CatalogCategory, {}>;
}

/**
 * Complete resolver interface
 */
export interface CatalogResolvers {
  Query: CatalogQueryResolvers;
  Mutation: CatalogMutationResolvers;
  Subscription: CatalogSubscriptionResolvers;
  CatalogItem: CatalogItemFieldResolvers;
  CatalogCategory: CatalogCategoryFieldResolvers;
}

// =================================================================
// SERVICE INTEGRATION TYPES
// =================================================================

/**
 * Edge function call interface
 */
export interface EdgeFunctionCall {
  functionName: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path?: string;
  data?: any;
  headers?: Record<string, string>;
}

/**
 * Edge function response
 */
export interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode: number;
}

/**
 * Database query options
 */
export interface DatabaseQueryOptions {
  tenant_id: string;
  is_live: boolean;
  user_id?: string;
  include_inactive?: boolean;
  include_versions?: boolean;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  key: string;
  ttl: number; // seconds
  tags?: string[];
}

/**
 * Subscription event types
 */
export enum SubscriptionEventType {
  ITEM_CREATED = 'ITEM_CREATED',
  ITEM_UPDATED = 'ITEM_UPDATED',
  ITEM_DELETED = 'ITEM_DELETED',
  BULK_OPERATION = 'BULK_OPERATION',
  ENVIRONMENT_SYNC = 'ENVIRONMENT_SYNC',
  STATISTICS_UPDATE = 'STATISTICS_UPDATE'
}

/**
 * Subscription event data
 */
export interface SubscriptionEvent {
  type: SubscriptionEventType;
  tenant_id: string;
  is_live: boolean;
  data: any;
  timestamp: string;
  user_id?: string;
}

// Export all types
export default {
  // Enums
  CatalogItemType,
  CatalogItemStatus,
  PricingType,
  BillingMode,
  ContentFormat,
  Environment,
  SortDirection,
  CatalogItemSortField,
  SubscriptionEventType,
  
  // Interfaces
  PriceAttributesInput,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
  CatalogItemFiltersInput,
  CatalogItemQueryInput,
  CatalogItem,
  CatalogIndustry,
  CatalogCategory,
  VersionInfo,
  CatalogStatistics,
  ValidationResponse,
  CatalogResolvers,
  EdgeFunctionCall,
  EdgeFunctionResponse,
  SubscriptionEvent
};