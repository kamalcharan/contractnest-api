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

export interface KnowledgeTreeRef {
  resource_template_id: string;
  service_activity?: string;
  variant_id?: string;
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
  is_live?: boolean;
  config: BlockConfig;
  resource_pricing?: ResourcePricingConfig;
  variant_pricing?: VariantPricingConfig;
  form_template_id?: string;
  knowledge_tree_ref?: KnowledgeTreeRef;
  resource_template_id?: string;
  kt_checkpoint_ids?: string[];
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
  is_live?: boolean;
  tenant_id?: string;
  visible?: boolean;
  config: BlockConfig;
  resource_pricing?: ResourcePricingConfig;
  variant_pricing?: VariantPricingConfig;
  form_template_id?: string;
  knowledge_tree_ref?: KnowledgeTreeRef;
  resource_template_id?: string;
  kt_checkpoint_ids?: string[];
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
  is_live?: boolean;
  config?: BlockConfig;
  resource_pricing?: ResourcePricingConfig;
  variant_pricing?: VariantPricingConfig;
  form_template_id?: string;
  knowledge_tree_ref?: KnowledgeTreeRef;
  resource_template_id?: string;
  kt_checkpoint_ids?: string[];
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
  tenant_id?: string | null;
  is_live: boolean;
  name: string;
  display_name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  cover_image?: string | null;
  blocks: TemplateBlock[];
  currency?: string;
  tax_rate?: number;
  discount_config?: Record<string, any>;
  subtotal?: number | null;
  total?: number | null;
  settings?: Record<string, any>;
  is_system: boolean;
  is_public: boolean;
  copied_from_id?: string | null;
  industry_tags?: string[];
  is_active: boolean;
  status_id?: string | null;
  sequence_no?: number;
  is_deletable: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateRequest {
  name: string;
  display_name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  cover_image?: string;
  blocks: TemplateBlock[];
  currency?: string;
  tax_rate?: number;
  discount_config?: Record<string, any>;
  settings?: Record<string, any>;
  industry_tags?: string[];
  is_public?: boolean;
  is_system?: boolean;
  is_active?: boolean;
  status_id?: string;
  sequence_no?: number;
  is_deletable?: boolean;
  created_by?: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  display_name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  cover_image?: string | null;
  blocks?: TemplateBlock[];
  currency?: string;
  tax_rate?: number;
  discount_config?: Record<string, any>;
  settings?: Record<string, any>;
  industry_tags?: string[];
  is_public?: boolean;
  is_active?: boolean;
  status_id?: string;
  sequence_no?: number;
  is_deletable?: boolean;
  updated_by?: string;
  expected_version?: number;
}

export interface CopyTemplateRequest {
  name?: string;
  display_name?: string;
  created_by?: string;
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
  idempotencyKey?: string;
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

/**
 * A plan as a buying tenant sees it. Derived by the edge from the platform
 * tenant's template — limits, grants and flags are read out of the template's
 * metering blocks so the buyer never touches the platform tenant's catalog.
 */
export interface PlanTemplate {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  /** Plan price. 0 is a real value — the Free tier. */
  price: number;
  term: { value: number | null; unit: string | null };
  /** What the plan may CREATE, e.g. { contracts: 3, rfqs: 0 }. 0 is a cap, not "unlimited". */
  limits: Record<string, number>;
  /** Notification credits granted per creation event, keyed by channel. */
  grants: Record<string, number>;
  /** Add-on flags the plan switches on, e.g. addon_vani_ai. */
  flags: string[];
  updated_at: string | null;
}

export interface PlanTemplateListResponse {
  plans: PlanTemplate[];
  count: number;
}

/** What subscribe_tenant_to_plan returns once a tenant is on a plan. */
export interface PlanSubscriptionResult {
  contract_id: string;
  contract_number: string;
  contact_id: string;
  plan_name: string;
  limits: Record<string, number>;
  grants: Record<string, number>;
  flags: string[];
}

export interface IndustryCoverage {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  templateCount: number;
  hasCoverage: boolean;
}

export interface TemplateCoverageSummary {
  totalTemplates: number;
  totalIndustries: number;
  coveredIndustries: number;
  uncoveredIndustries: number;
  coveragePercent: number;
  totalCategories: number;
  publicTemplates: number;
}

export interface TemplateCoverageResponse {
  summary: TemplateCoverageSummary;
  industries: IndustryCoverage[];
  uncovered: Array<{ id: string; name: string; icon: string | null }>;
}

// ============================================
// Query Parameters
// ============================================

export interface BlockQueryParams {
  block_type_id?: string;
  pricing_mode_id?: string;
  is_active?: boolean;
  is_seed?: boolean;
  tags?: string[];
  search?: string;
  page?: number;
  limit?: number;
  resource_template_id?: string;
}

export interface TemplateQueryParams {
  category?: string;
  is_system?: boolean;
  is_public?: boolean;
  is_active?: boolean | 'all';
  industry?: string;
  search?: string;
  page?: number;
  limit?: number;
}
