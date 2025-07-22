// src/controllers/masterDataController.ts
import { Request, Response } from 'express';
import axios from 'axios';

// Direct implementation without service layer to avoid circular dependencies
export const getCategories = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.query.tenantId as string;
    
    console.log('API getCategories called with tenantId:', tenantId);
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    // Direct API call without service layer
    const response = await axios.get(
      `${process.env.SUPABASE_URL}/functions/v1/masterdata/categories?tenantId=${tenantId}`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in getCategories controller:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    return res.status(status).json({ error: message });
  }
};

export const getCategoryDetails = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.query.tenantId as string;
    const categoryId = req.query.categoryId as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId || !categoryId) {
      return res.status(400).json({ error: 'tenantId and categoryId are required' });
    }
    
    const response = await axios.get(
      `${process.env.SUPABASE_URL}/functions/v1/masterdata/category-details?categoryId=${categoryId}&tenantId=${tenantId}`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in getCategoryDetails controller:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    return res.status(status).json({ error: message });
  }
};

export const getNextSequenceNumber = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.query.tenantId as string;
    const categoryId = req.query.categoryId as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId || !categoryId) {
      return res.status(400).json({ error: 'tenantId and categoryId are required' });
    }
    
    const response = await axios.get(
      `${process.env.SUPABASE_URL}/functions/v1/masterdata/category-details?categoryId=${categoryId}&tenantId=${tenantId}&nextSequence=true`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(200).json({ nextSequence: response.data.nextSequence });
  } catch (error: any) {
    console.error('Error in getNextSequenceNumber controller:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    return res.status(status).json({ error: message });
  }
};

export const addCategoryDetail = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    req.body.tenantid = tenantId;
    
    const response = await axios.post(
      `${process.env.SUPABASE_URL}/functions/v1/masterdata/category-details`,
      req.body,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(201).json(response.data);
  } catch (error: any) {
    console.error('Error in addCategoryDetail controller:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    return res.status(status).json({ error: message });
  }
};

export const updateCategoryDetail = async (req: Request, res: Response) => {
  try {
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
    
    req.body.tenantid = tenantId;
    
    const response = await axios.patch(
      `${process.env.SUPABASE_URL}/functions/v1/masterdata/category-details?id=${detailId}`,
      req.body,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in updateCategoryDetail controller:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    return res.status(status).json({ error: message });
  }
};

export const deleteCategoryDetail = async (req: Request, res: Response) => {
  try {
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
    
    const response = await axios.delete(
      `${process.env.SUPABASE_URL}/functions/v1/masterdata/category-details?id=${detailId}&tenantId=${tenantId}`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in deleteCategoryDetail controller:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    return res.status(500).json({ error: 'Failed to delete the category detail' });
  }
};