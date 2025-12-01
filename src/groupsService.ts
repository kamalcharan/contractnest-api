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
} from '../config/VaNiN8NConfig';
import type {
  BusinessGroup,
  GroupMembership,
  MembershipWithProfile,
  CreateMembershipRequest,
  UpdateMembershipRequest,
  SearchRequest,
  SearchResponse,
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

const getHeaders = (authToken: string, tenantId?: string) => ({
  'Authorization': authToken,
  'Content-Type': 'application/json',
  ...(tenantId && { 'x-tenant-id': tenantId })
});

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
    try {
      // Map to n8n environment (live → production, test → test)
      const n8nEnv = VaNiN8NConfig.mapEnvironment(environment);
      const n8nUrl = VaNiN8NConfig.getWebhookUrl('PROCESS_PROFILE', n8nEnv);

      console.log(`🤖 VaNi: Calling n8n enhance profile [${n8nEnv}]:`, n8nUrl);

      // Transform request to n8n format
      const n8nRequest: N8NProcessProfileRequest = {
        type: 'manual',
        content: request.short_description,
        userId: request.membership_id, // Using membership_id as userId for tracking
        groupId: request.membership_id, // Will be updated when we have proper group context
      };

      const response = await axios.post<N8NProcessProfileResponse>(
        n8nUrl,
        n8nRequest,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000 // 60s timeout for AI processing
        }
      );

      // n8n may return an array - unwrap if needed
      const n8nData = Array.isArray(response.data) ? response.data[0] : response.data;

      // Check for n8n error response
      if (VaNiN8NConfig.isError(n8nData)) {
        console.error('🤖 VaNi: n8n returned error:', n8nData);
        throw new Error(n8nData.message || 'AI enhancement failed');
      }

      // Transform n8n response to expected format
      const successResponse = n8nData as N8NProcessProfileResponse & { status: 'success' };
      return {
        success: true,
        ai_enhanced_description: successResponse.enhancedContent,
        suggested_keywords: [], // n8n doesn't return keywords yet
        processing_time_ms: 0,  // Could add timing if needed
      };
    } catch (error) {
      console.error('Error in enhanceProfile:', error);

      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        throw new Error('AI enhancement timed out. Please try again.');
      }

      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'enhanceProfile', via: 'n8n' },
        extra: { membershipId: request.membership_id }
      });
      throw error;
    }
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
    try {
      // Map to n8n environment (live → production, test → test)
      const n8nEnv = VaNiN8NConfig.mapEnvironment(environment);
      const n8nUrl = VaNiN8NConfig.getWebhookUrl('PROCESS_PROFILE', n8nEnv);

      console.log(`🤖 VaNi: Calling n8n scrape website [${n8nEnv}]:`, n8nUrl);

      // Transform request to n8n format
      const n8nRequest: N8NProcessProfileRequest = {
        type: 'website',
        websiteUrl: request.website_url,
        userId: request.membership_id,
        groupId: request.membership_id,
      };

      const response = await axios.post<N8NProcessProfileResponse>(
        n8nUrl,
        n8nRequest,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 90000 // 90s timeout for scraping + AI
        }
      );

      // n8n may return an array - unwrap if needed
      const n8nData = Array.isArray(response.data) ? response.data[0] : response.data;

      // Check for n8n error response
      if (VaNiN8NConfig.isError(n8nData)) {
        const errorResponse = n8nData;
        console.error('🤖 VaNi: n8n returned error:', errorResponse);

        // Map n8n error codes to user-friendly messages
        if (errorResponse.errorCode === 'WEBSITE_FETCH_FAILED') {
          throw new Error(errorResponse.suggestion || 'Unable to access website. Please check the URL.');
        }
        throw new Error(errorResponse.message || 'Website scraping failed');
      }

      // Transform n8n response to expected format
      const successResponse = n8nData as N8NProcessProfileResponse & { status: 'success' };
      return {
        success: true,
        ai_enhanced_description: successResponse.enhancedContent,
        suggested_keywords: [], // n8n doesn't return keywords yet
        scraped_data: {
          title: '',
          meta_description: '',
          content_snippets: [successResponse.originalContent],
        },
      };
    } catch (error) {
      console.error('Error in scrapeWebsite:', error);

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('Website scraping timed out. Please try again.');
        }
        // Handle n8n 400 responses (error responses)
        if (error.response?.status === 400 && error.response?.data?.suggestion) {
          throw new Error(error.response.data.suggestion);
        }
      }

      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'scrapeWebsite', via: 'n8n' },
        extra: { membershipId: request.membership_id, websiteUrl: request.website_url }
      });
      throw error;
    }
  },

  /**
   * Generate semantic clusters
   */
  async generateClusters(
    authToken: string,
    request: GenerateClustersRequest
  ): Promise<GenerateClustersResponse> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/profiles/generate-clusters`,
        request,
        {
          headers: getHeaders(authToken),
          timeout: 30000
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in generateClusters:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'generateClusters' },
        extra: { membershipId: request.membership_id }
      });
      throw error;
    }
  },

  /**
   * Save semantic clusters
   */
  async saveClusters(
    authToken: string,
    request: { membership_id: string; clusters: any[] }
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/profiles/clusters`,
        request,
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error: any) {
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
  async getClusters(authToken: string, membershipId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${GROUPS_API_BASE}/profiles/clusters/${membershipId}`,
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error in getClusters:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'getClusters' },
        extra: { membershipId }
      });
      throw error;
    }
  },

  /**
   * Delete all clusters for a membership
   */
  async deleteClusters(authToken: string, membershipId: string): Promise<any> {
    try {
      const response = await axios.delete(
        `${GROUPS_API_BASE}/profiles/clusters/${membershipId}`,
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error in deleteClusters:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'deleteClusters' },
        extra: { membershipId }
      });
      throw error;
    }
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
   * Search group directory
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
  }
};