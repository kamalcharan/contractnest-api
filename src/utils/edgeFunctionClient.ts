// src/utils/edgeFunctionClient.ts
// 🚀 Edge Function HTTP Client - Secure communication with Service Catalog Edge Functions

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import { performance } from 'perf_hooks';

// =================================================================
// TYPES AND INTERFACES
// =================================================================

export interface EdgeFunctionConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  hmacSecret?: string;
  enableLogging: boolean;
  environment: 'production' | 'test';
}

export interface EdgeFunctionRequest {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: any;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

export interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    requestId: string;
    executionTimeMs: number;
    environment: string;
    cacheHit?: boolean;
    rateLimit?: {
      remaining: number;
      resetTime: string;
    };
  };
}

export interface RequestMetrics {
  requestId: string;
  endpoint: string;
  method: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  statusCode?: number;
  error?: string;
  retryCount: number;
}

// =================================================================
// EDGE FUNCTION CLIENT CLASS
// =================================================================

export class EdgeFunctionClient {
  private httpClient: AxiosInstance;
  private config: EdgeFunctionConfig;
  private requestMetrics: RequestMetrics[] = [];
  private requestMetadata: Map<string, { requestId: string; startTime: number }> = new Map();

  constructor(config: EdgeFunctionConfig) {
    this.config = config;
    this.httpClient = this.createHttpClient();
    
    console.log(`🚀 EdgeFunctionClient initialized for ${config.environment} environment`);
    console.log(`📍 Base URL: ${config.baseUrl}`);
  }

  // =================================================================
  // HTTP CLIENT SETUP
  // =================================================================

  private createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ContractNest-API/1.0.0',
      }
    });

    // Request interceptor for HMAC signing and logging
    client.interceptors.request.use(
      (config) => {
        const requestId = this.generateRequestId();
        config.headers = config.headers || {};
        config.headers['x-request-id'] = requestId;
        this.requestMetadata.set(requestId, { requestId, startTime: performance.now() });

        // Add HMAC signature if secret is configured
        if (this.config.hmacSecret && config.data) {
          const signature = this.generateHMACSignature(
            JSON.stringify(config.data),
            this.config.hmacSecret
          );
          config.headers['x-signature-sha256'] = `sha256=${signature}`;
        }

        if (this.config.enableLogging) {
          console.log(`📤 Edge Function Request [${requestId}]:`, {
            method: config.method?.toUpperCase(),
            url: config.url,
            headers: this.maskSensitiveHeaders(config.headers),
            hasData: !!config.data
          });
        }

        return config;
      },
      (error) => {
        console.error('❌ Edge Function Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and metrics
    client.interceptors.response.use(
      (response) => {
        const requestId = response.config.headers['x-request-id'] as string;
        const metadata = this.requestMetadata.get(requestId);
        const startTime = metadata?.startTime;
        const duration = startTime ? performance.now() - startTime : 0;

        // Record metrics
        if (requestId && startTime) {
          this.recordRequestMetrics({
            requestId,
            endpoint: response.config.url || '',
            method: response.config.method?.toUpperCase() || '',
            startTime,
            endTime: performance.now(),
            duration,
            success: true,
            statusCode: response.status,
            retryCount: 0
          });
          // Clean up metadata
          this.requestMetadata.delete(requestId);
        }

        if (this.config.enableLogging) {
          console.log(`📥 Edge Function Response [${requestId}]:`, {
            status: response.status,
            statusText: response.statusText,
            duration: `${duration.toFixed(2)}ms`,
            hasData: !!response.data,
            success: response.data?.success
          });
        }

        return response;
      },
      (error) => {
        const requestId = error.config?.metadata?.requestId;
        const startTime = error.config?.metadata?.startTime;
        const duration = startTime ? performance.now() - startTime : 0;

        // Record error metrics
        if (requestId && startTime) {
          this.recordRequestMetrics({
            requestId,
            endpoint: error.config?.url || '',
            method: error.config?.method?.toUpperCase() || '',
            startTime,
            endTime: performance.now(),
            duration,
            success: false,
            statusCode: error.response?.status,
            error: error.message,
            retryCount: 0
          });
        }

        if (this.config.enableLogging) {
          console.error(`❌ Edge Function Error [${requestId}]:`, {
            status: error.response?.status,
            statusText: error.response?.statusText,
            message: error.message,
            duration: `${duration.toFixed(2)}ms`
          });
        }

        return Promise.reject(error);
      }
    );

    return client;
  }

  // =================================================================
  // HMAC SIGNATURE GENERATION
  // =================================================================

  private generateHMACSignature(data: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // =================================================================
  // REQUEST METHODS
  // =================================================================

  async request<T = any>(request: EdgeFunctionRequest): Promise<EdgeFunctionResponse<T>> {
    const { endpoint, method, data, headers = {}, timeout, retries } = request;
    
    const requestConfig: AxiosRequestConfig = {
      url: endpoint,
      method: method.toLowerCase() as any,
      data,
      headers: {
        ...headers,
        'x-environment': this.config.environment,
      },
      timeout: timeout || this.config.timeout,
    };

    let lastError: any;
    const maxRetries = retries ?? this.config.retryAttempts;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`🔄 Retrying Edge Function request (attempt ${attempt}/${maxRetries})`);
          await this.delay(this.config.retryDelay * attempt);
        }

        const response: AxiosResponse<EdgeFunctionResponse<T>> = await this.httpClient.request(requestConfig);
        return response.data;

      } catch (error: any) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          break;
        }

        // Don't retry if this is the last attempt
        if (attempt === maxRetries) {
          break;
        }
      }
    }

    // Handle final error
    return this.handleRequestError(lastError, endpoint, method);
  }

  // =================================================================
  // CONVENIENCE METHODS
  // =================================================================

  async get<T = any>(endpoint: string, headers?: Record<string, string>): Promise<EdgeFunctionResponse<T>> {
    return this.request<T>({ endpoint, method: 'GET', headers });
  }

  async post<T = any>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<EdgeFunctionResponse<T>> {
    return this.request<T>({ endpoint, method: 'POST', data, headers });
  }

  async put<T = any>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<EdgeFunctionResponse<T>> {
    return this.request<T>({ endpoint, method: 'PUT', data, headers });
  }

  async delete<T = any>(endpoint: string, headers?: Record<string, string>): Promise<EdgeFunctionResponse<T>> {
    return this.request<T>({ endpoint, method: 'DELETE', headers });
  }

  // =================================================================
  // SERVICE CATALOG SPECIFIC METHODS
  // =================================================================

  async createService(serviceData: any, context: any): Promise<EdgeFunctionResponse> {
    return this.post('/services', serviceData, {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  async getService(serviceId: string, context: any): Promise<EdgeFunctionResponse> {
    return this.get(`/services/${serviceId}`, {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  async updateService(serviceId: string, serviceData: any, context: any): Promise<EdgeFunctionResponse> {
    return this.put(`/services/${serviceId}`, serviceData, {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  async deleteService(serviceId: string, context: any): Promise<EdgeFunctionResponse> {
    return this.delete(`/services/${serviceId}`, {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  async queryServices(filters: any, context: any): Promise<EdgeFunctionResponse> {
    const queryParams = new URLSearchParams();
    
    // Add filters as query parameters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });

    const endpoint = `/services${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    
    return this.get(endpoint, {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  async bulkCreateServices(bulkData: any, context: any): Promise<EdgeFunctionResponse> {
    return this.post('/services/bulk', bulkData, {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  async getMasterData(context: any): Promise<EdgeFunctionResponse> {
    return this.get('/master-data', {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  async getAvailableResources(filters: any, context: any): Promise<EdgeFunctionResponse> {
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });

    const endpoint = `/resources${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    
    return this.get(endpoint, {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  async associateServiceResources(associations: any, context: any): Promise<EdgeFunctionResponse> {
    return this.post('/resources/associate', associations, {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  async getServiceResources(serviceId: string, context: any): Promise<EdgeFunctionResponse> {
    return this.get(`/services/${serviceId}/resources`, {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  async updateServicePricing(pricingData: any, context: any): Promise<EdgeFunctionResponse> {
    return this.put('/pricing', pricingData, {
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
    });
  }

  // =================================================================
  // ERROR HANDLING
  // =================================================================

  private handleRequestError(error: any, endpoint: string, method: string): EdgeFunctionResponse {
    console.error(`❌ Edge Function ${method} ${endpoint} failed:`, error.message);

    if (error.response) {
      // HTTP error response
      return {
        success: false,
        error: {
          code: `HTTP_${error.response.status}`,
          message: error.response.data?.error?.message || error.response.statusText,
          details: error.response.data
        }
      };
    } else if (error.request) {
      // Network error
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Unable to reach Edge Function service',
          details: { timeout: this.config.timeout }
        }
      };
    } else {
      // Other error
      return {
        success: false,
        error: {
          code: 'REQUEST_ERROR',
          message: error.message,
          details: error
        }
      };
    }
  }

  // =================================================================
  // UTILITY METHODS
  // =================================================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private maskSensitiveHeaders(headers: Record<string, any>): Record<string, any> {
    const masked = { ...headers };
    const sensitiveKeys = ['authorization', 'x-signature-sha256', 'cookie'];
    
    sensitiveKeys.forEach(key => {
      if (masked[key]) {
        masked[key] = '***masked***';
      }
    });
    
    return masked;
  }

  private recordRequestMetrics(metrics: RequestMetrics): void {
    this.requestMetrics.push(metrics);
    
    // Keep only last 1000 metrics to prevent memory leaks
    if (this.requestMetrics.length > 1000) {
      this.requestMetrics = this.requestMetrics.slice(-1000);
    }
  }

  // =================================================================
  // MONITORING AND HEALTH
  // =================================================================

  getMetrics(): {
    totalRequests: number;
    successRate: number;
    avgDuration: number;
    recentErrors: RequestMetrics[];
  } {
    const totalRequests = this.requestMetrics.length;
    const successfulRequests = this.requestMetrics.filter(m => m.success).length;
    const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
    const avgDuration = totalRequests > 0 
      ? this.requestMetrics.reduce((sum, m) => sum + m.duration, 0) / totalRequests 
      : 0;
    
    const recentErrors = this.requestMetrics
      .filter(m => !m.success)
      .slice(-10); // Last 10 errors

    return {
      totalRequests,
      successRate: Math.round(successRate * 100) / 100,
      avgDuration: Math.round(avgDuration * 100) / 100,
      recentErrors
    };
  }

  async healthCheck(): Promise<EdgeFunctionResponse> {
    try {
      const response = await this.get('/health');
      return response;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Edge Function health check failed'
        }
      };
    }
  }

  // =================================================================
  // CONFIGURATION METHODS
  // =================================================================

  updateConfig(newConfig: Partial<EdgeFunctionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Recreate HTTP client if base URL changed
    if (newConfig.baseUrl) {
      this.httpClient = this.createHttpClient();
    }
    
    console.log('📝 EdgeFunctionClient configuration updated');
  }

  getConfig(): EdgeFunctionConfig {
    return { ...this.config };
  }
}

// =================================================================
// FACTORY FUNCTIONS
// =================================================================

export function createEdgeFunctionClient(config: Partial<EdgeFunctionConfig> = {}): EdgeFunctionClient {
  const defaultConfig: EdgeFunctionConfig = {
    baseUrl: process.env.SERVICE_CATALOG_EDGE_FUNCTION_URL || 'http://localhost:54321/functions/v1/service-catalog',
    timeout: 30000, // 30 seconds
    retryAttempts: 3,
    retryDelay: 1000, // 1 second
    hmacSecret: process.env.INTERNAL_SIGNING_SECRET,
    enableLogging: process.env.NODE_ENV !== 'production',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'test'
  };

  const finalConfig = { ...defaultConfig, ...config };
  return new EdgeFunctionClient(finalConfig);
}

export function createProductionEdgeFunctionClient(): EdgeFunctionClient {
  return createEdgeFunctionClient({
    environment: 'production',
    enableLogging: false,
    retryAttempts: 5,
    timeout: 45000
  });
}

export function createTestEdgeFunctionClient(): EdgeFunctionClient {
  return createEdgeFunctionClient({
    environment: 'test',
    enableLogging: true,
    retryAttempts: 2,
    timeout: 15000
  });
}

export default EdgeFunctionClient;