// src/routes/evidenceRoutes.ts
// ============================================================================
// Evidence routes — mounted at /api/evidence (see src/index.ts)
// ============================================================================
// The ONLY door to storage. Firebase security rules deny all direct client
// access; every byte in or out passes through here and is authorised in
// Postgres by contract_membership() first.
//
//   POST   /slot                              evidence_request_slot  → signed PUT url
//   POST   /:evidenceId/confirm               evidence_confirm       (true size read back)
//   GET    /:evidenceId/url                   evidence_resolve_read  → signed GET url
//   GET    /contract/:contractId              evidence_list_for_contract
//   DELETE /:evidenceId                       evidence_mark_deleted
//   GET    /usage                             evidence_usage
//   POST   /contract/:contractId/revoke-access revoke_contract_access
// ============================================================================

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import evidenceController from '../controllers/evidenceController';

const router = express.Router();

router.use(authenticate);

router.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'x-tenant-id header is required' },
      metadata: { timestamp: new Date().toISOString() }
    });
    return;
  }
  next();
});

const readLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } }
});

// An upload slot is cheap to ask for and reserves a registry row, so it is
// bounded more tightly than reads — a loop that never confirms would otherwise
// leave orphans for the sweeper.
const writeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many uploads, please slow down' } }
});

router.get('/usage', readLimit, evidenceController.usage);
router.post('/slot', writeLimit, evidenceController.slot);
router.post('/:evidenceId/confirm', writeLimit, evidenceController.confirm);
router.get('/:evidenceId/url', readLimit, evidenceController.readUrl);
router.delete('/:evidenceId', writeLimit, evidenceController.remove);
router.get('/contract/:contractId', readLimit, evidenceController.listForContract);
router.post('/contract/:contractId/revoke-access', writeLimit, evidenceController.revokeAccess);

export default router;
