// src/graphql/catalog/resolvers/catalogQueries.ts
// GraphQL Query resolvers for Catalog operations
// Handles all read operations with proper authentication and audit logging

import { 
  GraphQLContext, 
  GraphQLAuthenticationError, 
  GraphQLAuthorizationError,
  GraphQLNotFoundError 
} from '../../shared/types/catalogContext';
import { createCatalogEdgeService } from '../services/catalogEdgeService';
import {
  CatalogItemQueryInput,
  CatalogItemFiltersInput,
  PaginationInput
} from '../types/catalogTypes';

// =================================================================
// QUERY RESOLVER INTERFACE
// =================================================================

interface QueryResolvers {
  catalogItem: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  catalogItems: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  searchCatalogItems: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  catalogItemHistory: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  catalogItemVersion: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  catalogIndustries: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  catalogCategories: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  catalogStatistics: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  masterIndustries: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  masterCategories: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  compareEnvironments: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  validateCatalogItem: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
  validateCatalogUpdate: (parent: any, args: any, context: GraphQLContext) => Promise<any>;
}

// =================================================================
// AUTHENTICATION & AUTHORIZATION HELPERS
// =================================================================

/**
 * Ensure user is authenticated
 */
function requireAuth(context: GraphQLContext): void {
  if (!context.user) {
    throw new GraphQLAuthenticationError('Authentication required for catalog operations');
  }
}

/**
 * Ensure user has read permissions for catalog
 */
function requireReadAccess(context: GraphQLContext): void {
  requireAuth(context);
  
  // Basic permission check - can be enhanced based on your permission system
  if (!context.hasPermission('catalog:read')) {
    throw new GraphQLAuthorizationError('Insufficient permissions to read catalog data');
  }
}

/**
 * Ensure user has admin permissions for catalog
 */
function requireAdminAccess(context: GraphQLContext): void {
  requireAuth(context);
  
  if (!context.hasPermission('catalog:admin')) {
    throw new GraphQLAuthorizationError('Admin permissions required for this operation');
  }
}

// =================================================================
// QUERY RESOLVERS
// =================================================================

export const catalogQueryResolvers: QueryResolvers = {
  /**
   * Get a single catalog item by ID
   */
  async catalogItem(parent, args, context) {
    requireReadAccess(context);

    const { id, include_history = false } = args;
    const edgeService = createCatalogEdgeService(context);

    try {
      // Log the query operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogItem',
        true,
        undefined,
        undefined,
        { item_id: id, include_history }
      );

      const response = await edgeService.getCatalogItem(id, include_history);

      if (!response.success) {
        if (response.error?.includes('not found')) {
          throw new GraphQLNotFoundError('Catalog item', id);
        }
        throw new Error(response.error || 'Failed to fetch catalog item');
      }

      return {
        item: response.data,
        message: response.message,
        validation: null // No validation needed for queries
      };

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogItem',
        false,
        undefined,
        error.message,
        { item_id: id, include_history }
      );

      throw error;
    }
  },

  /**
   * Get multiple catalog items with filtering and pagination
   */
  async catalogItems(parent, args, context) {
    requireReadAccess(context);

    const { query } = args as { query: CatalogItemQueryInput };
    const edgeService = createCatalogEdgeService(context);

    try {
      // Log the query operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogItems',
        true,
        undefined,
        undefined,
        { 
          filters: query.filters,
          pagination: query.pagination,
          include_related: query.include_related,
          include_versions: query.include_versions
        }
      );

      const response = await edgeService.queryCatalogItems(query);

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch catalog items');
      }

      return {
        items: response.data || [],
        pagination: response.pagination || {
          total: 0,
          page: query.pagination?.page || 1,
          limit: query.pagination?.limit || 50,
          has_more: false,
          total_pages: 0
        },
        message: response.message
      };

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogItems',
        false,
        undefined,
        error.message,
        { query }
      );

      throw error;
    }
  },

  /**
   * Search catalog items with full-text search
   */
  async searchCatalogItems(parent, args, context) {
    requireReadAccess(context);

    const { 
      query: searchQuery, 
      filters, 
      pagination 
    } = args as { 
      query: string; 
      filters?: CatalogItemFiltersInput; 
      pagination?: PaginationInput; 
    };

    const edgeService = createCatalogEdgeService(context);

    try {
      // Log the search operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'searchCatalogItems',
        true,
        undefined,
        undefined,
        { 
          search_query: searchQuery,
          filters,
          pagination
        }
      );

      const response = await edgeService.searchCatalogItems(searchQuery, filters, pagination);

      if (!response.success) {
        throw new Error(response.error || 'Search failed');
      }

      // Transform response to match GraphQL schema
      return {
        items: response.data?.items || [],
        pagination: response.pagination || {
          total: 0,
          page: pagination?.page || 1,
          limit: pagination?.limit || 50,
          has_more: false,
          total_pages: 0
        },
        facets: response.data?.facets || {
          types: [],
          industries: [],
          categories: [],
          pricing_types: [],
          price_ranges: []
        },
        query_info: {
          query: searchQuery,
          total_results: response.data?.total_results || 0,
          search_time_ms: response.data?.search_time_ms || 0,
          suggestions: response.data?.suggestions || []
        }
      };

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'searchCatalogItems',
        false,
        undefined,
        error.message,
        { search_query: searchQuery, filters, pagination }
      );

      throw error;
    }
  },

  /**
   * Get version history for a catalog item
   */
  async catalogItemHistory(parent, args, context) {
    requireReadAccess(context);

    const { id } = args;
    const edgeService = createCatalogEdgeService(context);

    try {
      // Log the query operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogItemHistory',
        true,
        undefined,
        undefined,
        { item_id: id }
      );

      const response = await edgeService.getCatalogItemHistory(id);

      if (!response.success) {
        if (response.error?.includes('not found')) {
          throw new GraphQLNotFoundError('Catalog item or version history', id);
        }
        throw new Error(response.error || 'Failed to fetch version history');
      }

      return {
        versions: response.data?.versions || [],
        original_item_id: response.data?.original_item_id || id,
        current_version_id: response.data?.current_version_id || id,
        total_versions: response.data?.total_versions || 0
      };

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogItemHistory',
        false,
        undefined,
        error.message,
        { item_id: id }
      );

      throw error;
    }
  },

  /**
   * Get a specific version of a catalog item
   */
  async catalogItemVersion(parent, args, context) {
    requireReadAccess(context);

    const { version_id } = args;
    const edgeService = createCatalogEdgeService(context);

    try {
      // Log the query operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogItemVersion',
        true,
        undefined,
        undefined,
        { version_id }
      );

      const response = await edgeService.getCatalogItemVersion(version_id);

      if (!response.success) {
        if (response.error?.includes('not found')) {
          throw new GraphQLNotFoundError('Catalog item version', version_id);
        }
        throw new Error(response.error || 'Failed to fetch catalog item version');
      }

      return {
        item: response.data,
        message: response.message,
        validation: null
      };

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogItemVersion',
        false,
        undefined,
        error.message,
        { version_id }
      );

      throw error;
    }
  },

  /**
   * Get available industries
   */
  async catalogIndustries(parent, args, context) {
    requireReadAccess(context);

    const { is_live = true } = args;

    try {
      // Log the query operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogIndustries',
        true,
        undefined,
        undefined,
        { is_live }
      );

      // Use Supabase directly for industries since they're simpler
      const { data, error } = await context.supabase
        .from('t_catalog_industries')
        .select('*')
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', is_live)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch industries: ${error.message}`);
      }

      return data || [];

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogIndustries',
        false,
        undefined,
        error.message,
        { is_live }
      );

      throw error;
    }
  },

  /**
   * Get categories for an industry
   */
  async catalogCategories(parent, args, context) {
    requireReadAccess(context);

    const { industry_id, is_live = true } = args;

    try {
      // Log the query operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogCategories',
        true,
        undefined,
        undefined,
        { industry_id, is_live }
      );

      // Build query
      let query = context.supabase
        .from('v_catalog_categories_with_industry')
        .select('*')
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', is_live)
        .eq('is_active', true);

      if (industry_id) {
        query = query.eq('industry_id', industry_id);
      }

      const { data, error } = await query.order('sort_order', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch categories: ${error.message}`);
      }

      return data || [];

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogCategories',
        false,
        undefined,
        error.message,
        { industry_id, is_live }
      );

      throw error;
    }
  },

  /**
   * Get catalog statistics
   */
  async catalogStatistics(parent, args, context) {
    requireReadAccess(context);

    const { is_live = true, date_range } = args;

    try {
      // Log the query operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogStatistics',
        true,
        undefined,
        undefined,
        { is_live, date_range }
      );

      // Use Supabase to get statistics (this could also be moved to Edge Function)
      const { data: statsData, error } = await context.supabase
        .rpc('get_catalog_statistics', {
          p_tenant_id: context.tenant.id,
          p_is_live: is_live,
          p_start_date: date_range?.[0],
          p_end_date: date_range?.[1]
        });

      if (error) {
        throw new Error(`Failed to fetch statistics: ${error.message}`);
      }

      return statsData || {
        total_items: 0,
        by_type: [],
        by_status: [],
        by_pricing_type: [],
        by_industry: [],
        recent_activity: []
      };

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'catalogStatistics',
        false,
        undefined,
        error.message,
        { is_live, date_range }
      );

      throw error;
    }
  },

  /**
   * Get master industries (available for copying)
   */
  async masterIndustries(parent, args, context) {
    requireAdminAccess(context); // Only admins can see master data

    try {
      // Log the query operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'masterIndustries',
        true,
        undefined,
        undefined,
        {}
      );

      // Fetch from master industries table
      const { data, error } = await context.supabase
        .from('t_master_industries')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch master industries: ${error.message}`);
      }

      return data || [];

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'masterIndustries',
        false,
        undefined,
        error.message,
        {}
      );

      throw error;
    }
  },

  /**
   * Get master categories for industries
   */
  async masterCategories(parent, args, context) {
    requireAdminAccess(context); // Only admins can see master data

    const { industry_ids } = args as { industry_ids: string[] };

    try {
      // Log the query operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'masterCategories',
        true,
        undefined,
        undefined,
        { industry_ids }
      );

      // Fetch from master categories table
      const { data, error } = await context.supabase
        .from('t_master_categories')
        .select('*')
        .in('master_industry_id', industry_ids)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch master categories: ${error.message}`);
      }

      return data || [];

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'masterCategories',
        false,
        undefined,
        error.message,
        { industry_ids }
      );

      throw error;
    }
  },

  /**
   * Compare items between environments
   */
  async compareEnvironments(parent, args, context) {
    requireReadAccess(context);

    const { item_ids } = args as { item_ids?: string[] };

    try {
      // Log the query operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'compareEnvironments',
        true,
        undefined,
        undefined,
        { item_ids, item_count: item_ids?.length }
      );

      // Use database function for environment comparison
      const { data, error } = await context.supabase
        .rpc('compare_catalog_environments', {
          p_tenant_id: context.tenant.id,
          p_item_ids: item_ids
        });

      if (error) {
        throw new Error(`Failed to compare environments: ${error.message}`);
      }

      return data || [];

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'compareEnvironments',
        false,
        undefined,
        error.message,
        { item_ids }
      );

      throw error;
    }
  },

  /**
   * Validate catalog item data
   */
  async validateCatalogItem(parent, args, context) {
    requireReadAccess(context);

    const { input } = args;
    const edgeService = createCatalogEdgeService(context);

    try {
      // Log the validation operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'validateCatalogItem',
        true,
        undefined,
        undefined,
        { validation_type: 'create', item_type: input.type }
      );

      // For now, return basic validation - this could call Edge Function validation
      // Or use the CatalogValidationService directly
      return {
        is_valid: true,
        errors: [],
        warnings: []
      };

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'validateCatalogItem',
        false,
        undefined,
        error.message,
        { validation_type: 'create', item_type: input.type }
      );

      throw error;
    }
  },

  /**
   * Validate catalog item update
   */
  async validateCatalogUpdate(parent, args, context) {
    requireReadAccess(context);

    const { id, input } = args;

    try {
      // Log the validation operation
      await context.auditLogger.logGraphQLOperation(
        'query',
        'validateCatalogUpdate',
        true,
        undefined,
        undefined,
        { validation_type: 'update', item_id: id, version_reason: input.version_reason }
      );

      // For now, return basic validation - this could call Edge Function validation
      return {
        is_valid: true,
        errors: [],
        warnings: []
      };

    } catch (error: any) {
      // Log the error
      await context.auditLogger.logGraphQLOperation(
        'query',
        'validateCatalogUpdate',
        false,
        undefined,
        error.message,
        { validation_type: 'update', item_id: id }
      );

      throw error;
    }
  }
};

export default catalogQueryResolvers;