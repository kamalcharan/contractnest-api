// backend/src/controllers/groupsController.ts
// Express controllers for all group operations

import { Request, Response } from 'express';
import { captureException } from '../utils/sentry';
import { validateSupabaseConfig } from '../utils/supabaseConfig';
import { groupsService } from '../services/groupsService';

// ============================================
// GROUPS CONTROLLERS
// ============================================

/**
 * GET /api/groups
 * Get all business groups (with optional type filter)
 */
export const getGroups = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'getGroups')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    const groupType = req.query.group_type as 'bbb_chapter' | 'tech_forum' | 'all' | undefined;
    
    const groups = await groupsService.getGroups(authHeader, groupType);
    return res.status(200).json({ success: true, groups });
  } catch (error: any) {
    console.error('Error in getGroups controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'getGroups' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch groups';
    
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * GET /api/groups/:groupId
 * Get specific group by ID
 */
export const getGroup = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'getGroup')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const groupId = req.params.groupId;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!groupId) {
      return res.status(400).json({ error: 'groupId parameter is required' });
    }
    
    const group = await groupsService.getGroup(authHeader, groupId);
    return res.status(200).json({ success: true, group });
  } catch (error: any) {
    console.error('Error in getGroup controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'getGroup' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch group';
    
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/groups/verify-access
 * Verify group access password
 */
export const verifyGroupAccess = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'verifyGroupAccess')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    const { group_id, password, access_type } = req.body;
    
    if (!group_id || !password || !access_type) {
      return res.status(400).json({ 
        error: 'group_id, password, and access_type are required' 
      });
    }
    
    if (!['user', 'admin'].includes(access_type)) {
      return res.status(400).json({ 
        error: 'access_type must be either "user" or "admin"' 
      });
    }
    
    const result = await groupsService.verifyGroupAccess(authHeader, {
      group_id,
      password,
      access_type
    });
    
    // Return appropriate status based on access_granted
    const status = result.access_granted ? 200 : 401;
    return res.status(status).json(result);
  } catch (error: any) {
    console.error('Error in verifyGroupAccess controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'verifyGroupAccess' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to verify access';
    
    return res.status(status).json({ success: false, access_granted: false, error: message });
  }
};

// ============================================
// MEMBERSHIP CONTROLLERS
// ============================================

/**
 * POST /api/memberships
 * Create new membership (join group)
 */
export const createMembership = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'createMembership')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    const { group_id, profile_data } = req.body;
    
    if (!group_id) {
      return res.status(400).json({ error: 'group_id is required' });
    }
    
    const membership = await groupsService.createMembership(authHeader, tenantId, {
      group_id,
      profile_data
    });
    
    return res.status(201).json({ success: true, ...membership });
  } catch (error: any) {
    console.error('Error in createMembership controller:', error.message);

    // Handle duplicate membership error - include membership_id for auto-recovery
    if (error.message?.includes('already a member') || error.message?.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message,
        membership_id: error.membership_id // Pass through for auto-recovery
      });
    }

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'createMembership' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to create membership';

    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * GET /api/memberships/:membershipId
 * Get membership with profile
 */
export const getMembership = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'getMembership')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const membershipId = req.params.membershipId;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!membershipId) {
      return res.status(400).json({ error: 'membershipId parameter is required' });
    }
    
    const membership = await groupsService.getMembership(authHeader, membershipId);
    return res.status(200).json({ success: true, membership });
  } catch (error: any) {
    console.error('Error in getMembership controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'getMembership' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch membership';
    
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * PUT /api/memberships/:membershipId
 * Update membership profile data
 */
export const updateMembership = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'updateMembership')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const membershipId = req.params.membershipId;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!membershipId) {
      return res.status(400).json({ error: 'membershipId parameter is required' });
    }
    
    const { profile_data, status } = req.body;
    
    if (!profile_data && !status) {
      return res.status(400).json({ 
        error: 'Either profile_data or status is required' 
      });
    }
    
    const result = await groupsService.updateMembership(authHeader, membershipId, {
      profile_data,
      status
    });
    
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error in updateMembership controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'updateMembership' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to update membership';
    
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * GET /api/memberships/group/:groupId
 * Get all memberships for a group (admin)
 */
export const getGroupMemberships = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'getGroupMemberships')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const groupId = req.params.groupId;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!groupId) {
      return res.status(400).json({ error: 'groupId parameter is required' });
    }
    
    const status = req.query.status as 'all' | 'active' | 'pending' | 'inactive' | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    
    const result = await groupsService.getGroupMemberships(authHeader, groupId, {
      status,
      limit,
      offset
    });
    
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error in getGroupMemberships controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'getGroupMemberships' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch memberships';
    
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * DELETE /api/memberships/:membershipId
 * Delete membership (soft delete)
 */
export const deleteMembership = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'deleteMembership')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const membershipId = req.params.membershipId;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!membershipId) {
      return res.status(400).json({ error: 'membershipId parameter is required' });
    }
    
    const result = await groupsService.deleteMembership(authHeader, membershipId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in deleteMembership controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'deleteMembership' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to delete membership';
    
    return res.status(status).json({ success: false, error: message });
  }
};

// ============================================
// PROFILE CONTROLLERS (AI Operations)
// ============================================

/**
 * POST /api/profiles/enhance
 * AI enhance profile description
 */
export const enhanceProfile = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'enhanceProfile')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    const { membership_id, short_description } = req.body;
    
    if (!membership_id || !short_description) {
      return res.status(400).json({ 
        error: 'membership_id and short_description are required' 
      });
    }
    
    // Get environment from header for n8n routing (live → production, test → test)
    const environment = req.headers['x-environment'] as string | undefined;

    const result = await groupsService.enhanceProfile(authHeader, {
      membership_id,
      short_description
    }, environment);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in enhanceProfile controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'enhanceProfile' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to enhance profile';
    
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/profiles/scrape-website
 * Scrape website and generate profile
 */
export const scrapeWebsite = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'scrapeWebsite')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    const { membership_id, website_url } = req.body;
    
    if (!membership_id || !website_url) {
      return res.status(400).json({ 
        error: 'membership_id and website_url are required' 
      });
    }
    
    // Basic URL validation
    const urlPattern = /^https?:\/\/.+\..+/;
    if (!urlPattern.test(website_url)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Get environment from header for n8n routing (live → production, test → test)
    const environment = req.headers['x-environment'] as string | undefined;

    const result = await groupsService.scrapeWebsite(authHeader, {
      membership_id,
      website_url
    }, environment);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in scrapeWebsite controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'scrapeWebsite' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to scrape website';
    
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/profiles/generate-clusters
 * Generate semantic clusters via n8n webhook
 *
 * Headers:
 * - x-environment: 'live' | 'test' (for n8n routing)
 */
export const generateClusters = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'generateClusters')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { membership_id, profile_text, keywords } = req.body;

    if (!membership_id || !profile_text) {
      return res.status(400).json({
        error: 'membership_id and profile_text are required'
      });
    }

    if (keywords && !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'keywords must be an array' });
    }

    // Get environment from header for n8n routing (live → production, test → test)
    const environment = req.headers['x-environment'] as string | undefined;

    const result = await groupsService.generateClusters(authHeader, {
      membership_id,
      profile_text,
      keywords: keywords || []
    }, environment);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in generateClusters controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'generateClusters' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to generate clusters';

    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/profiles/save
 * Save profile with optional embedding generation via n8n
 *
 * Body:
 * - membership_id: string (required)
 * - profile_data: object (required)
 * - trigger_embedding: boolean (optional, default false)
 * - business_context: object (optional) { business_name, industry, city }
 *
 * Headers:
 * - x-environment: 'live' | 'test' (for n8n routing)
 */
export const saveProfile = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'saveProfile')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { membership_id, profile_data, trigger_embedding, business_context } = req.body;

    if (!membership_id || !profile_data) {
      return res.status(400).json({
        error: 'membership_id and profile_data are required'
      });
    }

    // Get environment from header for n8n routing (live → production, test → test)
    const environment = req.headers['x-environment'] as string | undefined;

    const result = await groupsService.saveProfile(
      authHeader,
      {
        membership_id,
        profile_data,
        trigger_embedding: trigger_embedding || false
      },
      environment,
      business_context
    );

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in saveProfile controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'saveProfile' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to save profile';

    return res.status(status).json({ success: false, error: message });
  }
};

// ============================================
// SEARCH CONTROLLER
// ============================================

/**
 * POST /api/search
 * Search group directory (legacy - uses Edge Function)
 */
export const search = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'search')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { group_id, query, limit, use_cache } = req.body;

    if (!group_id || !query) {
      return res.status(400).json({
        error: 'group_id and query are required'
      });
    }

    const result = await groupsService.search(authHeader, {
      group_id,
      query,
      limit,
      use_cache
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in search controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'search' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to search';

    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/ai-search
 * AI-powered search via n8n - supports intent, scope, channel, RBAC
 *
 * Body:
 * - group_id: string (required)
 * - query: string (required)
 * - scope: 'group' | 'tenant' | 'product' (optional, default 'group')
 * - intent_code: string (optional, default 'search_offering')
 * - user_role: 'admin' | 'member' | 'guest' (optional, default 'member')
 * - channel: 'web' | 'mobile' | 'whatsapp' | 'chatbot' | 'api' (optional, default 'web')
 * - limit: number (optional, default 10)
 * - use_cache: boolean (optional, default true)
 * - similarity_threshold: number (optional, default 0.7)
 *
 * Headers:
 * - x-environment: 'live' | 'test' (for n8n routing)
 */
export const aiSearch = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'aiSearch')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const {
      group_id,
      query,
      scope,
      intent_code,
      user_role,
      channel,
      limit,
      use_cache,
      similarity_threshold
    } = req.body;

    if (!group_id || !query) {
      return res.status(400).json({
        error: 'group_id and query are required'
      });
    }

    // Validate optional enum values
    if (scope && !['group', 'tenant', 'product'].includes(scope)) {
      return res.status(400).json({
        error: 'scope must be "group", "tenant", or "product"'
      });
    }

    if (user_role && !['admin', 'member', 'guest'].includes(user_role)) {
      return res.status(400).json({
        error: 'user_role must be "admin", "member", or "guest"'
      });
    }

    if (channel && !['web', 'mobile', 'whatsapp', 'chatbot', 'api'].includes(channel)) {
      return res.status(400).json({
        error: 'channel must be "web", "mobile", "whatsapp", "chatbot", or "api"'
      });
    }

    // Get environment from header for n8n routing (live → production, test → test)
    const environment = req.headers['x-environment'] as string | undefined;

    const result = await groupsService.aiSearch(
      authHeader,
      {
        group_id,
        query,
        scope,
        intent_code,
        user_role,
        channel,
        limit,
        use_cache,
        similarity_threshold
      },
      environment
    );

    // Return appropriate status based on success/permission
    if (!result.success) {
      if (result.denial_reason) {
        return res.status(403).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in aiSearch controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'aiSearch' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to perform AI search';

    return res.status(status).json({ success: false, error: message });
  }
};

// ============================================
// ADMIN CONTROLLERS
// ============================================

/**
 * GET /api/admin/stats/:groupId
 * Get admin dashboard stats
 */
export const getAdminStats = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'getAdminStats')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const groupId = req.params.groupId;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!groupId) {
      return res.status(400).json({ error: 'groupId parameter is required' });
    }
    
    const result = await groupsService.getAdminStats(authHeader, groupId);
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error in getAdminStats controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'getAdminStats' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch admin stats';
    
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * PUT /api/admin/memberships/:membershipId/status
 * Update membership status (admin)
 */
export const updateMembershipStatus = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'updateMembershipStatus')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const membershipId = req.params.membershipId;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!membershipId) {
      return res.status(400).json({ error: 'membershipId parameter is required' });
    }
    
    const { status, reason } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }
    
    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ 
        error: 'status must be "active", "inactive", or "suspended"' 
      });
    }
    
    const result = await groupsService.updateMembershipStatus(authHeader, membershipId, {
      status,
      reason
    });
    
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in updateMembershipStatus controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'updateMembershipStatus' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to update membership status';
    
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * GET /api/admin/activity-logs/:groupId
 * Get activity logs (admin)
 */
export const getActivityLogs = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'getActivityLogs')) {
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const groupId = req.params.groupId;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!groupId) {
      return res.status(400).json({ error: 'groupId parameter is required' });
    }
    
    const activity_type = req.query.activity_type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    
    const result = await groupsService.getActivityLogs(authHeader, groupId, {
      activity_type,
      limit,
      offset
    });
    
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error in getActivityLogs controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'getActivityLogs' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch activity logs';

    return res.status(status).json({ success: false, error: message });
  }
};

// ============================================
// CLUSTER CRUD CONTROLLERS
// ============================================

/**
 * POST /api/profiles/clusters
 * Save semantic clusters for a membership
 */
export const saveClusters = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'saveClusters')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { membership_id, clusters } = req.body;

    if (!membership_id || !clusters) {
      return res.status(400).json({
        error: 'membership_id and clusters are required'
      });
    }

    const result = await groupsService.saveClusters(authHeader, {
      membership_id,
      clusters
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in saveClusters controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'saveClusters' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to save clusters';

    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * GET /api/profiles/clusters/:membershipId
 * Get semantic clusters for a membership
 */
export const getClusters = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'getClusters')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const membershipId = req.params.membershipId;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!membershipId) {
      return res.status(400).json({ error: 'membershipId parameter is required' });
    }

    const result = await groupsService.getClusters(authHeader, membershipId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getClusters controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'getClusters' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to get clusters';

    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * DELETE /api/profiles/clusters/:membershipId
 * Delete semantic clusters for a membership
 */
export const deleteClusters = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'deleteClusters')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const membershipId = req.params.membershipId;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!membershipId) {
      return res.status(400).json({ error: 'membershipId parameter is required' });
    }

    const result = await groupsService.deleteClusters(authHeader, membershipId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in deleteClusters controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'deleteClusters' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to delete clusters';

    return res.status(status).json({ success: false, error: message });
  }
};

// ============================================
// CHAT SESSION CONTROLLERS
// Proxy to Edge Function /chat/* endpoints
// ============================================

/**
 * POST /api/chat/init
 * Initialize chat - get VaNi intro message
 */
export const chatInit = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'chatInit')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { channel = 'web' } = req.body;
    const result = await groupsService.chatInit(authHeader, channel);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in chatInit controller:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'chatInit' }
    });
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to initialize chat';
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/chat/session
 * Get or create chat session
 */
export const chatSession = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'chatSession')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { channel = 'web' } = req.body;
    const result = await groupsService.chatSession(authHeader, channel);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in chatSession controller:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'chatSession' }
    });
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to get/create session';
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * GET /api/chat/session/:sessionId
 * Get session by ID
 */
export const chatSessionById = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'chatSessionById')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId parameter is required' });
    }

    const result = await groupsService.chatSessionById(authHeader, sessionId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in chatSessionById controller:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'chatSessionById' }
    });
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to get session';
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/chat/activate
 * Activate group in chat session
 */
export const chatActivate = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'chatActivate')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { trigger_phrase, group_id, session_id } = req.body;
    if (!trigger_phrase && !group_id) {
      return res.status(400).json({ error: 'trigger_phrase or group_id is required' });
    }

    const result = await groupsService.chatActivate(authHeader, { trigger_phrase, group_id, session_id });
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in chatActivate controller:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'chatActivate' }
    });
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to activate group';
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/chat/intent
 * Set intent in chat session
 */
export const chatIntent = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'chatIntent')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { session_id, intent, prompt } = req.body;
    if (!session_id || !intent) {
      return res.status(400).json({ error: 'session_id and intent are required' });
    }

    const result = await groupsService.chatIntent(authHeader, { session_id, intent, prompt });
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in chatIntent controller:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'chatIntent' }
    });
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to set intent';
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/chat/search
 * AI-powered search with caching
 */
export const chatSearch = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'chatSearch')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { group_id, query, session_id, intent, limit, use_cache, similarity_threshold } = req.body;
    if (!group_id || !query) {
      return res.status(400).json({ error: 'group_id and query are required' });
    }

    const result = await groupsService.chatSearch(authHeader, {
      group_id,
      query,
      session_id,
      intent,
      limit,
      use_cache,
      similarity_threshold
    });
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in chatSearch controller:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'chatSearch' }
    });
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Search failed';
    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/chat/end
 * End chat session
 */
export const chatEnd = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'chatEnd')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { session_id } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    const result = await groupsService.chatEnd(authHeader, session_id);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in chatEnd controller:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'chatEnd' }
    });
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to end session';
    return res.status(status).json({ success: false, error: message });
  }
};

// ============================================
// SMARTPROFILE CONTROLLERS
// ============================================

/**
 * GET /api/smartprofiles/:tenantId
 * Get SmartProfile for a tenant
 */
export const getSmartProfile = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'getSmartProfile')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.params.tenantId;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId parameter is required' });
    }

    const result = await groupsService.getSmartProfile(authHeader, tenantId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getSmartProfile controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'getSmartProfile' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch SmartProfile';

    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/smartprofiles
 * Save SmartProfile (basic save without AI)
 */
export const saveSmartProfile = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'saveSmartProfile')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const {
      tenant_id,
      short_description,
      ai_enhanced_description,
      approved_keywords,
      profile_type,
      website_url,
      generation_method
    } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    console.log('📝 saveSmartProfile controller received:', {
      tenant_id,
      hasEnhancedDesc: !!ai_enhanced_description,
      enhancedDescLength: ai_enhanced_description?.length || 0,
      shortDescLength: short_description?.length || 0,
      keywordsCount: approved_keywords?.length || 0
    });

    const result = await groupsService.saveSmartProfile(authHeader, tenant_id, {
      short_description,
      ai_enhanced_description,
      approved_keywords,
      profile_type,
      website_url,
      generation_method
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in saveSmartProfile controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'saveSmartProfile' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to save SmartProfile';

    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/smartprofiles/generate
 * Generate SmartProfile via n8n (AI enhancement + embedding)
 */
export const generateSmartProfile = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'generateSmartProfile')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const environment = req.headers['x-environment'] as string | undefined;

    const result = await groupsService.generateSmartProfile(authHeader, tenant_id, environment);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in generateSmartProfile controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'generateSmartProfile' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to generate SmartProfile';

    return res.status(status).json({ success: false, error: message });
  }
};

/**
 * POST /api/smartprofiles/search
 * Search SmartProfiles via n8n
 */
export const searchSmartProfiles = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'searchSmartProfiles')) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    const { query, scope, group_id, tenant_id, limit, use_cache } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const environment = req.headers['x-environment'] as string | undefined;

    const result = await groupsService.searchSmartProfiles(authHeader, {
      query,
      scope,
      group_id,
      tenant_id,
      limit,
      use_cache
    }, environment);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in searchSmartProfiles controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'searchSmartProfiles' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to search SmartProfiles';

    return res.status(status).json({ success: false, error: message });
  }
};

// SmartProfile wizard methods
export const enhanceSmartProfile = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'enhanceSmartProfile')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    const environment = req.headers['x-environment'] as string || 'live';
    const { tenant_id, short_description } = req.body;
    if (!tenant_id || !short_description) return res.status(400).json({ error: 'tenant_id and short_description are required' });
    const result = await groupsService.enhanceSmartProfile(authHeader, tenant_id, short_description, environment);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in enhanceSmartProfile:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'api_groups', action: 'enhanceSmartProfile' } });
    return res.status(error.response?.status || 500).json({ success: false, error: error.response?.data?.error || error.message });
  }
};

export const scrapeWebsiteForSmartProfile = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'scrapeWebsiteForSmartProfile')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    const environment = req.headers['x-environment'] as string || 'live';
    const { tenant_id, website_url } = req.body;
    if (!tenant_id || !website_url) return res.status(400).json({ error: 'tenant_id and website_url are required' });
    const result = await groupsService.scrapeWebsiteForSmartProfile(authHeader, tenant_id, website_url, environment);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in scrapeWebsiteForSmartProfile:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'api_groups', action: 'scrapeWebsiteForSmartProfile' } });
    return res.status(error.response?.status || 500).json({ success: false, error: error.response?.data?.error || error.message });
  }
};

export const generateSmartProfileClusters = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'generateSmartProfileClusters')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    const environment = req.headers['x-environment'] as string || 'live';
    const { tenant_id, profile_text, keywords } = req.body;
    if (!tenant_id || !profile_text) return res.status(400).json({ error: 'tenant_id and profile_text are required' });
    const result = await groupsService.generateSmartProfileClusters(authHeader, tenant_id, profile_text, keywords, environment);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in generateSmartProfileClusters:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'api_groups', action: 'generateSmartProfileClusters' } });
    return res.status(error.response?.status || 500).json({ success: false, error: error.response?.data?.error || error.message });
  }
};

export const saveSmartProfileClusters = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'saveSmartProfileClusters')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    const { tenant_id, clusters } = req.body;
    if (!tenant_id || !clusters) return res.status(400).json({ error: 'tenant_id and clusters are required' });
    const result = await groupsService.saveSmartProfileClusters(authHeader, tenant_id, clusters);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in saveSmartProfileClusters:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'api_groups', action: 'saveSmartProfileClusters' } });
    return res.status(error.response?.status || 500).json({ success: false, error: error.response?.data?.error || error.message });
  }
};

export const getSmartProfileClusters = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'getSmartProfileClusters')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    const tenantId = req.params.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId parameter is required' });
    const result = await groupsService.getSmartProfileClusters(authHeader, tenantId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getSmartProfileClusters:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'api_groups', action: 'getSmartProfileClusters' } });
    return res.status(error.response?.status || 500).json({ success: false, error: error.response?.data?.error || error.message });
  }
};

// Tenant Dashboard methods
export const getTenantStats = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'getTenantStats')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    const { group_id } = req.body;
    const result = await groupsService.getTenantStats(authHeader, group_id);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getTenantStats:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'api_groups', action: 'getTenantStats' } });
    return res.status(error.response?.status || 500).json({ success: false, error: error.response?.data?.error || error.message });
  }
};

export const searchTenants = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'searchTenants')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is required' });
    const { query, group_id, intent_code } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });
    const environment = req.headers['x-environment'] as string | undefined;
    const result = await groupsService.searchTenants(authHeader, { query, group_id, intent_code }, environment);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in searchTenants:', error.message);
    captureException(error instanceof Error ? error : new Error(String(error)), { tags: { source: 'api_groups', action: 'searchTenants' } });
    return res.status(error.response?.status || 500).json({ success: false, error: error.response?.data?.error || error.message });
  }
};

// ============================================
// AI AGENT CONTROLLERS
// Conversational AI for Group Discovery
// ============================================

/**
 * POST /api/ai-agent/message
 * Send message to AI Agent via N8N webhook
 *
 * Body:
 * - message: string (required) - User's message
 * - channel: 'chat' | 'whatsapp' | 'web' (required) - Channel type
 * - group_id?: string - Optional group context
 *
 * Headers:
 * - Authorization: Bearer token (required for chat/web)
 * - x-environment: 'live' | 'test' (for n8n routing)
 *
 * For WhatsApp: phone is extracted from auth context
 * For Chat/Web: user_id is extracted from auth token
 */
export const aiAgentMessage = async (req: Request, res: Response) => {
  try {
    if (!validateSupabaseConfig('api_groups', 'aiAgentMessage')) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Missing Supabase configuration'
      });
    }

    const { message, channel, group_id, phone } = req.body;

    // Validate required fields
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'message is required and must be a string'
      });
    }

    if (!channel || !['chat', 'whatsapp', 'web'].includes(channel)) {
      return res.status(400).json({
        success: false,
        error: 'channel is required and must be "chat", "whatsapp", or "web"'
      });
    }

    // Extract user_id from auth token for chat/web channels
    let user_id: string | undefined;

    if (channel === 'chat' || channel === 'web') {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: 'Authorization header is required for chat/web channels'
        });
      }

      // Extract user_id from JWT token (assuming it's in the payload)
      // The actual user_id extraction depends on your auth implementation
      // For now, we'll pass the auth header and let the service handle it
      // In production, you'd decode the JWT here
      try {
        const token = authHeader.replace('Bearer ', '');
        // Decode JWT to get user_id (base64 decode the payload)
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        user_id = payload.sub || payload.user_id;
      } catch (e) {
        console.warn('Could not extract user_id from token, proceeding without it');
      }
    }

    // For WhatsApp, phone should be provided in the request body
    if (channel === 'whatsapp' && !phone) {
      return res.status(400).json({
        success: false,
        error: 'phone is required for whatsapp channel'
      });
    }

    // Get environment from header for n8n routing
    const environment = req.headers['x-environment'] as string | undefined;

    console.log(`🤖 AI Agent Controller: Processing ${channel} message`, {
      hasUserId: !!user_id,
      hasPhone: !!phone,
      groupId: group_id,
      messageLength: message.length
    });

    const result = await groupsService.aiAgentMessage(
      {
        message,
        channel,
        user_id,
        phone,
        group_id
      },
      environment
    );

    // Return appropriate status based on success
    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in aiAgentMessage controller:', error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_groups', action: 'aiAgentMessage' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'AI Agent request failed';

    return res.status(status).json({ success: false, error: message });
  }
};