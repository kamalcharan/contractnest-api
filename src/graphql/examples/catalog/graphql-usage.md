// examples/graphql-usage.md
// ✅ PRODUCTION: Complete GraphQL usage examples for catalog management

## GraphQL Catalog API Usage Examples

### Environment Setup

All GraphQL requests require proper headers for authentication and environment context:

```javascript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer <JWT_TOKEN>',
  'x-tenant-id': '<TENANT_ID>',
  'x-environment': 'production', // or 'test'
  'x-hmac-signature': '<HMAC_SIGNATURE>',
  'x-timestamp': '<TIMESTAMP>'
};
```

### 1. Query Catalog Items with Resources

```graphql
query GetCatalogItemsWithResources {
  catalogItems(
    filters: {
      type: [SERVICE]
      status: [ACTIVE]
      hasResources: true
      complexityLevel: [MEDIUM, HIGH]
    }
    pagination: { first: 20 }
    sort: [{ field: CREATED_AT, direction: DESC }]
  ) {
    edges {
      node {
        id
        name
        type
        status
        environmentLabel
        
        # Resource composition
        resourceRequirements {
          teamStaff
          equipment
          consumables
          assets
          partners
        }
        
        # Linked resources with details
        linkedResources {
          id
          name
          resourceTypeId
          status
          
          # Contact info for team_staff
          contact {
            id
            displayName
            primaryEmail
            primaryPhone
            classifications
          }
          
          # Pricing information
          pricing {
            id
            currency
            rate
            pricingType
            taxIncluded
          }
        }
        
        # Service attributes
        serviceAttributes {
          estimatedDuration
          complexityLevel
          requiresCustomerPresence
          locationRequirements
        }
        
        # Pricing
        priceAttributes {
          type
          baseAmount
          currency
          billingMode
          resourceBasedPricing
        }
        
        # Audit info
        createdAt
        updatedAt
        createdBy
      }
    }
    
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    
    totalCount
    
    summary {
      totalItems
      byType
      byStatus
      withResources
      environmentLabel
      isLive
    }
  }
}
```

### 2. Get Single Catalog Item with Full Details

```graphql
query GetCatalogItemDetails($id: ID!) {
  catalogItem(id: $id) {
    id
    name
    shortDescription
    descriptionContent
    descriptionFormat
    type
    status
    
    # Hierarchy
    parent {
      id
      name
    }
    children {
      id
      name
      isVariant
    }
    isVariant
    variantAttributes
    
    # Resource composition
    resourceRequirements {
      teamStaff
      equipment
      consumables
      assets
      partners
    }
    
    resourceRequirementsDetails {
      id
      requirementType
      quantityNeeded
      usageDuration
      usageNotes
      costOverride
      costCurrency
      
      resource {
        id
        name
        resourceTypeId
        contact {
          displayName
          primaryEmail
        }
      }
    }
    
    # Service attributes
    serviceAttributes {
      estimatedDuration
      complexityLevel
      requiresCustomerPresence
      locationRequirements
      schedulingConstraints
    }
    
    # Pricing
    priceAttributes {
      type
      baseAmount
      currency
      billingMode
      hourlyRate
      dailyRate
      resourceBasedPricing
      resourceCostIncluded
    }
    
    pricingList {
      id
      currency
      price
      taxIncluded
      isBaseCurrency
    }
    
    estimatedResourceCost
    
    # Tax configuration
    taxConfig {
      useTenantDefault
      displayMode
      specificTaxRates
      taxExempt
      exemptionReason
    }
    
    # Metadata
    metadata
    specifications
    
    # Environment
    environmentLabel
    
    # Audit
    createdAt
    updatedAt
    createdBy
    updatedBy
  }
}
```

### 3. Get Eligible Contacts for Resource Assignment

```graphql
query GetEligibleContacts($resourceType: ResourceType!) {
  eligibleContacts(resourceType: $resourceType) {
    success
    data {
      id
      displayName
      primaryEmail
      primaryPhone
      type
      status
      classifications
    }
    summary {
      totalEligible
      resourceType
    }
    environmentInfo {
      environmentLabel
      isLive
      tenantId
    }
  }
}

# Variables:
{
  "resourceType": "TEAM_STAFF"
}
```

### 4. Create Catalog Item with Resources

```graphql
mutation CreateCatalogItemWithResources($input: CreateCatalogItemInput!) {
  createCatalogItem(input: $input) {
    success
    data {
      id
      name
      type
      status
      
      linkedResources {
        id
        name
        resourceTypeId
        contact {
          displayName
          primaryEmail
        }
      }
      
      priceAttributes {
        type
        baseAmount
        currency
      }
      
      environmentLabel
    }
    message
    errors {
      field
      message
    }
    warnings {
      field
      message
    }
    environmentInfo {
      environmentLabel
      isLive
      tenantId
      requestId
    }
  }
}

# Variables:
{
  "input": {
    "name": "Technical Consultation - Senior Developer",
    "type": "SERVICE",
    "shortDescription": "Expert technical consultation for complex projects",
    "descriptionContent": "Comprehensive technical consultation service providing expert guidance on architecture, implementation, and best practices.",
    "descriptionFormat": "MARKDOWN",
    
    "priceAttributes": {
      "type": "HOURLY",
      "baseAmount": 150.00,
      "currency": "USD",
      "billingMode": "manual",
      "resourceBasedPricing": true,
      "resourceCostIncluded": false
    },
    
    "serviceAttributes": {
      "estimatedDuration": 120,
      "complexityLevel": "HIGH",
      "requiresCustomerPresence": false,
      "locationRequirements": ["remote", "client_site"]
    },
    
    "resourceRequirements": {
      "teamStaff": [],
      "equipment": ["laptop", "development_tools"],
      "consumables": [],
      "assets": [],
      "partners": []
    },
    
    "resources": [
      {
        "resourceTypeId": "TEAM_STAFF",
        "name": "Senior Developer - John Doe",
        "description": "Senior full-stack developer with 10+ years experience",
        "contactId": "contact-uuid-123",
        "attributes": {
          "skills": ["react", "node.js", "graphql", "postgresql"],
          "experience_years": 10,
          "certifications": ["aws-certified"]
        },
        "pricing": [
          {
            "pricingType": "HOURLY",
            "currency": "USD",
            "rate": 120.00,
            "minimumCharge": 60.00,
            "taxIncluded": false
          }
        ]
      }
    ],
    
    "taxConfig": {
      "useTenantDefault": true,
      "taxExempt": false
    },
    
    "metadata": {
      "category": "consulting",
      "tags": ["technical", "architecture", "development"]
    }
  }
}
```

### 5. Update Catalog Item with Resource Management

```graphql
mutation UpdateCatalogItemWithResources($id: ID!, $input: UpdateCatalogItemInput!) {
  updateCatalogItem(id: $id, input: $input) {
    success
    data {
      id
      name
      linkedResources {
        id
        name
        resourceTypeId
      }
    }
    message
    environmentInfo {
      environmentLabel
      requestId
    }
  }
}

# Variables:
{
  "id": "catalog-item-uuid-123",
  "input": {
    "name": "Updated Technical Consultation",
    "serviceAttributes": {
      "estimatedDuration": 90,
      "complexityLevel": "EXPERT"
    },
    "addResources": [
      {
        "resourceTypeId": "EQUIPMENT",
        "name": "High-Performance Laptop",
        "description": "MacBook Pro M2 for development work",
        "attributes": {
          "model": "MacBook Pro M2",
          "specs": "32GB RAM, 1TB SSD"
        }
      }
    ],
    "removeResources": ["old-resource-uuid"],
    "versionReason": "Added equipment requirements and updated duration"
  }
}
```

### 6. Bulk Operations

```graphql
mutation BulkCreateCatalogItems($input: BulkCreateCatalogItemsInput!) {
  bulkCreateCatalogItems(input: $input) {
    success
    message
    data {
      totalRequested
      totalSuccessful
      totalFailed
      
      successful {
        index
        id
        name
      }
      
      failed {
        index
        name
        errors {
          field
          message
        }
      }
    }
    environmentInfo {
      environmentLabel
      isLive
    }
  }
}

# Variables:
{
  "input": {
    "items": [
      {
        "name": "Basic Consultation",
        "type": "SERVICE",
        "priceAttributes": {
          "type": "HOURLY",
          "baseAmount": 75.00,
          "currency": "USD",
          "billingMode": "manual"
        }
      },
      {
        "name": "Advanced Consultation",
        "type": "SERVICE",
        "priceAttributes": {
          "type": "HOURLY",
          "baseAmount": 125.00,
          "currency": "USD",
          "billingMode": "manual"
        }
      }
    ]
  }
}
```

### 7. Get Resources with Filtering

```graphql
query GetResourcesWithFiltering {
  resources(
    filters: {
      resourceType: [TEAM_STAFF, EQUIPMENT]
      status: [ACTIVE]
      hasContact: true
    }
    pagination: { first: 50 }
    sort: [{ field: NAME, direction: ASC }]
  ) {
    edges {
      node {
        id
        name
        resourceTypeId
        status
        
        contact {
          id
          displayName
          primaryEmail
          classifications
        }
        
        pricing {
          id
          pricingType
          currency
          rate
          effectiveFrom
          effectiveTo
        }
        
        linkedServices {
          id
          name
          type
        }
        
        attributes
        createdAt
      }
    }
    
    summary {
      totalResources
      byType
      byStatus
      withPricing
      teamStaffWithContacts
      environmentLabel
    }
  }
}
```

### 8. Tenant Configuration

```graphql
query GetTenantConfig {
  tenantConfig {
    environmentInfo {
      isLive
      environmentLabel
      tenantId
    }
    
    supportedFeatures {
      resourceTypes
      catalogTypes
      supportedCurrencies
      complexityLevels
      pricingTypes
      resourcePricingTypes
    }
    
    limits {
      bulkCreate
      bulkUpdate
      bulkDelete
      queryLimit
      descriptionLength
      termsLength
    }
    
    contactClassifications {
      teamStaff
      partner
    }
  }
}
```

### 9. Health Check

```graphql
query HealthCheck {
  healthCheck {
    status
    environmentInfo {
      environmentLabel
      isLive
      timestamp
    }
    service
    version
    features {
      resourceComposition
      environmentSegregation
      contactIntegration
      multiCurrencyPricing
      bulkOperations
    }
  }
}
```

## Error Handling

GraphQL errors follow this structure:

```javascript
{
  "errors": [
    {
      "message": "Validation failed",
      "extensions": {
        "code": "VALIDATION_ERROR",
        "validationErrors": [
          {
            "field": "name",
            "message": "Name is required"
          }
        ]
      }
    }
  ],
  "data": null
}
```

## Environment-Specific Behavior

### Production Environment (`x-environment: production`)
- Stricter rate limits (100 requests/15min)
- Role-based mutation permissions
- No introspection or playground
- Enhanced security validation

### Test Environment (`x-environment: test`)  
- Relaxed rate limits (200 requests/15min)
- Full access to all operations
- Introspection and playground available
- Development tools accessible

## Frontend Integration Example

```typescript
// Apollo Client setup
import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

const httpLink = createHttpLink({
  uri: 'https://api.contractnest.com/api/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('authToken');
  const tenantId = localStorage.getItem('tenantId');
  const environment = process.env.NODE_ENV === 'production' ? 'production' : 'test';
  
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
      'x-tenant-id': tenantId,
      'x-environment': environment,
      'x-hmac-signature': generateHMAC(/* request data */),
      'x-timestamp': Date.now().toString()
    }
  }
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache()
});
```