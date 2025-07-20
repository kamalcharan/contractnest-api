// src/controllers/invitationController.ts
import { Request, Response } from 'express';
import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL, validateSupabaseConfig } from '../utils/supabaseConfig';

/**
 * List all invitations for the current tenant
 */
export const listInvitations = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_invitations', 'listInvitations')) {
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
      status: req.query.status as string || 'all',
      page: req.query.page as string || '1',
      limit: req.query.limit as string || '10'
    });
    
    console.log('Fetching invitations for tenant:', tenantId);
    
    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/user-invitations?${queryParams}`,
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
    console.error('Error in listInvitations:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'listInvitations' },
      tenantId: req.headers['x-tenant-id'] as string,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch invitations';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Get a single invitation by ID
 */
export const getInvitation = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_invitations', 'getInvitation')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const invitationId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!invitationId) {
      return res.status(400).json({ error: 'Invitation ID is required' });
    }
    
    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/user-invitations/${invitationId}`,
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
    console.error('Error in getInvitation:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'getInvitation' },
      invitationId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch invitation';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Create a new invitation
 */
export const createInvitation = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_invitations', 'createInvitation')) {
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
    const { email, mobile_number, invitation_method, role_id, custom_message } = req.body;
    
    if (!email && !mobile_number) {
      return res.status(400).json({ error: 'Either email or mobile number is required' });
    }
    
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (mobile_number && !isValidMobileNumber(mobile_number)) {
      return res.status(400).json({ error: 'Invalid mobile number format' });
    }
    
    const validMethods = ['email', 'sms', 'whatsapp'];
    if (invitation_method && !validMethods.includes(invitation_method)) {
      return res.status(400).json({ error: 'Invalid invitation method' });
    }
    
    console.log('Creating invitation for tenant:', tenantId);
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations`,
      {
        email,
        mobile_number,
        invitation_method: invitation_method || 'email',
        role_id,
        custom_message
      },
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Log success event
    console.log('Invitation created successfully:', response.data.id);
    
    return res.status(201).json(response.data);
  } catch (error: any) {
    console.error('Error in createInvitation:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'createInvitation' },
      tenantId: req.headers['x-tenant-id'] as string,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to create invitation';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Resend an invitation
 */
export const resendInvitation = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_invitations', 'resendInvitation')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const invitationId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!invitationId) {
      return res.status(400).json({ error: 'Invitation ID is required' });
    }
    
    console.log('Resending invitation:', invitationId);
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations/${invitationId}/resend`,
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
    console.error('Error in resendInvitation:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'resendInvitation' },
      invitationId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to resend invitation';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Cancel an invitation
 */
export const cancelInvitation = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_invitations', 'cancelInvitation')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const invitationId = req.params.id;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!invitationId) {
      return res.status(400).json({ error: 'Invitation ID is required' });
    }
    
    console.log('Cancelling invitation:', invitationId);
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations/${invitationId}/cancel`,
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
    console.error('Error in cancelInvitation:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'cancelInvitation' },
      invitationId: req.params.id,
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to cancel invitation';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Validate an invitation (public endpoint)
 */
export const validateInvitation = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_invitations', 'validateInvitation')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const { user_code, secret_code } = req.body;
    
    if (!user_code || !secret_code) {
      return res.status(400).json({ error: 'User code and secret code are required' });
    }
    
    console.log('Validating invitation with code:', user_code);
    
    // Use ANON key for public endpoints
    const supabaseAnonKey = process.env.SUPABASE_KEY; // This should be your anon/public key
    
    if (!supabaseAnonKey) {
      console.error('SUPABASE_KEY not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // Use anon key for this public endpoint
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations/validate`,
      {
        user_code,
        secret_code
      },
      {
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey, // Also send as apikey header
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in validateInvitation:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'validateInvitation' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to validate invitation';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Accept an invitation
 */
export const acceptInvitation = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_invitations', 'acceptInvitation')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const { user_code, secret_code, user_id } = req.body;
    
    if (!user_code || !secret_code) {
      return res.status(400).json({ error: 'User code and secret code are required' });
    }
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log('Accepting invitation for user:', user_id);
    
    // Use ANON key for public endpoints
    const supabaseAnonKey = process.env.SUPABASE_KEY;
    
    if (!supabaseAnonKey) {
      console.error('SUPABASE_KEY not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // Use anon key for this public endpoint
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations/accept`,
      {
        user_code,
        secret_code,
        user_id
      },
      {
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in acceptInvitation:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'acceptInvitation' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to accept invitation';
    
    return res.status(status).json({ error: message });
  }
};

// Helper functions
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidMobileNumber(mobile: string): boolean {
  // Basic validation - adjust based on your requirements
  const mobileRegex = /^[+]?[\d\s-()]+$/;
  return mobileRegex.test(mobile) && mobile.replace(/\D/g, '').length >= 10;
}