// backend/src/types/groups.ts
// TypeScript interfaces for all group-related data structures

// ============================================
// BUSINESS GROUPS
// ============================================

export interface BusinessGroup {
  id: string;
  group_name: string;
  group_type: 'bbb_chapter' | 'tech_forum' | 'network' | string;
  description: string;
  chapter?: string;
  branch?: string;
  member_count: number;
  settings: GroupSettings;
  admin_tenant_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupSettings {
  chapter?: string;
  branch?: string;
  city?: string;
  state?: string;
  access?: {
    type: 'password' | 'invite' | 'open';
    user_password?: string;
    admin_password?: string;
  };
  profile_fields?: {
    required: string[];
    optional: string[];
    ai_features: string[];
  };
  search_config?: {
    enabled: boolean;
    search_type: 'vector' | 'hybrid' | 'keyword';
    similarity_threshold: number;
    max_results: number;
    cache_enabled: boolean;
    cache_ttl_days: number;
  };
  features?: {
    whatsapp_integration: boolean;
    website_scraping: boolean;
    ai_enhancement: boolean;
    semantic_search: boolean;
    admin_dashboard: boolean;
  };
  onboarding?: {
    generation_methods: string[];
    auto_approve: boolean;
    require_admin_review: boolean;
  };
  whatsapp?: {
    trigger_phrase: string;
    exit_phrase: string;
    bot_enabled: boolean;
  };
  branding?: {
    primary_color: string;
    secondary_color: string;
    logo_url?: string;
  };
  contact?: {
    admin_name: string;
    admin_phone: string;
    support_email: string;
  };
  stats?: {
    founded_date: string;
    target_members: number;
    current_focus: string;
  };
}

// ============================================
// GROUP MEMBERSHIPS
// ============================================

export interface GroupMembership {
  membership_id: string;
  tenant_id: string;
  group_id: string;
  status: 'draft' | 'pending' | 'active' | 'inactive' | 'suspended';
  joined_at: string;
  profile_data: MemberProfileData;
  embedding?: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberProfileData {
  mobile_number?: string;
  member_number?: string;
  generation_method?: 'manual' | 'website';
  short_description?: string;
  ai_enhanced_description?: string;
  website_url?: string;
  website_scraped_data?: {
    title?: string;
    meta_description?: string;
    content_snippets?: string[];
  };
  suggested_keywords?: string[];
  approved_keywords?: string[];
  semantic_tags?: string[];
  last_enhanced_at?: string;
}

export interface MembershipWithProfile extends GroupMembership {
  tenant_profile: {
    business_name: string;
    business_email: string;
    business_phone: string;
    business_whatsapp: string;
    business_whatsapp_country_code: string;
    city: string;
    state_code: string;
    industry_id: string;
    website_url: string;
    logo_url: string;
  };
}

export interface CreateMembershipRequest {
  group_id: string;
  profile_data?: {
    mobile_number?: string;
    member_number?: string;
  };
}

export interface UpdateMembershipRequest {
  profile_data?: Partial<MemberProfileData>;
  status?: 'draft' | 'pending' | 'active' | 'inactive';
}

// ============================================
// SEMANTIC CLUSTERS
// ============================================

export interface SemanticCluster {
  id: string;
  membership_id: string;
  primary_term: string;
  related_terms: string[];
  category: string;
  confidence_score: number;
  cluster_embedding?: number[];
  is_active: boolean;
  created_at: string;
}

// ============================================
// SEARCH
// ============================================

export interface SearchRequest {
  group_id: string;
  query: string;
  limit?: number;
  use_cache?: boolean;
}

export interface SearchResult {
  membership_id: string;
  tenant_id: string;
  business_name: string;
  business_email: string;
  mobile_number: string;
  city: string;
  industry: string;
  profile_snippet: string;
  similarity_score: number;
  match_type: 'vector' | 'keyword' | 'semantic';
  logo_url?: string;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  results_count: number;
  from_cache: boolean;
  search_time_ms: number;
  results: SearchResult[];
}

// ============================================
// AI SEARCH (Intent-based via n8n)
// ============================================

export interface AISearchRequest {
  group_id: string;
  query: string;
  scope?: 'group' | 'tenant' | 'product';
  intent_code?: string;
  user_role?: 'admin' | 'member' | 'guest';
  channel?: 'web' | 'mobile' | 'whatsapp' | 'chatbot' | 'api';
  limit?: number;
  use_cache?: boolean;
  similarity_threshold?: number;
}

export interface AISearchResultItem {
  membership_id: string;
  tenant_id: string;
  group_id: string;
  group_name: string;
  business_name: string;
  business_email: string | null;
  mobile_number: string | null;
  city: string | null;
  industry: string | null;
  profile_snippet: string;
  ai_enhanced_description: string;
  approved_keywords: string[];
  similarity: number;
  similarity_original: number;
  boost_applied: string | null;
  match_type: 'vector' | 'keyword' | 'semantic';
  search_scope: string;
}

export interface AISearchResponse {
  success: boolean;
  from_cache: boolean;
  cache_hit_count?: number;
  results_count: number;
  results: AISearchResultItem[];
  query: string;
  search_scope: string;
  intent_code?: string;
  user_role?: string;
  channel?: string;
  max_results_allowed?: number;
  error?: string;
  denial_reason?: string;
}

// ============================================
// ADMIN
// ============================================

export interface AdminStats {
  total_members: number;
  active_members: number;
  pending_members: number;
  inactive_members: number;
  suspended_members: number;
}

export interface ActivityLog {
  id: string;
  activity_type: string;
  tenant_name: string;
  activity_data: Record<string, any>;
  created_at: string;
}

export interface UpdateMembershipStatusRequest {
  status: 'active' | 'inactive' | 'suspended';
  reason?: string;
}

// ============================================
// PROFILE OPERATIONS (AI)
// ============================================

export interface AIEnhancementRequest {
  membership_id: string;
  short_description: string;
}

export interface AIEnhancementResponse {
  success: boolean;
  ai_enhanced_description: string;
  suggested_keywords: string[];
  processing_time_ms: number;
}

export interface WebsiteScrapingRequest {
  membership_id: string;
  website_url: string;
}

export interface WebsiteScrapingResponse {
  success: boolean;
  ai_enhanced_description: string;
  suggested_keywords: string[];
  scraped_data: {
    title: string;
    meta_description: string;
    content_snippets: string[];
  };
}

export interface GenerateClustersRequest {
  membership_id: string;
  profile_text: string;
  keywords: string[];
}

export interface GenerateClustersResponse {
  success: boolean;
  clusters_generated: number;
  clusters: SemanticCluster[];
}

export interface SaveProfileRequest {
  membership_id: string;
  profile_data: {
    generation_method: 'manual' | 'website';
    short_description: string;
    ai_enhanced_description: string;
    approved_keywords: string[];
    website_url?: string;
    website_scraped_data?: any;
  };
  trigger_embedding: boolean;
}

export interface SaveProfileResponse {
  success: boolean;
  membership_id: string;
  status: string;
  embedding_generated: boolean;
}

// ============================================
// PASSWORD VERIFICATION
// ============================================

export interface VerifyAccessRequest {
  group_id: string;
  password: string;
  access_type: 'user' | 'admin';
}

export interface VerifyAccessResponse {
  success: boolean;
  access_granted: boolean;
  access_level?: 'user' | 'admin';
  group_id?: string;
  group_name?: string;
  redirect_to?: string;
  error?: string;
}

// ============================================
// PAGINATION
// ============================================

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginationResponse {
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

// ============================================
// CHAT SESSION TYPES
// ============================================

export interface ChatSession {
  id: string;
  user_id: string | null;
  tenant_id: string | null;
  channel: string;
  group_id: string | null;
  group_name: string | null;
  intent_state: string;
  current_intent: string | null;
  pending_prompt: string | null;
  message_count: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface ChatInitRequest {
  channel?: string;
}

export interface ChatInitResponse {
  success: boolean;
  message: string;
  available_groups?: {
    group_id: string;
    group_name: string;
    trigger_phrase: string;
  }[];
  intents?: {
    id: string;
    label: string;
    prompt: string;
  }[];
  error?: string;
}

export interface ChatSessionRequest {
  channel?: string;
}

export interface ChatSessionResponse {
  success: boolean;
  session?: ChatSession;
  error?: string;
}

export interface ChatActivateRequest {
  trigger_phrase?: string;
  group_id?: string;
  session_id?: string;
}

export interface ChatActivateResponse {
  success: boolean;
  group_id?: string;
  group_name?: string;
  group_type?: string;
  chat_config?: any;
  message?: string;
  error?: string;
}

export interface ChatIntentRequest {
  session_id: string;
  intent: string;
  prompt?: string;
}

export interface ChatIntentResponse {
  success: boolean;
  session?: ChatSession;
  prompt?: string;
  error?: string;
}

export interface ChatSearchRequest {
  group_id: string;
  query: string;
  session_id?: string;
  intent?: string;
  limit?: number;
  use_cache?: boolean;
  similarity_threshold?: number;
}

export interface ChatSearchResponse {
  success: boolean;
  query?: string;
  results_count?: number;
  from_cache?: boolean;
  cache_hit_count?: number;
  results?: AISearchResultItem[];
  error?: string;
}

export interface ChatEndRequest {
  session_id: string;
}

export interface ChatEndResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================
// COMMON RESPONSE TYPES
// ============================================

export interface ApiSuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string;
  code?: string;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================
// TENANT STATS (Dashboard)
// ============================================

export interface TenantStatsRequest {
  group_id?: string;
}

export interface GroupStat {
  group_id: string;
  group_name: string;
  count: number;
}

export interface IndustryStat {
  industry_id: string;
  industry_name: string;
  count: number;
}

export interface ProfileTypeStat {
  buyers: number;
  sellers: number;
  both: number;
}

export interface TenantStats {
  total_tenants: number;
  by_group: GroupStat[];
  by_industry: IndustryStat[];
  by_profile_type: ProfileTypeStat;
}

export interface TenantStatsResponse {
  success: boolean;
  stats?: TenantStats;
  error?: string;
}

// ============================================
// INTENT DEFINITIONS
// ============================================

export interface IntentDefinition {
  id: string;
  intent_code: string;
  intent_name: string;
  description: string;
  intent_type: 'search' | 'list' | 'filter' | 'action' | 'info';
  default_label: string;
  default_icon: string;
  default_prompt: string;
  requires_ai: boolean;
  cacheable: boolean;
  is_system: boolean;
  default_roles: string[];
  default_channels: string[];
  default_scopes: string[];
  default_max_results: number;
  is_active: boolean;
}

export interface ResolvedIntent {
  intent_code: string;
  label: string;
  icon: string;
  prompt: string;
  intent_type: string;
  requires_ai: boolean;
  cacheable: boolean;
  max_results: number;
  scopes: string[];
}

export interface GetIntentsRequest {
  group_id: string;
  user_role?: string;
  channel?: string;
}

export interface GetIntentsResponse {
  success: boolean;
  intents?: ResolvedIntent[];
  error?: string;
}