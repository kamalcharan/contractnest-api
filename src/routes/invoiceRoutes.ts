// ============================================================================
// Invoice Routes — mounted at /api/invoices
// ============================================================================
// Standalone (non-contract-scoped) invoice operations. Contract-linked
// invoice/payment routes remain under /api/contracts/:id/invoices/* — see
// contractRoutes.ts. Authenticated; tenant/environment read from headers.
// ============================================================================

import express from 'express';
import invoiceController from '../controllers/invoiceController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

// POST /api/invoices/adhoc → create a contact-less invoice, settled at creation
router.post('/adhoc', invoiceController.createAdhocInvoice);

export default router;
