  // src/controllers/tenantProfileController.ts
  import { Request, Response } from 'express';
  import { captureException } from '../utils/sentry';
  import { SUPABASE_URL, validateSupabaseConfig } from '../utils/supabaseConfig';
  import { tenantProfileService } from '../services/tenantProfileService';

  /**
  * Get tenant profile for the current tenant
  */
  export const getTenantProfile = async (req: Request, res: Response) => {
    try {
      // Validate Supabase configuration
      if (!validateSupabaseConfig('api_tenant_profile', 'getTenantProfile')) {
        return res.status(500).json({ 
          error: 'Server configuration error: Missing Supabase configuration' 
        });
      }

      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      
      console.log('API getTenantProfile called with tenantId:', tenantId);
      
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is required' });
      }
      
      if (!tenantId) {
        return res.status(400).json({ error: 'x-tenant-id header is required' });
      }
      
      const profile = await tenantProfileService.getTenantProfile(authHeader, tenantId);
      return res.status(200).json(profile);
    } catch (error: any) {
      console.error('Error in getTenantProfile controller:', error.message);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'api_tenant_profile', action: 'getTenantProfile' },
        status: error.response?.status
      });

      const status = error.response?.status || 500;
      const message = error.response?.data?.error || error.message || 'An unknown error occurred';
      
      return res.status(status).json({ error: message });
    }
  };

  /**
  * Create a new tenant profile
  */
  export const createTenantProfile = async (req: Request, res: Response) => {
    try {
      // Validate Supabase configuration
      if (!validateSupabaseConfig('api_tenant_profile', 'createTenantProfile')) {
        return res.status(500).json({ 
          error: 'Server configuration error: Missing Supabase configuration' 
        });
      }

      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is required' });
      }
      
      if (!tenantId) {
        return res.status(400).json({ error: 'x-tenant-id header is required' });
      }
      
      // Basic validation
      if (!req.body.business_name) {
        return res.status(400).json({ error: 'business_name is required' });
      }
      
      // Set tenant ID in the request body
      req.body.tenant_id = tenantId;
      
      const profile = await tenantProfileService.createTenantProfile(authHeader, tenantId, req.body);
      return res.status(201).json(profile);
    } catch (error: any) {
      console.error('Error in createTenantProfile controller:', error.message);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'api_tenant_profile', action: 'createTenantProfile' },
        status: error.response?.status
      });

      const status = error.response?.status || 500;
      const message = error.response?.data?.error || error.message || 'An unknown error occurred';
      
      return res.status(status).json({ error: message });
    }
  };

  /**
  * Update an existing tenant profile
  */
  export const updateTenantProfile = async (req: Request, res: Response) => {
    try {
      // Validate Supabase configuration
      if (!validateSupabaseConfig('api_tenant_profile', 'updateTenantProfile')) {
        return res.status(500).json({ 
          error: 'Server configuration error: Missing Supabase configuration' 
        });
      }

      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is required' });
      }
      
      if (!tenantId) {
        return res.status(400).json({ error: 'x-tenant-id header is required' });
      }
      
      // Basic validation
      if (!req.body.business_name) {
        return res.status(400).json({ error: 'business_name is required' });
      }
      
      // Set tenant ID in the request body
      req.body.tenant_id = tenantId;
      
      const profile = await tenantProfileService.updateTenantProfile(authHeader, tenantId, req.body);
      return res.status(200).json(profile);
    } catch (error: any) {
      console.error('Error in updateTenantProfile controller:', error.message);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'api_tenant_profile', action: 'updateTenantProfile' },
        status: error.response?.status
      });

      const status = error.response?.status || 500;
      const message = error.response?.data?.error || error.message || 'An unknown error occurred';
      
      return res.status(status).json({ error: message });
    }
  };

  /**
  * Upload a logo for the tenant profile
  */
  export const uploadLogo = async (req: Request, res: Response) => {
    try {
      // Validate Supabase configuration
      if (!validateSupabaseConfig('api_tenant_profile', 'uploadLogo')) {
        return res.status(500).json({ 
          error: 'Server configuration error: Missing Supabase configuration' 
        });
      }

      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is required' });
      }
      
      if (!tenantId) {
        return res.status(400).json({ error: 'x-tenant-id header is required' });
      }
      
      // Check if a file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: 'No logo file provided' });
      }
      
      const logoUrl = await tenantProfileService.uploadLogo(authHeader, tenantId, req.file);
      return res.status(200).json({ url: logoUrl });
    } catch (error: any) {
      console.error('Error in uploadLogo controller:', error.message);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'api_tenant_profile', action: 'uploadLogo' },
        status: error.response?.status
      });

      const status = error.response?.status || 500;
      const message = error.response?.data?.error || error.message || 'An unknown error occurred';
      
      return res.status(status).json({ error: message });
    }
  };