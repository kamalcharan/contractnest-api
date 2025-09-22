// src/services/blockService.ts
import crypto from 'crypto';

interface BlockCategory {
  id: string;
  created_at: string;
  parent_id: string | null;
  version: number;
  name: string | null;
  description: string | null;
  icon: string | null;
  sort_order: number | null;
  active: boolean | null;
}

interface BlockMaster {
  id: string;
  created_at: string;
  parent_id: string | null;
  version: number;
  category_id: string;
  name: string | null;
  description: string | null;
  icon: string | null;
  node_type: string | null;
  config: any;
  theme_styles: any;
  can_rotate: boolean | null;
  can_resize: boolean | null;
  is_bidirectional: boolean | null;
  icon_names: string[] | null;
  hex_color: string | null;
  border_style: string | null;
  active: boolean | null;
  category?: BlockCategory; // For joined queries
}

interface BlockVariant {
  id: string;
  created_at: string;
  parent_id: string | null;
  version: number;
  block_id: string;
  name: string | null;
  description: string | null;
  node_type: string | null;
  default_config: any;
  active: boolean | null;
  master?: BlockMaster; // For joined queries
}

interface BlockHierarchy extends BlockCategory {
  masters: (BlockMaster & { variants: BlockVariant[] })[];
}

interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
  count?: number;
  summary?: {
    categories: number;
    masters: number;
    variants: number;
  };
  filters?: Record<string, any>;
  masterId?: string;
}

interface GetMastersFilters {
  categoryId?: string;
}

class BlockService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;
  // Add Map for race condition prevention
  private pendingRequests: Map<string, Promise<EdgeFunctionResponse>> = new Map();

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('⚠️ INTERNAL_SIGNING_SECRET environment variable is not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/blocks';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  /**
   * Get all block categories
   */
  async getCategories(
    userJWT: string,
    tenantId: string,
    environment: string = 'test'
  ): Promise<EdgeFunctionResponse<BlockCategory[]>> {
    try {
      const url = `${this.edgeFunctionUrl}/categories`;
      return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
    } catch (error) {
      console.error('Error in getCategories:', error);
      throw new Error('Failed to get block categories');
    }
  }

  /**
   * Get block masters with optional category filter
   */
  async getMasters(
    filters: GetMastersFilters,
    userJWT: string,
    tenantId: string,
    environment: string = 'test'
  ): Promise<EdgeFunctionResponse<BlockMaster[]>> {
    try {
      const queryParams = new URLSearchParams();
      
      if (filters.categoryId) {
        queryParams.append('categoryId', filters.categoryId);
      }

      const url = `${this.edgeFunctionUrl}/masters?${queryParams.toString()}`;
      return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
    } catch (error) {
      console.error('Error in getMasters:', error);
      throw new Error('Failed to get block masters');
    }
  }

  /**
   * Get block variants for a specific master
   */
  async getVariants(
    masterId: string,
    userJWT: string,
    tenantId: string,
    environment: string = 'test'
  ): Promise<EdgeFunctionResponse<BlockVariant[]>> {
    try {
      const url = `${this.edgeFunctionUrl}/masters/${masterId}/variants`;
      return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
    } catch (error) {
      console.error('Error in getVariants:', error);
      throw new Error('Failed to get block variants');
    }
  }

  /**
   * Get complete block hierarchy (categories -> masters -> variants)
   * WITH RACE CONDITION PREVENTION
   */
  async getHierarchy(
    userJWT: string,
    tenantId: string,
    environment: string = 'test'
  ): Promise<EdgeFunctionResponse<BlockHierarchy[]>> {
    // Create cache key for deduplication
    const cacheKey = `hierarchy-${tenantId}-${environment}`;
    
    // Check if request is already pending
    if (this.pendingRequests.has(cacheKey)) {
      console.log(`Returning pending request for: ${cacheKey}`);
      return this.pendingRequests.get(cacheKey)!;
    }

    try {
      const url = `${this.edgeFunctionUrl}/hierarchy`;
      
      // Create the request promise
      const requestPromise = this.makeRequest('GET', url, null, userJWT, tenantId, environment);
      
      // Store in pending requests map
      this.pendingRequests.set(cacheKey, requestPromise);
      
      // Wait for result
      const result = await requestPromise;
      
      return result;
    } catch (error) {
      console.error('Error in getHierarchy:', error);
      throw new Error('Failed to get block hierarchy');
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Get specific block variant details
   */
  async getVariantById(
    variantId: string,
    userJWT: string,
    tenantId: string,
    environment: string = 'test'
  ): Promise<EdgeFunctionResponse<BlockVariant>> {
    try {
      const url = `${this.edgeFunctionUrl}/variant/${variantId}`;
      return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
    } catch (error) {
      console.error('Error in getVariantById:', error);
      throw new Error('Failed to get block variant');
    }
  }

  /**
   * Private method to make HMAC-signed requests to Edge Functions
   * UPDATED with environment support
   */
  private async makeRequest(
    method: string,
    url: string,
    body: any,
    userJWT: string,
    tenantId: string,
    environment: string = 'test'
  ): Promise<EdgeFunctionResponse> {
    try {
      const requestBody = body ? JSON.stringify(body) : '';
      
      // Generate HMAC signature for internal API authentication (only for non-GET)
      let signature = '';
      if (method !== 'GET' && this.internalSigningSecret) {
        signature = this.generateHMACSignature(requestBody);
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userJWT}`, // Forward user JWT
        'x-tenant-id': tenantId,              // Tenant context
        'x-environment': environment          // Environment (live/test)
      };

      // Only add signature header for non-GET requests
      if (method !== 'GET' && this.internalSigningSecret) {
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
      console.log(`Environment: ${environment}, Tenant: ${tenantId}`);

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('Edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

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
   * FIXED to handle both 'masters' and 'blockMasters'
   */
  transformForFrontend(edgeResponse: EdgeFunctionResponse): any {
    if (!edgeResponse.success) {
      return {
        success: false,
        error: edgeResponse.error,
        code: edgeResponse.code
      };
    }

    // Transform block data for frontend
    if (edgeResponse.data) {
      return {
        success: true,
        data: this.transformBlockData(edgeResponse.data),
        count: edgeResponse.count,
        summary: edgeResponse.summary,
        filters: edgeResponse.filters,
        masterId: edgeResponse.masterId,
        message: edgeResponse.message
      };
    }

    return edgeResponse;
  }

  /**
   * Transform block data structure for frontend
   */
  private transformBlockData(data: any): any {
    // If it's an array, transform each item
    if (Array.isArray(data)) {
      return data.map(item => this.transformSingleBlockItem(item));
    }
    
    // If it's a single item, transform it
    return this.transformSingleBlockItem(data);
  }

  /**
   * Transform single block item for frontend consumption
   * FIXED to handle both 'masters' and 'blockMasters' properties
   */
  private transformSingleBlockItem(item: any): any {
    // Base transformation for common fields
    const transformed: any = {
      id: item.id,
      name: item.name,
      description: item.description,
      icon: item.icon,
      active: item.active,
      created_at: item.created_at
    };

    // Category-specific fields
    if (item.sort_order !== undefined) {
      transformed.sort_order = item.sort_order;
    }

    // Master-specific fields
    if (item.category_id) {
      transformed.category_id = item.category_id;
      transformed.node_type = item.node_type;
      transformed.config = item.config;
      transformed.theme_styles = item.theme_styles;
      transformed.can_rotate = item.can_rotate;
      transformed.can_resize = item.can_resize;
      transformed.is_bidirectional = item.is_bidirectional;
      transformed.icon_names = item.icon_names;
      transformed.hex_color = item.hex_color;
      transformed.border_style = item.border_style;
      
      // Include category data if available
      if (item.category) {
        transformed.category = this.transformSingleBlockItem(item.category);
      }
    }

    // Variant-specific fields
    if (item.block_id) {
      transformed.block_id = item.block_id;
      transformed.node_type = item.node_type || transformed.node_type;
      transformed.default_config = item.default_config;
      
      // Include master data if available
      if (item.master) {
        transformed.master = this.transformSingleBlockItem(item.master);
      }
    }

    // Hierarchy-specific fields - FIX: handle both 'masters' and 'blockMasters'
    const mastersData = item.masters || item.blockMasters;
    if (mastersData) {
      // Always normalize to 'masters' for frontend
      transformed.masters = mastersData.map((master: any) => ({
        ...this.transformSingleBlockItem(master),
        variants: master.variants ? master.variants.map((variant: any) => 
          this.transformSingleBlockItem(variant)
        ) : []
      }));
    }

    return transformed;
  }

  /**
   * Get blocks suitable for template builder
   * This method provides additional processing for template building UI
   */
  async getBlocksForTemplateBuilder(
    userJWT: string,
    tenantId: string,
    environment: string = 'test'
  ): Promise<EdgeFunctionResponse> {
    try {
      const hierarchyResponse = await this.getHierarchy(userJWT, tenantId, environment);
      
      if (!hierarchyResponse.success) {
        return hierarchyResponse;
      }

      // Transform and enrich data for template builder
      const enrichedData = this.enrichForTemplateBuilder(hierarchyResponse.data || []);

      return {
        success: true,
        data: enrichedData,
        summary: hierarchyResponse.summary,
        message: 'Blocks prepared for template builder'
      };
    } catch (error) {
      console.error('Error in getBlocksForTemplateBuilder:', error);
      throw new Error('Failed to get blocks for template builder');
    }
  }

  /**
   * Enrich block data specifically for template builder UI
   */
  private enrichForTemplateBuilder(hierarchyData: any[]): any[] {
    return hierarchyData.map(category => ({
      ...category,
      masters: category.masters?.map((master: any) => ({
        ...master,
        variants: master.variants?.map((variant: any) => ({
          ...variant,
          // Add template builder specific metadata
          isAvailable: true,
          maxInstances: this.getMaxInstances(variant.node_type),
          dependencies: this.getBlockDependencies(variant.node_type),
          category: category.name,
          masterName: master.name,
          displayName: `${master.name} - ${variant.name}`,
          searchTerms: this.generateSearchTerms(category.name, master.name, variant.name)
        })) || []
      })) || []
    }));
  }

  /**
   * Get maximum instances allowed for a block type
   */
  private getMaxInstances(nodeType: string | null): number | null {
    // Core blocks typically allow only one instance
    const singleInstanceBlocks = [
      'contact-block',
      'base-details-block',
      'equipment-block',
      'acceptance-block',
      'billing-rules-block',
      'revenue-sharing-block'
    ];

    if (nodeType && singleInstanceBlocks.includes(nodeType)) {
      return 1;
    }

    // Other blocks can have multiple instances
    return null; // null means unlimited
  }

  /**
   * Get block dependencies
   */
  private getBlockDependencies(nodeType: string | null): string[] {
    const dependencies: Record<string, string[]> = {
      'base-details-block': ['contact-block'],
      'equipment-block': ['base-details-block'],
      'service-commitment-block': ['equipment-block'],
      'billing-rules-block': ['service-commitment-block'],
      'legal-clauses-block': ['base-details-block'],
      'acceptance-block': ['base-details-block']
    };

    return dependencies[nodeType || ''] || [];
  }

  /**
   * Generate search terms for block filtering
   */
  private generateSearchTerms(categoryName: string, masterName: string, variantName: string): string[] {
    const terms: string[] = [];
    
    if (categoryName) terms.push(categoryName.toLowerCase());
    if (masterName) terms.push(masterName.toLowerCase());
    if (variantName) terms.push(variantName.toLowerCase());
    
    // Add additional searchable terms based on block type
    const additionalTerms: Record<string, string[]> = {
      'contact': ['party', 'buyer', 'seller', 'client'],
      'service': ['commitment', 'recurring', 'schedule'],
      'billing': ['payment', 'invoice', 'price'],
      'legal': ['terms', 'conditions', 'clause'],
      'equipment': ['asset', 'machine', 'device']
    };

    Object.entries(additionalTerms).forEach(([key, values]) => {
      if (terms.some(term => term.includes(key))) {
        terms.push(...values);
      }
    });

    return [...new Set(terms)]; // Remove duplicates
  }
}

export default BlockService;