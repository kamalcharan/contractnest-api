// src/services/serviceCatalogGraphQLService.ts
// 🚀 Service Catalog GraphQL Service - High-level service layer for Service Catalog operations

import { EdgeFunctionClient, createEdgeFunctionClient } from '../utils/edgeFunctionClient';
import {
  ServiceCatalogItem,
  ServiceCatalogResponse,
  ServiceCatalogListResponse,
  MasterDataResponse,
  ResourceSearchResponse,
  ServiceResourceSummaryResponse,
  BulkOperationResponse,
  CreateServiceCatalogItemInput,
  UpdateServiceCatalogItemInput,
  ServiceCatalogFilters,
  ServiceCatalogSort,
  PaginationInput,
  ResourceSearchFilters,
  BulkCreateServiceCatalogItemsInput,
  BulkUpdateServiceCatalogItemsInput,
  AssociateServiceResourcesInput,
  UpdateServicePricingInput,
  EnvironmentContext,
  ServiceCatalogHealthCheck,
  ServiceCatalogMetrics
} from '../types/serviceCatalogGraphQL';

// =================================================================
// SERVICE CONFIGURATION
// =================================================================

export interface ServiceCatalogConfig {
  edgeFunctionUrl?: string;
  hmacSecret?: string;
  timeout?: number;
  retryAttempts?: number;
  enableCaching?: boolean;
  cacheTtl?: number;
  enableLogging?: boolean;
  environment: 'production' | 'test';
}

export interface ServiceCatalogServiceContext {
  tenantId: string;
  userId: string;
  isLive: boolean;
  requestId?: string;
  userRole?: string;
  clientVersion?: string;
}

// =================================================================
// SERVICE CATALOG GRAPHQL SERVICE CLASS
// =================================================================

export class ServiceCatalogGraphQLService {
  private edgeFunctionClient: EdgeFunctionClient;
  private config: ServiceCatalogConfig;
  private cache: Map<string, { data: any; expiry: number }> = new Map();

  constructor(config: ServiceCatalogConfig) {
    this.config = config;
    this.edgeFunctionClient = createEdgeFunctionClient({
      baseUrl: config.edgeFunctionUrl,
      hmacSecret: config.hmacSecret,
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      enableLogging: config.enableLogging !== false,
      environment: config.environment
    });

    console.log(`🚀 ServiceCatalogGraphQLService initialized for ${config.environment} environment`);
  }

  // =================================================================
  // QUERY OPERATIONS
  // =================================================================

  /**
   * Get single service catalog item by ID
   */
  async getServiceCatalogItem(
    id: string, 
    context: ServiceCatalogServiceContext
  ): Promise<ServiceCatalogResponse<ServiceCatalogItem>> {
    console.log(`🔍 ServiceCatalogGraphQLService.getServiceCatalogItem(${id})`);

    try {
      const cacheKey = `service:${context.tenantId}:${context.isLive}:${id}`;
      
      // Check cache first
      if (this.config.enableCaching) {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          console.log(`✅ Cache hit for service ${id}`);
          return {
            success: true,
            data: cached,
            metadata: {
              requestId: context.requestId || this.generateRequestId(),
              executionTimeMs: 0,
              environment: this.config.environment,
              cacheHit: true
            }
          };
        }
      }

      const environmentContext = this.createEnvironmentContext(context);
      const response = await this.edgeFunctionClient.getService(id, environmentContext);

      if (!response.success) {
        return {
          success: false,
          message: response.error?.message || 'Failed to get service catalog item',
          errors: [{
            code: response.error?.code || 'GET_SERVICE_ERROR',
            message: response.error?.message || 'Unknown error',
            context: { serviceId: id }
          }]
        };
      }

      // Cache the result
      if (this.config.enableCaching && response.data) {
        this.setCache(cacheKey, response.data);
      }

      return {
        success: true,
        data: response.data,
        metadata: {
          requestId: context.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment,
          cacheHit: false,
          rateLimit: response.metadata?.rateLimit
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.getServiceCatalogItem error:', error);
      
      return {
        success: false,
        message: 'Internal service error',
        errors: [{
          code: 'INTERNAL_SERVICE_ERROR',
          message: error.message,
          context: { serviceId: id }
        }]
      };
    }
  }

  /**
   * Get multiple service catalog items with filtering and pagination
   */
  async getServiceCatalogItems(
    filters?: ServiceCatalogFilters,
    sort?: ServiceCatalogSort[],
    pagination?: PaginationInput,
    context?: ServiceCatalogServiceContext
  ): Promise<ServiceCatalogListResponse> {
    console.log('🔍 ServiceCatalogGraphQLService.getServiceCatalogItems', { filters, sort, pagination });

    try {
      const cacheKey = `services:${context?.tenantId}:${context?.isLive}:${this.hashFilters(filters, sort, pagination)}`;
      
      // Check cache first
      if (this.config.enableCaching) {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          console.log('✅ Cache hit for service list');
          return {
            success: true,
            data: cached,
            metadata: {
              requestId: context?.requestId || this.generateRequestId(),
              executionTimeMs: 0,
              environment: this.config.environment,
              cacheHit: true
            }
          };
        }
      }

      const environmentContext = context ? this.createEnvironmentContext(context) : undefined;
      
      // Prepare query parameters
      const queryFilters: any = {};
      
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryFilters[key] = value;
          }
        });
      }

      if (pagination) {
        queryFilters.limit = pagination.limit || 50;
        queryFilters.offset = pagination.offset || 0;
      }

      if (sort && sort.length > 0) {
        queryFilters.sort_by = sort[0].field;
        queryFilters.sort_direction = sort[0].direction || 'ASC';
      }

      const response = await this.edgeFunctionClient.queryServices(queryFilters, environmentContext);

      if (!response.success) {
        return {
          success: false,
          message: response.error?.message || 'Failed to get service catalog items',
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
              environmentLabel: this.config.environment,
              isLive: context?.isLive || false
            }
          }
        };
      }

      // Transform response to GraphQL connection format
      const connectionData = this.transformToConnectionFormat(response.data, pagination);
      
      // Cache the result
      if (this.config.enableCaching) {
        this.setCache(cacheKey, connectionData);
      }

      return {
        success: true,
        data: connectionData,
        metadata: {
          requestId: context?.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment,
          cacheHit: false
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.getServiceCatalogItems error:', error);
      
      return {
        success: false,
        message: 'Internal service error',
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
            environmentLabel: this.config.environment,
            isLive: context?.isLive || false
          }
        }
      };
    }
  }

  /**
   * Get service catalog master data
   */
  async getMasterData(context: ServiceCatalogServiceContext): Promise<MasterDataResponse> {
    console.log('🔍 ServiceCatalogGraphQLService.getMasterData');

    try {
      const cacheKey = `masterData:${context.tenantId}:${context.isLive}`;
      
      // Check cache first
      if (this.config.enableCaching) {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          console.log('✅ Cache hit for master data');
          return {
            success: true,
            data: cached,
            metadata: {
              requestId: context.requestId || this.generateRequestId(),
              executionTimeMs: 0,
              environment: this.config.environment,
              cacheHit: true
            }
          };
        }
      }

      const environmentContext = this.createEnvironmentContext(context);
      const response = await this.edgeFunctionClient.getMasterData(environmentContext);

      if (!response.success) {
        return {
          success: false,
          message: response.error?.message || 'Failed to get master data'
        };
      }

      // Cache the result with longer TTL for master data
      if (this.config.enableCaching && response.data) {
        this.setCache(cacheKey, response.data, (this.config.cacheTtl || 300) * 2); // 2x normal TTL
      }

      return {
        success: true,
        data: response.data,
        metadata: {
          requestId: context.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment,
          cacheHit: false
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.getMasterData error:', error);
      
      return {
        success: false,
        message: 'Internal service error'
      };
    }
  }

  /**
   * Get available resources for service association
   */
  async getAvailableResources(
    filters?: ResourceSearchFilters,
    pagination?: PaginationInput,
    context?: ServiceCatalogServiceContext
  ): Promise<ResourceSearchResponse> {
    console.log('🔍 ServiceCatalogGraphQLService.getAvailableResources', { filters, pagination });

    try {
      const environmentContext = context ? this.createEnvironmentContext(context) : undefined;
      
      const queryFilters: any = {};
      
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryFilters[key] = value;
          }
        });
      }

      if (pagination) {
        queryFilters.limit = pagination.limit || 50;
        queryFilters.offset = pagination.offset || 0;
      }

      const response = await this.edgeFunctionClient.getAvailableResources(queryFilters, environmentContext);

      if (!response.success) {
        return {
          success: false,
          data: [],
          totalCount: 0,
          matchingCriteria: {
            totalResources: 0,
            skillMatches: 0,
            locationMatches: 0,
            availabilityMatches: 0,
            costMatches: 0
          },
          searchFilters: filters || {}
        };
      }

      return {
        success: true,
        data: response.data.items || [],
        totalCount: response.data.total_count || 0,
        matchingCriteria: response.data.matching_criteria || {
          totalResources: 0,
          skillMatches: 0,
          locationMatches: 0,
          availabilityMatches: 0,
          costMatches: 0
        },
        searchFilters: filters || {},
        metadata: {
          requestId: context?.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.getAvailableResources error:', error);
      
      return {
        success: false,
        data: [],
        totalCount: 0,
        matchingCriteria: {
          totalResources: 0,
          skillMatches: 0,
          locationMatches: 0,
          availabilityMatches: 0,
          costMatches: 0
        },
        searchFilters: filters || {}
      };
    }
  }

  /**
   * Get resources associated with a service
   */
  async getServiceResources(
    serviceId: string,
    context: ServiceCatalogServiceContext
  ): Promise<ServiceResourceSummaryResponse> {
    console.log(`🔍 ServiceCatalogGraphQLService.getServiceResources(${serviceId})`);

    try {
      const environmentContext = this.createEnvironmentContext(context);
      const response = await this.edgeFunctionClient.getServiceResources(serviceId, environmentContext);

      if (!response.success) {
        return {
          success: false,
          message: response.error?.message || 'Failed to get service resources'
        };
      }

      return {
        success: true,
        data: response.data,
        metadata: {
          requestId: context.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.getServiceResources error:', error);
      
      return {
        success: false,
        message: 'Internal service error'
      };
    }
  }

  // =================================================================
  // MUTATION OPERATIONS
  // =================================================================

  /**
   * Create new service catalog item
   */
  async createServiceCatalogItem(
    input: CreateServiceCatalogItemInput,
    context: ServiceCatalogServiceContext
  ): Promise<ServiceCatalogResponse<ServiceCatalogItem>> {
    console.log('🔨 ServiceCatalogGraphQLService.createServiceCatalogItem', { serviceName: input.serviceName });

    try {
      const environmentContext = this.createEnvironmentContext(context);
      const response = await this.edgeFunctionClient.createService(input, environmentContext);

      if (!response.success) {
        return {
          success: false,
          message: response.error?.message || 'Failed to create service catalog item',
          errors: [{
            code: response.error?.code || 'CREATE_SERVICE_ERROR',
            message: response.error?.message || 'Unknown error',
            context: { serviceName: input.serviceName }
          }]
        };
      }

      // Invalidate related caches
      if (this.config.enableCaching) {
        this.invalidateCache(`services:${context.tenantId}:${context.isLive}`);
        this.invalidateCache(`masterData:${context.tenantId}:${context.isLive}`);
      }

      return {
        success: true,
        data: response.data,
        message: 'Service catalog item created successfully',
        metadata: {
          requestId: context.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.createServiceCatalogItem error:', error);
      
      return {
        success: false,
        message: 'Internal service error',
        errors: [{
          code: 'INTERNAL_SERVICE_ERROR',
          message: error.message,
          context: { serviceName: input.serviceName }
        }]
      };
    }
  }

  /**
   * Update existing service catalog item
   */
  async updateServiceCatalogItem(
    id: string,
    input: UpdateServiceCatalogItemInput,
    context: ServiceCatalogServiceContext
  ): Promise<ServiceCatalogResponse<ServiceCatalogItem>> {
    console.log(`🔄 ServiceCatalogGraphQLService.updateServiceCatalogItem(${id})`, { serviceName: input.serviceName });

    try {
      const environmentContext = this.createEnvironmentContext(context);
      const response = await this.edgeFunctionClient.updateService(id, input, environmentContext);

      if (!response.success) {
        return {
          success: false,
          message: response.error?.message || 'Failed to update service catalog item',
          errors: [{
            code: response.error?.code || 'UPDATE_SERVICE_ERROR',
            message: response.error?.message || 'Unknown error',
            context: { serviceId: id }
          }]
        };
      }

      // Invalidate related caches
      if (this.config.enableCaching) {
        this.invalidateCache(`service:${context.tenantId}:${context.isLive}:${id}`);
        this.invalidateCache(`services:${context.tenantId}:${context.isLive}`);
      }

      return {
        success: true,
        data: response.data,
        message: 'Service catalog item updated successfully',
        metadata: {
          requestId: context.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.updateServiceCatalogItem error:', error);
      
      return {
        success: false,
        message: 'Internal service error',
        errors: [{
          code: 'INTERNAL_SERVICE_ERROR',
          message: error.message,
          context: { serviceId: id }
        }]
      };
    }
  }

  /**
   * Delete service catalog item
   */
  async deleteServiceCatalogItem(
    id: string,
    context: ServiceCatalogServiceContext
  ): Promise<ServiceCatalogResponse<boolean>> {
    console.log(`🗑️ ServiceCatalogGraphQLService.deleteServiceCatalogItem(${id})`);

    try {
      const environmentContext = this.createEnvironmentContext(context);
      const response = await this.edgeFunctionClient.deleteService(id, environmentContext);

      if (!response.success) {
        return {
          success: false,
          message: response.error?.message || 'Failed to delete service catalog item',
          errors: [{
            code: response.error?.code || 'DELETE_SERVICE_ERROR',
            message: response.error?.message || 'Unknown error',
            context: { serviceId: id }
          }]
        };
      }

      // Invalidate related caches
      if (this.config.enableCaching) {
        this.invalidateCache(`service:${context.tenantId}:${context.isLive}:${id}`);
        this.invalidateCache(`services:${context.tenantId}:${context.isLive}`);
      }

      return {
        success: true,
        data: true,
        message: 'Service catalog item deleted successfully',
        metadata: {
          requestId: context.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.deleteServiceCatalogItem error:', error);
      
      return {
        success: false,
        message: 'Internal service error',
        errors: [{
          code: 'INTERNAL_SERVICE_ERROR',
          message: error.message,
          context: { serviceId: id }
        }]
      };
    }
  }

  /**
   * Bulk create service catalog items
   */
  async bulkCreateServiceCatalogItems(
    input: BulkCreateServiceCatalogItemsInput,
    context: ServiceCatalogServiceContext
  ): Promise<BulkOperationResponse> {
    console.log('📦 ServiceCatalogGraphQLService.bulkCreateServiceCatalogItems', { itemsCount: input.items.length });

    try {
      const environmentContext = this.createEnvironmentContext(context);
      const response = await this.edgeFunctionClient.bulkCreateServices(input, environmentContext);

      if (!response.success) {
        return {
          success: false,
          message: response.error?.message || 'Bulk operation failed',
          data: {
            successCount: 0,
            errorCount: input.items.length,
            totalCount: input.items.length,
            successfulItems: [],
            failedItems: [],
            batchId: input.batchId || 'unknown',
            processingTimeMs: 0
          }
        };
      }

      // Invalidate related caches
      if (this.config.enableCaching) {
        this.invalidateCache(`services:${context.tenantId}:${context.isLive}`);
        this.invalidateCache(`masterData:${context.tenantId}:${context.isLive}`);
      }

      return {
        success: true,
        data: response.data,
        message: `Bulk operation completed: ${response.data.successCount} successful, ${response.data.errorCount} failed`,
        metadata: {
          requestId: context.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.bulkCreateServiceCatalogItems error:', error);
      
      return {
        success: false,
        message: 'Internal service error',
        data: {
          successCount: 0,
          errorCount: input.items.length,
          totalCount: input.items.length,
          successfulItems: [],
          failedItems: [],
          batchId: input.batchId || 'unknown',
          processingTimeMs: 0
        }
      };
    }
  }

  // =================================================================
  // RESOURCE ASSOCIATION OPERATIONS
  // =================================================================

  /**
   * Associate resources with a service
   */
  async associateServiceResources(
    input: AssociateServiceResourcesInput,
    context: ServiceCatalogServiceContext
  ): Promise<ServiceCatalogResponse<ServiceCatalogItem>> {
    console.log('🔗 ServiceCatalogGraphQLService.associateServiceResources', { 
      serviceId: input.serviceId,
      resourcesCount: input.resourceAssociations.length 
    });

    try {
      const environmentContext = this.createEnvironmentContext(context);
      const response = await this.edgeFunctionClient.associateServiceResources(input, environmentContext);

      if (!response.success) {
        return {
          success: false,
          message: response.error?.message || 'Failed to associate service resources',
          errors: [{
            code: response.error?.code || 'ASSOCIATION_ERROR',
            message: response.error?.message || 'Unknown error',
            context: { serviceId: input.serviceId }
          }]
        };
      }

      // Invalidate related caches
      if (this.config.enableCaching) {
        this.invalidateCache(`service:${context.tenantId}:${context.isLive}:${input.serviceId}`);
        this.invalidateCache(`services:${context.tenantId}:${context.isLive}`);
      }

      return {
        success: true,
        data: response.data,
        message: 'Service resources associated successfully',
        metadata: {
          requestId: context.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.associateServiceResources error:', error);
      
      return {
        success: false,
        message: 'Internal service error',
        errors: [{
          code: 'INTERNAL_SERVICE_ERROR',
          message: error.message,
          context: { serviceId: input.serviceId }
        }]
      };
    }
  }

  /**
   * Update service pricing
   */
  async updateServicePricing(
    input: UpdateServicePricingInput,
    context: ServiceCatalogServiceContext
  ): Promise<ServiceCatalogResponse<ServiceCatalogItem>> {
    console.log('💰 ServiceCatalogGraphQLService.updateServicePricing', { serviceId: input.serviceId });

    try {
      const environmentContext = this.createEnvironmentContext(context);
      const response = await this.edgeFunctionClient.updateServicePricing(input, environmentContext);

      if (!response.success) {
        return {
          success: false,
          message: response.error?.message || 'Failed to update service pricing',
          errors: [{
            code: response.error?.code || 'PRICING_UPDATE_ERROR',
            message: response.error?.message || 'Unknown error',
            context: { serviceId: input.serviceId }
          }]
        };
      }

      // Invalidate related caches
      if (this.config.enableCaching) {
        this.invalidateCache(`service:${context.tenantId}:${context.isLive}:${input.serviceId}`);
        this.invalidateCache(`services:${context.tenantId}:${context.isLive}`);
      }

      return {
        success: true,
        data: response.data,
        message: 'Service pricing updated successfully',
        metadata: {
          requestId: context.requestId || this.generateRequestId(),
          executionTimeMs: response.metadata?.executionTimeMs || 0,
          environment: this.config.environment
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.updateServicePricing error:', error);
      
      return {
        success: false,
        message: 'Internal service error',
        errors: [{
          code: 'INTERNAL_SERVICE_ERROR',
          message: error.message,
          context: { serviceId: input.serviceId }
        }]
      };
    }
  }

  // =================================================================
  // HEALTH AND MONITORING
  // =================================================================

  /**
   * Service health check
   */
  async healthCheck(context?: ServiceCatalogServiceContext): Promise<ServiceCatalogHealthCheck> {
    console.log('🔍 ServiceCatalogGraphQLService.healthCheck');

    try {
      const response = await this.edgeFunctionClient.healthCheck();
      const clientMetrics = this.edgeFunctionClient.getMetrics();

      return {
        status: response.success ? 'healthy' : 'unhealthy',
        service: 'service-catalog-graphql-service',
        version: '1.0.0',
        environmentInfo: {
          tenantId: context?.tenantId || 'unknown',
          userId: context?.userId || 'unknown',
          isLive: context?.isLive || false,
          requestId: context?.requestId || this.generateRequestId(),
          timestamp: new Date().toISOString()
        },
        features: {
          multiCurrencyPricing: true,
          tieredPricing: true,
          discountRules: true,
          resourceAssociation: true,
          bulkOperations: true,
          auditTrails: true,
          caching: this.config.enableCaching || false,
          rateLimiting: true
        },
        endpoints: {
          createService: 'createServiceCatalogItem',
          updateService: 'updateServiceCatalogItem',
          deleteService: 'deleteServiceCatalogItem',
          queryServices: 'getServiceCatalogItems',
          bulkOperations: 'bulkCreateServiceCatalogItems',
          masterData: 'getMasterData',
          resources: 'getAvailableResources'
        },
        performance: {
          avgResponseTimeMs: clientMetrics.avgDuration,
          cacheHitRate: this.getCacheHitRate(),
          requestsPerMinute: 0, // TODO: Implement request rate tracking
          errorRate: 100 - clientMetrics.successRate
        }
      };
    } catch (error: any) {
      console.error('❌ ServiceCatalogGraphQLService.healthCheck error:', error);
      
      return {
        status: 'unhealthy',
        service: 'service-catalog-graphql-service',
        version: '1.0.0',
        environmentInfo: {
          tenantId: context?.tenantId || 'unknown',
          userId: context?.userId || 'unknown',
          isLive: context?.isLive || false,
          requestId: context?.requestId || this.generateRequestId(),
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
        endpoints: {
          createService: '/create',
          updateService: '/update',
          deleteService: '/delete',
          queryServices: '/query',
          bulkOperations: '/bulk',
          masterData: '/master-data',
          resources: '/resources'
        },
        performance: {
          avgResponseTimeMs: 0,
          cacheHitRate: 0,
          requestsPerMinute: 0,
          errorRate: 100
        }
      };
    }
  }

  // =================================================================
  // UTILITY METHODS
  // =================================================================

  private createEnvironmentContext(context: ServiceCatalogServiceContext): any {
    return {
      tenant_id: context.tenantId,
      user_id: context.userId,
      is_live: context.isLive,
      request_id: context.requestId || this.generateRequestId(),
      user_role: context.userRole,
      client_version: context.clientVersion
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private hashFilters(filters?: any, sort?: any, pagination?: any): string {
    const combined = { filters, sort, pagination };
    const str = JSON.stringify(combined);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private transformToConnectionFormat(data: any, pagination?: PaginationInput): any {
    return {
      edges: (data.items || []).map((item: any, index: number) => ({
        node: item,
        cursor: Buffer.from(`${(pagination?.offset || 0) + index}`).toString('base64')
      })),
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
        environmentLabel: this.config.environment,
        isLive: this.config.environment === 'production'
      }
    };
  }

  // =================================================================
  // CACHE MANAGEMENT
  // =================================================================

  private getFromCache(key: string): any {
    if (!this.config.enableCaching) return null;
    
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  private setCache(key: string, data: any, ttl?: number): void {
    if (!this.config.enableCaching) return;
    
    const cacheTtl = ttl || this.config.cacheTtl || 300; // 5 minutes default
    const expiry = Date.now() + (cacheTtl * 1000);
    
    this.cache.set(key, { data, expiry });
  }

  private invalidateCache(keyPrefix: string): void {
    if (!this.config.enableCaching) return;
    
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`🗑️ Invalidated ${keysToDelete.length} cache entries with prefix: ${keyPrefix}`);
  }

  private getCacheHitRate(): number {
    // TODO: Implement proper cache hit rate tracking
    return 0;
  }

  // =================================================================
  // CONFIGURATION METHODS
  // =================================================================

  updateConfig(newConfig: Partial<ServiceCatalogConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update Edge Function client if relevant config changed
    if (newConfig.edgeFunctionUrl || newConfig.hmacSecret || newConfig.timeout || newConfig.retryAttempts) {
      this.edgeFunctionClient = createEdgeFunctionClient({
        baseUrl: this.config.edgeFunctionUrl,
        hmacSecret: this.config.hmacSecret,
        timeout: this.config.timeout,
        retryAttempts: this.config.retryAttempts,
        enableLogging: this.config.enableLogging,
        environment: this.config.environment
      });
    }
    
    console.log('📝 ServiceCatalogGraphQLService configuration updated');
  }

  getConfig(): ServiceCatalogConfig {
    return { ...this.config };
  }

  clearCache(): void {
    this.cache.clear();
    console.log('🗑️ ServiceCatalogGraphQLService cache cleared');
  }
}

// =================================================================
// FACTORY FUNCTIONS
// =================================================================

export function createServiceCatalogGraphQLService(config: Partial<ServiceCatalogConfig> = {}): ServiceCatalogGraphQLService {
  const defaultConfig: ServiceCatalogConfig = {
    edgeFunctionUrl: process.env.SERVICE_CATALOG_EDGE_FUNCTION_URL || 'http://localhost:54321/functions/v1/service-catalog',
    hmacSecret: process.env.INTERNAL_SIGNING_SECRET,
    timeout: 30000,
    retryAttempts: 3,
    enableCaching: true,
    cacheTtl: 300, // 5 minutes
    enableLogging: process.env.NODE_ENV !== 'production',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'test'
  };

  const finalConfig = { ...defaultConfig, ...config };
  return new ServiceCatalogGraphQLService(finalConfig);
}

export default ServiceCatalogGraphQLService;