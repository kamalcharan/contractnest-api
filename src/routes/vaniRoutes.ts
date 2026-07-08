// ============================================================================
// VaNi routes — vani-trial-and-briefing batch
// Mounted at /api/vani (see src/index.ts registration).
// Mirrors financeRoutes middleware chain:
//   authenticate → ensureTenant → rate limit → controller
// ============================================================================

import express from 'express';
import VaniDeskController from '../controllers/vaniDeskController';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const vaniDeskController = new VaniDeskController();

// Authentication for all VaNi routes
router.use(authenticate);

// Tenant ID validation
const ensureTenant = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'x-tenant-id header is required'
      },
      metadata: { timestamp: new Date().toISOString() }
    });
  }
  next();
};

router.use(ensureTenant);

// Rate limits: generous reads, stricter writes (trial start is a write)
const vaniReadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many VaNi requests, please try again later' }
  }
});

const vaniActionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many VaNi actions, please try again later' }
  }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Entitlement + trial state (landing page CTA states)
router.get('/entitlement', vaniReadRateLimit, vaniDeskController.getEntitlement);

// Start the 7-day trial (idempotent — safe on double-click/retry)
router.post('/trial/start', vaniActionRateLimit, vaniDeskController.startTrial);

// Briefing page payload (entitlement-gated in the controller)
router.get('/briefing', vaniReadRateLimit, vaniDeskController.getBriefing);

// Automation rules — read is free for every tenant; EDIT is the paywall
router.get('/rules', vaniReadRateLimit, vaniDeskController.getRules);
router.put('/rules/:ruleKey', vaniActionRateLimit, vaniDeskController.updateRule);

export default router;
