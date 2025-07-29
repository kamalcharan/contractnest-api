// src/graphql/shared/services/edgeService.ts
// Base Edge Service - Shared utilities for Edge Function integration
// Provides common functionality for all Edge Function calls

import { GraphQLContext } from '../types/catalogContext';

// =================================================================
// TYPES AND INTERFACES
// =================================================================

/**
 * Base Edge Function request configuration
 */
export interface EdgeFunctionRequest {
  functionName: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path?: string;
  data?: any;
  queryParams?: Record<string, any>;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  cache?: EdgeCacheConfig;
}

/**
 * Edge Function response structure
 */
export interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode: number;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    has_more: boolean;
  };
  version_info?: {
    version_number: number;
    is_current_version: boolean;
    total_versions: number;
    version_reason?: string;
  };
  warnings?: string[];
  metadata?: Record<string, any>;
  execution_time?: number;
}

/**
 * Edge Function cache configuration
 */
export interface EdgeCacheConfig {
  enabled: boolean;
  ttl: number; // seconds
  key?: string;
  tags?: string[];
  strategy?: 'cache-first' | 'network-first' | 'cache-only' | 'network-only';
}

/**
 * Edge Function error details
 */
export interface EdgeFunctionError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
  timestamp: string;
  request_id?: string;
  function_name?: string;
}

/**
 * Request retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffFactor: number;
  retryCondition?: (error: any, attempt: number) => boolean;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

// =================================================================
// BASE EDGE SERVICE CLASS
// =================================================================

/**
 * Base Edge Service providing common functionality for all Edge Function integrations
 */
export class BaseEdgeService {
  protected context: GraphQLContext;
  protected baseUrl: string;
  protected defaultTimeout: number;
  protected defaultRetries: number;
  protected rateLimitConfig: RateLimitConfig;

  constructor(context: GraphQLContext, functionBaseName?: string) {
    this.context = context;
    this.baseUrl = this.buildBaseUrl(functionBaseName);
    this.defaultTimeout = parseInt(process.env.EDGE_FUNCTION_TIMEOUT || '30000'); // 30 seconds
    this.defaultRetries = parseInt(process.env.EDGE_FUNCTION_RETRIES || '2');
    this.rateLimitConfig = {
      enabled: process.env.EDGE_RATE_LIMITING_ENABLED === 'true',
      maxRequests: parseInt(process.env.EDGE_MAX_REQUESTS || '100'),
      windowMs: parseInt(process.env.EDGE_RATE_WINDOW || '60000') // 1 minute
    };
  }

  // =================================================================
  // PUBLIC METHODS
  // =================================================================

  /**
   * Make authenticated request to Edge Function
   */
  async makeRequest<T = any>(request: EdgeFunctionRequest): Promise<EdgeFunctionResponse<T>> {
    const startTime = Date.now();
    let lastError: any;

    // Validate request
    this.validateRequest(request);

    // Apply rate limiting
    if (this.rateLimitConfig.enabled) {
      await this.checkRateLimit(request.functionName);
    }

    // Retry logic
    const maxRetries = request.retries ?? this.defaultRetries;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check cache first
        if (request.cache?.enabled && request.method === 'GET') {
          const cachedResponse = await this.getFromCache(request);
          if (cachedResponse) {
            return cachedResponse;
          }
        }

        // Make the actual request
        const response = await this.executeRequest(request, attempt);

        // Cache successful responses
        if (response.success && request.cache?.enabled && request.method === 'GET') {
          await this.setCache(request, response);
        }

        // Add execution time
        response.execution_time = Date.now() - startTime;

        return response;

      } catch (error: any) {
        lastError = error;
        
        // Check if we should retry
        if (attempt < maxRetries && this.shouldRetry(error, attempt, request)) {
          const delay = this.calculateRetryDelay(attempt);
          console.warn(`Edge Function request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error.message);
          await this.sleep(delay);
          continue;
        }
        
        // No more retries or error is not retryable
        break;
      }
    }

    // All retries exhausted, return error response
    const errorResponse: EdgeFunctionResponse<T> = {
      success: false,
      error: lastError?.message || 'Edge Function request failed',
      statusCode: lastError?.statusCode || 500,
      execution_time: Date.now() - startTime
    };

    return errorResponse;
  }

  /**
   * Make multiple parallel requests to Edge Functions
   */
  async makeBatchRequests<T = any>(requests: EdgeFunctionRequest[]): Promise<EdgeFunctionResponse<T>[]> {
    const startTime = Date.now();

    try {
      // Execute all requests in parallel
      const promises = requests.map(request => this.makeRequest<T>(request));
      const responses = await Promise.allSettled(promises);

      // Process results
      const results: EdgeFunctionResponse<T>[] = responses.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            success: false,
            error: result.reason?.message || 'Batch request failed',
            statusCode: 500,
            execution_time: Date.now() - startTime
          };
        }
      });

      console.log(`Batch request completed: ${results.filter(r => r.success).length}/${results.length} successful`);
      return results;

    } catch (error: any) {
      console.error('Batch request error:', error);
      
      // Return error responses for all requests
      return requests.map(() => ({
        success: false,
        error: error.message || 'Batch request failed',
        statusCode: 500,
        execution_time: Date.now() - startTime
      }));
    }
  }

  /**
   * Stream data from Edge Function (for large responses)
   */
  async streamRequest(request: EdgeFunctionRequest): Promise<ReadableStream> {
    try {
      const url = this.buildRequestUrl(request);
      const headers = this.buildRequestHeaders(request);

      const response = await fetch(url, {
        method: request.method,
        headers,
        body: request.data ? JSON.stringify(request.data) : undefined,
        signal: AbortSignal.timeout(request.timeout || this.defaultTimeout)
      });

      if (!response.ok) {
        throw new Error(`Stream request failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body for stream');
      }

      return response.body;

    } catch (error: any) {
      console.error('Stream request error:', error);
      throw error;
    }
  }

  /**
   * Health check for Edge Function
   */
  async healthCheck(functionName: string): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest({
        functionName,
        method: 'GET',
        path: '/health',
        timeout: 5000, // 5 second timeout for health checks
        retries: 0 // No retries for health checks
      });

      return {
        healthy: response.success,
        latency: Date.now() - startTime,
        error: response.error
      };

    } catch (error: any) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.message
      };
    }
  }

  // =================================================================
  // PROTECTED METHODS (for subclasses)
  // =================================================================

  /**
   * Build URL for Edge Function request
   */
  protected buildRequestUrl(request: EdgeFunctionRequest): string {
    const baseUrl = request.functionName === 'custom' 
      ? this.context.config.edge_functions_url 
      : `${this.context.config.edge_functions_url}/${request.functionName}`;
    
    const url = new URL(baseUrl + (request.path || ''));

    // Add query parameters
    if (request.queryParams) {
      Object.entries(request.queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => url.searchParams.append(key, String(v)));
          } else {
            url.searchParams.set(key, String(value));
          }
        }
      });
    }

    return url.toString();
  }

  /**
   * Build headers for Edge Function request
   */
  protected buildRequestHeaders(request: EdgeFunctionRequest): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-tenant-id': this.context.tenant.id,
      'x-request-id': this.context.metadata.request_id,
      'x-environment': this.context.isLiveEnvironment() ? 'live' : 'test',
      'User-Agent': `GraphQL-Client/${process.env.npm_package_version || '1.0.0'}`,
      ...request.headers
    };

    // Add authentication
    if (this.context.config.internal_signing_secret) {
      headers['Authorization'] = `Bearer ${this.context.config.internal_signing_secret}`;
    }

    // Add user context
    if (this.context.user?.id) {
      headers['x-user-id'] = this.context.user.id;
    }

    if (this.context.metadata.session_id) {
      headers['x-session-id'] = this.context.metadata.session_id;
    }

    if (this.context.metadata.correlation_id) {
      headers['x-correlation-id'] = this.context.metadata.correlation_id;
    }

    // Add custom headers from request
    if (request.headers) {
      Object.assign(headers, request.headers);
    }

    return headers;
  }

  /**
   * Execute the actual HTTP request
   */
  protected async executeRequest<T = any>(request: EdgeFunctionRequest, attempt: number): Promise<EdgeFunctionResponse<T>> {
    const url = this.buildRequestUrl(request);
    const headers = this.buildRequestHeaders(request);
    const timeout = request.timeout || this.defaultTimeout;

    console.log(`Making Edge Function request (attempt ${attempt + 1}): ${request.method} ${url}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: RequestInit = {
        method: request.method,
        headers,
        signal: controller.signal
      };

      if (request.data && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
        fetchOptions.body = JSON.stringify(request.data);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Parse response
      let responseData: any;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      // Handle non-2xx responses
      if (!response.ok) {
        console.error(`Edge Function error: ${response.status} ${response.statusText}`, responseData);
        
        return {
          success: false,
          error: responseData?.error || `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          data: responseData
        };
      }

      // Successful response
      console.log(`Edge Function success: ${response.status}`, {
        function: request.functionName,
        method: request.method,
        hasData: !!responseData?.data
      });

      return {
        success: true,
        statusCode: response.status,
        ...responseData // Spread the response data (success, data, message, etc.)
      };

    } catch (error: any) {
      console.error(`Edge Function request failed:`, error);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      throw error;
    }
  }

  // =================================================================
  // PRIVATE METHODS
  // =================================================================

  /**
   * Build base URL for Edge Function
   */
  private buildBaseUrl(functionBaseName?: string): string {
    const baseUrl = this.context.config.edge_functions_url;
    
    if (!baseUrl) {
      throw new Error('Edge Functions URL not configured');
    }

    if (functionBaseName) {
      return `${baseUrl}/${functionBaseName}`;
    }

    return baseUrl;
  }

  /**
   * Validate Edge Function request
   */
  private validateRequest(request: EdgeFunctionRequest): void {
    if (!request.functionName) {
      throw new Error('Function name is required');
    }

    if (!request.method) {
      throw new Error('HTTP method is required');
    }

    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    if (!validMethods.includes(request.method)) {
      throw new Error(`Invalid HTTP method: ${request.method}`);
    }

    if (request.timeout && request.timeout < 0) {
      throw new Error('Timeout must be positive');
    }

    if (request.retries && request.retries < 0) {
      throw new Error('Retries must be non-negative');
    }
  }

  /**
   * Check if request should be retried
   */
  private shouldRetry(error: any, attempt: number, request: EdgeFunctionRequest): boolean {
    // Check custom retry condition
    if (request.retries === 0) {
      return false;
    }

    // Don't retry certain error types
    const nonRetryableErrors = ['VALIDATION_ERROR', 'AUTHENTICATION_ERROR', 'AUTHORIZATION_ERROR'];
    if (nonRetryableErrors.includes(error.code)) {
      return false;
    }

    // Don't retry 4xx errors (except 429 rate limit)
    if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
      return false;
    }

    return true;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const backoffFactor = 2;

    const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    
    return Math.floor(delay + jitter);
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check rate limit (basic implementation)
   */
  private async checkRateLimit(functionName: string): Promise<void> {
    // This is a basic implementation - in production you'd use Redis or similar
    // For now, just log the rate limit check
    console.debug(`Rate limit check for ${functionName} (rate limiting: ${this.rateLimitConfig.enabled})`);
  }

  /**
   * Get response from cache
   */
  private async getFromCache<T = any>(request: EdgeFunctionRequest): Promise<EdgeFunctionResponse<T> | null> {
    // Basic cache implementation - in production you'd use Redis or similar
    // For now, return null (cache miss)
    return null;
  }

  /**
   * Set response in cache
   */
  private async setCache<T = any>(request: EdgeFunctionRequest, response: EdgeFunctionResponse<T>): Promise<void> {
    // Basic cache implementation - in production you'd use Redis or similar
    // For now, just log the cache set
    console.debug(`Caching response for ${request.functionName}${request.path || ''}`);
  }
}

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Create base Edge Service instance
 */
export function createBaseEdgeService(context: GraphQLContext, functionBaseName?: string): BaseEdgeService {
  return new BaseEdgeService(context, functionBaseName);
}

/**
 * Build Edge Function URL
 */
export function buildEdgeFunctionUrl(baseUrl: string, functionName: string, path?: string): string {
  const url = new URL(`${baseUrl}/${functionName}`);
  if (path) {
    url.pathname += path;
  }
  return url.toString();
}

/**
 * Format Edge Function error for GraphQL
 */
export function formatEdgeError(error: any): EdgeFunctionError {
  return {
    code: error.code || 'EDGE_FUNCTION_ERROR',
    message: error.message || 'Unknown Edge Function error',
    statusCode: error.statusCode || 500,
    details: error.details,
    timestamp: new Date().toISOString(),
    request_id: error.request_id,
    function_name: error.function_name
  };
}

/**
 * Check if Edge Function is available
 */
export async function pingEdgeFunction(context: GraphQLContext, functionName: string): Promise<boolean> {
  try {
    const service = new BaseEdgeService(context);
    const health = await service.healthCheck(functionName);
    return health.healthy;
  } catch (error) {
    return false;
  }
}

// =================================================================
// EXPORTS
// =================================================================

export default BaseEdgeService;

export {
  BaseEdgeService,
  createBaseEdgeService,
  buildEdgeFunctionUrl,
  formatEdgeError,
  pingEdgeFunction
};