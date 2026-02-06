// src/routes/adminTenantRoutes.ts
// Admin Tenant Management Routes

import { Router, Request, Response } from 'express';
import { adminTenantService } from '../services/adminTenantService';

const router = Router();

/**
 * GET /api/admin/tenants/stats
 * Returns platform-wide stats for the admin dashboard
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';

    const result = await adminTenantService.getStats(authHeader, tenantId);

    res.json(result);
  } catch (error: any) {
    console.error('[AdminTenantRoutes] GET /stats error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: { code: 'STATS_ERROR', message: error.message || 'Failed to load stats' }
    });
  }
});

/**
 * GET /api/admin/tenants/list
 * Returns paginated tenant list with profile, subscription, and record counts
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';

    const filters = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      status: req.query.status as string || undefined,
      subscription_status: req.query.subscription_status as string || undefined,
      search: req.query.search as string || undefined,
      sort_by: req.query.sort_by as string || undefined,
      sort_direction: req.query.sort_direction as string || undefined,
      is_test: req.query.is_test as string || undefined
    };

    const result = await adminTenantService.getTenants(authHeader, tenantId, filters);

    res.json(result);
  } catch (error: any) {
    console.error('[AdminTenantRoutes] GET /list error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: error.message || 'Failed to load tenants' }
    });
  }
});

/**
 * GET /api/admin/tenants/:id/data-summary
 * Returns data summary (row counts per table) for a specific tenant
 */
router.get('/:id/data-summary', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';
    const targetTenantId = req.params.id;

    const result = await adminTenantService.getDataSummary(authHeader, tenantId, targetTenantId);

    res.json(result);
  } catch (error: any) {
    console.error('[AdminTenantRoutes] GET /:id/data-summary error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: { code: 'DATA_SUMMARY_ERROR', message: error.message || 'Failed to load data summary' }
    });
  }
});

/**
 * POST /api/admin/tenants/:id/reset-test-data
 * Deletes test data (is_live=false) for a specific tenant
 */
router.post('/:id/reset-test-data', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';
    const targetTenantId = req.params.id;

    const result = await adminTenantService.resetTestData(authHeader, tenantId, targetTenantId);

    res.json(result);
  } catch (error: any) {
    console.error('[AdminTenantRoutes] POST /:id/reset-test-data error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: { code: 'RESET_TEST_ERROR', message: error.message || 'Failed to reset test data' }
    });
  }
});

/**
 * POST /api/admin/tenants/:id/reset-all-data
 * Deletes ALL data for a specific tenant, keeps account open
 */
router.post('/:id/reset-all-data', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';
    const targetTenantId = req.params.id;

    const result = await adminTenantService.resetAllData(authHeader, tenantId, targetTenantId);

    res.json(result);
  } catch (error: any) {
    console.error('[AdminTenantRoutes] POST /:id/reset-all-data error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: { code: 'RESET_ALL_ERROR', message: error.message || 'Failed to reset all data' }
    });
  }
});

/**
 * POST /api/admin/tenants/:id/close-account
 * Deletes ALL data + closes the tenant account
 */
router.post('/:id/close-account', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';
    const targetTenantId = req.params.id;

    const result = await adminTenantService.closeAccount(authHeader, tenantId, targetTenantId);

    res.json(result);
  } catch (error: any) {
    console.error('[AdminTenantRoutes] POST /:id/close-account error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: { code: 'CLOSE_ACCOUNT_ERROR', message: error.message || 'Failed to close account' }
    });
  }
});

export default router;
