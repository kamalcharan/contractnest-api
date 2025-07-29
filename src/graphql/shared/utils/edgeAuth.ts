// src/graphql/shared/utils/edgeAuth.ts
// Edge Function Authentication Utilities
// Handles secure communication with Edge Functions using INTERNAL_SIGNING_SECRET

import crypto from 'crypto';
import { GraphQLContext } from '../types/catalogContext';

// =================================================================
// TYPES AND INTERFACES
// =================================================================

/**
 * JWT payload for Edge Function authentication
 */
export interface EdgeAuthPayload {
  iss: string; // issuer (GraphQL server)
  aud: string; // audience (Edge Function)
  sub: string; // subject (tenant_id)
  iat: number; // issued at
  exp: number; // expiration
  jti: string; // JWT ID (unique identifier)
  
  // Custom claims
  tenant_id: string;
  user_id?: string;
  user_email?: string;
  environment: 'live' | 'test';
  permissions: string[];
  session_id?: string;
  request_id: string;
  correlation_id?: string;
}

/**
 * Edge Function authentication options
 */
export interface EdgeAuthOptions {
  expiresIn?: number; // seconds (default: 300 = 5 minutes)
  audience?: string; // target Edge Function name
  includeUserContext?: boolean; // include user information in token
  customClaims?: Record<string, any>; // additional custom claims
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: EdgeAuthPayload;
  error?: string;
  expired?: boolean;
  remainingTime?: number; // seconds until expiration
}

/**
 * Signature verification result
 */
export interface SignatureResult {
  valid: boolean;
  error?: string;
  timestamp: number;
}

// =================================================================
// EDGE AUTHENTICATION SERVICE
// =================================================================

export class EdgeAuthService {
  private signingSecret: string;
  private algorithm: string = 'HS256';
  private defaultExpiresIn: number = 300; // 5 minutes
  private issuer: string = 'graphql-server';
  private clockSkewTolerance: number = 60; // 1 minute tolerance for clock skew

  constructor(signingSecret: string) {
    if (!signingSecret) {
      throw new Error('INTERNAL_SIGNING_SECRET is required for Edge Function authentication');
    }
    
    this.signingSecret = signingSecret;
    
    // Validate secret strength
    if (signingSecret.length < 32) {
      console.warn('INTERNAL_SIGNING_SECRET should be at least 32 characters for security');
    }
  }

  // =================================================================
  // TOKEN GENERATION
  // =================================================================

  /**
   * Generate JWT token for Edge Function authentication
   */
  generateToken(context: GraphQLContext, options: EdgeAuthOptions = {}): string {
    try {
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = options.expiresIn || this.defaultExpiresIn;
      const jti = this.generateJTI();

      // Build payload
      const payload: EdgeAuthPayload = {
        iss: this.issuer,
        aud: options.audience || 'edge-functions',
        sub: context.tenant.id,
        iat: now,
        exp: now + expiresIn,
        jti,
        
        // Custom claims
        tenant_id: context.tenant.id,
        environment: context.isLiveEnvironment() ? 'live' : 'test',
        permissions: this.extractPermissions(context),
        request_id: context.metadata.request_id,
        correlation_id: context.metadata.correlation_id,
        
        // Optional user context
        ...(options.includeUserContext && context.user ? {
          user_id: context.user.id,
          user_email: context.user.email
        } : {}),
        
        // Additional custom claims
        ...options.customClaims
      };

      // Add session ID if available
      if (context.metadata.session_id) {
        payload.session_id = context.metadata.session_id;
      }

      return this.signJWT(payload);

    } catch (error: any) {
      console.error('Failed to generate Edge Function token:', error);
      throw new Error(`Token generation failed: ${error.message}`);
    }
  }

  /**
   * Generate long-lived token for system operations
   */
  generateSystemToken(tenantId: string, options: EdgeAuthOptions = {}): string {
    try {
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = options.expiresIn || 3600; // 1 hour for system tokens
      const jti = this.generateJTI();

      const payload: EdgeAuthPayload = {
        iss: this.issuer,
        aud: options.audience || 'edge-functions',
        sub: tenantId,
        iat: now,
        exp: now + expiresIn,
        jti,
        
        tenant_id: tenantId,
        environment: 'live', // System tokens default to live
        permissions: ['system:all'], // System-level permissions
        request_id: `system-${jti}`,
        
        ...options.customClaims
      };

      return this.signJWT(payload);

    } catch (error: any) {
      console.error('Failed to generate system token:', error);
      throw new Error(`System token generation failed: ${error.message}`);
    }
  }

  /**
   * Generate refresh token for long-running operations
   */
  generateRefreshToken(context: GraphQLContext): string {
    return this.generateToken(context, {
      expiresIn: 86400, // 24 hours
      audience: 'refresh',
      includeUserContext: true,
      customClaims: {
        token_type: 'refresh'
      }
    });
  }

  // =================================================================
  // TOKEN VALIDATION
  // =================================================================

  /**
   * Validate JWT token from Edge Function response
   */
  validateToken(token: string): TokenValidationResult {
    try {
      if (!token) {
        return { valid: false, error: 'Token is required' };
      }

      // Remove Bearer prefix if present
      const cleanToken = token.replace(/^Bearer\s+/i, '');

      // Verify and decode JWT
      const payload = this.verifyJWT(cleanToken);

      // Additional validation
      const validationError = this.validatePayload(payload);
      if (validationError) {
        return { valid: false, error: validationError };
      }

      // Calculate remaining time
      const now = Math.floor(Date.now() / 1000);
      const remainingTime = payload.exp - now;

      return {
        valid: true,
        payload,
        remainingTime: Math.max(0, remainingTime)
      };

    } catch (error: any) {
      console.error('Token validation failed:', error);
      
      if (error.message.includes('expired')) {
        return { valid: false, error: 'Token has expired', expired: true };
      }
      
      return { valid: false, error: `Invalid token: ${error.message}` };
    }
  }

  /**
   * Check if token is about to expire
   */
  isTokenExpiringSoon(token: string, thresholdSeconds: number = 60): boolean {
    const validation = this.validateToken(token);
    
    if (!validation.valid || !validation.remainingTime) {
      return true; // Treat invalid tokens as expiring
    }

    return validation.remainingTime <= thresholdSeconds;
  }

  /**
   * Refresh token if it's expiring soon
   */
  refreshTokenIfNeeded(context: GraphQLContext, currentToken: string, options: EdgeAuthOptions = {}): string | null {
    if (this.isTokenExpiringSoon(currentToken)) {
      console.log('Token is expiring soon, generating new token');
      return this.generateToken(context, options);
    }
    
    return null; // No refresh needed
  }

  // =================================================================
  // REQUEST SIGNING
  // =================================================================

  /**
   * Sign request payload for additional security
   */
  signRequest(payload: any, timestamp?: number): string {
    try {
      const ts = timestamp || Date.now();
      const stringToSign = `${ts}.${JSON.stringify(payload)}`;
      
      const signature = crypto
        .createHmac('sha256', this.signingSecret)
        .update(stringToSign)
        .digest('hex');
      
      return `t=${ts},v1=${signature}`;
    } catch (error: any) {
      console.error('Request signing failed:', error);
      throw new Error(`Request signing failed: ${error.message}`);
    }
  }

  /**
   * Verify request signature
   */
  verifyRequestSignature(payload: any, signature: string, toleranceSeconds: number = 300): SignatureResult {
    try {
      // Parse signature header
      const elements = signature.split(',');
      const timestampElement = elements.find(e => e.startsWith('t='));
      const signatureElement = elements.find(e => e.startsWith('v1='));
      
      if (!timestampElement || !signatureElement) {
        return { valid: false, error: 'Invalid signature format', timestamp: 0 };
      }
      
      const timestamp = parseInt(timestampElement.split('=')[1]);
      const expectedSignature = signatureElement.split('=')[1];
      
      // Check timestamp tolerance
      const now = Date.now();
      if (Math.abs(now - timestamp) > toleranceSeconds * 1000) {
        return { valid: false, error: 'Request timestamp outside tolerance', timestamp };
      }
      
      // Verify signature
      const stringToSign = `${timestamp}.${JSON.stringify(payload)}`;
      const computedSignature = crypto
        .createHmac('sha256', this.signingSecret)
        .update(stringToSign)
        .digest('hex');
      
      const valid = this.secureCompare(expectedSignature, computedSignature);
      
      return {
        valid,
        error: valid ? undefined : 'Signature verification failed',
        timestamp
      };
      
    } catch (error: any) {
      console.error('Signature verification failed:', error);
      return { valid: false, error: `Verification failed: ${error.message}`, timestamp: 0 };
    }
  }

  // =================================================================
  // PRIVATE METHODS
  // =================================================================

  /**
   * Sign JWT with HMAC SHA256
   */
  private signJWT(payload: EdgeAuthPayload): string {
    try {
      // Create header
      const header = {
        alg: this.algorithm,
        typ: 'JWT'
      };

      // Encode components
      const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
      const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
      
      // Create signature
      const stringToSign = `${encodedHeader}.${encodedPayload}`;
      const signature = crypto
        .createHmac('sha256', this.signingSecret)
        .update(stringToSign)
        .digest('base64url');

      return `${stringToSign}.${signature}`;

    } catch (error: any) {
      throw new Error(`JWT signing failed: ${error.message}`);
    }
  }

  /**
   * Verify and decode JWT
   */
  private verifyJWT(token: string): EdgeAuthPayload {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      const [headerB64, payloadB64, signatureB64] = parts;
      
      // Verify signature
      const stringToSign = `${headerB64}.${payloadB64}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.signingSecret)
        .update(stringToSign)
        .digest('base64url');

      if (!this.secureCompare(signatureB64, expectedSignature)) {
        throw new Error('Invalid signature');
      }

      // Decode header and payload
      const header = JSON.parse(this.base64UrlDecode(headerB64));
      const payload = JSON.parse(this.base64UrlDecode(payloadB64));

      // Verify algorithm
      if (header.alg !== this.algorithm) {
        throw new Error(`Unsupported algorithm: ${header.alg}`);
      }

      return payload as EdgeAuthPayload;

    } catch (error: any) {
      throw new Error(`JWT verification failed: ${error.message}`);
    }
  }

  /**
   * Validate JWT payload claims
   */
  private validatePayload(payload: EdgeAuthPayload): string | null {
    const now = Math.floor(Date.now() / 1000);

    // Check expiration
    if (payload.exp <= now) {
      return 'Token has expired';
    }

    // Check issued at (with clock skew tolerance)
    if (payload.iat > now + this.clockSkewTolerance) {
      return 'Token issued in the future';
    }

    // Check issuer
    if (payload.iss !== this.issuer) {
      return 'Invalid issuer';
    }

    // Check required claims
    if (!payload.tenant_id) {
      return 'Missing tenant_id claim';
    }

    if (!payload.request_id) {
      return 'Missing request_id claim';
    }

    return null; // Valid
  }

  /**
   * Extract permissions from GraphQL context
   */
  private extractPermissions(context: GraphQLContext): string[] {
    const permissions: string[] = [];

    // Add basic permissions based on user role
    if (context.user?.is_super_admin) {
      permissions.push('admin:all');
    }

    if (context.tenant.user_is_admin) {
      permissions.push('tenant:admin');
    }

    // Add specific permissions if available
    if (context.tenant.user_permissions) {
      permissions.push(...context.tenant.user_permissions);
    }

    // Default permissions
    permissions.push('catalog:read');

    return permissions;
  }

  /**
   * Generate unique JWT ID
   */
  private generateJTI(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Base64URL encode
   */
  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Base64URL decode
   */
  private base64UrlDecode(str: string): string {
    // Add padding if needed
    const padding = '='.repeat((4 - str.length % 4) % 4);
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
    
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  /**
   * Secure string comparison to prevent timing attacks
   */
  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Create EdgeAuthService instance
 */
export function createEdgeAuthService(signingSecret?: string): EdgeAuthService {
  const secret = signingSecret || process.env.INTERNAL_SIGNING_SECRET;
  
  if (!secret) {
    throw new Error('INTERNAL_SIGNING_SECRET environment variable is required');
  }

  return new EdgeAuthService(secret);
}

/**
 * Generate authentication headers for Edge Function requests
 */
export function generateAuthHeaders(context: GraphQLContext, options: EdgeAuthOptions = {}): Record<string, string> {
  try {
    const authService = createEdgeAuthService();
    const token = authService.generateToken(context, options);

    return {
      'Authorization': `Bearer ${token}`,
      'X-Request-ID': context.metadata.request_id,
      'X-Tenant-ID': context.tenant.id,
      'X-Environment': context.isLiveEnvironment() ? 'live' : 'test',
      ...(context.user?.id ? { 'X-User-ID': context.user.id } : {}),
      ...(context.metadata.session_id ? { 'X-Session-ID': context.metadata.session_id } : {}),
      ...(context.metadata.correlation_id ? { 'X-Correlation-ID': context.metadata.correlation_id } : {})
    };
  } catch (error: any) {
    console.error('Failed to generate auth headers:', error);
    
    // Return basic headers without JWT
    return {
      'X-Request-ID': context.metadata.request_id,
      'X-Tenant-ID': context.tenant.id,
      'X-Environment': context.isLiveEnvironment() ? 'live' : 'test'
    };
  }
}

/**
 * Validate incoming Edge Function response authentication
 */
export function validateEdgeResponse(responseHeaders: Headers): TokenValidationResult {
  try {
    const authHeader = responseHeaders.get('Authorization') || responseHeaders.get('X-Auth-Token');
    
    if (!authHeader) {
      return { valid: false, error: 'No authentication header in response' };
    }

    const authService = createEdgeAuthService();
    return authService.validateToken(authHeader);

  } catch (error: any) {
    console.error('Edge response validation failed:', error);
    return { valid: false, error: `Response validation failed: ${error.message}` };
  }
}

/**
 * Create signed webhook payload
 */
export function createWebhookSignature(payload: any, secret?: string): string {
  const authService = createEdgeAuthService(secret);
  return authService.signRequest(payload);
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(payload: any, signature: string, secret?: string): SignatureResult {
  const authService = createEdgeAuthService(secret);
  return authService.verifyRequestSignature(payload, signature);
}

/**
 * Check if Edge Function authentication is properly configured
 */
export function isEdgeAuthConfigured(): boolean {
  return !!process.env.INTERNAL_SIGNING_SECRET && process.env.INTERNAL_SIGNING_SECRET.length >= 32;
}

/**
 * Get Edge Function authentication status
 */
export function getEdgeAuthStatus(): { configured: boolean; secretLength: number; algorithm: string } {
  const secret = process.env.INTERNAL_SIGNING_SECRET;
  
  return {
    configured: !!secret,
    secretLength: secret ? secret.length : 0,
    algorithm: 'HS256'
  };
}

// =================================================================
// EXPORTS
// =================================================================

export default EdgeAuthService;

export {
  EdgeAuthService,
  createEdgeAuthService,
  generateAuthHeaders,
  validateEdgeResponse,
  createWebhookSignature,
  verifyWebhookSignature,
  isEdgeAuthConfigured,
  getEdgeAuthStatus
};