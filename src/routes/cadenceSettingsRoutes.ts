// ============================================================================
// Cadence Settings Routes — mounted at /api/settings/cadence (see index.ts)
// ============================================================================
// Tenant-level holiday calendar + default shift policy for smart Service Cycles.

import express from 'express';
import cadenceSettingsController from '../controllers/cadenceSettingsController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// All routes require an authenticated tenant.
router.use(authenticate);

// GET    /api/settings/cadence            → { weekly_holidays, default_shift, holidays }
router.get('/', cadenceSettingsController.getSettings);
// PUT    /api/settings/cadence            body: { weekly_holidays:number[], default_shift:'next'|'previous' }
router.put('/', cadenceSettingsController.updateSettings);
// POST   /api/settings/cadence/holidays   body: { date:'YYYY-MM-DD', label?:string }
router.post('/holidays', cadenceSettingsController.addHoliday);
// DELETE /api/settings/cadence/holidays?date=YYYY-MM-DD
router.delete('/holidays', cadenceSettingsController.removeHoliday);

export default router;
