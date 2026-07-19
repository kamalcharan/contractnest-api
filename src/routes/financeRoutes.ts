// ============================================================================
// Finance routes — Stage 1 Finance AR/AP
// Mounted at /api/finance (see src/index.ts registration).
// Mirrors contractEventRoutes middleware chain:
//   authenticate → ensureTenant → rate limit → validators → controller
// ============================================================================

import express from 'express';
import FinanceController from '../controllers/financeController';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import {
  invoiceActionValidation,
  cancelInvoiceValidation
} from '../validators/financeValidators';

const router = express.Router();
const financeController = new FinanceController();

// Authentication for all finance routes
router.use(authenticate);

// Tenant ID validation
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

// Rate limits: generous reads, stricter writes
const financeReadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many finance requests, please try again later' }
  }
});

const financeActionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many finance actions, please try again later' }
  }
});

router.use(financeReadRateLimit);

/**
 * GET /api/finance/receivables
 * Tenant-level AR: summary (ageing/upcoming), who-owes, invoice worklist.
 */
router.get('/receivables', financeController.getReceivables);

/**
 * GET /api/finance/payables
 * Buyer mirror: own vendor-contract invoices + claimed-contract invoices.
 */
router.get('/payables', financeController.getPayables);

/**
 * GET /api/finance/tax-summary
 * Sprint 4 — month-wise tax records (taxable value, tax invoiced,
 * tax collected approx, component split). Same view for both personas'
 * own tenant tax data.
 */
router.get('/tax-summary', financeController.getTaxSummary);

/**
 * POST /api/finance/invoices/:invoiceId/approve
 * Approve a scanner-created draft invoice (draft → unpaid).
 */
router.post(
  '/invoices/:invoiceId/approve',
  financeActionRateLimit,
  invoiceActionValidation,
  financeController.approveDraftInvoice
);

/**
 * POST /api/finance/invoices/:invoiceId/remind
 * Manually send a payment_due reminder (email via JTD).
 */
router.post(
  '/invoices/:invoiceId/remind',
  financeActionRateLimit,
  invoiceActionValidation,
  financeController.sendInvoiceReminder
);

/**
 * POST /api/finance/invoices/:invoiceId/cancel
 * Cancel an invoice (reuses cancel_or_writeoff_invoice; drafts + open).
 * Body: { contract_id, reason? }
 */
router.post(
  '/invoices/:invoiceId/cancel',
  financeActionRateLimit,
  cancelInvoiceValidation,
  financeController.cancelDraftInvoice
);

/**
 * GET /api/finance/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'finance',
    timestamp: new Date().toISOString()
  });
});

export default router;
