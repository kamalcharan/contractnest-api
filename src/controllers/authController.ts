// src/controllers/authController.ts
import { Request, Response } from 'express';
import axios from 'axios';
import { captureException } from '../utils/sentry';
import {
  SUPABASE_URL,
  validateSupabaseConfig,
  getSupabaseUrlForProduct,
  getSupabaseKeyForProduct,
  validateProductSupabaseConfig
} from '../utils/supabaseConfig';
import { AuthRequest } from '../middleware/auth';

/**
 * Get product-specific Supabase configuration from request
 * Falls back to contractnest if no product specified
 */
const getProductSupabaseConfig = (req: Request): { url: string; key: string } => {
  const productCode = (req as any).productCode || 'contractnest';
  const url = getSupabaseUrlForProduct(productCode);
  const key = getSupabaseKeyForProduct(productCode);

  if (!url || !key) {
    throw new Error(`Supabase not configured for product: ${productCode}`);
  }

  return { url, key };
};

/**
 * Validate product Supabase config and return early if invalid
 */
const validateProductConfig = (req: Request, source: string, endpoint: string): boolean => {
  const productCode = (req as any).productCode || 'contractnest';
  return validateProductSupabaseConfig(productCode, source, endpoint);
};

// Add request deduplication map
const pendingRequests = new Map<string, Promise<any>>();

/**
 * Handle user login
 */
export const login = async (req: Request, res: Response) => {
  try {
    const productCode = (req as any).productCode || 'contractnest';

    // Validate product-specific Supabase configuration
    if (!validateProductConfig(req, 'api_auth', 'login')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    console.log(`Processing login for: ${email} (product: ${productCode})`);

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/login`,
      { email, password },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    // Check if user has incomplete registration
    if (response.data.user?.registration_status === 'pending_workspace') {
      console.log('User logged in with pending registration:', email);

      // Add a flag to help the frontend handle this case
      response.data.needs_workspace_setup = true;

      // If they have no tenants, make sure it's clear
      if (!response.data.tenants || response.data.tenants.length === 0) {
        console.log('User has no tenants - needs to complete registration');
      }
    }

    // Log successful login
    console.log('Login successful for:', email);
    console.log('User registration status:', response.data.user?.registration_status || 'complete');
    console.log('Number of tenants:', response.data.tenants?.length || 0);

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in login:', error.message);

    // Send error to Sentry with context
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'login', product: (req as any).productCode },
      email: req.body.email
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Login failed';

    return res.status(status).json({ error: message });
  }
};

/**
 * Handle user registration
 */
export const register = async (req: Request, res: Response) => {
  try {
    const productCode = (req as any).productCode || 'contractnest';

    if (!validateProductConfig(req, 'api_auth', 'register')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const { email, password, firstName, lastName, workspaceName, countryCode, mobileNumber } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!workspaceName) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    console.log(`Processing registration for: ${email} (product: ${productCode})`);

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/register`,
      {
        email,
        password,
        firstName,
        lastName,
        workspaceName,
        countryCode,
        mobileNumber
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    console.log('Registration successful for:', email);

    return res.status(201).json(response.data);
  } catch (error: any) {
    console.error('Error in register:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'register', product: (req as any).productCode },
      email: req.body.email
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Registration failed';

    return res.status(status).json({ error: message });
  }
};

/**
 * Handle user registration with invitation
 */
export const registerWithInvitation = async (req: Request, res: Response) => {
  try {
    const productCode = (req as any).productCode || 'contractnest';

    if (!validateProductConfig(req, 'api_auth', 'registerWithInvitation')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const { email, password, firstName, lastName, userCode, secretCode, countryCode, mobileNumber } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    if (!userCode || !secretCode) {
      return res.status(400).json({ error: 'Invitation codes are required' });
    }

    console.log(`Processing registration with invitation for: ${email} (product: ${productCode})`);

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/register-with-invitation`,
      {
        email,
        password,
        firstName,
        lastName,
        userCode,
        secretCode,
        countryCode,
        mobileNumber
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    console.log('Registration with invitation successful for:', email);

    return res.status(201).json(response.data);
  } catch (error: any) {
    console.error('Error in registerWithInvitation:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'registerWithInvitation', product: (req as any).productCode },
      email: req.body.email
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Registration with invitation failed';

    return res.status(status).json({ error: message });
  }
};

/**
 * Handle token refresh
 */
export const refreshToken = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'refreshToken')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/refresh-token`,
      { refresh_token },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in refreshToken:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'refreshToken', product: (req as any).productCode }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Token refresh failed';

    return res.status(status).json({ error: message });
  }
};

/**
 * Handle user signout
 */
export const signout = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'signout')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/signout`,
      {},
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': supabaseKey
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in signout:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'signout', product: (req as any).productCode }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Signout failed';

    return res.status(status).json({ error: message });
  }
};

/**
 * Handle password reset request
 */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'resetPassword')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/reset-password`,
      { email },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in resetPassword:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'resetPassword', product: (req as any).productCode }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Password reset failed';

    return res.status(status).json({ error: message });
  }
};

/**
 * Handle password change
 */
export const changePassword = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'changePassword')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const { current_password, new_password } = req.body;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/change-password`,
      { current_password, new_password },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': supabaseKey
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in changePassword:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'changePassword', product: (req as any).productCode }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Password change failed';

    return res.status(status).json({ error: message });
  }
};

/**
 * Handle complete registration - WITH DEDUPLICATION
 */
export const completeRegistration = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'completeRegistration')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const { user, tenant } = req.body;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenant || !tenant.name) {
      return res.status(400).json({ error: 'Tenant information is required' });
    }

    // Create a unique key for deduplication
    const requestKey = `complete_reg_${authHeader}_${tenant.name}`;

    // Check if there's already a pending request
    if (pendingRequests.has(requestKey)) {
      console.log('Duplicate complete registration request detected, waiting for existing request');
      try {
        const existingPromise = pendingRequests.get(requestKey);
        const result = await existingPromise;
        return res.status(200).json(result.data);
      } catch (error) {
        // If the original request failed, remove it and let this one proceed
        pendingRequests.delete(requestKey);
      }
    }

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    // Create the request promise
    const requestPromise = axios.post(
      `${supabaseUrl}/functions/v1/auth/complete-registration`,
      { user, tenant },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': supabaseKey
        }
      }
    );

    // Store the promise
    pendingRequests.set(requestKey, requestPromise);

    try {
      const response = await requestPromise;

      // Clean up after successful request
      pendingRequests.delete(requestKey);

      return res.status(200).json(response.data);
    } catch (error) {
      // Clean up after failed request
      pendingRequests.delete(requestKey);
      throw error;
    }

  } catch (error: any) {
    console.error('Error in completeRegistration:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'completeRegistration', product: (req as any).productCode }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Registration completion failed';

    return res.status(status).json({ error: message });
  }
};

/**
 * Get user profile
 */
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'getUserProfile')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.get(
      `${supabaseUrl}/functions/v1/auth/user`,
      {
        headers: {
          'Authorization': authHeader,
          ...(tenantId && { 'x-tenant-id': tenantId }),
          'Content-Type': 'application/json',
          'apikey': supabaseKey
        }
      }
    );

    // ADD THIS: Log if user has pending registration
    if (response.data.registration_status === 'pending_workspace') {
      console.log('User has pending workspace registration:', response.data.email);
    }

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in getUserProfile:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'getUserProfile', product: (req as any).productCode }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch user profile';

    return res.status(status).json({ error: message });
  }
};

/**
 * Initiate Google OAuth flow
 */
export const initiateGoogleAuth = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'initiateGoogleAuth')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const { returnUrl } = req.body;

    console.log('Initiating Google OAuth flow');

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/google`,
      { returnUrl },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error initiating Google auth:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'initiateGoogleAuth', product: (req as any).productCode },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to initiate Google authentication';

    return res.status(status).json({ error: message });
  }
};

/**
 * Handle Google OAuth callback
 */
export const handleGoogleCallback = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'handleGoogleCallback')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    console.log('Processing Google OAuth callback');

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/google-callback`,
      { code, state },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    console.log('Google OAuth callback processed successfully');

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in Google callback:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'handleGoogleCallback', product: (req as any).productCode },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Google authentication failed';

    return res.status(status).json({ error: message });
  }
};

/**
 * Link Google account to existing user
 */
export const linkGoogleAccount = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'linkGoogleAccount')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const { googleEmail, googleId } = req.body;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!googleEmail || !googleId) {
      return res.status(400).json({ error: 'Google email and ID are required' });
    }

    console.log('Linking Google account for user');

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/google-link`,
      { googleEmail, googleId },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': supabaseKey
        }
      }
    );

    console.log('Google account linked successfully');

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error linking Google account:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'linkGoogleAccount', product: (req as any).productCode },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to link Google account';

    return res.status(status).json({ error: message });
  }
};

/**
 * Unlink Google account from user
 */
export const unlinkGoogleAccount = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'unlinkGoogleAccount')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    console.log('Unlinking Google account');

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/google-unlink`,
      {},
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': supabaseKey
        }
      }
    );

    console.log('Google account unlinked successfully');

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error unlinking Google account:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'unlinkGoogleAccount', product: (req as any).productCode },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to unlink Google account';

    return res.status(status).json({ error: message });
  }
};

/**
 * Handle password verification (for lock screen)
 */
export const verifyPassword = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_auth', 'verifyPassword')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const { password } = req.body;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.post(
      `${supabaseUrl}/functions/v1/auth/verify-password`,
      { password },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': supabaseKey
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in verifyPassword:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'verifyPassword', product: (req as any).productCode }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Password verification failed';

    return res.status(status).json({ error: message });
  }
};

/**
 * Update user preferences - Modified to work with Express route typing
 */
export const updateUserPreferences = async (req: any, res: Response) => {
  try {
    console.log('🎯 updateUserPreferences handler called');

    if (!validateProductConfig(req, 'api_auth', 'updateUserPreferences')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    // Check if user exists on request (added by authenticate middleware)
    if (!req.user || !req.user.id) {
      console.log('⚠️ No user found on request object');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { preferred_theme, is_dark_mode, preferred_language } = req.body;

    // Validate at least one preference is being updated
    if (preferred_theme === undefined && is_dark_mode === undefined && preferred_language === undefined) {
      return res.status(400).json({ error: 'No preferences to update' });
    }

    console.log('Updating user preferences for:', req.user.email || req.user.id);
    console.log('Preferences to update:', { preferred_theme, is_dark_mode, preferred_language });

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    const response = await axios.patch(
      `${supabaseUrl}/functions/v1/auth/preferences`,
      {
        preferred_theme,
        is_dark_mode,
        preferred_language
      },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': supabaseKey
        }
      }
    );

    console.log('User preferences updated successfully');

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('❌ Error updating preferences:', error.message);
    console.error('Error details:', error.response?.data);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'updateUserPreferences', product: (req as any).productCode },
      user: req.user?.email || req.user?.id
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to update preferences';

    return res.status(status).json({ error: message });
  }
};

/**
 * Create tenant for Google users - NEW FUNCTION WITH DEDUPLICATION
 */
export const createGoogleTenant = async (req: Request, res: Response) => {
  try {
    if (!validateProductConfig(req, 'api_tenants', 'createGoogleTenant')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const { name, workspace_code } = req.body;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!name || !workspace_code) {
      return res.status(400).json({ error: 'Workspace name and code are required' });
    }

    // Create a unique key for deduplication
    const requestKey = `create_tenant_${authHeader}_${workspace_code}`;

    // Check if there's already a pending request
    if (pendingRequests.has(requestKey)) {
      console.log('Duplicate create tenant request detected, waiting for existing request');
      try {
        const existingPromise = pendingRequests.get(requestKey);
        const result = await existingPromise;
        return res.status(200).json(result.data);
      } catch (error) {
        // If the original request failed, remove it and let this one proceed
        pendingRequests.delete(requestKey);
      }
    }

    // Get product-specific Supabase config
    const { url: supabaseUrl, key: supabaseKey } = getProductSupabaseConfig(req);

    // Create the request promise
    const requestPromise = axios.post(
      `${supabaseUrl}/functions/v1/create-google`,
      { name, workspace_code },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': supabaseKey
        }
      }
    );

    // Store the promise
    pendingRequests.set(requestKey, requestPromise);

    try {
      const response = await requestPromise;

      // Clean up after successful request
      pendingRequests.delete(requestKey);

      console.log('Google tenant created successfully');
      return res.status(201).json(response.data);
    } catch (error) {
      // Clean up after failed request
      pendingRequests.delete(requestKey);
      throw error;
    }

  } catch (error: any) {
    console.error('Error creating Google tenant:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_tenants', action: 'createGoogleTenant', product: (req as any).productCode },
      user: req.headers.authorization
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to create workspace';
    const code = error.response?.data?.code;

    return res.status(status).json({ error: message, code });
  }
};

// Cleanup old pending requests periodically
setInterval(() => {
  // Simple cleanup - remove if map gets too large
  if (pendingRequests.size > 100) {
    console.log('Cleaning up pending requests map, current size:', pendingRequests.size);
    pendingRequests.clear();
  }
}, 60000); // Run every minute

// Export the new function as well
export default {
  login,
  register,
  registerWithInvitation,
  refreshToken,
  signout,
  resetPassword,
  changePassword,
  completeRegistration,
  getUserProfile,
  initiateGoogleAuth,
  handleGoogleCallback,
  linkGoogleAccount,
  unlinkGoogleAccount,
  verifyPassword,
  updateUserPreferences,
  createGoogleTenant // Add the new function to exports
};
