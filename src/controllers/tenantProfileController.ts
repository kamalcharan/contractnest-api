// src/controllers/tenantProfileController.ts
// UPDATED: Added idempotency key support and optimistic lock conflict handling
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
* Create a new tenant profile (with idempotency support)
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
    const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;

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

    const profile = await tenantProfileService.createTenantProfile(
      authHeader,
      tenantId,
      req.body,
      idempotencyKey
    );
    return res.status(201).json(profile);
  } catch (error: any) {
    console.error('Error in createTenantProfile controller:', error.message);

    // Handle duplicate/concurrent request
    if (error.message?.includes('Duplicate request') || error.message?.includes('already being processed')) {
      return res.status(409).json({
        error: 'Request is already being processed',
        code: 'DUPLICATE_REQUEST'
      });
    }

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
* Update an existing tenant profile (with idempotency support and optimistic locking)
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
    const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;

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

    const profile = await tenantProfileService.updateTenantProfile(
      authHeader,
      tenantId,
      req.body,
      idempotencyKey
    );
    return res.status(200).json(profile);
  } catch (error: any) {
    console.error('Error in updateTenantProfile controller:', error.message);

    // Handle optimistic lock conflict
    if (error.status === 409 || error.response?.status === 409) {
      return res.status(409).json({
        error: 'Profile was modified by another session. Please refresh and try again.',
        code: 'OPTIMISTIC_LOCK_CONFLICT'
      });
    }

    // Handle duplicate/concurrent request
    if (error.message?.includes('Duplicate request') || error.message?.includes('already being processed')) {
      return res.status(409).json({
        error: 'Request is already being processed',
        code: 'DUPLICATE_REQUEST'
      });
    }

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenant_profile', action: 'updateTenantProfile' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';

    return res.status(status).json({ error: message });
  }
};

// =========================================================================
// SERVED INDUSTRIES CONTROLLERS
// =========================================================================

/**
* Get all industries this tenant serves
*/
export const getServedIndustries = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_tenant_profile', 'getServedIndustries')) {
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

    const result = await tenantProfileService.getServedIndustries(authHeader, tenantId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getServedIndustries controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenant_profile', action: 'getServedIndustries' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';

    return res.status(status).json({ error: message });
  }
};

/**
* Add one or more served industries
*/
export const addServedIndustries = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_tenant_profile', 'addServedIndustries')) {
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

    const { industry_ids } = req.body;

    if (!industry_ids || !Array.isArray(industry_ids) || industry_ids.length === 0) {
      return res.status(400).json({ error: 'industry_ids must be a non-empty array of strings' });
    }

    if (industry_ids.length > 20) {
      return res.status(400).json({ error: 'Cannot add more than 20 industries at once' });
    }

    // Validate each ID is a non-empty string
    for (const id of industry_ids) {
      if (typeof id !== 'string' || id.trim().length === 0) {
        return res.status(400).json({ error: 'Each industry_id must be a non-empty string' });
      }
    }

    const result = await tenantProfileService.addServedIndustries(authHeader, tenantId, industry_ids);
    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Error in addServedIndustries controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenant_profile', action: 'addServedIndustries' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';

    return res.status(status).json({ error: message });
  }
};

/**
* Remove a served industry
*/
export const removeServedIndustry = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_tenant_profile', 'removeServedIndustry')) {
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

    const { industryId } = req.params;

    if (!industryId || industryId.trim().length === 0) {
      return res.status(400).json({ error: 'industryId path parameter is required' });
    }

    const result = await tenantProfileService.removeServedIndustry(authHeader, tenantId, industryId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in removeServedIndustry controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenant_profile', action: 'removeServedIndustry' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';

    return res.status(status).json({ error: message });
  }
};

/**
* Get unlock preview - template counts unlocked by served industries
*/
export const getUnlockPreview = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_tenant_profile', 'getUnlockPreview')) {
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

    const result = await tenantProfileService.getUnlockPreview(authHeader, tenantId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getUnlockPreview controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenant_profile', action: 'getUnlockPreview' },
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
