// backend/src/routes/groupsRoutes.ts
// Express routes for all group operations

import express from 'express';
import * as groupsController from '../controllers/groupsController';

const router = express.Router();

// ============================================
// GROUPS ROUTES
// ============================================

/**
 * GET /api/groups
 * Get all business groups (with optional type filter)
 * Query params: ?group_type=bbb_chapter
 */
router.get('/groups', groupsController.getGroups);

/**
 * GET /api/groups/:groupId
 * Get specific group by ID
 */
router.get('/groups/:groupId', groupsController.getGroup);

/**
 * POST /api/groups/verify-access
 * Verify group access password
 * Body: { group_id, password, access_type }
 */
router.post('/groups/verify-access', groupsController.verifyGroupAccess);

// ============================================
// MEMBERSHIP ROUTES
// ============================================

/**
 * POST /api/memberships
 * Create new membership (join group)
 * Headers: x-tenant-id
 * Body: { group_id, profile_data? }
 */
router.post('/memberships', groupsController.createMembership);

/**
 * GET /api/memberships/:membershipId
 * Get membership with tenant profile
 */
router.get('/memberships/:membershipId', groupsController.getMembership);

/**
 * PUT /api/memberships/:membershipId
 * Update membership profile data
 * Body: { profile_data?, status? }
 */
router.put('/memberships/:membershipId', groupsController.updateMembership);

/**
 * GET /api/memberships/group/:groupId
 * Get all memberships for a group (admin)
 * Query params: ?status=all&limit=50&offset=0
 */
router.get('/memberships/group/:groupId', groupsController.getGroupMemberships);

/**
 * DELETE /api/memberships/:membershipId
 * Delete membership (soft delete)
 */
router.delete('/memberships/:membershipId', groupsController.deleteMembership);

// ============================================
// PROFILE ROUTES (AI Operations)
// ============================================

/**
 * POST /api/profiles/enhance
 * AI enhance profile description
 * Body: { membership_id, short_description }
 */
router.post('/profiles/enhance', groupsController.enhanceProfile);

/**
 * POST /api/profiles/scrape-website
 * Scrape website and generate profile
 * Body: { membership_id, website_url }
 */
router.post('/profiles/scrape-website', groupsController.scrapeWebsite);

/**
 * POST /api/profiles/generate-clusters
 * Generate semantic clusters
 * Body: { membership_id, profile_text, keywords }
 */
router.post('/profiles/generate-clusters', groupsController.generateClusters);

/**
 * POST /api/profiles/save
 * Save profile with embedding
 * Body: { membership_id, profile_data, trigger_embedding }
 */
router.post('/profiles/save', groupsController.saveProfile);

/**
 * POST /api/profiles/clusters
 * Save semantic clusters to database
 * Body: { membership_id, clusters }
 */
router.post('/profiles/clusters', groupsController.saveClusters);

/**
 * GET /api/profiles/clusters/:membershipId
 * Get saved clusters for a membership
 */
router.get('/profiles/clusters/:membershipId', groupsController.getClusters);

/**
 * DELETE /api/profiles/clusters/:membershipId
 * Delete clusters for a membership
 */
router.delete('/profiles/clusters/:membershipId', groupsController.deleteClusters);

// ============================================
// SEARCH ROUTES
// ============================================

/**
 * POST /api/search
 * Search group directory (legacy - uses Edge Function)
 * Body: { group_id, query, limit?, use_cache? }
 */
router.post('/search', groupsController.search);

/**
 * POST /api/ai-search
 * AI-powered search via n8n - supports intent, scope, channel, RBAC
 * Body: {
 *   group_id: string (required),
 *   query: string (required),
 *   scope?: 'group' | 'tenant' | 'product',
 *   intent_code?: string,
 *   user_role?: 'admin' | 'member' | 'guest',
 *   channel?: 'web' | 'mobile' | 'whatsapp' | 'chatbot' | 'api',
 *   limit?: number,
 *   use_cache?: boolean,
 *   similarity_threshold?: number
 * }
 * Headers: x-environment: 'live' | 'test'
 */
router.post('/ai-search', groupsController.aiSearch);

// ============================================
// CHAT ROUTES (VaNi Chat - Proxy to Edge Function)
// ============================================

/**
 * POST /api/chat/init
 * Initialize chat - get VaNi intro message
 * Body: { channel?: string }
 */
router.post('/chat/init', groupsController.chatInit);

/**
 * POST /api/chat/session
 * Get or create chat session
 * Body: { channel?: string }
 */
router.post('/chat/session', groupsController.chatSession);

/**
 * GET /api/chat/session/:sessionId
 * Get session by ID
 */
router.get('/chat/session/:sessionId', groupsController.chatSessionById);

/**
 * POST /api/chat/activate
 * Activate group in chat session
 * Body: { trigger_phrase?, group_id?, session_id? }
 */
router.post('/chat/activate', groupsController.chatActivate);

/**
 * POST /api/chat/intent
 * Set intent in chat session
 * Body: { session_id, intent, prompt? }
 */
router.post('/chat/intent', groupsController.chatIntent);

/**
 * POST /api/chat/search
 * AI-powered search with caching (via Edge Function -> n8n)
 * Body: { group_id, query, session_id?, intent?, limit?, use_cache?, similarity_threshold? }
 */
router.post('/chat/search', groupsController.chatSearch);

/**
 * POST /api/chat/end
 * End chat session
 * Body: { session_id }
 */
router.post('/chat/end', groupsController.chatEnd);

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * GET /api/admin/stats/:groupId
 * Get admin dashboard stats
 */
router.get('/admin/stats/:groupId', groupsController.getAdminStats);

/**
 * PUT /api/admin/memberships/:membershipId/status
 * Update membership status (admin)
 * Body: { status, reason? }
 */
router.put('/admin/memberships/:membershipId/status', groupsController.updateMembershipStatus);

/**
 * GET /api/admin/activity-logs/:groupId
 * Get activity logs (admin)
 * Query params: ?activity_type=status_change&limit=50&offset=0
 */
router.get('/admin/activity-logs/:groupId', groupsController.getActivityLogs);

// ============================================
// TENANT ROUTES (Dashboard & NLP Search)
// ============================================

/**
 * POST /api/tenants/stats
 * Get tenant statistics for dashboard
 * Body: { group_id?: string }
 */
router.post('/tenants/stats', groupsController.getTenantStats);

/**
 * POST /api/tenants/search
 * NLP-based tenant search
 * Body: { query: string, group_id?: string, intent_code?: string }
 */
router.post('/tenants/search', groupsController.searchTenants);

/**
 * GET /api/intents
 * Get resolved intents for a group/user/channel
 * Query params: ?group_id=xxx&user_role=admin&channel=web
 */
router.get('/intents', groupsController.getIntents);

export default router;