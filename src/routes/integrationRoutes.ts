import express from 'express';
import * as integrationController from '../controllers/integrationController';
import { createIntegrationValidation, testConnectionValidation, toggleStatusValidation } from '../validators/integrationValidators';

const router = express.Router();

// Get integrations (handles all types, by type, or specific one based on query params)
router.get('/integrations', integrationController.getIntegrations);

// Test integration connection
router.post('/integrations/test', testConnectionValidation, integrationController.testIntegration);

// Create or update integration
router.post('/integrations', createIntegrationValidation, integrationController.createUpdateIntegration);

// Toggle integration status
// URL is /integrations/:id/status to match the UI (INTEGRATIONS.TOGGLE_STATUS
// in serviceURLs.ts) and the sibling /service-catalog/services/:id/status
// convention. Before 2026-08-01 this was mounted at /integrations/status/:id
// so every UI toggle click 404-ed silently — reason BBB's built-in WhatsApp
// switch never actually re-enabled the channel through the settings page.
router.put('/integrations/:id/status', toggleStatusValidation, integrationController.toggleIntegrationStatus);

// Delete a tenant integration (remove the stored config)
router.delete('/integrations/:id', integrationController.deleteIntegration);

export default router;