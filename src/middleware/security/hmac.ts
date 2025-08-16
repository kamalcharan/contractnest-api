// src/middleware/security/hmac.ts
// ✅ PRODUCTION: Express HMAC signature verification middleware

import crypto from 'crypto';
import { Request } from 'express';

/**
 * HMAC signature verification result
 */
export interface HMACVerificationResult {
  valid: boolean;
  error?: string;
  timestamp?: number;
  computedSignature?: string;
  providedSignature?: string;
}

/**
 * HMAC configuration options
 */
export interface HMACConfig {
  secretKey: string;
  algorithm: string;
  timestampTolerance: number; // seconds
  requireTimestamp: boolean;
  headerName: string;
  timestampHeaderName: string;
}

/**
 * Default HMAC configuration - FIXED
 */
const DEFAULT_HMAC_CONFIG: HMACConfig = {
  secretKey: process.env.INTERNAL_SIGNING_SECRET || process.env.HMAC_SECRET_KEY || '', // ✅ Fixed to use your env var
  algorithm: 'sha256',
  timestampTolerance: 300, // 5 minutes
  requireTimestamp: true,
  headerName: 'x-signature',
  timestampHeaderName: 'x-timestamp'
};
/**
 * Extract request payload for HMAC verification
 */
function extractRequestPayload(req: Request): string {
  try {
    // For GET requests, use query parameters
    if (req.method === 'GET') {
      const sortedParams = Object.keys(req.query)
        .sort()
        .map(key => `${key}=${req.query[key]}`)
        .join('&');
      return sortedParams;
    }
    
    // For POST/PUT/PATCH requests, use body
    if (req.body) {
      if (typeof req.body === 'string') {
        return req.body;
      }
      return JSON.stringify(req.body);
    }
    
    return '';
  } catch (error) {
    console.error('[HMAC] Error extracting request payload:', error);
    return '';
  }
}

/**
 * Generate HMAC signature
 */
export function generateHMACSignature(
  method: string,
  path: string,
  payload: string,
  timestamp: number,
  config: Partial<HMACConfig> = {}
): string {
  const hmacConfig = { ...DEFAULT_HMAC_CONFIG, ...config };
  
  if (!hmacConfig.secretKey) {
    throw new Error('HMAC secret key is required');
  }
  
  // Create signature string: METHOD|PATH|PAYLOAD|TIMESTAMP
  const signatureString = `${method.toUpperCase()}|${path}|${payload}|${timestamp}`;
  
  // Generate HMAC signature
  const hmac = crypto.createHmac(hmacConfig.algorithm, hmacConfig.secretKey);
  hmac.update(signatureString, 'utf8');
  
  return hmac.digest('hex');
}

/**
 * Verify HMAC signature from request
 */
export async function verifyHMACSignature(
  req: Request,
  config: Partial<HMACConfig> = {}
): Promise<HMACVerificationResult> {
  const hmacConfig = { ...DEFAULT_HMAC_CONFIG, ...config };
  
  try {
    // Check if HMAC is enabled
    if (!hmacConfig.secretKey) {
      console.warn('[HMAC] HMAC secret key not configured - skipping verification');
      return { valid: true };
    }
    
    // Extract signature from headers
    const providedSignature = req.headers[hmacConfig.headerName] as string;
    if (!providedSignature) {
      return {
        valid: false,
        error: `Missing ${hmacConfig.headerName} header`
      };
    }
    
    // Extract timestamp from headers
    let timestamp: number | undefined;
    if (hmacConfig.requireTimestamp) {
      const timestampHeader = req.headers[hmacConfig.timestampHeaderName] as string;
      if (!timestampHeader) {
        return {
          valid: false,
          error: `Missing ${hmacConfig.timestampHeaderName} header`
        };
      }
      
      timestamp = parseInt(timestampHeader);
      if (isNaN(timestamp)) {
        return {
          valid: false,
          error: 'Invalid timestamp format'
        };
      }
      
      // Check timestamp tolerance
      const currentTime = Math.floor(Date.now() / 1000);
      const timeDifference = Math.abs(currentTime - timestamp);
      
      if (timeDifference > hmacConfig.timestampTolerance) {
        return {
          valid: false,
          error: `Timestamp too old. Difference: ${timeDifference}s, tolerance: ${hmacConfig.timestampTolerance}s`
        };
      }
    } else {
      timestamp = Math.floor(Date.now() / 1000);
    }
    
    // Extract request payload
    const payload = extractRequestPayload(req);
    
    // Generate expected signature
    const computedSignature = generateHMACSignature(
      req.method,
      req.path,
      payload,
      timestamp,
      hmacConfig
    );
    
    // Compare signatures using constant-time comparison
    const signaturesMatch = crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(computedSignature, 'hex')
    );
    
    if (!signaturesMatch) {
      return {
        valid: false,
        error: 'HMAC signature mismatch',
        computedSignature,
        providedSignature,
        timestamp
      };
    }
    
    return {
      valid: true,
      timestamp,
      computedSignature,
      providedSignature
    };
    
  } catch (error: any) {
    console.error('[HMAC] Verification error:', error);
    return {
      valid: false,
      error: `HMAC verification failed: ${error.message}`
    };
  }
}

/**
 * Express middleware for HMAC verification
 */
export function hmacMiddleware(config: Partial<HMACConfig> = {}) {
  return async (req: Request, res: any, next: any) => {
    try {
      const result = await verifyHMACSignature(req, config);
      
      if (!result.valid) {
        console.warn('[HMAC Middleware] Verification failed:', {
          path: req.path,
          method: req.method,
          error: result.error,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        
        return res.status(401).json({
          success: false,
          error: 'Authentication failed',
          code: 'INVALID_HMAC_SIGNATURE',
          timestamp: new Date().toISOString()
        });
      }
      
      // Add HMAC verification result to request for downstream use
      (req as any).hmacVerification = result;
      
      next();
    } catch (error: any) {
      console.error('[HMAC Middleware] Unexpected error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal authentication error',
        code: 'HMAC_VERIFICATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Development/testing HMAC bypass middleware
 */
export function hmacBypassMiddleware() {
  return (req: Request, res: any, next: any) => {
    if (process.env.NODE_ENV === 'development' || process.env.BYPASS_HMAC === 'true') {
      console.warn('[HMAC] BYPASSING HMAC verification in development mode');
      (req as any).hmacVerification = { valid: true };
      next();
    } else {
      return hmacMiddleware()(req, res, next);
    }
  };
}

/**
 * Utility functions for HMAC signature generation (for testing/clients)
 */
export class HMACUtils {
  private config: HMACConfig;
  
  constructor(config: Partial<HMACConfig> = {}) {
    this.config = { ...DEFAULT_HMAC_CONFIG, ...config };
  }
  
  /**
   * Generate signature for a request
   */
  signRequest(
    method: string,
    path: string,
    payload: any = null,
    timestamp?: number
  ): { signature: string; timestamp: number } {
    const requestTimestamp = timestamp || Math.floor(Date.now() / 1000);
    const payloadString = payload ? 
      (typeof payload === 'string' ? payload : JSON.stringify(payload)) : '';
    
    const signature = generateHMACSignature(
      method,
      path,
      payloadString,
      requestTimestamp,
      this.config
    );
    
    return { signature, timestamp: requestTimestamp };
  }
  
  /**
   * Generate headers for a request
   */
  generateHeaders(
    method: string,
    path: string,
    payload: any = null,
    additionalHeaders: Record<string, string> = {}
  ): Record<string, string> {
    const { signature, timestamp } = this.signRequest(method, path, payload);
    
    return {
      [this.config.headerName]: signature,
      [this.config.timestampHeaderName]: timestamp.toString(),
      'Content-Type': 'application/json',
      ...additionalHeaders
    };
  }
  
  /**
   * Create a signed request configuration for fetch/axios
   */
  createSignedRequestConfig(
    method: string,
    url: string,
    payload: any = null,
    additionalHeaders: Record<string, string> = {}
  ) {
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    const headers = this.generateHeaders(method, path, payload, additionalHeaders);
    
    return {
      method: method.toUpperCase(),
      headers,
      body: payload ? JSON.stringify(payload) : undefined
    };
  }
}

/**
 * Environment-specific HMAC configurations
 */
export const HMAC_CONFIGS = {
  production: {
    requireTimestamp: true,
    timestampTolerance: 300, // 5 minutes
    algorithm: 'sha256'
  },
  staging: {
    requireTimestamp: true,
    timestampTolerance: 600, // 10 minutes
    algorithm: 'sha256'
  },
  development: {
    requireTimestamp: false,
    timestampTolerance: 3600, // 1 hour
    algorithm: 'sha256'
  },
  test: {
    requireTimestamp: false,
    timestampTolerance: 3600, // 1 hour
    algorithm: 'sha256'
  }
} as const;

/**
 * Get HMAC configuration for current environment
 */
export function getEnvironmentHMACConfig(): Partial<HMACConfig> {
  const env = process.env.NODE_ENV || 'development';
  return HMAC_CONFIGS[env as keyof typeof HMAC_CONFIGS] || HMAC_CONFIGS.development;
}

/**
 * Validate HMAC configuration
 */
export function validateHMACConfig(config: Partial<HMACConfig>): { 
  isValid: boolean; 
  errors: string[] 
} {
  const errors: string[] = [];
  
  if (!config.secretKey) {
    errors.push('HMAC secret key is required');
  }
  
  if (config.secretKey && config.secretKey.length < 32) {
    errors.push('HMAC secret key should be at least 32 characters long');
  }
  
  if (config.algorithm && !crypto.getHashes().includes(config.algorithm)) {
    errors.push(`Unsupported HMAC algorithm: ${config.algorithm}`);
  }
  
  if (config.timestampTolerance && config.timestampTolerance < 60) {
    errors.push('Timestamp tolerance should be at least 60 seconds');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Initialize HMAC security with validation
 */
export function initializeHMACSecurity(): {
  isEnabled: boolean;
  config: HMACConfig;
  errors: string[];
} {
  const envConfig = getEnvironmentHMACConfig();
  const config = { ...DEFAULT_HMAC_CONFIG, ...envConfig };
  
  const validation = validateHMACConfig(config);
  
  if (!validation.isValid) {
    console.warn('[HMAC] Configuration validation failed:', validation.errors);
    return {
      isEnabled: false,
      config,
      errors: validation.errors
    };
  }
  
  console.log('[HMAC] Security initialized successfully', {
    algorithm: config.algorithm,
    requireTimestamp: config.requireTimestamp,
    timestampTolerance: config.timestampTolerance,
    environment: process.env.NODE_ENV
  });
  
  return {
    isEnabled: true,
    config,
    errors: []
  };
}

// =================================================================
// EXPORT DEFAULT MIDDLEWARE BASED ON ENVIRONMENT
// =================================================================

/**
 * Default HMAC middleware that adapts to environment
 */
export default function createHMACMiddleware(): any {
  const { isEnabled, config, errors } = initializeHMACSecurity();
  
  if (!isEnabled) {
    console.warn('[HMAC] Using bypass middleware due to configuration errors:', errors);
    return hmacBypassMiddleware();
  }
  
  return hmacMiddleware(config);
}

// =================================================================
// TESTING UTILITIES
// =================================================================

/**
 * Create a test HMAC utils instance
 */
export function createTestHMACUtils(secretKey: string = 'test-secret-key-32-characters-long'): HMACUtils {
  return new HMACUtils({
    secretKey,
    requireTimestamp: false,
    timestampTolerance: 3600,
    algorithm: 'sha256'
  });
}

/**
 * Generate test request with HMAC signature
 */
export function createTestRequestWithHMAC(
  method: string,
  path: string,
  payload: any = null,
  secretKey?: string
): {
  headers: Record<string, string>;
  body: string | undefined;
} {
  const utils = createTestHMACUtils(secretKey);
  const headers = utils.generateHeaders(method, path, payload);
  
  return {
    headers,
    body: payload ? JSON.stringify(payload) : undefined
  };
}

/**
 * Verify HMAC implementation with test cases
 */
export async function runHMACTests(): Promise<{ passed: number; failed: number; results: any[] }> {
  const results: any[] = [];
  let passed = 0;
  let failed = 0;
  
  const testCases = [
    {
      name: 'Valid GET request',
      method: 'GET',
      path: '/api/test',
      payload: null,
      shouldPass: true
    },
    {
      name: 'Valid POST request with payload',
      method: 'POST',
      path: '/api/test',
      payload: { test: 'data' },
      shouldPass: true
    },
    {
      name: 'Invalid signature',
      method: 'POST',
      path: '/api/test',
      payload: { test: 'data' },
      shouldPass: false,
      tamperSignature: true
    }
  ];
  
  for (const testCase of testCases) {
    try {
      const utils = createTestHMACUtils();
      const { signature, timestamp } = utils.signRequest(
        testCase.method,
        testCase.path,
        testCase.payload
      );
      
      const mockRequest = {
        method: testCase.method,
        path: testCase.path,
        body: testCase.payload,
        headers: {
          'x-signature': testCase.tamperSignature ? 'invalid-signature' : signature,
          'x-timestamp': timestamp.toString()
        }
      } as unknown as Request;
      
      const result = await verifyHMACSignature(mockRequest);
      
      if (result.valid === testCase.shouldPass) {
        passed++;
        results.push({ ...testCase, status: 'PASSED', result });
      } else {
        failed++;
        results.push({ ...testCase, status: 'FAILED', result, expected: testCase.shouldPass });
      }
    } catch (error: any) {
      failed++;
      results.push({ ...testCase, status: 'ERROR', error: error?.message || 'Unknown error' });
    }
  }
  
  console.log(`[HMAC Tests] Completed: ${passed} passed, ${failed} failed`);
  
  return { passed, failed, results };
}