// ============================================================================
// Session Check-in (chair) Routes — mounted at /api/session-checkin
// ============================================================================
// Authenticated tenant/chair endpoints: mint the static QR token for a session
// contract and confirm the BAU payments members declared at check-in.

import express from 'express';
import sessionCheckinController from '../controllers/sessionCheckinController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

// POST /api/session-checkin/token        body:{ contract_id }        → { token }
router.post('/token', sessionCheckinController.ensureToken);
// GET  /api/session-checkin/declarations                              → pending list
router.get('/declarations', sessionCheckinController.pendingDeclarations);
// POST /api/session-checkin/declarations/:id/confirm  body:{ confirm } → settle/reject
router.post('/declarations/:id/confirm', sessionCheckinController.confirmDeclaration);

export default router;
