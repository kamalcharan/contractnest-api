// ============================================================================
// Public RFQ (vendor quote) Routes — mounted at /api/quote (see index.ts)
// ============================================================================
// NO authentication: these drive the vendor-facing quote page. Every route is
// gated by the (cnak, secret) pair in the URL; the RPCs resolve the RFQ, the
// tenant and WHICH VENDOR is answering from that pair. Keep this router free
// of `authenticate` — a vendor is a contact, not a tenant, and has no account.
// ============================================================================

import express from 'express';
import rfqController from '../controllers/rfqController';

const router = express.Router();

// Same reasoning as the public check-in router: one RFQ link is opened on many
// different devices by different vendors, and every vendor's response differs.
// A cached resolve would show one vendor another's state. Mobile browsers and
// carrier proxies cache GETs that carry no explicit directive, so this cannot
// rely on defaults.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// GET  /api/quote/:cnak/:secret   → the RFQ, its blocks, and THIS vendor's row
router.get('/:cnak/:secret', rfqController.resolve);

// POST /api/quote/:cnak/:secret   → submit or revise a quote, or decline
//   body: { quoted_amount?, quote_notes?, breakdown?, valid_until?,
//           decline?, decline_reason? }
router.post('/:cnak/:secret', rfqController.submit);

export default router;
