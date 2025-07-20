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
router.put('/integrations/status/:id', toggleStatusValidation, integrationController.toggleIntegrationStatus);

export default router;