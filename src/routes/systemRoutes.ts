// src/routes/systemRoutes.ts
import express from 'express';
import * as systemController from '../controllers/systemController';
import { authenticate } from '../middleware/auth'; // Changed from authMiddleware to authenticate

const router = express.Router();

// Public endpoints (no auth required)
router.get('/system/maintenance/status', systemController.getMaintenanceStatus);
router.get('/system/health', systemController.getHealthStatus);

// Protected endpoint (requires auth)
router.get('/system/session/status', authenticate, systemController.getSessionStatus);

export default router;