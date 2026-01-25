// src/controllers/invitationController.ts
import { Request, Response } from 'express';
import axios from 'axios';
import { captureException } from '../utils/sentry';
import {
  validateSupabaseConfig,
  getSupabaseConfigForRequest,
  validateProductSupabaseConfig
} from '../utils/supabaseConfig';

/**
 * Get product-specific Supabase URL and Key from request
 * Uses x-product header or productCode set by middleware
 */
const getSupabaseForRequest = (req: Request): { url: string; key: string } => {
  return getSupabaseConfigForRequest(req);
};

/**
 * List all invitations for the current tenant
 */
export const listInvitations = async (req: Request, res: Response) => {
  try {
    const productCode = (req as any).productCode || 'contractnest';

    // Validate product-specific Supabase configuration
    if (!validateProductSupabaseConfig(productCode, 'api_invitations', 'listInvitations')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const xEnvironment = req.headers['x-environment'] as string || 'live';

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

    // Get product-specific Supabase config
    const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseForRequest(req);

    console.log(`Fetching invitations for tenant: ${tenantId} (product: ${productCode})`);

    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/user-invitations?${queryParams}`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': xEnvironment,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in listInvitations:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'listInvitations', product: (req as any).productCode },
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
    const productCode = (req as any).productCode || 'contractnest';

    if (!validateProductSupabaseConfig(productCode, 'api_invitations', 'getInvitation')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const xEnvironment = req.headers['x-environment'] as string || 'live';
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

    // Get product-specific Supabase config
    const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseForRequest(req);

    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/user-invitations/${invitationId}`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': xEnvironment,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in getInvitation:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'getInvitation', product: (req as any).productCode },
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
    const productCode = (req as any).productCode || 'contractnest';

    if (!validateProductSupabaseConfig(productCode, 'api_invitations', 'createInvitation')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const xEnvironment = req.headers['x-environment'] as string || 'live';

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    // Validate request body
    const { email, mobile_number, country_code, phone_code, invitation_method, role_id, custom_message } = req.body;

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

    // Get product-specific Supabase config
    const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseForRequest(req);

    console.log(`Creating invitation for tenant: ${tenantId} (product: ${productCode})`);
    console.log('📤 Forwarding to Supabase Edge Function:', {
      url: `${SUPABASE_URL}/functions/v1/user-invitations`,
      headers: {
        'Authorization': authHeader ? 'Bearer [REDACTED]' : 'MISSING',
        'x-tenant-id': tenantId || 'MISSING',
        'x-environment': xEnvironment,
        'Content-Type': 'application/json'
      },
      body: { email, mobile_number, invitation_method, role_id }
    });

    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations`,
      {
        email,
        mobile_number,
        country_code,
        phone_code,
        invitation_method: invitation_method || 'email',
        role_id,
        custom_message
      },
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': xEnvironment,
          'apikey': SUPABASE_KEY,
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
      tags: { source: 'api_invitations', action: 'createInvitation', product: (req as any).productCode },
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
    const productCode = (req as any).productCode || 'contractnest';

    if (!validateProductSupabaseConfig(productCode, 'api_invitations', 'resendInvitation')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const xEnvironment = req.headers['x-environment'] as string || 'live';
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

    // Get product-specific Supabase config
    const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseForRequest(req);

    console.log(`Resending invitation: ${invitationId} (product: ${productCode})`);

    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations/${invitationId}/resend`,
      {},
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': xEnvironment,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in resendInvitation:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'resendInvitation', product: (req as any).productCode },
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
    const productCode = (req as any).productCode || 'contractnest';

    if (!validateProductSupabaseConfig(productCode, 'api_invitations', 'cancelInvitation')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const xEnvironment = req.headers['x-environment'] as string || 'live';
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

    // Get product-specific Supabase config
    const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseForRequest(req);

    console.log(`Cancelling invitation: ${invitationId} (product: ${productCode})`);

    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations/${invitationId}/cancel`,
      {},
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': xEnvironment,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in cancelInvitation:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'cancelInvitation', product: (req as any).productCode },
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
    const productCode = (req as any).productCode || 'contractnest';

    if (!validateProductSupabaseConfig(productCode, 'api_invitations', 'validateInvitation')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const { user_code, secret_code } = req.body;

    if (!user_code || !secret_code) {
      return res.status(400).json({ error: 'User code and secret code are required' });
    }

    // Get product-specific Supabase config
    const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseForRequest(req);

    console.log(`Validating invitation with code: ${user_code} (product: ${productCode})`);

    // Use the product-specific anon key for public endpoint
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations/validate`,
      {
        user_code,
        secret_code
      },
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in validateInvitation:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'validateInvitation', product: (req as any).productCode },
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
    const productCode = (req as any).productCode || 'contractnest';

    if (!validateProductSupabaseConfig(productCode, 'api_invitations', 'acceptInvitation')) {
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

    // Get product-specific Supabase config
    const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseForRequest(req);

    console.log(`Accepting invitation for user: ${user_id} (product: ${productCode})`);

    // Use the product-specific anon key for public endpoint
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations/accept`,
      {
        user_code,
        secret_code,
        user_id
      },
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in acceptInvitation:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'acceptInvitation', product: (req as any).productCode },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to accept invitation';

    return res.status(status).json({ error: message });
  }
};

/**
 * Accept an invitation for existing authenticated user
 */
export const acceptInvitationExistingUser = async (req: Request, res: Response) => {
  try {
    const productCode = (req as any).productCode || 'contractnest';

    if (!validateProductSupabaseConfig(productCode, 'api_invitations', 'acceptInvitationExistingUser')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const { user_code, secret_code } = req.body;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!user_code || !secret_code) {
      return res.status(400).json({ error: 'User code and secret code are required' });
    }

    // Get product-specific Supabase config
    const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseForRequest(req);

    console.log(`Accepting invitation for existing user (product: ${productCode})`);

    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/user-invitations/accept-existing-user`,
      {
        user_code,
        secret_code
      },
      {
        headers: {
          Authorization: authHeader,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in acceptInvitationExistingUser:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_invitations', action: 'acceptInvitationExistingUser', product: (req as any).productCode },
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
