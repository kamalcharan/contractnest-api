// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import { captureException } from '../utils/sentry';

// Lazy initialize Supabase client
let supabase: SupabaseClient | null = null;

const getSupabaseClient = () => {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY; // Fallback to SUPABASE_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration:', {
        url: !!supabaseUrl,
        key: !!supabaseKey,
        env: process.env.NODE_ENV
      });
      throw new Error('Missing Supabase configuration');
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
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
    
    try {
      // Get Supabase client
      const supabaseClient = getSupabaseClient();
      
      // Try Supabase SDK verification (works for both Google OAuth and password users)
      const { data: { user }, error } = await supabaseClient.auth.getUser(token);
      
      if (!error && user) {
        console.log('Authenticated via Supabase token');
        
        // Get user profile from database using Edge Function
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
        
        if (!SUPABASE_URL || !SUPABASE_KEY) {
          console.error('Missing Supabase URL or KEY for Edge Function call');
          // Still continue with basic user data
          req.user = {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
            app_metadata: user.app_metadata
          };
          return next();
        }
        
        try {
          const response = await axios.get(
            `${SUPABASE_URL}/functions/v1/auth/user`,
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
      const SUPABASE_URL = process.env.SUPABASE_URL;
      const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
      
      if (SUPABASE_URL && SUPABASE_KEY) {
        try {
          const response = await axios.get(
            `${SUPABASE_URL}/functions/v1/auth/user`,
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
    }
    
    // If Supabase verification failed, token might be invalid
    return res.status(401).json({ error: 'Invalid or expired token' });
    
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth' },
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
      
      // Call Edge Function to check roles
      const SUPABASE_URL = process.env.SUPABASE_URL;
      
      if (!SUPABASE_URL) {
        captureException(new Error('Missing SUPABASE_URL environment variable'), {
          tags: { source: 'api_auth' },
          operation: 'requireRole',
          path: req.path
        });
        return res.status(500).json({ error: 'Server configuration error' });
      }
      
      try {
        const response = await axios.post(
          `${SUPABASE_URL}/functions/v1/tenant-roles/check`,
          {
            tenantId,
            roles
          },
          {
            headers: {
              Authorization: req.headers.authorization || '',
              apikey: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY
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
          tags: { source: 'api_auth', error_type: 'permission_denied' },
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
        tags: { source: 'api_auth' },
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
      const supabaseClient = getSupabaseClient();
      const { data: { user }, error } = await supabaseClient.auth.getUser(token);
      
      if (!error && user) {
        // Try to get profile
        const SUPABASE_URL = process.env.SUPABASE_URL;
        
        if (SUPABASE_URL) {
          try {
            const response = await axios.get(
              `${SUPABASE_URL}/functions/v1/auth/user`,
              { 
                headers: { 
                  Authorization: authHeader,
                  apikey: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY
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