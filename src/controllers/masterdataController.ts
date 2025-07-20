// src/controllers/masterDataController.ts
import { Request, Response } from 'express';
import { masterDataService } from '../services/masterDataService';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL, SUPABASE_KEY, validateSupabaseConfig } from '../utils/supabaseConfig';

export const getCategories = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_masterdata', 'getCategories')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.query.tenantId as string;
    
    console.log('API getCategories called with tenantId:', tenantId);
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    
    const categories = await masterDataService.getCategories(authHeader, tenantId);
    return res.status(200).json(categories);
  } catch (error: any) {
    console.error('Error in getCategories controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_masterdata', action: 'getCategories' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

export const getCategoryDetails = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_masterdata', 'getCategoryDetails')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.query.tenantId as string;
    const categoryId = req.query.categoryId as string;
    
    console.log('API getCategoryDetails called with categoryId:', categoryId, 'tenantId:', tenantId);
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId || !categoryId) {
      return res.status(400).json({ error: 'tenantId and categoryId are required' });
    }
    
    const details = await masterDataService.getCategoryDetails(authHeader, categoryId, tenantId);
    return res.status(200).json(details);
  } catch (error: any) {
    console.error('Error in getCategoryDetails controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_masterdata', action: 'getCategoryDetails' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

export const getNextSequenceNumber = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_masterdata', 'getNextSequenceNumber')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.query.tenantId as string;
    const categoryId = req.query.categoryId as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId || !categoryId) {
      return res.status(400).json({ error: 'tenantId and categoryId are required' });
    }
    
    const nextSequence = await masterDataService.getNextSequenceNumber(authHeader, categoryId, tenantId);
    return res.status(200).json({ nextSequence });
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_masterdata', action: 'getNextSequenceNumber' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

export const addCategoryDetail = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_masterdata', 'addCategoryDetail')) {
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
    
    // Ensure tenantId is set in the body
    req.body.tenantid = tenantId;
    
    const detail = await masterDataService.addCategoryDetail(authHeader, req.body);
    return res.status(201).json(detail);
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_masterdata', action: 'addCategoryDetail' },
      status: error.response?.status
    });

    // If it's a validation error from our service, return 400
    if (error.message && !error.response) {
      return res.status(400).json({ error: error.message });
    }

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

export const updateCategoryDetail = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_masterdata', 'updateCategoryDetail')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const detailId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!detailId) {
      return res.status(400).json({ error: 'Detail ID is required' });
    }
    
    // Ensure tenantId is set in the updates
    req.body.tenantid = tenantId;
    
    const updated = await masterDataService.updateCategoryDetail(authHeader, detailId, req.body);
    return res.status(200).json(updated);
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_masterdata', action: 'updateCategoryDetail' },
      status: error.response?.status
    });

    // If it's a validation error from our service, return 400
    if (error.message && !error.response) {
      return res.status(400).json({ error: error.message });
    }

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

export const deleteCategoryDetail = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_masterdata', 'deleteCategoryDetail')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.query.tenantId as string;
    const detailId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    
    if (!detailId) {
      return res.status(400).json({ error: 'Detail ID is required' });
    }
    
    const result = await masterDataService.softDeleteCategoryDetail(authHeader, detailId, tenantId);
    
    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json({ error: 'Failed to delete the category detail' });
    }
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_masterdata', action: 'deleteCategoryDetail' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};