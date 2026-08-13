// ============================================================================
// Public Storefront Routes — mounted at /api/storefront (see index.ts)
// ============================================================================
// NO authentication: these drive the hosted checkout page /buy/:key. Every
// route is gated by the opaque storefront key in the URL; the RPCs resolve
// tenant + template from it and never expose config/wizard internals.
// Keep this router free of `authenticate`.

import express, { Request, Response, NextFunction } from 'express';
import extendController from '../controllers/extendController';

const router = express.Router();

// Same no-cache posture as the public check-in router: the same link is
// opened by many different buyers on many different phones, and carrier
// proxies cache GETs with no explicit directive.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Light in-memory throttle: this is a public, unauthenticated surface that
// writes rows on POST. Not a real rate limiter — a tripwire against dumb
// loops. 60 requests/min per IP, window resets each minute.
const hits = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
router.use((req: Request, res: Response, next: NextFunction) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    if (hits.size > 10_000) hits.clear(); // memory backstop
    next();
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) {
    res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
    return;
  }
  next();
});

// GET  /api/storefront/:key            → display-safe template + seller info
router.get('/:key', extendController.resolveStorefront);
// POST /api/storefront/:key/purchase   body:{name, company?, email?, phone?}
//      → contact in seller's book + contract + CNAK review link
router.post('/:key/purchase', extendController.purchase);

export default router;
