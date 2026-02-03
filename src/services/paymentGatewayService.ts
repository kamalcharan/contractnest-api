// src/services/paymentGatewayService.ts
// API service layer for payment gateway operations.
// Communicates with payment-gateway Edge function via HMAC-signed requests.

import crypto from 'crypto';

interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  warning?: string;
}

class PaymentGatewayService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('[PaymentGatewayService] INTERNAL_SIGNING_SECRET not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/payment-gateway';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  // ==========================================================
  // PUBLIC METHODS
  // ==========================================================

  /**
   * Create a Razorpay order for terminal checkout (Razorpay Standard Checkout popup).
   * Returns gateway_order_id + gateway_key_id needed by frontend SDK.
   */
  async createOrder(
    payload: {
      invoice_id: string;
      amount: number;
      currency?: string;
      notes?: Record<string, string>;
    },
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    return await this.makeRequest(
      'POST',
      `${this.edgeFunctionUrl}/create-order`,
      payload,
      userJWT,
      tenantId,
      userId,
      environment
    );
  }

  /**
   * Create a payment link for email/WhatsApp delivery.
   * Returns gateway_short_url for sending to buyer.
   */
  async createLink(
    payload: {
      invoice_id: string;
      amount: number;
      currency?: string;
      collection_mode: 'email_link' | 'whatsapp_link';
      customer?: { name?: string; email?: string; contact?: string };
      description?: string;
      expire_hours?: number;
      callback_url?: string;
      notes?: Record<string, string>;
    },
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    return await this.makeRequest(
      'POST',
      `${this.edgeFunctionUrl}/create-link`,
      payload,
      userJWT,
      tenantId,
      userId,
      environment
    );
  }

  /**
   * Verify payment after Razorpay Standard Checkout callback.
   * Validates signature and records receipt.
   */
  async verifyPayment(
    payload: {
      request_id: string;
      gateway_order_id: string;
      gateway_payment_id: string;
      gateway_signature: string;
    },
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    return await this.makeRequest(
      'POST',
      `${this.edgeFunctionUrl}/verify-payment`,
      payload,
      userJWT,
      tenantId,
      '',
      environment
    );
  }

  /**
   * Get payment requests (with events) for an invoice or contract.
   */
  async getPaymentStatus(
    payload: {
      invoice_id?: string;
      contract_id?: string;
    },
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    return await this.makeRequest(
      'POST',
      `${this.edgeFunctionUrl}/payment-status`,
      payload,
      userJWT,
      tenantId,
      '',
      environment
    );
  }

  // ==========================================================
  // HTTP REQUEST HANDLER (with HMAC internal_handshake)
  // ==========================================================

  private async makeRequest(
    method: string,
    url: string,
    body: any,
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    try {
      const requestBody = body ? JSON.stringify(body) : '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userJWT}`,
        'x-tenant-id': tenantId,
        'x-environment': environment
      };

      if (userId) {
        headers['x-user-id'] = userId;
      }

      // HMAC signature (internal_handshake)
      if (this.internalSigningSecret) {
        headers['x-internal-signature'] = this.generateHMACSignature(requestBody);
      }

      const requestOptions: RequestInit = {
        method,
        headers
      };

      if (body) {
        requestOptions.body = requestBody;
      }

      console.log(`[PaymentGatewayService] ${method} ${url}`);

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('[PaymentGatewayService] Edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

      return responseData;
    } catch (error) {
      console.error('[PaymentGatewayService] Network error:', error);
      return {
        success: false,
        error: 'Network error occurred',
        code: 'NETWORK_ERROR'
      };
    }
  }

  private generateHMACSignature(payload: string): string {
    if (!this.internalSigningSecret) {
      return '';
    }

    try {
      return crypto
        .createHmac('sha256', this.internalSigningSecret)
        .update(payload)
        .digest('hex');
    } catch (error) {
      console.error('[PaymentGatewayService] Error generating HMAC signature:', error);
      return '';
    }
  }
}

export default PaymentGatewayService;
