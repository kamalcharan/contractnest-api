// src/services/tenantAccountService.ts
// Service layer for Tenant Account Management (Owner-side)
// Proxies to tenant-account edge function
// Pattern: matches businessModelService.ts (simple headers, no signing)

import axios from 'axios';
import { SUPABASE_URL } from '../utils/supabaseConfig';

const BASE_URL = `${SUPABASE_URL}/functions/v1/tenant-account`;

export class TenantAccountService {

  /**
   * GET /data-summary - Owner's own tenant data summary
   */
  async getDataSummary(authHeader: string, tenantId: string): Promise<any> {
    try {
      const url = `${BASE_URL}/data-summary`;
      console.log(`[tenantAccountService] Fetching owner data summary from: ${url}`);

      const response = await axios.get(url, {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('[tenantAccountService] getDataSummary error:', error.message);
      throw error;
    }
  }

  /**
   * POST /reset-test-data - Owner resets their own test data
   */
  async resetTestData(authHeader: string, tenantId: string): Promise<any> {
    try {
      const url = `${BASE_URL}/reset-test-data`;
      console.log(`[tenantAccountService] Reset test data: ${url}`);

      const response = await axios.post(url, {}, {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('[tenantAccountService] resetTestData error:', error.message);
      throw error;
    }
  }

  /**
   * POST /reset-all-data - Owner resets all their data (keeps account open)
   */
  async resetAllData(authHeader: string, tenantId: string): Promise<any> {
    try {
      const url = `${BASE_URL}/reset-all-data`;
      console.log(`[tenantAccountService] Reset all data: ${url}`);

      const response = await axios.post(url, {}, {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('[tenantAccountService] resetAllData error:', error.message);
      throw error;
    }
  }

  /**
   * POST /close-account - Owner closes their own account
   */
  async closeAccount(authHeader: string, tenantId: string, reason?: string): Promise<any> {
    try {
      const url = `${BASE_URL}/close-account`;
      console.log(`[tenantAccountService] Close account: ${url}`);

      const response = await axios.post(url,
        { confirmed: true, reason: reason || '' },
        {
          headers: {
            Authorization: authHeader,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('[tenantAccountService] closeAccount error:', error.message);
      throw error;
    }
  }
}

export const tenantAccountService = new TenantAccountService();
