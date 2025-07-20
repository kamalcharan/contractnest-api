// src/services/integrationService.ts
import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';

// Type definitions - Updated to include display fields
export interface IntegrationType {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IntegrationTypeStatus {
  integration_type: string;      // Actual database name
  display_name: string;          // For UI display
  description: string;           // For UI description  
  icon_name: string;            // For UI icons
  active_count: number;
  total_available: number;
}

export interface IntegrationProvider {
  id: string;
  type_id: string;
  name: string;
  display_name: string;
  description: string;
  logo_url: string;
  is_active: boolean;
  config_schema: {
    fields: Array<{
      name: string;
      type: string;
      required: boolean;
      sensitive: boolean;
      description: string;
      display_name: string;
      default?: any;
    }>;
  };
  metadata: {
    support_email?: string;
    documentation_url?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface TenantIntegration {
  id: string;
  tenant_id: string;
  master_integration_id: string;
  integration_type?: string;              // Added for dynamic type handling
  integration_type_display?: string;      // Added for UI display
  is_active: boolean;
  is_live: boolean;
  credentials: Record<string, any>;
  connection_status: string;
  last_verified: string | null;
  created_at: string;
  updated_at: string;
  provider?: IntegrationProvider;
}

export interface IntegrationConnectionTest {
  success: boolean;
  message: string;
}

// Service implementation
export const integrationService = {
  /**
   * Get all integration types
   */
  async getIntegrationTypes(authToken: string): Promise<IntegrationType[]> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/integrations/types`,
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json'
            // Note: x-tenant-id is NOT required for types endpoint
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in getIntegrationTypes service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'getIntegrationTypes' }
      });
      throw error;
    }
  },

  /**
   * Get integration providers with optional type filter
   */
  async getIntegrationProviders(authToken: string, typeId?: string): Promise<IntegrationProvider[]> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const url = typeId 
        ? `${SUPABASE_URL}/functions/v1/integrations/providers?type_id=${typeId}`
        : `${SUPABASE_URL}/functions/v1/integrations/providers`;

      const response = await axios.get(url, {
        headers: {
          Authorization: authToken,
          'Content-Type': 'application/json'
          // Note: x-tenant-id is optional for providers endpoint
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error in getIntegrationProviders service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'getIntegrationProviders' }
      });
      throw error;
    }
  },

  /**
   * Get tenant integrations for a specific tenant
   */
  async getTenantIntegrations(authToken: string, tenantId: string): Promise<TenantIntegration[]> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/integrations/tenant-integrations`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in getTenantIntegrations service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'getTenantIntegrations' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Get a specific tenant integration by provider ID
   */
  async getTenantIntegration(authToken: string, tenantId: string, providerId: string): Promise<TenantIntegration | null> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/integrations?providerId=${providerId}&isLive=false`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in getTenantIntegration service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'getTenantIntegration' },
        tenantId,
        providerId
      });
      throw error;
    }
  },

  /**
   * Create a new tenant integration
   */
  async createTenantIntegration(
    authToken: string,
    tenantId: string,
    masterIntegrationId: string,
    credentials: Record<string, any>,
    isLive: boolean = false
  ): Promise<TenantIntegration> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Basic validation of inputs
      if (!masterIntegrationId) {
        throw new Error('masterIntegrationId is required');
      }

      if (!credentials || Object.keys(credentials).length === 0) {
        throw new Error('credentials are required');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/integrations/tenant-integrations`,
        {
          master_integration_id: masterIntegrationId,
          credentials,
          is_live: isLive
        },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in createTenantIntegration service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'createTenantIntegration' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Update an existing tenant integration
   */
  async updateTenantIntegration(
    authToken: string,
    tenantId: string,
    integrationId: string,
    updateData: {
      credentials?: Record<string, any>;
      is_active?: boolean;
      is_live?: boolean;
    }
  ): Promise<TenantIntegration> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Basic validation
      if (!integrationId) {
        throw new Error('integrationId is required');
      }

      const response = await axios.put(
        `${SUPABASE_URL}/functions/v1/integrations/tenant-integrations`,
        {
          id: integrationId,
          ...updateData
        },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in updateTenantIntegration service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'updateTenantIntegration' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Save integration (create or update) - using the main integrations endpoint
   */
  async saveIntegration(
    authToken: string, 
    tenantId: string, 
    integration: any, 
    isLive: boolean
  ): Promise<TenantIntegration> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/integrations`,
        {
          ...integration,
          is_live: isLive
        },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in saveIntegration service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'saveIntegration' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Delete a tenant integration
   */
  async deleteTenantIntegration(
    authToken: string,
    tenantId: string,
    integrationId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Basic validation
      if (!integrationId) {
        throw new Error('integrationId is required');
      }

      const response = await axios.delete(
        `${SUPABASE_URL}/functions/v1/integrations/tenant-integrations?id=${integrationId}`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in deleteTenantIntegration service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'deleteTenantIntegration' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Test integration connection without saving
   */
  async testIntegrationConnection(
    authToken: string,
    tenantId: string,
    providerId: string,
    credentials: Record<string, any>
  ): Promise<IntegrationConnectionTest> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Basic validation
      if (!providerId) {
        throw new Error('providerId is required');
      }

      if (!credentials || Object.keys(credentials).length === 0) {
        throw new Error('credentials are required');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/integrations/test-connection`,
        {
          provider_id: providerId,
          credentials
        },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in testIntegrationConnection service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'testIntegrationConnection' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Test integration using the main test endpoint
   */
  async testIntegration(
    authToken: string, 
    tenantId: string, 
    integration: { 
      master_integration_id: string; 
      credentials: Record<string, any>;
      integration_id?: string;  // Added to support testing existing integrations
    }, 
    isLive: boolean
  ): Promise<IntegrationConnectionTest> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/integrations/test`,
        {
          master_integration_id: integration.master_integration_id,
          credentials: integration.credentials,
          integration_id: integration.integration_id,  // Pass through if provided
          is_live: isLive,
          save: true  // Allow updating last_verified
        },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in testIntegration service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'testIntegration' },
        tenantId
      });
      
      if (axios.isAxiosError(error) && error.response) {
        return {
          success: false,
          message: error.response.data?.error || 'Failed to test integration connection'
        };
      }
      
      return {
        success: false,
        message: 'Failed to test integration connection'
      };
    }
  },

  /**
   * Toggle integration active status
   */
  async toggleIntegrationStatus(
    authToken: string,
    tenantId: string,
    integrationId: string,
    isActive: boolean
  ): Promise<{ success: boolean; message: string; integration: TenantIntegration }> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Basic validation
      if (!integrationId) {
        throw new Error('integrationId is required');
      }

      const response = await axios.patch(
        `${SUPABASE_URL}/functions/v1/integrations/toggle-status`,
        {
          id: integrationId,
          is_active: isActive
        },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in toggleIntegrationStatus service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'toggleIntegrationStatus' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Get integrations by type from the main endpoint
   * Now uses the actual database type name
   */
  async getIntegrationsByType(
    authToken: string, 
    tenantId: string, 
    type: string, 
    isLive: boolean
  ): Promise<any[]> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      console.log('Getting integrations by type:', type, 'isLive:', isLive);

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/integrations?type=${type}&isLive=${isLive}`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in getIntegrationsByType service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'getIntegrationsByType' },
        tenantId,
        integrationType: type,
        isLive
      });
      throw error;
    }
  },

  /**
   * Get integration types with status from the main endpoint
   * Now returns the enhanced response with display fields
   */
  async getIntegrationTypesWithStatus(
    authToken: string, 
    tenantId: string, 
    isLive: boolean
  ): Promise<IntegrationTypeStatus[]> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/integrations?isLive=${isLive}`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in getIntegrationTypesWithStatus service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_integrations', action: 'getIntegrationTypesWithStatus' },
        tenantId,
        isLive
      });
      throw error;
    }
  }
};