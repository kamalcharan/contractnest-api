// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import { captureException } from '../utils/sentry';
import {
  getSupabaseClientFromRequest,
  getSupabaseUrlForProduct,
  getSupabaseKeyForProduct,
  validateProductSupabaseConfig
} from '../utils/supabaseConfig';

/**
 * Get the Edge Function prefix for a product
 * ContractNest uses 'auth', FamilyKnows uses 'FKauth'
 */
const getEdgeFunctionPrefix = (productCode: string): string => {
  switch (productCode.toLowerCase()) {
    case 'familyknows':
      return 'FKauth';
    case 'contractnest':
    default:
      return 'auth';
  }
};

/**
 * Get Supabase client for the product in the request
 * Falls back to contractnest if no product specified
 */
const getSupabaseClientForRequest = (req: Request): SupabaseClient => {
  const client = getSupabaseClientFromRequest(req);
  if (!client) {
    const productCode = (req as any).productCode || 'contractnest';
    throw new Error(`Supabase not configured for product: ${productCode}`);
  }
  return client;
};

/**
 * Get Supabase URL and Key for the product in the request
 */
const getSupabaseConfigForRequest = (req: Request): { url: string; key: string } => {
  const productCode = (req as any).productCode || 'contractnest';
  const url = getSupabaseUrlForProduct(productCode);
  const key = getSupabaseKeyForProduct(productCode);

  if (!url || !key) {
    throw new Error(`Supabase not configured for product: ${productCode}`);
  }

  return { url, key };
};

// Extend Request type to include user property
export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Check for authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Extract the token
    const token = authHeader.substring(7);

    // Store the token in the request for downstream use
    req.headers.authorization = authHeader;

    // Get product-specific configuration
    const productCode = (req as any).productCode || 'contractnest';

    try {
      // Get Supabase client for this product
      const supabaseClient = getSupabaseClientForRequest(req);

      // Try Supabase SDK verification (works for both Google OAuth and password users)
      const { data: { user }, error } = await supabaseClient.auth.getUser(token);

      if (!error && user) {
        console.log(`Authenticated via Supabase token (product: ${productCode})`);

        // Get product-specific Supabase config for Edge Function calls
        try {
          const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfigForRequest(req);
          const edgeFunctionPrefix = getEdgeFunctionPrefix(productCode);

          const response = await axios.get(
            `${SUPABASE_URL}/functions/v1/${edgeFunctionPrefix}/user`,
            {
              headers: {
                Authorization: authHeader,
                apikey: SUPABASE_KEY
              }
            }
          );

          // Merge Supabase user data with profile
          req.user = {
            id: user.id,
            email: user.email,
            ...response.data,
            // Include auth metadata
            user_metadata: user.user_metadata,
            app_metadata: user.app_metadata
          };

          return next();
        } catch (profileError: any) {
          console.error('Error fetching user profile:', profileError.message);
          // If profile fetch fails, still continue with basic user data
          req.user = {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
            app_metadata: user.app_metadata
          };
          return next();
        }
      }
    } catch (supabaseError) {
      console.error('Supabase token verification failed:', supabaseError);
      // If Supabase client initialization fails, try Edge Function directly
      try {
        const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfigForRequest(req);
        const edgeFunctionPrefix = getEdgeFunctionPrefix(productCode);

        const response = await axios.get(
          `${SUPABASE_URL}/functions/v1/${edgeFunctionPrefix}/user`,
          {
            headers: {
              Authorization: authHeader,
              apikey: SUPABASE_KEY
            }
          }
        );

        req.user = response.data;
        return next();
      } catch (edgeFunctionError: any) {
        console.error('Edge Function verification also failed:', edgeFunctionError.message);
      }
    }

    // If Supabase verification failed, token might be invalid
    return res.status(401).json({ error: 'Invalid or expired token' });

  } catch (error: any) {
    console.error('Auth middleware error:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', product: (req as any).productCode },
      path: req.path,
      operation: 'authenticate'
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to check for tenant access
export const requireTenant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get tenant ID from header
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    // Check if user has access to this tenant
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // For now, we trust the Edge Function has already verified tenant access
    // You could add additional verification here if needed

    next();
  } catch (error: any) {
    console.error('Tenant middleware error:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth' },
      operation: 'requireTenant',
      path: req.path,
      tenantId: req.headers['x-tenant-id']
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to check for specific roles
export const requireRole = (roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Get tenant ID from header
      const tenantId = req.headers['x-tenant-id'];
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID is required' });
      }

      // Check for user and authentication
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get product-specific Supabase config
      try {
        const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfigForRequest(req);

        const response = await axios.post(
          `${SUPABASE_URL}/functions/v1/tenant-roles/check`,
          {
            tenantId,
            roles
          },
          {
            headers: {
              Authorization: req.headers.authorization || '',
              apikey: SUPABASE_KEY
            }
          }
        );

        // If roles check out, proceed
        if (response.data.hasRoles) {
          next();
        } else {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
      } catch (error: any) {
        // If role check fails
        captureException(error instanceof Error ? error : new Error(String(error)), {
          tags: { source: 'api_auth', error_type: 'permission_denied', product: (req as any).productCode },
          operation: 'requireRole',
          path: req.path,
          roles: roles,
          status: error.response?.status
        });
        return res.status(403).json({ error: 'Permission denied' });
      }
    } catch (error: any) {
      console.error('Role middleware error:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'api_auth', product: (req as any).productCode },
        operation: 'requireRole',
        path: req.path,
        roles: roles
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Optional: Middleware for optional authentication (some endpoints may work with or without auth)
export const optionalAuthenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth provided, continue without user
      req.user = null;
      return next();
    }

    // If auth is provided, use the main authenticate logic
    const token = authHeader.substring(7);

    try {
      const supabaseClient = getSupabaseClientForRequest(req);
      const { data: { user }, error } = await supabaseClient.auth.getUser(token);

      if (!error && user) {
        // Try to get profile using product-specific config
        try {
          const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfigForRequest(req);
          const productCode = (req as any).productCode || 'contractnest';
          const edgeFunctionPrefix = getEdgeFunctionPrefix(productCode);

          const response = await axios.get(
            `${SUPABASE_URL}/functions/v1/${edgeFunctionPrefix}/user`,
            {
              headers: {
                Authorization: authHeader,
                apikey: SUPABASE_KEY
              }
            }
          );

          req.user = {
            id: user.id,
            email: user.email,
            ...response.data,
            user_metadata: user.user_metadata,
            app_metadata: user.app_metadata
          };
        } catch (profileError) {
          // If profile fetch fails, use basic data
          req.user = {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
            app_metadata: user.app_metadata
          };
        }
      } else {
        req.user = null;
      }
    } catch (error) {
      req.user = null;
    }

    next();
  } catch (error: any) {
    // On error, continue without auth
    console.error('Optional auth error:', error);
    req.user = null;
    next();
  }
};
