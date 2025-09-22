// src/services/onboardingService.ts
// Onboarding Service with Edge Function integration following tax-settings pattern

import axios from 'axios';
import crypto from 'crypto';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';
import { 
  OnboardingStatusResponse,
  InitializeOnboardingResponse,
  CompleteStepRequest,
  CompleteStepResponse,
  SkipStepRequest,
  SkipStepResponse,
  UpdateProgressRequest,
  OnboardingOperationResult,
  OnboardingErrorCode,
  ONBOARDING_ERROR_MESSAGES
} from '../types/onboardingTypes';

/**
 * Onboarding Service Class
 * Handles all communication with the Onboarding Edge Function
 */
class OnboardingService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSecret: string;

  constructor() {
    if (!SUPABASE_URL) {
      throw new Error('Missing SUPABASE_URL configuration');
    }
    
    this.edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/onboarding`;
    this.internalSecret = process.env.INTERNAL_SIGNING_SECRET || '';
    
    if (!this.internalSecret) {
      console.warn('⚠️  Onboarding Service: Missing INTERNAL_SIGNING_SECRET. Requests will not be signed.');
    }
    
    console.log('✅ Onboarding Service: Initialized successfully');
  }

  /**
   * Get onboarding status for a tenant
   */
  async getOnboardingStatus(authToken: string, tenantId: string): Promise<OnboardingStatusResponse> {
    try {
      console.log(`Fetching onboarding status for tenant: ${tenantId}`);
      
      const response = await axios.get(`${this.edgeFunctionUrl}/status`, {
        headers: this.buildHeaders(authToken, tenantId),
        timeout: 30000
      });

      console.log('Onboarding status fetched successfully');
      return this.validateStatusResponse(response.data);
    } catch (error) {
      console.error('Error in getOnboardingStatus service:', error);
      this.handleServiceError(error, 'getOnboardingStatus', { tenantId });
      throw this.transformError(error, 'Failed to fetch onboarding status');
    }
  }

  /**
   * Initialize onboarding for a tenant
   */
  async initializeOnboarding(
    authToken: string, 
    tenantId: string
  ): Promise<InitializeOnboardingResponse> {
    try {
      console.log(`Initializing onboarding for tenant: ${tenantId}`);
      
      const headers = this.buildHeaders(authToken, tenantId);
      
      const response = await axios.post(
        `${this.edgeFunctionUrl}/initialize`,
        {},
        {
          headers,
          timeout: 30000
        }
      );

      console.log('Onboarding initialized successfully');
      return response.data;
    } catch (error) {
      console.error('Error in initializeOnboarding service:', error);
      this.handleServiceError(error, 'initializeOnboarding', { tenantId });
      throw this.transformError(error, 'Failed to initialize onboarding');
    }
  }

  /**
   * Complete an onboarding step
   */
  async completeStep(
    authToken: string, 
    tenantId: string, 
    stepId: string,
    data?: any,
    idempotencyKey?: string
  ): Promise<CompleteStepResponse> {
    try {
      console.log(`Completing step ${stepId} for tenant: ${tenantId}`);
      
      const headers = this.buildHeaders(authToken, tenantId, idempotencyKey);
      const body = JSON.stringify({ stepId, data });
      
      // Add internal signature
      if (this.internalSecret) {
        headers['x-internal-signature'] = this.generateSignature(body);
      }

      const response = await axios.post(
        `${this.edgeFunctionUrl}/complete-step`,
        { stepId, data },
        {
          headers,
          timeout: 30000
        }
      );

      console.log(`Step ${stepId} completed successfully`);
      return response.data;
    } catch (error) {
      console.error('Error in completeStep service:', error);
      this.handleServiceError(error, 'completeStep', { tenantId, stepId, data });
      throw this.transformError(error, 'Failed to complete step');
    }
  }

  /**
   * Skip an onboarding step
   */
  async skipStep(
    authToken: string, 
    tenantId: string, 
    stepId: string
  ): Promise<SkipStepResponse> {
    try {
      console.log(`Skipping step ${stepId} for tenant: ${tenantId}`);
      
      const headers = this.buildHeaders(authToken, tenantId);
      const body = JSON.stringify({ stepId });
      
      // Add internal signature
      if (this.internalSecret) {
        headers['x-internal-signature'] = this.generateSignature(body);
      }

      const response = await axios.put(
        `${this.edgeFunctionUrl}/skip-step`,
        { stepId },
        {
          headers,
          timeout: 30000
        }
      );

      console.log(`Step ${stepId} skipped successfully`);
      return response.data;
    } catch (error) {
      console.error('Error in skipStep service:', error);
      this.handleServiceError(error, 'skipStep', { tenantId, stepId });
      throw this.transformError(error, 'Failed to skip step');
    }
  }

  /**
   * Update onboarding progress
   */
  async updateProgress(
    authToken: string, 
    tenantId: string, 
    progressData: UpdateProgressRequest
  ): Promise<OnboardingOperationResult> {
    try {
      console.log(`Updating progress for tenant: ${tenantId}`, progressData);
      
      const headers = this.buildHeaders(authToken, tenantId);
      const body = JSON.stringify(progressData);
      
      // Add internal signature
      if (this.internalSecret) {
        headers['x-internal-signature'] = this.generateSignature(body);
      }

      const response = await axios.put(
        `${this.edgeFunctionUrl}/update-progress`,
        progressData,
        {
          headers,
          timeout: 30000
        }
      );

      console.log('Progress updated successfully');
      return response.data;
    } catch (error) {
      console.error('Error in updateProgress service:', error);
      this.handleServiceError(error, 'updateProgress', { tenantId, progressData });
      throw this.transformError(error, 'Failed to update progress');
    }
  }

  /**
   * Complete the entire onboarding process
   */
  async completeOnboarding(
    authToken: string, 
    tenantId: string
  ): Promise<OnboardingOperationResult> {
    try {
      console.log(`Completing onboarding for tenant: ${tenantId}`);
      
      const headers = this.buildHeaders(authToken, tenantId);

      const response = await axios.post(
        `${this.edgeFunctionUrl}/complete`,
        {},
        {
          headers,
          timeout: 30000
        }
      );

      console.log('Onboarding completed successfully');
      return response.data;
    } catch (error) {
      console.error('Error in completeOnboarding service:', error);
      this.handleServiceError(error, 'completeOnboarding', { tenantId });
      throw this.transformError(error, 'Failed to complete onboarding');
    }
  }

  /**
   * Test Edge Function connectivity
   */
  async testConnection(authToken: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Testing onboarding Edge Function connectivity');
      
      await this.getOnboardingStatus(authToken, tenantId);
      
      return {
        success: true,
        message: 'Onboarding Edge Function is accessible'
      };
    } catch (error: any) {
      console.error('Onboarding Edge Function connectivity test failed:', error);
      
      return {
        success: false,
        message: `Edge Function connectivity failed: ${error.message}`
      };
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * Build standard headers for Edge Function requests
   */
  private buildHeaders(
    authToken: string, 
    tenantId: string, 
    idempotencyKey?: string
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
      'x-tenant-id': tenantId,
      'Content-Type': 'application/json',
      'User-Agent': 'OnboardingService/1.0'
    };

    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    return headers;
  }

  /**
   * Generate HMAC-SHA256 signature for request body
   */
  private generateSignature(body: string): string {
    if (!this.internalSecret) {
      console.warn('Cannot generate signature: INTERNAL_SIGNING_SECRET not configured');
      return '';
    }

    try {
      return crypto
        .createHmac('sha256', this.internalSecret)
        .update(body)
        .digest('hex');
    } catch (error) {
      console.error('Error generating signature:', error);
      return '';
    }
  }

  /**
   * Validate onboarding status response structure
   */
  private validateStatusResponse(data: any): OnboardingStatusResponse {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format: expected object');
    }

    if (typeof data.needs_onboarding !== 'boolean') {
      throw new Error('Invalid response format: missing needs_onboarding');
    }

    // Validate steps array
    if (data.steps && !Array.isArray(data.steps)) {
      throw new Error('Invalid response format: steps must be an array');
    }

    return data as OnboardingStatusResponse;
  }

  /**
   * Transform and categorize errors for consistent error handling
   */
  private transformError(error: any, defaultMessage: string): Error {
    // Network/connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new Error('Unable to connect to onboarding service');
    }

    // Timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return new Error('Onboarding service request timed out');
    }

    // HTTP errors with response
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          return new Error(data?.error || 'Invalid request data');
        case 401:
          return new Error('Authentication required');
        case 403:
          return new Error('Insufficient permissions');
        case 404:
          return new Error('Onboarding resource not found');
        case 429:
          return new Error('Too many requests - please try again later');
        case 500:
          return new Error(data?.error || 'Onboarding service error');
        default:
          return new Error(data?.error || `Service error (${status})`);
      }
    }

    // Validation errors from our service
    if (error.message && error.message.includes('Invalid')) {
      return error;
    }

    // Default error
    return new Error(error.message || defaultMessage);
  }

  /**
   * Handle service errors with logging and monitoring
   */
  private handleServiceError(error: any, operation: string, context: Record<string, any>): void {
    const errorDetails = {
      operation,
      context,
      error: {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data
      },
      url: this.edgeFunctionUrl,
      timestamp: new Date().toISOString()
    };

    // Log error details
    console.error(`Onboarding Service Error [${operation}]:`, errorDetails);

    // Capture in Sentry with appropriate tags
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { 
        source: 'onboarding_service', 
        operation,
        service: 'edge_function'
      },
      extra: errorDetails,
      level: this.getErrorLevel(error)
    });
  }

  /**
   * Determine error severity level for monitoring
   */
  private getErrorLevel(error: any): 'error' | 'warning' | 'info' {
    // Network/connection issues are warnings (might be temporary)
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNABORTED') {
      return 'warning';
    }

    // 4xx errors are usually client errors (warnings)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return 'warning';
    }

    // 5xx errors are server errors (errors)
    if (error.response?.status >= 500) {
      return 'error';
    }

    // Default to error for unknown issues
    return 'error';
  }
}

// Export singleton instance
export const onboardingService = new OnboardingService();

// Export class for testing
export { OnboardingService };