// ============================================================================
// Public Storefront Routes — mounted at /api/storefront (see index.ts)
// ============================================================================
// NO authentication: these drive the hosted package page /p/:key, the
// checkout /buy/:key and the widget frame /w/:key. Every route is gated by the
// opaque storefront key in the URL; the RPCs resolve tenant + packages from it
// and never expose config/wizard internals. Keep this router free of
// `authenticate`.

import express from 'express';
import rateLimit from 'express-rate-limit';
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

const readLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 300,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again shortly' } } });
const writeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 40,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again shortly' } } });
// OTP sends cost money: 10 per IP per 15 minutes on top of the RPC's 3-per-phone rule
const otpLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many codes requested, please try again later' } } });

// GET  /api/storefront/:key[?preview=1]   → seller, card style, FAQ, packages
router.get('/:key', readLimit, extendController.resolveStorefront);
// POST /api/storefront/:key/start         → checkout opened (counter only)
router.post('/:key/start', readLimit, extendController.markStarted);
// POST /api/storefront/:key/otp           body:{phone}         → {otp_id, expires_in}
router.post('/:key/otp', otpLimit, extendController.otpIssue);
// POST /api/storefront/:key/otp/verify    body:{otp_id, code}  → {verify_token, phone}
router.post('/:key/otp/verify', writeLimit, extendController.otpVerify);
// POST /api/storefront/:key/identify      body:{name, phone, otp_token, template_id?, email?, company?, channel?}
//      → the verified buyer is a lead now, whether or not they finish (migration 039)
router.post('/:key/identify', writeLimit, extendController.identify);
// POST /api/storefront/:key/purchase      body:{name, phone, otp_token, template_id?, email?, company?}
//      → contact in seller's book + contract + CNAK review link
router.post('/:key/purchase', writeLimit, extendController.purchase);

export default router;
