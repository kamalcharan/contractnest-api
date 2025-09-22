// src/controllers/taxSettingsController.ts
// Complete Tax Settings Controller with audit integration and error handling

import { Request, Response } from 'express';
import { captureException } from '../utils/sentry';
import { validateSupabaseConfig } from '../utils/supabaseConfig';
import { taxSettingsService } from '../services/taxSettingsService';
import { logAudit } from '../middleware/auditMiddleware';
import { AuditAction, AuditResource } from '../constants/auditConstants';
import { 
  TaxSettingsRequest, 
  CreateTaxRateRequest, 
  UpdateTaxRateRequest,
  TaxUtils,
  TaxErrorCode,
  TAX_ERROR_MESSAGES 
} from '../types/taxTypes';

/**
 * GET /api/tax-settings
 * Fetch tax settings and all active tax rates for a tenant
 */
export const getTaxSettings = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_tax_settings', 'getTaxSettings')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    console.log('API getTaxSettings called with tenantId:', tenantId);
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const taxData = await taxSettingsService.getTaxSettings(authHeader, tenantId);
    
    // Manual audit log for this read operation
    await logAudit(req, {
      action: AuditAction.TAX_SETTINGS_VIEW,
      resource: AuditResource.TAX_SETTINGS,
      success: true,
      metadata: { 
        operation: 'get_settings',
        hasSettings: !!taxData.settings.id,
        rateCount: taxData.rates.length,
        tenantId
      }
    });
    
    return res.status(200).json(taxData);
  } catch (error: any) {
    console.error('Error in getTaxSettings controller:', error);
    
    await logAudit(req, {
      action: AuditAction.TAX_SETTINGS_VIEW,
      resource: AuditResource.TAX_SETTINGS,
      success: false,
      error: error.message,
      metadata: { 
        operation: 'get_settings',
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tax_settings', action: 'getTaxSettings' },
      extra: { tenantId: req.headers['x-tenant-id'] }
    });

const status = error.status || error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch tax settings';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * POST /api/tax-settings/settings
 * Create or update tax settings for a tenant
 */
export const createUpdateTaxSettings = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_tax_settings', 'createUpdateTaxSettings')) {
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
    const settingsData: TaxSettingsRequest = req.body;
    const validation = TaxUtils.validateTaxSettings(settingsData);
    
    if (!validation.isValid) {
      await logAudit(req, {
        action: AuditAction.TAX_SETTINGS_UPDATE,
        resource: AuditResource.TAX_SETTINGS,
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
        metadata: { 
          operation: 'create_update_settings',
          validationErrors: validation.errors,
          tenantId
        }
      });
      
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      });
    }
    
    const result = await taxSettingsService.createUpdateTaxSettings(
      authHeader, 
      tenantId, 
      settingsData,
      idempotencyKey
    );
    
    // Audit successful operation
    await logAudit(req, {
      action: result.isUpdate ? AuditAction.TAX_SETTINGS_UPDATE : AuditAction.TAX_SETTINGS_CREATE,
      resource: AuditResource.TAX_SETTINGS,
      resourceId: result.settings.id,
      success: true,
      metadata: { 
        operation: result.isUpdate ? 'update_settings' : 'create_settings',
        changes: settingsData,
        idempotencyKey,
        tenantId
      }
    });
    
    return res.status(result.isUpdate ? 200 : 201).json(result.settings);
  } catch (error: any) {
    console.error('Error in createUpdateTaxSettings controller:', error);
    
    await logAudit(req, {
      action: AuditAction.TAX_SETTINGS_UPDATE,
      resource: AuditResource.TAX_SETTINGS,
      success: false,
      error: error.message,
      metadata: { 
        operation: 'create_update_settings',
        requestBody: req.body,
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tax_settings', action: 'createUpdateTaxSettings' },
      extra: { tenantId: req.headers['x-tenant-id'], requestBody: req.body }
    });

const status = error.status || error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to save tax settings';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * POST /api/tax-settings/rates
 * Create a new tax rate
 */
export const createTaxRate = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_tax_settings', 'createTaxRate')) {
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
    const rateData: CreateTaxRateRequest = req.body;
    const validation = TaxUtils.validateTaxRate(rateData);
    
    if (!validation.isValid) {
      await logAudit(req, {
        action: AuditAction.TAX_RATE_CREATE,
        resource: AuditResource.TAX_RATES,
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
        metadata: { 
          operation: 'create_rate',
          validationErrors: validation.errors,
          requestData: rateData,
          tenantId
        }
      });
      
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      });
    }
    
    const taxRate = await taxSettingsService.createTaxRate(
      authHeader, 
      tenantId, 
      rateData,
      idempotencyKey
    );
    
    // Audit successful operation
    await logAudit(req, {
      action: AuditAction.TAX_RATE_CREATE,
      resource: AuditResource.TAX_RATES,
      resourceId: taxRate.id,
      success: true,
      metadata: { 
        operation: 'create_rate',
        rateName: taxRate.name,
        rate: taxRate.rate,
        sequence: taxRate.sequence_no,
        idempotencyKey,
        tenantId
      }
    });
    
    return res.status(201).json(taxRate);
  } catch (error: any) {
    console.error('Error in createTaxRate controller:', error);
    
    await logAudit(req, {
      action: AuditAction.TAX_RATE_CREATE,
      resource: AuditResource.TAX_RATES,
      success: false,
      error: error.message,
      metadata: { 
        operation: 'create_rate',
        requestBody: req.body,
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tax_settings', action: 'createTaxRate' },
      extra: { tenantId: req.headers['x-tenant-id'], requestBody: req.body }
    });

    const status = error.status || error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to create tax rate';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * PUT /api/tax-settings/rates/:id
 * Update an existing tax rate
 */
export const updateTaxRate = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_tax_settings', 'updateTaxRate')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const rateId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!rateId) {
      return res.status(400).json({ error: 'Rate ID is required' });
    }
    
    // Validate request body
    const updateData: UpdateTaxRateRequest = req.body;
    const validation = TaxUtils.validateTaxRate(updateData);
    
    if (!validation.isValid) {
      await logAudit(req, {
        action: AuditAction.TAX_RATE_UPDATE,
        resource: AuditResource.TAX_RATES,
        resourceId: rateId,
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
        metadata: { 
          operation: 'update_rate',
          validationErrors: validation.errors,
          requestData: updateData,
          tenantId
        }
      });
      
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      });
    }
    
    const taxRate = await taxSettingsService.updateTaxRate(
      authHeader, 
      tenantId, 
      rateId,
      updateData,
      idempotencyKey
    );
    
    // Audit successful operation
    await logAudit(req, {
      action: AuditAction.TAX_RATE_UPDATE,
      resource: AuditResource.TAX_RATES,
      resourceId: rateId,
      success: true,
      metadata: { 
        operation: 'update_rate',
        changes: updateData,
        rateName: taxRate.name,
        idempotencyKey,
        tenantId
      }
    });
    
    return res.status(200).json(taxRate);
  } catch (error: any) {
    console.error('Error in updateTaxRate controller:', error);
    
    await logAudit(req, {
      action: AuditAction.TAX_RATE_UPDATE,
      resource: AuditResource.TAX_RATES,
      resourceId: req.params.id,
      success: false,
      error: error.message,
      metadata: { 
        operation: 'update_rate',
        requestBody: req.body,
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tax_settings', action: 'updateTaxRate' },
      extra: { tenantId: req.headers['x-tenant-id'], rateId: req.params.id, requestBody: req.body }
    });

    const status = error.status || error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to update tax rate';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * DELETE /api/tax-settings/rates/:id
 * Soft delete a tax rate (set is_active = false)
 */
export const deleteTaxRate = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_tax_settings', 'deleteTaxRate')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const rateId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!rateId) {
      return res.status(400).json({ error: 'Rate ID is required' });
    }
    
    const result = await taxSettingsService.deleteTaxRate(
      authHeader, 
      tenantId, 
      rateId
    );
    
    // Audit successful operation
    await logAudit(req, {
      action: AuditAction.TAX_RATE_DELETE,
      resource: AuditResource.TAX_RATES,
      resourceId: rateId,
      success: true,
      metadata: { 
        operation: 'delete_rate',
        deletedRate: result.deletedRate,
        tenantId
      }
    });
    
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in deleteTaxRate controller:', error);
    
    await logAudit(req, {
      action: AuditAction.TAX_RATE_DELETE,
      resource: AuditResource.TAX_RATES,
      resourceId: req.params.id,
      success: false,
      error: error.message,
      metadata: { 
        operation: 'delete_rate',
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tax_settings', action: 'deleteTaxRate' },
      extra: { tenantId: req.headers['x-tenant-id'], rateId: req.params.id }
    });

    const status = error.status || error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to delete tax rate';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * GET /api/tax-settings/rates
 * Get all active tax rates for a tenant (alternative endpoint)
 */
export const getTaxRates = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const rates = await taxSettingsService.getTaxRates(authHeader, tenantId);
    
    // Audit the operation
    await logAudit(req, {
      action: AuditAction.TAX_RATE_LIST,
      resource: AuditResource.TAX_RATES,
      success: true,
      metadata: { 
        operation: 'list_rates',
        rateCount: rates.length,
        tenantId
      }
    });
    
    return res.status(200).json(rates);
  } catch (error: any) {
    console.error('Error in getTaxRates controller:', error);
    
    await logAudit(req, {
      action: AuditAction.TAX_RATE_LIST,
      resource: AuditResource.TAX_RATES,
      success: false,
      error: error.message,
      metadata: { 
        operation: 'list_rates',
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tax_settings', action: 'getTaxRates' }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch tax rates';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * POST /api/tax-settings/rates/:id/activate
 * Activate a deactivated tax rate
 */
export const activateTaxRate = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const rateId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!rateId) {
      return res.status(400).json({ error: 'Rate ID is required' });
    }
    
    const taxRate = await taxSettingsService.updateTaxRate(
      authHeader,
      tenantId,
      rateId,
      { is_active: true } as UpdateTaxRateRequest
    );
    
    // Audit the operation
    await logAudit(req, {
      action: AuditAction.TAX_RATE_ACTIVATE,
      resource: AuditResource.TAX_RATES,
      resourceId: rateId,
      success: true,
      metadata: { 
        operation: 'activate_rate',
        rateName: taxRate.name,
        tenantId
      }
    });
    
    return res.status(200).json(taxRate);
  } catch (error: any) {
    console.error('Error in activateTaxRate controller:', error);
    
    await logAudit(req, {
      action: AuditAction.TAX_RATE_ACTIVATE,
      resource: AuditResource.TAX_RATES,
      resourceId: req.params.id,
      success: false,
      error: error.message,
      metadata: { 
        operation: 'activate_rate',
        tenantId: req.headers['x-tenant-id'] as string
      }
    });
    
   const status = error.status || error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to activate tax rate';
    
    return res.status(status).json({ error: message });
  }
};