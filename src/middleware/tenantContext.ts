// src/middleware/tenantContext.ts
import { Request, Response, NextFunction } from 'express';
import { setTenantContext as setSentryTenantContext } from '../utils/sentry';

// Set tenant context from header or path
export const setTenantContext = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check tenant ID from header (preferred)
    let tenantId = req.headers['x-tenant-id'] as string;
    
    // If not in header, check if it's in path params (for certain routes)
    if (!tenantId && req.params.tenantId) {
      tenantId = req.params.tenantId;
    }
    
    // If we found a tenant ID, set it in the request headers for downstream use
    if (tenantId) {
      req.headers['x-tenant-id'] = tenantId;
      
      // Also set the tenant context in Sentry
      setSentryTenantContext(req);
    }
    
    next();
  } catch (error) {
    console.error('Error setting tenant context:', error);
    next();
  }
};