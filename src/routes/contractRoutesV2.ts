// src/routes/contractRoutesV2.ts
// JTD Nucleus initiative — Milestone 1. New, versioned sibling of
// contractRoutes.ts. That file is untouched. One endpoint only, for now:
// POST /api/v2/contracts — everything else (list/get/update/status/etc.)
// still goes through the V1 routes.

import express from 'express';
import ContractControllerV2 from '../controllers/contractControllerV2';
import { authenticate } from '../middleware/auth';

const router = express.Router();
const contractControllerV2 = new ContractControllerV2();

router.use(authenticate);

const ensureTenant = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'x-tenant-id header is required'
      },
      metadata: { timestamp: new Date().toISOString() }
    });
  }
  next();
};

router.use(ensureTenant);

/**
 * @route POST /api/v2/contracts
 * @description Create new contract via create_contract_transaction_v2
 * @header {string} x-idempotency-key - Idempotency key (recommended)
 * @body {CreateContractRequest} - same shape as POST /api/contracts
 * @returns {ContractDetail} 201 Created
 */
router.post('/', contractControllerV2.createContract);

/**
 * @route GET /api/v2/contracts/:id/details
 * @description JTD Nucleus Step 3 — single-call contract view aggregate:
 * contract + blocks + events (n_jtd jobs; legacy events fallback for
 * pre-nucleus contracts) + CNAK + invoices. One round-trip instead of 4.
 */
router.get('/:id/details', contractControllerV2.getContractDetails);

/**
 * @route PATCH /api/v2/contracts/:id/status
 * @description V2 status transition — activation materializes n_jtd job
 * rows from computed_events, then delegates to the untouched V1 engine.
 */
router.patch('/:id/status', contractControllerV2.updateContractStatus);

/**
 * @route POST /api/v2/contracts/:id/record-payment
 * @description JTD Nucleus Step 4 — V2 payment. Receipt / invoice header /
 * auto-activation via the untouched V1 core; settlement lands on n_jtd JOB
 * rows (allocations carry jtd_id; job → paid / partial_payment). Same body
 * as V1's POST /api/contracts/:id/invoices/record-payment.
 */
router.post('/:id/record-payment', contractControllerV2.recordPayment);

/**
 * @route POST /api/v2/contracts/bulk-create
 * @description V2 sibling of POST /api/contracts/bulk-create — bulk template
 * assignment where each item is created via create_contract_transaction_v2
 * (one engine for single and bulk) with fail-closed already-assigned dedup.
 * @body {{ template_id?: string, activate?: boolean,
 *          items: Array<{ buyer_id: string, request: CreateContractRequest }> }}
 * @returns {{ results: [...], summary: { total, created, skipped, failed } }}
 */
router.post('/bulk-create', contractControllerV2.bulkCreateContracts);

export default router;
