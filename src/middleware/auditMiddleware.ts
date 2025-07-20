// src/middleware/auditMiddleware.ts
// Comprehensive audit middleware with multi-tenant support
// Provides automatic and manual audit logging capabilities

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { auditService } from '../services/auditService';
import { AuditAction, AuditResource, AuditSeverity, AuditLogEntry, AuditContext } from '../constants/auditConstants';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      auditContext?: AuditContext;
      correlationId?: string;
      startTime?: number;
    }
  }
}

/**
 * Middleware to create audit context from request
 * This should be applied after authentication middleware
 */
export const createAuditContext = (req: Request, res: Response, next: NextFunction) => {
  // Generate correlation ID for request tracking
  req.correlationId = req.headers['x-correlation-id'] as string || uuidv4();
  req.startTime = Date.now();
  
  // Build audit context from request
  const context: AuditContext = {
    tenantId: req.headers['x-tenant-id'] as string || '',
    userId: (req as any).user?.id,
    userEmail: (req as any).user?.email,
    sessionId: req.headers['x-session-id'] as string || (req as any).sessionID,
    ipAddress: req.ip || 
               (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
               req.headers['x-real-ip'] as string ||
               req.socket?.remoteAddress || 
               'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    allTenantIds: (req as any).user?.tenants?.map((t: any) => t.id),
    isSuperAdmin: (req as any).user?.is_admin || false,
    isTenantAdmin: (req as any).user?.current_tenant_admin || false
  };
  
  req.auditContext = context;
  
  // Add correlation ID to response headers for tracking
  res.setHeader('X-Correlation-Id', req.correlationId);
  
  next();
};

/**
 * Audit log configuration interface
 */
export interface AuditConfig {
  action: AuditAction | string;
  resource: AuditResource | string;
  getResourceId?: (req: Request, res: Response) => string | undefined;
  getMetadata?: (req: Request, res: Response) => Record<string, any>;
  skipOnError?: boolean;
  skipOnSuccess?: boolean;
  severity?: AuditSeverity;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  sanitizeFields?: string[]; // Fields to remove from request/response body
}

/**
 * Factory for automatic audit logging middleware
 */
export const auditLog = (config: AuditConfig) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if no audit context (allow middleware to work without createAuditContext)
    if (!req.auditContext) {
      console.warn('Audit context not found. Ensure createAuditContext middleware is applied first.');
      // Create a minimal context if missing
      req.auditContext = {
        tenantId: req.headers['x-tenant-id'] as string || 'unknown',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown'
      };
    }
    
    const originalSend = res.send;
    const originalJson = res.json;
    
    // Capture response data
    let responseData: any;
    let responseSize = 0;
    
    // Override response methods to capture data
    res.send = function(data: any): Response {
      responseData = data;
      if (typeof data === 'string') {
        responseSize = Buffer.byteLength(data);
      }
      res.send = originalSend;
      return res.send(data);
    };
    
    res.json = function(data: any): Response {
      responseData = data;
      responseSize = JSON.stringify(data).length;
      res.json = originalJson;
      return res.json(data);
    };
    
    // Continue to next middleware
    next();
    
    // After response is finished
    res.on('finish', async () => {
      const duration = Date.now() - (req.startTime || Date.now());
      const success = res.statusCode >= 200 && res.statusCode < 400;
      
      // Skip logging based on configuration
      if (success && config.skipOnSuccess) return;
      if (!success && config.skipOnError) return;
      
      try {
        // Sanitize request body if needed
        let sanitizedRequestBody = undefined;
        if (config.includeRequestBody && req.body) {
          sanitizedRequestBody = sanitizeData(req.body, config.sanitizeFields || []);
        }
        
        // Sanitize response body if needed
        let sanitizedResponseBody = undefined;
        if (config.includeResponseBody && responseData) {
          sanitizedResponseBody = sanitizeData(responseData, config.sanitizeFields || []);
        }
        
        // Build metadata
        const metadata: Record<string, any> = {
          method: req.method,
          path: req.path,
          query: req.query,
          statusCode: res.statusCode,
          duration,
          responseSize,
          correlationId: req.correlationId,
          ...config.getMetadata?.(req, res)
        };
        
        if (sanitizedRequestBody) {
          metadata.requestBody = sanitizedRequestBody;
        }
        
        if (sanitizedResponseBody) {
          metadata.responseBody = sanitizedResponseBody;
        }
        
        // Create audit entry
        const entry: AuditLogEntry = {
          action: config.action,
          resource: config.resource,
          resourceId: config.getResourceId?.(req, res),
          metadata,
          success,
          error: !success ? (responseData?.error || responseData?.message || 'Request failed') : undefined,
          severity: !success ? AuditSeverity.ERROR : (config.severity || AuditSeverity.INFO),
          correlationId: req.correlationId
        };
        
        await auditService.log(entry, req.auditContext!);
      } catch (error) {
        console.error('Audit middleware error:', error);
        // Don't let audit failures break the app
      }
    });
  };
};

/**
 * Manual audit logging helper
 */
export const logAudit = async (
  req: Request,
  entry: Omit<AuditLogEntry, 'correlationId'>
): Promise<void> => {
  if (!req.auditContext) {
    console.warn('Cannot log audit: context not found. Creating minimal context.');
    // Create minimal context if missing
    req.auditContext = {
      tenantId: req.headers['x-tenant-id'] as string || 'unknown',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };
  }
  
  try {
    await auditService.log(
      {
        ...entry,
        correlationId: req.correlationId
      },
      req.auditContext
    );
  } catch (error) {
    console.error('Manual audit logging failed:', error);
  }
};

/**
 * Audit common API actions
 */
export const auditApiAction = (
  action: AuditAction,
  resource: AuditResource,
  options?: Partial<AuditConfig>
) => {
  return auditLog({
    action,
    resource,
    includeRequestBody: true,
    sanitizeFields: ['password', 'token', 'secret', 'apiKey'],
    ...options
  });
};

/**
 * Audit authentication events
 */
export const auditAuth = (action: AuditAction, options?: Partial<AuditConfig>) => {
  return auditLog({
    action,
    resource: AuditResource.AUTH,
    severity: [AuditAction.LOGIN, AuditAction.LOGOUT].includes(action) 
      ? AuditSeverity.INFO 
      : AuditSeverity.WARNING,
    getMetadata: (req) => ({
      email: req.body?.email,
      method: req.body?.method || 'email'
    }),
    sanitizeFields: ['password', 'token'],
    ...options
  });
};

/**
 * Audit file operations
 */
export const auditFileOperation = (action: AuditAction, options?: Partial<AuditConfig>) => {
  return auditLog({
    action,
    resource: AuditResource.STORAGE,
    getResourceId: (req) => req.params?.fileId,
    getMetadata: (req) => ({
      fileName: (req as any).file?.originalname,
      fileSize: (req as any).file?.size,
      fileType: (req as any).file?.mimetype,
      category: req.body?.category
    }),
    ...options
  });
};

/**
 * Sanitize sensitive data from objects
 */
function sanitizeData(data: any, fieldsToRemove: string[]): any {
  if (!data || typeof data !== 'object') return data;
  
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  
  // Remove sensitive fields
  fieldsToRemove.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  // Recursively sanitize nested objects
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeData(sanitized[key], fieldsToRemove);
    }
  });
  
  return sanitized;
}

/**
 * Error boundary for audit logging
 */
export const auditErrorBoundary = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log system errors
  if (req.auditContext) {
    logAudit(req, {
      action: AuditAction.SYSTEM_ERROR,
      resource: AuditResource.SYSTEM,
      success: false,
      error: err.message,
      severity: AuditSeverity.CRITICAL,
      metadata: {
        stack: err.stack,
        path: req.path,
        method: req.method
      }
    }).catch(console.error);
  }
  
  next(err);
};