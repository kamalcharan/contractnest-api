// src/routes/evidencePublicRoutes.ts
// ============================================================================
// Public evidence routes — mounted at /api/public/evidence (see src/index.ts)
// ============================================================================
// NO authentication. This is the network-effect path from the spec: a buyer who
// has never used ContractNest follows the link they were sent and verifies the
// proof of what they are paying for, without signing up first.
//
// Every route is gated by CNAK + secret in the URL, which contract_membership()
// checks against t_contract_access — scoped to one contract, active, unexpired.
// Keep this router free of `authenticate`.
//
//   GET /:cnak/:secret/contract/:contractId   evidence on that contract
//   GET /:cnak/:secret/:evidenceId/url        a short-TTL read URL for one file
// ============================================================================

import express from 'express';
import rateLimit from 'express-rate-limit';
import evidenceController from '../controllers/evidenceController';

const router = express.Router();

// Signed URLs and access decisions must never be cached. The same link is
// opened on many different devices, and a cached response would hand one
// viewer a URL minted for another — or keep serving after a revoke.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Unauthenticated and bearer-key gated, so bounded harder than the authed side:
// this is the surface where a leaked link would be replayed.
const publicLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } }
});

router.get('/:cnak/:secret/contract/:contractId', publicLimit, evidenceController.publicList);
router.get('/:cnak/:secret/:evidenceId/url', publicLimit, evidenceController.publicReadUrl);

export default router;
