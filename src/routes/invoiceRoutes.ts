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
// GET /api/invoices/:id — the document behind an invoice, contract-optional
router.get('/:id', invoiceController.getInvoice);
// POST /api/invoices/:id/send { channel } → queue one payment request.
// Gated by the tenant's notif_payment_request automation rule; carries a
// Razorpay link or the tenant's UPI/QR depending on what they have configured.
router.post('/:id/send', invoiceController.sendInvoice);

export default router;
