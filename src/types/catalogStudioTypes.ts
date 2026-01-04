// backend/src/types/catalogStudioTypes.ts
/**
 * Catalog Studio Types
 * TypeScript interfaces for blocks and templates
 */

// ============================================
// Block Types
// ============================================

export interface ResourcePricingConfig {
  resource_type_id: string;
  unit_price: number;
  min_quantity?: number;
  max_quantity?: number;
  price_type_id?: string;
}

export interface VariantPricingConfig {
  variants: Array<{
    id: string;
    name: string;
    price: number;
    attributes?: Record<string, any>;
  }>;
}

export interface BlockConfig {
  // Common fields
  title?: string;
  subtitle?: string;

  // Service block
  service_name?: string;
  base_price?: number;
  currency_id?: string;

  // Billing block
  payment_terms?: string;
  payment_type_id?: string;
  due_days?: number;

  // Text block
  content?: string;
  rich_text?: boolean;

  // Media blocks (video/image)
  media_url?: string;
  thumbnail_url?: string;
  alt_text?: string;

  // Checklist block
  items?: Array<{
    id: string;
    text: string;
    required: boolean;
    evidence_type_id?: string;
  }>;

  // Document block
  document_url?: string;
  document_name?: string;
  requires_signature?: boolean;

  // Additional config
  [key: string]: any;
}

export interface CatBlock {
  id: string;
  tenant_id?: string;
  name: string;
  description?: string;
  block_type_id: string;
  pricing_mode_id: string;
  is_admin: boolean;
  is_seed?: boolean;
  visible: boolean;
  is_active: boolean;
  config: BlockConfig;
  resource_pricing?: ResourcePricingConfig;
  variant_pricing?: VariantPricingConfig;
  tags?: string[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBlockRequest {
  name: string;
  description?: string;
  block_type_id: string;
  pricing_mode_id: string;
  is_admin?: boolean;
  is_seed?: boolean;
  tenant_id?: string;
  visible?: boolean;
  config: BlockConfig;
  resource_pricing?: ResourcePricingConfig;
  variant_pricing?: VariantPricingConfig;
  tags?: string[];
}

export interface UpdateBlockRequest {
  name?: string;
  description?: string;
  block_type_id?: string;
  pricing_mode_id?: string;
  is_admin?: boolean;
  visible?: boolean;
  is_active?: boolean;
  config?: BlockConfig;
  resource_pricing?: ResourcePricingConfig;
  variant_pricing?: VariantPricingConfig;
  tags?: string[];
}

// ============================================
// Template Types
// ============================================

export interface TemplateBlock {
  block_id: string;
  order: number;
  config_overrides?: Partial<BlockConfig>;
}

export interface CatTemplate {
  id: string;
  tenant_id?: string;
  name: string;
  description?: string;
  blocks: TemplateBlock[];
  is_system: boolean;
  is_public: boolean;
  is_live: boolean;
  status_id: string;
  copied_from_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  blocks: TemplateBlock[];
  is_public?: boolean;
  status_id?: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  blocks?: TemplateBlock[];
  is_public?: boolean;
  status_id?: string;
}

export interface CopyTemplateRequest {
  name?: string;
  description?: string;
}

// ============================================
// API Context Types
// ============================================

export interface RequestContext {
  tenantId: string;
  userId: string;
  product: string;
  isAdmin: boolean;
  environment: 'live' | 'test';
  accessToken: string;
}

// ============================================
// Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface BlockListResponse {
  blocks: CatBlock[];
  total: number;
}

export interface TemplateListResponse {
  templates: CatTemplate[];
  total: number;
}

// ============================================
// Query Parameters
// ============================================

export interface BlockQueryParams {
  block_type_id?: string;
  pricing_mode_id?: string;
  is_active?: boolean;
  tags?: string[];
  search?: string;
  page?: number;
  limit?: number;
}

export interface TemplateQueryParams {
  status_id?: string;
  is_public?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}
