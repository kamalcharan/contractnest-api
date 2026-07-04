// ============================================================================
// VaNi Composer Routes — Phase 1.1
// ============================================================================
// Mounted at /api/vani-composer (see src/index.ts).
// Pattern follows contractEventRoutes: authenticate → tenant guard →
// entitlement gate → rate limit.
//
// Business rule: the Agent is a VaNi-subscription feature. /entitlement and
// /health stay open to authenticated tenants (the UI needs them to decide
// whether to show the entry point); the working endpoints are gated.
// ============================================================================

import { Router, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middleware/auth';
import vaniComposerController from '../controllers/vaniComposerController';
import vaniEntitlementService from '../services/vaniEntitlementService';

const router = Router();

router.use(authenticate);

// Tenant guard — composer is strictly tenant-scoped
router.use((req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_TENANT', message: 'x-tenant-id header is required' },
    });
    return;
  }
  next();
});

// Ungated info endpoints (UI decides visibility from these)
router.get('/health', vaniComposerController.health);
router.get('/entitlement', vaniComposerController.entitlement);

// Entitlement gate — everything below is subscriber-only
router.use(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const tenantId = (req.headers['x-tenant-id'] as string) || '';
  const entitled = await vaniEntitlementService.isEntitled(tenantId);
  if (!entitled) {
    res.status(403).json({
      success: false,
      error: {
        code: 'VANI_NOT_ENTITLED',
        message: 'VaNi is not enabled for this workspace. Subscribe to VaNi to use the agent.',
      },
    });
    return;
  }
  next();
});

// Rate limits: the LLM steps are expensive (CPU inference); the deterministic
// steps are cheap and a single canvas run hits three of them.
const llmRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many VaNi requests — try again in a minute' } },
});
const fastRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many VaNi requests — try again in a minute' } },
});

// Per-step pipeline (VaNi Canvas)
router.post('/parse-intent', llmRateLimit, vaniComposerController.parseIntent);
router.post('/resolve-buyer', fastRateLimit, vaniComposerController.resolveBuyer);
// Smart suggestion chips — deterministic, cosmetic
router.get('/suggestions', fastRateLimit, vaniComposerController.suggestions);
// Template tier — deterministic, cheap; templates ARE the cache
router.post('/match-template', fastRateLimit, vaniComposerController.matchTemplate);
router.post('/assemble-from-template', fastRateLimit, vaniComposerController.assembleFromTemplate);
router.post('/shortlist', fastRateLimit, vaniComposerController.shortlist);
router.post('/select-blocks', llmRateLimit, vaniComposerController.selectBlocks);
router.post('/assemble', fastRateLimit, vaniComposerController.assemble);
router.post('/feedback', fastRateLimit, vaniComposerController.feedback);

export default router;
