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
// GET  /api/checkin/:token/form                     → check-in Smart Form schema
router.get('/:token/form', sessionCheckinController.form);
// GET  /api/checkin/:token/payment-config           → Offline UPI VPA (if configured)
router.get('/:token/payment-config', sessionCheckinController.paymentConfig);
// POST /api/checkin/:token/lookup   body:{ phone }  → match a roster member
router.post('/:token/lookup', sessionCheckinController.lookup);
// POST /api/checkin/:token/device-lookup  body:{ device_token }  → recognise a returning browser
router.post('/:token/device-lookup', sessionCheckinController.deviceLookup);
// POST /api/checkin/:token/guest      → save a guest contact + mark present
router.post('/:token/guest', sessionCheckinController.guest);
// POST /api/checkin/:token/substitute → save substitute as member's alt contact + mark member present
router.post('/:token/substitute', sessionCheckinController.substitute);
// GET  /api/checkin/:token/member/:memberId/history → attendance + BAU billing
router.get('/:token/member/:memberId/history', sessionCheckinController.history);
// POST /api/checkin/:token/submit                   → attendance (+ optional dues)
router.post('/:token/submit', sessionCheckinController.submit);

export default router;
