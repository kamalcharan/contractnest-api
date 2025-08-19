// src/graphql/schema/serviceCatalog/types.ts
// 🚀 Service Catalog GraphQL Schema Types - Complete type definitions for Service Catalog integration

import { gql } from 'apollo-server-express';

export const serviceCatalogTypeDefs = gql`
  # =================================================================
  # SCALAR TYPES
  # =================================================================
  
  scalar DateTime
  scalar JSON
  scalar Upload

  # =================================================================
  # SERVICE CATALOG ENUMS
  # =================================================================
  
  enum ServiceCatalogStatus {
    ACTIVE
    INACTIVE
    DRAFT
    ARCHIVED
  }

  enum ServiceCatalogType {
    SERVICE
    PRODUCT
    PACKAGE
    SUBSCRIPTION
  }

  enum PricingModel {
    FIXED
    TIERED
    DYNAMIC
  }

  enum BillingCycle {
    ONE_TIME
    HOURLY
    DAILY
    WEEKLY
    MONTHLY
    YEARLY
  }

  enum ServiceCatalogSortField {
    NAME
    CREATED_AT
    UPDATED_AT
    BASE_PRICE
    USAGE_COUNT
    AVG_RATING
    SORT_ORDER
  }

  enum SortDirection {
    ASC
    DESC
  }

  enum ServiceComplexity {
    LOW
    MEDIUM
    HIGH
    EXPERT
  }

  enum LocationType {
    ONSITE
    REMOTE
    HYBRID
  }

  enum OperationType {
    CREATE
    UPDATE
    DELETE
    BULK_CREATE
    BULK_UPDATE
    ASSOCIATE_RESOURCES
    UPDATE_PRICING
  }

  # =================================================================
  # CORE SERVICE CATALOG TYPES
  # =================================================================

  type ServiceCatalogItem {
    id: ID!
    tenantId: String!
    isLive: Boolean!
    
    # Basic Information
    serviceName: String!
    description: String
    sku: String
    slug: String!
    
    # Classification
    categoryId: String!
    industryId: String!
    category: ServiceCategory
    industry: ServiceIndustry
    
    # Pricing Configuration
    pricingConfig: ServicePricingConfig!
    
    # Service Attributes
    serviceAttributes: JSON
    durationMinutes: Int
    tags: [String!]!
    
    # Status and Ordering
    isActive: Boolean!
    sortOrder: Int
    
    # Resource Requirements
    requiredResources: [RequiredResource!]!
    resourceCount: Int!
    
    # Computed Fields
    avgRating: Float
    usageCount: Int
    
    # Relationships
    associatedResources: [ServiceResourceAssociation!]!
    pricingHistory: [ServicePricingHistory!]!
    
    # Environment Info
    environmentLabel: String!
    
    # Audit Fields
    createdAt: DateTime!
    updatedAt: DateTime!
    createdBy: String!
    updatedBy: String!
  }

  type ServicePricingConfig {
    basePrice: Float!
    currency: String!
    pricingModel: PricingModel!
    
    # Tiered Pricing
    tiers: [PricingTier!]
    
    # Tax Configuration
    taxInclusive: Boolean
    billingCycle: BillingCycle
    
    # Discount Rules
    discountRules: [DiscountRule!]
  }

  type PricingTier {
    minQuantity: Int!
    maxQuantity: Int
    price: Float!
    discountPercentage: Float
  }

  type DiscountRule {
    ruleName: String!
    condition: String!
    action: String!
    value: Float
    isActive: Boolean!
  }

  type RequiredResource {
    resourceId: String!
    quantity: Int
    isOptional: Boolean
    alternativeResources: [String!]
    skillRequirements: [String!]
  }

  type ServiceResourceAssociation {
    id: ID!
    serviceId: String!
    resourceId: String!
    quantity: Int
    isRequired: Boolean!
    skillMatchScore: Float
    estimatedCost: Float
    
    # Resource Details
    resource: AvailableResource
    
    # Audit
    createdAt: DateTime!
    createdBy: String!
  }

  type AvailableResource {
    id: ID!
    name: String!
    type: String!
    skills: [String!]!
    hourlyRate: Float
    currency: String
    locationType: LocationType!
    availabilityScore: Float!
    rating: Float!
    experienceYears: Int!
    certifications: [String!]!
    isAvailable: Boolean!
    nextAvailableDate: DateTime
  }

  type ServiceCategory {
    id: ID!
    name: String!
    description: String
    icon: String
    parentId: String
    level: Int!
    sortOrder: Int!
    isActive: Boolean!
    serviceCount: Int
  }

  type ServiceIndustry {
    id: ID!
    name: String!
    description: String
    icon: String
    commonPricingRules: [DiscountRule!]
    complianceRequirements: [String!]
    isActive: Boolean!
    sortOrder: Int!
  }

  type ServicePricingHistory {
    id: ID!
    serviceId: String!
    pricingConfig: ServicePricingConfig!
    effectiveDate: DateTime!
    reason: String
    appliedToExistingContracts: Boolean!
    createdAt: DateTime!
    createdBy: String!
  }

  # =================================================================
  # MASTER DATA TYPES
  # =================================================================

  type ServiceCatalogMasterData {
    categories: [ServiceCategory!]!
    industries: [ServiceIndustry!]!
    currencies: [CurrencyOption!]!
    taxRates: [TaxRateOption!]!
  }

  type CurrencyOption {
    code: String!
    name: String!
    symbol: String!
    decimalPlaces: Int!
    isDefault: Boolean
  }

  type TaxRateOption {
    id: ID!
    name: String!
    rate: Float!
    isDefault: Boolean!
    isActive: Boolean!
  }

  # =================================================================
  # PAGINATION AND CONNECTION TYPES
  # =================================================================

  type ServiceCatalogConnection {
    edges: [ServiceCatalogEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
    summary: ServiceCatalogSummary!
  }

  type ServiceCatalogEdge {
    node: ServiceCatalogItem!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type ServiceCatalogSummary {
    totalServices: Int!
    activeServices: Int!
    servicesByCategory: JSON!
    servicesByIndustry: JSON!
    avgServicePrice: Float!
    mostUsedServices: [PopularService!]!
    environmentLabel: String!
    isLive: Boolean!
  }

  type PopularService {
    serviceId: String!
    serviceName: String!
    usageCount: Int!
  }

  type ResourceSearchSummary {
    totalResources: Int!
    skillMatches: Int!
    locationMatches: Int!
    availabilityMatches: Int!
    costMatches: Int!
  }

  # =================================================================
  # BULK OPERATION TYPES
  # =================================================================

  type BulkServiceOperationResult {
    successCount: Int!
    errorCount: Int!
    totalCount: Int!
    successfulItems: [String!]!
    failedItems: [BulkOperationError!]!
    batchId: String!
    processingTimeMs: Int!
  }

  type BulkOperationError {
    itemIndex: Int!
    itemData: JSON!
    errorCode: String!
    errorMessage: String!
    fieldErrors: JSON
  }

  # =================================================================
  # RESPONSE TYPES
  # =================================================================

  type ServiceCatalogResponse {
    success: Boolean!
    data: ServiceCatalogItem
    message: String
    errors: [ServiceCatalogError!]
    warnings: [ServiceCatalogError!]
    metadata: ResponseMetadata
  }

  type ServiceCatalogListResponse {
    success: Boolean!
    data: ServiceCatalogConnection
    message: String
    metadata: ResponseMetadata
  }

  type MasterDataResponse {
    success: Boolean!
    data: ServiceCatalogMasterData
    message: String
    metadata: ResponseMetadata
  }

  type ResourceSearchResponse {
    success: Boolean!
    data: [AvailableResource!]!
    totalCount: Int!
    matchingCriteria: ResourceSearchSummary!
    searchFilters: JSON!
    metadata: ResponseMetadata
  }

  type ServiceResourceSummaryResponse {
    success: Boolean!
    data: ServiceResourceSummary
    message: String
    metadata: ResponseMetadata
  }

  type ServiceResourceSummary {
    serviceId: String!
    serviceName: String!
    associatedResources: [ServiceResourceDetail!]!
    totalResources: Int!
    totalEstimatedCost: Float!
    resourceAvailabilityScore: Float!
    availableAlternatives: [AvailableResource!]!
  }

  type ServiceResourceDetail {
    resourceId: String!
    resourceName: String!
    resourceType: String!
    quantity: Int!
    isRequired: Boolean!
    skillMatchScore: Float!
    estimatedCost: Float!
  }

  type ServiceCatalogBulkOperationResponse {
    success: Boolean!
    data: BulkServiceOperationResult
    message: String!
    metadata: ResponseMetadata
  }

  type ServiceCatalogError {
    code: String!
    message: String!
    field: String
    value: String
    context: JSON
  }

  type ResponseMetadata {
    requestId: String!
    executionTimeMs: Int!
    environment: String!
    cacheHit: Boolean
    rateLimit: RateLimitInfo
  }

  type RateLimitInfo {
    remaining: Int!
    resetTime: String!
  }

  # =================================================================
  # ANALYTICS AND METRICS TYPES  
  # =================================================================

  type ServiceCatalogMetrics {
    totalServices: Int!
    activeServices: Int!
    servicesByCategory: JSON!
    servicesByIndustry: JSON!
    avgServicePrice: Float!
    mostUsedServices: [PopularService!]!
    recentActivities: [ServiceActivity!]!
  }

  type ServiceActivity {
    operation: String!
    serviceName: String!
    timestamp: DateTime!
    userId: String!
  }

  # =================================================================
  # ENVIRONMENT AND AUDIT TYPES
  # =================================================================

  type EnvironmentContext {
    tenantId: String!
    userId: String!
    isLive: Boolean!
    requestId: String!
    timestamp: DateTime!
    ipAddress: String
    userAgent: String
  }

  type AuditTrail {
    operationId: String!
    operationType: OperationType!
    tableName: String!
    recordId: String!
    oldValues: JSON
    newValues: JSON
    environmentContext: EnvironmentContext!
    executionTimeMs: Int!
    success: Boolean!
    errorDetails: String
  }

  # =================================================================
  # IDEMPOTENCY AND SECURITY TYPES
  # =================================================================

  type IdempotencyRecord {
    key: String!
    operationType: String!
    requestHash: String!
    responseData: JSON!
    createdAt: DateTime!
    expiresAt: DateTime!
    tenantId: String!
    userId: String!
  }

  type SecurityContext {
    hmacVerified: Boolean!
    tenantVerified: Boolean!
    userVerified: Boolean!
    rateLimitPassed: Boolean!
    idempotencyChecked: Boolean!
    requestSignature: String!
    securityHeaders: JSON!
  }

  # =================================================================
  # HEALTH CHECK AND SYSTEM INFO
  # =================================================================

  type ServiceCatalogHealthCheck {
    status: String!
    service: String!
    version: String!
    environmentInfo: EnvironmentContext!
    features: ServiceCatalogFeatures!
    endpoints: ServiceCatalogEndpoints!
    performance: PerformanceMetrics!
  }

  type ServiceCatalogFeatures {
    multiCurrencyPricing: Boolean!
    tieredPricing: Boolean!
    discountRules: Boolean!
    resourceAssociation: Boolean!
    bulkOperations: Boolean!
    auditTrails: Boolean!
    caching: Boolean!
    rateLimiting: Boolean!
  }

  type ServiceCatalogEndpoints {
    createService: String!
    updateService: String!
    deleteService: String!
    queryServices: String!
    bulkOperations: String!
    masterData: String!
    resources: String!
  }

  type PerformanceMetrics {
    avgResponseTimeMs: Float!
    cacheHitRate: Float!
    requestsPerMinute: Int!
    errorRate: Float!
  }

  # =================================================================
  # QUERIES
  # =================================================================

  type Query {
    # Service Catalog Queries
    serviceCatalogItem(id: ID!): ServiceCatalogResponse!
    serviceCatalogItems(
      filters: ServiceCatalogFiltersInput
      sort: [ServiceCatalogSortInput!]
      pagination: PaginationInput
    ): ServiceCatalogListResponse!
    
    # Master Data Queries
    serviceCatalogMasterData: MasterDataResponse!
    serviceCategories: [ServiceCategory!]!
    serviceIndustries: [ServiceIndustry!]!
    supportedCurrencies: [CurrencyOption!]!
    
    # Resource Queries
    availableResources(
      filters: ResourceSearchFiltersInput
      pagination: PaginationInput
    ): ResourceSearchResponse!
    
    serviceResources(serviceId: ID!): ServiceResourceSummaryResponse!
    
    # Analytics Queries
    serviceCatalogMetrics: ServiceCatalogMetrics!
    serviceCatalogAuditTrail(
      serviceId: ID
      operationType: OperationType
      limit: Int = 50
    ): [AuditTrail!]!
    
    # System Queries
    serviceCatalogHealth: ServiceCatalogHealthCheck!
  }

  # =================================================================
  # MUTATIONS
  # =================================================================

  type Mutation {
    # Single Service Operations
    createServiceCatalogItem(input: CreateServiceCatalogItemInput!): ServiceCatalogResponse!
    updateServiceCatalogItem(id: ID!, input: UpdateServiceCatalogItemInput!): ServiceCatalogResponse!
    deleteServiceCatalogItem(id: ID!): ServiceCatalogResponse!
    
    # Bulk Operations
    bulkCreateServiceCatalogItems(input: BulkCreateServiceCatalogItemsInput!): ServiceCatalogBulkOperationResponse!
    bulkUpdateServiceCatalogItems(input: BulkUpdateServiceCatalogItemsInput!): ServiceCatalogBulkOperationResponse!
    
    # Resource Association Operations
    associateServiceResources(input: AssociateServiceResourcesInput!): ServiceCatalogResponse!
    removeServiceResourceAssociation(serviceId: ID!, resourceId: ID!): ServiceCatalogResponse!
    
    # Pricing Operations
    updateServicePricing(input: UpdateServicePricingInput!): ServiceCatalogResponse!
    addPricingTier(serviceId: ID!, tier: PricingTierInput!): ServiceCatalogResponse!
    removePricingTier(serviceId: ID!, tierIndex: Int!): ServiceCatalogResponse!
    
    # Discount Operations
    addDiscountRule(serviceId: ID!, rule: DiscountRuleInput!): ServiceCatalogResponse!
    updateDiscountRule(serviceId: ID!, ruleIndex: Int!, rule: DiscountRuleInput!): ServiceCatalogResponse!
    removeDiscountRule(serviceId: ID!, ruleIndex: Int!): ServiceCatalogResponse!
  }
`;