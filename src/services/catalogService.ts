// src/services/catalogService.ts
// Express API service layer for communicating with Supabase Edge Functions
// CLEAN VERSION - Fixed and aligned with Edge Functions

import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { 
  CATALOG_ITEM_TYPES,
  PRICING_TYPES,
  BILLING_MODES,
  CATALOG_ITEM_STATUS,
  SUPPORTED_CURRENCIES
} from '../utils/constants/catalog';
import type { 
  CatalogItemDetailed,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
  CatalogItemQuery,
  CatalogItemType,
  PricingType,
  CreateMultiCurrencyPricingRequest,
  CatalogPricing,
  PriceAttributes,
  TaxConfig,
  EdgeResponse,
  CatalogListParams,
  CatalogListResponse,
  TenantCurrenciesResponse,
  CatalogPricingDetailsResponse,
  CatalogItemEdge,
  CatalogPricingEdge
} from '../types/catalogTypes';

// =================================================================
// TYPE MAPPINGS FOR API COMMUNICATION
// =================================================================

// Map frontend catalog types to API catalog types
export const CATALOG_TYPE_TO_API: Record<CatalogItemType, number> = {
  [CATALOG_ITEM_TYPES.SERVICE]: 1,
  [CATALOG_ITEM_TYPES.ASSET]: 2,
  [CATALOG_ITEM_TYPES.SPARE_PART]: 3,
  [CATALOG_ITEM_TYPES.EQUIPMENT]: 4
};

// Reverse mapping
export const API_TO_CATALOG_TYPE: Record<number, CatalogItemType> = {
  1: CATALOG_ITEM_TYPES.SERVICE,
  2: CATALOG_ITEM_TYPES.ASSET,
  3: CATALOG_ITEM_TYPES.SPARE_PART,
  4: CATALOG_ITEM_TYPES.EQUIPMENT
};

// Map frontend pricing types to API format
export const PRICING_TYPE_TO_API: Record<PricingType, string> = {
  [PRICING_TYPES.FIXED]: 'Fixed',
  [PRICING_TYPES.UNIT_PRICE]: 'Unit Price',
  [PRICING_TYPES.HOURLY]: 'Hourly',
  [PRICING_TYPES.DAILY]: 'Daily'
};

// Reverse mapping
export const API_TO_PRICING_TYPE: Record<string, PricingType> = {
  'Fixed': PRICING_TYPES.FIXED,
  'Unit Price': PRICING_TYPES.UNIT_PRICE,
  'Hourly': PRICING_TYPES.HOURLY,
  'Daily': PRICING_TYPES.DAILY
};

// =================================================================
// MAIN SERVICE CLASS
// =================================================================

class CatalogService {
  private readonly baseUrl: string;
  private readonly internalSecret: string;
  private readonly supabaseAnonKey: string;

  constructor() {
    this.baseUrl = `${process.env.SUPABASE_URL}/functions/v1/catalog-items`;
    this.internalSecret = process.env.INTERNAL_SIGNING_SECRET || '';
    this.supabaseAnonKey = process.env.SUPABASE_KEY || '';
    
    if (!this.supabaseAnonKey) {
      console.warn('[CatalogService] WARNING: SUPABASE_KEY not set!');
    }
    
    console.log('[CatalogService] Initialized with:');
    console.log(`[CatalogService] Base URL: ${this.baseUrl}`);
    console.log(`[CatalogService] Has anon key: ${!!this.supabaseAnonKey}`);
    console.log(`[CatalogService] Has internal secret: ${!!this.internalSecret}`);
  }

  // =================================================================
  // PRIVATE HELPER METHODS
  // =================================================================

  /**
   * Generate HMAC signature for internal API calls
   */
  private generateSignature(payload: string): string {
    if (!this.internalSecret) {
      console.warn('INTERNAL_SIGNING_SECRET not configured');
      return '';
    }

    const hmac = crypto.createHmac('sha256', this.internalSecret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  /**
   * Handle Edge function response format consistently
   */
  private handleEdgeResponse<T>(response: any): T {
    // Handle Edge function response format
    if (response.success === false) {
      const error = response.error || 'Request failed';
      const errorMessage = typeof error === 'string' ? error : error.message;
      const errorCode = typeof error === 'object' ? error.code : 'UNKNOWN_ERROR';
      
      console.error('[CatalogService] Edge function error:', { code: errorCode, message: errorMessage });
      throw new Error(errorMessage);
    }
    
    // Return data field if exists, otherwise return whole response
    return response.data || response;
  }

  /**
   * Make authenticated request to Edge function with enhanced error handling
   */
  private async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: any,
    headers: Record<string, string> = {},
    retryCount: number = 0
  ): Promise<T> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const body = data ? JSON.stringify(data) : '';
      
      // Build headers
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': this.supabaseAnonKey,
        ...headers
      };

      // Add signature for non-GET requests
      if (method !== 'GET' && this.internalSecret) {
        requestHeaders['x-internal-signature'] = this.generateSignature(body);
        console.log('[CatalogService] Added signature for', method, 'request');
      }

      console.log(`[CatalogService] Making request to: ${method} ${url}`);
      console.log(`[CatalogService] Headers:`, {
        ...requestHeaders,
        Authorization: requestHeaders.Authorization ? `Bearer ${requestHeaders.Authorization.substring(7, 17)}...` : 'None',
        apikey: requestHeaders.apikey ? `${requestHeaders.apikey.substring(0, 10)}...` : 'None',
        hasSignature: !!requestHeaders['x-internal-signature']
      });

      const response = await axios({
        method,
        url,
        data: data || undefined,
        headers: requestHeaders,
        validateStatus: null // Handle all status codes
      });

      console.log(`[CatalogService] Response status: ${response.status}`);
      
      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const resetTime = response.headers['x-ratelimit-reset'];
        const retryAfter = resetTime ? parseInt(resetTime) - Date.now() : 1000 * (retryCount + 1);
        
        if (retryCount < 3) {
          console.log(`[CatalogService] Rate limited, retrying in ${retryAfter}ms (attempt ${retryCount + 1})`);
          await new Promise(resolve => setTimeout(resolve, Math.min(retryAfter, 5000)));
          return this.makeRequest(method, endpoint, data, headers, retryCount + 1);
        } else {
          throw new Error(`Rate limit exceeded. Reset time: ${new Date(parseInt(resetTime)).toISOString()}`);
        }
      }
      
      // Handle non-2xx responses
      if (response.status >= 400) {
        console.error(`[CatalogService] Error response:`, response.data);
        const error = response.data?.error || 'Request failed';
        const message = response.data?.message || '';
        throw new Error(`${error}${message ? `: ${message}` : ''}`);
      }

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error('[CatalogService] Axios error:', error.response?.data || error.message);
        if (error.code === 'ECONNREFUSED') {
          throw new Error('Unable to connect to catalog service');
        }
        throw new Error(error.message);
      }
      throw error;
    }
  }

  /**
   * Transform Edge API response to frontend format
   */
  private transformCatalogItem(apiItem: CatalogItemEdge): CatalogItemDetailed {
    // Handle pricing data
    const pricingList = apiItem.t_tenant_catalog_pricing || [];
    const pricingArray = Array.isArray(pricingList) ? pricingList : [pricingList].filter(Boolean);
    
    // Find base currency pricing
    const basePricing = pricingArray.find((p: CatalogPricingEdge) => p.is_base_currency) || pricingArray[0] || {};
    
    // Get all active currencies
    const currencies = [...new Set(pricingArray.map((p: CatalogPricingEdge) => p.currency))];
    const baseCurrency = pricingArray.find((p: CatalogPricingEdge) => p.is_base_currency)?.currency || currencies[0] || 'INR';
    
    return {
      id: apiItem.catalog_id,
      tenant_id: apiItem.tenant_id,
      is_live: apiItem.is_live !== undefined ? apiItem.is_live : true,
      version_number: apiItem.version || 1,
      is_current_version: apiItem.is_latest || true,
      type: API_TO_CATALOG_TYPE[apiItem.catalog_type] || CATALOG_ITEM_TYPES.SERVICE,
      name: apiItem.name,
      short_description: apiItem.description?.substring(0, 500),
      description_format: 'markdown',
      description_content: apiItem.description,
      terms_format: 'markdown',
      terms_content: apiItem.service_terms,
      is_variant: false,
      variant_attributes: apiItem.attributes || {},
      
      // Price attributes from base pricing
      price_attributes: {
        type: API_TO_PRICING_TYPE[basePricing.price_type] || PRICING_TYPES.FIXED,
        base_amount: basePricing.price || 0,
        currency: basePricing.currency || 'INR',
        billing_mode: BILLING_MODES.MANUAL
      },
      
      // Tax config
      tax_config: {
        use_tenant_default: !basePricing.tax_included,
        specific_tax_rates: basePricing.tax_rate_id ? [basePricing.tax_rate_id] : []
      },
      
      metadata: apiItem.attributes || {},
      specifications: {},
      is_active: apiItem.is_active,
      status: apiItem.is_active ? CATALOG_ITEM_STATUS.ACTIVE : CATALOG_ITEM_STATUS.INACTIVE,
      created_at: apiItem.created_at,
      updated_at: apiItem.updated_at,
      variant_count: 0,
      original_id: apiItem.parent_id || apiItem.catalog_id,
      total_versions: 1,
      
      // Legacy fields for compatibility
      pricing_type: API_TO_PRICING_TYPE[basePricing.price_type] || PRICING_TYPES.FIXED,
      base_amount: basePricing.price || 0,
      currency: basePricing.currency || 'INR',
      billing_mode: BILLING_MODES.MANUAL,
      use_tenant_default_tax: !basePricing.tax_included,
      specific_tax_count: basePricing.tax_rate_id ? 1 : 0,
      environment_label: 'live',
      
      // Multi-currency support
      pricing_list: pricingArray.map(p => ({
        id: p.id,
        catalog_id: p.catalog_id,
        price_type: p.price_type,
        currency: p.currency,
        price: p.price,
        tax_included: p.tax_included,
        tax_rate_id: p.tax_rate_id,
        is_base_currency: p.is_base_currency,
        is_active: p.is_active,
        attributes: p.attributes,
        created_at: p.created_at,
        updated_at: p.updated_at
      })),
      pricing_summary: {
        currencies: currencies,
        base_currency: baseCurrency,
        count: pricingArray.length,
        id: apiItem.catalog_id
      }
    };
  }

  /**
   * Transform frontend data to Edge API format
   */
  private transformToApiFormat(data: CreateCatalogItemRequest | UpdateCatalogItemRequest): any {
    const isCreate = 'type' in data;
    
    const apiData: any = {
      name: data.name,
      description: data.description_content || data.short_description || (data as any).description,
      service_terms: data.terms_content || (data as any).service_terms,
      attributes: {
        ...data.metadata,
        ...data.specifications,
        ...(data.variant_attributes || {}),
        ...((data as any).attributes || {})
      }
    };
    
    // Only include catalog_type for create
    if (isCreate && (data as CreateCatalogItemRequest).type) {
      apiData.catalog_type = CATALOG_TYPE_TO_API[(data as CreateCatalogItemRequest).type];
    }
    
    // Handle pricing if provided (single currency - backward compatibility)
    if (data.price_attributes) {
      apiData.pricing = [{
        price_type: PRICING_TYPE_TO_API[data.price_attributes.type],
        currency: data.price_attributes.currency,
        price: data.price_attributes.base_amount,
        tax_included: !data.tax_config?.use_tenant_default,
        tax_rate_id: data.tax_config?.specific_tax_rates?.[0] || null,
        is_base_currency: true
      }];
    }
    
    // Add existing pricing data if provided (type assertion for backward compatibility)
    const dataWithPricing = data as any;
    if (dataWithPricing.pricing) {
      apiData.pricing = dataWithPricing.pricing;
    }
    
    return apiData;
  }

  // =================================================================
  // PUBLIC API METHODS
  // =================================================================

  /**
   * List catalog items with filtering and pagination
   */
  async listCatalogItems(
    authHeader: string,
    tenantId: string,
    params: CatalogListParams
  ): Promise<CatalogListResponse> {
    const queryParams = new URLSearchParams();
    
    if (params.catalogType) queryParams.append('catalogType', params.catalogType.toString());
    if (params.includeInactive) queryParams.append('includeInactive', 'true');
    if (params.search) queryParams.append('search', params.search);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const endpoint = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const response = await this.makeRequest<EdgeResponse<CatalogListResponse>>(
      'GET',
      endpoint,
      undefined,
      {
        'Authorization': authHeader,
        'x-tenant-id': tenantId
      }
    );

    return this.handleEdgeResponse<CatalogListResponse>(response);
  }

  /**
   * Get single catalog item by ID
   */
  async getCatalogItem(
    authHeader: string,
    tenantId: string,
    catalogId: string
  ): Promise<CatalogItemDetailed> {
    const response = await this.makeRequest<EdgeResponse<CatalogItemEdge>>(
      'GET',
      `/${catalogId}`,
      undefined,
      {
        'Authorization': authHeader,
        'x-tenant-id': tenantId
      }
    );

    const data = this.handleEdgeResponse<CatalogItemEdge>(response);
    return this.transformCatalogItem(data);
  }

  /**
   * Create new catalog item
   */
  async createCatalogItem(
    authHeader: string,
    tenantId: string,
    data: CreateCatalogItemRequest,
    idempotencyKey?: string
  ): Promise<CatalogItemDetailed> {
    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'x-tenant-id': tenantId
    };

    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    const apiData = this.transformToApiFormat(data);

    const response = await this.makeRequest<EdgeResponse<CatalogItemEdge>>(
      'POST',
      '',
      apiData,
      headers
    );

    const responseData = this.handleEdgeResponse<CatalogItemEdge>(response);
    return this.transformCatalogItem(responseData);
  }

  /**
   * Update catalog item (creates new version)
   */
  async updateCatalogItem(
    authHeader: string,
    tenantId: string,
    catalogId: string,
    data: UpdateCatalogItemRequest,
    idempotencyKey?: string
  ): Promise<CatalogItemDetailed> {
    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'x-tenant-id': tenantId
    };

    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    const apiData = this.transformToApiFormat(data);
    
    // Add version reason for updates
    if (data.version_reason) {
      apiData.version_reason = data.version_reason;
    }

    const response = await this.makeRequest<EdgeResponse<CatalogItemEdge>>(
      'PUT',
      `/${catalogId}`,
      apiData,
      headers
    );

    const responseData = this.handleEdgeResponse<CatalogItemEdge>(response);
    return this.transformCatalogItem(responseData);
  }

  /**
   * Soft delete catalog item
   */
  async deleteCatalogItem(
    authHeader: string,
    tenantId: string,
    catalogId: string
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.makeRequest<EdgeResponse<{ success: boolean; message: string }>>(
      'DELETE',
      `/${catalogId}`,
      undefined,
      {
        'Authorization': authHeader,
        'x-tenant-id': tenantId
      }
    );

    return this.handleEdgeResponse<{ success: boolean; message: string }>(response);
  }

  /**
   * Restore deleted catalog item
   */
  async restoreCatalogItem(
    authHeader: string,
    tenantId: string,
    catalogId: string,
    idempotencyKey?: string
  ): Promise<CatalogItemDetailed> {
    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'x-tenant-id': tenantId
    };

    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    const response = await this.makeRequest<EdgeResponse<CatalogItemEdge>>(
      'POST',
      `/restore/${catalogId}`,
      undefined,
      headers
    );

    const data = this.handleEdgeResponse<CatalogItemEdge>(response);
    return this.transformCatalogItem(data);
  }

  /**
   * Get version history for catalog item
   */
  async getVersionHistory(
    authHeader: string,
    tenantId: string,
    catalogId: string
  ): Promise<{
    root: CatalogItemDetailed | null;
    versions: CatalogItemDetailed[];
  }> {
    const response = await this.makeRequest<EdgeResponse<CatalogItemEdge[]>>(
      'GET',
      `/versions/${catalogId}`,
      undefined,
      {
        'Authorization': authHeader,
        'x-tenant-id': tenantId
      }
    );

    const data = this.handleEdgeResponse<CatalogItemEdge[]>(response);
    
    return {
      root: data.length > 0 ? this.transformCatalogItem(data[0]) : null,
      versions: data.map((v: CatalogItemEdge) => this.transformCatalogItem(v))
    };
  }

  // =================================================================
  // MULTI-CURRENCY PRICING METHODS
  // =================================================================

  /**
   * Get tenant currencies
   */
  async getTenantCurrencies(
    authHeader: string,
    tenantId: string
  ): Promise<TenantCurrenciesResponse> {
    const response = await this.makeRequest<EdgeResponse<TenantCurrenciesResponse>>(
      'GET',
      '/multi-currency',
      undefined,
      {
        'Authorization': authHeader,
        'x-tenant-id': tenantId
      }
    );

    return this.handleEdgeResponse<TenantCurrenciesResponse>(response);
  }

  /**
   * Get catalog pricing details
   */
  async getCatalogPricingDetails(
    authHeader: string,
    tenantId: string,
    catalogId: string
  ): Promise<CatalogPricingDetailsResponse> {
    const response = await this.makeRequest<EdgeResponse<CatalogPricingDetailsResponse>>(
      'GET',
      `/multi-currency/${catalogId}`,
      undefined,
      {
        'Authorization': authHeader,
        'x-tenant-id': tenantId
      }
    );

    return this.handleEdgeResponse<CatalogPricingDetailsResponse>(response);
  }

  /**
   * Create/update multi-currency pricing
   */
  async upsertMultiCurrencyPricing(
    authHeader: string,
    tenantId: string,
    catalogId: string,
    pricingData: CreateMultiCurrencyPricingRequest,
    idempotencyKey?: string
  ): Promise<{
    catalog_id: string;
    price_type: string;
    updated_currencies: string[];
    pricing: CatalogPricing[];
  }> {
    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'x-tenant-id': tenantId
    };

    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    // Transform pricing types to API format
    const priceType = PRICING_TYPE_TO_API[pricingData.price_type as keyof typeof PRICING_TYPE_TO_API] || pricingData.price_type;
    
    const apiData = {
      catalog_id: catalogId,
      price_type: priceType,
      currencies: pricingData.currencies.map((curr: any) => ({
        ...curr,
        currency: curr.currency.toUpperCase()
      }))
    };
    
    const response = await this.makeRequest<EdgeResponse<{
      catalog_id: string;
      price_type: string;
      updated_currencies: string[];
      pricing: CatalogPricing[];
    }>>(
      'POST',
      '/multi-currency',
      apiData,
      headers
    );

    return this.handleEdgeResponse(response);
  }

  /**
   * Update single currency pricing
   */
  async updateCurrencyPricing(
    authHeader: string,
    tenantId: string,
    catalogId: string,
    currency: string,
    pricingData: {
      price_type?: string;
      price: number;
      tax_included?: boolean;
      tax_rate_id?: string | null;
      attributes?: Record<string, any>;
    }
  ): Promise<CatalogPricing> {
    const priceType = pricingData.price_type 
      ? PRICING_TYPE_TO_API[pricingData.price_type as keyof typeof PRICING_TYPE_TO_API] || pricingData.price_type
      : 'Fixed';

    const apiData = {
      ...pricingData,
      price_type: priceType
    };

    const response = await this.makeRequest<EdgeResponse<CatalogPricing>>(
      'PUT',
      `/multi-currency/${catalogId}/${currency}`,
      apiData,
      {
        'Authorization': authHeader,
        'x-tenant-id': tenantId
      }
    );

    return this.handleEdgeResponse<CatalogPricing>(response);
  }

  /**
   * Delete specific currency pricing
   */
  async deleteCurrencyPricing(
    authHeader: string,
    tenantId: string,
    catalogId: string,
    currency: string,
    priceType: string = 'Fixed'
  ): Promise<void> {
    const response = await this.makeRequest<EdgeResponse<void>>(
      'DELETE',
      `/multi-currency/${catalogId}/${currency}?price_type=${priceType}`,
      undefined,
      {
        'Authorization': authHeader,
        'x-tenant-id': tenantId
      }
    );

    this.handleEdgeResponse<void>(response);
  }

  // =================================================================
  // BACKWARD COMPATIBILITY METHODS
  // =================================================================

  /**
   * Get catalog pricing - returns multi-currency data
   */
  async getCatalogPricing(
    authHeader: string,
    tenantId: string,
    catalogId: string
  ): Promise<CatalogPricing[]> {
    const response = await this.getCatalogPricingDetails(authHeader, tenantId, catalogId);
    return response.pricing_list || [];
  }

  /**
   * Backward compatibility - single currency pricing
   */
  async upsertPricing(
    authHeader: string,
    tenantId: string,
    catalogId: string,
    pricingData: any,
    idempotencyKey?: string
  ): Promise<CatalogPricing> {
    // Convert to multi-currency format
    const multiCurrencyData: CreateMultiCurrencyPricingRequest = {
      price_type: API_TO_PRICING_TYPE[pricingData.price_type] || PRICING_TYPES.FIXED,
      currencies: [{
        currency: pricingData.currency,
        price: pricingData.price,
        is_base_currency: true,
        tax_included: pricingData.tax_included || false,
        tax_rate_id: pricingData.tax_rate_id || null,
        attributes: pricingData.attributes || {}
      }]
    };
    
    const response = await this.upsertMultiCurrencyPricing(
      authHeader,
      tenantId,
      catalogId,
      multiCurrencyData,
      idempotencyKey
    );
    
    return response.pricing[0];
  }

  // =================================================================
  // VALIDATION METHODS
  // =================================================================

  /**
   * Validate catalog data before sending to Edge function
   */
  validateCatalogData(data: CreateCatalogItemRequest | UpdateCatalogItemRequest): { 
    isValid: boolean; 
    errors: string[] 
  } {
    const errors: string[] = [];

    // Check catalog_type if provided
    if ('catalog_type' in data && data.catalog_type) {
      if (![1, 2, 3, 4].includes(data.catalog_type)) {
        errors.push('Invalid catalog_type. Must be 1 (Service), 2 (Assets), 3 (Spare Parts), or 4 (Equipment)');
      }
    }

    // Check name
    if ('name' in data && data.name !== undefined) {
      if (!data.name || data.name.trim().length === 0) {
        errors.push('Name is required and cannot be empty');
      } else if (data.name.length > 255) {
        errors.push('Name must be 255 characters or less');
      }
    }

    // Check description
    if ('description' in data && data.description !== undefined) {
      if (!data.description || data.description.trim().length === 0) {
        errors.push('Description is required and cannot be empty');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate pricing data
   */
  validatePricingData(data: any): { 
    isValid: boolean; 
    errors: string[] 
  } {
    const errors: string[] = [];

    const validTypes = ['Fixed', 'Unit Price', 'Hourly', 'Daily'];
    if (!data.price_type || !validTypes.includes(data.price_type)) {
      errors.push(`Invalid price_type. Must be one of: ${validTypes.join(', ')}`);
    }

    if (!data.currency || data.currency.length !== 3) {
      errors.push('Currency must be a 3-letter ISO code');
    }

    if (!SUPPORTED_CURRENCIES.includes(data.currency as any)) {
      errors.push(`Currency ${data.currency} is not supported. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
    }

    if (data.price === undefined || data.price === null || isNaN(Number(data.price)) || Number(data.price) < 0) {
      errors.push('Price must be a non-negative number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate multi-currency pricing data
   */
  validateMultiCurrencyPricingData(data: CreateMultiCurrencyPricingRequest): { 
    isValid: boolean; 
    errors: string[] 
  } {
    const errors: string[] = [];

    // Validate price type
    const validTypes = Object.values(PRICING_TYPES);
    if (!data.price_type || !validTypes.includes(data.price_type)) {
      errors.push(`Invalid price_type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate currencies array
    if (!data.currencies || !Array.isArray(data.currencies)) {
      errors.push('Currencies must be an array');
    } else if (data.currencies.length === 0) {
      errors.push('At least one currency is required');
    } else {
      // Check for multiple base currencies
      const baseCurrencies = data.currencies.filter((c: any) => c.is_base_currency);
      if (baseCurrencies.length > 1) {
        errors.push('Only one base currency is allowed');
      }

      // Validate each currency
      data.currencies.forEach((curr: any, index: number) => {
        if (!curr.currency || curr.currency.length !== 3) {
          errors.push(`Currency[${index}]: Must be a 3-letter code`);
        } else if (!SUPPORTED_CURRENCIES.includes(curr.currency.toUpperCase() as any)) {
          errors.push(`Currency[${index}]: ${curr.currency} is not supported`);
        }

        if (curr.price === undefined || curr.price === null || isNaN(Number(curr.price)) || Number(curr.price) < 0) {
          errors.push(`Currency[${index}]: Price must be a non-negative number`);
        }
      });

      // Check for duplicate currencies
      const currencyCodes = data.currencies.map((c: any) => c.currency.toUpperCase());
      const uniqueCurrencies = new Set(currencyCodes);
      if (currencyCodes.length !== uniqueCurrencies.size) {
        errors.push('Duplicate currencies are not allowed');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate idempotency key for operations
   */
  generateIdempotencyKey(operation: string, data: any): string {
    return crypto.randomUUID();
  }
}

// Export singleton instance
export default new CatalogService();