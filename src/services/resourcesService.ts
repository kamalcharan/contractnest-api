// src/services/resourcesService.ts

import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import {
  Resource,
  ResourceType,
  CreateResourceRequest,
  UpdateResourceRequest,
  GetResourcesQuery,
  NextSequenceResponse,
  EdgeFunctionResponse,
  InternalSignatureHeaders,
  ResourcesHttpStatus,
  ResourceError
} from '../types/resourcesTypes';

/**
 * Internal signing service for secure edge function communication
 */
class InternalSigningService {
  private static readonly SIGNING_SECRET = process.env.INTERNAL_SIGNING_SECRET || 'fallback-key-for-dev';
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds

  /**
   * Generate HMAC signature (matches controller implementation)
   */
  static generateSignature(payload: string): string {
    try {
      const hmac = crypto.createHmac('sha256', this.SIGNING_SECRET);
      hmac.update(payload);
      return hmac.digest('hex');
    } catch (error) {
      console.error('🔐 Error generating signature:', error);
      return 'fallback-signature';
    }
  }

  /**
   * Create signed headers for edge function requests
   */
  static createSignedHeaders(body: string = ''): InternalSignatureHeaders {
    const signature = this.generateSignature(body);
    
    console.log('🔐 Creating signed headers:', {
      bodyLength: body.length,
      signature: signature.substring(0, 16) + '...', // Only show first 16 chars
      hasSecret: !!this.SIGNING_SECRET
    });

    return {
      'x-internal-signature': signature
    };
  }
}

/**
 * Resources Service - Handles all communication with resources edge function
 */
export class ResourcesService {
  private static readonly BASE_URL = process.env.SUPABASE_URL + '/functions/v1/resources';
  private static readonly TIMEOUT = 30000;

  // ============================================================================
  // CORE RESOURCE OPERATIONS (for UI consumption)
  // ============================================================================

  /**
   * Get all resource types (for left sidebar)
   */
  async getResourceTypes(authHeader: string, tenantId: string): Promise<ResourceType[]> {
    try {
      console.log('📋 Getting resource types...');
      
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      const response = await axios.get(`${ResourcesService.BASE_URL}/resource-types`, {
        headers: {
          'Authorization': authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
          ...internalHeaders
        },
        timeout: ResourcesService.TIMEOUT
      });

      console.log(`✅ Got ${response.data?.length || 0} resource types`);
      return response.data || [];

    } catch (error: any) {
      console.error('❌ Error getting resource types:', error.message);
      throw this.transformError(error, 'Failed to get resource types');
    }
  }

  /**
   * Get resources by type (for right panel display)
   */
  async getResourcesByType(
    authHeader: string, 
    tenantId: string, 
    resourceTypeId: string
  ): Promise<Resource[]> {
    try {
      console.log(`📋 Getting resources for type: ${resourceTypeId}`);
      
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      const response = await axios.get(`${ResourcesService.BASE_URL}?resourceTypeId=${resourceTypeId}`, {
        headers: {
          'Authorization': authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
          ...internalHeaders
        },
        timeout: ResourcesService.TIMEOUT
      });

      console.log(`✅ Got ${response.data?.length || 0} resources for type ${resourceTypeId}`);
      return response.data || [];

    } catch (error: any) {
      console.error(`❌ Error getting resources for type ${resourceTypeId}:`, error.message);
      throw this.transformError(error, `Failed to get resources for type ${resourceTypeId}`);
    }
  }

  /**
   * Get all resources (for initial load or "All" view)
   */
  async getAllResources(authHeader: string, tenantId: string): Promise<Resource[]> {
    try {
      console.log('📋 Getting all resources...');
      
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      const response = await axios.get(ResourcesService.BASE_URL, {
        headers: {
          'Authorization': authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
          ...internalHeaders
        },
        timeout: ResourcesService.TIMEOUT
      });

      console.log(`✅ Got ${response.data?.length || 0} total resources`);
      return response.data || [];

    } catch (error: any) {
      console.error('❌ Error getting all resources:', error.message);
      throw this.transformError(error, 'Failed to get resources');
    }
  }

  /**
   * Get next sequence number for new resource
   */
  async getNextSequenceNumber(
    authHeader: string, 
    tenantId: string, 
    resourceTypeId: string
  ): Promise<number> {
    try {
      console.log(`🔢 Getting next sequence for type: ${resourceTypeId}`);
      
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      const response = await axios.get(
        `${ResourcesService.BASE_URL}?resourceTypeId=${resourceTypeId}&nextSequence=true`,
        {
          headers: {
            'Authorization': authHeader,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json',
            ...internalHeaders
          },
          timeout: ResourcesService.TIMEOUT
        }
      );

      const nextSequence = response.data?.nextSequence || 1;
      console.log(`✅ Next sequence: ${nextSequence}`);
      return nextSequence;

    } catch (error: any) {
      console.error(`❌ Error getting next sequence for ${resourceTypeId}:`, error.message);
      throw this.transformError(error, 'Failed to get next sequence number');
    }
  }

  /**
   * Create new resource
   */
  async createResource(
    authHeader: string,
    tenantId: string,
    resourceData: CreateResourceRequest,
    idempotencyKey?: string
  ): Promise<Resource> {
    try {
      console.log('➕ Creating resource:', { 
        name: resourceData.name, 
        type: resourceData.resource_type_id 
      });
      
      const requestBody = JSON.stringify(resourceData);
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

      const response = await axios.post(ResourcesService.BASE_URL, resourceData, {
        headers,
        timeout: ResourcesService.TIMEOUT
      });

      console.log(`✅ Created resource: ${response.data?.name}`);
      return response.data;

    } catch (error: any) {
      console.error('❌ Error creating resource:', error.message);
      throw this.transformError(error, 'Failed to create resource');
    }
  }

  /**
   * Update existing resource
   */
  async updateResource(
    authHeader: string,
    tenantId: string,
    resourceId: string,
    updateData: Partial<UpdateResourceRequest>,
    idempotencyKey?: string
  ): Promise<Resource> {
    try {
      console.log(`✏️ Updating resource: ${resourceId}`);
      
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

      const response = await axios.patch(
        `${ResourcesService.BASE_URL}?id=${resourceId}`,
        updateData,
        {
          headers,
          timeout: ResourcesService.TIMEOUT
        }
      );

      console.log(`✅ Updated resource: ${response.data?.name}`);
      return response.data;

    } catch (error: any) {
      console.error(`❌ Error updating resource ${resourceId}:`, error.message);
      throw this.transformError(error, 'Failed to update resource');
    }
  }

  /**
   * Delete resource (soft delete)
   */
  async deleteResource(
    authHeader: string,
    tenantId: string,
    resourceId: string,
    idempotencyKey?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🗑️ Deleting resource: ${resourceId}`);
      
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
        `${ResourcesService.BASE_URL}?id=${resourceId}`,
        {
          headers,
          timeout: ResourcesService.TIMEOUT
        }
      );

      console.log(`✅ Deleted resource: ${resourceId}`);
      return response.data;

    } catch (error: any) {
      console.error(`❌ Error deleting resource ${resourceId}:`, error.message);
      throw this.transformError(error, 'Failed to delete resource');
    }
  }

  // ============================================================================
  // VALIDATOR SUPPORT METHODS
  // ============================================================================

  /**
   * Get single resource by ID (for validator)
   */
  async getResourceById(
    authHeader: string,
    tenantId: string,
    resourceId: string
  ): Promise<Resource | null> {
    try {
      const internalHeaders = InternalSigningService.createSignedHeaders();
      
      const response = await axios.get(
        `${ResourcesService.BASE_URL}?resourceId=${resourceId}`,
        {
          headers: {
            'Authorization': authHeader,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json',
            ...internalHeaders
          },
          timeout: ResourcesService.TIMEOUT
        }
      );

      // Edge function returns array, take first item
      const data = response.data;
      return Array.isArray(data) && data.length > 0 ? data[0] : null;

    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error(`Error getting resource ${resourceId}:`, error.message);
      throw this.transformError(error, 'Failed to get resource');
    }
  }

  /**
   * Check if resource name exists (for validator duplicate checking)
   */
  async checkResourceNameExists(
    authHeader: string,
    tenantId: string,
    name: string,
    resourceTypeId: string,
    excludeResourceId?: string
  ): Promise<boolean> {
    try {
      // Get all resources for the type and check locally
      // This is more efficient than adding a separate edge function endpoint
      const resources = await this.getResourcesByType(authHeader, tenantId, resourceTypeId);
      
      const nameLower = name.toLowerCase().trim();
      const exists = resources.some(resource => 
        resource.name.toLowerCase().trim() === nameLower && 
        resource.id !== excludeResourceId
      );

      return exists;

    } catch (error: any) {
      console.error('Error checking resource name existence:', error.message);
      // Return false on error to allow creation (edge function will catch duplicates)
      return false;
    }
  }

  /**
   * Get resource types (for validator) - caches result during request
   */
  private resourceTypesCache: { data: ResourceType[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getResourceTypesForValidator(authHeader: string, tenantId: string): Promise<ResourceType[]> {
    // Simple in-memory cache to avoid multiple calls during validation
    const now = Date.now();
    if (this.resourceTypesCache && (now - this.resourceTypesCache.timestamp) < this.CACHE_TTL) {
      return this.resourceTypesCache.data;
    }

    const data = await this.getResourceTypes(authHeader, tenantId);
    this.resourceTypesCache = { data, timestamp: now };
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
      
      const response = await axios.get(`${ResourcesService.BASE_URL}/health`, {
        headers: {
          'Authorization': authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
          ...internalHeaders
        },
        timeout: 10000 // Shorter timeout for health check
      });

      return {
        ...response.data,
        apiLayer: 'healthy',
        serviceLayer: 'healthy',
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error('❌ Health check failed:', error.message);
      throw this.transformError(error, 'Health check failed');
    }
  }

  // ============================================================================
  // PRIVATE UTILITY METHODS
  // ============================================================================

  /**
   * Transform axios errors to consistent format
   */
  private transformError(error: any, defaultMessage: string): ResourceError {
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      return {
        type: 'service_unavailable',
        message: 'Request timeout - service did not respond in time',
        details: [{ field: 'timeout', message: `Timeout after ${ResourcesService.TIMEOUT}ms`, code: 'TIMEOUT' }]
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
        message: 'Unable to connect to resources service',
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
      baseUrl: ResourcesService.BASE_URL,
      timeout: ResourcesService.TIMEOUT,
      hasSigningSecret: !!process.env.INTERNAL_SIGNING_SECRET,
      environment: process.env.NODE_ENV || 'development'
    };
  }
}

// Export singleton instance
export default new ResourcesService();