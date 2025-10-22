// Backend-src/services/serviceCatalogService.ts
// Service Catalog Service - Express API Layer
// ✅ FIXED: Matches ContactService pattern - no Supabase client needed
// ✅ UPDATED: Boolean status + variant support

import crypto from 'crypto';
import { 
  Service, 
  GetServicesQuery, 
  ServicesListResponse,
  ServiceResourcesResponse,
  MasterData 
} from '../types/serviceCatalogTypes';

export class ServiceCatalogService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    // ✅ Same pattern as ContactService - no Supabase client needed
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('⚠️ INTERNAL_SIGNING_SECRET not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/service-catalog`;
    this.internalSigningSecret = internalSigningSecret || '';
  }

  /**
   * Generate HMAC signature for internal requests
   */
  private generateHMACSignature(payload: string, timestamp: string): string {
    if (!this.internalSigningSecret) {
      return '';
    }

    try {
      const data = payload + timestamp + this.internalSigningSecret;
      return crypto
        .createHash('sha256')
        .update(data)
        .digest('base64')
        .substring(0, 32);
    } catch (error) {
      console.error('Error generating HMAC signature:', error);
      return '';
    }
  }

  /**
   * Make authenticated request to edge function
   */
  private async makeRequest(
    method: string,
    path: string,
    accessToken: string,
    tenantId: string,
    environment: string,
    body?: any
  ): Promise<any> {
    const timestamp = new Date().toISOString();
    const requestBody = body ? JSON.stringify(body) : '';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'x-tenant-id': tenantId,
      'x-environment': environment,
      'x-timestamp': timestamp
    };

    // Add HMAC signature if secret is available
    if (this.internalSigningSecret) {
      headers['x-internal-signature'] = this.generateHMACSignature(requestBody, timestamp);
    }

    const url = `${this.edgeFunctionUrl}${path}`;

    console.log('Making request to edge function', {
      method,
      path,
      tenantId,
      environment,
      hasBody: !!body
    });

    try {
      const requestOptions: RequestInit = {
        method,
        headers
      };

      if (body) {
        requestOptions.body = requestBody;
      }

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('Edge function error', {
          status: response.status,
          error: responseData.error,
          path
        });
        throw new Error(responseData.error?.message || responseData.error || 'Edge function request failed');
      }

      console.log('Edge function success', {
        path,
        status: response.status,
        executionTime: responseData.metadata?.execution_time_ms
      });

      return responseData.data;

    } catch (error: any) {
      console.error('Edge function call failed', {
        error: error.message,
        path,
        method
      });
      throw error;
    }
  }

  /**
   * Get master data (categories, industries, currencies, tax rates)
   */
  async getMasterData(
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<MasterData> {
    console.log('Fetching master data', { tenantId, environment });

    try {
      const data = await this.makeRequest(
        'GET',
        '/master-data',
        accessToken,
        tenantId,
        environment
      );

      return data;
    } catch (error: any) {
      console.error('Failed to fetch master data', {
        error: error.message,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Query service catalog items with filters
   */
  async queryServices(
    filters: GetServicesQuery,
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<ServicesListResponse> {
    console.log('Querying services', {
      tenantId,
      environment,
      filters: {
        hasSearch: !!filters.search_term,
        hasCategory: !!filters.category_id,
        hasIndustry: !!filters.industry_id,
        isActive: filters.is_active,
        limit: filters.limit,
        offset: filters.offset
      }
    });

    try {
      const queryParams = new URLSearchParams();
      
      if (filters.search_term) queryParams.append('search_term', filters.search_term);
      if (filters.category_id) queryParams.append('category_id', filters.category_id);
      if (filters.industry_id) queryParams.append('industry_id', filters.industry_id);
      
      if (filters.is_active !== undefined) {
        queryParams.append('is_active', filters.is_active.toString());
      }
      
      if (filters.price_min !== undefined) queryParams.append('price_min', filters.price_min.toString());
      if (filters.price_max !== undefined) queryParams.append('price_max', filters.price_max.toString());
      if (filters.currency) queryParams.append('currency', filters.currency);
      if (filters.has_resources !== undefined) queryParams.append('has_resources', filters.has_resources.toString());
      if (filters.sort_by) queryParams.append('sort_by', filters.sort_by);
      if (filters.sort_direction) queryParams.append('sort_direction', filters.sort_direction);
      if (filters.limit) queryParams.append('limit', filters.limit.toString());
      if (filters.offset) queryParams.append('offset', filters.offset.toString());

      const data = await this.makeRequest(
        'GET',
        `/services?${queryParams.toString()}`,
        accessToken,
        tenantId,
        environment
      );

      console.log('Services queried successfully', {
        itemCount: data.items?.length || 0,
        totalCount: data.total_count
      });

      return data;
    } catch (error: any) {
      console.error('Failed to query services', {
        error: error.message,
        tenantId,
        filters
      });
      throw error;
    }
  }

  /**
   * Get a single service by ID
   */
  async getServiceById(
    serviceId: string,
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<Service> {
    console.log('Fetching service by ID', {
      serviceId,
      tenantId,
      environment
    });

    try {
      const data = await this.makeRequest(
        'GET',
        `/services/${serviceId}`,
        accessToken,
        tenantId,
        environment
      );

      console.log('Service fetched successfully', {
        serviceId,
        serviceName: data.service_name,
        status: data.status,
        isVariant: data.is_variant,
        parentId: data.parent_id
      });

      return data;
    } catch (error: any) {
      console.error('Failed to fetch service', {
        error: error.message,
        serviceId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Get service resources
   */
  async getServiceResources(
    serviceId: string,
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<ServiceResourcesResponse> {
    console.log('Fetching service resources', {
      serviceId,
      tenantId,
      environment
    });

    try {
      const data = await this.makeRequest(
        'GET',
        `/services/${serviceId}/resources`,
        accessToken,
        tenantId,
        environment
      );

      console.log('Service resources fetched successfully', {
        serviceId,
        resourceCount: data.total_resources
      });

      return data;
    } catch (error: any) {
      console.error('Failed to fetch service resources', {
        error: error.message,
        serviceId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Create a new service catalog item
   */
  async createService(
    serviceData: Partial<Service>,
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<Service> {
    console.log('Creating service', {
      tenantId,
      environment,
      serviceName: serviceData.service_name,
      serviceType: serviceData.service_type,
      hasPricing: !!serviceData.pricing_config,
      hasResources: !!serviceData.required_resources?.length,
      isVariant: serviceData.is_variant,
      hasParentId: !!serviceData.parent_id
    });

    try {
      const data = await this.makeRequest(
        'POST',
        '/services',
        accessToken,
        tenantId,
        environment,
        serviceData
      );

      console.log('Service created successfully', {
        serviceId: data.id,
        serviceName: data.service_name,
        status: data.status,
        isVariant: data.is_variant,
        parentId: data.parent_id
      });

      return data;
    } catch (error: any) {
      console.error('Failed to create service', {
        error: error.message,
        tenantId,
        serviceName: serviceData.service_name
      });
      throw error;
    }
  }

  /**
   * Update a service catalog item
   */
  async updateService(
    serviceId: string,
    serviceData: Partial<Service>,
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<Service> {
    console.log('Updating service (creating new version)', {
      serviceId,
      tenantId,
      environment,
      serviceName: serviceData.service_name,
      hasUpdates: Object.keys(serviceData).length
    });

    try {
      const data = await this.makeRequest(
        'PUT',
        `/services/${serviceId}`,
        accessToken,
        tenantId,
        environment,
        serviceData
      );

      console.log('Service updated successfully (new version created)', {
        oldServiceId: serviceId,
        newServiceId: data.id,
        serviceName: data.service_name,
        status: data.status,
        parentId: data.parent_id
      });

      return data;
    } catch (error: any) {
      console.error('Failed to update service', {
        error: error.message,
        serviceId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Toggle service status
   */
  async toggleServiceStatus(
    serviceId: string,
    newStatus: boolean,
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<Service> {
    console.log('Toggling service status', {
      serviceId,
      tenantId,
      environment,
      newStatus
    });

    try {
      const data = await this.makeRequest(
        'PATCH',
        `/services/${serviceId}/status`,
        accessToken,
        tenantId,
        environment,
        { status: newStatus }
      );

      console.log('Service status toggled successfully', {
        serviceId: data.service.id,
        serviceName: data.service.service_name,
        newStatus: data.service.status
      });

      return data.service;
    } catch (error: any) {
      console.error('Failed to toggle service status', {
        error: error.message,
        serviceId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Delete (deactivate) a service
   */
  async deleteService(
    serviceId: string,
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<{ success: boolean; message: string; service: any }> {
    console.log('Deactivating service (soft delete)', {
      serviceId,
      tenantId,
      environment
    });

    try {
      const data = await this.makeRequest(
        'DELETE',
        `/services/${serviceId}`,
        accessToken,
        tenantId,
        environment
      );

      console.log('Service deactivated successfully', {
        serviceId: data.service.id,
        serviceName: data.service.name,
        newStatus: data.service.status
      });

      return data;
    } catch (error: any) {
      console.error('Failed to deactivate service', {
        error: error.message,
        serviceId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Activate (restore) a service
   */
  async activateService(
    serviceId: string,
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<Service> {
    console.log('Activating service', {
      serviceId,
      tenantId,
      environment
    });

    try {
      const data = await this.makeRequest(
        'POST',
        `/services/${serviceId}/activate`,
        accessToken,
        tenantId,
        environment
      );

      console.log('Service activated successfully', {
        serviceId: data.service.id,
        serviceName: data.service.service_name,
        newStatus: data.service.status
      });

      return data.service;
    } catch (error: any) {
      console.error('Failed to activate service', {
        error: error.message,
        serviceId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(
    accessToken: string,
    tenantId: string
  ): Promise<{ status: string; service: string; timestamp: string }> {
    console.log('Performing health check', { tenantId });

    try {
      const data = await this.makeRequest(
        'GET',
        '/health',
        accessToken,
        tenantId,
        'live'
      );

      console.log('Health check successful', {
        status: data.status,
        service: data.service
      });

      return data;
    } catch (error: any) {
      console.error('Health check failed', {
        error: error.message,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Get service statistics
   */
  async getServiceStatistics(
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<{
    total_services: number;
    active_services: number;
    inactive_services: number;
    services_with_resources: number;
    service_variants: number;
  }> {
    console.log('Fetching service statistics', {
      tenantId,
      environment
    });

    try {
      const data = await this.makeRequest(
        'GET',
        '/services/statistics',
        accessToken,
        tenantId,
        environment
      );

      console.log('Service statistics fetched successfully', {
        totalServices: data.total_services,
        activeServices: data.active_services,
        inactiveServices: data.inactive_services,
        servicesWithResources: data.services_with_resources,
        serviceVariants: data.service_variants
      });

      return data;
    } catch (error: any) {
      console.error('Failed to fetch service statistics', {
        error: error.message,
        tenantId
      });
      
      return {
        total_services: 0,
        active_services: 0,
        inactive_services: 0,
        services_with_resources: 0,
        service_variants: 0
      };
    }
  }

  /**
   * Get service version history
   */
  async getServiceVersionHistory(
    serviceId: string,
    accessToken: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<Service[]> {
    console.log('Fetching service version history', {
      serviceId,
      tenantId,
      environment
    });

    try {
      const filters: GetServicesQuery = {
        limit: 100,
        offset: 0,
        sort_by: 'created_at',
        sort_direction: 'desc'
      };

      const response = await this.queryServices(filters, accessToken, tenantId, environment);
      
      const versions = response.items.filter(
        (item: Service) => item.id === serviceId || item.parent_id === serviceId
      );

      console.log('Service version history fetched', {
        serviceId,
        versionCount: versions.length
      });

      return versions;
    } catch (error: any) {
      console.error('Failed to fetch service version history', {
        error: error.message,
        serviceId,
        tenantId
      });
      throw error;
    }
  }

  /**
 * Validate service data
 * ✅ FIXED: Accepts BOTH pricing_config (old) AND pricing_records (new)
 */
validateServiceData(serviceData: Partial<Service>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate service name
  if (!serviceData.service_name || serviceData.service_name.trim().length === 0) {
    errors.push('Service name is required');
  }

  if (serviceData.service_name && serviceData.service_name.length > 255) {
    errors.push('Service name must be 255 characters or less');
  }

  // ✅ FIXED: Validate pricing - accept BOTH formats with proper typing
  const hasPricingConfig = serviceData.pricing_config;
  const pricingRecords = (serviceData as any).pricing_records; // ✅ Type assertion
  const hasPricingRecords = Array.isArray(pricingRecords) && pricingRecords.length > 0;

  if (!hasPricingConfig && !hasPricingRecords) {
    errors.push('Pricing information is required (pricing_config or pricing_records)');
  }

  // Validate pricing_config if provided (old format)
  if (hasPricingConfig) {
    if (serviceData.pricing_config!.base_price === undefined || serviceData.pricing_config!.base_price < 0) {
      errors.push('Valid base price is required');
    }

    if (!serviceData.pricing_config!.currency) {
      errors.push('Currency is required');
    }

    if (!serviceData.pricing_config!.pricing_model) {
      errors.push('Pricing model is required');
    }
  }

  // ✅ NEW: Validate pricing_records if provided (new format)
  if (hasPricingRecords) {
    pricingRecords.forEach((pricing: any, index: number) => {
      if (pricing.amount === undefined || pricing.amount < 0) {
        errors.push(`Pricing record ${index + 1}: valid amount is required`);
      }

      if (!pricing.currency || pricing.currency.length !== 3) {
        errors.push(`Pricing record ${index + 1}: valid 3-character currency code is required`);
      }

      if (!pricing.price_type) {
        errors.push(`Pricing record ${index + 1}: price type is required`);
      }

      if (pricing.tax_inclusion && pricing.tax_inclusion !== 'inclusive' && pricing.tax_inclusion !== 'exclusive') {
        errors.push(`Pricing record ${index + 1}: tax_inclusion must be 'inclusive' or 'exclusive'`);
      }
    });

    // Check for duplicate currencies
    const currencies = pricingRecords.map((p: any) => p.currency);
    const uniqueCurrencies = new Set(currencies);
    if (currencies.length !== uniqueCurrencies.size) {
      errors.push('Duplicate currencies found in pricing records');
    }
  }

  // Validate service type
  if (serviceData.service_type && !['independent', 'resource_based'].includes(serviceData.service_type)) {
    errors.push('Service type must be either "independent" or "resource_based"');
  }

  // Validate resources for resource-based services
  if (serviceData.service_type === 'resource_based') {
    const requiredResources = (serviceData as any).required_resources;
    const resourceRequirements = (serviceData as any).resource_requirements;
    const hasResources = (Array.isArray(requiredResources) && requiredResources.length > 0) ||
                        (Array.isArray(resourceRequirements) && resourceRequirements.length > 0);
    
    if (!hasResources) {
      errors.push('Resource-based services must have at least one required resource');
    }
  }

  // Validate variant fields
  if (serviceData.is_variant === true && !serviceData.parent_id) {
    errors.push('parent_id is required when is_variant is true');
  }

  // Validate status
  if (serviceData.status !== undefined && typeof serviceData.status !== 'boolean') {
    errors.push('Status must be a boolean (true or false)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

  /**
   * Format service data for display
   */
  formatServiceForDisplay(service: Service): any {
    return {
      id: service.id,
      name: service.service_name,
      description: service.short_description || service.description,
      sku: service.sku,
      category: service.category_id,
      industry: service.industry_id,
      
      // Status fields
      status: service.status,
      isActive: service.is_active,
      
      // Variant info
      isVariant: service.is_variant,
      parentId: service.parent_id,
      
      // Pricing
      pricing: {
        basePrice: service.pricing_config?.base_price,
        currency: service.pricing_config?.currency,
        pricingModel: service.pricing_config?.pricing_model,
        billingCycle: service.pricing_config?.billing_cycle,
        formattedPrice: service.formatted_price
      },
      
      // Service details
      serviceType: service.service_type,
      hasResources: service.has_resources,
      resourceCount: service.resource_count,
      duration: service.duration_minutes,
      sortOrder: service.sort_order,
      imageUrl: service.image_url,
      tags: service.tags,
      
      // Timestamps
      createdAt: service.created_at,
      updatedAt: service.updated_at,
      createdBy: service.created_by,
      updatedBy: service.updated_by
    };
  }
}