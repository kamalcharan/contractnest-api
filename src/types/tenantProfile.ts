// src/types/tenantProfile.ts

export interface TenantProfileBase {
  business_type_id: string;
  industry_id: string;
  business_name: string;
  logo_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state_code?: string | null;
  country_code?: string | null;
  postal_code?: string | null;
  business_phone_country_code?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  website_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

export interface TenantProfileCreate extends TenantProfileBase {
  tenant_id: string;
}

export interface TenantProfileResponse extends TenantProfileBase {
  id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export interface TenantProfileUpdate extends Partial<TenantProfileBase> {
  tenant_id: string;
}

export interface LogoUploadResponse {
  url: string;
}

// =========================================================================
// Served Industries Types
// =========================================================================

export interface ServedIndustry {
  id: string;
  industry_id: string;
  added_by: string | null;
  created_at: string;
  industry: {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    is_active: boolean;
    sort_order: number;
    parent_id: string | null;
    level: number | null;
    segment_type: string | null;
  } | null;
}

export interface ServedIndustriesResponse {
  success: boolean;
  data: ServedIndustry[];
}

export interface AddServedIndustriesRequest {
  industry_ids: string[];
}

export interface AddServedIndustriesResponse {
  success: boolean;
  data: ServedIndustry[];
  added_count: number;
}

export interface RemoveServedIndustryResponse {
  success: boolean;
  removed_industry_id: string;
}

export interface UnlockPreviewByIndustry {
  industry_id: string;
  template_count: number;
  recommended_count: number;
  sample_templates: string[];
}

export interface UnlockPreviewByResourceType {
  resource_type_id: string;
  template_count: number;
  sample_templates: string[];
}

export interface UnlockPreviewResponse {
  success: boolean;
  data: {
    total_templates: number;
    by_industry: UnlockPreviewByIndustry[];
    by_resource_type: UnlockPreviewByResourceType[];
  };
}