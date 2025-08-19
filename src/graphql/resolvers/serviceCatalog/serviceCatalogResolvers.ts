// src/graphql/resolvers/serviceCatalog/serviceCatalogResolvers.ts
// 🚀 Service Catalog GraphQL Resolvers - Bridge between GraphQL and Edge Functions

import { AuthRequest } from '../../../middleware/auth';
import { EdgeFunctionClient, EdgeFunctionResponse } from '../../../utils/edgeFunctionClient';
import { GraphQLError } from 'graphql';

// =================================================================
// CONTEXT INTERFACE
// =================================================================

interface ServiceCatalogGraphQLContext {
  tenantId: string;
  userId: string;
  userJWT: string;
  isLive: boolean;
  environmentLabel: string;
  requestId: string;
  userRole?: string;
  clientVersion?: string;
  
  // Service clients
  edgeFunctionClient: EdgeFunctionClient;
  
  // Infrastructure
  redis: any;
  req: AuthRequest;
  res: any;
}

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Transform GraphQL input to Edge Function format
 */
function transformGraphQLToEdgeFunction(input: any): any {
  // Convert GraphQL naming conventions to Edge Function format
  const transformed: any = {};
  
  Object.entries(input).forEach(([key, value]) => {
    // Convert camelCase to snake_case for Edge Function compatibility
    const snakeCaseKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      transformed[snakeCaseKey] = transformGraphQLToEdgeFunction(value);
    } else {
      transformed[snakeCaseKey] = value;
    }
  });
  
  return transformed;
}

/**
 * Transform Edge Function response to GraphQL format
 */
function transformEdgeFunctionToGraphQL(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(transformEdgeFunctionToGraphQL);
  }
  
  const transformed: any = {};
  
  Object.entries(data).forEach(([key, value]) => {
    // Convert snake_case to camelCase for GraphQL
    const camelCaseKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      transformed[camelCaseKey] = transformEdgeFunctionToGraphQL(value);
    } else {
      transformed[camelCaseKey] = value;
    }
  });
  
  return transformed;
}

/**
 * Create environment context for Edge Function calls
 */
function createEnvironmentContext(context: ServiceCatalogGraphQLContext): any {
  return {
    tenant_id: context.tenantId,
    user_id: context.userId,
    is_live: context.isLive,
    request_id: context.requestId,
    user_role: context.userRole,
    client_version: context.clientVersion
  };
}

/**
 * Handle Edge Function response and errors
 */
function handleEdgeFunctionResponse<T>(response: EdgeFunctionResponse<T>, operation: string): T {
  if (!response.success) {
    const error = response.error;
    console.error(`❌ Service Catalog ${operation} failed:`, error);
    
    throw new GraphQLError(error?.message || `${operation} failed`, {
      extensions: {
        code: error?.code || 'EDGE_FUNCTION_ERROR',
        details: error?.details,
        operation
      }
    });
  }
  
  if (!response.data) {
    throw new GraphQLError(`${operation} returned no data`, {
      extensions: {
        code: 'NO_DATA_RETURNED',
        operation
      }
    });
  }
  
  return response.data;
}

// =================================================================
// QUERY RESOLVERS
// =================================================================

const Query = {
  /**
   * Get single service catalog item
   */
  async serviceCatalogItem(
    _: any,
    { id }: { id: string },
    context: ServiceCatalogGraphQLContext
  ) {
    console.log(`🔍 GraphQL Query: serviceCatalogItem(${id})`);
    
    try {
      const environmentContext = createEnvironmentContext(context);
      const response = await context.edgeFunctionClient.getService(id, environmentContext);
      const data = handleEdgeFunctionResponse(response, 'getService');
      
      return {
        success: true,
        data: transformEdgeFunctionToGraphQL(data),
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel,
          cacheHit: response.metadata?.cacheHit || false,
          rateLimit: response.metadata?.rateLimit
        }
      };
    } catch (error: any) {
      console.error('❌ serviceCatalogItem resolver error:', error);
      
      return {
        success: false,
        data: null,
        message: error.message,
        errors: [{
          code: error.extensions?.code || 'RESOLVER_ERROR',
          message: error.message,
          context: { serviceId: id }
        }]
      };
    }
  },

  /**
   * Get multiple service catalog items with filtering and pagination
   */
  async serviceCatalogItems(
    _: any,
    { filters, sort, pagination }: { filters?: any; sort?: any[]; pagination?: any },
    context: ServiceCatalogGraphQLContext
  ) {
    console.log('🔍 GraphQL Query: serviceCatalogItems', { filters, sort, pagination });
    
    try {
      const environmentContext = createEnvironmentContext(context);
      
      // Transform GraphQL filters to Edge Function format
      const edgeFilters = filters ? transformGraphQLToEdgeFunction(filters) : {};
      
      // Add pagination parameters
      if (pagination) {
        edgeFilters.limit = pagination.limit || 50;
        edgeFilters.offset = pagination.offset || 0;
      }
      
      // Add sorting parameters
      if (sort && sort.length > 0) {
        edgeFilters.sort_by = sort[0].field?.toLowerCase();
        edgeFilters.sort_direction = sort[0].direction?.toLowerCase() || 'asc';
      }
      
      const response = await context.edgeFunctionClient.queryServices(edgeFilters, environmentContext);
      const data = handleEdgeFunctionResponse(response, 'queryServices');
      
      // Transform response to GraphQL connection format
      const transformedData = {
        edges: data.items?.map((item: any, index: number) => ({
          node: transformEdgeFunctionToGraphQL(item),
          cursor: Buffer.from(`${data.offset || 0 + index}`).toString('base64')
        })) || [],
        pageInfo: {
          hasNextPage: data.page_info?.has_next_page || false,
          hasPreviousPage: data.page_info?.has_prev_page || false,
          startCursor: data.items?.length > 0 ? Buffer.from('0').toString('base64') : null,
          endCursor: data.items?.length > 0 
            ? Buffer.from(`${data.items.length - 1}`).toString('base64') 
            : null
        },
        totalCount: data.total_count || 0,
        summary: {
          totalServices: data.total_count || 0,
          activeServices: data.active_count || 0,
          servicesByCategory: data.by_category || {},
          servicesByIndustry: data.by_industry || {},
          avgServicePrice: data.avg_price || 0,
          mostUsedServices: data.popular_services || [],
          environmentLabel: context.environmentLabel,
          isLive: context.isLive
        }
      };
      
      return {
        success: true,
        data: transformedData,
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel,
          cacheHit: response.metadata?.cacheHit || false
        }
      };
    } catch (error: any) {
      console.error('❌ serviceCatalogItems resolver error:', error);
      
      return {
        success: false,
        data: {
          edges: [],
          pageInfo: { hasNextPage: false, hasPreviousPage: false },
          totalCount: 0,
          summary: {
            totalServices: 0,
            activeServices: 0,
            servicesByCategory: {},
            servicesByIndustry: {},
            avgServicePrice: 0,
            mostUsedServices: [],
            environmentLabel: context.environmentLabel,
            isLive: context.isLive
          }
        },
        message: error.message
      };
    }
  },

  /**
   * Get service catalog master data
   */
  async serviceCatalogMasterData(
    _: any,
    args: any,
    context: ServiceCatalogGraphQLContext
  ) {
    console.log('🔍 GraphQL Query: serviceCatalogMasterData');
    
    try {
      const environmentContext = createEnvironmentContext(context);
      const response = await context.edgeFunctionClient.getMasterData(environmentContext);
      const data = handleEdgeFunctionResponse(response, 'getMasterData');
      
      return {
        success: true,
        data: transformEdgeFunctionToGraphQL(data),
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel,
          cacheHit: response.metadata?.cacheHit || false
        }
      };
    } catch (error: any) {
      console.error('❌ serviceCatalogMasterData resolver error:', error);
      
      return {
        success: false,
        data: null,
        message: error.message,
        errors: [{
          code: error.extensions?.code || 'RESOLVER_ERROR',
          message: error.message
        }]
      };
    }
  },

  /**
   * Get available resources for service association
   */
  async availableResources(
    _: any,
    { filters, pagination }: { filters?: any; pagination?: any },
    context: ServiceCatalogGraphQLContext
  ) {
    console.log('🔍 GraphQL Query: availableResources', { filters, pagination });
    
    try {
      const environmentContext = createEnvironmentContext(context);
      const edgeFilters = filters ? transformGraphQLToEdgeFunction(filters) : {};
      
      if (pagination) {
        edgeFilters.limit = pagination.limit || 50;
        edgeFilters.offset = pagination.offset || 0;
      }
      
      const response = await context.edgeFunctionClient.getAvailableResources(edgeFilters, environmentContext);
      const data = handleEdgeFunctionResponse(response, 'getAvailableResources');
      
      return {
        success: true,
        data: transformEdgeFunctionToGraphQL(data.items || []),
        totalCount: data.total_count || 0,
        matchingCriteria: transformEdgeFunctionToGraphQL(data.matching_criteria || {}),
        searchFilters: filters || {},
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel
        }
      };
    } catch (error: any) {
      console.error('❌ availableResources resolver error:', error);
      
      return {
        success: false,
        data: [],
        totalCount: 0,
        matchingCriteria: {},
        searchFilters: filters || {},
        message: error.message
      };
    }
  },

  /**
   * Get resources associated with a service
   */
  async serviceResources(
    _: any,
    { serviceId }: { serviceId: string },
    context: ServiceCatalogGraphQLContext
  ) {
    console.log(`🔍 GraphQL Query: serviceResources(${serviceId})`);
    
    try {
      const environmentContext = createEnvironmentContext(context);
      const response = await context.edgeFunctionClient.getServiceResources(serviceId, environmentContext);
      const data = handleEdgeFunctionResponse(response, 'getServiceResources');
      
      return {
        success: true,
        data: transformEdgeFunctionToGraphQL(data),
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel
        }
      };
    } catch (error: any) {
      console.error('❌ serviceResources resolver error:', error);
      
      return {
        success: false,
        data: null,
        message: error.message
      };
    }
  },

  /**
   * Service catalog health check
   */
  async serviceCatalogHealth(
    _: any,
    args: any,
    context: ServiceCatalogGraphQLContext
  ) {
    console.log('🔍 GraphQL Query: serviceCatalogHealth');
    
    try {
      const response = await context.edgeFunctionClient.healthCheck();
      const clientMetrics = context.edgeFunctionClient.getMetrics();
      
      return {
        status: response.success ? 'healthy' : 'unhealthy',
        service: 'service-catalog-graphql',
        version: '1.0.0',
        environmentInfo: {
          tenantId: context.tenantId,
          userId: context.userId,
          isLive: context.isLive,
          requestId: context.requestId,
          timestamp: new Date().toISOString()
        },
        features: {
          multiCurrencyPricing: true,
          tieredPricing: true,
          discountRules: true,
          resourceAssociation: true,
          bulkOperations: true,
          auditTrails: true,
          caching: true,
          rateLimiting: true
        },
        endpoints: {
          createService: '/api/graphql (createServiceCatalogItem)',
          updateService: '/api/graphql (updateServiceCatalogItem)',
          deleteService: '/api/graphql (deleteServiceCatalogItem)',
          queryServices: '/api/graphql (serviceCatalogItems)',
          bulkOperations: '/api/graphql (bulkCreateServiceCatalogItems)',
          masterData: '/api/graphql (serviceCatalogMasterData)',
          resources: '/api/graphql (availableResources)'
        },
        performance: {
          avgResponseTimeMs: clientMetrics.avgDuration,
          cacheHitRate: 0, // TODO: Implement cache hit rate tracking
          requestsPerMinute: 0, // TODO: Implement request rate tracking
          errorRate: 100 - clientMetrics.successRate
        }
      };
    } catch (error: any) {
      console.error('❌ serviceCatalogHealth resolver error:', error);
      
      return {
        status: 'unhealthy',
        service: 'service-catalog-graphql',
        version: '1.0.0',
        environmentInfo: {
          tenantId: context.tenantId,
          userId: context.userId,
          isLive: context.isLive,
          requestId: context.requestId,
          timestamp: new Date().toISOString()
        },
        features: {
          multiCurrencyPricing: false,
          tieredPricing: false,
          discountRules: false,
          resourceAssociation: false,
          bulkOperations: false,
          auditTrails: false,
          caching: false,
          rateLimiting: false
        },
        endpoints: {},
        performance: {
          avgResponseTimeMs: 0,
          cacheHitRate: 0,
          requestsPerMinute: 0,
          errorRate: 100
        }
      };
    }
  }
};

// =================================================================
// MUTATION RESOLVERS
// =================================================================

const Mutation = {
  /**
   * Create new service catalog item
   */
  async createServiceCatalogItem(
    _: any,
    { input }: { input: any },
    context: ServiceCatalogGraphQLContext
  ) {
    console.log('🔨 GraphQL Mutation: createServiceCatalogItem', { serviceName: input.serviceName });
    
    try {
      const environmentContext = createEnvironmentContext(context);
      const edgeInput = transformGraphQLToEdgeFunction(input);
      
      const response = await context.edgeFunctionClient.createService(edgeInput, environmentContext);
      const data = handleEdgeFunctionResponse(response, 'createService');
      
      return {
        success: true,
        data: transformEdgeFunctionToGraphQL(data),
        message: 'Service catalog item created successfully',
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel
        }
      };
    } catch (error: any) {
      console.error('❌ createServiceCatalogItem resolver error:', error);
      
      return {
        success: false,
        data: null,
        message: error.message,
        errors: [{
          code: error.extensions?.code || 'CREATION_ERROR',
          message: error.message,
          context: { serviceName: input.serviceName }
        }]
      };
    }
  },

  /**
   * Update existing service catalog item
   */
  async updateServiceCatalogItem(
    _: any,
    { id, input }: { id: string; input: any },
    context: ServiceCatalogGraphQLContext
  ) {
    console.log(`🔄 GraphQL Mutation: updateServiceCatalogItem(${id})`, { serviceName: input.serviceName });
    
    try {
      const environmentContext = createEnvironmentContext(context);
      const edgeInput = transformGraphQLToEdgeFunction(input);
      
      const response = await context.edgeFunctionClient.updateService(id, edgeInput, environmentContext);
      const data = handleEdgeFunctionResponse(response, 'updateService');
      
      return {
        success: true,
        data: transformEdgeFunctionToGraphQL(data),
        message: 'Service catalog item updated successfully',
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel
        }
      };
    } catch (error: any) {
      console.error('❌ updateServiceCatalogItem resolver error:', error);
      
      return {
        success: false,
        data: null,
        message: error.message,
        errors: [{
          code: error.extensions?.code || 'UPDATE_ERROR',
          message: error.message,
          context: { serviceId: id }
        }]
      };
    }
  },

  /**
   * Delete service catalog item
   */
  async deleteServiceCatalogItem(
    _: any,
    { id }: { id: string },
    context: ServiceCatalogGraphQLContext
  ) {
    console.log(`🗑️ GraphQL Mutation: deleteServiceCatalogItem(${id})`);
    
    try {
      const environmentContext = createEnvironmentContext(context);
      const response = await context.edgeFunctionClient.deleteService(id, environmentContext);
      const data = handleEdgeFunctionResponse(response, 'deleteService');
      
      return {
        success: true,
        data: data,
        message: 'Service catalog item deleted successfully',
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel
        }
      };
    } catch (error: any) {
      console.error('❌ deleteServiceCatalogItem resolver error:', error);
      
      return {
        success: false,
        data: null,
        message: error.message,
        errors: [{
          code: error.extensions?.code || 'DELETION_ERROR',
          message: error.message,
          context: { serviceId: id }
        }]
      };
    }
  },

  /**
   * Bulk create service catalog items
   */
  async bulkCreateServiceCatalogItems(
    _: any,
    { input }: { input: any },
    context: ServiceCatalogGraphQLContext
  ) {
    console.log('📦 GraphQL Mutation: bulkCreateServiceCatalogItems', { itemsCount: input.items?.length });
    
    try {
      const environmentContext = createEnvironmentContext(context);
      const edgeInput = transformGraphQLToEdgeFunction(input);
      
      const response = await context.edgeFunctionClient.bulkCreateServices(edgeInput, environmentContext);
      const data = handleEdgeFunctionResponse(response, 'bulkCreateServices');
      
      return {
        success: true,
        data: transformEdgeFunctionToGraphQL(data),
        message: `Bulk operation completed: ${data.success_count} successful, ${data.error_count} failed`,
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel
        }
      };
    } catch (error: any) {
      console.error('❌ bulkCreateServiceCatalogItems resolver error:', error);
      
      return {
        success: false,
        data: {
          successCount: 0,
          errorCount: input.items?.length || 0,
          totalCount: input.items?.length || 0,
          successfulItems: [],
          failedItems: [],
          batchId: input.batchId || 'unknown',
          processingTimeMs: 0
        },
        message: error.message
      };
    }
  },

  /**
   * Associate resources with a service
   */
  async associateServiceResources(
    _: any,
    { input }: { input: any },
    context: ServiceCatalogGraphQLContext
  ) {
    console.log('🔗 GraphQL Mutation: associateServiceResources', { 
      serviceId: input.serviceId,
      resourcesCount: input.resourceAssociations?.length 
    });
    
    try {
      const environmentContext = createEnvironmentContext(context);
      const edgeInput = transformGraphQLToEdgeFunction(input);
      
      const response = await context.edgeFunctionClient.associateServiceResources(edgeInput, environmentContext);
      const data = handleEdgeFunctionResponse(response, 'associateServiceResources');
      
      return {
        success: true,
        data: transformEdgeFunctionToGraphQL(data),
        message: 'Service resources associated successfully',
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel
        }
      };
    } catch (error: any) {
      console.error('❌ associateServiceResources resolver error:', error);
      
      return {
        success: false,
        data: null,
        message: error.message,
        errors: [{
          code: error.extensions?.code || 'ASSOCIATION_ERROR',
          message: error.message,
          context: { serviceId: input.serviceId }
        }]
      };
    }
  },

  /**
   * Update service pricing
   */
  async updateServicePricing(
    _: any,
    { input }: { input: any },
    context: ServiceCatalogGraphQLContext
  ) {
    console.log('💰 GraphQL Mutation: updateServicePricing', { serviceId: input.serviceId });
    
    try {
      const environmentContext = createEnvironmentContext(context);
      const edgeInput = transformGraphQLToEdgeFunction(input);
      
      const response = await context.edgeFunctionClient.updateServicePricing(edgeInput, environmentContext);
      const data = handleEdgeFunctionResponse(response, 'updateServicePricing');
      
      return {
        success: true,
        data: transformEdgeFunctionToGraphQL(data),
        message: 'Service pricing updated successfully',
        metadata: {
          requestId: context.requestId,
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: context.environmentLabel
        }
      };
    } catch (error: any) {
      console.error('❌ updateServicePricing resolver error:', error);
      
      return {
        success: false,
        data: null,
        message: error.message,
        errors: [{
          code: error.extensions?.code || 'PRICING_UPDATE_ERROR',
          message: error.message,
          context: { serviceId: input.serviceId }
        }]
      };
    }
  }
};

// =================================================================
// EXPORT RESOLVERS
// =================================================================

export const serviceCatalogResolvers = {
  Query,
  Mutation
};

export default serviceCatalogResolvers;