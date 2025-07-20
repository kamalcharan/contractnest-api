// src/controllers/integrationController.ts
import { Request, Response } from 'express';
import { captureException } from '../utils/sentry';
import { validateSupabaseConfig } from '../utils/supabaseConfig';
import { integrationService } from '../services/integrationService';

/**
 * Get integrations - handles multiple cases based on query params
 */
export const getIntegrations = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_integrations', 'getIntegrations')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const isLive = req.query.isLive === 'true';
    const type = req.query.type as string;
    const providerId = req.query.providerId as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    // For getting integration types, we don't need tenant ID
    if (!type && !providerId) {
      // Getting all integration types - this doesn't need tenant ID
      const integrationTypes = await integrationService.getIntegrationTypesWithStatus(
        authHeader, 
        tenantId || 'dummy', // Pass dummy if not available
        isLive
      );
      return res.status(200).json(integrationTypes);
    }
    
    // For other operations, we need tenant ID
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (providerId) {
      // Get specific integration
      const integration = await integrationService.getTenantIntegration(authHeader, tenantId, providerId);
      return res.status(200).json(integration);
    } else if (type) {
      // Get integrations by type
      const integrations = await integrationService.getIntegrationsByType(authHeader, tenantId, type, isLive);
      return res.status(200).json(integrations);
    }
  } catch (error: any) {
    console.error('Error in getIntegrations controller:', error);
    
    // If it's an axios error, get the actual error message
    if (error.response) {
      console.error('Response error:', error.response.data);
      return res.status(error.response.status).json(error.response.data);
    }
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_integrations', action: 'getIntegrations' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Test an integration connection
 */
export const testIntegration = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!req.body.master_integration_id) {
      return res.status(400).json({ error: 'master_integration_id is required' });
    }
    
    if (!req.body.credentials) {
      return res.status(400).json({ error: 'credentials are required' });
    }
    
    const testResult = await integrationService.testIntegration(
      authHeader,
      tenantId,
      {
        master_integration_id: req.body.master_integration_id,
        credentials: req.body.credentials,
        integration_id: req.body.integration_id // Pass through integration_id if provided
      },
      req.body.is_live || false
    );
    
    return res.status(200).json(testResult);
  } catch (error: any) {
    console.error('Error in testIntegration controller:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    return res.status(500).json({ error: 'Test failed' });
  }
};

/**
 * Create or update an integration
 */
export const createUpdateIntegration = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const isLive = req.body.is_live || false;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!req.body.master_integration_id) {
      return res.status(400).json({ error: 'master_integration_id is required' });
    }
    
    const integration = await integrationService.saveIntegration(
      authHeader,
      tenantId,
      req.body,
      isLive
    );
    
    return res.status(201).json(integration);
  } catch (error: any) {
    console.error('Error in createUpdateIntegration controller:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    return res.status(500).json({ error: 'Failed to save integration' });
  }
};

/**
 * Toggle integration status
 */
export const toggleIntegrationStatus = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const integrationId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!integrationId) {
      return res.status(400).json({ error: 'Integration ID is required' });
    }
    
    if (req.body.is_active === undefined) {
      return res.status(400).json({ error: 'is_active field is required' });
    }
    
    const result = await integrationService.toggleIntegrationStatus(
      authHeader,
      tenantId,
      integrationId,
      req.body.is_active
    );
    
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in toggleIntegrationStatus controller:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    return res.status(500).json({ error: 'Failed to toggle status' });
  }
};