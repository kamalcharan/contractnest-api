// backend/src/services/groupsService.ts
// Service layer for all group operations - calls groups Edge Function
// AI operations (enhance, scrape) now route to n8n webhooks

import axios, { AxiosError } from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';
import {
  VaNiN8NConfig,
  type N8NProcessProfileRequest,
  type N8NProcessProfileResponse,
  type N8NGenerateEmbeddingRequest,
  type N8NGenerateEmbeddingResponse,
  type N8NGenerateClustersRequest,
  type N8NGenerateClustersResponse,
  type N8NAISearchRequest,
  type N8NAISearchResponse,
  type N8NAIAgentRequest,
  type N8NAIAgentResponse,
  type AIAgentChannel,
} from '../config/VaNiN8NConfig';
import type {
  BusinessGroup,
  GroupMembership,
  MembershipWithProfile,
  CreateMembershipRequest,
  UpdateMembershipRequest,
  SearchRequest,
  SearchResponse,
  AISearchRequest,
  AISearchResponse,
  AIEnhancementRequest,
  AIEnhancementResponse,
  WebsiteScrapingRequest,
  WebsiteScrapingResponse,
  GenerateClustersRequest,
  GenerateClustersResponse,
  SaveProfileRequest,
  SaveProfileResponse,
  VerifyAccessRequest,
  VerifyAccessResponse,
  AdminStats,
  ActivityLog,
  UpdateMembershipStatusRequest,
  PaginationParams,
  PaginationResponse
} from '../types/groups';

// ============================================
// Base Configuration
// ============================================
const GROUPS_API_BASE = `${SUPABASE_URL}/functions/v1/groups`;

// Internal API key for API-to-Edge communication
const INTERNAL_API_SECRET = process.env.INTERNAL_SIGNING_SECRET || '';

const getHeaders = (authToken: string, tenantId?: string) => ({
  'Authorization': authToken,
  'Content-Type': 'application/json',
  ...(tenantId && { 'x-tenant-id': tenantId })
});

// Headers for chat routes that require internal key authentication
// Default to 'live' environment for n8n webhook routing
const getChatHeaders = (authToken: string, environment: string = 'live') => ({
  'Authorization': authToken,
  'Content-Type': 'application/json',
  'x-internal-key': INTERNAL_API_SECRET,
  'x-environment': environment
});

// ============================================
// Shared Internal Functions (Phase 2 Refactor)
// Used by both Groups and SmartProfile methods
// ============================================

type EntityType = 'membership' | 'tenant';

interface EnhanceProfileParams {
  entityType: EntityType;
  entityId: string;
  shortDescription: string;
  environment?: string;
}

interface ScrapeWebsiteParams {
  entityType: EntityType;
  entityId: string;
  websiteUrl: string;
  environment?: string;
}

interface GenerateClustersParams {
  entityType: EntityType;
  entityId: string;
  profileText: string;
  keywords?: string[];
  environment?: string;
}

/**
 * Shared internal function for AI profile enhancement
 * Used by both enhanceProfile (Groups) and enhanceSmartProfile (SmartProfile)
 */
async function _enhanceProfileInternal(params: EnhanceProfileParams): Promise<any> {
  const { entityType, entityId, shortDescription, environment } = params;
  const label = entityType === 'membership' ? 'VaNi' : 'SmartProfile';

  try {
    const n8nEnv = VaNiN8NConfig.mapEnvironment(environment);
    const n8nUrl = VaNiN8NConfig.getWebhookUrl('PROCESS_PROFILE', n8nEnv);

    console.log(`🤖 ${label}: Calling n8n enhance profile [${n8nEnv}]:`, n8nUrl);

    const n8nRequest: N8NProcessProfileRequest = {
      type: 'manual',
      content: shortDescription,
      userId: entityId,
      groupId: entityId,
    };

    const response = await axios.post<N8NProcessProfileResponse>(
      n8nUrl,
      n8nRequest,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );

    const n8nData = Array.isArray(response.data) ? response.data[0] : response.data;

    if (VaNiN8NConfig.isError(n8nData)) {
      console.error(`🤖 ${label}: n8n returned error:`, n8nData);
      throw new Error(n8nData.message || 'AI enhancement failed');
    }

    const successResponse = n8nData as N8NProcessProfileResponse & { status: 'success' };
    return {
      success: true,
      ai_enhanced_description: successResponse.enhancedContent,
      original_description: shortDescription,
      suggested_keywords: [],
      source: 'n8n'
    };
  } catch (error: any) {
    console.error(`Error in _enhanceProfileInternal (${entityType}):`, error);

    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      throw new Error('AI enhancement timed out. Please try again.');
    }

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'groupsService', action: 'enhanceProfile', entityType, via: 'n8n' },
      extra: { entityId }
    });
    throw error;
  }
}

/**
 * Shared internal function for website scraping
 * Used by both scrapeWebsite (Groups) and scrapeWebsiteForSmartProfile (SmartProfile)
 */
async function _scrapeWebsiteInternal(params: ScrapeWebsiteParams): Promise<any> {
  const { entityType, entityId, websiteUrl, environment } = params;
  const label = entityType === 'membership' ? 'VaNi' : 'SmartProfile';

  try {
    const n8nEnv = VaNiN8NConfig.mapEnvironment(environment);
    const n8nUrl = VaNiN8NConfig.getWebhookUrl('PROCESS_PROFILE', n8nEnv);

    console.log(`🤖 ${label}: Calling n8n scrape website [${n8nEnv}]:`, n8nUrl);

    const n8nRequest: N8NProcessProfileRequest = {
      type: 'website',
      websiteUrl: websiteUrl,
      userId: entityId,
      groupId: entityId,
    };

    const response = await axios.post<N8NProcessProfileResponse>(
      n8nUrl,
      n8nRequest,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 90000
      }
    );

    const n8nData = Array.isArray(response.data) ? response.data[0] : response.data;

    if (VaNiN8NConfig.isError(n8nData)) {
      const errorResponse = n8nData;
      console.error(`🤖 ${label}: n8n returned error:`, errorResponse);

      if (errorResponse.errorCode === 'WEBSITE_FETCH_FAILED') {
        throw new Error(errorResponse.suggestion || 'Unable to access website. Please check the URL.');
      }
      throw new Error(errorResponse.message || 'Website scraping failed');
    }

    const successResponse = n8nData as N8NProcessProfileResponse & { status: 'success' };
    return {
      success: true,
      ai_enhanced_description: successResponse.enhancedContent,
      original_description: successResponse.originalContent,
      source_url: websiteUrl,
      suggested_keywords: [],
      scraped_data: {
        title: '',
        meta_description: '',
        content_snippets: [successResponse.originalContent],
      },
      source: 'n8n'
    };
  } catch (error: any) {
    console.error(`Error in _scrapeWebsiteInternal (${entityType}):`, error);

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Website scraping timed out. Please try again.');
      }
      if (error.response?.status === 400 && error.response?.data?.suggestion) {
        throw new Error(error.response.data.suggestion);
      }
    }

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'groupsService', action: 'scrapeWebsite', entityType, via: 'n8n' },
      extra: { entityId, websiteUrl }
    });
    throw error;
  }
}

/**
 * Shared internal function for semantic cluster generation
 * Used by both generateClusters (Groups) and generateSmartProfileClusters (SmartProfile)
 */
async function _generateClustersInternal(params: GenerateClustersParams): Promise<any> {
  const { entityType, entityId, profileText, keywords, environment } = params;
  const label = entityType === 'membership' ? 'VaNi' : 'SmartProfile';

  try {
    const n8nEnv = VaNiN8NConfig.mapEnvironment(environment);
    const n8nUrl = VaNiN8NConfig.getWebhookUrl('GENERATE_SEMANTIC_CLUSTERS', n8nEnv);

    console.log(`🤖 ${label}: Calling n8n generate-semantic-clusters [${n8nEnv}]:`, n8nUrl);

    const n8nRequest: N8NGenerateClustersRequest = {
      membership_id: entityId,
      profile_text: profileText,
      keywords: keywords || [],
    };

    const response = await axios.post<N8NGenerateClustersResponse>(
      n8nUrl,
      n8nRequest,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );

    const n8nData = Array.isArray(response.data) ? response.data[0] : response.data;

    if (VaNiN8NConfig.isClustersError(n8nData)) {
      console.error(`🤖 ${label}: n8n returned error:`, n8nData);
      throw new Error(n8nData.message || 'Cluster generation failed');
    }

    const successResponse = n8nData as N8NGenerateClustersResponse & { status: 'success' };

    // Return with appropriate ID field based on entity type
    const idField = entityType === 'membership' ? 'membership_id' : 'tenant_id';

    return {
      success: true,
      clusters_generated: successResponse.clusters_generated,
      clusters: successResponse.clusters.map((cluster, index) => ({
        id: `temp-${entityId}-${index}`,
        [idField]: entityId,
        primary_term: cluster.primary_term,
        related_terms: cluster.related_terms,
        category: cluster.category,
        confidence_score: cluster.confidence_score,
        is_active: true,
        created_at: new Date().toISOString(),
      })),
    };
  } catch (error: any) {
    console.error(`Error in _generateClustersInternal (${entityType}):`, error);

    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      throw new Error('Cluster generation timed out. Please try again.');
    }

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'groupsService', action: 'generateClusters', entityType, via: 'n8n' },
      extra: { entityId }
    });
    throw error;
  }
}

// ============================================
// Service Implementation
// ============================================
export const groupsService = {
  
  // ============================================
  // GROUPS OPERATIONS
  // ============================================
  
  /**
   * Get all business groups (optionally filter by type)
   */
  async getGroups(
    authToken: string,
    groupType?: 'bbb_chapter' | 'tech_forum' | 'all'
  ): Promise<BusinessGroup[]> {
    try {
      const url = groupType 
        ? `${GROUPS_API_BASE}?group_type=${groupType}`
        : GROUPS_API_BASE;
      
      const response = await axios.get(url, {
        headers: getHeaders(authToken)
      });
      
      return response.data.groups;
    } catch (error) {
      console.error('Error in getGroups:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'getGroups' }
      });
      throw error;
    }
  },

  /**
   * Get specific group details by ID
   */
  async getGroup(
    authToken: string,
    groupId: string
  ): Promise<BusinessGroup> {
    try {
      const response = await axios.get(`${GROUPS_API_BASE}/${groupId}`, {
        headers: getHeaders(authToken)
      });
      
      return response.data.group;
    } catch (error) {
      console.error('Error in getGroup:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'getGroup' },
        extra: { groupId }
      });
      throw error;
    }
  },

  /**
   * Verify group access password
   */
  async verifyGroupAccess(
    authToken: string,
    request: VerifyAccessRequest
  ): Promise<VerifyAccessResponse> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/verify-access`,
        request,
        {
          headers: getHeaders(authToken)
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in verifyGroupAccess:', error);
      
      // Don't capture 401 errors (invalid password) in Sentry
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return {
          success: false,
          access_granted: false,
          error: 'Invalid password'
        };
      }
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'verifyGroupAccess' },
        extra: { groupId: request.group_id, accessType: request.access_type }
      });
      throw error;
    }
  },

  // ============================================
  // MEMBERSHIP OPERATIONS
  // ============================================

  /**
   * Create new membership (join group)
   */
  async createMembership(
    authToken: string,
    tenantId: string,
    request: CreateMembershipRequest
  ): Promise<GroupMembership> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/memberships`,
        request,
        {
          headers: getHeaders(authToken, tenantId)
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in createMembership:', error);

      // Handle duplicate membership (409 Conflict) - try to get existing membership_id
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        let membershipId = error.response?.data?.membership_id;

        // If Edge Function didn't return membership_id, try to query for it
        if (!membershipId) {
          try {
            console.log('🔍 Querying for existing membership...');
            const membershipsResponse = await axios.get(
              `${GROUPS_API_BASE}/memberships/group/${request.group_id}?status=all`,
              { headers: getHeaders(authToken, tenantId) }
            );
            // Find the membership for this tenant
            const existingMembership = membershipsResponse.data.memberships?.find(
              (m: any) => m.tenant_id === tenantId
            );
            if (existingMembership) {
              membershipId = existingMembership.id;
              console.log('✅ Found existing membership:', membershipId);
            }
          } catch (queryError) {
            console.error('Failed to query existing membership:', queryError);
          }
        }

        const customError = new Error('You are already a member of this group') as Error & { membership_id?: string };
        customError.membership_id = membershipId;
        throw customError;
      }

      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'createMembership' },
        extra: { tenantId, groupId: request.group_id }
      });
      throw error;
    }
  },

  /**
   * Get membership with tenant profile
   */
  async getMembership(
    authToken: string,
    membershipId: string
  ): Promise<MembershipWithProfile> {
    try {
      const response = await axios.get(
        `${GROUPS_API_BASE}/memberships/${membershipId}`,
        {
          headers: getHeaders(authToken)
        }
      );
      
      return response.data.membership;
    } catch (error) {
      console.error('Error in getMembership:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'getMembership' },
        extra: { membershipId }
      });
      throw error;
    }
  },

  /**
   * Update membership profile data
   */
  async updateMembership(
    authToken: string,
    membershipId: string,
    updates: UpdateMembershipRequest
  ): Promise<{ membership_id: string; updated_fields: string[]; profile_data: any }> {
    try {
      const response = await axios.put(
        `${GROUPS_API_BASE}/memberships/${membershipId}`,
        updates,
        {
          headers: getHeaders(authToken)
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in updateMembership:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'updateMembership' },
        extra: { membershipId, updates }
      });
      throw error;
    }
  },

  /**
   * Get all memberships for a group (admin)
   */
  async getGroupMemberships(
    authToken: string,
    groupId: string,
    options?: {
      status?: 'all' | 'active' | 'pending' | 'inactive';
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    memberships: any[];
    pagination: PaginationResponse;
  }> {
    try {
      const params = new URLSearchParams();
      if (options?.status) params.append('status', options.status);
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.offset) params.append('offset', options.offset.toString());

      const response = await axios.get(
        `${GROUPS_API_BASE}/memberships/group/${groupId}?${params.toString()}`,
        {
          headers: getHeaders(authToken)
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in getGroupMemberships:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'getGroupMemberships' },
        extra: { groupId, options }
      });
      throw error;
    }
  },

  /**
   * Delete membership (soft delete)
   */
  async deleteMembership(
    authToken: string,
    membershipId: string
  ): Promise<{ success: boolean; membership_id: string }> {
    try {
      const response = await axios.delete(
        `${GROUPS_API_BASE}/memberships/${membershipId}`,
        {
          headers: getHeaders(authToken)
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in deleteMembership:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'deleteMembership' },
        extra: { membershipId }
      });
      throw error;
    }
  },

  // ============================================
  // PROFILE OPERATIONS (AI)
  // ============================================

  /**
   * Enhance profile description with AI
   * Routes to n8n webhook for AI processing
   *
   * @param authToken - Auth token (used for logging/tracking)
   * @param request - Enhancement request with membership_id and short_description
   * @param environment - 'live' or 'test' from x-environment header
   */
  async enhanceProfile(
    authToken: string,
    request: AIEnhancementRequest,
    environment?: string
  ): Promise<AIEnhancementResponse> {
    // Use shared internal function
    const result = await _enhanceProfileInternal({
      entityType: 'membership',
      entityId: request.membership_id,
      shortDescription: request.short_description,
      environment
    });

    // Map to AIEnhancementResponse format
    return {
      success: result.success,
      ai_enhanced_description: result.ai_enhanced_description,
      suggested_keywords: result.suggested_keywords,
      processing_time_ms: 0,
    };
  },

  /**
   * Scrape website and generate profile
   * Routes to n8n webhook for website scraping + AI processing
   *
   * @param authToken - Auth token (used for logging/tracking)
   * @param request - Scraping request with membership_id and website_url
   * @param environment - 'live' or 'test' from x-environment header
   */
  async scrapeWebsite(
    authToken: string,
    request: WebsiteScrapingRequest,
    environment?: string
  ): Promise<WebsiteScrapingResponse> {
    // Use shared internal function
    const result = await _scrapeWebsiteInternal({
      entityType: 'membership',
      entityId: request.membership_id,
      websiteUrl: request.website_url,
      environment
    });

    // Map to WebsiteScrapingResponse format
    return {
      success: result.success,
      ai_enhanced_description: result.ai_enhanced_description,
      suggested_keywords: result.suggested_keywords,
      scraped_data: result.scraped_data,
    };
  },

  /**
   * Generate semantic clusters via n8n webhook
   * Routes to n8n webhook for AI-powered cluster generation
   *
   * @param authToken - Auth token (used for logging/tracking)
   * @param request - Cluster generation request with membership_id and profile_text
   * @param environment - 'live' or 'test' from x-environment header
   */
  async generateClusters(
    authToken: string,
    request: GenerateClustersRequest,
    environment?: string
  ): Promise<GenerateClustersResponse> {
    // Use shared internal function
    const result = await _generateClustersInternal({
      entityType: 'membership',
      entityId: request.membership_id,
      profileText: request.profile_text,
      keywords: request.keywords,
      environment
    });

    return result;
  },

  /**
   * Save profile and optionally generate embedding via n8n
   *
   * @param authToken - Auth token for Edge Function
   * @param request - Save profile request with profile_data and trigger_embedding flag
   * @param environment - 'live' or 'test' from x-environment header (for n8n routing)
   * @param businessContext - Optional business context for embedding (business_name, industry, city)
   */
  async saveProfile(
    authToken: string,
    request: SaveProfileRequest,
    environment?: string,
    businessContext?: {
      business_name?: string;
      industry?: string;
      city?: string;
    }
  ): Promise<SaveProfileResponse> {
    try {
      let embedding: number[] | undefined;

      // Generate embedding via n8n if requested
      if (request.trigger_embedding) {
        console.log('🤖 VaNi: Generating embedding for profile...');

        // Construct text for embedding from profile data + business context
        const textParts: string[] = [];

        if (businessContext?.business_name) {
          textParts.push(businessContext.business_name);
        }
        if (businessContext?.industry) {
          textParts.push(businessContext.industry);
        }
        if (businessContext?.city) {
          textParts.push(businessContext.city);
        }
        if (request.profile_data.ai_enhanced_description) {
          textParts.push(request.profile_data.ai_enhanced_description);
        }
        if (request.profile_data.approved_keywords?.length > 0) {
          textParts.push(`Keywords: ${request.profile_data.approved_keywords.join(', ')}`);
        }

        const textToEmbed = textParts.join(' | ');

        if (textToEmbed.trim()) {
          // Map to n8n environment (live → production, test → test)
          const n8nEnv = VaNiN8NConfig.mapEnvironment(environment);
          const n8nUrl = VaNiN8NConfig.getWebhookUrl('GENERATE_EMBEDDING', n8nEnv);

          console.log(`🤖 VaNi: Calling n8n generate-embedding [${n8nEnv}]:`, n8nUrl);

          const n8nRequest: N8NGenerateEmbeddingRequest = {
            textToEmbed,
            membershipId: request.membership_id,
          };

          try {
            const embeddingResponse = await axios.post<N8NGenerateEmbeddingResponse>(
              n8nUrl,
              n8nRequest,
              {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000 // 30s timeout for embedding generation
              }
            );

            // n8n may return an array - unwrap if needed
            const n8nData = Array.isArray(embeddingResponse.data)
              ? embeddingResponse.data[0]
              : embeddingResponse.data;

            if (VaNiN8NConfig.isEmbeddingSuccess(n8nData)) {
              embedding = n8nData.embedding;
              console.log(`🤖 VaNi: Embedding generated successfully (${n8nData.dimensions} dimensions)`);
            } else {
              // Log error but don't fail the save - embedding can be regenerated later
              console.error('🤖 VaNi: Embedding generation failed:', n8nData.message);
            }
          } catch (embeddingError) {
            // Log error but don't fail the save - embedding can be regenerated later
            console.error('🤖 VaNi: Embedding API call failed:', embeddingError);
          }
        } else {
          console.warn('🤖 VaNi: No text available for embedding generation');
        }
      }

      // Save profile to Edge Function (with embedding if generated)
      const saveRequest = {
        ...request,
        embedding, // Include embedding if generated (undefined if not)
      };

      const response = await axios.post(
        `${GROUPS_API_BASE}/profiles/save`,
        saveRequest,
        {
          headers: getHeaders(authToken),
          timeout: 30000
        }
      );

      return {
        ...response.data,
        embedding_generated: !!embedding,
      };
    } catch (error) {
      console.error('Error in saveProfile:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'saveProfile' },
        extra: { membershipId: request.membership_id }
      });
      throw error;
    }
  },

  // ============================================
  // SEARCH
  // ============================================

  /**
   * Search group directory (legacy - uses Edge Function)
   */
  async search(
    authToken: string,
    request: SearchRequest
  ): Promise<SearchResponse> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/search`,
        request,
        {
          headers: getHeaders(authToken),
          timeout: 15000 // 15s timeout
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in search:', error);

      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        throw new Error('Search timed out. Please try again.');
      }

      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'search' },
        extra: { request }
      });
      throw error;
    }
  },

  /**
   * AI Search - Intent-based search via n8n
   * Routes to n8n webhook for AI-powered vector search with RBAC
   *
   * @param authToken - Auth token (used for logging/tracking)
   * @param request - AI search request with intent, scope, channel
   * @param environment - 'live' or 'test' from x-environment header
   */
  async aiSearch(
    authToken: string,
    request: AISearchRequest,
    environment?: string
  ): Promise<AISearchResponse> {
    try {
      // Map to n8n environment (live → production, test → test)
      const n8nEnv = VaNiN8NConfig.mapEnvironment(environment);
      const n8nUrl = VaNiN8NConfig.getWebhookUrl('AI_SEARCH', n8nEnv);

      console.log(`🤖 VaNi: Calling n8n AI search [${n8nEnv}]:`, n8nUrl);

      // Transform request to n8n format
      const n8nRequest: N8NAISearchRequest = {
        query: request.query,
        group_id: request.group_id,
        scope: request.scope || 'group',
        intent_code: request.intent_code || 'search_offering',
        user_role: request.user_role || 'member',
        channel: request.channel || 'web',
        limit: request.limit || 10,
        use_cache: request.use_cache !== false,
        similarity_threshold: request.similarity_threshold || 0.7,
      };

      const response = await axios.post<N8NAISearchResponse>(
        n8nUrl,
        n8nRequest,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000 // 30s timeout for AI search
        }
      );

      // n8n may return an array - unwrap if needed
      const n8nData = Array.isArray(response.data) ? response.data[0] : response.data;

      // Check for n8n error response
      if (VaNiN8NConfig.isAISearchError(n8nData)) {
        console.error('🤖 VaNi: n8n AI search returned error:', n8nData);
        return {
          success: false,
          from_cache: false,
          results_count: 0,
          results: [],
          query: request.query,
          search_scope: request.scope || 'group',
          error: n8nData.error,
          denial_reason: n8nData.denial_reason,
          intent_code: n8nData.intent_code,
          user_role: n8nData.user_role,
          channel: n8nData.channel,
        };
      }

      // Transform n8n success response to expected format
      const successResponse = n8nData as N8NAISearchResponse & { success: true };
      return {
        success: true,
        from_cache: successResponse.from_cache,
        cache_hit_count: successResponse.cache_hit_count,
        results_count: successResponse.results_count,
        results: successResponse.results,
        query: successResponse.query || request.query,
        search_scope: successResponse.search_scope || request.scope || 'group',
        intent_code: successResponse.intent_code,
        user_role: successResponse.user_role,
        channel: successResponse.channel,
        max_results_allowed: successResponse.max_results_allowed,
      };
    } catch (error) {
      console.error('Error in aiSearch:', error);

      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        throw new Error('AI search timed out. Please try again.');
      }

      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'aiSearch', via: 'n8n' },
        extra: { request }
      });
      throw error;
    }
  },

  // ============================================
  // ADMIN
  // ============================================

  /**
   * Get admin dashboard stats
   */
  async getAdminStats(
    authToken: string,
    groupId: string
  ): Promise<{ stats: AdminStats; recent_activity: ActivityLog[] }> {
    try {
      const response = await axios.get(
        `${GROUPS_API_BASE}/admin/stats/${groupId}`,
        {
          headers: getHeaders(authToken)
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in getAdminStats:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'getAdminStats' },
        extra: { groupId }
      });
      throw error;
    }
  },

  /**
   * Update membership status (admin)
   */
  async updateMembershipStatus(
    authToken: string,
    membershipId: string,
    request: UpdateMembershipStatusRequest
  ): Promise<{ 
    success: boolean; 
    membership_id: string; 
    old_status: string; 
    new_status: string 
  }> {
    try {
      const response = await axios.put(
        `${GROUPS_API_BASE}/admin/memberships/${membershipId}/status`,
        request,
        {
          headers: getHeaders(authToken)
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in updateMembershipStatus:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'updateMembershipStatus' },
        extra: { membershipId, status: request.status }
      });
      throw error;
    }
  },

  /**
   * Get activity logs (admin)
   */
  async getActivityLogs(
    authToken: string,
    groupId: string,
    options?: {
      activity_type?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ logs: ActivityLog[]; pagination: any }> {
    try {
      const params = new URLSearchParams();
      if (options?.activity_type) params.append('activity_type', options.activity_type);
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.offset) params.append('offset', options.offset.toString());

      const response = await axios.get(
        `${GROUPS_API_BASE}/admin/activity-logs/${groupId}?${params.toString()}`,
        {
          headers: getHeaders(authToken)
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in getActivityLogs:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'getActivityLogs' },
        extra: { groupId, options }
      });
      throw error;
    }
  },

  // ============================================
  // CLUSTER CRUD OPERATIONS
  // ============================================

  /**
   * Save semantic clusters for a membership
   */
  async saveClusters(
    authToken: string,
    request: { membership_id: string; clusters: any[] }
  ): Promise<{ success: boolean; membership_id: string; clusters_saved: number }> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/profiles/clusters`,
        request,
        {
          headers: getHeaders(authToken),
          timeout: 30000
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in saveClusters:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'saveClusters' },
        extra: { membershipId: request.membership_id }
      });
      throw error;
    }
  },

  /**
   * Get semantic clusters for a membership
   */
  async getClusters(
    authToken: string,
    membershipId: string
  ): Promise<{ success: boolean; membership_id: string; clusters: any[] }> {
    try {
      const response = await axios.get(
        `${GROUPS_API_BASE}/profiles/clusters/${membershipId}`,
        {
          headers: getHeaders(authToken)
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in getClusters:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'getClusters' },
        extra: { membershipId }
      });
      throw error;
    }
  },

  /**
   * Delete semantic clusters for a membership
   */
  async deleteClusters(
    authToken: string,
    membershipId: string
  ): Promise<{ success: boolean; membership_id: string }> {
    try {
      const response = await axios.delete(
        `${GROUPS_API_BASE}/profiles/clusters/${membershipId}`,
        {
          headers: getHeaders(authToken)
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in deleteClusters:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'deleteClusters' },
        extra: { membershipId }
      });
      throw error;
    }
  },

  // ============================================
  // CHAT SESSION OPERATIONS
  // Proxies to Edge Function /chat/* endpoints
  // ============================================

  /**
   * Initialize chat - get VaNi intro message
   */
  async chatInit(
    authToken: string,
    channel: string = 'web'
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/chat/init`,
        { channel },
        { headers: getChatHeaders(authToken) }
      );
      return response.data;
    } catch (error) {
      console.error('Error in chatInit:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'chatInit' }
      });
      throw error;
    }
  },

  /**
   * Get or create chat session
   */
  async chatSession(
    authToken: string,
    channel: string = 'web'
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/chat/session`,
        { channel },
        { headers: getChatHeaders(authToken) }
      );
      return response.data;
    } catch (error) {
      console.error('Error in chatSession:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'chatSession' }
      });
      throw error;
    }
  },

  /**
   * Get session by ID
   */
  async chatSessionById(
    authToken: string,
    sessionId: string
  ): Promise<any> {
    try {
      const response = await axios.get(
        `${GROUPS_API_BASE}/chat/session/${sessionId}`,
        { headers: getChatHeaders(authToken) }
      );
      return response.data;
    } catch (error) {
      console.error('Error in chatSessionById:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'chatSessionById' },
        extra: { sessionId }
      });
      throw error;
    }
  },

  /**
   * Activate group in chat session
   */
  async chatActivate(
    authToken: string,
    request: { trigger_phrase?: string; group_id?: string; session_id?: string }
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/chat/activate`,
        request,
        { headers: getChatHeaders(authToken) }
      );
      return response.data;
    } catch (error) {
      console.error('Error in chatActivate:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'chatActivate' }
      });
      throw error;
    }
  },

  /**
   * Set intent in chat session
   */
  async chatIntent(
    authToken: string,
    request: { session_id: string; intent: string; prompt?: string }
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/chat/intent`,
        request,
        { headers: getChatHeaders(authToken) }
      );
      return response.data;
    } catch (error) {
      console.error('Error in chatIntent:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'chatIntent' }
      });
      throw error;
    }
  },

  /**
   * AI-powered search with caching (via Edge Function -> n8n)
   */
  async chatSearch(
    authToken: string,
    request: {
      group_id: string;
      query: string;
      session_id?: string;
      intent?: string;
      limit?: number;
      use_cache?: boolean;
      similarity_threshold?: number;
    }
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/chat/search`,
        request,
        { headers: getChatHeaders(authToken) }
      );
      return response.data;
    } catch (error) {
      console.error('Error in chatSearch:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'chatSearch' }
      });
      throw error;
    }
  },

  /**
   * End chat session
   */
  async chatEnd(
    authToken: string,
    sessionId: string
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/chat/end`,
        { session_id: sessionId },
        { headers: getChatHeaders(authToken) }
      );
      return response.data;
    } catch (error) {
      console.error('Error in chatEnd:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'chatEnd' }
      });
      throw error;
    }
  },

  // ============================================
  // SMARTPROFILES (Tenant-level AI profiles)
  // ============================================

  /**
   * Get SmartProfile for a tenant
   */
  async getSmartProfile(authToken: string, tenantId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${GROUPS_API_BASE}/smartprofiles/${tenantId}`,
        {
          headers: getHeaders(authToken, tenantId)
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error in getSmartProfile:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'getSmartProfile' },
        extra: { tenantId }
      });
      throw error;
    }
  },

  /**
   * Save SmartProfile (basic save without AI generation)
   */
  async saveSmartProfile(
    authToken: string,
    tenantId: string,
    profileData: {
      short_description?: string;
      ai_enhanced_description?: string;
      approved_keywords?: string[];
      profile_type?: string;
      website_url?: string;
      generation_method?: 'manual' | 'website';
    }
  ): Promise<any> {
    try {
      console.log('📝 groupsService.saveSmartProfile sending to Edge:', {
        tenantId,
        hasEnhancedDesc: !!profileData.ai_enhanced_description,
        enhancedDescLength: profileData.ai_enhanced_description?.length || 0
      });

      const response = await axios.post(
        `${GROUPS_API_BASE}/smartprofiles`,
        { tenant_id: tenantId, ...profileData },
        {
          headers: getHeaders(authToken, tenantId)
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error in saveSmartProfile:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'saveSmartProfile' },
        extra: { tenantId }
      });
      throw error;
    }
  },

  /**
   * Generate SmartProfile via n8n (AI enhancement + embedding)
   */
  async generateSmartProfile(
    authToken: string,
    tenantId: string,
    environment?: string
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/smartprofiles/generate`,
        { tenant_id: tenantId },
        {
          headers: {
            ...getHeaders(authToken, tenantId),
            'x-environment': environment || 'live'
          },
          timeout: 60000
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error in generateSmartProfile:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'generateSmartProfile' },
        extra: { tenantId }
      });
      throw error;
    }
  },

  /**
   * Search SmartProfiles via n8n
   */
  async searchSmartProfiles(
    authToken: string,
    request: {
      query: string;
      scope?: 'tenant' | 'group' | 'product';
      group_id?: string;
      tenant_id?: string;
      limit?: number;
      use_cache?: boolean;
    },
    environment?: string
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/smartprofiles/search`,
        request,
        {
          headers: {
            ...getHeaders(authToken, request.tenant_id),
            'x-environment': environment || 'live'
          },
          timeout: 30000
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error in searchSmartProfiles:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'searchSmartProfiles' },
        extra: { query: request.query, scope: request.scope }
      });
      throw error;
    }
  },

  // SmartProfile wizard methods - using shared internal functions

  /**
   * Enhance SmartProfile description with AI via n8n
   * Uses shared _enhanceProfileInternal function
   */
  async enhanceSmartProfile(authToken: string, tenantId: string, shortDescription: string, environment?: string): Promise<any> {
    // Use shared internal function with tenant entity type
    return _enhanceProfileInternal({
      entityType: 'tenant',
      entityId: tenantId,
      shortDescription,
      environment
    });
  },

  /**
   * Scrape website for SmartProfile via n8n
   * Uses shared _scrapeWebsiteInternal function
   */
  async scrapeWebsiteForSmartProfile(authToken: string, tenantId: string, websiteUrl: string, environment?: string): Promise<any> {
    // Use shared internal function with tenant entity type
    return _scrapeWebsiteInternal({
      entityType: 'tenant',
      entityId: tenantId,
      websiteUrl,
      environment
    });
  },

  /**
   * Generate semantic clusters for SmartProfile via n8n
   * Uses shared _generateClustersInternal function
   */
  async generateSmartProfileClusters(authToken: string, tenantId: string, profileText: string, keywords?: string[], environment?: string): Promise<any> {
    // Use shared internal function with tenant entity type
    return _generateClustersInternal({
      entityType: 'tenant',
      entityId: tenantId,
      profileText,
      keywords,
      environment
    });
  },

  async saveSmartProfileClusters(authToken: string, tenantId: string, clusters: any[]): Promise<any> {
    try {
      const response = await axios.post(`${GROUPS_API_BASE}/smartprofiles/clusters`, { tenant_id: tenantId, clusters }, { headers: getHeaders(authToken, tenantId), timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error in saveSmartProfileClusters:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'groupsService', action: 'saveSmartProfileClusters' } });
      throw error;
    }
  },

  async getSmartProfileClusters(authToken: string, tenantId: string): Promise<any> {
    try {
      const response = await axios.get(`${GROUPS_API_BASE}/smartprofiles/clusters/${tenantId}`, { headers: getHeaders(authToken, tenantId), timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error in getSmartProfileClusters:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'groupsService', action: 'getSmartProfileClusters' } });
      throw error;
    }
  },

  // Tenant Dashboard methods
  async getTenantStats(authToken: string, groupId?: string): Promise<any> {
    try {
      const response = await axios.post(`${GROUPS_API_BASE}/tenants/stats`, { group_id: groupId }, { headers: getHeaders(authToken), timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error in getTenantStats:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'groupsService', action: 'getTenantStats' } });
      throw error;
    }
  },

  async searchTenants(authToken: string, request: { query: string; group_id?: string; intent_code?: string }, environment?: string): Promise<any> {
    try {
      const response = await axios.post(`${GROUPS_API_BASE}/tenants/search`, request, { headers: { ...getHeaders(authToken), 'x-environment': environment || 'live' }, timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.error('Error in searchTenants:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'groupsService', action: 'searchTenants' } });
      throw error;
    }
  },

  // ============================================
  // AI AGENT - Conversational Group Discovery
  // Calls N8N webhook for AI-powered chat
  // ============================================

  /**
   * Send message to AI Agent via N8N webhook
   * Supports chat, whatsapp, and web channels
   *
   * @param request - AI Agent request containing message, channel, and user identifier
   * @param environment - 'live' or 'test' for N8N routing
   * @returns AI Agent response with message and optional search results
   */
  async aiAgentMessage(
    request: {
      message: string;
      channel: AIAgentChannel;
      user_id?: string;
      phone?: string;
      group_id?: string;
      tenant_id?: string;
    },
    environment?: string
  ): Promise<N8NAIAgentResponse> {
    try {
      const n8nEnv = VaNiN8NConfig.mapEnvironment(environment);
      const n8nUrl = VaNiN8NConfig.getWebhookUrl('AI_AGENT', n8nEnv);

      console.log(`🤖 AI Agent: Calling N8N webhook [${n8nEnv}]:`, n8nUrl);
      console.log(`🤖 AI Agent: Request:`, {
        channel: request.channel,
        message: request.message.substring(0, 50) + '...',
        hasUserId: !!request.user_id,
        hasPhone: !!request.phone,
        groupId: request.group_id
      });

      const n8nRequest: N8NAIAgentRequest = {
        message: request.message,
        channel: request.channel,
        ...(request.user_id && { user_id: request.user_id }),
        ...(request.phone && { phone: request.phone }),
        ...(request.group_id && { group_id: request.group_id }),
        ...(request.tenant_id && { tenant_id: request.tenant_id }),
      };

      const response = await axios.post<N8NAIAgentResponse>(
        n8nUrl,
        n8nRequest,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 90000 // 90 seconds for AI processing
        }
      );

      // Handle array response (N8N sometimes wraps in array)
      const n8nData = Array.isArray(response.data) ? response.data[0] : response.data;

      console.log(`🤖 AI Agent: Response received:`, {
        success: n8nData.success,
        hasResults: !!(n8nData as any).results,
        resultsCount: (n8nData as any).results_count
      });

      return n8nData;
    } catch (error: any) {
      console.error('Error in aiAgentMessage:', error.message);

      // Handle timeout
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: 'AI Agent request timed out. Please try again.',
          message: 'The request took too long to process.'
        };
      }

      // Handle network errors
      if (axios.isAxiosError(error) && !error.response) {
        return {
          success: false,
          error: 'Unable to reach AI Agent. Please try again later.',
          message: 'Network error occurred.'
        };
      }

      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'aiAgentMessage', via: 'n8n' },
        extra: { channel: request.channel, hasMessage: !!request.message }
      });

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'AI Agent request failed',
        message: 'An error occurred while processing your request.'
      };
    }
  }
};