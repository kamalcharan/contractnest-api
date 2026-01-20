// backend/src/routes/catalogStudioRoutes.ts
/**
 * Catalog Studio Routes v2.0
 * - Express-validator based validation
 * - Idempotency key requirement for POST/PATCH
 * - Standardized error responses
 */

import express, { Request, Response, NextFunction } from 'express';
import catalogStudioController from '../controllers/catalogStudioController';
import { requestContextMiddleware, requireIdempotencyKey } from '../middleware/requestContext';
import {
  createBlockValidation,
  updateBlockValidation,
  queryBlocksValidation,
  createTemplateValidation,
  updateTemplateValidation,
  copyTemplateValidation,
  queryTemplatesValidation,
  validateIdParam,
  handleValidationErrors
} from '../validators/catalogStudio.validators';

const router = express.Router();

// ============================================
// Middleware
// ============================================

/**
 * Validate required headers (Authorization + x-tenant-id)
 * LEGACY: Kept for backward compatibility, but requestContextMiddleware is preferred
 */
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

  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'x-tenant-id header is required' },
    });
    return;
  }

  next();
};

/**
 * Require admin access
 */
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const isAdmin = req.headers['x-is-admin'] === 'true';

  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
    return;
  }

  next();
};

// ============================================
// Block Routes
// ============================================

// GET /blocks - List all blocks (with pagination support)
router.get(
  '/blocks',
  validateHeaders,
  queryBlocksValidation,
  handleValidationErrors,
  catalogStudioController.getBlocks
);

// GET /blocks/:id - Get single block
router.get(
  '/blocks/:id',
  validateHeaders,
  validateIdParam,
  handleValidationErrors,
  catalogStudioController.getBlockById
);

// POST /blocks - Create block
// Requires idempotency key for safe retries
router.post(
  '/blocks',
  requestContextMiddleware,
  requireIdempotencyKey,
  createBlockValidation,
  handleValidationErrors,
  catalogStudioController.createBlock
);

// PATCH /blocks/:id - Update block
// Requires idempotency key for safe retries
// Supports optimistic locking via expected_version
router.patch(
  '/blocks/:id',
  requestContextMiddleware,
  requireIdempotencyKey,
  updateBlockValidation,
  handleValidationErrors,
  catalogStudioController.updateBlock
);

// DELETE /blocks/:id - Delete block (soft delete)
router.delete(
  '/blocks/:id',
  validateHeaders,
  validateIdParam,
  handleValidationErrors,
  catalogStudioController.deleteBlock
);

// ============================================
// Template Routes
// ============================================

// GET /templates - List tenant templates (with pagination support)
router.get(
  '/templates',
  validateHeaders,
  queryTemplatesValidation,
  handleValidationErrors,
  catalogStudioController.getTemplates
);

// GET /templates/system - List system templates
router.get(
  '/templates/system',
  validateHeaders,
  queryTemplatesValidation,
  handleValidationErrors,
  catalogStudioController.getSystemTemplates
);

// GET /templates/public - List public templates
router.get(
  '/templates/public',
  validateHeaders,
  queryTemplatesValidation,
  handleValidationErrors,
  catalogStudioController.getPublicTemplates
);

// GET /templates/:id - Get single template
router.get(
  '/templates/:id',
  validateHeaders,
  validateIdParam,
  handleValidationErrors,
  catalogStudioController.getTemplateById
);

// POST /templates - Create template
// Requires idempotency key for safe retries
router.post(
  '/templates',
  requestContextMiddleware,
  requireIdempotencyKey,
  createTemplateValidation,
  handleValidationErrors,
  catalogStudioController.createTemplate
);

// POST /templates/:id/copy - Copy template to tenant
// Requires idempotency key for safe retries
router.post(
  '/templates/:id/copy',
  requestContextMiddleware,
  requireIdempotencyKey,
  copyTemplateValidation,
  handleValidationErrors,
  catalogStudioController.copyTemplate
);

// PATCH /templates/:id - Update template
// Requires idempotency key for safe retries
// Supports optimistic locking via expected_version
router.patch(
  '/templates/:id',
  requestContextMiddleware,
  requireIdempotencyKey,
  updateTemplateValidation,
  handleValidationErrors,
  catalogStudioController.updateTemplate
);

// DELETE /templates/:id - Delete template (soft delete)
router.delete(
  '/templates/:id',
  validateHeaders,
  validateIdParam,
  handleValidationErrors,
  catalogStudioController.deleteTemplate
);

// ============================================
// Health Check
// ============================================

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      service: 'catalog-studio',
      version: '2.0',
      status: 'healthy',
      features: [
        'express-validator validation',
        'idempotency key support',
        'optimistic locking support',
        'pagination support'
      ],
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
