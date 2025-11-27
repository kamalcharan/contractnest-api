// backend/src/services/groupsService.ts
// Service layer for all group operations - calls groups Edge Function

import axios, { AxiosError } from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';
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
      
      // Handle duplicate membership (409 Conflict)
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        throw new Error('You are already a member of this group');
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
   */
  async enhanceProfile(
    authToken: string,
    request: AIEnhancementRequest
  ): Promise<AIEnhancementResponse> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/profiles/enhance`,
        request,
        {
          headers: getHeaders(authToken),
          timeout: 30000 // 30s timeout for AI processing
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in enhanceProfile:', error);
      
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        throw new Error('AI enhancement timed out. Please try again.');
      }
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'enhanceProfile' },
        extra: { membershipId: request.membership_id }
      });
      throw error;
    }
  },

  /**
   * Scrape website and generate profile
   */
  async scrapeWebsite(
    authToken: string,
    request: WebsiteScrapingRequest
  ): Promise<WebsiteScrapingResponse> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/profiles/scrape-website`,
        request,
        {
          headers: getHeaders(authToken),
          timeout: 45000 // 45s timeout for scraping + AI
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error in scrapeWebsite:', error);
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('Website scraping timed out. Please try again.');
        }
        if (error.response?.status === 422) {
          throw new Error('Unable to access website. Please check the URL.');
        }
      }
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'groupsService', action: 'scrapeWebsite' },
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
   * Save profile and generate embedding
   */
  async saveProfile(
    authToken: string,
    request: SaveProfileRequest
  ): Promise<SaveProfileResponse> {
    try {
      const response = await axios.post(
        `${GROUPS_API_BASE}/profiles/save`,
        request,
        {
          headers: getHeaders(authToken),
          timeout: 30000
        }
      );
      
      return response.data;
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