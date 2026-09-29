// ============================================================================
// Leads routes — mounted at /api/leads (see src/index.ts)
// ============================================================================
// authenticate → tenant guard → rate limit → controller (the collections
// router's chain). Leads are contacts tagged 'lead' plus their interests
// (migration business-model-v2/039); "Asked you" lists RFQs sent to this tenant.

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import leadsController from '../controllers/leadsController';

const router = express.Router();

router.use(authenticate);
router.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'x-tenant-id header is required' } });
    return;
  }
  next();
});

const readLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 300,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } } });
const writeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many actions, please slow down' } } });

// GET   /api/leads?tab=reach|asked&stage=&q=&limit=&offset=
router.get('/', readLimit, leadsController.list);
// POST  /api/leads/capture   {name, company?, phone?, email?, template_family?, note?}
router.post('/capture', writeLimit, leadsController.capture);
// PATCH /api/leads/:interestId   {stage?, note?}
router.patch('/:interestId', writeLimit, leadsController.setStage);

export default router;
