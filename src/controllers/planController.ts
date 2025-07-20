// src/controllers/planController.ts - CORRECTED VERSION

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { captureException } from '../utils/sentry';
import { businessModelService } from '../services/businessModelService';
import { validateSupabaseConfig } from '../utils/supabaseConfig';

/**
 * Get all pricing plans with optional filtering
 */
export const getPlans = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_businessModel', 'getPlans')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const showArchived = req.query.showArchived === 'true';
    const planType = req.query.planType as string | undefined;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const plans = await businessModelService.getPlans(
      authHeader, 
      tenantId, 
      showArchived, 
      planType
    );
    
    return res.status(200).json(plans);
  } catch (error: any) {
    console.error('Error in getPlans controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'getPlans' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Get a specific pricing plan by ID
 */
export const getPlan = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_businessModel', 'getPlan')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const planId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const plan = await businessModelService.getPlan(
      authHeader, 
      tenantId, 
      planId
    );
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    return res.status(200).json(plan);
  } catch (error: any) {
    console.error('Error in getPlan controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'getPlan' },
      status: error.response?.status,
      planId: req.params.id
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Get plan data for editing (with suggested version number)
 */
export const getPlanForEdit = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_businessModel', 'getPlanForEdit')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const planId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const editData = await businessModelService.getPlanForEdit(
      authHeader, 
      tenantId, 
      planId
    );
    
    if (!editData) {
      return res.status(404).json({ error: 'Plan not found or has no active version' });
    }
    
    return res.status(200).json(editData);
  } catch (error: any) {
    console.error('Error in getPlanForEdit controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'getPlanForEdit' },
      status: error.response?.status,
      planId: req.params.id
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Create a new pricing plan
 */
export const createPlan = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    if (!validateSupabaseConfig('api_businessModel', 'createPlan')) {
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
    
    const plan = await businessModelService.createPlan(
      authHeader, 
      tenantId, 
      req.body
    );
    
    return res.status(201).json(plan);
  } catch (error: any) {
    console.error('Error in createPlan controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'createPlan' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Update plan by creating new version (edit workflow)
 * This is the main edit endpoint - always creates a new version
 */
export const updatePlanAsNewVersion = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    if (!validateSupabaseConfig('api_businessModel', 'updatePlanAsNewVersion')) {
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
    
    // Ensure plan_id is in the request body
    if (!req.body.plan_id) {
      return res.status(400).json({ error: 'plan_id is required for edit workflow' });
    }
    
    // Ensure version number is provided
    if (!req.body.next_version_number) {
      return res.status(400).json({ error: 'next_version_number is required' });
    }
    
    // Ensure changelog is provided
    if (!req.body.changelog || req.body.changelog.trim().length < 5) {
      return res.status(400).json({ error: 'changelog must be at least 5 characters long' });
    }
    
    const plan = await businessModelService.updatePlanAsNewVersion(
      authHeader, 
      tenantId, 
      req.body
    );
    
    return res.status(200).json(plan);
  } catch (error: any) {
    console.error('Error in updatePlanAsNewVersion controller:', error.message);
    
    // Log the full error response to see validation details
    if (error.response?.data) {
      console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.data.details && Array.isArray(error.response.data.details)) {
        console.error('Validation error details:');
        error.response.data.details.forEach((detail: string, index: number) => {
          console.error(`  ${index + 1}. ${detail}`);
        });
      }
    }
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'updatePlanAsNewVersion' },
      status: error.response?.status,
      planId: req.body.plan_id
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    // Return the actual validation details if available
    if (error.response?.data?.details && Array.isArray(error.response.data.details)) {
      return res.status(status).json({ 
        error: message,
        details: error.response.data.details 
      });
    }
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Update plan metadata only (rare operation)
 */
export const updatePlan = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    if (!validateSupabaseConfig('api_businessModel', 'updatePlan')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const planId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const plan = await businessModelService.updatePlan(
      authHeader, 
      tenantId, 
      planId, 
      req.body
    );
    
    return res.status(200).json(plan);
  } catch (error: any) {
    console.error('Error in updatePlan controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'service_businessModel', action: 'updatePlan' },
      status: error.response?.status,
      planId: req.params.id
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Toggle plan visibility
 */
export const togglePlanVisibility = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    if (!validateSupabaseConfig('api_businessModel', 'togglePlanVisibility')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const planId = req.params.id;
    const isVisible = req.body.is_visible;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (isVisible === undefined) {
      return res.status(400).json({ error: 'is_visible field is required' });
    }
    
    const plan = await businessModelService.togglePlanVisibility(
      authHeader, 
      tenantId, 
      planId, 
      isVisible
    );
    
    return res.status(200).json(plan);
  } catch (error: any) {
    console.error('Error in togglePlanVisibility controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'togglePlanVisibility' },
      status: error.response?.status,
      planId: req.params.id
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Archive a pricing plan
 */
export const archivePlan = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_businessModel', 'archivePlan')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const planId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const plan = await businessModelService.archivePlan(
      authHeader, 
      tenantId, 
      planId
    );
    
    return res.status(200).json(plan);
  } catch (error: any) {
    console.error('Error in archivePlan controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_businessModel', action: 'archivePlan' },
      status: error.response?.status,
      planId: req.params.id
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};
