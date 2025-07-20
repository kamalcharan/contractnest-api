// src/controllers/planVersionController.ts

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { captureException } from '../utils/sentry';
import { businessModelService } from '../services/businessModelService';
import { validateSupabaseConfig } from '../utils/supabaseConfig';

/**
 * Get all versions for a plan
 */
export const getPlanVersions = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_businessModel', 'getPlanVersions')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const planId = req.query.planId as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!planId) {
      return res.status(400).json({ error: 'planId query parameter is required' });
    }
    
    const versions = await businessModelService.getPlanVersions(
      authHeader, 
      tenantId, 
      planId
    );
    
    return res.status(200).json(versions);
  } catch (error: any) {
    console.error('Error in getPlanVersions controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'getPlanVersions' },
      status: error.response?.status,
      planId: req.query.planId
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Get a specific plan version
 * Note: This is rarely used now as versions are mainly accessed through plan details
 */
export const getPlanVersion = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_businessModel', 'getPlanVersion')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const versionId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const version = await businessModelService.getPlanVersion(
      authHeader, 
      tenantId, 
      versionId
    );
    
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    return res.status(200).json(version);
  } catch (error: any) {
    console.error('Error in getPlanVersion controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'getPlanVersion' },
      status: error.response?.status,
      versionId: req.params.id
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Activate a plan version
 */
export const activatePlanVersion = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_businessModel', 'activatePlanVersion')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const versionId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const version = await businessModelService.activatePlanVersion(
      authHeader, 
      tenantId, 
      versionId
    );
    
    return res.status(200).json(version);
  } catch (error: any) {
    console.error('Error in activatePlanVersion controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'activatePlanVersion' },
      status: error.response?.status,
      versionId: req.params.id
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Create a new plan version
 * NOTE: This is the original function that still works but is not used in the new workflow
 */
export const createPlanVersion = async (req: Request, res: Response) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_businessModel', 'createPlanVersion')) {
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
    
    // This endpoint is deprecated - redirect to edit workflow
    console.warn('Direct version creation attempted. Should use edit workflow.');
    
    return res.status(400).json({ 
      error: 'Direct version creation is not supported. Please use the plan edit workflow.',
      hint: 'Use GET /plans/:id/edit followed by POST /plans/edit'
    });
  } catch (error: any) {
    console.error('Error in createPlanVersion controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'createPlanVersion' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Compare two plan versions
 * NOTE: This is the original function that is no longer supported
 */
export const compareVersions = async (req: Request, res: Response) => {
  return res.status(410).json({ 
    error: 'Version comparison feature has been removed.',
    deprecated: true
  });
};

/**
 * DEPRECATED: Create a new plan version
 * Versions should now be created through the edit workflow
 */
export const createPlanVersionDeprecated = async (req: Request, res: Response) => {
  console.warn('DEPRECATED: createPlanVersion endpoint called. Use edit workflow instead.');
  
  return res.status(410).json({ 
    error: 'This endpoint is deprecated. Please use the plan edit workflow to create new versions.',
    deprecated: true,
    alternative: 'POST /api/business-model/plans/edit'
  });
};

/**
 * DEPRECATED: Compare two plan versions
 * Comparison feature has been removed
 */
export const compareVersionsDeprecated = async (req: Request, res: Response) => {
  console.warn('DEPRECATED: compareVersions endpoint called. This feature has been removed.');
  
  return res.status(410).json({ 
    error: 'Version comparison feature has been removed.',
    deprecated: true
  });
};
