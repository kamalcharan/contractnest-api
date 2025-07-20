// src/services/masterDataService.ts
import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';

export interface CategoryMaster {
  id: string;
  CategoryName: string;
  DisplayName: string;
  is_active: boolean;
  Description: string | null;
  icon_name: string | null;
  order_sequence: number | null;
  tenantid: string;
  created_at: string;
}

export interface CategoryDetail {
  id: string;
  SubCatName: string;
  DisplayName: string;
  category_id: string;
  hexcolor: string | null;
  icon_name: string | null;
  tags: string[] | null;
  tool_tip: string | null;
  is_active: boolean;
  Sequence_no: number | null;
  Description: string | null;
  tenantid: string;
  is_deletable: boolean;
  form_settings: any | null;
  created_at: string;
}

// Service implementation
export const masterDataService = {
  /**
   * Get all categories for a tenant
   */
  async getCategories(authToken: string, tenantId: string): Promise<CategoryMaster[]> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/masterdata/categories?tenantId=${tenantId}`,
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
      console.error('Error in getCategories service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_masterdata', action: 'getCategories' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Get all category details for a specific category and tenant
   */
  async getCategoryDetails(authToken: string, categoryId: string, tenantId: string): Promise<CategoryDetail[]> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/masterdata/category-details?categoryId=${categoryId}&tenantId=${tenantId}`,
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
      console.error('Error in getCategoryDetails service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_masterdata', action: 'getCategoryDetails' },
        categoryId,
        tenantId
      });
      throw error;
    }
  },

  /**
   * Get the next sequence number for a category
   */
  async getNextSequenceNumber(authToken: string, categoryId: string, tenantId: string): Promise<number> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/masterdata/category-details?categoryId=${categoryId}&tenantId=${tenantId}&nextSequence=true`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.nextSequence;
    } catch (error) {
      console.error('Error in getNextSequenceNumber service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_masterdata', action: 'getNextSequenceNumber' },
        categoryId,
        tenantId
      });
      throw error;
    }
  },

  /**
   * Add a new category detail
   */
  async addCategoryDetail(
    authToken: string, 
    detail: Omit<CategoryDetail, 'id' | 'created_at'>
  ): Promise<CategoryDetail> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Basic validation of inputs
      if (!detail.SubCatName || !detail.DisplayName || !detail.category_id || !detail.tenantid) {
        throw new Error('Missing required fields for category detail');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/masterdata/category-details`,
        detail,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': detail.tenantid,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in addCategoryDetail service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_masterdata', action: 'addCategoryDetail' },
        categoryId: detail.category_id,
        tenantId: detail.tenantid
      });
      throw error;
    }
  },

  /**
   * Update an existing category detail
   */
  async updateCategoryDetail(
    authToken: string,
    id: string,
    updates: Partial<CategoryDetail> & { tenantid: string }
  ): Promise<CategoryDetail> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      if (!id || !updates.tenantid) {
        throw new Error('ID and tenantId are required for updates');
      }

      const response = await axios.patch(
        `${SUPABASE_URL}/functions/v1/masterdata/category-details?id=${id}`,
        updates,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': updates.tenantid,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in updateCategoryDetail service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_masterdata', action: 'updateCategoryDetail' },
        detailId: id,
        tenantId: updates.tenantid
      });
      throw error;
    }
  },

  /**
   * Soft delete a category detail
   */
  async softDeleteCategoryDetail(authToken: string, id: string, tenantId: string): Promise<{ success: boolean }> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      if (!id || !tenantId) {
        throw new Error('ID and tenantId are required for deletion');
      }

      const response = await axios.delete(
        `${SUPABASE_URL}/functions/v1/masterdata/category-details?id=${id}&tenantId=${tenantId}`,
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
      console.error('Error in softDeleteCategoryDetail service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_masterdata', action: 'softDeleteCategoryDetail' },
        detailId: id,
        tenantId
      });
      
      // In case of error, explicitly return failure
      return { success: false };
    }
  }
};