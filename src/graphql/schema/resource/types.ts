// src/graphql/schema/resource/types.ts
// ✅ PRODUCTION: Complete GraphQL schema for [resource]

import { gql } from 'apollo-server-express';

export const resourceTypeDefs = gql`
  # ================================================================
  # ENUMS
  # ================================================================
  
  enum ResourceType {
    TEAM_STAFF
    EQUIPMENT
    CONSUMABLE
    ASSET
    PARTNER
  }
  
  enum ResourceStatus {
    ACTIVE
    INACTIVE
    MAINTENANCE
    RETIRED
  }
  
  enum ResourceSortField {
    NAME
    DISPLAY_NAME
    CREATED_AT
    UPDATED_AT
    SEQUENCE_NO
    STATUS
  }
  
  # ================================================================
  # CORE TYPES
  # ================================================================
  
  type CatalogResource {
    id: ID!
    tenantId: String!
    isLive: Boolean!
    
    # Core fields
    resourceTypeId: ResourceType!
    name: String!
    displayName: String!
    description: String
    
    # Visual and ordering
    hexcolor: String
    iconName: String
    sequenceNo: Int
    
    # Special fields
    contactId: String
    contact: ResourceContact
    tags: [String]
    formSettings: JSON
    
    # Status
    status: ResourceStatus!
    isActive: Boolean!
    isDeletable: Boolean!
    
    # Metadata - using DateTime to match existing schema
    createdAt: DateTime!
    updatedAt: DateTime!
    createdBy: String
    updatedBy: String
    
    # Computed fields
    environmentLabel: String!
    resourceType: ResourceTypeMaster
  }
  
  type ResourceTypeMaster {
    id: String!
    name: String!
    description: String!
    icon: String!
    pricingModel: String!
    requiresHumanAssignment: Boolean!
    hasCapacityLimits: Boolean!
    isActive: Boolean!
    sortOrder: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  
  # Resource-specific contact type to avoid conflicts
  type ResourceContact {
    id: ID!
    firstName: String!
    lastName: String!
    email: String!
    contactClassification: String!
  }
  
  # ================================================================
  # REQUEST INTERFACES
  # ================================================================
  
  input CreateResourceInput {
    resourceTypeId: ResourceType!
    name: String!
    displayName: String!
    description: String
    hexcolor: String
    iconName: String
    sequenceNo: Int
    contactId: String
    tags: [String]
    formSettings: JSON
    status: ResourceStatus
    isActive: Boolean
    isDeletable: Boolean
  }
  
  input UpdateResourceInput {
    name: String
    displayName: String
    description: String
    hexcolor: String
    iconName: String
    sequenceNo: Int
    tags: [String]
    formSettings: JSON
    status: ResourceStatus
    isActive: Boolean
    isDeletable: Boolean
  }
  
  # ================================================================
  # QUERY INTERFACES
  # ================================================================
  
  input ResourceQuery {
    filters: ResourceFilters
    sort: [ResourceSort]
    pagination: ResourcePaginationInput
  }
  
  input ResourceFilters {
    resourceTypeId: [ResourceType]
    status: [ResourceStatus]
    isActive: Boolean
    isLive: Boolean
    searchQuery: String
    contactId: String
    hasContact: Boolean
    createdAfter: String
    createdBefore: String
  }
  
  input ResourceSort {
    field: ResourceSortField!
    direction: SortDirection!
  }
  
  input ResourcePaginationInput {
    page: Int!
    limit: Int!
  }
  
  # ================================================================
  # RESPONSE TYPES - All uniquely named to avoid conflicts
  # ================================================================
  
  type CatalogResourceResponse {
    success: Boolean!
    data: CatalogResource
    message: String
    errors: [ResourceValidationError]
    warnings: [ResourceValidationError]
  }
  
  type CatalogResourceListResponse {
    success: Boolean!
    data: [CatalogResource]
    message: String
    errors: [ResourceValidationError]
    warnings: [ResourceValidationError]
    pagination: ResourcePaginationResponse
  }
  
  type ResourceTypesResponse {
    success: Boolean!
    data: [ResourceTypeMaster]
    message: String
    errors: [ResourceValidationError]
  }
  
  type ResourceValidationError {
    field: String!
    message: String!
  }
  
  type ResourcePaginationResponse {
    total: Int!
    page: Int!
    limit: Int!
    totalPages: Int!
  }
  
  # ================================================================
  # ROOT OPERATIONS
  # ================================================================
  
  extend type Query {
    # Get single resource
    catalogResource(id: ID!): CatalogResourceResponse!
    
    # Query resources with filtering
    catalogResources(query: ResourceQuery): CatalogResourceListResponse!
    
    # Get resources by type
    catalogResourcesByType(resourceType: ResourceType!): CatalogResourceListResponse!
    
    # Get resource types
    catalogResourceTypes: ResourceTypesResponse!
    
    # Get next sequence number
    nextCatalogResourceSequence(resourceType: ResourceType!): Int!
  }
  
  extend type Mutation {
    # Create resource
    createCatalogResource(input: CreateResourceInput!): CatalogResourceResponse!
    
    # Update resource
    updateCatalogResource(id: ID!, input: UpdateResourceInput!): CatalogResourceResponse!
    
    # Delete resource (soft delete)
    deleteCatalogResource(id: ID!): CatalogResourceResponse!
    
    # Bulk operations
    bulkCreateCatalogResources(input: [CreateResourceInput!]!): CatalogResourceListResponse!
    bulkUpdateCatalogResources(updates: [BulkUpdateCatalogResourceInput!]!): CatalogResourceListResponse!
    bulkDeleteCatalogResources(ids: [ID!]!): CatalogResourceResponse!
  }
  
  input BulkUpdateCatalogResourceInput {
    id: ID!
    input: UpdateResourceInput!
  }
`;  