// src/services/productMasterdataService.ts
import crypto from 'crypto';

interface CategoryMaster {
  id: string;
  category_name: string;
  description: string | null;
  sequence_no: number;
  is_active: boolean;
  tenant_id?: string;
  created_at: string;
  updated_at: string;
}

interface CategoryDetail {
  id: string;
  category_id: string;
  detail_name: string;
  detail_value: string;
  description: string | null;
  sequence_no: number;
  is_active: boolean;
  tenant_id?: string;
  created_at: string;
  updated_at: string;
}

interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
  category_info?: {
    id: string;
    name: string;
    description: string | null;
  };
  tenant_id?: string;
  total_count?: number;
}

interface MasterDataResponse {
  success: boolean;
  data?: CategoryDetail[];
  category_info?: {
    id: string;
    name: string;
    description: string | null;
  };
  tenant_id?: string;
  total_count?: number;
  error?: string;
  code?: string;
}

interface CategoryListResponse {
  success: boolean;
  data?: CategoryMaster[];
  total_count?: number;
  tenant_id?: string;
  error?: string;
  code?: string;
}

class ProductMasterdataService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('⚠️ INTERNAL_SIGNING_SECRET environment variable is not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/product-masterdata';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  /**
   * Get global product master data for a specific category
   */
  async getGlobalMasterData(
    categoryName: string,
    isActive: boolean,
    userJWT: string
  ): Promise<MasterDataResponse> {
    try {
      const queryParams = new URLSearchParams({
        category_name: categoryName,
        is_active: isActive.toString()
      });

      const url = `${this.edgeFunctionUrl}/product-masterdata?${queryParams.toString()}`;
      
      console.log(`🔍 Fetching global master data for category: ${categoryName}`);
      
      return await this.makeRequest('GET', url, null, userJWT) as MasterDataResponse;
    } catch (error) {
      console.error('Error in getGlobalMasterData:', error);
      return {
        success: false,
        error: 'Failed to get global master data',
        code: 'SERVICE_ERROR',
        data: []
      };
    }
  }

  /**
   * Get tenant-specific master data for a category
   */
  async getTenantMasterData(
    categoryName: string,
    isActive: boolean,
    userJWT: string,
    tenantId: string
  ): Promise<MasterDataResponse> {
    try {
      const queryParams = new URLSearchParams({
        category_name: categoryName,
        is_active: isActive.toString()
      });

      const url = `${this.edgeFunctionUrl}/tenant-masterdata?${queryParams.toString()}`;
      
      console.log(`🔍 Fetching tenant master data for category: ${categoryName}, tenant: ${tenantId}`);
      
      return await this.makeRequest('GET', url, null, userJWT, tenantId) as MasterDataResponse;
    } catch (error) {
      console.error('Error in getTenantMasterData:', error);
      return {
        success: false,
        error: 'Failed to get tenant master data',
        code: 'SERVICE_ERROR',
        data: []
      };
    }
  }

  /**
   * Get all global categories
   */
  async getAllGlobalCategories(
    isActive: boolean,
    userJWT: string
  ): Promise<CategoryListResponse> {
    try {
      const queryParams = new URLSearchParams({
        is_active: isActive.toString()
      });

      const url = `${this.edgeFunctionUrl}/all-global-categories?${queryParams.toString()}`;
      
      console.log(`🔍 Fetching all global categories`);
      
      return await this.makeRequest('GET', url, null, userJWT) as CategoryListResponse;
    } catch (error) {
      console.error('Error in getAllGlobalCategories:', error);
      return {
        success: false,
        error: 'Failed to get all global categories',
        code: 'SERVICE_ERROR',
        data: []
      };
    }
  }

  /**
   * Get all tenant categories
   */
  async getAllTenantCategories(
    isActive: boolean,
    userJWT: string,
    tenantId: string
  ): Promise<CategoryListResponse> {
    try {
      const queryParams = new URLSearchParams({
        is_active: isActive.toString()
      });

      const url = `${this.edgeFunctionUrl}/all-tenant-categories?${queryParams.toString()}`;
      
      console.log(`🔍 Fetching all tenant categories for tenant: ${tenantId}`);
      
      return await this.makeRequest('GET', url, null, userJWT, tenantId) as CategoryListResponse;
    } catch (error) {
      console.error('Error in getAllTenantCategories:', error);
      return {
        success: false,
        error: 'Failed to get all tenant categories',
        code: 'SERVICE_ERROR',
        data: []
      };
    }
  }

  /**
   * Health check for the edge function
   */
  async healthCheck(): Promise<{ edge_function_healthy: boolean }> {
    try {
      // Simple health check - try to fetch constants
      const url = `${this.edgeFunctionUrl}/all-global-categories?is_active=true`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return { edge_function_healthy: response.ok };
    } catch (error) {
      console.error('Health check failed:', error);
      return { edge_function_healthy: false };
    }
  }

  /**
   * Private method to make HMAC-signed requests to Edge Functions
   */
  private async makeRequest(
    method: string,
    url: string,
    body: any,
    userJWT: string,
    tenantId?: string
  ): Promise<EdgeFunctionResponse> {
    try {
      const requestBody = body ? JSON.stringify(body) : '';
      
      // Generate HMAC signature for internal API authentication
      const signature = this.generateHMACSignature(requestBody);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userJWT}` // Forward user JWT
      };

      // Add tenant ID if provided
      if (tenantId) {
        headers['x-tenant-id'] = tenantId;
      }

      // Only add signature header if we have a signing secret
      if (this.internalSigningSecret) {
        headers['x-internal-signature'] = signature;
      }

      const requestOptions: RequestInit = {
        method,
        headers
      };

      if (body) {
        requestOptions.body = requestBody;
      }

      console.log(`Making ${method} request to: ${url}`);

      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        console.error(`Edge function responded with status: ${response.status}`);
        
        // Try to parse error response
        try {
          const errorData = await response.json();
          console.error('Edge function error:', errorData);
          return {
            success: false,
            error: errorData.error || 'Edge function request failed',
            code: errorData.code || 'EDGE_FUNCTION_ERROR'
          };
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          return {
            success: false,
            error: `Edge function request failed with status ${response.status}`,
            code: 'EDGE_FUNCTION_ERROR'
          };
        }
      }

      const responseData = await response.json();
      console.log(`✅ Edge function response received successfully`);
      
      return responseData;
    } catch (error) {
      console.error('Network error in makeRequest:', error);
      return {
        success: false,
        error: 'Network error occurred',
        code: 'NETWORK_ERROR'
      };
    }
  }

  /**
   * Generate HMAC signature for internal API authentication
   */
  private generateHMACSignature(payload: string): string {
    if (!this.internalSigningSecret) {
      console.warn('⚠️ Cannot generate HMAC signature: INTERNAL_SIGNING_SECRET not set');
      return '';
    }

    try {
      return crypto
        .createHmac('sha256', this.internalSigningSecret)
        .update(payload)
        .digest('hex');
    } catch (error) {
      console.error('Error generating HMAC signature:', error);
      return '';
    }
  }

  /**
   * Transform Edge Function response for frontend consumption
   */
  transformForFrontend(edgeResponse: EdgeFunctionResponse): any {
    if (!edgeResponse.success) {
      return {
        success: false,
        error: edgeResponse.error,
        code: edgeResponse.code,
        timestamp: new Date().toISOString()
      };
    }

    // Transform master data response
    const transformed: any = {
      success: true,
      data: this.transformMasterData(edgeResponse.data || []),
      timestamp: new Date().toISOString()
    };

    // Add category info if available
    if (edgeResponse.category_info) {
      transformed.category_info = edgeResponse.category_info;
    }

    // Add tenant ID if available
    if (edgeResponse.tenant_id) {
      transformed.tenant_id = edgeResponse.tenant_id;
    }

    // Add total count if available
    if (edgeResponse.total_count !== undefined) {
      transformed.total_count = edgeResponse.total_count;
    }

    // Add message if available
    if (edgeResponse.message) {
      transformed.message = edgeResponse.message;
    }

    return transformed;
  }

  /**
   * Transform master data for frontend consumption
   */
  private transformMasterData(data: any[]): any[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map(item => ({
      id: item.id,
      category_id: item.category_id,
      detail_name: item.detail_name,
      detail_value: item.detail_value,
      description: item.description,
      sequence_no: item.sequence_no,
      is_active: item.is_active,
      tenant_id: item.tenant_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      // Add any additional frontend-specific fields
      display_name: item.detail_name || item.detail_value,
      is_selectable: item.is_active
    }));
  }

  /**
   * Get master data with caching (if needed later)
   */
  async getMasterDataWithCache(
    categoryName: string,
    isActive: boolean,
    userJWT: string,
    tenantId?: string,
    cacheKey?: string
  ): Promise<MasterDataResponse> {
    // For now, directly call the appropriate method
    // Can add caching logic here later if needed
    
    if (tenantId) {
      return await this.getTenantMasterData(categoryName, isActive, userJWT, tenantId);
    } else {
      return await this.getGlobalMasterData(categoryName, isActive, userJWT);
    }
  }

  /**
   * Validate category name format
   */
  validateCategoryName(categoryName: string): { valid: boolean; error?: string } {
    if (!categoryName) {
      return { valid: false, error: 'Category name is required' };
    }

    if (typeof categoryName !== 'string') {
      return { valid: false, error: 'Category name must be a string' };
    }

    if (categoryName.length < 2) {
      return { valid: false, error: 'Category name must be at least 2 characters long' };
    }

    if (categoryName.length > 100) {
      return { valid: false, error: 'Category name must be less than 100 characters' };
    }

    // Check for valid characters (alphanumeric, underscore, hyphen)
    if (!/^[a-zA-Z0-9_-]+$/.test(categoryName)) {
      return { valid: false, error: 'Category name can only contain letters, numbers, underscores, and hyphens' };
    }

    return { valid: true };
  }
}

export default ProductMasterdataService;