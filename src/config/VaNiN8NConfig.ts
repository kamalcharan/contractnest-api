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

  // Future webhooks (add as needed)
  // GENERATE_CLUSTERS: '/generate-clusters',
  // SEARCH_MEMBERS: '/search-members',
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
  // 'test' maps to 'test', everything else (including undefined) maps to 'production'
  return xEnvironment === 'test' ? 'test' : 'production';
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
};

export default VaNiN8NConfig;
