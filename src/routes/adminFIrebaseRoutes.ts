import express from 'express';
import * as firebaseController from '../controllers/firebaseController';
import { authenticate, requireRole } from '../middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Admin-only routes - requiring 'admin' role
const adminRequired = requireRole(['admin']);

// Firebase diagnostic routes
router.get('/storage/diagnostic', adminRequired, firebaseController.getDiagnosticInfo);
router.get('/storage/firebase/status', adminRequired, firebaseController.getDiagnosticInfo);

// Tenant folder structure routes
router.get('/storage/tenant-structure', adminRequired, firebaseController.testTenantStructure);
router.post('/storage/tenant-structure', adminRequired, firebaseController.createTenantStructure);

export default router;