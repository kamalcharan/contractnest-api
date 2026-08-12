// src/routes/paymentGatewayRoutes.ts
// Payment gateway routes — online payment operations via Razorpay/Stripe/etc.
// All routes require authentication + x-tenant-id header.

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import PaymentGatewayController from '../controllers/paymentGatewayController';

const router = Router();
const controller = new PaymentGatewayController();

// All payment gateway routes require authentication
router.use(authenticate);

// Ensure tenant ID header is present
router.use((req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] as string;
  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: 'x-tenant-id header is required',
      code: 'MISSING_TENANT_ID'
    });
  }
  next();
});

// ─── Routes ──────────────────────────────────────────────────

// Create order for terminal checkout (Razorpay Standard Checkout popup)
router.post('/create-order', controller.createOrder);

// Create payment link for email/WhatsApp delivery
router.post('/create-link', controller.createLink);

// Verify payment after checkout callback (signature verification + receipt)
router.post('/verify-payment', controller.verifyPayment);

// Get payment requests & events for an invoice or contract
router.post('/status', controller.getPaymentStatus);

export default router;
