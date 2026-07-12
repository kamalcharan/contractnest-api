// ============================================================================
// Public Session Check-in Routes — mounted at /api/checkin (see index.ts)
// ============================================================================
// NO authentication: these drive the member-facing check-in page. Every route
// is gated by the opaque token in the URL; the RPCs resolve tenant + occurrence
// from it. Keep this router free of `authenticate`.

import express from 'express';
import sessionCheckinController from '../controllers/sessionCheckinController';

const router = express.Router();

// GET  /api/checkin/:token                          → resolve today's occurrence
router.get('/:token', sessionCheckinController.resolve);
// POST /api/checkin/:token/lookup   body:{ phone }  → match a roster member
router.post('/:token/lookup', sessionCheckinController.lookup);
// GET  /api/checkin/:token/member/:memberId/history → attendance + BAU billing
router.get('/:token/member/:memberId/history', sessionCheckinController.history);
// POST /api/checkin/:token/submit                   → attendance (+ optional dues)
router.post('/:token/submit', sessionCheckinController.submit);

export default router;
