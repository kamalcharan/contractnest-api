// src/routes/onboardingRoutes.ts
// Onboarding routes configuration

import { Router } from 'express';
import * as onboardingController from '../controllers/onboardingController';
import { authenticate } from '../middleware/auth';
import { validateHeaders } from '../validators/commonValidators';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Apply header validation to all routes
router.use(validateHeaders);

/**
 * GET /api/onboarding/status
 * Get current onboarding status for the tenant
 */
router.get('/status', onboardingController.getOnboardingStatus);

/**
 * POST /api/onboarding/initialize
 * Initialize onboarding for a new tenant
 */
router.post('/initialize', onboardingController.initializeOnboarding);

/**
 * POST /api/onboarding/step/complete
 * Mark a step as completed with optional data
 */
router.post('/step/complete', onboardingController.completeOnboardingStep);

/**
 * PUT /api/onboarding/step/skip
 * Skip an optional onboarding step
 */
router.put('/step/skip', onboardingController.skipOnboardingStep);

/**
 * PUT /api/onboarding/progress
 * Update onboarding progress (save current state)
 */
router.put('/progress', onboardingController.updateOnboardingProgress);

/**
 * POST /api/onboarding/complete
 * Mark entire onboarding as complete
 */
router.post('/complete', onboardingController.completeOnboarding);

/**
 * GET /api/onboarding/test
 * Test connectivity to onboarding edge function
 */
router.get('/test', onboardingController.testOnboardingConnection);

export default router;