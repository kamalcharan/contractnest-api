// src/types/clientAssetRegistryTypes.ts
// Domain + Request/Response DTOs for the Client Asset Registry module

// ── Domain Objects ────────────────────────────────────────────────────

export interface ClientAsset {
  id: string;
  tenant_id: string;
  owner_contact_id: string;
  resource_type_id: string;
  asset_type_id: string | null;
  parent_asset_id: string | null;
  template_id: string | null;
  industry_id: string | null;
  name: string;
  code: string | null;
  description: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  criticality: AssetCriticality;
  location: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  warranty_expiry: string | null;
  last_service_date: string | null;
  area_sqft: number | null;
  dimensions: AssetDimensions | null;
  capacity: number | null;
  specifications: Record<string, any>;
  tags: string[];
  image_url: string | null;
  is_active: boolean;
  is_live: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ContractAsset {
  id: string;
  contract_id: string;
  asset_id: string;
  tenant_id: string;
  coverage_type: string | null;
  service_terms: Record<string, any>;
  pricing_override: Record<string, any> | null;
  notes: string | null;
  is_active: boolean;
  is_live: boolean;
  created_at: string;
  updated_at: string;
  asset?: ClientAsset;
}

export interface AssetDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit?: 'ft' | 'm' | 'cm';
}

// ── Enums ─────────────────────────────────────────────────────────────

export type AssetStatus = 'active' | 'inactive' | 'under_repair' | 'decommissioned';
export type AssetCondition = 'good' | 'fair' | 'poor' | 'critical';
export type AssetCriticality = 'low' | 'medium' | 'high' | 'critical';

// ── Request DTOs ──────────────────────────────────────────────────────

export interface CreateAssetRequest {
  owner_contact_id: string;
  resource_type_id: string;
  name: string;
  asset_type_id?: string;
  parent_asset_id?: string;
  template_id?: string;
  industry_id?: string;
  code?: string;
  description?: string;
  status?: AssetStatus;
  condition?: AssetCondition;
  criticality?: AssetCriticality;
  location?: string;
  make?: string;
  model?: string;
  serial_number?: string;
  purchase_date?: string;
  warranty_expiry?: string;
  last_service_date?: string;
  area_sqft?: number;
  dimensions?: AssetDimensions;
  capacity?: number;
  specifications?: Record<string, any>;
  tags?: string[];
  image_url?: string;
  is_live?: boolean;
  created_by?: string;
}

export interface UpdateAssetRequest {
  name?: string;
  code?: string;
  description?: string;
  resource_type_id?: string;
  asset_type_id?: string;
  parent_asset_id?: string;
  template_id?: string;
  industry_id?: string;
  status?: AssetStatus;
  condition?: AssetCondition;
  criticality?: AssetCriticality;
  owner_contact_id?: string;
  location?: string;
  make?: string;
  model?: string;
  serial_number?: string;
  purchase_date?: string;
  warranty_expiry?: string;
  last_service_date?: string;
  area_sqft?: number;
  dimensions?: AssetDimensions;
  capacity?: number;
  specifications?: Record<string, any>;
  tags?: string[];
  image_url?: string;
  is_active?: boolean;
  updated_by?: string;
}

export interface ListAssetsRequest {
  contact_id?: string;
  resource_type_id?: string;
  status?: AssetStatus;
  is_live?: boolean;
  limit?: number;
  offset?: number;
}

export interface LinkContractAssetsRequest {
  contract_id: string;
  assets: Array<{
    asset_id: string;
    coverage_type?: string;
    service_terms?: Record<string, any>;
    pricing_override?: Record<string, any>;
    notes?: string;
  }>;
  is_live?: boolean;
}

// ── Response DTOs ─────────────────────────────────────────────────────

export interface AssetResponse {
  success: boolean;
  data: ClientAsset;
  message?: string;
}

export interface AssetListResponse {
  success: boolean;
  data: ClientAsset[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface ContractAssetsResponse {
  success: boolean;
  data: ContractAsset[];
}

export interface LinkAssetsResponse {
  success: boolean;
  data: ContractAsset[];
  asset_count: number;
}

export interface DeleteAssetResponse {
  success: boolean;
  data: { id: string; name: string };
  message: string;
}
