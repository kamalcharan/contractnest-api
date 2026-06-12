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

/**
 * POST /api/onboarding/selected-resources   (Sprint 1 / S8)
 * Persist the tenant's resource-template picks from ResourcePickStep.
 * Body: { selections: [{ resource_template_id, purpose: 'sell'|'own' }], source? }
 * Upserts on (tenant_id, resource_template_id, purpose) — safe to retry.
 */
router.post('/selected-resources', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ success: false, error: 'x-tenant-id header is required' });

    const { selections, source } = req.body || {};
    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ success: false, error: 'selections must be a non-empty array' });
    }
    const invalid = selections.find(
      (s: any) => !s?.resource_template_id || !['sell', 'own'].includes(s?.purpose),
    );
    if (invalid) {
      return res.status(400).json({ success: false, error: 'each selection needs resource_template_id and purpose (sell|own)' });
    }

    const { persistSelectedResources } = await import('../services/onboardingIntentService');
    const result = await persistSelectedResources(
      tenantId,
      selections,
      source === 'settings' || source === 'agent' ? source : 'onboarding',
      (req as any).user?.id || null,
      req.headers.authorization,
    );

    if (result.errors.length > 0) {
      return res.status(500).json({ success: false, error: result.errors.join('; ') });
    }
    return res.status(200).json({ success: true, data: { persisted: result.persisted } });
  } catch (error: any) {
    console.error('[OnboardingRoutes] selected-resources error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/onboarding/selected-resources   (Sprint 1 / S8)
 * Read back the tenant's persisted picks (optionally ?purpose=sell|own).
 */
router.get('/selected-resources', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ success: false, error: 'x-tenant-id header is required' });

    const purpose = req.query.purpose as 'sell' | 'own' | undefined;
    const { getSelectedResources } = await import('../services/onboardingIntentService');
    const rows = await getSelectedResources(
      tenantId,
      purpose === 'sell' || purpose === 'own' ? purpose : undefined,
      req.headers.authorization,
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    console.error('[OnboardingRoutes] selected-resources GET error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;