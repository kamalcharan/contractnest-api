// src/types/catalogTypes.ts
// Type exports for catalog service compatibility

// REMOVED problematic import - defining everything directly

// Type aliases for string literals (matching constants)
export type CatalogItemType = 'service' | 'equipment' | 'spare_part' | 'asset';
export type PricingType = 'fixed' | 'unit_price' | 'hourly' | 'daily';

// Base catalog pricing interface (defined directly since import was failing)
export interface CatalogPricing {
  id?: string;
  catalog_id: string;
  price_type: string;
  currency: string;
  price: number;
  is_base_currency?: boolean;
  tax_included?: boolean;
  tax_rate_id?: string | null;
  attributes?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

// Multi-currency pricing request (defined directly)
export interface CreateMultiCurrencyPricingRequest {
  price_type: PricingType;
  currencies: Array<{
    currency: string;
    price: number;
    is_base_currency?: boolean;
    tax_included?: boolean;
    tax_rate_id?: string | null;
    attributes?: Record<string, any>;
  }>;
}

// FIXED: Added missing interfaces that were causing TypeScript errors
export interface PriceAttributes {
  type: PricingType;
  base_amount: number;
  currency: string;
  billing_mode: 'manual' | 'automatic';
}

export interface TaxConfig {
  use_tenant_default: boolean;
  specific_tax_rates?: string[];
}

// Complete catalog item interface (not extending base to avoid property conflicts)
export interface CatalogItemDetailed {
  // Core identification
  id: string;
  tenant_id: string;
  
  // Version and status
  is_live: boolean;
  version_number: number;
  is_current_version: boolean;
  is_active: boolean;
  status: string;
  
  // Basic info
  type: CatalogItemType;
  name: string;
  short_description?: string;
  description_format?: string;
  description_content?: string;
  is_variant: boolean;
  variant_attributes: Record<string, any>;
  
  // Pricing
  price_attributes: {
    type: PricingType;
    base_amount: number;
    currency: string;
    billing_mode: string;
  };
  
  // Tax
  tax_config: {
    use_tenant_default: boolean;
    specific_tax_rates: string[];
  };
  
  // Metadata
  metadata: Record<string, any>;
  specifications: Record<string, any>;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  
  // Hierarchy
  variant_count: number;
  original_id: string;
  total_versions: number;
  
  // Legacy compatibility
  pricing_type: PricingType;
  base_amount: number;
  currency: string;
  billing_mode: string;
  use_tenant_default_tax: boolean;
  specific_tax_count: number;
  environment_label: string;
  
  // Multi-currency support
  pricing_list?: CatalogPricing[];
  pricing_summary?: {
    currencies: string[];
    base_currency: string;
    count: number;
    id: string;
  };
}

// FIXED: Added missing properties to request interfaces
export interface CreateCatalogItemRequest {
  type: CatalogItemType;
  name: string;
  description: string;
  catalog_type?: number;
  description_content?: string;
  short_description?: string;
  terms_content?: string;
  metadata?: Record<string, any>;
  specifications?: Record<string, any>;
  variant_attributes?: Record<string, any>;
  service_terms?: string;
  attributes?: Record<string, any>;
  pricing?: any[];
  price_attributes?: PriceAttributes; // FIXED: Added missing property
  tax_config?: TaxConfig; // FIXED: Added missing property
}

export interface UpdateCatalogItemRequest {
  name?: string;
  description?: string;
  description_content?: string;
  short_description?: string;
  terms_content?: string;
  service_terms?: string;
  metadata?: Record<string, any>;
  specifications?: Record<string, any>;
  variant_attributes?: Record<string, any>;
  attributes?: Record<string, any>;
  pricing?: any[];
  price_attributes?: PriceAttributes; // FIXED: Added missing property
  tax_config?: TaxConfig; // FIXED: Added missing property
  version_reason?: string; // FIXED: Added missing property
}

// FIXED: Added missing version history response interface
export interface VersionHistoryResponse {
  root: CatalogItemDetailed | null; // FIXED: Allow null return
  versions: CatalogItemDetailed[];
}

export interface CatalogItemQuery {
  filters?: any;
  sort?: any[];
  pagination?: {
    page: number;
    limit: number;
  };
}

// Re-export types (no longer needed since we defined them directly)
// export type CreateMultiCurrencyPricingRequest = MCPRequest;
// export type { CatalogPricing };

export enum CatalogType {
  SERVICE = 1,
  ASSETS = 2,
  SPARE_PARTS = 3,
  EQUIPMENT = 4
}

export enum PriceType {
  FIXED = 'Fixed',
  UNIT_PRICE = 'Unit Price',
  HOURLY = 'Hourly',
  DAILY = 'Daily'
}

export interface CreateCatalogRequest {
  catalog_type: CatalogType;
  name: string;
  description: string;
  service_terms?: string;
  attributes?: Record<string, any>;
  pricing?: CreatePricingRequest[];
}

export interface UpdateCatalogRequest {
  catalog_type?: CatalogType;
  name?: string;
  description?: string;
  service_terms?: string;
  attributes?: Record<string, any>;
  pricing?: CreatePricingRequest[];
}

export interface CreatePricingRequest {
  price_type: PriceType;
  currency: string;
  price: number;
  tax_included?: boolean;
  tax_rate_id?: string;
  attributes?: Record<string, any>;
}

export interface CatalogListParams {
  catalogType?: CatalogType;
  includeInactive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 50,
  MAX_LIMIT: 100
} as const;

export function isCatalogType(value: any): value is CatalogType {
  return [1, 2, 3, 4].includes(value);
}