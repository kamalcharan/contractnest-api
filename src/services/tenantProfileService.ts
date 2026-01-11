// backend/src/services/tenantProfileService.ts
import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';

export interface TenantProfile {
  id: string;
  tenant_id: string;
  business_type_id: string;
  industry_id: string;
  business_name: string;
  logo_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_code: string | null;
  country_code: string | null;
  postal_code: string | null;
  business_phone_country_code: string | null;
  business_phone: string | null;
  business_email: string | null;
  website_url: string | null;
  // ✅ ADDED: WhatsApp fields for BBB integration
  business_whatsapp_country_code: string | null;
  business_whatsapp: string | null;
  // ✅ ADDED: Contact person and booking fields
  booking_url: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantProfileCreate extends Omit<TenantProfile, 'id' | 'created_at' | 'updated_at'> {}

// Service implementation
export const tenantProfileService = {
  /**
   * Get tenant profile for a specific tenant
   */
  async getTenantProfile(authToken: string, tenantId: string): Promise<TenantProfile | null> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/tenant-profile`,
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
      console.error('Error in getTenantProfile service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'getTenantProfile' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Create a new tenant profile
   */
  async createTenantProfile(
    authToken: string, 
    tenantId: string, 
    profileData: TenantProfileCreate
  ): Promise<TenantProfile> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Basic validation of inputs
      if (!profileData.business_name) {
        throw new Error('business_name is required');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/tenant-profile`,
        profileData,
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
      console.error('Error in createTenantProfile service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'createTenantProfile' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Update an existing tenant profile
   */
  async updateTenantProfile(
    authToken: string,
    tenantId: string,
    profileData: Partial<TenantProfileCreate> & { tenant_id: string }
  ): Promise<TenantProfile> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      if (!profileData.business_name) {
        throw new Error('business_name is required');
      }

      const response = await axios.put(
        `${SUPABASE_URL}/functions/v1/tenant-profile`,
        profileData,
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
      console.error('Error in updateTenantProfile service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'updateTenantProfile' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Upload a logo for the tenant profile
   */
  async uploadLogo(authToken: string, tenantId: string, file: Express.Multer.File): Promise<string> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Create form data
      const formData = new FormData();
      
      // In a real implementation, you would use the file buffer
      // This is a simplified version that would need to be adapted based on your file handling
      const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
      formData.append('logo', blob, file.originalname);

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/tenant-profile/logo`,
        formData,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      return response.data.url;
    } catch (error) {
      console.error('Error in uploadLogo service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'uploadLogo' },
        tenantId
      });
      throw error;
    }
  }
};