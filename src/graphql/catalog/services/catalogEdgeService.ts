// src/graphql/catalog/services/catalogEdgeService.ts
// Service for integrating with Catalog Edge Functions
// Handles authentication, request formatting, and response processing

import { GraphQLContext } from '../../shared/types/catalogContext';
import { 
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
  CatalogItemQueryInput,
  BulkCatalogItemInput,
  EnvironmentOperationInput
} from '../types/catalogTypes';

// =================================================================
// EDGE FUNCTION RESPONSE TYPES
// =================================================================

interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    has_more: boolean;
  };
  version_info?: {
    version_number: number;
    is_current_version: boolean;
    total_versions: number;
    version_reason?: string;
  };
  warnings?: string[];
}

interface EdgeFunctionRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path?: string;
  data?: any;
  queryParams?: Record<string, any>;
}

// =================================================================
// CATALOG EDGE SERVICE CLASS
// =================================================================

export class CatalogEdgeService {
  private context: GraphQLContext;
  private baseUrl: string;

  constructor(context: GraphQLContext) {
    this.context = context;
    this.baseUrl = `${context.config.edge_functions_url}/catalog-items`;
  }

  // =================================================================
  // SINGLE ITEM OPERATIONS
  // =================================================================

  /**
   * Get catalog item by ID
   */
  async getCatalogItem(id: string, includeHistory: boolean = false): Promise<EdgeFunctionResponse> {
    const queryParams: Record<string, any> = {
      include_history: includeHistory,
      environment: this.context.isLiveEnvironment() ? 'live' : 'test'
    };

    return this.makeEdgeRequest({
      method: 'GET',
      path: `/${id}`,
      queryParams
    });
  }

  /**
   * Create new catalog item
   */
  async createCatalogItem(input: CreateCatalogItemInput): Promise<EdgeFunctionResponse> {
    // Log the creation attempt
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_ITEM_CREATE' as any,
      'CATALOG_ITEMS' as any,
      undefined,
      undefined,
      undefined,
      { input_data: input, environment: this.context.isLiveEnvironment() ? 'live' : 'test' }
    );

    const response = await this.makeEdgeRequest({
      method: 'POST',
      data: {
        ...input,
        is_live: this.context.isLiveEnvironment()
      }
    });

    // Log the result
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_ITEM_CREATE' as any,
      'CATALOG_ITEMS' as any,
      response.data?.id,
      response.success,
      response.error,
      { 
        item_name: input.name,
        item_type: input.type,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    );

    return response;
  }

  /**
   * Update catalog item (creates new version)
   */
  async updateCatalogItem(id: string, input: UpdateCatalogItemInput): Promise<EdgeFunctionResponse> {
    // Log the update attempt
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_ITEM_UPDATE' as any,
      'CATALOG_ITEMS' as any,
      id,
      undefined,
      undefined,
      { 
        update_data: input,
        version_reason: input.version_reason,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    );

    const response = await this.makeEdgeRequest({
      method: 'PUT',
      path: `/${id}`,
      data: input
    });

    // Log the result
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_ITEM_UPDATE' as any,
      'CATALOG_ITEMS' as any,
      id,
      response.success,
      response.error,
      { 
        version_reason: input.version_reason,
        new_version: response.version_info?.version_number,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    );

    return response;
  }

  /**
   * Delete catalog item (soft delete)
   */
  async deleteCatalogItem(id: string): Promise<EdgeFunctionResponse> {
    // Log the deletion attempt
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_ITEM_DELETE' as any,
      'CATALOG_ITEMS' as any,
      id,
      undefined,
      undefined,
      { environment: this.context.isLiveEnvironment() ? 'live' : 'test' }
    );

    const response = await this.makeEdgeRequest({
      method: 'DELETE',
      path: `/${id}`
    });

    // Log the result
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_ITEM_DELETE' as any,
      'CATALOG_ITEMS' as any,
      id,
      response.success,
      response.error,
      { environment: this.context.isLiveEnvironment() ? 'live' : 'test' }
    );

    return response;
  }

  // =================================================================
  // QUERY OPERATIONS
  // =================================================================

  /**
   * Query catalog items with filters and pagination
   */
  async queryCatalogItems(query: CatalogItemQueryInput): Promise<EdgeFunctionResponse> {
    const queryParams = this.buildQueryParams(query);

    // Log search operation if there are filters
    if (query.filters?.search_query || Object.keys(query.filters || {}).length > 0) {
      await this.context.auditLogger.logCatalogOperation(
        'CATALOG_SEARCH' as any,
        'CATALOG_ITEMS' as any,
        undefined,
        undefined,
        undefined,
        { 
          search_query: query.filters?.search_query,
          filters: query.filters,
          environment: this.context.isLiveEnvironment() ? 'live' : 'test'
        }
      );
    }

    return this.makeEdgeRequest({
      method: 'GET',
      queryParams
    });
  }

  /**
   * Search catalog items with full-text search
   */
  async searchCatalogItems(
    searchQuery: string, 
    filters?: any, 
    pagination?: any
  ): Promise<EdgeFunctionResponse> {
    const queryParams: Record<string, any> = {
      search: searchQuery,
      environment: this.context.isLiveEnvironment() ? 'live' : 'test',
      ...this.buildFiltersParams(filters),
      ...this.buildPaginationParams(pagination)
    };

    // Log search operation
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_SEARCH' as any,
      'CATALOG_ITEMS' as any,
      undefined,
      undefined,
      undefined,
      { 
        search_query: searchQuery,
        filters,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    );

    return this.makeEdgeRequest({
      method: 'GET',
      queryParams
    });
  }

  /**
   * Get catalog item version history
   */
  async getCatalogItemHistory(id: string): Promise<EdgeFunctionResponse> {
    return this.makeEdgeRequest({
      method: 'GET',
      path: `/${id}/history`,
      queryParams: {
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    });
  }

  /**
   * Get specific version of catalog item
   */
  async getCatalogItemVersion(versionId: string): Promise<EdgeFunctionResponse> {
    return this.makeEdgeRequest({
      method: 'GET',
      path: `/${versionId}`,
      queryParams: {
        include_history: true,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    });
  }

  // =================================================================
  // BULK OPERATIONS
  // =================================================================

  /**
   * Bulk create catalog items
   */
  async bulkCreateCatalogItems(input: BulkCatalogItemInput): Promise<EdgeFunctionResponse> {
    // Log bulk operation start
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_BULK_CREATE' as any,
      'CATALOG_ITEMS' as any,
      undefined,
      undefined,
      undefined,
      { 
        operation: input.operation,
        item_count: input.items.length,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    );

    const response = await this.makeEdgeRequest({
      method: 'POST',
      path: '/bulk',
      data: {
        ...input,
        options: {
          ...input.options,
          is_live: this.context.isLiveEnvironment()
        }
      }
    });

    // Log bulk operation result
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_BULK_CREATE' as any,
      'CATALOG_ITEMS' as any,
      undefined,
      response.success,
      response.error,
      { 
        total_requested: response.data?.total_requested,
        successful: response.data?.successful,
        failed: response.data?.failed,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    );

    return response;
  }

  /**
   * Bulk update catalog items
   */
  async bulkUpdateCatalogItems(input: BulkCatalogItemInput): Promise<EdgeFunctionResponse> {
    // Log bulk operation start
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_BULK_UPDATE' as any,
      'CATALOG_ITEMS' as any,
      undefined,
      undefined,
      undefined,
      { 
        operation: input.operation,
        item_count: input.items.length,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    );

    const response = await this.makeEdgeRequest({
      method: 'PUT',
      path: '/bulk',
      data: input
    });

    // Log bulk operation result
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_BULK_UPDATE' as any,
      'CATALOG_ITEMS' as any,
      undefined,
      response.success,
      response.error,
      { 
        total_requested: response.data?.total_requested,
        successful: response.data?.successful,
        failed: response.data?.failed,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    );

    return response;
  }

  /**
   * Bulk delete catalog items
   */
  async bulkDeleteCatalogItems(ids: string[]): Promise<EdgeFunctionResponse> {
    // Log bulk operation start
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_BULK_DELETE' as any,
      'CATALOG_ITEMS' as any,
      undefined,
      undefined,
      undefined,
      { 
        operation: 'delete',
        item_count: ids.length,
        item_ids: ids,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    );

    const response = await this.makeEdgeRequest({
      method: 'DELETE',
      path: '/bulk',
      data: { ids }
    });

    // Log bulk operation result
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_BULK_DELETE' as any,
      'CATALOG_ITEMS' as any,
      undefined,
      response.success,
      response.error,
      { 
        total_requested: response.data?.total_requested,
        successful: response.data?.successful,
        failed: response.data?.failed,
        environment: this.context.isLiveEnvironment() ? 'live' : 'test'
      }
    );

    return response;
  }

  // =================================================================
  // ENVIRONMENT OPERATIONS
  // =================================================================

  /**
   * Copy live catalog to test environment
   */
  async copyLiveToTest(input?: EnvironmentOperationInput): Promise<EdgeFunctionResponse> {
    // Log environment operation start
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_LIVE_TO_TEST_COPY' as any,
      'CATALOG_ENVIRONMENT' as any,
      undefined,
      undefined,
      undefined,
      { 
        from_environment: 'live',
        to_environment: 'test',
        item_ids: input?.item_ids,
        item_count: input?.item_ids?.length
      }
    );

    const response = await this.makeEdgeRequest({
      method: 'POST',
      path: '/environment/copy-live-to-test',
      data: input
    });

    // Log environment operation result
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_LIVE_TO_TEST_COPY' as any,
      'CATALOG_ENVIRONMENT' as any,
      undefined,
      response.success,
      response.error,
      { 
        industries_copied: response.data?.industries_copied,
        categories_copied: response.data?.categories_copied,
        items_copied: response.data?.items_copied
      }
    );

    return response;
  }

  /**
   * Promote test catalog to live environment
   */
  async promoteTestToLive(input?: EnvironmentOperationInput): Promise<EdgeFunctionResponse> {
    // Log environment operation start
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_TEST_TO_LIVE_PROMOTE' as any,
      'CATALOG_ENVIRONMENT' as any,
      undefined,
      undefined,
      undefined,
      { 
        from_environment: 'test',
        to_environment: 'live',
        item_ids: input?.item_ids,
        item_count: input?.item_ids?.length
      }
    );

    const response = await this.makeEdgeRequest({
      method: 'POST',
      path: '/environment/promote-test-to-live',
      data: input
    });

    // Log environment operation result (critical operation)
    await this.context.auditLogger.logCatalogOperation(
      'CATALOG_TEST_TO_LIVE_PROMOTE' as any,
      'CATALOG_ENVIRONMENT' as any,
      undefined,
      response.success,
      response.error,
      { 
        industries_copied: response.data?.industries_copied,
        categories_copied: response.data?.categories_copied,
        items_copied: response.data?.items_copied
      }
    );

    return response;
  }

  // =================================================================
  // HELPER METHODS
  // =================================================================

  /**
   * Make authenticated request to Edge Function
   */
  private async makeEdgeRequest(request: EdgeFunctionRequest): Promise<EdgeFunctionResponse> {
    try {
      const url = new URL(this.baseUrl + (request.path || ''));
      
      // Add query parameters
      if (request.queryParams) {
        Object.entries(request.queryParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              value.forEach(v => url.searchParams.append(key, String(v)));
            } else {
              url.searchParams.set(key, String(value));
            }
          }
        });
      }

      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-tenant-id': this.context.tenant.id,
        'x-request-id': this.context.metadata.request_id,
        'x-environment': this.context.isLiveEnvironment() ? 'live' : 'test',
        'User-Agent': this.context.metadata.user_agent,
        'Authorization': `Bearer ${this.context.config.internal_signing_secret}`
      };

      // Add user context if available
      if (this.context.user?.id) {
        headers['x-user-id'] = this.context.user.id;
      }

      if (this.context.metadata.session_id) {
        headers['x-session-id'] = this.context.metadata.session_id;
      }

      if (this.context.metadata.correlation_id) {
        headers['x-correlation-id'] = this.context.metadata.correlation_id;
      }

      // Make the request
      const fetchOptions: RequestInit = {
        method: request.method,
        headers,
      };

      if (request.data && (request.method === 'POST' || request.method === 'PUT')) {
        fetchOptions.body = JSON.stringify(request.data);
      }

      console.log(`Making Edge Function request: ${request.method} ${url.toString()}`);
      
      const response = await fetch(url.toString(), fetchOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Edge Function error: ${response.status} ${response.statusText}`, errorText);
        
        return {
          success: false,
          error: `Edge Function error: ${response.status} ${response.statusText}`,
          message: errorText || 'Unknown error occurred'
        };
      }

      const responseData = await response.json();
      
      console.log(`Edge Function response: ${response.status}`, {
        success: responseData.success,
        dataKeys: responseData.data ? Object.keys(responseData.data) : 'no data'
      });

      return responseData;

    } catch (error: any) {
      console.error('Edge Function request failed:', error);
      
      return {
        success: false,
        error: error.message || 'Network error',
        message: 'Failed to communicate with Edge Function'
      };
    }
  }

  /**
   * Build query parameters from CatalogItemQueryInput
   */
  private buildQueryParams(query: CatalogItemQueryInput): Record<string, any> {
    const params: Record<string, any> = {
      environment: this.context.isLiveEnvironment() ? 'live' : 'test'
    };

    // Add filters
    if (query.filters) {
      Object.assign(params, this.buildFiltersParams(query.filters));
    }

    // Add pagination
    if (query.pagination) {
      Object.assign(params, this.buildPaginationParams(query.pagination));
    }

    // Add sorting
    if (query.sort && query.sort.length > 0) {
      params.sort_by = query.sort[0].field;
      params.sort_order = query.sort[0].direction?.toLowerCase() || 'desc';
    }

    // Add include options
    if (query.include_related !== undefined) {
      params.include_related = query.include_related;
    }
    if (query.include_versions !== undefined) {
      params.include_versions = query.include_versions;
    }

    return params;
  }

  /**
   * Build filter parameters
   */
  private buildFiltersParams(filters: any): Record<string, any> {
    const params: Record<string, any> = {};

    if (!filters) return params;

    // Simple field mappings
    const simpleFields = [
      'search_query', 'is_active', 'is_live', 'service_parent_id', 'is_variant',
      'include_variants', 'min_price', 'max_price', 'currency', 'current_versions_only',
      'include_inactive', 'created_after', 'created_before', 'updated_after',
      'updated_before', 'created_by'
    ];

    simpleFields.forEach(field => {
      if (filters[field] !== undefined) {
        params[field] = filters[field];
      }
    });

    // Array fields that can be comma-separated or multiple values
    const arrayFields = ['type', 'status', 'industry_id', 'category_id', 'pricing_type', 'search_fields'];
    arrayFields.forEach(field => {
      if (filters[field]) {
        params[field] = Array.isArray(filters[field]) ? filters[field] : [filters[field]];
      }
    });

    return params;
  }

  /**
   * Build pagination parameters
   */
  private buildPaginationParams(pagination: any): Record<string, any> {
    const params: Record<string, any> = {};

    if (!pagination) return params;

    if (pagination.page !== undefined) {
      params.page = pagination.page;
    }
    if (pagination.limit !== undefined) {
      params.limit = Math.min(pagination.limit, 1000); // Cap at 1000
    }

    return params;
  }
}

// =================================================================
// FACTORY FUNCTION
// =================================================================

/**
 * Create CatalogEdgeService instance for GraphQL context
 */
export function createCatalogEdgeService(context: GraphQLContext): CatalogEdgeService {
  return new CatalogEdgeService(context);
}

export default CatalogEdgeService;