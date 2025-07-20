// src/controllers/authController.ts
import { Request, Response } from 'express';
import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL, validateSupabaseConfig } from '../utils/supabaseConfig';
import { AuthRequest } from '../middleware/auth';

/**
 * Handle user login
 */
export const login = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_auth', 'login')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    console.log('Processing login for:', email);
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/login`,
      { email, password },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'apikey': process.env.SUPABASE_KEY
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
      tags: { source: 'api_auth', action: 'login' },
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
    if (!validateSupabaseConfig('api_auth', 'register')) {
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
    
    console.log('Processing registration for:', email);
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/register`,
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
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    console.log('Registration successful for:', email);
    
    return res.status(201).json(response.data);
  } catch (error: any) {
    console.error('Error in register:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'register' },
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
    if (!validateSupabaseConfig('api_auth', 'registerWithInvitation')) {
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
    
    console.log('Processing registration with invitation for:', email);
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/register-with-invitation`,
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
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    console.log('Registration with invitation successful for:', email);
    
    return res.status(201).json(response.data);
  } catch (error: any) {
    console.error('Error in registerWithInvitation:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'registerWithInvitation' },
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
    if (!validateSupabaseConfig('api_auth', 'refreshToken')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/refresh-token`,
      { refresh_token },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in refreshToken:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'refreshToken' }
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
    if (!validateSupabaseConfig('api_auth', 'signout')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/signout`,
      {},
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in signout:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'signout' }
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
    if (!validateSupabaseConfig('api_auth', 'resetPassword')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/reset-password`,
      { email },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in resetPassword:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'resetPassword' }
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
    if (!validateSupabaseConfig('api_auth', 'changePassword')) {
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
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/change-password`,
      { current_password, new_password },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in changePassword:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'changePassword' }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Password change failed';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Handle complete registration
 */
export const completeRegistration = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_auth', 'completeRegistration')) {
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
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/complete-registration`,
      { user, tenant },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in completeRegistration:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'completeRegistration' }
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
    if (!validateSupabaseConfig('api_auth', 'getUserProfile')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    const response = await axios.get(
      `${SUPABASE_URL}/functions/v1/auth/user`,
      {
        headers: {
          'Authorization': authHeader,
          ...(tenantId && { 'x-tenant-id': tenantId }),
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY
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
      tags: { source: 'api_auth', action: 'getUserProfile' }
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
    if (!validateSupabaseConfig('api_auth', 'initiateGoogleAuth')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missi ng Supabase configuration' 
      });
    }

    const { returnUrl } = req.body;

    console.log('Initiating Google OAuth flow');
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/google`,
      { returnUrl },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error initiating Google auth:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'initiateGoogleAuth' },
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
    if (!validateSupabaseConfig('api_auth', 'handleGoogleCallback')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const { code, state } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    console.log('Processing Google OAuth callback');
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/google-callback`,
      { code, state },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    console.log('Google OAuth callback processed successfully');
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in Google callback:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'handleGoogleCallback' },
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
    if (!validateSupabaseConfig('api_auth', 'linkGoogleAccount')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const { googleUserId, email } = req.body;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!googleUserId || !email) {
      return res.status(400).json({ error: 'Google user ID and email are required' });
    }

    console.log('Linking Google account for user');
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/google-link`,
      { googleUserId, email },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    console.log('Google account linked successfully');
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error linking Google account:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'linkGoogleAccount' },
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
    if (!validateSupabaseConfig('api_auth', 'unlinkGoogleAccount')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    console.log('Unlinking Google account');
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/google-unlink`,
      {},
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    console.log('Google account unlinked successfully');
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error unlinking Google account:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'unlinkGoogleAccount' },
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
    if (!validateSupabaseConfig('api_auth', 'verifyPassword')) {
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
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/auth/verify-password`,
      { password },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in verifyPassword:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'verifyPassword' }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Password verification failed';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Update user preferences
 */
export const updateUserPreferences = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_auth', 'updateUserPreferences')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    // Cast to AuthRequest to access user property
    const authReq = req as AuthRequest;
    
    // Check authentication
    if (!authReq.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const authHeader = req.headers.authorization;
    const { preferred_theme, is_dark_mode, preferred_language } = req.body;
    
    // Validate at least one preference is being updated
    if (preferred_theme === undefined && is_dark_mode === undefined && preferred_language === undefined) {
      return res.status(400).json({ error: 'No preferences to update' });
    }

    console.log('Updating user preferences for:', authReq.user.email);
    
    const response = await axios.patch(
      `${SUPABASE_URL}/functions/v1/auth/preferences`,
      { 
        preferred_theme, 
        is_dark_mode,
        preferred_language 
      },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY
        }
      }
    );
    
    console.log('User preferences updated successfully');
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error updating preferences:', error.message);
    
    const authReq = req as AuthRequest;
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_auth', action: 'updateUserPreferences' },
      user: authReq.user?.email
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to update preferences';
    
    return res.status(status).json({ error: message });
  }
};