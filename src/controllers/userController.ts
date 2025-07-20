// src/controllers/userController.ts
import { Request, Response } from 'express';
import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL, validateSupabaseConfig } from '../utils/supabaseConfig';

/**
 * List all users for the current tenant
 */
export const listUsers = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_users', 'listUsers')) {
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
    
    // Forward query parameters
    const queryParams = new URLSearchParams({
      page: req.query.page as string || '1',
      limit: req.query.limit as string || '10',
      ...(req.query.status && { status: req.query.status as string }),
      ...(req.query.role && { role: req.query.role as string }),
      ...(req.query.search && { search: req.query.search as string })
    });
    
    console.log('Fetching users for tenant:', tenantId);
    
    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/user-management?${queryParams}`,
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
    console.error('Error in listUsers:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'listUsers' },
      tenantId: req.headers['x-tenant-id'] as string,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch users';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Get current user profile
 */
export const getCurrentUserProfile = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_users', 'getCurrentUserProfile')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string; // Optional for this endpoint
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/user-management/me`,
      {
        headers: {
          Authorization: authHeader,
          ...(tenantId && { 'x-tenant-id': tenantId }),
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in getCurrentUserProfile:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'getCurrentUserProfile' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch profile';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Update current user profile
 */
export const updateCurrentUserProfile = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_users', 'updateCurrentUserProfile')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    const response = await axios.patch(
      `${SUPABASE_URL}/functions/v1/user-management/me`,
      req.body,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in updateCurrentUserProfile:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'updateCurrentUserProfile' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to update profile';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Get a single user by ID
 */
export const getUser = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_users', 'getUser')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/user-management/${userId}`,
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
    console.error('Error in getUser:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'getUser' },
      userId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch user';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Update a user
 */
export const updateUser = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_users', 'updateUser')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log('Updating user:', userId);
    
    const response = await axios.patch(
      `${SUPABASE_URL}/functions/v1/user-management/${userId}`,
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
    console.error('Error in updateUser:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'updateUser' },
      userId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to update user';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Suspend a user
 */
export const suspendUser = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_users', 'suspendUser')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log('Suspending user:', userId);
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-management/${userId}/suspend`,
      {},
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
    console.error('Error in suspendUser:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'suspendUser' },
      userId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to suspend user';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Activate a user
 */
export const activateUser = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_users', 'activateUser')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log('Activating user:', userId);
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-management/${userId}/activate`,
      {},
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
    console.error('Error in activateUser:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'activateUser' },
      userId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to activate user';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Reset user password
 */
export const resetUserPassword = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_users', 'resetUserPassword')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log('Resetting password for user:', userId);
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-management/${userId}/reset-password`,
      {},
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
    console.error('Error in resetUserPassword:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'resetUserPassword' },
      userId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to reset password';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Get user activity log
 */
export const getUserActivity = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_users', 'getUserActivity')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Forward query parameters
    const queryParams = new URLSearchParams({
      days: req.query.days as string || '30',
      limit: req.query.limit as string || '100'
    });
    
    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/user-management/${userId}/activity?${queryParams}`,
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
    console.error('Error in getUserActivity:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'getUserActivity' },
      userId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch activity log';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Assign role to user
 */
export const assignUserRole = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_users', 'assignUserRole')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.params.id;
    const { role_id } = req.body;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    if (!role_id) {
      return res.status(400).json({ error: 'Role ID is required' });
    }
    
    console.log('Assigning role to user:', userId, 'Role:', role_id);
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-management/${userId}/roles`,
      { role_id },
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
    console.error('Error in assignUserRole:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'assignUserRole' },
      userId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to assign role';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Remove role from user
 */
export const removeUserRole = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_users', 'removeUserRole')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.params.id;
    const roleId = req.params.roleId;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    if (!roleId) {
      return res.status(400).json({ error: 'Role ID is required' });
    }
    
    console.log('Removing role from user:', userId, 'Role:', roleId);
    
    const response = await axios.delete(
      `${SUPABASE_URL}/functions/v1/user-management/${userId}/roles/${roleId}`,
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
    console.error('Error in removeUserRole:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_users', action: 'removeUserRole' },
      userId: req.params.id,
      roleId: req.params.roleId,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to remove role';
    
    return res.status(status).json({ error: message });
  }
};