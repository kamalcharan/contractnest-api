// src/services/taxSettingsService.ts
// Complete Tax Settings Service with Edge Function integration and internal signature

import axios from 'axios';
import crypto from 'crypto';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';
import { 
  TaxSettings, 
  TaxRate, 
  TaxSettingsResponse, 
  TaxSettingsRequest, 
  CreateTaxRateRequest, 
  UpdateTaxRateRequest,
  TaxOperationResult,
  TaxErrorCode,
  TAX_ERROR_MESSAGES
} from '../types/taxTypes';

/**
 * Tax Settings Service Class
 * Handles all communication with the Tax Settings Edge Function
 */
class TaxSettingsService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSecret: string;

  constructor() {
    if (!SUPABASE_URL) {
      throw new Error('Missing SUPABASE_URL configuration');
    }
    
    this.edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/tax-settings`;
    this.internalSecret = process.env.INTERNAL_SIGNING_SECRET || '';
    
    if (!this.internalSecret) {
      console.warn('⚠️  Tax Settings Service: Missing INTERNAL_SIGNING_SECRET. Requests will not be signed.');
    }
    
    console.log('✅ Tax Settings Service: Initialized successfully');
  }

  /**
   * Get tax settings and rates for a tenant
   */
  async getTaxSettings(authToken: string, tenantId: string): Promise<TaxSettingsResponse> {
    try {
      console.log(`Fetching tax settings for tenant: ${tenantId}`);
      
      const response = await axios.get(this.edgeFunctionUrl, {
        headers: this.buildHeaders(authToken, tenantId),
        timeout: 30000 // 30 second timeout
      });

      console.log('Tax settings fetched successfully');
      return this.validateTaxSettingsResponse(response.data);
    } catch (error) {
      console.error('Error in getTaxSettings service:', error);
      this.handleServiceError(error, 'getTaxSettings', { tenantId });
      throw this.transformError(error, 'Failed to fetch tax settings');
    }
  }

  /**
   * Create or update tax settings
   */
  async createUpdateTaxSettings(
    authToken: string, 
    tenantId: string, 
    settingsData: TaxSettingsRequest,
    idempotencyKey?: string
  ): Promise<{ settings: TaxSettings; isUpdate: boolean }> {
    try {
      console.log(`Creating/updating tax settings for tenant: ${tenantId}`, settingsData);
      
      const headers = this.buildHeaders(authToken, tenantId, idempotencyKey);
      const body = JSON.stringify(settingsData);
      
      // Add internal signature
      if (this.internalSecret) {
        headers['x-internal-signature'] = this.generateSignature(body);
      }

      const response = await axios.post(
        `${this.edgeFunctionUrl}/settings`,
        settingsData,
        {
          headers,
          timeout: 30000
        }
      );

      console.log('Tax settings saved successfully');
      
      const settings = this.validateTaxSettings(response.data);
      const isUpdate = response.status === 200; // 200 = update, 201 = create
      
      return { settings, isUpdate };
    } catch (error) {
      console.error('Error in createUpdateTaxSettings service:', error);
      this.handleServiceError(error, 'createUpdateTaxSettings', { tenantId, settingsData });
      throw this.transformError(error, 'Failed to save tax settings');
    }
  }

  /**
   * Create a new tax rate
   */
  async createTaxRate(
  authToken: string, 
  tenantId: string, 
  rateData: CreateTaxRateRequest,
  idempotencyKey?: string
): Promise<TaxRate> {
  try {
    console.log(`Creating tax rate for tenant: ${tenantId}`, rateData);
    
    const headers = this.buildHeaders(authToken, tenantId, idempotencyKey);
    
    // Remove sequence_no if provided (Edge function will auto-generate)
    const requestData = { ...rateData };
    delete (requestData as any).sequence_no;
    
    const body = JSON.stringify(requestData);
    
    // Add internal signature
    if (this.internalSecret) {
      headers['x-internal-signature'] = this.generateSignature(body);
    }

    const response = await axios.post(
      `${this.edgeFunctionUrl}/rates`,
      requestData,
      {
        headers,
        timeout: 30000
      }
    );

    console.log('Tax rate created successfully:', response.data.name);
    return this.validateTaxRate(response.data);
  } catch (error) {
    console.error('Error in createTaxRate service:', error);
    this.handleServiceError(error, 'createTaxRate', { tenantId, rateData });
    throw this.transformError(error, 'Failed to create tax rate');
  }
}

  /**
   * Update an existing tax rate
   */
  async updateTaxRate(
    authToken: string, 
    tenantId: string, 
    rateId: string,
    updateData: UpdateTaxRateRequest,
    idempotencyKey?: string
  ): Promise<TaxRate> {
    try {
      console.log(`Updating tax rate ${rateId} for tenant: ${tenantId}`, updateData);
      
      const headers = this.buildHeaders(authToken, tenantId, idempotencyKey);
      const body = JSON.stringify(updateData);
      
      // Add internal signature
      if (this.internalSecret) {
        headers['x-internal-signature'] = this.generateSignature(body);
      }

      const response = await axios.put(
        `${this.edgeFunctionUrl}/rates/${rateId}`,
        updateData,
        {
          headers,
          timeout: 30000
        }
      );

      console.log('Tax rate updated successfully:', response.data.name);
      return this.validateTaxRate(response.data);
    } catch (error) {
      console.error('Error in updateTaxRate service:', error);
      this.handleServiceError(error, 'updateTaxRate', { tenantId, rateId, updateData });
      throw this.transformError(error, 'Failed to update tax rate');
    }
  }

  /**
   * Delete (soft delete) a tax rate
   */
  async deleteTaxRate(
    authToken: string, 
    tenantId: string, 
    rateId: string
  ): Promise<{ success: boolean; message: string; deletedRate: { id: string; name: string } }> {
    try {
      console.log(`Deleting tax rate ${rateId} for tenant: ${tenantId}`);
      
      const response = await axios.delete(
        `${this.edgeFunctionUrl}/rates/${rateId}`,
        {
          headers: this.buildHeaders(authToken, tenantId),
          timeout: 30000
        }
      );

      console.log('Tax rate deleted successfully:', response.data.deletedRate?.name);
      
      // Validate response structure
      if (!response.data.success || !response.data.deletedRate) {
        throw new Error('Invalid delete response format');
      }
      
      return response.data;
    } catch (error) {
      console.error('Error in deleteTaxRate service:', error);
      this.handleServiceError(error, 'deleteTaxRate', { tenantId, rateId });
      throw this.transformError(error, 'Failed to delete tax rate');
    }
  }

  /**
   * Get all active tax rates for a tenant
   */
  async getTaxRates(authToken: string, tenantId: string): Promise<TaxRate[]> {
    try {
      console.log(`Fetching tax rates for tenant: ${tenantId}`);
      
      // Get full tax data and extract rates
      const taxData = await this.getTaxSettings(authToken, tenantId);
      
      console.log(`Found ${taxData.rates.length} tax rates`);
      return taxData.rates;
    } catch (error) {
      console.error('Error in getTaxRates service:', error);
      this.handleServiceError(error, 'getTaxRates', { tenantId });
      throw this.transformError(error, 'Failed to fetch tax rates');
    }
  }

  /**
   * Test Edge Function connectivity
   */
  async testConnection(authToken: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Testing tax settings Edge Function connectivity');
      
      await this.getTaxSettings(authToken, tenantId);
      
      return {
        success: true,
        message: 'Tax settings Edge Function is accessible'
      };
    } catch (error: any) {
      console.error('Tax settings Edge Function connectivity test failed:', error);
      
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
      'User-Agent': 'TaxSettingsService/1.0'
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
   * Validate tax settings response structure
   */
  /**
 * Validate tax settings response structure
 */
private validateTaxSettingsResponse(data: any): TaxSettingsResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response format: expected object');
  }

  if (!data.settings || !data.rates) {
    throw new Error('Invalid response format: missing settings or rates');
  }

  // Validate settings structure
  const settings = this.validateTaxSettings(data.settings);
  
  // Validate rates array
  if (!Array.isArray(data.rates)) {
    throw new Error('Invalid response format: rates must be an array');
  }

  const rates = data.rates.map((rate: any, index: number) => {
    try {
      return this.validateTaxRate(rate);
    } catch (error) {
      // Fix: Properly handle unknown error type
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid rate at index ${index}: ${errorMessage}`);
    }
  });

  return { settings, rates };
}
  /**
   * Validate tax settings structure
   */
  private validateTaxSettings(data: any): TaxSettings {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid tax settings format');
    }

    const required = ['tenant_id', 'display_mode', 'version'];
    for (const field of required) {
      if (!(field in data)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!['including_tax', 'excluding_tax'].includes(data.display_mode)) {
      throw new Error('Invalid display_mode value');
    }

    return data as TaxSettings;
  }

  /**
   * Validate tax rate structure
   */
  private validateTaxRate(data: any): TaxRate {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid tax rate format');
    }

    const required = ['id', 'tenant_id', 'name', 'rate', 'is_active', 'sequence_no', 'version'];
    for (const field of required) {
      if (!(field in data)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (typeof data.rate !== 'number' || data.rate < 0 || data.rate > 100) {
      throw new Error('Invalid rate value');
    }

    if (typeof data.sequence_no !== 'number' || data.sequence_no < 1) {
      throw new Error('Invalid sequence number');
    }

    return data as TaxRate;
  }

  /**
   * Transform and categorize errors for consistent error handling
   */
  private transformError(error: any, defaultMessage: string): Error {
    // Network/connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new Error('Unable to connect to tax settings service');
    }

    // Timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return new Error('Tax settings service request timed out');
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
        return new Error('Tax settings resource not found');
      case 409:
        // Handle duplicate gracefully
         if (data?.code === 'DUPLICATE_TAX_RATE' && data?.existing_rate) {
    // Return structured duplicate error that frontend can handle
    const error = new Error(data.error);
    (error as any).code = data.code;
    (error as any).existing_rate = data.existing_rate;
    (error as any).status = 409;
    return error;
  }
  return new Error(data?.error || 'Conflict detected');
      case 429:
        return new Error('Too many requests - please try again later');
      case 500:
        return new Error(data?.error || 'Tax settings service error');
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
    console.error(`Tax Settings Service Error [${operation}]:`, errorDetails);

    // Capture in Sentry with appropriate tags
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { 
        source: 'tax_settings_service', 
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
export const taxSettingsService = new TaxSettingsService();

// Export class for testing
export { TaxSettingsService };