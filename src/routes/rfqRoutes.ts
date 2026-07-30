// ============================================================================
// RFQ (buyer) Routes — mounted at /api/rfq
// ============================================================================
// Authenticated tenant endpoints. Today this is the award action only: the
// read side of an RFQ is already served by the existing contract detail
// endpoint, which returns t_contract_vendors with every quote on it.
// ============================================================================

import express from 'express';
import rfqController from '../controllers/rfqController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

// POST /api/rfq/:contractId/award   body:{ vendor_id, note? }
//   Marks the winner accepted, the rest declined, RFQ → 'awarded'.
//   Deliberately does NOT create a contract — the vendor initiates that.
router.post('/:contractId/award', rfqController.award);

export default router;
