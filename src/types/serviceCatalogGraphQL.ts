// src/types/serviceCatalogGraphQL.ts
// 🚀 Service Catalog GraphQL Types - Complete TypeScript type definitions for Service Catalog GraphQL operations

// =================================================================
// CORE ENTITY TYPES
// =================================================================

export interface ServiceCatalogItem {
  id: string;
  tenantId: string;
  isLive: boolean;
  
  // Basic Information
  serviceName: string;
  description?: string;
  sku?: string;
  slug: string;
  
  // Classification
  categoryId: string;
  industryId: string;
  category?: ServiceCategory;
  industry?: ServiceIndustry;
  
  // Pricing Configuration
  pricingConfig: ServicePricingConfig;
  
  // Service Attributes
  serviceAttributes?: Record<string, any>;
  durationMinutes?: number;
  tags: string[];
  
  // Status and Ordering
  isActive: boolean;
  sortOrder?: number;
  
  // Resource Requirements
  requiredResources: RequiredResource[];
  resourceCount: number;
  
  // Computed Fields
  avgRating?: number;
  usageCount?: number;
  
  // Relationships
  associatedResources: ServiceResourceAssociation[];
  pricingHistory: ServicePricingHistory[];
  
  // Environment Info
  environmentLabel: string;
  
  // Audit Fields
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface ServicePricingConfig {
  basePrice: number;
  currency: string;
  pricingModel: PricingModel;
  
  // Tiered Pricing
  tiers?: PricingTier[];
  
  // Tax Configuration
  taxInclusive?: boolean;
  billingCycle?: BillingCycle;
  
  // Discount Rules
  discountRules?: DiscountRule[];
}

export interface PricingTier {
  minQuantity: number;
  maxQuantity?: number;
  price: number;
  discountPercentage?: number;
}

export interface DiscountRule {
  ruleName: string;
  condition: string;
  action: string;
  value?: number;
  isActive: boolean;
}

export interface RequiredResource {
  resourceId: string;
  quantity?: number;
  isOptional?: boolean;
  alternativeResources: string[];
  skillRequirements: string[];
}

export interface ServiceResourceAssociation {
  id: string;
  serviceId: string;
  resourceId: string;
  quantity?: number;
  isRequired: boolean;
  skillMatchScore?: number;
  estimatedCost?: number;
  
  // Resource Details
  resource?: AvailableResource;
  
  // Audit
  createdAt: string;
  createdBy: string;
}

export interface AvailableResource {
  id: string;
  name: string;
  type: string;
  skills: string[];
  hourlyRate?: number;
  currency?: string;
  locationType: LocationType;
  availabilityScore: number;
  rating: number;
  experienceYears: number;
  certifications: string[];
  isAvailable: boolean;
  nextAvailableDate?: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  parentId?: string;
  level: number;
  sortOrder: number;
  isActive: boolean;
  serviceCount?: number;
}

export interface ServiceIndustry {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  commonPricingRules: DiscountRule[];
  complianceRequirements: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface ServicePricingHistory {
  id: string;
  serviceId: string;
  pricingConfig: ServicePricingConfig;
  effectiveDate: string;
  reason?: string;
  appliedToExistingContracts: boolean;
  createdAt: string;
  createdBy: string;
}

// =================================================================
// ENUM TYPES
// =================================================================

export enum ServiceCatalogStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DRAFT = 'DRAFT',
  ARCHIVED = 'ARCHIVED'
}

export enum ServiceCatalogType {
  SERVICE = 'SERVICE',
  PRODUCT = 'PRODUCT',
  PACKAGE = 'PACKAGE',
  SUBSCRIPTION = 'SUBSCRIPTION'
}

export enum PricingModel {
  FIXED = 'FIXED',
  TIERED = 'TIERED',
  DYNAMIC = 'DYNAMIC'
}

export enum BillingCycle {
  ONE_TIME = 'ONE_TIME',
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY'
}

export enum ServiceCatalogSortField {
  NAME = 'NAME',
  CREATED_AT = 'CREATED_AT',
  UPDATED_AT = 'UPDATED_AT',
  BASE_PRICE = 'BASE_PRICE',
  USAGE_COUNT = 'USAGE_COUNT',
  AVG_RATING = 'AVG_RATING',
  SORT_ORDER = 'SORT_ORDER'
}

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC'
}

export enum ServiceComplexity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  EXPERT = 'EXPERT'
}

export enum LocationType {
  ONSITE = 'ONSITE',
  REMOTE = 'REMOTE',
  HYBRID = 'HYBRID'
}

export enum OperationType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  BULK_CREATE = 'BULK_CREATE',
  BULK_UPDATE = 'BULK_UPDATE',
  ASSOCIATE_RESOURCES = 'ASSOCIATE_RESOURCES',
  UPDATE_PRICING = 'UPDATE_PRICING'
}

export enum ValidationMode {
  STRICT = 'STRICT',
  LENIENT = 'LENIENT'
}

// =================================================================
// FILTER AND QUERY TYPES
// =================================================================

export interface ServiceCatalogFilters {
  // Text Search
  searchTerm?: string;
  
  // Classification Filters
  categoryId?: string;
  industryId?: string;
  
  // Status Filters
  isActive?: boolean;
  
  // Pricing Filters
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  
  // Resource Filters
  hasResources?: boolean;
  
  // Duration Filters
  durationMin?: number;
  durationMax?: number;
  
  // Tag Filters
  tags?: string[];
  
  // Date Filters
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  
  // User Filters
  createdBy?: string;
}

export interface ServiceCatalogSort {
  field: ServiceCatalogSortField;
  direction?: SortDirection;
}

export interface PaginationInput {
  limit?: number;
  offset?: number;
}

export interface ResourceSearchFilters {
  // Resource Type Filters
  skills?: string[];
  locationType?: LocationType;
  
  // Availability Filters
  availabilityStart?: string;
  availabilityEnd?: string;
  
  // Cost Filters
  costMin?: number;
  costMax?: number;
  
  // Quality Filters
  ratingMin?: number;
  experienceYears?: number;
  certificationRequired?: boolean;
  
  // Pagination
  limit?: number;
  offset?: number;
}

// =================================================================
// INPUT TYPES
// =================================================================

export interface CreateServiceCatalogItemInput {
  // Required Fields
  serviceName: string;
  categoryId: string;
  industryId: string;
  pricingConfig: ServicePricingConfigInput;
  
  // Optional Fields
  description?: string;
  sku?: string;
  serviceAttributes?: Record<string, any>;
  durationMinutes?: number;
  tags?: string[];
  
  // Status Fields
  isActive?: boolean;
  sortOrder?: number;
  
  // Resource Requirements
  requiredResources?: RequiredResourceInput[];
}

export interface UpdateServiceCatalogItemInput {
  // Basic Information
  serviceName?: string;
  description?: string;
  sku?: string;
  
  // Classification
  categoryId?: string;
  industryId?: string;
  
  // Pricing
  pricingConfig?: ServicePricingConfigInput;
  
  // Attributes
  serviceAttributes?: Record<string, any>;
  durationMinutes?: number;
  tags?: string[];
  
  // Status
  isActive?: boolean;
  sortOrder?: number;
  
  // Resource Requirements
  requiredResources?: RequiredResourceInput[];
}

export interface ServicePricingConfigInput {
  basePrice: number;
  currency: string;
  pricingModel: PricingModel;
  
  // Optional Pricing Fields
  tiers?: PricingTierInput[];
  taxInclusive?: boolean;
  billingCycle?: BillingCycle;
  discountRules?: DiscountRuleInput[];
}

export interface PricingTierInput {
  minQuantity: number;
  maxQuantity?: number;
  price: number;
  discountPercentage?: number;
}

export interface DiscountRuleInput {
  ruleName: string;
  condition: string;
  action: string;
  value?: number;
  isActive?: boolean;
}

export interface RequiredResourceInput {
  resourceId: string;
  quantity?: number;
  isOptional?: boolean;
  alternativeResources?: string[];
  skillRequirements?: string[];
}

export interface BulkCreateServiceCatalogItemsInput {
  items: CreateServiceCatalogItemInput[];
  batchId?: string;
  validationMode?: ValidationMode;
  continueOnError?: boolean;
}

export interface BulkUpdateServiceCatalogItemsInput {
  updates: BulkUpdateItemInput[];
  batchId?: string;
  validationMode?: ValidationMode;
  continueOnError?: boolean;
}

export interface BulkUpdateItemInput {
  id: string;
  data: UpdateServiceCatalogItemInput;
}

export interface AssociateServiceResourcesInput {
  serviceId: string;
  resourceAssociations: ServiceResourceAssociationInput[];
}

export interface ServiceResourceAssociationInput {
  resourceId: string;
  quantity?: number;
  isRequired?: boolean;
  skillMatchScore?: number;
  estimatedCost?: number;
}

export interface UpdateServicePricingInput {
  serviceId: string;
  pricingConfig: ServicePricingConfigInput;
  effectiveDate?: string;
  reason?: string;
  applyToExistingContracts?: boolean;
}

// =================================================================
// RESPONSE TYPES
// =================================================================

export interface ServiceCatalogResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ServiceCatalogError[];
  warnings?: ServiceCatalogError[];
  metadata?: ResponseMetadata;
}

export interface ServiceCatalogListResponse {
  success: boolean;
  data?: ServiceCatalogConnection;
  message?: string;
  metadata?: ResponseMetadata;
}

export interface ServiceCatalogConnection {
  edges: ServiceCatalogEdge[];
  pageInfo: PageInfo;
  totalCount: number;
  summary: ServiceCatalogSummary;
}

export interface ServiceCatalogEdge {
  node: ServiceCatalogItem;
  cursor: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface ServiceCatalogSummary {
  totalServices: number;
  activeServices: number;
  servicesByCategory: Record<string, number>;
  servicesByIndustry: Record<string, number>;
  avgServicePrice: number;
  mostUsedServices: PopularService[];
  environmentLabel: string;
  isLive: boolean;
}

export interface PopularService {
  serviceId: string;
  serviceName: string;
  usageCount: number;
}

export interface MasterDataResponse {
  success: boolean;
  data?: ServiceCatalogMasterData;
  message?: string;
  metadata?: ResponseMetadata;
}

export interface ServiceCatalogMasterData {
  categories: ServiceCategory[];
  industries: ServiceIndustry[];
  currencies: CurrencyOption[];
  taxRates: TaxRateOption[];
}

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isDefault?: boolean;
}

export interface TaxRateOption {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface ResourceSearchResponse {
  success: boolean;
  data: AvailableResource[];
  totalCount: number;
  matchingCriteria: ResourceSearchSummary;
  searchFilters: Record<string, any>;
  metadata?: ResponseMetadata;
}

export interface ResourceSearchSummary {
  totalResources: number;
  skillMatches: number;
  locationMatches: number;
  availabilityMatches: number;
  costMatches: number;
}

export interface ServiceResourceSummaryResponse {
  success: boolean;
  data?: ServiceResourceSummary;
  message?: string;
  metadata?: ResponseMetadata;
}

export interface ServiceResourceSummary {
  serviceId: string;
  serviceName: string;
  associatedResources: ServiceResourceDetail[];
  totalResources: number;
  totalEstimatedCost: number;
  resourceAvailabilityScore: number;
  availableAlternatives: AvailableResource[];
}

export interface ServiceResourceDetail {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  quantity: number;
  isRequired: boolean;
  skillMatchScore: number;
  estimatedCost: number;
}

export interface BulkOperationResponse {
  success: boolean;
  data?: BulkServiceOperationResult;
  message: string;
  metadata?: ResponseMetadata;
}

export interface BulkServiceOperationResult {
  successCount: number;
  errorCount: number;
  totalCount: number;
  successfulItems: string[];
  failedItems: BulkOperationError[];
  batchId: string;
  processingTimeMs: number;
}

export interface BulkOperationError {
  itemIndex: number;
  itemData: Record<string, any>;
  errorCode: string;
  errorMessage: string;
  fieldErrors?: Record<string, any>;
}

export interface ServiceCatalogError {
  code: string;
  message: string;
  field?: string;
  value?: string;
  context?: Record<string, any>;
}

export interface ResponseMetadata {
  requestId: string;
  executionTimeMs: number;
  environment: string;
  cacheHit?: boolean;
  rateLimit?: RateLimitInfo;
}

export interface RateLimitInfo {
  remaining: number;
  resetTime: string;
}

// =================================================================
// CONTEXT AND ENVIRONMENT TYPES
// =================================================================

export interface ServiceCatalogGraphQLContext {
  tenantId: string;
  userId: string;
  userJWT: string;
  isLive: boolean;
  environmentLabel: string;
  requestId: string;
  userRole?: string;
  clientVersion?: string;
  
  // Service clients
  edgeFunctionClient: any; // EdgeFunctionClient
  
  // Infrastructure
  redis: any;
  req: any;
  res: any;
}

export interface EnvironmentContext {
  tenantId: string;
  userId: string;
  isLive: boolean;
  requestId: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditTrail {
  operationId: string;
  operationType: OperationType;
  tableName: string;
  recordId: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  environmentContext: EnvironmentContext;
  executionTimeMs: number;
  success: boolean;
  errorDetails?: string;
}

export interface IdempotencyRecord {
  key: string;
  operationType: string;
  requestHash: string;
  responseData: Record<string, any>;
  createdAt: string;
  expiresAt: string;
  tenantId: string;
  userId: string;
}

export interface SecurityContext {
  hmacVerified: boolean;
  tenantVerified: boolean;
  userVerified: boolean;
  rateLimitPassed: boolean;
  idempotencyChecked: boolean;
  requestSignature: string;
  securityHeaders: Record<string, any>;
}

// =================================================================
// HEALTH CHECK AND MONITORING TYPES
// =================================================================

export interface ServiceCatalogHealthCheck {
  status: string;
  service: string;
  version: string;
  environmentInfo: EnvironmentContext;
  features: ServiceCatalogFeatures;
  endpoints: ServiceCatalogEndpoints;
  performance: PerformanceMetrics;
}

export interface ServiceCatalogFeatures {
  multiCurrencyPricing: boolean;
  tieredPricing: boolean;
  discountRules: boolean;
  resourceAssociation: boolean;
  bulkOperations: boolean;
  auditTrails: boolean;
  caching: boolean;
  rateLimiting: boolean;
}

export interface ServiceCatalogEndpoints {
  createService: string;
  updateService: string;
  deleteService: string;
  queryServices: string;
  bulkOperations: string;
  masterData: string;
  resources: string;
}

export interface PerformanceMetrics {
  avgResponseTimeMs: number;
  cacheHitRate: number;
  requestsPerMinute: number;
  errorRate: number;
}

export interface ServiceCatalogMetrics {
  totalServices: number;
  activeServices: number;
  servicesByCategory: Record<string, number>;
  servicesByIndustry: Record<string, number>;
  avgServicePrice: number;
  mostUsedServices: PopularService[];
  recentActivities: ServiceActivity[];
}

export interface ServiceActivity {
  operation: string;
  serviceName: string;
  timestamp: string;
  userId: string;
}

// =================================================================
// UTILITY TYPES
// =================================================================

export type ServiceCatalogEntityId = string;
export type ISO8601DateTime = string;
export type CurrencyCode = string;
export type JSONObject = Record<string, any>;

// Helper type for partial updates
export type PartialUpdate<T> = Partial<T> & { id: string };

// Helper type for creation operations (omit auto-generated fields)
export type CreateInput<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;

// Helper type for filter operations (make all fields optional)
export type FilterInput<T> = Partial<T>;

// =================================================================
// GRAPHQL OPERATION TYPES
// =================================================================

export interface ServiceCatalogQueries {
  serviceCatalogItem: (variables: { id: string }) => Promise<ServiceCatalogResponse<ServiceCatalogItem>>;
  serviceCatalogItems: (variables: {
    filters?: ServiceCatalogFilters;
    sort?: ServiceCatalogSort[];
    pagination?: PaginationInput;
  }) => Promise<ServiceCatalogListResponse>;
  serviceCatalogMasterData: () => Promise<MasterDataResponse>;
  availableResources: (variables: {
    filters?: ResourceSearchFilters;
    pagination?: PaginationInput;
  }) => Promise<ResourceSearchResponse>;
  serviceResources: (variables: { serviceId: string }) => Promise<ServiceResourceSummaryResponse>;
  serviceCatalogHealth: () => Promise<ServiceCatalogHealthCheck>;
}

export interface ServiceCatalogMutations {
  createServiceCatalogItem: (variables: {
    input: CreateServiceCatalogItemInput;
  }) => Promise<ServiceCatalogResponse<ServiceCatalogItem>>;
  updateServiceCatalogItem: (variables: {
    id: string;
    input: UpdateServiceCatalogItemInput;
  }) => Promise<ServiceCatalogResponse<ServiceCatalogItem>>;
  deleteServiceCatalogItem: (variables: {
    id: string;
  }) => Promise<ServiceCatalogResponse<boolean>>;
  bulkCreateServiceCatalogItems: (variables: {
    input: BulkCreateServiceCatalogItemsInput;
  }) => Promise<BulkOperationResponse>;
  bulkUpdateServiceCatalogItems: (variables: {
    input: BulkUpdateServiceCatalogItemsInput;
  }) => Promise<BulkOperationResponse>;
  associateServiceResources: (variables: {
    input: AssociateServiceResourcesInput;
  }) => Promise<ServiceCatalogResponse<ServiceCatalogItem>>;
  updateServicePricing: (variables: {
    input: UpdateServicePricingInput;
  }) => Promise<ServiceCatalogResponse<ServiceCatalogItem>>;
}

export interface ServiceCatalogOperations extends ServiceCatalogQueries, ServiceCatalogMutations {}

// =================================================================
// EXPORT ALL TYPES
// =================================================================

// =================================================================
// ENUMS ARE ALREADY EXPORTED ABOVE WITH 'export enum' DECLARATIONS
// =================================================================