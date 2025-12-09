// src/config/VaNiN8NConfig.ts
// Centralized n8n webhook configuration for VaNi AI operations
// Single source of truth for all n8n webhook URLs

// =================================================================
// BASE CONFIGURATION
// =================================================================

/**
 * Base URL for n8n instance
 * Set via environment variable: N8N_WEBHOOK_URL
 */
const N8N_BASE_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv1096269.hstgr.cloud';

/**
 * Webhook path prefixes based on environment
 * - test: Uses /webhook-test/ prefix
 * - production: Uses /webhook/ prefix
 */
const WEBHOOK_PREFIX = {
  test: '/webhook-test',
  production: '/webhook',
} as const;

// =================================================================
// WEBHOOK PATHS
// =================================================================

/**
 * All n8n webhook paths (without prefix)
 * Add new paths here as workflows are created
 */
export const N8N_PATHS = {
  // Profile Processing
  PROCESS_PROFILE: '/process-profile',

  // Embedding Generation
  GENERATE_EMBEDDING: '/generate-embedding',

  // Semantic Clusters Generation
  GENERATE_SEMANTIC_CLUSTERS: '/generate-semantic-clusters',

  // AI Search (unified intent-based search)
  AI_SEARCH: '/search',

  // Future webhooks (add as needed)
  // SEND_NOTIFICATION: '/send-notification',
} as const;

// =================================================================
// TYPE DEFINITIONS
// =================================================================

export type N8NPathKey = keyof typeof N8N_PATHS;
export type N8NEnvironment = 'test' | 'production';

// =================================================================
// REQUEST/RESPONSE TYPES FOR n8n WEBHOOKS
// =================================================================

/**
 * Request body for process-profile webhook
 */
export interface N8NProcessProfileRequest {
  type: 'manual' | 'website';
  content?: string;        // For manual type
  websiteUrl?: string;     // For website type
  userId: string;
  groupId: string;
}

/**
 * Success response from process-profile webhook
 */
export interface N8NProcessProfileSuccessResponse {
  status: 'success';
  enhancedContent: string;
  originalContent: string;
  userId: string;
  groupId: string;
  sourceUrl: string;
}

/**
 * Error response from process-profile webhook
 */
export interface N8NProcessProfileErrorResponse {
  status: 'error';
  errorCode: 'WEBSITE_FETCH_FAILED' | 'AI_EXTRACT_FAILED' | 'AI_ENHANCE_FAILED';
  message: string;
  details: string;
  suggestion: string;
  recoverable: boolean;
}

/**
 * Combined response type
 */
export type N8NProcessProfileResponse =
  | N8NProcessProfileSuccessResponse
  | N8NProcessProfileErrorResponse;

// =================================================================
// GENERATE EMBEDDING TYPES
// =================================================================

/**
 * Request body for generate-embedding webhook
 */
export interface N8NGenerateEmbeddingRequest {
  textToEmbed: string;
  membershipId: string;
}

/**
 * Success response from generate-embedding webhook
 */
export interface N8NGenerateEmbeddingSuccessResponse {
  status: 'success';
  embedding: number[];
  dimensions: number;
  membershipId: string;
}

/**
 * Error response from generate-embedding webhook
 */
export interface N8NGenerateEmbeddingErrorResponse {
  status: 'error';
  message: string;
  error?: string;
}

/**
 * Combined embedding response type
 */
export type N8NGenerateEmbeddingResponse =
  | N8NGenerateEmbeddingSuccessResponse
  | N8NGenerateEmbeddingErrorResponse;

// =================================================================
// GENERATE SEMANTIC CLUSTERS TYPES
// =================================================================

/**
 * Request body for generate-semantic-clusters webhook
 */
export interface N8NGenerateClustersRequest {
  membership_id: string;
  profile_text: string;
  keywords?: string[];
  chapter?: string;
}

/**
 * Cluster item in response
 */
export interface N8NClusterItem {
  primary_term: string;
  related_terms: string[];
  category: string;
  confidence_score: number;
}

/**
 * Success response from generate-semantic-clusters webhook
 */
export interface N8NGenerateClustersSuccessResponse {
  status: 'success';
  membership_id: string;
  clusters_generated: number;
  clusters: N8NClusterItem[];
  tokens_used: number;
}

/**
 * Error response from generate-semantic-clusters webhook
 */
export interface N8NGenerateClustersErrorResponse {
  status: 'error';
  errorCode?: string;
  message: string;
  details?: string;
  suggestion?: string;
  membership_id?: string;
  recoverable?: boolean;
  clusters_generated?: number;
}

/**
 * Combined clusters response type
 */
export type N8NGenerateClustersResponse =
  | N8NGenerateClustersSuccessResponse
  | N8NGenerateClustersErrorResponse;

// =================================================================
// AI SEARCH TYPES
// =================================================================

/**
 * Request body for AI search webhook
 * Matches the n8n workflow input format
 */
export interface N8NAISearchRequest {
  query: string;
  group_id: string;
  scope?: 'group' | 'tenant' | 'product';
  intent_code?: string;
  user_role?: 'admin' | 'member' | 'guest';
  channel?: 'web' | 'mobile' | 'whatsapp' | 'chatbot' | 'api';
  limit?: number;
  use_cache?: boolean;
  similarity_threshold?: number;
}

/**
 * Search result item from AI search
 */
export interface N8NAISearchResultItem {
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

/**
 * Success response from AI search webhook
 */
export interface N8NAISearchSuccessResponse {
  success: true;
  status?: 'success';
  from_cache: boolean;
  cache_hit_count?: number;
  results_count: number;
  results: N8NAISearchResultItem[];
  query: string;
  search_scope: string;
  intent_code?: string;
  user_role?: string;
  channel?: string;
  max_results_allowed?: number;
}

/**
 * Error response from AI search webhook
 */
export interface N8NAISearchErrorResponse {
  success: false;
  error: string;
  details?: string;
  denial_reason?: string;
  intent_code?: string;
  user_role?: string;
  channel?: string;
}

/**
 * Combined AI search response type
 */
export type N8NAISearchResponse =
  | N8NAISearchSuccessResponse
  | N8NAISearchErrorResponse;

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * Get the full n8n webhook URL for a given path and environment
 *
 * @param pathKey - Key from N8N_PATHS (e.g., 'PROCESS_PROFILE')
 * @param environment - 'test' or 'production' (derived from x-environment header)
 * @returns Full webhook URL
 *
 * @example
 * getN8NWebhookUrl('PROCESS_PROFILE', 'test')
 * // Returns: https://n8n.srv1096269.hstgr.cloud/webhook-test/process-profile
 *
 * getN8NWebhookUrl('PROCESS_PROFILE', 'production')
 * // Returns: https://n8n.srv1096269.hstgr.cloud/webhook/process-profile
 */
export function getN8NWebhookUrl(
  pathKey: N8NPathKey,
  environment: N8NEnvironment = 'production'
): string {
  const prefix = WEBHOOK_PREFIX[environment];
  const path = N8N_PATHS[pathKey];
  return `${N8N_BASE_URL}${prefix}${path}`;
}

/**
 * Convert x-environment header value to n8n environment
 *
 * @param xEnvironment - Value from x-environment header ('live' | 'test')
 * @returns N8NEnvironment ('production' | 'test')
 */
export function mapEnvironmentToN8N(xEnvironment?: string): N8NEnvironment {
  // 'live' maps to 'production', everything else maps to 'test'
  return xEnvironment === 'live' ? 'production' : 'test';
}

/**
 * Check if n8n response indicates success
 */
export function isN8NSuccess(response: N8NProcessProfileResponse): response is N8NProcessProfileSuccessResponse {
  return response.status === 'success';
}

/**
 * Check if n8n response indicates error
 */
export function isN8NError(response: N8NProcessProfileResponse): response is N8NProcessProfileErrorResponse {
  return response.status === 'error';
}

/**
 * Check if embedding response indicates success
 */
export function isEmbeddingSuccess(response: N8NGenerateEmbeddingResponse): response is N8NGenerateEmbeddingSuccessResponse {
  return response.status === 'success';
}

/**
 * Check if embedding response indicates error
 */
export function isEmbeddingError(response: N8NGenerateEmbeddingResponse): response is N8NGenerateEmbeddingErrorResponse {
  return response.status === 'error';
}

/**
 * Check if clusters response indicates success
 */
export function isClustersSuccess(response: N8NGenerateClustersResponse): response is N8NGenerateClustersSuccessResponse {
  return response.status === 'success';
}

/**
 * Check if clusters response indicates error
 */
export function isClustersError(response: N8NGenerateClustersResponse): response is N8NGenerateClustersErrorResponse {
  return response.status === 'error';
}

/**
 * Check if AI search response indicates success
 */
export function isAISearchSuccess(response: N8NAISearchResponse): response is N8NAISearchSuccessResponse {
  return response.success === true;
}

/**
 * Check if AI search response indicates error
 */
export function isAISearchError(response: N8NAISearchResponse): response is N8NAISearchErrorResponse {
  return response.success === false;
}

// =================================================================
// EXPORTS
// =================================================================

export const VaNiN8NConfig = {
  BASE_URL: N8N_BASE_URL,
  WEBHOOK_PREFIX,
  PATHS: N8N_PATHS,
  getWebhookUrl: getN8NWebhookUrl,
  mapEnvironment: mapEnvironmentToN8N,
  isSuccess: isN8NSuccess,
  isError: isN8NError,
  isEmbeddingSuccess,
  isEmbeddingError,
  isClustersSuccess,
  isClustersError,
  isAISearchSuccess,
  isAISearchError,
};

export default VaNiN8NConfig;
