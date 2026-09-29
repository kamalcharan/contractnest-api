// ============================================================================
// Public VaNi Site Routes — mounted at /api/vani-site (see index.ts)
// ============================================================================
// NO authentication: these drive the chat that embed.js opens on a tenant's
// own website (data-vani="vn-…") and the "Ask VaNi" panel on the package page
// (key = sf-…). The key is the credential; the tenant's VaNi flag and domain
// list are checked in the controller. Keep this router free of `authenticate`.

import express from 'express';
import rateLimit from 'express-rate-limit';
import vaniSiteController from '../controllers/vaniSiteController';

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const readLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 300,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again shortly' } } });
// a model call per message: bounded per IP
const chatLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 60,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many messages, please slow down' } } });
const leadLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' } } });

// GET  /api/vani-site/:key[?storefront=sf-…]   → greeting, seller, packages, FAQ, hand-off, domain_ok
router.get('/:key', readLimit, vaniSiteController.resolve);
// POST /api/vani-site/:key/chat   {message, session_id?, storefront_key?, page_url?, history?}
router.post('/:key/chat', chatLimit, vaniSiteController.chat);
// POST /api/vani-site/:key/lead   {session_id?, name, phone, email?, company?}
router.post('/:key/lead', leadLimit, vaniSiteController.lead);

export default router;
