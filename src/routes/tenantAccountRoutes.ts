// src/routes/tenantAccountRoutes.ts
// Tenant Account Management Routes (Owner-side)
// Endpoints for tenant owners to view data summary and close their account

import { Router, Request, Response } from 'express';
import { tenantAccountService } from '../services/tenantAccountService';

const router = Router();

/**
 * GET /api/tenant/data-summary
 * Returns data summary (row counts per table) for the authenticated tenant
 */
router.get('/data-summary', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'x-tenant-id header is required' }
      });
    }

    const result = await tenantAccountService.getDataSummary(authHeader, tenantId);

    res.json(result);
  } catch (error: any) {
    console.error('[TenantAccountRoutes] GET /data-summary error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: { code: 'DATA_SUMMARY_ERROR', message: error.message || 'Failed to load data summary' }
    });
  }
});

/**
 * POST /api/tenant/reset-test-data
 * Resets test data (is_live=false / is_active=false records) for the authenticated tenant
 */
router.post('/reset-test-data', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'x-tenant-id header is required' }
      });
    }

    const result = await tenantAccountService.resetTestData(authHeader, tenantId);

    res.json(result);
  } catch (error: any) {
    console.error('[TenantAccountRoutes] POST /reset-test-data error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: { code: 'RESET_TEST_ERROR', message: error.message || 'Failed to reset test data' }
    });
  }
});

/**
 * POST /api/tenant/reset-all-data
 * Resets ALL data for the authenticated tenant (keeps account open)
 */
router.post('/reset-all-data', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'x-tenant-id header is required' }
      });
    }

    const result = await tenantAccountService.resetAllData(authHeader, tenantId);

    res.json(result);
  } catch (error: any) {
    console.error('[TenantAccountRoutes] POST /reset-all-data error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: { code: 'RESET_ALL_ERROR', message: error.message || 'Failed to reset all data' }
    });
  }
});

/**
 * POST /api/tenant/close-account
 * Closes the authenticated tenant's account (deletes all data + closes)
 */
router.post('/close-account', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    const tenantId = (req.headers['x-tenant-id'] as string) || '';
    const reason = req.body?.reason || '';

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'x-tenant-id header is required' }
      });
    }

    const result = await tenantAccountService.closeAccount(authHeader, tenantId, reason);

    res.json(result);
  } catch (error: any) {
    console.error('[TenantAccountRoutes] POST /close-account error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: { code: 'CLOSE_ACCOUNT_ERROR', message: error.message || 'Failed to close account' }
    });
  }
});

export default router;
