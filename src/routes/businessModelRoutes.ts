// src/routes/businessModelRoutes.ts

import express from 'express';
import * as planController from '../controllers/planController';
import * as planVersionController from '../controllers/planVersionController';
import { 
  createPlanValidation, 
  updatePlanValidation, 
  togglePlanVisibilityValidation
  // Note: createPlanVersionValidation not needed anymore
} from '../validators/businessModel';

const router = express.Router();

// Plan routes
router.get('/plans', planController.getPlans);
router.get('/plans/:id', planController.getPlan);
router.get('/plans/:id/edit', planController.getPlanForEdit);
router.post('/plans', createPlanValidation, planController.createPlan);
router.post('/plans/edit', createPlanValidation, planController.updatePlanAsNewVersion); // Edit creates version
router.put('/plans/:id', updatePlanValidation, planController.updatePlan);
router.put('/plans/:id/visibility', togglePlanVisibilityValidation, planController.togglePlanVisibility);
router.put('/plans/:id/archive', planController.archivePlan);

// Plan version routes (simplified)
router.get('/plan-versions', planVersionController.getPlanVersions);
router.get('/plan-versions/:id', planVersionController.getPlanVersion);
router.put('/plan-versions/:id/activate', planVersionController.activatePlanVersion);

// DEPRECATED: Keep for backward compatibility but mark as deprecated
router.post('/plan-versions', planVersionController.createPlanVersionDeprecated); // Removed validation
router.get('/plan-versions/compare', planVersionController.compareVersionsDeprecated);

export default router;
  