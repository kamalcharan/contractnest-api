// src/controllers/onboardingController.ts
// Onboarding Controller with audit integration and error handling

import { Request, Response } from 'express';
import { captureException } from '../utils/sentry';
import { validateSupabaseConfig } from '../utils/supabaseConfig';
import { onboardingService } from '../services/onboardingService';
import { logAudit } from '../middleware/auditMiddleware';
import { AuditAction, AuditResource } from '../constants/auditConstants';
import { 
  CompleteStepRequest,
  SkipStepRequest,
  UpdateProgressRequest,
  OnboardingUtils,
  OnboardingErrorCode,
  ONBOARDING_ERROR_MESSAGES 
} from '../types/onboardingTypes';

/**
 * GET /api/onboarding/status
 * Fetch onboarding status for a tenant
 */
export const getOnboardingStatus = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_onboarding', 'getOnboardingStatus')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    console.log('API getOnboardingStatus called with tenantId:', tenantId);
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const status = await onboardingService.getOnboardingStatus(authHeader, tenantId);
    
    // Audit log for this read operation
    await logAudit(req, {
      action: AuditAction.ONBOARDING_STATUS_VIEW || 'ONBOARDING_STATUS_VIEW',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: true,
      metadata: { 
        operation: 'get_status',
        needsOnboarding: status.needs_onboarding,
        currentStep: status.current_step,
        tenantId
      }
    });
    
    return res.status(200).json(status);
  } catch (error: any) {
    console.error('Error in getOnboardingStatus controller:', error);
    
    await logAudit(req, {
      action: AuditAction.ONBOARDING_STATUS_VIEW || 'ONBOARDING_STATUS_VIEW',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: false,
      error: error.message,
      metadata: { 
        operation: 'get_status',
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_onboarding', action: 'getOnboardingStatus' },
      extra: { tenantId: req.headers['x-tenant-id'] }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch onboarding status';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * POST /api/onboarding/initialize
 * Initialize onboarding for a tenant
 */
export const initializeOnboarding = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_onboarding', 'initializeOnboarding')) {
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
    
    const result = await onboardingService.initializeOnboarding(authHeader, tenantId);
    
    // Audit successful operation
    await logAudit(req, {
      action: AuditAction.ONBOARDING_INITIALIZE || 'ONBOARDING_INITIALIZE',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      resourceId: result.id,
      success: true,
      metadata: { 
        operation: 'initialize',
        tenantId
      }
    });
    
    return res.status(result.is_completed ? 200 : 201).json(result);
  } catch (error: any) {
    console.error('Error in initializeOnboarding controller:', error);
    
    await logAudit(req, {
      action: AuditAction.ONBOARDING_INITIALIZE || 'ONBOARDING_INITIALIZE',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: false,
      error: error.message,
      metadata: { 
        operation: 'initialize',
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_onboarding', action: 'initializeOnboarding' },
      extra: { tenantId: req.headers['x-tenant-id'] }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to initialize onboarding';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * POST /api/onboarding/step/complete
 * Complete an onboarding step
 */
export const completeOnboardingStep = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_onboarding', 'completeOnboardingStep')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    // Validate request body
    const requestData: CompleteStepRequest = req.body;
    const validation = OnboardingUtils.validateCompleteStep(requestData);
    
    if (!validation.isValid) {
      await logAudit(req, {
        action: AuditAction.ONBOARDING_STEP_COMPLETE || 'ONBOARDING_STEP_COMPLETE',
        resource: AuditResource.ONBOARDING || 'ONBOARDING',
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
        metadata: { 
          operation: 'complete_step',
          validationErrors: validation.errors,
          tenantId
        }
      });
      
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      });
    }
    
    const result = await onboardingService.completeStep(
      authHeader, 
      tenantId, 
      requestData.stepId,
      requestData.data,
      idempotencyKey
    );
    
    // Audit successful operation
    await logAudit(req, {
      action: AuditAction.ONBOARDING_STEP_COMPLETE || 'ONBOARDING_STEP_COMPLETE',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: true,
      metadata: { 
        operation: 'complete_step',
        stepId: requestData.stepId,
        currentStep: result.current_step,
        idempotencyKey,
        tenantId
      }
    });
    
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in completeOnboardingStep controller:', error);
    
    await logAudit(req, {
      action: AuditAction.ONBOARDING_STEP_COMPLETE || 'ONBOARDING_STEP_COMPLETE',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: false,
      error: error.message,
      metadata: { 
        operation: 'complete_step',
        requestBody: req.body,
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_onboarding', action: 'completeOnboardingStep' },
      extra: { tenantId: req.headers['x-tenant-id'], requestBody: req.body }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to complete step';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * PUT /api/onboarding/step/skip
 * Skip an optional onboarding step
 */
export const skipOnboardingStep = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_onboarding', 'skipOnboardingStep')) {
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
    
    // Validate request body
    const requestData: SkipStepRequest = req.body;
    const validation = OnboardingUtils.validateSkipStep(requestData);
    
    if (!validation.isValid) {
      await logAudit(req, {
        action: AuditAction.ONBOARDING_STEP_SKIP || 'ONBOARDING_STEP_SKIP',
        resource: AuditResource.ONBOARDING || 'ONBOARDING',
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
        metadata: { 
          operation: 'skip_step',
          validationErrors: validation.errors,
          tenantId
        }
      });
      
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      });
    }
    
    const result = await onboardingService.skipStep(authHeader, tenantId, requestData.stepId);
    
    // Audit successful operation
    await logAudit(req, {
      action: AuditAction.ONBOARDING_STEP_SKIP || 'ONBOARDING_STEP_SKIP',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: true,
      metadata: { 
        operation: 'skip_step',
        stepId: requestData.stepId,
        currentStep: result.current_step,
        tenantId
      }
    });
    
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in skipOnboardingStep controller:', error);
    
    await logAudit(req, {
      action: AuditAction.ONBOARDING_STEP_SKIP || 'ONBOARDING_STEP_SKIP',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: false,
      error: error.message,
      metadata: { 
        operation: 'skip_step',
        requestBody: req.body,
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_onboarding', action: 'skipOnboardingStep' },
      extra: { tenantId: req.headers['x-tenant-id'], requestBody: req.body }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to skip step';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * PUT /api/onboarding/progress
 * Update onboarding progress
 */
export const updateOnboardingProgress = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const progressData: UpdateProgressRequest = req.body;
    
    const result = await onboardingService.updateProgress(authHeader, tenantId, progressData);
    
    // Audit the operation
    await logAudit(req, {
      action: AuditAction.ONBOARDING_PROGRESS_UPDATE || 'ONBOARDING_PROGRESS_UPDATE',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: true,
      metadata: { 
        operation: 'update_progress',
        changes: progressData,
        tenantId
      }
    });
    
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in updateOnboardingProgress controller:', error);
    
    await logAudit(req, {
      action: AuditAction.ONBOARDING_PROGRESS_UPDATE || 'ONBOARDING_PROGRESS_UPDATE',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: false,
      error: error.message,
      metadata: { 
        operation: 'update_progress',
        requestBody: req.body,
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_onboarding', action: 'updateOnboardingProgress' },
      extra: { tenantId: req.headers['x-tenant-id'], requestBody: req.body }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to update progress';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * POST /api/onboarding/complete
 * Complete the entire onboarding process
 */
export const completeOnboarding = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const result = await onboardingService.completeOnboarding(authHeader, tenantId);
    
    // Audit the operation
    await logAudit(req, {
      action: AuditAction.ONBOARDING_COMPLETE || 'ONBOARDING_COMPLETE',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: true,
      metadata: { 
        operation: 'complete_onboarding',
        tenantId
      }
    });
    
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in completeOnboarding controller:', error);
    
    await logAudit(req, {
      action: AuditAction.ONBOARDING_COMPLETE || 'ONBOARDING_COMPLETE',
      resource: AuditResource.ONBOARDING || 'ONBOARDING',
      success: false,
      error: error.message,
      metadata: { 
        operation: 'complete_onboarding',
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to complete onboarding';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * GET /api/onboarding/test
 * Test onboarding service connectivity
 */
export const testOnboardingConnection = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader || !tenantId) {
      return res.status(400).json({ 
        error: 'Authorization and x-tenant-id headers are required for testing' 
      });
    }
    
    const result = await onboardingService.testConnection(authHeader, tenantId);
    
    return res.status(result.success ? 200 : 503).json(result);
  } catch (error: any) {
    console.error('Error in testOnboardingConnection:', error);
    
    return res.status(503).json({
      success: false,
      message: error.message || 'Connection test failed'
    });
  }
};