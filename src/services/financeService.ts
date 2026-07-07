// ============================================================================
// FinanceService — Stage 1 Finance AR/AP
// Thin HMAC-signed proxy to the `finance` edge function.
// Mirrors contractEventService (internal_handshake pattern).
// ============================================================================

import crypto from 'crypto';

export interface FinanceEdgeResponse {
  success: boolean;
  error?: string;
  code?: string;
  [key: string]: any;
}

export interface FinanceActionBody {
  performed_by?: string | null;
  performed_by_name?: string | null;
  contract_id?: string;
  reason?: string;
}

class FinanceService {
  private edgeFunctionUrl: string;
  private internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('[FinanceService] INTERNAL_SIGNING_SECRET not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/finance';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  async getReceivables(
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<FinanceEdgeResponse> {
    const url = `${this.edgeFunctionUrl}?view=receivables`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async getPayables(
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<FinanceEdgeResponse> {
    const url = `${this.edgeFunctionUrl}?view=payables`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async approveDraftInvoice(
    invoiceId: string,
    body: FinanceActionBody,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<FinanceEdgeResponse> {
    const url = `${this.edgeFunctionUrl}/${invoiceId}/approve`;
    return await this.makeRequest('POST', url, body, userJWT, tenantId, environment);
  }

  async sendInvoiceReminder(
    invoiceId: string,
    body: FinanceActionBody,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<FinanceEdgeResponse> {
    const url = `${this.edgeFunctionUrl}/${invoiceId}/remind`;
    return await this.makeRequest('POST', url, body, userJWT, tenantId, environment);
  }

  async cancelDraftInvoice(
    invoiceId: string,
    body: FinanceActionBody,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<FinanceEdgeResponse> {
    const url = `${this.edgeFunctionUrl}/${invoiceId}/cancel`;
    return await this.makeRequest('POST', url, body, userJWT, tenantId, environment);
  }

  // ─────────────────────────────────────────────
  // Internal request + HMAC helpers (contractEventService pattern)
  // ─────────────────────────────────────────────

  private async makeRequest(
    method: string,
    url: string,
    body: FinanceActionBody | null,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<FinanceEdgeResponse> {
    try {
      const requestBody = body ? JSON.stringify(body) : '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userJWT}`,
        'x-tenant-id': tenantId,
        'x-environment': environment
      };

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

      console.log(`[FinanceService] ${method} ${url}`);

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('[FinanceService] Edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

      return responseData;
    } catch (error) {
      console.error('[FinanceService] Network error:', error);
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
      console.error('[FinanceService] Error generating HMAC signature:', error);
      return '';
    }
  }
}

export default FinanceService;
