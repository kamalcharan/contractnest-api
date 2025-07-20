// src/controllers/tenantController.ts
import { Request, Response } from 'express';
import axios from 'axios';
import { captureException } from '../utils/sentry';
import { AuthRequest } from '../middleware/auth';

// Supabase edge function base URL
const SUPABASE_URL = process.env.SUPABASE_URL;

export const getUserTenants = async (req: Request, res: Response) => {
  try {
    // Verify we have required config
    if (!SUPABASE_URL) {
      captureException(new Error('Missing SUPABASE_URL environment variable'), {
        tags: { source: 'api_tenant' },
        endpoint: 'getUserTenants'
      });
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    
    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/tenants`,
      {
        headers: {
          Authorization: authHeader
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenant' },
      endpoint: 'getUserTenants',
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

export const getTenantById = async (req: Request, res: Response) => {
  try {
    // Verify we have required config
    if (!SUPABASE_URL) {
      captureException(new Error('Missing SUPABASE_URL environment variable'), {
        tags: { source: 'api_tenant' },
        endpoint: 'getTenantById'
      });
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const { id } = req.params;
    const authHeader = req.headers.authorization;
    
    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/tenants/${id}`,
      {
        headers: {
          Authorization: authHeader
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenant' },
      endpoint: 'getTenantById',
      tenantId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

export const createTenant = async (req: Request, res: Response) => {
  try {
    // Verify we have required config
    if (!SUPABASE_URL) {
      captureException(new Error('Missing SUPABASE_URL environment variable'), {
        tags: { source: 'api_tenant' },
        endpoint: 'createTenant'
      });
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const { name, domain } = req.body;
    const authHeader = req.headers.authorization;
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/tenants`,
      {
        name,
        domain
      },
      {
        headers: {
          Authorization: authHeader
        }
      }
    );
    
    return res.status(201).json(response.data);
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenant' },
      endpoint: 'createTenant',
      tenantName: req.body.name,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

export const checkTenantAvailability = async (req: Request, res: Response) => {
  try {
    // Verify we have required config
    if (!SUPABASE_URL) {
      captureException(new Error('Missing SUPABASE_URL environment variable'), {
        tags: { source: 'api_tenant' },
        endpoint: 'checkTenantAvailability'
      });
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const { name } = req.query;
    const authHeader = req.headers.authorization;
    
    if (!name) {
      return res.status(400).json({ error: 'Name parameter is required' });
    }
    
    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/tenants/check-availability`,
      {
        params: { name },
        headers: authHeader ? { Authorization: authHeader } : undefined
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenant' },
      endpoint: 'checkTenantAvailability',
      tenantName: req.query.name,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

export const createTenantFromGoogle = async (req: AuthRequest, res: Response) => {
  try {
    // Verify we have required config
    if (!SUPABASE_URL) {
      captureException(new Error('Missing SUPABASE_URL environment variable'), {
        tags: { source: 'api_tenant' },
        endpoint: 'createTenantFromGoogle'
      });
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const { name, workspace_code } = req.body;
    const authHeader = req.headers.authorization;
    
    if (!name || !workspace_code) {
      return res.status(400).json({ error: 'Name and workspace code are required' });
    }
    
    // Call the Google-specific Edge Function
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/tenants/create-google`,
      {
        name,
        workspace_code
      },
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          apikey: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY
        }
      }
    );
    
    return res.status(201).json(response.data);
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenant' },
      endpoint: 'createTenantFromGoogle',
      tenantName: req.body.name,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || 'Failed to create tenant for Google user';
    
    return res.status(status).json({ error: message });
  }
};