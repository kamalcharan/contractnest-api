// src/graphql/shared/types/context.ts
// GraphQL context interface and audit integration
// Provides shared context for all GraphQL resolvers with audit logging

import { Request } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuditAction, AuditResource, AuditSeverity, AuditLogEntry, AuditContext } from '../../../constants/auditConstants';

// =================================================================
// CATALOG-SPECIFIC AUDIT ACTIONS (EXTEND EXISTING)
// =================================================================

export const CatalogAuditActions = {
  // Include all existing audit actions
  ...AuditAction,
  
  // ==================
  // Catalog Setup & Onboarding
  // ==================
  CATALOG_SETUP_START: 'CATALOG_SETUP_START',
  CATALOG_SETUP_COMPLETE: 'CATALOG_SETUP_COMPLETE',
  CATALOG_MASTER_DATA_COPY: 'CATALOG_MASTER_DATA_COPY',
  CATALOG_INDUSTRY_SELECT: 'CATALOG_INDUSTRY_SELECT',
  CATALOG_CATEGORY_SELECT: 'CATALOG_CATEGORY_SELECT',
  
  // ==================
  // Industry Management
  // ==================
  CATALOG_INDUSTRY_CREATE: 'CATALOG_INDUSTRY_CREATE',
  CATALOG_INDUSTRY_UPDATE: 'CATALOG_INDUSTRY_UPDATE',
  CATALOG_INDUSTRY_DELETE: 'CATALOG_INDUSTRY_DELETE',
  CATALOG_INDUSTRY_ACTIVATE: 'CATALOG_INDUSTRY_ACTIVATE',
  CATALOG_INDUSTRY_DEACTIVATE: 'CATALOG_INDUSTRY_DEACTIVATE',
  CATALOG_INDUSTRY_CUSTOMIZE: 'CATALOG_INDUSTRY_CUSTOMIZE',
  
  // ==================
  // Category Management
  // ==================
  CATALOG_CATEGORY_CREATE: 'CATALOG_CATEGORY_CREATE',
  CATALOG_CATEGORY_UPDATE: 'CATALOG_CATEGORY_UPDATE',
  CATALOG_CATEGORY_DELETE: 'CATALOG_CATEGORY_DELETE',
  CATALOG_CATEGORY_ACTIVATE: 'CATALOG_CATEGORY_ACTIVATE',
  CATALOG_CATEGORY_DEACTIVATE: 'CATALOG_CATEGORY_DEACTIVATE',
  CATALOG_CATEGORY_CUSTOMIZE: 'CATALOG_CATEGORY_CUSTOMIZE',
  CATALOG_CATEGORY_REORDER: 'CATALOG_CATEGORY_REORDER',
  
  // ==================
  // Catalog Item Management
  // ==================
  CATALOG_ITEM_CREATE: 'CATALOG_ITEM_CREATE',
  CATALOG_ITEM_UPDATE: 'CATALOG_ITEM_UPDATE',
  CATALOG_ITEM_DELETE: 'CATALOG_ITEM_DELETE',
  CATALOG_ITEM_DUPLICATE: 'CATALOG_ITEM_DUPLICATE',
  CATALOG_ITEM_ACTIVATE: 'CATALOG_ITEM_ACTIVATE',
  CATALOG_ITEM_DEACTIVATE: 'CATALOG_ITEM_DEACTIVATE',
  CATALOG_ITEM_DRAFT: 'CATALOG_ITEM_DRAFT',
  CATALOG_ITEM_PUBLISH: 'CATALOG_ITEM_PUBLISH',
  
  // ==================
  // Service Variants
  // ==================
  CATALOG_VARIANT_CREATE: 'CATALOG_VARIANT_CREATE',
  CATALOG_VARIANT_UPDATE: 'CATALOG_VARIANT_UPDATE',
  CATALOG_VARIANT_DELETE: 'CATALOG_VARIANT_DELETE',
  CATALOG_VARIANT_LINK: 'CATALOG_VARIANT_LINK',
  CATALOG_VARIANT_UNLINK: 'CATALOG_VARIANT_UNLINK',
  
  // ==================
  // Pricing Management
  // ==================
  CATALOG_PRICING_UPDATE: 'CATALOG_PRICING_UPDATE',
  CATALOG_PRICING_RULE_ADD: 'CATALOG_PRICING_RULE_ADD',
  CATALOG_PRICING_RULE_REMOVE: 'CATALOG_PRICING_RULE_REMOVE',
  CATALOG_PRICING_MODEL_CHANGE: 'CATALOG_PRICING_MODEL_CHANGE',
  CATALOG_PRICING_CALCULATE: 'CATALOG_PRICING_CALCULATE',
  
  // ==================
  // Tax Configuration
  // ==================
  CATALOG_TAX_CONFIG_UPDATE: 'CATALOG_TAX_CONFIG_UPDATE',
  CATALOG_TAX_RATE_ASSIGN: 'CATALOG_TAX_RATE_ASSIGN',
  CATALOG_TAX_RATE_REMOVE: 'CATALOG_TAX_RATE_REMOVE',
  CATALOG_TAX_DISPLAY_MODE_CHANGE: 'CATALOG_TAX_DISPLAY_MODE_CHANGE',
  
  // ==================
  // Environment Management
  // ==================
  CATALOG_LIVE_TO_TEST_COPY: 'CATALOG_LIVE_TO_TEST_COPY',
  CATALOG_TEST_TO_LIVE_PROMOTE: 'CATALOG_TEST_TO_LIVE_PROMOTE',
  CATALOG_ENVIRONMENT_SWITCH: 'CATALOG_ENVIRONMENT_SWITCH',
  CATALOG_ENVIRONMENT_COMPARE: 'CATALOG_ENVIRONMENT_COMPARE',
  CATALOG_ENVIRONMENT_SYNC: 'CATALOG_ENVIRONMENT_SYNC',
  
  // ==================
  // Bulk Operations
  // ==================
  CATALOG_BULK_IMPORT: 'CATALOG_BULK_IMPORT',
  CATALOG_BULK_EXPORT: 'CATALOG_BULK_EXPORT',
  CATALOG_BULK_UPDATE: 'CATALOG_BULK_UPDATE',
  CATALOG_BULK_DELETE: 'CATALOG_BULK_DELETE',
  CATALOG_BULK_ACTIVATE: 'CATALOG_BULK_ACTIVATE',
  CATALOG_BULK_DEACTIVATE: 'CATALOG_BULK_DEACTIVATE',
  
  // ==================
  // Search & Query
  // ==================
  CATALOG_SEARCH: 'CATALOG_SEARCH',
  CATALOG_FILTER: 'CATALOG_FILTER',
  CATALOG_HIERARCHY_VIEW: 'CATALOG_HIERARCHY_VIEW',
  CATALOG_STATS_VIEW: 'CATALOG_STATS_VIEW',
  CATALOG_REPORT_GENERATE: 'CATALOG_REPORT_GENERATE',
  
  // ==================
  // GraphQL Operations
  // ==================
  CATALOG_GRAPHQL_QUERY: 'CATALOG_GRAPHQL_QUERY',
  CATALOG_GRAPHQL_MUTATION: 'CATALOG_GRAPHQL_MUTATION',
  CATALOG_GRAPHQL_SUBSCRIPTION: 'CATALOG_GRAPHQL_SUBSCRIPTION',
  
  // ==================
  // Data Integrity
  // ==================
  CATALOG_VALIDATION_FAIL: 'CATALOG_VALIDATION_FAIL',
  CATALOG_INTEGRITY_CHECK: 'CATALOG_INTEGRITY_CHECK',
  CATALOG_CLEANUP: 'CATALOG_CLEANUP',
  CATALOG_REPAIR: 'CATALOG_REPAIR',
} as const;

export const CatalogAuditResources = {
  // Include all existing audit resources
  ...AuditResource,
  
  // Catalog-specific resources
  CATALOG: 'catalog',
  CATALOG_INDUSTRIES: 'catalog_industries',
  CATALOG_CATEGORIES: 'catalog_categories', 
  CATALOG_ITEMS: 'catalog_items',
  CATALOG_VARIANTS: 'catalog_variants',
  CATALOG_PRICING: 'catalog_pricing',
  CATALOG_TAX: 'catalog_tax',
  CATALOG_MASTER_DATA: 'catalog_master_data',
  CATALOG_ENVIRONMENT: 'catalog_environment',
} as const;

// Type exports
export type CatalogAuditAction = typeof CatalogAuditActions[keyof typeof CatalogAuditActions];
export type CatalogAuditResource = typeof CatalogAuditResources[keyof typeof CatalogAuditResources];

// =================================================================
// GRAPHQL CONTEXT INTERFACES
// =================================================================

/**
 * User information extracted from JWT token
 */
export interface GraphQLUser {
  id: string;
  email: string;
  role?: string;
  tenants?: Array<{
    id: string;
    name: string;
    is_admin: boolean;
  }>;
  is_super_admin?: boolean;
}

/**
 * Tenant context for GraphQL operations
 */
export interface TenantContext {
  id: string;
  name?: string;
  is_live: boolean; // Environment flag (live vs test)
  user_is_admin: boolean;
  user_permissions?: string[];
}

/**
 * Request metadata for audit logging
 */
export interface RequestMetadata {
  ip_address: string;
  user_agent: string;
  request_id: string;
  session_id?: string;
  correlation_id?: string;
  operation_name?: string;
  query?: string;
  variables?: Record<string, any>;
}

/**
 * GraphQL Audit Logger interface
 */
export interface GraphQLAuditLogger {
  /**
   * Log catalog-specific operations
   */
  logCatalogOperation(
    action: CatalogAuditAction,
    resource: CatalogAuditResource,
    resourceId?: string,
    success?: boolean,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void>;

  /**
   * Log GraphQL operation (query/mutation/subscription)
   */
  logGraphQLOperation(
    operationType: 'query' | 'mutation' | 'subscription',
    operationName: string,
    success: boolean,
    duration?: number,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void>;

  /**
   * Log with automatic timing
   */
  logTimedOperation<T>(
    action: CatalogAuditAction,
    resource: CatalogAuditResource,
    resourceId: string | undefined,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T>;
}

/**
 * Main GraphQL Context Interface
 * Available in all resolvers as the third parameter
 */
export interface GraphQLContext {
  // Authentication & Authorization
  user?: GraphQLUser;
  tenant: TenantContext;
  
  // Database & Services
  supabase: SupabaseClient;
  
  // Request Context
  req: Request;
  metadata: RequestMetadata;
  
  // Audit Logging
  auditLogger: GraphQLAuditLogger;
  
  // Environment Configuration
  config: {
    edge_functions_url: string;
    internal_signing_secret: string;
    environment: 'development' | 'staging' | 'production';
  };
  
  // Helper Methods
  /**
   * Create audit context for current request
   */
  createAuditContext(): AuditContext;
  
  /**
   * Check if user has permission for tenant operation
   */
  hasPermission(permission: string): boolean;
  
  /**
   * Get current environment (live/test)
   */
  isLiveEnvironment(): boolean;
}

// =================================================================
// GRAPHQL ERROR TYPES
// =================================================================

/**
 * Custom GraphQL Error with audit integration
 */
export class GraphQLCatalogError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: any,
    public auditAction?: CatalogAuditAction,
    public auditResource?: CatalogAuditResource
  ) {
    super(message);
    this.name = 'GraphQLCatalogError';
  }
}

export class GraphQLValidationError extends GraphQLCatalogError {
  constructor(message: string, public validationErrors: any[]) {
    super(
      message, 
      'VALIDATION_ERROR', 
      400, 
      { validationErrors },
      CatalogAuditActions.CATALOG_VALIDATION_FAIL,
      CatalogAuditResources.CATALOG
    );
    this.name = 'GraphQLValidationError';
  }
}

export class GraphQLNotFoundError extends GraphQLCatalogError {
  constructor(resource: string, id: string) {
    super(
      `${resource} not found: ${id}`, 
      'NOT_FOUND', 
      404,
      undefined,
      CatalogAuditActions.CATALOG_GRAPHQL_QUERY,
      CatalogAuditResources.CATALOG
    );
    this.name = 'GraphQLNotFoundError';
  }
}

export class GraphQLVersioningError extends GraphQLCatalogError {
  constructor(message: string, details?: any) {
    super(
      message, 
      'VERSIONING_ERROR', 
      409, 
      details,
      CatalogAuditActions.CATALOG_ITEM_UPDATE,
      CatalogAuditResources.CATALOG_ITEMS
    );
    this.name = 'GraphQLVersioningError';
  }
}

export class GraphQLAuthenticationError extends GraphQLCatalogError {
  constructor(message: string = 'Authentication required') {
    super(
      message, 
      'AUTHENTICATION_ERROR', 
      401,
      undefined,
      AuditAction.UNAUTHORIZED_ACCESS,
      AuditResource.AUTH
    );
    this.name = 'GraphQLAuthenticationError';
  }
}

export class GraphQLAuthorizationError extends GraphQLCatalogError {
  constructor(message: string = 'Insufficient permissions') {
    super(
      message, 
      'AUTHORIZATION_ERROR', 
      403,
      undefined,
      AuditAction.UNAUTHORIZED_ACCESS,
      AuditResource.AUTH
    );
    this.name = 'GraphQLAuthorizationError';
  }
}

// =================================================================
// CATALOG AUDIT METADATA HELPERS
// =================================================================

/**
 * Standard metadata helpers for catalog operations
 */
export const CatalogAuditMetadata = {
  /**
   * Metadata for catalog item operations
   */
  catalogItem: (item: any) => ({
    item_id: item.id,
    item_name: item.name,
    item_type: item.type,
    category_id: item.category_id,
    industry_id: item.industry_id,
    is_live: item.is_live,
    status: item.status,
    pricing_type: item.price_attributes?.type,
    version_number: item.version_number,
    is_current_version: item.is_current_version,
  }),
  
  /**
   * Metadata for environment operations
   */
  environment: (tenantId: string, fromEnv: boolean, toEnv: boolean) => ({
    tenant_id: tenantId,
    from_environment: fromEnv ? 'live' : 'test',
    to_environment: toEnv ? 'live' : 'test',
  }),
  
  /**
   * Metadata for GraphQL operations
   */
  graphqlOperation: (operationType: string, operationName: string, variables?: any) => ({
    graphql_operation_type: operationType,
    graphql_operation_name: operationName,
    graphql_variables: variables,
    is_graphql_operation: true,
  }),
  
  /**
   * Metadata for search operations
   */
  search: (query: string, filters: any, resultCount: number) => ({
    search_query: query,
    search_filters: filters,
    result_count: resultCount,
    is_search_operation: true,
  }),
  
  /**
   * Metadata for bulk operations
   */
  bulkOperation: (operationType: string, count: number, filters?: any) => ({
    bulk_operation_type: operationType,
    affected_count: count,
    bulk_filters: filters,
    is_bulk_operation: true,
  }),
  
  /**
   * Metadata for pricing operations
   */
  pricing: (oldConfig: any, newConfig: any) => ({
    old_pricing: oldConfig,
    new_pricing: newConfig,
    pricing_change_type: newConfig?.type !== oldConfig?.type ? 'model_change' : 'value_change',
    is_pricing_operation: true,
  }),
  
  /**
   * Metadata for version operations
   */
  versioning: (currentVersion: number, newVersion: number, reason?: string) => ({
    current_version: currentVersion,
    new_version: newVersion,
    version_reason: reason,
    is_versioning_operation: true,
  }),
};

// =================================================================
// CATALOG SEVERITY MAPPING
// =================================================================

/**
 * Get severity for catalog actions
 */
export const getCatalogActionSeverity = (action: CatalogAuditAction): AuditSeverity => {
  // Critical severity actions for catalog
  const criticalActions: CatalogAuditAction[] = [
    CatalogAuditActions.CATALOG_TEST_TO_LIVE_PROMOTE,
    CatalogAuditActions.CATALOG_BULK_DELETE,
    CatalogAuditActions.CATALOG_ITEM_DELETE,
    CatalogAuditActions.CATALOG_INDUSTRY_DELETE,
    CatalogAuditActions.CATALOG_CATEGORY_DELETE,
    CatalogAuditActions.CATALOG_CLEANUP,
  ];
  
  // Warning severity actions
  const warningActions: CatalogAuditAction[] = [
    CatalogAuditActions.CATALOG_LIVE_TO_TEST_COPY,
    CatalogAuditActions.CATALOG_ENVIRONMENT_SWITCH,
    CatalogAuditActions.CATALOG_BULK_UPDATE,
    CatalogAuditActions.CATALOG_PRICING_MODEL_CHANGE,
    CatalogAuditActions.CATALOG_TAX_CONFIG_UPDATE,
    CatalogAuditActions.CATALOG_BULK_IMPORT,
    CatalogAuditActions.CATALOG_VALIDATION_FAIL,
  ];
  
  // Error severity actions
  const errorActions: CatalogAuditAction[] = [
    CatalogAuditActions.CATALOG_INTEGRITY_CHECK,
    CatalogAuditActions.CATALOG_REPAIR,
  ];
  
  if (criticalActions.includes(action)) return AuditSeverity.CRITICAL;
  if (warningActions.includes(action)) return AuditSeverity.WARNING;
  if (errorActions.includes(action)) return AuditSeverity.ERROR;
  
  return AuditSeverity.INFO;
};

/**
 * Check if catalog action should trigger alerts
 */
export const shouldAlertOnCatalogAction = (action: CatalogAuditAction): boolean => {
  const alertActions: CatalogAuditAction[] = [
    CatalogAuditActions.CATALOG_TEST_TO_LIVE_PROMOTE,
    CatalogAuditActions.CATALOG_BULK_DELETE,
    CatalogAuditActions.CATALOG_VALIDATION_FAIL,
    CatalogAuditActions.CATALOG_INTEGRITY_CHECK,
    CatalogAuditActions.CATALOG_REPAIR,
  ];
  
  return alertActions.includes(action);
};

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Extract user information from JWT token
 */
export const extractUserFromToken = (token: string): GraphQLUser | null => {
  try {
    // In practice, this would validate JWT and extract user info
    // For now, this is a placeholder
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      // Add other user fields as needed
    };
  } catch (error) {
    console.warn('Failed to extract user from token:', error);
    return null;
  }
};

/**
 * Create request metadata from GraphQL request
 */
export const createRequestMetadata = (req: Request, operationName?: string): RequestMetadata => {
  return {
    ip_address: req.ip || req.headers['x-forwarded-for'] as string || req.headers['x-real-ip'] as string || 'unknown',
    user_agent: req.headers['user-agent'] || 'unknown',
    request_id: req.headers['x-request-id'] as string || req.headers['x-correlation-id'] as string || crypto.randomUUID(),
    session_id: req.headers['x-session-id'] as string,
    correlation_id: req.headers['x-correlation-id'] as string,
    operation_name: operationName,
  };
};

// Export all types and utilities
export default {
  CatalogAuditActions,
  CatalogAuditResources,
  CatalogAuditMetadata,
  getCatalogActionSeverity,
  shouldAlertOnCatalogAction,
  extractUserFromToken,
  createRequestMetadata,
};