// src/middleware/serviceCatalogAuth.ts
// 🚀 Service Catalog Authentication & Authorization Middleware - Secure Service Catalog operations

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthRequest } from './auth';
import {
  ServiceCatalogServiceContext,
  OperationType
} from '../types/serviceCatalogGraphQL';

// =================================================================
// TYPES AND INTERFACES
// =================================================================

interface ServiceCatalogPermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canBulkOperations: boolean;
  canManageResources: boolean;
  canManagePricing: boolean;
  canAccessMasterData: boolean;
  environmentRestrictions: {
    canAccessProduction: boolean;
    canAccessTest: boolean;
    canSwitchEnvironments: boolean;
  };
}

interface ServiceCatalogRoleConfig {
  [role: string]: ServiceCatalogPermissions;
}

interface ServiceCatalogAuthContext extends ServiceCatalogServiceContext {
  permissions: ServiceCatalogPermissions;
  ipAddress: string;
  userAgent: string;
  clientVersion?: string;
}

// =================================================================
// ROLE-BASED PERMISSIONS CONFIGURATION
// =================================================================

const DEFAULT_SERVICE_CATALOG_ROLES: ServiceCatalogRoleConfig = {
  // Super Admin - Full access to everything
  'super_admin': {
    canRead: true,
    canWrite: true,
    canDelete: true,
    canBulkOperations: true,
    canManageResources: true,
    canManagePricing: true,
    canAccessMasterData: true,
    environmentRestrictions: {
      canAccessProduction: true,
      canAccessTest: true,
      canSwitchEnvironments: true
    }
  },

  // Service Catalog Admin - Full service catalog access
  'service_catalog_admin': {
    canRead: true,
    canWrite: true,
    canDelete: true,
    canBulkOperations: true,
    canManageResources: true,
    canManagePricing: true,
    canAccessMasterData: true,
    environmentRestrictions: {
      canAccessProduction: true,
      canAccessTest: true,
      canSwitchEnvironments: true
    }
  },

  // Service Catalog Manager - Limited admin access
  'service_catalog_manager': {
    canRead: true,
    canWrite: true,
    canDelete: false, // Cannot delete services
    canBulkOperations: true,
    canManageResources: true,
    canManagePricing: true,
    canAccessMasterData: true,
    environmentRestrictions: {
      canAccessProduction: false, // Production access restricted
      canAccessTest: true,
      canSwitchEnvironments: false
    }
  },

  // Service Catalog Editor - Content management
  'service_catalog_editor': {
    canRead: true,
    canWrite: true,
    canDelete: false,
    canBulkOperations: false, // No bulk operations
    canManageResources: true,
    canManagePricing: false, // Cannot manage pricing
    canAccessMasterData: true,
    environmentRestrictions: {
      canAccessProduction: false,
      canAccessTest: true,
      canSwitchEnvironments: false
    }
  },

  // Service Catalog Viewer - Read-only access
  'service_catalog_viewer': {
    canRead: true,
    canWrite: false,
    canDelete: false,
    canBulkOperations: false,
    canManageResources: false,
    canManagePricing: false,
    canAccessMasterData: true,
    environmentRestrictions: {
      canAccessProduction: true, // Can view production data
      canAccessTest: true,
      canSwitchEnvironments: false
    }
  },

  // Service Catalog API - For system integration
  'service_catalog_api': {
    canRead: true,
    canWrite: true,
    canDelete: false,
    canBulkOperations: true,
    canManageResources: true,
    canManagePricing: false,
    canAccessMasterData: true,
    environmentRestrictions: {
      canAccessProduction: true,
      canAccessTest: true,
      canSwitchEnvironments: true
    }
  },

  // Default role for authenticated users
  'user': {
    canRead: true,
    canWrite: false,
    canDelete: false,
    canBulkOperations: false,
    canManageResources: false,
    canManagePricing: false,
    canAccessMasterData: true,
    environmentRestrictions: {
      canAccessProduction: false,
      canAccessTest: true,
      canSwitchEnvironments: false
    }
  }
};

// =================================================================
// RATE LIMITING CONFIGURATION
// =================================================================

const SERVICE_CATALOG_RATE_LIMITS = {
  // Query operations (more lenient)
  query: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window
    message: {
      success: false,
      error: 'Too many Service Catalog query requests',
      code: 'QUERY_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
  }),

  // Mutation operations (more restrictive)
  mutation: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: {
      success: false,
      error: 'Too many Service Catalog mutation requests',
      code: 'MUTATION_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
  }),

  // Bulk operations (most restrictive)
  bulk: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per hour
    message: {
      success: false,
      error: 'Too many Service Catalog bulk requests',
      code: 'BULK_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
  })
};

// =================================================================
// SERVICE CATALOG AUTH MIDDLEWARE CLASS
// =================================================================

export class ServiceCatalogAuthMiddleware {
  private roleConfig: ServiceCatalogRoleConfig;

  constructor(customRoleConfig?: Partial<ServiceCatalogRoleConfig>) {
    this.roleConfig = {
      ...DEFAULT_SERVICE_CATALOG_ROLES,
      ...customRoleConfig
    };

    console.log('🔐 ServiceCatalogAuthMiddleware initialized with', Object.keys(this.roleConfig).length, 'roles');
  }

  // =================================================================
  // AUTHENTICATION MIDDLEWARE
  // =================================================================

  /**
   * Validate Service Catalog authentication
   */
  authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
    console.log('🔐 ServiceCatalog Authentication:', {
      method: req.method,
      path: req.path,
      hasUser: !!req.user,
      tenantId: req.headers['x-tenant-id']
    });

    // Check if user is authenticated
    if (!req.user) {
      return this.sendAuthError(res, 'Authentication required', 'UNAUTHENTICATED');
    }

    // Check if tenant context is provided
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return this.sendAuthError(res, 'Tenant context required', 'MISSING_TENANT_CONTEXT');
    }

    // Validate tenant access
    if (!this.validateTenantAccess(req.user, tenantId)) {
      return this.sendAuthError(res, 'Tenant access denied', 'TENANT_ACCESS_DENIED');
    }

    // Add Service Catalog context to request
    req.serviceCatalogContext = this.createServiceCatalogContext(req);

    console.log('✅ ServiceCatalog Authentication successful:', {
      userId: req.user.id,
      tenantId,
      userRole: req.serviceCatalogContext.permissions
    });

    next();
  };

  // =================================================================
  // AUTHORIZATION MIDDLEWARE
  // =================================================================

  /**
   * Validate Service Catalog permissions for operations
   */
  authorize = (requiredOperation: OperationType) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
      console.log('🔐 ServiceCatalog Authorization:', {
        operation: requiredOperation,
        userId: req.user?.id,
        userRole: req.headers['x-user-role']
      });

      if (!req.serviceCatalogContext) {
        return this.sendAuthError(res, 'Service Catalog context missing', 'MISSING_CONTEXT');
      }

      const permissions = req.serviceCatalogContext.permissions;
      
      // Check operation-specific permissions
      if (!this.hasOperationPermission(permissions, requiredOperation)) {
        return this.sendAuthError(res, `Insufficient permissions for ${requiredOperation}`, 'INSUFFICIENT_PERMISSIONS');
      }

      // Check environment-specific permissions
      const isLive = this.getEnvironmentFromRequest(req);
      if (!this.hasEnvironmentPermission(permissions, isLive)) {
        return this.sendAuthError(res, 
          `Access denied to ${isLive ? 'production' : 'test'} environment`, 
          'ENVIRONMENT_ACCESS_DENIED'
        );
      }

      console.log('✅ ServiceCatalog Authorization successful:', {
        operation: requiredOperation,
        environment: isLive ? 'production' : 'test'
      });

      next();
    };
  };

  // =================================================================
  // RATE LIMITING MIDDLEWARE
  // =================================================================

  /**
   * Apply rate limiting based on operation type
   */
  rateLimitByOperation = (operationType: 'query' | 'mutation' | 'bulk') => {
    return SERVICE_CATALOG_RATE_LIMITS[operationType];
  };

  // =================================================================
  // ENVIRONMENT VALIDATION MIDDLEWARE
  // =================================================================

  /**
   * Validate environment access and context
   */
  validateEnvironment = (req: AuthRequest, res: Response, next: NextFunction): void => {
    console.log('🔐 ServiceCatalog Environment Validation');

    if (!req.serviceCatalogContext) {
      return this.sendAuthError(res, 'Service Catalog context missing', 'MISSING_CONTEXT');
    }

    const isLive = this.getEnvironmentFromRequest(req);
    const permissions = req.serviceCatalogContext.permissions;

    // Production environment additional checks
    if (isLive) {
      // Check if user can access production
      if (!permissions.environmentRestrictions.canAccessProduction) {
        return this.sendAuthError(res, 'Production environment access denied', 'PRODUCTION_ACCESS_DENIED');
      }

      // Additional production safeguards
      if (req.method !== 'GET' && !this.isProductionSafeOperation(req)) {
        return this.sendAuthError(res, 'Operation not allowed in production environment', 'PRODUCTION_OPERATION_BLOCKED');
      }
    }

    console.log('✅ ServiceCatalog Environment validation successful:', {
      environment: isLive ? 'production' : 'test',
      method: req.method
    });

    next();
  };

  // =================================================================
  // TENANT ISOLATION MIDDLEWARE
  // =================================================================

  /**
   * Ensure proper tenant data isolation
   */
  ensureTenantIsolation = (req: AuthRequest, res: Response, next: NextFunction): void => {
    console.log('🔐 ServiceCatalog Tenant Isolation Check');

    if (!req.serviceCatalogContext) {
      return this.sendAuthError(res, 'Service Catalog context missing', 'MISSING_CONTEXT');
    }

    // Validate tenant consistency
    const headerTenantId = req.headers['x-tenant-id'] as string;
    const contextTenantId = req.serviceCatalogContext.tenantId;

    if (headerTenantId !== contextTenantId) {
      return this.sendAuthError(res, 'Tenant ID mismatch detected', 'TENANT_ID_MISMATCH');
    }

    // Add tenant validation headers
    res.setHeader('x-tenant-validated', contextTenantId);
    res.setHeader('x-environment-validated', req.serviceCatalogContext.isLive ? 'production' : 'test');

    console.log('✅ ServiceCatalog Tenant isolation validated:', {
      tenantId: contextTenantId,
      environment: req.serviceCatalogContext.isLive ? 'production' : 'test'
    });

    next();
  };

  // =================================================================
  // AUDIT LOGGING MIDDLEWARE
  // =================================================================

  /**
   * Log Service Catalog operations for audit trail
   */
  auditLog = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const originalSend = res.send;

    // Override res.send to capture response
    res.send = function(data: any) {
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Log the operation
      console.log('📋 ServiceCatalog Audit Log:', {
        timestamp: new Date().toISOString(),
        userId: req.user?.id,
        tenantId: req.serviceCatalogContext?.tenantId,
        environment: req.serviceCatalogContext?.isLive ? 'production' : 'test',
        method: req.method,
        path: req.path,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.connection.remoteAddress,
        executionTimeMs: executionTime,
        statusCode: res.statusCode,
        success: res.statusCode < 400
      });

      return originalSend.call(this, data);
    };

    next();
  };

  // =================================================================
  // PRIVATE HELPER METHODS
  // =================================================================

  private createServiceCatalogContext(req: AuthRequest): ServiceCatalogAuthContext {
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.user!.id;
    const userRole = this.getUserRole(req);
    const isLive = this.getEnvironmentFromRequest(req);
    const permissions = this.getPermissions(userRole);

    return {
      tenantId,
      userId,
      isLive,
      requestId: this.generateRequestId(),
      userRole,
      clientVersion: req.headers['x-client-version'] as string,
      permissions,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };
  }

  private getUserRole(req: AuthRequest): string {
    // Get role from headers, user object, or default to 'user'
    return (req.headers['x-user-role'] as string) || 
           req.user?.role || 
           'user';
  }

  private getEnvironmentFromRequest(req: AuthRequest): boolean {
    const environment = req.headers['x-environment'] as string || 'test';
    return environment.toLowerCase() === 'production';
  }

  private getPermissions(role: string): ServiceCatalogPermissions {
    return this.roleConfig[role] || this.roleConfig['user'];
  }

  private validateTenantAccess(user: any, tenantId: string): boolean {
    // Implement tenant validation logic
    // For now, assume user has access if they're authenticated
    // In real implementation, check user's tenant associations
    return !!user && !!tenantId;
  }

  private hasOperationPermission(permissions: ServiceCatalogPermissions, operation: OperationType): boolean {
    switch (operation) {
      case OperationType.CREATE:
        return permissions.canWrite;
      case OperationType.UPDATE:
        return permissions.canWrite;
      case OperationType.DELETE:
        return permissions.canDelete;
      case OperationType.BULK_CREATE:
      case OperationType.BULK_UPDATE:
        return permissions.canBulkOperations;
      case OperationType.ASSOCIATE_RESOURCES:
        return permissions.canManageResources;
      case OperationType.UPDATE_PRICING:
        return permissions.canManagePricing;
      default:
        return permissions.canRead;
    }
  }

  private hasEnvironmentPermission(permissions: ServiceCatalogPermissions, isLive: boolean): boolean {
    return isLive ? 
      permissions.environmentRestrictions.canAccessProduction : 
      permissions.environmentRestrictions.canAccessTest;
  }

  private isProductionSafeOperation(req: AuthRequest): boolean {
    // Define production-safe operations
    const safeOperations = [
      'serviceCatalogItem', // Single item queries
      'serviceCatalogItems', // List queries
      'serviceCatalogMasterData', // Master data queries
      'availableResources', // Resource queries
      'serviceResources', // Service resource queries
      'serviceCatalogHealth' // Health checks
    ];

    // Check if GraphQL operation is production-safe
    const operationName = req.body?.operationName || req.body?.query?.match(/^\s*query\s+(\w+)/)?.[1] || 'unknown';
    return safeOperations.includes(operationName);
  }

  private generateRequestId(): string {
    return `sc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sendAuthError(res: Response, message: string, code: string): void {
    res.status(403).json({
      success: false,
      error: message,
      code: code,
      timestamp: new Date().toISOString()
    });
  }

  // =================================================================
  // PUBLIC CONFIGURATION METHODS
  // =================================================================

  /**
   * Add or update role configuration
   */
  addRole(roleName: string, permissions: ServiceCatalogPermissions): void {
    this.roleConfig[roleName] = permissions;
    console.log(`📝 ServiceCatalog role '${roleName}' configured`);
  }

  /**
   * Remove role configuration
   */
  removeRole(roleName: string): void {
    delete this.roleConfig[roleName];
    console.log(`🗑️ ServiceCatalog role '${roleName}' removed`);
  }

  /**
   * Get current role configuration
   */
  getRoleConfig(): ServiceCatalogRoleConfig {
    return { ...this.roleConfig };
  }
}

// =================================================================
// MIDDLEWARE FACTORY FUNCTIONS
// =================================================================

/**
 * Create Service Catalog authentication middleware
 */
export function createServiceCatalogAuthMiddleware(
  customRoleConfig?: Partial<ServiceCatalogRoleConfig>
): ServiceCatalogAuthMiddleware {
  return new ServiceCatalogAuthMiddleware(customRoleConfig);
}

/**
 * Create production-ready Service Catalog middleware with strict security
 */
export function createProductionServiceCatalogAuth(): ServiceCatalogAuthMiddleware {
  const productionRoles: Partial<ServiceCatalogRoleConfig> = {
    // More restrictive production roles
    'service_catalog_manager': {
      ...DEFAULT_SERVICE_CATALOG_ROLES['service_catalog_manager'],
      canBulkOperations: false, // Disable bulk operations in production
      environmentRestrictions: {
        canAccessProduction: false,
        canAccessTest: true,
        canSwitchEnvironments: false
      }
    }
  };

  return new ServiceCatalogAuthMiddleware(productionRoles);
}

/**
 * Create development-friendly Service Catalog middleware with relaxed security
 */
export function createDevelopmentServiceCatalogAuth(): ServiceCatalogAuthMiddleware {
  const developmentRoles: Partial<ServiceCatalogRoleConfig> = {
    // More permissive development roles
    'user': {
      ...DEFAULT_SERVICE_CATALOG_ROLES['user'],
      canWrite: true, // Allow writing in development
      canAccessMasterData: true,
      environmentRestrictions: {
        canAccessProduction: false,
        canAccessTest: true,
        canSwitchEnvironments: false
      }
    }
  };

  return new ServiceCatalogAuthMiddleware(developmentRoles);
}

// =================================================================
// EXTEND AUTH REQUEST INTERFACE
// =================================================================

declare global {
  namespace Express {
    interface Request {
      serviceCatalogContext?: ServiceCatalogAuthContext;
    }
  }
}

export default ServiceCatalogAuthMiddleware;