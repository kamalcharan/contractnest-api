// src/services/businessModelService.ts - UPDATED WITH PRODUCT FILTER

import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';
import {
  PricingPlan,
  PlanVersion,
  CreatePlanRequest,
  UpdatePlanRequest,
  CreateVersionRequest,
  VersionComparisonResult
} from '../types/businessModel';

/**
 * Business Model Service
 * Handles communication with the Supabase Edge Functions for Business Model operations
 */
export const businessModelService = {
  /**
   * Get all pricing plans with optional filtering
   * @param productCode - Optional product filter. If provided, only returns plans for that product.
   *                      If undefined/null, returns all plans (no product filtering).
   */
  async getPlans(
    authToken: string,
    tenantId: string,
    showArchived: boolean = false,
    planType?: string,
    productCode?: string // NEW: Optional product filter
  ): Promise<PricingPlan[]> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Build query parameters
      const params = new URLSearchParams();
      if (showArchived) {
        params.append('showArchived', 'true');
      }
      if (planType) {
        params.append('planType', planType);
      }
      // IMPORTANT: Always pass product_code param to Edge Function
      // Empty string = all products (no filter), specific value = filter by that product
      params.append('product_code', productCode || '');

      const queryString = params.toString();
      const url = `${SUPABASE_URL}/functions/v1/plans${queryString ? '?' + queryString : ''}`;

      console.log(`[businessModelService] Fetching plans from: ${url}`);
      console.log(`[businessModelService] Product filter: ${productCode || 'ALL (no filter)'}`);

      const response = await axios.get(url, {
        headers: {
          Authorization: authToken,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      });

      console.log(`[businessModelService] Fetched ${response.data?.length || 0} plans`);

      return response.data;
    } catch (error) {
      console.error('Error in getPlans service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'getPlans' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Get a specific pricing plan by ID
   */
  async getPlan(authToken: string, tenantId: string, planId: string): Promise<PricingPlan | null> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/plans/${planId}`,
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
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }

      console.error('Error in getPlan service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'getPlan' },
        tenantId,
        planId
      });
      throw error;
    }
  },

  /**
   * Get plan data formatted for editing
   */
  async getPlanForEdit(authToken: string, tenantId: string, planId: string): Promise<any> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/plans/${planId}/edit`,
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
      console.error('Error in getPlanForEdit service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'getPlanForEdit' },
        tenantId,
        planId
      });
      throw error;
    }
  },

  /**
   * Create a new pricing plan
   */
  async createPlan(
    authToken: string,
    tenantId: string,
    planData: CreatePlanRequest
  ): Promise<PricingPlan> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/plans`,
        planData,
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
      console.error('Error in createPlan service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'createPlan' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Update plan by creating new version (edit workflow)
   */
  async updatePlanAsNewVersion(
    authToken: string,
    tenantId: string,
    editData: any
  ): Promise<PricingPlan> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/plans`,
        editData,
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
      console.error('Error in updatePlanAsNewVersion service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'updatePlanAsNewVersion' },
        tenantId,
        planId: editData.plan_id
      });
      throw error;
    }
  },

  /**
   * Update an existing pricing plan
   */
  async updatePlan(
    authToken: string,
    tenantId: string,
    planId: string,
    planData: UpdatePlanRequest
  ): Promise<PricingPlan> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.put(
        `${SUPABASE_URL}/functions/v1/plans/${planId}`,
        planData,
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
      console.error('Error in updatePlan service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'updatePlan' },
        tenantId,
        planId
      });
      throw error;
    }
  },

  /**
   * Toggle plan visibility
   */
  async togglePlanVisibility(
    authToken: string,
    tenantId: string,
    planId: string,
    isVisible: boolean
  ): Promise<PricingPlan> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.put(
        `${SUPABASE_URL}/functions/v1/plans/${planId}/visibility`,
        { is_visible: isVisible },
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
      console.error('Error in togglePlanVisibility service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'togglePlanVisibility' },
        tenantId,
        planId
      });
      throw error;
    }
  },

  /**
   * Archive a pricing plan
   */
  async archivePlan(authToken: string, tenantId: string, planId: string): Promise<PricingPlan> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.put(
        `${SUPABASE_URL}/functions/v1/plans/${planId}/archive`,
        {},
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
      console.error('Error in archivePlan service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'archivePlan' },
        tenantId,
        planId
      });
      throw error;
    }
  },

  /**
   * Get all versions for a plan
   */
  async getPlanVersions(authToken: string, tenantId: string, planId: string): Promise<PlanVersion[]> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/plan-versions?planId=${planId}`,
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
      console.error('Error in getPlanVersions service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'getPlanVersions' },
        tenantId,
        planId
      });
      throw error;
    }
  },

  /**
   * Get a specific plan version
   */
  async getPlanVersion(
    authToken: string,
    tenantId: string,
    versionId: string
  ): Promise<PlanVersion | null> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/plan-versions?versionId=${versionId}`,
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
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }

      console.error('Error in getPlanVersion service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'getPlanVersion' },
        tenantId,
        versionId
      });
      throw error;
    }
  },

  /**
   * Create a new plan version
   * @deprecated Use updatePlanAsNewVersion instead
   */
  async createPlanVersion(
    authToken: string,
    tenantId: string,
    versionData: CreateVersionRequest
  ): Promise<PlanVersion> {
    console.warn('createPlanVersion is deprecated. Use updatePlanAsNewVersion instead.');

    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/plan-versions`,
        versionData,
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
      console.error('Error in createPlanVersion service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'createPlanVersion' },
        tenantId,
        planId: versionData.plan_id
      });
      throw error;
    }
  },

  /**
   * Activate a specific plan version
   */
  async activatePlanVersion(
    authToken: string,
    tenantId: string,
    versionId: string
  ): Promise<PlanVersion> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.put(
        `${SUPABASE_URL}/functions/v1/plan-versions/${versionId}/activate`,
        {},
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
      console.error('Error in activatePlanVersion service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_businessModel', action: 'activatePlanVersion' },
        tenantId,
        versionId
      });
      throw error;
    }
  },

  /**
   * Compare two plan versions
   * @deprecated Comparison feature has been removed
   */
  async compareVersions(
    authToken: string,
    tenantId: string,
    version1Id: string,
    version2Id: string
  ): Promise<VersionComparisonResult> {
    console.warn('compareVersions is deprecated. This feature has been removed.');
    throw new Error('Version comparison feature has been removed');
  }
};
