// src/services/adminTenantService.ts
// Service layer for Admin Tenant Management - proxies to edge function
// Pattern: matches businessModelService.ts (simple headers, no signing)

import axios from 'axios';
import { SUPABASE_URL } from '../utils/supabaseConfig';

const BASE_URL = `${SUPABASE_URL}/functions/v1/admin-tenant-management`;

export class AdminTenantService {

  /**
   * GET /stats - Platform-wide stats
   */
  async getStats(authHeader: string, tenantId: string): Promise<any> {
    try {
      const url = `${BASE_URL}/stats`;
      console.log(`[adminTenantService] Fetching stats from: ${url}`);

      const response = await axios.get(url, {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-is-admin': 'true',
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminTenantService] getStats error:', error.message);
      throw error;
    }
  }

  /**
   * GET /tenants - Paginated tenant list with filters
   */
  async getTenants(
    authHeader: string,
    tenantId: string,
    filters: {
      page?: number;
      limit?: number;
      status?: string;
      subscription_status?: string;
      search?: string;
      sort_by?: string;
      sort_direction?: string;
    }
  ): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));
      if (filters.status) params.append('status', filters.status);
      if (filters.subscription_status) params.append('subscription_status', filters.subscription_status);
      if (filters.search) params.append('search', filters.search);
      if (filters.sort_by) params.append('sort_by', filters.sort_by);
      if (filters.sort_direction) params.append('sort_direction', filters.sort_direction);

      const queryString = params.toString();
      const url = `${BASE_URL}/tenants${queryString ? '?' + queryString : ''}`;
      console.log(`[adminTenantService] Fetching tenants from: ${url}`);

      const response = await axios.get(url, {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-is-admin': 'true',
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminTenantService] getTenants error:', error.message);
      throw error;
    }
  }

  /**
   * GET /data-summary - Get data summary for a specific tenant
   */
  async getDataSummary(authHeader: string, tenantId: string, targetTenantId: string): Promise<any> {
    try {
      const url = `${BASE_URL}/data-summary?tenant_id=${targetTenantId}`;
      console.log(`[adminTenantService] Fetching data summary from: ${url}`);

      const response = await axios.get(url, {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-is-admin': 'true',
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminTenantService] getDataSummary error:', error.message);
      throw error;
    }
  }

  /**
   * POST /reset-test-data - Delete test data (is_live=false) for a tenant
   */
  async resetTestData(authHeader: string, tenantId: string, targetTenantId: string): Promise<any> {
    try {
      const url = `${BASE_URL}/reset-test-data`;
      console.log(`[adminTenantService] Reset test data: ${url}`);

      const response = await axios.post(url,
        { tenant_id: targetTenantId },
        {
          headers: {
            Authorization: authHeader,
            'x-tenant-id': tenantId,
            'x-is-admin': 'true',
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('[adminTenantService] resetTestData error:', error.message);
      throw error;
    }
  }

  /**
   * POST /reset-all-data - Delete ALL data for a tenant, keep account open
   */
  async resetAllData(authHeader: string, tenantId: string, targetTenantId: string): Promise<any> {
    try {
      const url = `${BASE_URL}/reset-all-data`;
      console.log(`[adminTenantService] Reset all data: ${url}`);

      const response = await axios.post(url,
        { tenant_id: targetTenantId, confirmed: true },
        {
          headers: {
            Authorization: authHeader,
            'x-tenant-id': tenantId,
            'x-is-admin': 'true',
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('[adminTenantService] resetAllData error:', error.message);
      throw error;
    }
  }

  /**
   * POST /close-account - Delete ALL data + close tenant account
   */
  async closeAccount(authHeader: string, tenantId: string, targetTenantId: string): Promise<any> {
    try {
      const url = `${BASE_URL}/close-account`;
      console.log(`[adminTenantService] Close account: ${url}`);

      const response = await axios.post(url,
        { tenant_id: targetTenantId, confirmed: true },
        {
          headers: {
            Authorization: authHeader,
            'x-tenant-id': tenantId,
            'x-is-admin': 'true',
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('[adminTenantService] closeAccount error:', error.message);
      throw error;
    }
  }
}

export const adminTenantService = new AdminTenantService();
