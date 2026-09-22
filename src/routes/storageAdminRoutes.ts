// src/routes/storageAdminRoutes.ts
// ============================================================================
// Storage admin routes — mounted at /api/admin/storage (see src/index.ts)
// ============================================================================
// Platform-admin only. The sweep runs itself on a timer; these exist so it can
// be inspected and triggered on demand rather than waited for.
//
//   GET  /sweep/status   what a sweep would find, touching nothing
//   POST /sweep          run one now (skips the due() check)
//   GET  /overview       every prefix in the bucket, classified, with owners
//   GET  /browse         what is actually inside one prefix
//   POST /prefix/delete  remove a legacy / unaccounted-for prefix
//   GET  /view           a short-lived link to look at one object
//
// The delete is the only destructive action here and the only one that
// removes files a tenant uploaded. contracts/ and tenants/ are refused by
// the service regardless of what is posted.
// ============================================================================

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireAdmin } from '../middleware/auth';
import { storageCleanupService } from '../services/storageCleanupService';
import { storageAdminService } from '../services/storageAdminService';

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

// A sweep deletes objects, so it is rate limited well below what a human needs.
const sweepLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/sweep/status', async (_req: express.Request, res: express.Response) => {
  const status = await storageCleanupService.status();
  res.status(200).json({
    success: true,
    data: status,
    metadata: { timestamp: new Date().toISOString() },
  });
});

router.post('/sweep', sweepLimit, async (req: express.Request, res: express.Response) => {
  const rawLimit = Number(req.body?.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 1000) : undefined;

  const summary = await storageCleanupService.runSweep({ force: true, limit });

  // A skipped sweep is not an error — it is the honest answer to "run now".
  // 'not_configured' is a 500 like everywhere else in this feature: a 503
  // would be cached by the UI's maintenance interceptor and lock the session.
  const status = summary.skipped === 'not_configured' || summary.skipped === 'no_database' ? 500 : 200;

  res.status(status).json({
    success: status === 200,
    data: summary,
    metadata: { timestamp: new Date().toISOString() },
  });
});

router.get('/overview', async (_req: express.Request, res: express.Response) => {
  const data = await storageAdminService.overview();
  res.status(data.success ? 200 : 500).json({
    success: data.success,
    data,
    metadata: { timestamp: new Date().toISOString() },
  });
});

router.get('/browse', async (req: express.Request, res: express.Response) => {
  const prefix = String(req.query.prefix ?? '');
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 1000) : 200;

  const result = await storageAdminService.browse(prefix, limit);
  res.status(result.success ? 200 : result.reason === 'invalid_prefix' ? 400 : 500).json({
    success: result.success,
    data: result.data,
    error: result.success ? undefined : { code: result.reason },
    metadata: { timestamp: new Date().toISOString() },
  });
});

// Destructive. Rate limited, and the prefix must be echoed back in `confirm`
// so a mis-click cannot delete a folder — the UI asks the admin to type it.
router.post('/prefix/delete', sweepLimit, async (req: express.Request, res: express.Response) => {
  const prefix = String(req.body?.prefix ?? '');
  const confirm = String(req.body?.confirm ?? '');

  if (!prefix || confirm !== prefix) {
    res.status(400).json({
      success: false,
      error: { code: 'CONFIRMATION_MISMATCH', message: 'confirm must repeat the prefix exactly' },
      metadata: { timestamp: new Date().toISOString() },
    });
    return;
  }

  const result = await storageAdminService.remove(prefix);
  const status = result.success ? 200 : result.reason === 'protected_prefix' || result.reason === 'invalid_prefix' ? 400 : 500;
  res.status(status).json({
    success: result.success,
    data: result,
    error: result.success ? undefined : { code: result.reason },
    metadata: { timestamp: new Date().toISOString() },
  });
});

// A short-lived link to inspect one object. Not limited to the live
// namespaces on purpose: legacy and orphaned files have no other viewer, and
// looking before deleting is the point of this screen.
router.get('/view', async (req: express.Request, res: express.Response) => {
  const objectPath = String(req.query.path ?? '');
  const result = await storageAdminService.viewUrl(objectPath);
  res.status(result.success ? 200 : result.reason === 'invalid_path' ? 400 : 500).json({
    success: result.success,
    data: result.success ? { url: result.url } : undefined,
    error: result.success ? undefined : { code: result.reason },
    metadata: { timestamp: new Date().toISOString() },
  });
});

export default router;
