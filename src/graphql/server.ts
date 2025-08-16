// src/graphql/server.ts
// ✅ PRODUCTION: Fixed Apollo Server setup with Express integration and environment segregation

import { ApolloServer } from 'apollo-server-express';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLScalarType } from 'graphql';
import { Kind } from 'graphql/language';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

// Schema imports
import { catalogTypeDefs } from './schema/catalog/types';
import { catalogResolvers } from './resolvers/catalog/catalogResolvers';

// ✅ UPDATED: Resource schema imports
import { resourceTypeDefs } from './schema/resource/types';
import { resourceResolvers } from './resolvers/resource/resourceResolvers';

// Service imports
import { CatalogService } from '../services/catalogService';
import { CatalogValidationService } from '../services/catalogValidationService';
import { CatalogServiceConfig } from '../types/catalog';

// ✅ UPDATED: Resource service imports
import { ResourceService } from '../services/resourceService';
import { ResourceValidator } from '../validators/resourceValidator';
import { ResourceServiceConfig } from '../types/resource';

// Security imports - HMAC removed for UI requests
import { AuthRequest } from '../middleware/auth';

// =================================================================
// CUSTOM SCALARS
// =================================================================

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'Date custom scalar type',
  serialize(value: any) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return new Date(value).toISOString();
    }
    throw new Error('Value must be a Date or ISO string');
  },
  parseValue(value: any) {
    if (typeof value === 'string') {
      return new Date(value);
    }
    throw new Error('Value must be an ISO string');
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value));
    }
    throw new Error('Value must be an ISO string or timestamp');
  }
});

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON custom scalar type',
  serialize(value: any) {
    return value;
  },
  parseValue(value: any) {
    return value;
  },
  parseLiteral(ast) {
    switch (ast.kind) {
      case Kind.STRING:
        try {
          return JSON.parse(ast.value);
        } catch {
          return ast.value;
        }
      case Kind.OBJECT:
        return ast.fields?.reduce((acc: any, field) => {
          acc[field.name.value] = field.value;
          return acc;
        }, {});
      case Kind.LIST:
        return ast.values;
      case Kind.INT:
        return parseInt(ast.value);
      case Kind.FLOAT:
        return parseFloat(ast.value);
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.NULL:
        return null;
      default:
        return null;
    }
  }
});

// =================================================================
// GRAPHQL CONTEXT INTERFACE
// =================================================================

export interface GraphQLContext {
  tenantId: string;
  userId: string;
  userJWT: string;
  isLive: boolean; // ✅ CRITICAL: Environment segregation
  environmentLabel: string;
  requestId: string;
  userRole?: string;
  clientVersion?: string;
  
  // Services
  catalogService: CatalogService;
  validationService: CatalogValidationService;
  resourceService: ResourceService;
  resourceValidator: ResourceValidator;
  
  // Infrastructure
  redis: Redis;
  req: any;
  res: Response;
}

// =================================================================
// CONTEXT CREATION
// =================================================================

/**
 * Extract environment context from request headers
 */
function extractEnvironmentContext(req: AuthRequest): {
  tenantId: string;
  userId: string;
  userJWT: string;
  isLive: boolean;
  environmentLabel: string;
  requestId: string;
  userRole?: string;
  clientVersion?: string;
} {
  // Extract tenant and user context
  const tenantId = req.headers['x-tenant-id'] as string || '';
  const userId = req.user?.id || '';
  const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
  const userRole = req.headers['x-user-role'] as string;
  const clientVersion = req.headers['x-client-version'] as string;

  // Determine environment from multiple sources
  const envHeader = req.headers['x-environment'] as string;
  const envParam = req.query.environment as string;
  
  // Default to production if not specified
  const environment = envHeader || envParam || 'production';
  const isLive = environment.toLowerCase() === 'production';
  const environmentLabel = isLive ? 'Production' : 'Test';

  // Generate request ID for tracking
  const requestId = randomUUID();

  console.log(`[GraphQL Context] ${environmentLabel} (is_live: ${isLive}) for tenant: ${tenantId}, request: ${requestId}`);

  return {
    tenantId,
    userId,
    userJWT,
    isLive,
    environmentLabel,
    requestId,
    userRole,
    clientVersion
  };
}

/**
 * Validate environment-specific permissions
 */
function validateEnvironmentPermissions(
  environmentContext: ReturnType<typeof extractEnvironmentContext>,
  operation: string
): { allowed: boolean; reason?: string } {
  // Production environment restrictions
  if (environmentContext.isLive) {
    // Only allow certain roles to modify production data
    const productionWriteRoles = ['admin', 'catalog_manager', 'system'];
    const isMutationOperation = operation.toLowerCase().includes('create') || 
                               operation.toLowerCase().includes('update') || 
                               operation.toLowerCase().includes('delete');
    
    if (isMutationOperation && 
        environmentContext.userRole && 
        !productionWriteRoles.includes(environmentContext.userRole)) {
      return {
        allowed: false,
        reason: 'Insufficient permissions for production environment mutations'
      };
    }
  }

  return { allowed: true };
}

/**
 * Create GraphQL context with services and environment info
 */
async function createContext({ req, res }: { req: AuthRequest & { ip?: string }; res: Response }) {
  // Extract environment context
  const envContext = extractEnvironmentContext(req);

  // Validate required context
  if (!envContext.tenantId) {
    throw new Error('Missing tenant context - x-tenant-id header is required');
  }

  if (!envContext.userId) {
    throw new Error('Missing user context - authenticated user is required');
  }

  // Initialize service configuration
  const catalogConfig: CatalogServiceConfig = {
    tenant_id: envContext.tenantId,
    user_id: envContext.userId,
    is_live: envContext.isLive // ✅ CRITICAL: Environment segregation
  };

  // ✅ UPDATED: Initialize resource service configuration
  const resourceConfig: ResourceServiceConfig = {
    tenant_id: envContext.tenantId,
    user_id: envContext.userId,
    is_live: envContext.isLive // ✅ CRITICAL: Environment segregation
  };

  // Initialize services
  const catalogService = new CatalogService(catalogConfig);
  const validationService = new CatalogValidationService(catalogConfig);
  
  // ✅ UPDATED: Initialize resource services
  const resourceService = new ResourceService(resourceConfig);
  const resourceValidator = new ResourceValidator(resourceConfig);

  console.log(`[GraphQL Context] Services initialized for ${envContext.environmentLabel} environment`);

  return {
    ...envContext,
    // Catalog services
    catalogService,
    validationService,
    // ✅ UPDATED: Resource services
    resourceService,
    resourceValidator,
    // Add Redis client for caching
    redis: new Redis(process.env.REDIS_URL || 'redis://localhost:6379'),
    // Add request and response context
    req: { ...req, ip: req.ip || 'unknown' },
    res
  };
}

// =================================================================
// SCHEMA COMPOSITION
// =================================================================

// ✅ UPDATED: Include resource types in schema
const typeDefs = [
  catalogTypeDefs,
  resourceTypeDefs,
  // Add additional type definitions here for future modules
];

// ✅ UPDATED: Merge all resolvers including resources
const resolvers = {
  // Custom scalars
  DateTime: DateTimeScalar,
  JSON: JSONScalar,
  
  // Merge Query resolvers
  Query: {
    ...catalogResolvers.Query,
    ...resourceResolvers.Query,
  },
  
  // Merge Mutation resolvers
  Mutation: {
    ...catalogResolvers.Mutation,
    ...resourceResolvers.Mutation,
  },
  
  // Include type-specific resolvers
  CatalogResource: resourceResolvers.CatalogResource,
  
  // Add additional resolvers here for future modules
};

// Create executable schema
const schema = makeExecutableSchema({
  typeDefs,
  resolvers
});

// =================================================================
// APOLLO SERVER CONFIGURATION
// =================================================================

/**
 * Create Apollo Server instance
 */
export function createApolloServer(): ApolloServer<any> {
  return new ApolloServer<any>({
    schema,
    context: createContext,
    
    // Security and performance settings
    introspection: process.env.NODE_ENV !== 'production',
    
    // Error handling
    formatError: (error) => {
      console.error('[GraphQL Error]:', error);
      
      // Don't expose internal errors in production
      if (process.env.NODE_ENV === 'production' && !error.extensions?.code) {
        return new Error('Internal server error');
      }
      
      return error;
    },
    
    // Request lifecycle hooks
    plugins: [
      {
        requestDidStart() {
          return Promise.resolve({
            async didResolveOperation(requestContext: any) {
              const operationName = requestContext.operationName || 'Unknown';
              const operation = requestContext.document?.definitions?.[0]?.kind || 'Unknown';
              
              console.log(`[GraphQL Operation] ${operation}: ${operationName}`);
            },
            
            async didEncounterErrors(requestContext: any) {
              console.error('[GraphQL Errors]:', requestContext.errors);
            }
          });
        }
      }
    ]
  });
}

// =================================================================
// EXPRESS MIDDLEWARE INTEGRATION
// =================================================================

/**
 * GraphQL middleware WITHOUT HMAC for UI requests
 * UI requests are authenticated via Supabase JWT tokens
 */
export async function graphqlMiddleware(req: AuthRequest, res: Response, next: any) {
  try {
    // ✅ NO HMAC VERIFICATION FOR UI REQUESTS
    // UI requests use Supabase authentication (JWT tokens)
    // HMAC is only used for internal Express → Edge communication
    
    console.log('[GraphQL Security] Skipping HMAC verification for UI request');

    // Extract environment context for permission validation
    const envContext = extractEnvironmentContext(req);
    
    // Validate environment permissions for mutations
    const operation = req.body?.operationName || req.body?.query || '';
    const permissionCheck = validateEnvironmentPermissions(envContext, operation);
    if (!permissionCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: permissionCheck.reason || 'Operation not allowed',
        code: 'INSUFFICIENT_PERMISSIONS',
        environment: envContext.environmentLabel
      });
    }

    next();
  } catch (error: any) {
    console.error('[GraphQL Middleware] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'MIDDLEWARE_ERROR'
    });
  }
}

// =================================================================
// EXAMPLE QUERIES FOR TESTING
// =================================================================

export const exampleQueries = {
  // ✅ UPDATED: Resource examples
  getResources: `
    query GetResources($query: ResourceQuery) {
      resources(query: $query) {
        success
        data {
          id
          name
          displayName
          resourceTypeId
          status
          contact {
            id
            firstName
            lastName
            email
          }
          environmentLabel
        }
        message
        pagination {
          total
          page
          limit
          totalPages
        }
      }
    }
  `,

  getResourcesByType: `
    query GetResourcesByType($resourceType: ResourceType!) {
      resourcesByType(resourceType: $resourceType) {
        success
        data {
          id
          name
          displayName
          sequenceNo
          status
          contact {
            firstName
            lastName
            email
          }
        }
        message
      }
    }
  `,

  createResource: `
    mutation CreateResource($input: CreateResourceInput!) {
      createResource(input: $input) {
        success
        data {
          id
          name
          displayName
          resourceTypeId
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
      }
    }
  `,

  // Get catalog items with resources
  getCatalogItemsWithResources: `
    query GetCatalogItems($filters: CatalogItemFilters, $pagination: PaginationInput) {
      catalogItems(filters: $filters, pagination: $pagination) {
        edges {
          node {
            id
            name
            type
            status
            resourceRequirements {
              teamStaff
              equipment
              consumables
              assets
              partners
            }
            linkedResources {
              id
              name
              resourceTypeId
              status
              contact {
                id
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
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
        totalCount
        summary {
          totalItems
          environmentLabel
          isLive
        }
      }
    }
  `,

  // Get single catalog item
  getCatalogItem: `
    query GetCatalogItem($id: ID!) {
      catalogItem(id: $id) {
        id
        name
        description: descriptionContent
        type
        status
        resourceRequirements {
          teamStaff
          equipment
          consumables
          assets
          partners
        }
        serviceAttributes {
          estimatedDuration
          complexityLevel
          requiresCustomerPresence
        }
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
        createdAt
        updatedAt
      }
    }
  `,

  // Get eligible contacts for team_staff
  getEligibleContacts: `
    query GetEligibleContacts($resourceType: ResourceType!) {
      eligibleContacts(resourceType: $resourceType) {
        success
        data {
          id
          displayName
          primaryEmail
          primaryPhone
          classifications
        }
        summary {
          totalEligible
          resourceType
        }
        environmentInfo {
          environmentLabel
          isLive
        }
      }
    }
  `,

  // Create catalog item with resources
  createCatalogItem: `
    mutation CreateCatalogItem($input: CreateCatalogItemInput!) {
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
          }
        }
        message
        environmentInfo {
          environmentLabel
          isLive
        }
      }
    }
  `,

  // Bulk create catalog items
  bulkCreateCatalogItems: `
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
  `
};

// =================================================================
// DATALOADER SETUP (for N+1 prevention)
// =================================================================

export class CatalogDataLoaders {
  private redis: Redis;
  
  constructor(redis: Redis) {
    this.redis = redis;
  }

  // TODO: Implement DataLoaders for:
  // - Batch loading contacts by IDs
  // - Batch loading resources by IDs  
  // - Batch loading pricing by resource IDs
  // - Batch loading child catalog items
  
  // Example DataLoader structure:
  // contactLoader = new DataLoader(async (contactIds: string[]) => {
  //   // Batch fetch contacts
  //   return batchLoadContacts(contactIds);
  // });
}

export default createApolloServer;