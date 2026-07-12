// ============================================================================
// Sandbox Routes — mounted at /api/sandbox (see index.ts)
// ============================================================================
// Authenticated; tenant-scoped via x-tenant-id. Clears transactional data only.

import express from 'express';
import sandboxController from '../controllers/sandboxController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

// GET  /api/sandbox/preview   → counts of what would be deleted
router.get('/preview', sandboxController.preview);
// POST /api/sandbox/reset     body:{ include_contacts?, include_equipment? }
router.post('/reset', sandboxController.reset);

export default router;
