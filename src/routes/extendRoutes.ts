// ============================================================================
// Extend Routes (authenticated) — mounted at /api/extend (see index.ts)
// ============================================================================
// Storefront management for the /extend page: list, create (packages + card
// style), update (name / packages / card style / FAQ / pause). Real JWT
// authentication (`authenticate`, same as the collections router) — the old
// header-presence check let any string through as a Bearer token. Tenant
// scoping via x-tenant-id.

import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import extendController from '../controllers/extendController';
import vaniSiteController from '../controllers/vaniSiteController';

const router = express.Router();

router.use(authenticate);
router.use((req: Request, res: Response, next: NextFunction): void => {
  if (!req.headers['x-tenant-id'] || typeof req.headers['x-tenant-id'] !== 'string') {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'x-tenant-id header is required' } });
    return;
  }
  next();
});

// GET   /api/extend/storefronts          → {storefronts[], channels{website,whatsapp}, vani_enabled}
router.get('/storefronts', extendController.listStorefronts);
// POST  /api/extend/storefronts          body:{template_ids[], name?, card_style?}
router.post('/storefronts', extendController.createStorefront);
// PATCH /api/extend/storefronts/:id      body:{name?, template_ids?, card_style?, faq?, is_active?}
router.patch('/storefronts/:id', extendController.updateStorefront);

// VaNi on their site (migration 040): the tenant-level chat config
// GET   /api/extend/vani-site            → {config, vani_enabled, seller, month, storefronts}
router.get('/vani-site', vaniSiteController.getConfig);
// PATCH /api/extend/vani-site            body:{greeting?, handoff_mode?, handoff_phone?, capture_mode?, allowed_domains?, storefront_ids?, enabled?}
router.patch('/vani-site', vaniSiteController.updateConfig);

// Legacy (pre-038 UI); kept one release, not used by the new /extend page.
router.get('/touchpoints', extendController.listTouchpoints);
router.patch('/touchpoints/:id', extendController.setTouchpointActive);

export default router;
