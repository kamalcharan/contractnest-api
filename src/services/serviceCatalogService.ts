// src/services/serviceCatalogService.ts
// Service Catalog Service Layer - Matches your product's signature pattern

import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import {
  Service,
  MasterData,
  CreateServiceRequest,
  UpdateServiceRequest,
  GetServicesQuery,
  EdgeFunctionResponse,
  ServiceCatalogHttpStatus,
  ServiceCatalogError
} from '../types/serviceCatalogTypes';

/**
 * Extract data from edge function response format
 */
function parseEdgeFunctionResponse(response: AxiosResponse): any {
  console.log('Parsing edge function response:', {
    status: response.status,
    hasData: !!response.data,
    dataType: typeof response.data,
    dataStructure: response.data ? Object.keys(response.data) : 'no data'
  });

  const responseData = response.data;

  // Handle edge function format: { success: true, data: [...], timestamp: "..." }
  if (responseData?.success === true && responseData?.data !== undefined) {
    console.log('Edge function format detected, extracting data:', responseData.data);
    return responseData.data;
  }

  // Handle direct data (fallback)
  if (responseData) {
    console.log('Using direct response data:', responseData);
    return responseData;
  }

  console.log('Unknown response format, returning null');
  return null;
}

/**
 * Internal signing service - MATCHES YOUR PRODUCT PATTERN
 */
class InternalSigningService {
  private static readonly SIGNING_SECRET = process.env.INTERNAL_SIGNING_SECRET || 'fallback-key-for-dev';
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds

  /**
   * Generate signature matching your edge function's validation
   * payload + timestamp + secret → SHA-256 → base64 → first 32 chars
   */
  static generateSignature(payload: string, timestamp: string): string {
    try {
      const data = payload + timestamp + this.SIGNING_SECRET;
      const hash = crypto.createHash('sha256').update(data).digest('base64');
      const signature = hash.substring(0, 32);
      
      console.log('Generated signature:', {
        payloadLength: payload.length,
        timestamp,
        signaturePreview: signature.substring(0, 8) + '...',
        hasSecret: !!this.SIGNING_SECRET
      });
      
      return signature;
    } catch (error) {
      console.error('Error generating signature:', error);
      return 'fallback-signature';
    }
  }

  /**
   * Create signed headers - timestamp from current time, signature includes it
   */
  static createSignedHeaders(body: string = ''): Record<string, string> {
    const timestamp = new Date().toISOString();
    const signature = this.generateSignature(body, timestamp);
    
    return {
      'x-internal-signature': signature,
      'x-timestamp': timestamp
    };
  }
}

/**
 * Service Catalog Service - Handles all communication with service-catalog edge function
 */
export class ServiceCatalogService {
  private static readonly BASE_URL = process.env.SUPABASE_URL + '/functions/v1/service-catalog';
  private static readonly TIMEOUT = 30000;

  // ============================================================================
  // CORE SERVICE OPERATIONS
  // ============================================================================

  /**
   * Get services with filters and pagination
   */
  async getServices(authHeader: string, tenantId: string, filters: GetServicesQuery): Promise<any> {
    try {
      console.log('Getting services with filters...');
      
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      // Build query parameters
      const params = new URLSearchParams();
      if (filters.search_term) params.append('search_term', filters.search_term);
      if (filters.category_id) params.append('category_id', filters.category_id);
      if (filters.industry_id) params.append('industry_id', filters.industry_id);
      if (filters.is_active !== undefined) params.append('is_active', filters.is_active.toString());
      if (filters.price_min !== undefined) params.append('price_min', filters.price_min.toString());
      if (filters.price_max !== undefined) params.append('price_max', filters.price_max.toString());
      if (filters.currency) params.append('currency', filters.currency);
      if (filters.has_resources !== undefined) params.append('has_resources', filters.has_resources.toString());
      if (filters.sort_by) params.append('sort_by', filters.sort_by);
      if (filters.sort_direction) params.append('sort_direction', filters.sort_direction);
      if (filters.limit) params.append('limit', filters.limit.toString());
      if (filters.offset) params.append('offset', filters.offset.toString());

      const queryString = params.toString();
      const url = `${ServiceCatalogService.BASE_URL}/services${queryString ? `?${queryString}` : ''}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
          ...internalHeaders
        },
        timeout: ServiceCatalogService.TIMEOUT
      });

      const data = parseEdgeFunctionResponse(response);
      
      if (!data) {
        console.error('Services response is invalid:', data);
        return { items: [], total_count: 0, page_info: {}, filters_applied: filters };
      }

      console.log(`Got ${data?.items?.length || 0} services`);
      return data;

    } catch (error: any) {
      console.error('Error getting services:', error.message);
      throw this.transformError(error, 'Failed to get services');
    }
  }

  /**
   * Get single service by ID
   */
  async getServiceById(authHeader: string, tenantId: string, serviceId: string): Promise<Service | null> {
    try {
      console.log(`Getting service: ${serviceId}`);
      
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      const response = await axios.get(`${ServiceCatalogService.BASE_URL}/services/${serviceId}`, {
        headers: {
          'Authorization': authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
          ...internalHeaders
        },
        timeout: ServiceCatalogService.TIMEOUT
      });

      const data = parseEdgeFunctionResponse(response);
      
      if (!data) {
        return null;
      }

      console.log(`Retrieved service: ${data?.service_name}`);
      return data;

    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error(`Error getting service ${serviceId}:`, error.message);
      throw this.transformError(error, 'Failed to get service');
    }
  }

  /**
   * Get service resources
   */
  async getServiceResources(authHeader: string, tenantId: string, serviceId: string): Promise<any> {
    try {
      console.log(`Getting resources for service: ${serviceId}`);
      
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      const response = await axios.get(`${ServiceCatalogService.BASE_URL}/services/${serviceId}/resources`, {
        headers: {
          'Authorization': authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
          ...internalHeaders
        },
        timeout: ServiceCatalogService.TIMEOUT
      });

      const data = parseEdgeFunctionResponse(response);
      
      console.log(`Got resources for service ${serviceId}`);
      return data || { associated_resources: [], total_resources: 0 };

    } catch (error: any) {
      console.error(`Error getting service resources ${serviceId}:`, error.message);
      throw this.transformError(error, 'Failed to get service resources');
    }
  }

  /**
   * Get master data (categories, industries, currencies)
   */
  async getMasterData(authHeader: string, tenantId: string): Promise<MasterData> {
    try {
      console.log('Getting master data...');
      
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      const response = await axios.get(`${ServiceCatalogService.BASE_URL}/master-data`, {
        headers: {
          'Authorization': authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
          ...internalHeaders
        },
        timeout: ServiceCatalogService.TIMEOUT
      });

      const data = parseEdgeFunctionResponse(response);
      
      if (!data) {
        // Return default structure
        return {
          categories: [],
          industries: [],
          currencies: [],
          tax_rates: []
        };
      }

      console.log('Retrieved master data successfully');
      return data;

    } catch (error: any) {
      console.error('Error getting master data:', error.message);
      throw this.transformError(error, 'Failed to get master data');
    }
  }

  /**
   * Create new service
   */
  async createService(
    authHeader: string,
    tenantId: string,
    serviceData: CreateServiceRequest,
    idempotencyKey?: string
  ): Promise<Service> {
    try {
      console.log('Creating service:', { 
        name: serviceData.service_name, 
        category: serviceData.category_id 
      });
      
      const requestBody = JSON.stringify(serviceData);
      const internalHeaders = InternalSigningService.createSignedHeaders(requestBody);
      
      const headers: Record<string, string> = {
        'Authorization': authHeader,
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json',
        ...internalHeaders
      };

      if (idempotencyKey) {
        headers['x-idempotency-key'] = idempotencyKey;
      }

      const response = await axios.post(ServiceCatalogService.BASE_URL + '/services', serviceData, {
        headers,
        timeout: ServiceCatalogService.TIMEOUT
      });

      const data = parseEdgeFunctionResponse(response);
      
      if (!data) {
        throw new Error('No data returned from create operation');
      }

      console.log(`Created service: ${data?.service_name}`);
      return data;

    } catch (error: any) {
      console.error('Error creating service:', error.message);
      throw this.transformError(error, 'Failed to create service');
    }
  }

  /**
   * Update existing service
   */
  async updateService(
    authHeader: string,
    tenantId: string,
    serviceId: string,
    updateData: Partial<UpdateServiceRequest>,
    idempotencyKey?: string
  ): Promise<Service> {
    try {
      console.log(`Updating service: ${serviceId}`);
      
      const requestBody = JSON.stringify(updateData);
      const internalHeaders = InternalSigningService.createSignedHeaders(requestBody);
      
      const headers: Record<string, string> = {
        'Authorization': authHeader,
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json',
        ...internalHeaders
      };

      if (idempotencyKey) {
        headers['x-idempotency-key'] = idempotencyKey;
      }

      const response = await axios.put(
        `${ServiceCatalogService.BASE_URL}/services/${serviceId}`,
        updateData,
        {
          headers,
          timeout: ServiceCatalogService.TIMEOUT
        }
      );

      const data = parseEdgeFunctionResponse(response);
      
      if (!data) {
        throw new Error('No data returned from update operation');
      }

      console.log(`Updated service: ${data?.service_name}`);
      return data;

    } catch (error: any) {
      console.error(`Error updating service ${serviceId}:`, error.message);
      throw this.transformError(error, 'Failed to update service');
    }
  }

  /**
   * Delete service (soft delete)
   */
  async deleteService(
    authHeader: string,
    tenantId: string,
    serviceId: string,
    idempotencyKey?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`Deleting service: ${serviceId}`);
      
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      const headers: Record<string, string> = {
        'Authorization': authHeader,
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json',
        ...internalHeaders
      };

      if (idempotencyKey) {
        headers['x-idempotency-key'] = idempotencyKey;
      }

      const response = await axios.delete(
        `${ServiceCatalogService.BASE_URL}/services/${serviceId}`,
        {
          headers,
          timeout: ServiceCatalogService.TIMEOUT
        }
      );

      const data = parseEdgeFunctionResponse(response);

      console.log(`Deleted service: ${serviceId}`);
      return data || { success: true, message: 'Service deleted successfully' };

    } catch (error: any) {
      console.error(`Error deleting service ${serviceId}:`, error.message);
      throw this.transformError(error, 'Failed to delete service');
    }
  }

  // ============================================================================
  // VALIDATOR SUPPORT METHODS
  // ============================================================================

  /**
   * Check if service name exists (for validator duplicate checking)
   */
  async checkServiceNameExists(
    authHeader: string,
    tenantId: string,
    name: string,
    categoryId: string,
    excludeServiceId?: string
  ): Promise<boolean> {
    try {
      // Get services for the category and check locally
      const services = await this.getServices(authHeader, tenantId, { 
        category_id: categoryId,
        limit: 1000  // Get all services in category to check names
      });
      
      if (!services?.items) {
        return false;
      }

      const nameLower = name.toLowerCase().trim();
      const exists = services.items.some((service: any) => 
        service.service_name?.toLowerCase().trim() === nameLower && 
        service.id !== excludeServiceId
      );

      return exists;

    } catch (error: any) {
      console.error('Error checking service name existence:', error.message);
      // Return false on error to allow creation (edge function will catch duplicates)
      return false;
    }
  }

  /**
   * Get master data (for validator) - caches result during request
   */
  private masterDataCache: { data: MasterData; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getMasterDataForValidator(authHeader: string, tenantId: string): Promise<MasterData> {
    // Simple in-memory cache to avoid multiple calls during validation
    const now = Date.now();
    if (this.masterDataCache && (now - this.masterDataCache.timestamp) < this.CACHE_TTL) {
      return this.masterDataCache.data;
    }

    const data = await this.getMasterData(authHeader, tenantId);
    this.masterDataCache = { data, timestamp: now };
    return data;
  }

  // ============================================================================
  // HEALTH & DEBUG METHODS
  // ============================================================================

  /**
   * Health check
   */
  async healthCheck(authHeader: string, tenantId: string = 'system'): Promise<any> {
    try {
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      const response = await axios.get(`${ServiceCatalogService.BASE_URL}/health`, {
        headers: {
          'Authorization': authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
          ...internalHeaders
        },
        timeout: 10000 // Shorter timeout for health check
      });

      const data = parseEdgeFunctionResponse(response);

      return {
        ...data,
        apiLayer: 'healthy',
        serviceLayer: 'healthy',
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error('Health check failed:', error.message);
      throw this.transformError(error, 'Health check failed');
    }
  }

  // ============================================================================
  // PRIVATE UTILITY METHODS
  // ============================================================================

  /**
   * Transform axios errors to consistent format
   */
  private transformError(error: any, defaultMessage: string): ServiceCatalogError {
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      return {
        type: 'service_unavailable',
        message: 'Request timeout - service did not respond in time',
        details: [{ field: 'timeout', message: `Timeout after ${ServiceCatalogService.TIMEOUT}ms`, code: 'TIMEOUT' }]
      };
    }

    // Handle axios HTTP errors
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      // Map HTTP status to error types
      let type: any = 'internal_error';
      if (status === 400) type = 'validation_error';
      else if (status === 401) type = 'unauthorized';
      else if (status === 403) type = 'forbidden';
      else if (status === 404) type = 'not_found';
      else if (status === 409) type = 'conflict';
      else if (status === 429) type = 'rate_limited';
      else if (status >= 500) type = 'service_unavailable';

      return {
        type,
        message: data?.error || data?.message || defaultMessage,
        details: data?.details ? (Array.isArray(data.details) ? data.details : [data.details]) : undefined,
        requestId: data?.requestId
      };
    }

    // Handle network connection errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        type: 'service_unavailable',
        message: 'Unable to connect to service catalog service',
        details: [{ field: 'connection', message: error.message, code: error.code }]
      };
    }

    // Generic error
    return {
      type: 'internal_error',
      message: defaultMessage,
      details: [{ field: 'system', message: error.message, code: 'UNKNOWN_ERROR' }]
    };
  }

  /**
   * Get service configuration status
   */
  getServiceConfig() {
    return {
      baseUrl: ServiceCatalogService.BASE_URL,
      timeout: ServiceCatalogService.TIMEOUT,
      hasSigningSecret: !!process.env.INTERNAL_SIGNING_SECRET,
      environment: process.env.NODE_ENV || 'development'
    };
  }
}

// Export singleton instance
export default new ServiceCatalogService();