// src/routes/businessModelRoutes.ts
// UPDATED: Added optional request context middleware
// Supports: x-product, x-idempotency-key headers
// Updated: January 2025

import express from 'express';
import * as planController from '../controllers/planController';
import * as planVersionController from '../controllers/planVersionController';
import {
  createPlanValidation,
  updatePlanValidation,
  togglePlanVisibilityValidation
} from '../validators/businessModel';
import { requestContextMiddleware } from '../middleware/requestContext';

const router = express.Router();

// Apply request context middleware to all routes
// This extracts: authToken, tenantId, productCode, idempotencyKey
router.use(requestContextMiddleware);

// ==========================================
// Plan routes
// ==========================================

// GET /plans - List all plans (filtered by x-product header)
router.get('/plans', planController.getPlans);

// GET /plans/:id - Get specific plan
router.get('/plans/:id', planController.getPlan);

// GET /plans/:id/edit - Get plan for editing (with version info)
router.get('/plans/:id/edit', planController.getPlanForEdit);

// POST /plans - Create new plan (supports x-idempotency-key)
router.post('/plans', createPlanValidation, planController.createPlan);

// POST /plans/edit - Edit creates new version (supports x-idempotency-key)
router.post('/plans/edit', createPlanValidation, planController.updatePlanAsNewVersion);

// PUT /plans/:id - Update plan metadata (supports x-idempotency-key)
router.put('/plans/:id', updatePlanValidation, planController.updatePlan);

// PUT /plans/:id/visibility - Toggle visibility (supports x-idempotency-key)
router.put('/plans/:id/visibility', togglePlanVisibilityValidation, planController.togglePlanVisibility);

// PUT /plans/:id/archive - Archive plan (supports x-idempotency-key)
router.put('/plans/:id/archive', planController.archivePlan);

// ==========================================
// Plan version routes (simplified)
// ==========================================

// GET /plan-versions - List versions for a plan
router.get('/plan-versions', planVersionController.getPlanVersions);

// GET /plan-versions/:id - Get specific version
router.get('/plan-versions/:id', planVersionController.getPlanVersion);

// PUT /plan-versions/:id/activate - Activate a version
router.put('/plan-versions/:id/activate', planVersionController.activatePlanVersion);

// ==========================================
// DEPRECATED routes (backward compatibility)
// ==========================================

// POST /plan-versions - Create version (deprecated, use POST /plans/edit)
router.post('/plan-versions', planVersionController.createPlanVersionDeprecated);

// GET /plan-versions/compare - Compare versions (deprecated, removed)
router.get('/plan-versions/compare', planVersionController.compareVersionsDeprecated);

export default router;
