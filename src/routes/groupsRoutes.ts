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

// ============================================
// SEARCH ROUTE
// ============================================

/**
 * POST /api/search
 * Search group directory
 * Body: { group_id, query, limit?, use_cache? }
 */
router.post('/search', groupsController.search);

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

export default router;