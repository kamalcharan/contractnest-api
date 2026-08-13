// ============================================================================
// Extend Routes (authenticated) — mounted at /api/extend (see index.ts)
// ============================================================================
// Touchpoint management for the /extend page: list, publish a template to a
// route, pause/resume. Tenant scoping via x-tenant-id, same header contract
// as catalog-studio routes.

import express, { Request, Response, NextFunction } from 'express';
import extendController from '../controllers/extendController';

const router = express.Router();

const validateHeaders = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authorization header is required' },
    });
    return;
  }
  if (!tenantId || typeof tenantId !== 'string') {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'x-tenant-id header is required' },
    });
    return;
  }
  next();
};

router.use(validateHeaders);

// GET   /api/extend/touchpoints              → this tenant's touchpoints
router.get('/touchpoints', extendController.listTouchpoints);
// POST  /api/extend/touchpoints              body:{template_id, touchpoint_type}
router.post('/touchpoints', extendController.createTouchpoint);
// PATCH /api/extend/touchpoints/:id          body:{is_active}
router.patch('/touchpoints/:id', extendController.setTouchpointActive);

export default router;
