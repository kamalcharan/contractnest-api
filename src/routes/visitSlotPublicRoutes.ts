// ============================================================================
// Public Visit Slot Routes — mounted at /api/visit-slot (see index.ts)
// ============================================================================
// NO authentication: these drive the customer-facing /slot/:token page where a
// customer confirms, moves or declines a proposed service visit. The opaque
// slot_token in the URL is the grant (migration jtd-nucleus/015); the RPCs
// resolve tenant + appointment from it. Keep this router free of `authenticate`.

import express from 'express';
import rateLimit from 'express-rate-limit';
import VisitSlotController from '../controllers/visitSlotController';

const router = express.Router();
const controller = new VisitSlotController();

// Fresh every time — the same link is opened on phones behind carrier proxies,
// and a cached "proposed" would hide a confirmation the customer just made.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const readLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again shortly' } } });
const writeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again shortly' } } });

// GET  /api/visit-slot/:token           → what the customer sees
router.get('/:token', readLimit, controller.resolve);
// POST /api/visit-slot/:token/respond   body:{ action, proposed_at?, note? }
router.post('/:token/respond', writeLimit, controller.respond);

export default router;
