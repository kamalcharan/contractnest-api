// src/controllers/paymentGatewayController.ts
// Controller for payment gateway operations.
// Extracts context from request → calls service → returns response.

import { Request, Response } from 'express';
import PaymentGatewayService from '../services/paymentGatewayService';

class PaymentGatewayController {
  private paymentGatewayService: PaymentGatewayService;

  constructor() {
    this.paymentGatewayService = new PaymentGatewayService();
  }

  // ─── Helper: extract common context ────────────────────────
  private extractContext(req: Request) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = (req.headers['x-environment'] as string) || 'live';
    const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
    const userId = (req as any).user?.id || '';
    return { tenantId, environment, userJWT, userId };
  }

  // ═══════════════════════════════════════════════════════════
  // POST /api/payments/create-order
  // ═══════════════════════════════════════════════════════════
  createOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, environment, userJWT, userId } = this.extractContext(req);

      if (!tenantId) {
        res.status(400).json({ success: false, error: 'x-tenant-id header is required', code: 'MISSING_TENANT_ID' });
        return;
      }

      const { invoice_id, amount, currency, notes } = req.body;

      if (!invoice_id || !amount) {
        res.status(400).json({ success: false, error: 'invoice_id and amount are required', code: 'VALIDATION_ERROR' });
        return;
      }

      const result = await this.paymentGatewayService.createOrder(
        { invoice_id, amount, currency, notes },
        userJWT, tenantId, userId, environment
      );

      if (!result.success) {
        const status = this.mapErrorCodeToStatus(result.code);
        res.status(status).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[PaymentGatewayController] createOrder error:', error);
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };

  // ═══════════════════════════════════════════════════════════
  // POST /api/payments/create-link
  // ═══════════════════════════════════════════════════════════
  createLink = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, environment, userJWT, userId } = this.extractContext(req);

      if (!tenantId) {
        res.status(400).json({ success: false, error: 'x-tenant-id header is required', code: 'MISSING_TENANT_ID' });
        return;
      }

      const { invoice_id, amount, currency, collection_mode, customer, description, expire_hours, callback_url, notes } = req.body;

      if (!invoice_id || !amount || !collection_mode) {
        res.status(400).json({ success: false, error: 'invoice_id, amount, and collection_mode are required', code: 'VALIDATION_ERROR' });
        return;
      }

      if (!['email_link', 'whatsapp_link'].includes(collection_mode)) {
        res.status(400).json({ success: false, error: 'collection_mode must be email_link or whatsapp_link', code: 'VALIDATION_ERROR' });
        return;
      }

      const result = await this.paymentGatewayService.createLink(
        { invoice_id, amount, currency, collection_mode, customer, description, expire_hours, callback_url, notes },
        userJWT, tenantId, userId, environment
      );

      if (!result.success) {
        const status = this.mapErrorCodeToStatus(result.code);
        res.status(status).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[PaymentGatewayController] createLink error:', error);
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };

  // ═══════════════════════════════════════════════════════════
  // POST /api/payments/verify-payment
  // ═══════════════════════════════════════════════════════════
  verifyPayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, environment, userJWT } = this.extractContext(req);

      if (!tenantId) {
        res.status(400).json({ success: false, error: 'x-tenant-id header is required', code: 'MISSING_TENANT_ID' });
        return;
      }

      const { request_id, gateway_order_id, gateway_payment_id, gateway_signature } = req.body;

      if (!request_id || !gateway_payment_id) {
        res.status(400).json({ success: false, error: 'request_id and gateway_payment_id are required', code: 'VALIDATION_ERROR' });
        return;
      }

      const result = await this.paymentGatewayService.verifyPayment(
        { request_id, gateway_order_id, gateway_payment_id, gateway_signature },
        userJWT, tenantId, environment
      );

      if (!result.success) {
        const status = this.mapErrorCodeToStatus(result.code);
        res.status(status).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[PaymentGatewayController] verifyPayment error:', error);
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };

  // ═══════════════════════════════════════════════════════════
  // POST /api/payments/status
  // ═══════════════════════════════════════════════════════════
  getPaymentStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, environment, userJWT } = this.extractContext(req);

      if (!tenantId) {
        res.status(400).json({ success: false, error: 'x-tenant-id header is required', code: 'MISSING_TENANT_ID' });
        return;
      }

      const { invoice_id, contract_id } = req.body;

      const result = await this.paymentGatewayService.getPaymentStatus(
        { invoice_id, contract_id },
        userJWT, tenantId, environment
      );

      if (!result.success) {
        const status = this.mapErrorCodeToStatus(result.code);
        res.status(status).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error('[PaymentGatewayController] getPaymentStatus error:', error);
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };

  // ─── Error code → HTTP status mapping ─────────────────────
  private mapErrorCodeToStatus(code?: string): number {
    switch (code) {
      case 'VALIDATION_ERROR':
      case 'NO_GATEWAY':
      case 'UNSUPPORTED_PROVIDER':
        return 400;
      case 'MISSING_SIGNATURE':
      case 'INVALID_SIGNATURE':
        return 401;
      case 'FORBIDDEN':
        return 403;
      case 'NOT_FOUND':
      case 'VERIFICATION_FAILED':
        return 404;
      case 'GATEWAY_ERROR':
      case 'EDGE_FUNCTION_ERROR':
        return 502;
      default:
        return 500;
    }
  }
}

export default PaymentGatewayController;
