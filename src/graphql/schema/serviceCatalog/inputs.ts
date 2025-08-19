// src/graphql/schema/serviceCatalog/inputs.ts
// 🚀 Service Catalog GraphQL Input Types - Comprehensive input definitions for all Service Catalog operations

import { gql } from 'apollo-server-express';

export const serviceCatalogInputs = gql`
  # =================================================================
  # FILTER INPUT TYPES
  # =================================================================

  input ServiceCatalogFiltersInput {
    # Text Search
    searchTerm: String
    
    # Classification Filters
    categoryId: String
    industryId: String
    
    # Status Filters
    isActive: Boolean
    
    # Pricing Filters
    priceMin: Float
    priceMax: Float
    currency: String
    
    # Resource Filters
    hasResources: Boolean
    
    # Duration Filters
    durationMin: Int
    durationMax: Int
    
    # Tag Filters
    tags: [String!]
    
    # Date Filters
    createdAfter: DateTime
    createdBefore: DateTime
    updatedAfter: DateTime
    updatedBefore: DateTime
    
    # User Filters
    createdBy: String
  }

  input ServiceCatalogSortInput {
    field: ServiceCatalogSortField!
    direction: SortDirection = ASC
  }

  input PaginationInput {
    limit: Int = 50
    offset: Int = 0
  }

  input ResourceSearchFiltersInput {
    # Resource Type Filters
    skills: [String!]
    locationType: LocationType
    
    # Availability Filters
    availabilityStart: DateTime
    availabilityEnd: DateTime
    
    # Cost Filters
    costMin: Float
    costMax: Float
    
    # Quality Filters
    ratingMin: Float
    experienceYears: Int
    certificationRequired: Boolean
    
    # Pagination
    limit: Int = 50
    offset: Int = 0
  }

  # =================================================================
  # CREATE/UPDATE INPUT TYPES
  # =================================================================

  input CreateServiceCatalogItemInput {
    # Required Fields
    serviceName: String!
    categoryId: String!
    industryId: String!
    pricingConfig: ServicePricingConfigInput!
    
    # Optional Fields
    description: String
    sku: String
    serviceAttributes: JSON
    durationMinutes: Int
    tags: [String!] = []
    
    # Status Fields
    isActive: Boolean = true
    sortOrder: Int
    
    # Resource Requirements
    requiredResources: [RequiredResourceInput!] = []
  }

  input UpdateServiceCatalogItemInput {
    # Basic Information
    serviceName: String
    description: String
    sku: String
    
    # Classification
    categoryId: String
    industryId: String
    
    # Pricing
    pricingConfig: ServicePricingConfigInput
    
    # Attributes
    serviceAttributes: JSON
    durationMinutes: Int
    tags: [String!]
    
    # Status
    isActive: Boolean
    sortOrder: Int
    
    # Resource Requirements
    requiredResources: [RequiredResourceInput!]
  }

  input ServicePricingConfigInput {
    basePrice: Float!
    currency: String!
    pricingModel: PricingModel!
    
    # Optional Pricing Fields
    tiers: [PricingTierInput!]
    taxInclusive: Boolean
    billingCycle: BillingCycle
    discountRules: [DiscountRuleInput!]
  }

  input PricingTierInput {
    minQuantity: Int!
    maxQuantity: Int
    price: Float!
    discountPercentage: Float
  }

  input DiscountRuleInput {
    ruleName: String!
    condition: String!
    action: String!
    value: Float
    isActive: Boolean = true
  }

  input RequiredResourceInput {
    resourceId: String!
    quantity: Int
    isOptional: Boolean = false
    alternativeResources: [String!] = []
    skillRequirements: [String!] = []
  }

  # =================================================================
  # BULK OPERATION INPUT TYPES
  # =================================================================

  input BulkCreateServiceCatalogItemsInput {
    items: [CreateServiceCatalogItemInput!]!
    batchId: String
    validationMode: ValidationMode = STRICT
    continueOnError: Boolean = false
  }

  input BulkUpdateServiceCatalogItemsInput {
    updates: [BulkUpdateItemInput!]!
    batchId: String
    validationMode: ValidationMode = STRICT
    continueOnError: Boolean = false
  }

  input BulkUpdateItemInput {
    id: String!
    data: UpdateServiceCatalogItemInput!
  }

  enum ValidationMode {
    STRICT
    LENIENT
  }

  # =================================================================
  # RESOURCE ASSOCIATION INPUT TYPES
  # =================================================================

  input AssociateServiceResourcesInput {
    serviceId: String!
    resourceAssociations: [ServiceResourceAssociationInput!]!
  }

  input ServiceResourceAssociationInput {
    resourceId: String!
    quantity: Int = 1
    isRequired: Boolean = true
    skillMatchScore: Float
    estimatedCost: Float
  }

  # =================================================================
  # PRICING OPERATION INPUT TYPES
  # =================================================================

  input UpdateServicePricingInput {
    serviceId: String!
    pricingConfig: ServicePricingConfigInput!
    effectiveDate: DateTime
    reason: String
    applyToExistingContracts: Boolean = false
  }

  # =================================================================
  # ADVANCED FILTER INPUT TYPES
  # =================================================================

  input ServiceCatalogAdvancedFiltersInput {
    # Multiple Selection Filters
    categoryIds: [String!]
    industryIds: [String!]
    currencies: [String!]
    
    # Complex Pricing Filters
    pricingModels: [PricingModel!]
    billingCycles: [BillingCycle!]
    hasTieredPricing: Boolean
    hasDiscountRules: Boolean
    
    # Service Attribute Filters
    complexityLevels: [ServiceComplexity!]
    locationTypes: [LocationType!]
    
    # Resource-based Filters
    requiresTeamStaff: Boolean
    requiresEquipment: Boolean
    requiresPartners: Boolean
    minResourceCount: Int
    maxResourceCount: Int
    
    # Performance Filters
    minUsageCount: Int
    minAvgRating: Float
    
    # Advanced Date Filters
    lastUpdatedDays: Int
    lastUsedDays: Int
    
    # Custom Attribute Filters
    customAttributes: JSON
  }

  input ServiceCatalogSearchInput {
    # Search Configuration
    query: String!
    searchFields: [SearchField!] = [NAME, DESCRIPTION, SKU, TAGS]
    fuzzySearch: Boolean = true
    
    # Search Filters
    filters: ServiceCatalogAdvancedFiltersInput
    
    # Search Sorting
    sort: [ServiceCatalogSortInput!]
    
    # Search Pagination
    pagination: PaginationInput
    
    # Search Options
    highlightMatches: Boolean = false
    includeInactive: Boolean = false
  }

  enum SearchField {
    NAME
    DESCRIPTION
    SKU
    TAGS
    CATEGORY
    INDUSTRY
  }

  # =================================================================
  # ANALYTICS INPUT TYPES
  # =================================================================

  input ServiceCatalogAnalyticsInput {
    # Time Range
    startDate: DateTime!
    endDate: DateTime!
    
    # Grouping Options
    groupBy: [AnalyticsGroupBy!] = [DATE]
    
    # Metrics to Include
    metrics: [AnalyticsMetric!] = [USAGE_COUNT, REVENUE, RATING]
    
    # Filters
    serviceIds: [String!]
    categoryIds: [String!]
    industryIds: [String!]
    
    # Additional Options
    includeInactive: Boolean = false
    aggregationLevel: AggregationLevel = DAILY
  }

  enum AnalyticsGroupBy {
    DATE
    CATEGORY
    INDUSTRY
    PRICING_MODEL
    USER
  }

  enum AnalyticsMetric {
    USAGE_COUNT
    REVENUE
    RATING
    CREATION_COUNT
    UPDATE_COUNT
    VIEW_COUNT
  }

  enum AggregationLevel {
    HOURLY
    DAILY
    WEEKLY
    MONTHLY
    YEARLY
  }

  # =================================================================
  # IMPORT/EXPORT INPUT TYPES
  # =================================================================

  input ServiceCatalogImportInput {
    # Import Configuration
    source: ImportSource!
    format: ImportFormat!
    
    # Import Data
    data: String! # JSON string or CSV content
    
    # Import Options
    validationMode: ValidationMode = STRICT
    updateExisting: Boolean = false
    createMissing: Boolean = true
    
    # Mapping Configuration
    fieldMapping: JSON
    defaultValues: JSON
    
    # Processing Options
    batchSize: Int = 100
    continueOnError: Boolean = false
  }

  enum ImportSource {
    MANUAL_UPLOAD
    URL
    EXISTING_CATALOG
    TEMPLATE
  }

  enum ImportFormat {
    JSON
    CSV
    EXCEL
    XML
  }

  input ServiceCatalogExportInput {
    # Export Configuration
    format: ExportFormat!
    
    # Data Selection
    filters: ServiceCatalogAdvancedFiltersInput
    
    # Export Options
    includeMetadata: Boolean = true
    includeResourceAssociations: Boolean = true
    includePricingHistory: Boolean = false
    includeAuditTrail: Boolean = false
    
    # Output Configuration
    compression: Boolean = false
    encryption: Boolean = false
  }

  enum ExportFormat {
    JSON
    CSV
    EXCEL
    PDF
  }

  # =================================================================
  # VALIDATION INPUT TYPES
  # =================================================================

  input ServiceCatalogValidationInput {
    # Validation Target
    serviceData: CreateServiceCatalogItemInput!
    
    # Validation Options
    validatePricing: Boolean = true
    validateResources: Boolean = true
    validateBusinessRules: Boolean = true
    validateIntegration: Boolean = false
    
    # Validation Context
    environmentContext: EnvironmentContextInput
  }

  input EnvironmentContextInput {
    tenantId: String!
    userId: String!
    isLive: Boolean!
    requestId: String
    ipAddress: String
    userAgent: String
  }

  # =================================================================
  # WORKFLOW INPUT TYPES
  # =================================================================

  input ServiceCatalogWorkflowInput {
    # Workflow Configuration
    workflowType: WorkflowType!
    
    # Target Services
    serviceIds: [String!]!
    
    # Workflow Parameters
    parameters: JSON!
    
    # Execution Options
    executeImmediately: Boolean = false
    scheduledAt: DateTime
    
    # Notification Options
    notifyOnCompletion: Boolean = true
    notificationEmails: [String!]
  }

  enum WorkflowType {
    BULK_UPDATE_PRICING
    BULK_STATUS_CHANGE
    BULK_CATEGORY_MIGRATION
    BULK_RESOURCE_ASSOCIATION
    BULK_EXPORT
    BULK_VALIDATION
  }

  # =================================================================
  # INTEGRATION INPUT TYPES
  # =================================================================

  input ServiceCatalogIntegrationInput {
    # Integration Type
    integrationType: IntegrationType!
    
    # Integration Configuration
    configuration: JSON!
    
    # Sync Options
    syncDirection: SyncDirection = BIDIRECTIONAL
    syncFrequency: SyncFrequency = MANUAL
    
    # Mapping Configuration
    fieldMapping: JSON
    filterMapping: JSON
    
    # Error Handling
    errorHandling: ErrorHandling = SKIP_ERRORS
  }

  enum IntegrationType {
    ERP_SYSTEM
    CRM_SYSTEM
    PRICING_ENGINE
    INVENTORY_SYSTEM
    EXTERNAL_CATALOG
  }

  enum SyncDirection {
    IMPORT_ONLY
    EXPORT_ONLY
    BIDIRECTIONAL
  }

  enum SyncFrequency {
    MANUAL
    REAL_TIME
    HOURLY
    DAILY
    WEEKLY
  }

  enum ErrorHandling {
    FAIL_ON_ERROR
    SKIP_ERRORS
    LOG_AND_CONTINUE
  }
`;