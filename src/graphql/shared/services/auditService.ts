// src/graphql/shared/services/auditService.ts
// Fixed version with proper TypeScript types

import { auditService } from '../../../services/auditService';
import { 
  AuditLogEntry, 
  AuditContext,
  AuditAction,
  AuditResource,
  AuditSeverity 
} from '../../../constants/auditConstants';
import {
  GraphQLAuditLogger,
  GraphQLContext,
  CatalogAuditAction,
  CatalogAuditResource,
  CatalogAuditActions,
  CatalogAuditResources,
  CatalogAuditMetadata,
  getCatalogActionSeverity,
  shouldAlertOnCatalogAction
} from '../types/catalogContext';

/**
 * GraphQL-specific audit logger that extends the existing API audit service
 * Provides convenience methods for GraphQL operations while maintaining consistency
 */
export class GraphQLAuditService implements GraphQLAuditLogger {
  private context: GraphQLContext;

  constructor(context: GraphQLContext) {
    this.context = context;
  }

  // =================================================================
  // CATALOG-SPECIFIC AUDIT METHODS
  // =================================================================

  /**
   * Log catalog-specific operations with enhanced metadata
   */
  async logCatalogOperation(
    action: CatalogAuditAction,
    resource: CatalogAuditResource,
    resourceId?: string,
    success: boolean = true,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const auditEntry: AuditLogEntry = {
        action: action as string,
        resource: resource as string,
        resourceId,
        success,
        error: errorMessage,
        severity: getCatalogActionSeverity(action),
        correlationId: this.context.metadata.correlation_id,
        metadata: {
          // GraphQL operation context
          graphql_operation: true,
          operation_name: this.context.metadata.operation_name,
          environment: this.context.tenant.is_live ? 'live' : 'test',
          tenant_id: this.context.tenant.id,
          user_id: this.context.user?.id,
          
          // Request metadata
          ip_address: this.context.metadata.ip_address,
          user_agent: this.context.metadata.user_agent,
          request_id: this.context.metadata.request_id,
          session_id: this.context.metadata.session_id,
          
          // Custom metadata
          ...metadata
        }
      };

      const auditContext = this.context.createAuditContext();
      await auditService.log(auditEntry, auditContext);

      // Check if this action should trigger alerts
      if (shouldAlertOnCatalogAction(action)) {
        console.warn('[CATALOG ALERT]', {
          action,
          severity: auditEntry.severity,
          tenant_id: this.context.tenant.id,
          user_id: this.context.user?.id,
          error: errorMessage
        });
      }

    } catch (error) {
      console.error('GraphQL audit logging failed:', error);
      // Don't throw - audit failures shouldn't break GraphQL operations
    }
  }

  /**
   * Log GraphQL operation (query/mutation/subscription)
   */
  async logGraphQLOperation(
    operationType: 'query' | 'mutation' | 'subscription',
    operationName: string,
    success: boolean,
    duration?: number,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const action = this.getGraphQLAuditAction(operationType);
    
    await this.logCatalogOperation(
      action,
      CatalogAuditResources.CATALOG,
      undefined,
      success,
      errorMessage,
      {
        ...CatalogAuditMetadata.graphqlOperation(operationType, operationName, this.context.metadata.variables),
        duration_ms: duration,
        ...metadata
      }
    );
  }

  /**
   * Log catalog item operations with automatic metadata
   */
  async logCatalogItem(
    action: CatalogAuditAction,
    item: any,
    success: boolean = true,
    errorMessage?: string,
    additionalMetadata?: Record<string, any>
  ): Promise<void> {
    await this.logCatalogOperation(
      action,
      CatalogAuditResources.CATALOG_ITEMS,
      item?.id,
      success,
      errorMessage,
      {
        ...CatalogAuditMetadata.catalogItem(item),
        ...additionalMetadata
      }
    );
  }

  /**
   * Log environment operations (Live/Test)
   */
  async logEnvironmentOperation(
    action: CatalogAuditAction,
    fromEnvironment: boolean, // true = live, false = test
    toEnvironment: boolean,   // true = live, false = test
    affectedCounts: {
      industries?: number;
      categories?: number;
      items?: number;
    },
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logCatalogOperation(
      action,
      CatalogAuditResources.CATALOG_ENVIRONMENT,
      undefined,
      success,
      errorMessage,
      {
        ...CatalogAuditMetadata.environment(this.context.tenant.id, fromEnvironment, toEnvironment),
        affected_industries: affectedCounts.industries,
        affected_categories: affectedCounts.categories,
        affected_items: affectedCounts.items,
        total_affected: (affectedCounts.industries || 0) + 
                       (affectedCounts.categories || 0) + 
                       (affectedCounts.items || 0)
      }
    );
  }

  /**
   * Log bulk operations with detailed metadata
   */
  async logBulkOperation(
    action: CatalogAuditAction,
    operationType: string,
    affectedCount: number,
    filters?: any,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logCatalogOperation(
      action,
      CatalogAuditResources.CATALOG_ITEMS,
      undefined,
      success,
      errorMessage,
      CatalogAuditMetadata.bulkOperation(operationType, affectedCount, filters)
    );
  }

  /**
   * Log search and query operations
   */
  async logSearchOperation(
    searchQuery: string,
    filters: any,
    resultCount: number,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logCatalogOperation(
      CatalogAuditActions.CATALOG_SEARCH,
      CatalogAuditResources.CATALOG_ITEMS,
      undefined,
      success,
      errorMessage,
      CatalogAuditMetadata.search(searchQuery, filters, resultCount)
    );
  }

  /**
   * Log pricing operations with change tracking
   */
  async logPricingOperation(
    action: CatalogAuditAction,
    itemId: string,
    oldPricing: any,
    newPricing: any,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logCatalogOperation(
      action,
      CatalogAuditResources.CATALOG_PRICING,
      itemId,
      success,
      errorMessage,
      CatalogAuditMetadata.pricing(oldPricing, newPricing)
    );
  }

  /**
   * Log version operations with version tracking
   */
  async logVersionOperation(
    action: CatalogAuditAction,
    itemId: string,
    currentVersion: number,
    newVersion: number,
    versionReason?: string,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logCatalogOperation(
      action,
      CatalogAuditResources.CATALOG_ITEMS,
      itemId,
      success,
      errorMessage,
      CatalogAuditMetadata.versioning(currentVersion, newVersion, versionReason)
    );
  }

  /**
   * Log operations with automatic timing and error handling
   */
  async logTimedOperation<T>(
    action: CatalogAuditAction,
    resource: CatalogAuditResource,
    resourceId: string | undefined,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      await this.logCatalogOperation(
        action,
        resource,
        resourceId,
        true,
        undefined,
        {
          ...metadata,
          duration_ms: duration,
          operation_timed: true
        }
      );
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      await this.logCatalogOperation(
        action,
        resource,
        resourceId,
        false,
        error.message || 'Operation failed',
        {
          ...metadata,
          duration_ms: duration,
          operation_timed: true,
          error_code: error.code,
          error_name: error.name,
          error_stack: this.context.config.environment === 'development' ? error.stack : undefined
        }
      );
      
      throw error; // Re-throw the original error
    }
  }

  // =================================================================
  // VALIDATION AND ERROR LOGGING
  // =================================================================

  /**
   * Log validation failures with detailed context
   */
  async logValidationFailure(
    resourceType: CatalogAuditResource,
    resourceId: string,
    validationErrors: any[],
    attemptedOperation: string
  ): Promise<void> {
    await this.logCatalogOperation(
      CatalogAuditActions.CATALOG_VALIDATION_FAIL,
      resourceType,
      resourceId,
      false,
      `Validation failed: ${validationErrors.map(e => e.message).join(', ')}`,
      {
        attempted_operation: attemptedOperation,
        validation_errors: validationErrors,
        error_count: validationErrors.length,
        is_validation_failure: true
      }
    );
  }

  /**
   * Log authentication/authorization failures
   */
  async logAuthFailure(
    reason: 'authentication' | 'authorization',
    attemptedAction: string,
    additionalDetails?: Record<string, any>
  ): Promise<void> {
    const action = reason === 'authentication' 
      ? AuditAction.UNAUTHORIZED_ACCESS 
      : AuditAction.UNAUTHORIZED_ACCESS;

    await this.logCatalogOperation(
      action as CatalogAuditAction,
      CatalogAuditResources.CATALOG,
      undefined,
      false,
      `${reason} failed for ${attemptedAction}`,
      {
        auth_failure_type: reason,
        attempted_action: attemptedAction,
        tenant_id: this.context.tenant?.id,
        user_id: this.context.user?.id,
        ...additionalDetails
      }
    );
  }

  // =================================================================
  // HELPER METHODS
  // =================================================================

  /**
   * Get appropriate audit action for GraphQL operation type
   */
  private getGraphQLAuditAction(operationType: string): CatalogAuditAction {
    switch (operationType) {
      case 'query':
        return CatalogAuditActions.CATALOG_GRAPHQL_QUERY;
      case 'mutation':
        return CatalogAuditActions.CATALOG_GRAPHQL_MUTATION;
      case 'subscription':
        return CatalogAuditActions.CATALOG_GRAPHQL_SUBSCRIPTION;
      default:
        return CatalogAuditActions.CATALOG_GRAPHQL_QUERY;
    }
  }

  /**
   * Create enhanced audit context for GraphQL operations
   */
  private createEnhancedAuditContext(): AuditContext {
    const baseContext = this.context.createAuditContext();
    
    return {
      ...baseContext,
      // Add GraphQL-specific context
      allTenantIds: this.context.user?.tenants?.map(t => t.id) || [this.context.tenant.id],
      isSuperAdmin: this.context.user?.is_super_admin || false,
      isTenantAdmin: this.context.tenant.user_is_admin,
    };
  }

  /**
   * Log system health and performance metrics
   */
  async logPerformanceMetrics(
    operationName: string,
    metrics: {
      duration: number;
      memory_usage?: number;
      query_count?: number;
      cache_hits?: number;
      cache_misses?: number;
    }
  ): Promise<void> {
    // Only log performance metrics in development or if explicitly enabled
    if (this.context.config.environment === 'development') {
      await this.logCatalogOperation(
        CatalogAuditActions.CATALOG_STATS_VIEW,
        CatalogAuditResources.CATALOG,
        undefined,
        true,
        undefined,
        {
          operation_name: operationName,
          performance_metrics: metrics,
          is_performance_log: true
        }
      );
    }
  }
}

// =================================================================
// AUDIT SERVICE FACTORY
// =================================================================

/**
 * Create GraphQL audit service from context
 */
export const createGraphQLAuditService = (context: GraphQLContext): GraphQLAuditService => {
  return new GraphQLAuditService(context);
};

/**
 * Audit middleware for GraphQL resolvers - FIXED VERSION
 * Automatically logs GraphQL operations
 */
export const withAudit = <TSource, TArgs, TContext extends GraphQLContext>(
  resolver: (source: TSource, args: TArgs, context: TContext, info: any) => Promise<any>,
  action: CatalogAuditAction,
  resource: CatalogAuditResource
) => {
  return async (source: TSource, args: TArgs, context: TContext, info: any) => {
    const auditService = createGraphQLAuditService(context);
    const startTime = Date.now();
    
    try {
      const result = await resolver(source, args, context, info);
      const duration = Date.now() - startTime;
      
      // Log successful operation
      await auditService.logCatalogOperation(
        action,
        resource,
        (args as any)?.id || (result as any)?.id,
        true,
        undefined,
        {
          resolver_name: info?.fieldName || 'unknown_field',
          duration_ms: duration,
          arguments: args,
          result_type: typeof result
        }
      );
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Log failed operation
      await auditService.logCatalogOperation(
        action,
        resource,
        (args as any)?.id,
        false,
        error.message,
        {
          resolver_name: info?.fieldName || 'unknown_field',
          duration_ms: duration,
          arguments: args,
          error_type: error.constructor.name,
          error_code: error.code
        }
      );
      
      throw error; // Re-throw for GraphQL error handling
    }
  };
};

// =================================================================
// AUDIT METRICS COLLECTOR
// =================================================================

/**
 * Collect and log aggregated audit metrics
 */
export class GraphQLAuditMetricsCollector {
  private static instance: GraphQLAuditMetricsCollector;
  private metrics: Map<string, any> = new Map();

  static getInstance(): GraphQLAuditMetricsCollector {
    if (!GraphQLAuditMetricsCollector.instance) {
      GraphQLAuditMetricsCollector.instance = new GraphQLAuditMetricsCollector();
    }
    return GraphQLAuditMetricsCollector.instance;
  }

  /**
   * Record operation metrics
   */
  recordOperation(
    operationType: string,
    operationName: string,
    duration: number,
    success: boolean
  ): void {
    const key = `${operationType}:${operationName}`;
    const existing = this.metrics.get(key) || {
      count: 0,
      total_duration: 0,
      success_count: 0,
      error_count: 0,
      avg_duration: 0
    };

    existing.count++;
    existing.total_duration += duration;
    if (success) {
      existing.success_count++;
    } else {
      existing.error_count++;
    }
    existing.avg_duration = existing.total_duration / existing.count;

    this.metrics.set(key, existing);
  }

  /**
   * Get current metrics
   */
  getMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    this.metrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset(): void {
    this.metrics.clear();
  }
}

// Export the main service and utilities
export default {
  GraphQLAuditService,
  createGraphQLAuditService,
  withAudit,
  GraphQLAuditMetricsCollector
};