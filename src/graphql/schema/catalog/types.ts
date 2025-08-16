// src/graphql/schema/catalog/types.ts
// ✅ PRODUCTION: Complete GraphQL schema for catalog with resource composition

import { gql } from 'apollo-server-express';

export const catalogTypeDefs = gql`
  # =================================================================
  # SCALAR TYPES
  # =================================================================
  
  scalar DateTime
  scalar JSON
  scalar Upload

  # =================================================================
  # ENUMS
  # =================================================================
  
  enum CatalogItemType {
    SERVICE
    EQUIPMENT
    SPARE_PART
    ASSET
  }

  enum ResourceType {
    TEAM_STAFF
    EQUIPMENT
    CONSUMABLE
    ASSET
    PARTNER
  }

  enum ResourceRequirementType {
    REQUIRED
    OPTIONAL
    ALTERNATIVE
  }

  enum ResourceStatus {
    ACTIVE
    INACTIVE
    MAINTENANCE
  }

  enum CatalogItemStatus {
    ACTIVE
    INACTIVE
    DRAFT
  }

  enum ServiceComplexityLevel {
    LOW
    MEDIUM
    HIGH
    EXPERT
  }

  enum PricingType {
    FIXED
    UNIT_PRICE
    HOURLY
    DAILY
  }

  enum ResourcePricingType {
    FIXED
    HOURLY
    PER_USE
    DAILY
    MONTHLY
    PER_UNIT
  }

  enum SupportedCurrency {
    INR
    USD
    EUR
    GBP
    AED
    SGD
    CAD
    AUD
  }

  enum ContentFormat {
    PLAIN
    MARKDOWN
    HTML
  }

  enum SortDirection {
    ASC
    DESC
  }

  # =================================================================
  # CORE TYPES
  # =================================================================

  type CatalogItem {
    id: ID!
    tenantId: String!
    isLive: Boolean!
    
    # Classification
    type: CatalogItemType!
    industryId: String
    categoryId: String
    
    # Basic information
    name: String!
    shortDescription: String
    
    # Rich content
    descriptionFormat: ContentFormat!
    descriptionContent: String
    termsFormat: ContentFormat
    termsContent: String
    
    # Hierarchy
    parentId: String
    parent: CatalogItem
    isVariant: Boolean!
    variantAttributes: JSON
    children: [CatalogItem!]!
    variantCount: Int!
    
    # Resource composition
    resourceRequirements: ResourceRequirements!
    serviceAttributes: ServiceAttributes!
    
    # Pricing and tax
    priceAttributes: PriceAttributes!
    taxConfig: TaxConfig!
    
    # Metadata
    metadata: JSON
    specifications: JSON
    
    # Status and environment
    status: CatalogItemStatus!
    environmentLabel: String!
    
    # Relationships
    industry: Industry
    category: Category
    linkedResources: [Resource!]!
    resourceRequirementsDetails: [ServiceResourceRequirement!]!
    estimatedResourceCost: Float!
    pricingList: [CatalogPricing!]!
    
    # Computed fields
    originalId: ID!
    totalVersions: Int!
    pricingType: PricingType!
    baseAmount: Float!
    currency: SupportedCurrency!
    billingMode: String!
    useTenantDefaultTax: Boolean!
    taxDisplayMode: String
    specificTaxCount: Int!
    
    # Audit fields
    createdAt: DateTime!
    updatedAt: DateTime!
    createdBy: String
    updatedBy: String
  }

  type Resource {
    id: ID!
    tenantId: String!
    isLive: Boolean!
    
    # Resource identification
    resourceTypeId: ResourceType!
    name: String!
    description: String
    code: String
    
    # Contact integration for human resources
    contactId: String
    contact: Contact
    
    # Resource attributes
    attributes: JSON!
    availabilityConfig: JSON!
    
    # Tenant customization
    isCustom: Boolean!
    masterTemplateId: String
    
    # Status
    status: ResourceStatus!
    
    # Relationships
    pricing: [ResourcePricing!]!
    linkedServices: [CatalogItem!]!
    
    # Audit fields
    createdAt: DateTime!
    updatedAt: DateTime!
    createdBy: String
    updatedBy: String
  }

  type ResourcePricing {
    id: ID!
    tenantId: String!
    resourceId: String!
    isLive: Boolean!
    
    # Pricing details
    pricingType: ResourcePricingType!
    currency: SupportedCurrency!
    rate: Float!
    
    # Pricing rules
    minimumCharge: Float
    maximumCharge: Float
    billingIncrement: Float
    
    # Tax integration
    taxIncluded: Boolean!
    taxRateId: String
    
    # Validity
    effectiveFrom: String!
    effectiveTo: String
    isActive: Boolean!
    
    # Audit
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ServiceResourceRequirement {
    id: ID!
    tenantId: String!
    isLive: Boolean!
    
    serviceId: String!
    resourceId: String!
    
    # Requirement details
    requirementType: ResourceRequirementType!
    quantityNeeded: Float!
    usageDuration: Int # Minutes
    usageNotes: String
    
    # Alternative grouping
    alternativeGroup: String
    
    # Cost override
    costOverride: Float
    costCurrency: SupportedCurrency
    
    # Relationships
    service: CatalogItem!
    resource: Resource!
    
    # Audit
    createdAt: DateTime!
    createdBy: String
  }

  type Contact {
    id: ID!
    tenantId: String!
    type: String!
    status: String!
    name: String
    companyName: String
    classifications: [String!]!
    
    # Contact channels
    primaryEmail: String
    primaryPhone: String
    
    # Computed
    displayName: String!
  }

  # =================================================================
  # NESTED TYPES
  # =================================================================

  type ResourceRequirements {
    teamStaff: [String!]!
    equipment: [String!]!
    consumables: [String!]!
    assets: [String!]!
    partners: [String!]!
  }

  type ServiceAttributes {
    estimatedDuration: Int # Minutes
    complexityLevel: ServiceComplexityLevel!
    requiresCustomerPresence: Boolean!
    locationRequirements: [String!]!
    schedulingConstraints: JSON!
  }

  type PriceAttributes {
    type: PricingType!
    baseAmount: Float!
    currency: SupportedCurrency!
    billingMode: String!
    hourlyRate: Float
    dailyRate: Float
    resourceBasedPricing: Boolean
    resourceCostIncluded: Boolean
  }

  type TaxConfig {
    useTenantDefault: Boolean!
    displayMode: String
    specificTaxRates: [String!]!
    taxExempt: Boolean
    exemptionReason: String
  }

  type CatalogPricing {
    id: ID!
    catalogId: String!
    priceType: String!
    currency: SupportedCurrency!
    price: Float!
    taxIncluded: Boolean!
    taxRateId: String
    isBaseCurrency: Boolean
    isActive: Boolean!
    attributes: JSON!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Industry {
    id: String!
    name: String!
    icon: String
  }

  type Category {
    id: String!
    name: String!
    icon: String
  }

  # =================================================================
  # CONNECTION TYPES FOR PAGINATION
  # =================================================================

  type CatalogItemConnection {
    edges: [CatalogItemEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
    summary: CatalogSummary!
  }

  type CatalogItemEdge {
    node: CatalogItem!
    cursor: String!
  }

  type ResourceConnection {
    edges: [ResourceEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
    summary: ResourceSummary!
  }

  type ResourceEdge {
    node: Resource!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type CatalogSummary {
    totalItems: Int!
    byType: JSON!
    byStatus: JSON!
    withResources: Int!
    environmentLabel: String!
    isLive: Boolean!
  }

  type ResourceSummary {
    totalResources: Int!
    byType: JSON!
    byStatus: JSON!
    withPricing: Int!
    teamStaffWithContacts: Int!
    environmentLabel: String!
    isLive: Boolean!
  }

  # =================================================================
  # INPUT TYPES
  # =================================================================

  input CatalogItemFilters {
    type: [CatalogItemType!]
    status: [CatalogItemStatus!]
    isActive: Boolean
    search: String
    
    # Service-specific filters
    complexityLevel: [ServiceComplexityLevel!]
    requiresCustomerPresence: Boolean
    estimatedDurationMin: Int
    estimatedDurationMax: Int
    
    # Resource filters
    hasResources: Boolean
    resourceTypes: [ResourceType!]
    
    # Pricing filters
    minPrice: Float
    maxPrice: Float
    currency: [SupportedCurrency!]
    
    # Hierarchy filters
    parentId: String
    isVariant: Boolean
    includeVariants: Boolean
    
    # Date filters
    createdAfter: DateTime
    createdBefore: DateTime
    updatedAfter: DateTime
    updatedBefore: DateTime
    createdBy: String
  }

  input ResourceFilters {
    resourceType: [ResourceType!]
    status: [ResourceStatus!]
    search: String
    hasContact: Boolean
    availableOnly: Boolean
    isCustom: Boolean
  }

  input CatalogItemSort {
    field: CatalogItemSortField!
    direction: SortDirection!
  }

  enum CatalogItemSortField {
    NAME
    CREATED_AT
    UPDATED_AT
    BASE_AMOUNT
    TYPE
    STATUS
  }

  input ResourceSort {
    field: ResourceSortField!
    direction: SortDirection!
  }

  enum ResourceSortField {
    NAME
    CREATED_AT
    RESOURCE_TYPE_ID
  }

  input PaginationInput {
    first: Int
    after: String
    last: Int
    before: String
  }

  # =================================================================
  # CREATE/UPDATE INPUT TYPES
  # =================================================================

  input CreateCatalogItemInput {
    # Required fields
    name: String!
    type: CatalogItemType!
    priceAttributes: PriceAttributesInput!
    
    # Optional content
    shortDescription: String
    descriptionContent: String
    descriptionFormat: ContentFormat = MARKDOWN
    termsContent: String
    termsFormat: ContentFormat = MARKDOWN
    
    # Optional classification
    industryId: String
    categoryId: String
    
    # Optional service hierarchy
    parentId: String
    isVariant: Boolean = false
    variantAttributes: JSON
    
    # Resource composition
    resourceRequirements: ResourceRequirementsInput
    serviceAttributes: ServiceAttributesInput
    
    # Optional configuration
    taxConfig: TaxConfigInput
    metadata: JSON
    specifications: JSON
    status: CatalogItemStatus = ACTIVE
    
    # Transaction support - create resources in same operation
    resources: [CreateResourceInput!]
    pricing: [CreateCatalogPricingInput!]
  }

  input UpdateCatalogItemInput {
    # Version management
    versionReason: String
    
    # Updateable fields
    name: String
    shortDescription: String
    descriptionContent: String
    descriptionFormat: ContentFormat
    termsContent: String
    termsFormat: ContentFormat
    priceAttributes: PriceAttributesInput
    taxConfig: TaxConfigInput
    metadata: JSON
    specifications: JSON
    status: CatalogItemStatus
    variantAttributes: JSON
    
    # Resource updates
    resourceRequirements: ResourceRequirementsInput
    serviceAttributes: ServiceAttributesInput
    
    # Transaction support
    addResources: [CreateResourceInput!]
    updateResources: [UpdateResourceInput!]
    removeResources: [String!] # Resource IDs to remove
  }

  input CreateResourceInput {
    resourceTypeId: ResourceType!
    name: String!
    description: String
    code: String
    contactId: String # For team_staff resources
    attributes: JSON
    availabilityConfig: JSON
    status: ResourceStatus = ACTIVE
    
    # Pricing can be included
    pricing: [CreateResourcePricingInput!]
  }

  input UpdateResourceInput {
    id: String!
    name: String
    description: String
    code: String
    contactId: String
    attributes: JSON
    availabilityConfig: JSON
    status: ResourceStatus
  }

  input CreateResourcePricingInput {
    pricingType: ResourcePricingType!
    currency: SupportedCurrency!
    rate: Float!
    minimumCharge: Float
    maximumCharge: Float
    billingIncrement: Float
    taxIncluded: Boolean = false
    taxRateId: String
    effectiveFrom: String
    effectiveTo: String
  }

  input CreateCatalogPricingInput {
    priceType: String!
    currency: SupportedCurrency!
    price: Float!
    taxIncluded: Boolean = false
    taxRateId: String
    isBaseCurrency: Boolean = false
    attributes: JSON
  }

  input ResourceRequirementsInput {
    teamStaff: [String!] = []
    equipment: [String!] = []
    consumables: [String!] = []
    assets: [String!] = []
    partners: [String!] = []
  }

  input ServiceAttributesInput {
    estimatedDuration: Int
    complexityLevel: ServiceComplexityLevel = MEDIUM
    requiresCustomerPresence: Boolean = false
    locationRequirements: [String!] = []
    schedulingConstraints: JSON
  }

  input PriceAttributesInput {
    type: PricingType!
    baseAmount: Float!
    currency: SupportedCurrency!
    billingMode: String!
    hourlyRate: Float
    dailyRate: Float
    resourceBasedPricing: Boolean
    resourceCostIncluded: Boolean
  }

  input TaxConfigInput {
    useTenantDefault: Boolean = true
    displayMode: String
    specificTaxRates: [String!] = []
    taxExempt: Boolean
    exemptionReason: String
  }

  input AddResourceRequirementInput {
    resourceId: String!
    requirementType: ResourceRequirementType!
    quantityNeeded: Float!
    usageDuration: Int
    usageNotes: String
    alternativeGroup: String
    costOverride: Float
    costCurrency: SupportedCurrency
  }

  input BulkCreateCatalogItemsInput {
    items: [CreateCatalogItemInput!]!
  }

  input BulkUpdateCatalogItemsInput {
    updates: [BulkUpdateItem!]!
  }

  input BulkUpdateItem {
    id: String!
    data: UpdateCatalogItemInput!
  }

  input BulkDeleteCatalogItemsInput {
    ids: [String!]!
  }

  input RestoreCatalogItemInput {
    catalogId: String!
    restoreReason: String
    restorePricing: Boolean = false
  }

  # =================================================================
  # RESPONSE TYPES
  # =================================================================

  type CatalogItemResponse {
    success: Boolean!
    data: CatalogItem
    message: String
    errors: [ValidationError!]
    warnings: [ValidationError!]
    environmentInfo: EnvironmentInfo!
  }

  type ResourceResponse {
    success: Boolean!
    data: Resource
    message: String
    errors: [ValidationError!]
    environmentInfo: EnvironmentInfo!
  }

  type BulkOperationResponse {
    success: Boolean!
    message: String!
    data: BulkOperationResult!
    environmentInfo: EnvironmentInfo!
  }

  type BulkOperationResult {
    totalRequested: Int!
    totalSuccessful: Int!
    totalFailed: Int!
    successful: [BulkOperationItem!]!
    failed: [BulkOperationError!]!
  }

  type BulkOperationItem {
    index: Int!
    id: String!
    name: String
  }

  type BulkOperationError {
    index: Int!
    id: String
    name: String
    errors: [ValidationError!]!
  }

  type ValidationError {
    field: String!
    message: String!
  }

  type EnvironmentInfo {
    isLive: Boolean!
    environmentLabel: String!
    tenantId: String!
    requestId: String!
    timestamp: DateTime!
  }

  type TenantConfig {
    environmentInfo: EnvironmentInfo!
    supportedFeatures: SupportedFeatures!
    limits: SystemLimits!
    contactClassifications: ContactClassifications!
  }

  type SupportedFeatures {
    resourceTypes: [ResourceType!]!
    catalogTypes: [CatalogItemType!]!
    supportedCurrencies: [SupportedCurrency!]!
    complexityLevels: [ServiceComplexityLevel!]!
    pricingTypes: [PricingType!]!
    resourcePricingTypes: [ResourcePricingType!]!
  }

  type SystemLimits {
    bulkCreate: Int!
    bulkUpdate: Int!
    bulkDelete: Int!
    queryLimit: Int!
    descriptionLength: Int!
    termsLength: Int!
  }

  type ContactClassifications {
    teamStaff: [String!]!
    partner: [String!]!
  }

  type EligibleContactsResponse {
    success: Boolean!
    data: [Contact!]!
    summary: ContactsSummary!
    environmentInfo: EnvironmentInfo!
  }

  type ContactsSummary {
    totalEligible: Int!
    resourceType: ResourceType!
  }

  type HealthCheckResponse {
    status: String!
    environmentInfo: EnvironmentInfo!
    service: String!
    version: String!
    features: ServiceFeatures!
  }

  type ServiceFeatures {
    resourceComposition: Boolean!
    environmentSegregation: Boolean!
    contactIntegration: Boolean!
    multiCurrencyPricing: Boolean!
    bulkOperations: Boolean!
  }

  # =================================================================
  # QUERIES
  # =================================================================

  type Query {
    # Catalog items
    catalogItem(id: ID!): CatalogItem
    catalogItems(
      filters: CatalogItemFilters
      sort: [CatalogItemSort!]
      pagination: PaginationInput
    ): CatalogItemConnection!
    
    # Resources
    resource(id: ID!): Resource
    tenantResources(
      filters: ResourceFilters
      sort: [ResourceSort!]
      pagination: PaginationInput
    ): ResourceConnection!
    
    # Utility queries
    eligibleContacts(resourceType: ResourceType!): EligibleContactsResponse!
    tenantConfig: TenantConfig!
    healthCheck: HealthCheckResponse!
  }

  # =================================================================
  # MUTATIONS
  # =================================================================

  type Mutation {
    # Single operations
    createCatalogItem(input: CreateCatalogItemInput!): CatalogItemResponse!
    updateCatalogItem(id: ID!, input: UpdateCatalogItemInput!): CatalogItemResponse!
    deleteCatalogItem(id: ID!): CatalogItemResponse!
    
    # Bulk operations
    bulkCreateCatalogItems(input: BulkCreateCatalogItemsInput!): BulkOperationResponse!
    bulkUpdateCatalogItems(input: BulkUpdateCatalogItemsInput!): BulkOperationResponse!
    bulkDeleteCatalogItems(input: BulkDeleteCatalogItemsInput!): BulkOperationResponse!
    
    # Restore operations
    restoreCatalogItem(input: RestoreCatalogItemInput!): CatalogItemResponse!
  }
`;