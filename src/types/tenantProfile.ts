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