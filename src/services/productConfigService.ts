// ============================================================================
// Product Config Service
// ============================================================================
// Purpose: HTTP client to call product-config Edge function
// Pattern: API service → Edge function → RPC
// ============================================================================

import axios from 'axios';
import crypto from 'crypto';
import { captureException } from '../utils/sentry';

// Edge function base URL
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const PRODUCT_CONFIG_EDGE_URL = `${SUPABASE_URL}/functions/v1/product-config`;
const INTERNAL_SIGNING_SECRET = process.env.INTERNAL_SIGNING_SECRET || '';
const DEFAULT_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// TYPES
// ============================================================================

export interface PlanType {
  code: string;
  label: string;
  metric?: string;
  description?: string;
}

export interface Feature {
  id: string;
  name: string;
  description?: string;
  type: 'limit' | 'addon' | 'boolean' | 'usage';
  default: number | boolean;
  trial: number | boolean;
  unit?: string;
  base_price?: number;
  unit_price?: number;
  currency?: string;
}

export interface TierTemplate {
  min: number;
  max: number | null;
  label?: string;
  base_price?: number;
}

export interface NotificationConfig {
  channel: string;
  name: string;
  description?: string;
  unit_price: number;
  default_credits: number;
  currency?: string;
}

export interface FreeTierConfig {
  enabled: boolean;
  limits: Record<string, number>;
}

export interface BillingConfig {
  plan_types: PlanType[];
  features: Feature[];
  tier_templates: Record<string, TierTemplate[]>;
  notifications: NotificationConfig[];
  trial_options: number[];
  billing_cycles: string[];
  default_trial_days?: number;
  default_billing_cycle?: string;
  free_tier?: FreeTierConfig;
}

export interface ProductConfig {
  product_code: string;
  product_name: string;
  config_version: string;
  billing_config: BillingConfig;
  is_active: boolean;
  updated_at?: string;
}

export interface ProductConfigSummary {
  product_code: string;
  product_name: string;
  config_version: string;
  is_active: boolean;
  updated_at?: string;
  plan_types?: PlanType[];
  feature_count?: number;
}

export interface ProductConfigHistoryEntry {
  id: string;
  config_version: string;
  changelog?: string;
  created_at: string;
  created_by?: string;
}

export interface ListProductConfigsResponse {
  success: boolean;
  products: ProductConfigSummary[];
  count: number;
}

export interface GetProductConfigResponse {
  success: boolean;
  product_code?: string;
  product_name?: string;
  config_version?: string;
  billing_config?: BillingConfig;
  is_active?: boolean;
  updated_at?: string;
  error?: string;
}

export interface GetProductConfigHistoryResponse {
  success: boolean;
  product_code: string;
  history: ProductConfigHistoryEntry[];
  count: number;
}

export interface UpdateProductConfigRequest {
  billing_config: BillingConfig;
  changelog?: string;
  updated_by?: string;
}

export interface UpdateProductConfigResponse {
  success: boolean;
  message?: string;
  product_code?: string;
  config_version?: string;
  previous_version?: string;
  error?: string;
}

// ============================================================================
// INTERNAL SIGNING SERVICE
// ============================================================================

class InternalSigningService {
  static generateSignature(body: string): string {
    if (!INTERNAL_SIGNING_SECRET) {
      console.warn('⚠️ INTERNAL_SIGNING_SECRET not configured');
      return '';
    }

    try {
      const hmac = crypto.createHmac('sha256', INTERNAL_SIGNING_SECRET);
      hmac.update(body);
      return hmac.digest('hex');
    } catch (error) {
      console.error('🔐 Error generating HMAC signature:', error);
      return '';
    }
  }

  static createSignedHeaders(body: string = ''): Record<string, string> {
    const headers: Record<string, string> = {};

    if (INTERNAL_SIGNING_SECRET) {
      const signature = this.generateSignature(body);
      if (signature) {
        headers['x-internal-signature'] = signature;
      }
    }

    return headers;
  }
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ProductConfigService {
  /**
   * List all active product configurations
   */
  async listProductConfigs(authToken: string): Promise<ListProductConfigsResponse> {
    try {
      const response = await axios.get<ListProductConfigsResponse>(
        PRODUCT_CONFIG_EDGE_URL,
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json',
            ...InternalSigningService.createSignedHeaders()
          },
          timeout: DEFAULT_TIMEOUT
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error in listProductConfigs:', error.message);
      captureException(error, {
        tags: { source: 'product_config_service', action: 'listProductConfigs' }
      });
      throw error;
    }
  }

  /**
   * Get configuration for a specific product
   */
  async getProductConfig(authToken: string, productCode: string): Promise<GetProductConfigResponse> {
    try {
      const response = await axios.get<GetProductConfigResponse>(
        `${PRODUCT_CONFIG_EDGE_URL}/${productCode}`,
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json',
            ...InternalSigningService.createSignedHeaders()
          },
          timeout: DEFAULT_TIMEOUT
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error in getProductConfig:', error.message);
      captureException(error, {
        tags: { source: 'product_config_service', action: 'getProductConfig' },
        extra: { productCode }
      });
      throw error;
    }
  }

  /**
   * Get version history for a product configuration
   */
  async getProductConfigHistory(authToken: string, productCode: string): Promise<GetProductConfigHistoryResponse> {
    try {
      const response = await axios.get<GetProductConfigHistoryResponse>(
        `${PRODUCT_CONFIG_EDGE_URL}/${productCode}/history`,
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json',
            ...InternalSigningService.createSignedHeaders()
          },
          timeout: DEFAULT_TIMEOUT
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error in getProductConfigHistory:', error.message);
      captureException(error, {
        tags: { source: 'product_config_service', action: 'getProductConfigHistory' },
        extra: { productCode }
      });
      throw error;
    }
  }

  /**
   * Update a product configuration
   */
  async updateProductConfig(
    authToken: string,
    productCode: string,
    updateData: UpdateProductConfigRequest
  ): Promise<UpdateProductConfigResponse> {
    try {
      const body = JSON.stringify(updateData);

      const response = await axios.put<UpdateProductConfigResponse>(
        `${PRODUCT_CONFIG_EDGE_URL}/${productCode}`,
        updateData,
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json',
            ...InternalSigningService.createSignedHeaders(body)
          },
          timeout: DEFAULT_TIMEOUT
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error in updateProductConfig:', error.message);
      captureException(error, {
        tags: { source: 'product_config_service', action: 'updateProductConfig' },
        extra: { productCode }
      });
      throw error;
    }
  }
}

// Export singleton instance
export const productConfigService = new ProductConfigService();
