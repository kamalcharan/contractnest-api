// ============================================================================
// Service Execution Service
// ============================================================================
// Purpose: HTTP client for service-execution Edge Function
// Pattern: Service layer communicates with Edge via HMAC-signed requests
// ============================================================================

import crypto from 'crypto';

class ServiceExecutionService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('[ServiceExecutionService] INTERNAL_SIGNING_SECRET not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/service-execution';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  // ==========================================================
  // TICKET METHODS
  // ==========================================================

  async listTickets(
    filters: Record<string, any>,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ) {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, String(value));
      }
    });

    const url = `${this.edgeFunctionUrl}?${queryParams.toString()}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async getTicketDetail(
    ticketId: string,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ) {
    const url = `${this.edgeFunctionUrl}/${ticketId}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async createTicket(
    data: any,
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live',
    idempotencyKey?: string
  ) {
    const payload = { ...data, created_by: userId };
    return await this.makeRequest('POST', this.edgeFunctionUrl, payload, userJWT, tenantId, environment, idempotencyKey);
  }

  async updateTicket(
    ticketId: string,
    data: any,
    userJWT: string,
    tenantId: string,
    userId: string,
    userName: string,
    environment: string = 'live'
  ) {
    const payload = { ...data, changed_by: userId, changed_by_name: userName };
    const url = `${this.edgeFunctionUrl}/${ticketId}`;
    return await this.makeRequest('PATCH', url, payload, userJWT, tenantId, environment);
  }

  // ==========================================================
  // EVIDENCE METHODS
  // ==========================================================

  async listEvidence(
    ticketId: string | null,
    filters: Record<string, any>,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ) {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, String(value));
      }
    });

    const path = ticketId
      ? `${this.edgeFunctionUrl}/${ticketId}/evidence`
      : `${this.edgeFunctionUrl}/evidence`;
    const url = `${path}?${queryParams.toString()}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async createEvidence(
    ticketId: string,
    data: any,
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ) {
    const payload = { ...data, uploaded_by: userId };
    const url = `${this.edgeFunctionUrl}/${ticketId}/evidence`;
    return await this.makeRequest('POST', url, payload, userJWT, tenantId, environment);
  }

  async updateEvidence(
    ticketId: string,
    evidenceId: string,
    data: any,
    userJWT: string,
    tenantId: string,
    userId: string,
    userName: string,
    environment: string = 'live'
  ) {
    const payload = { ...data, changed_by: userId, changed_by_name: userName };
    const url = `${this.edgeFunctionUrl}/${ticketId}/evidence/${evidenceId}`;
    return await this.makeRequest('PATCH', url, payload, userJWT, tenantId, environment);
  }

  // ==========================================================
  // AUDIT METHOD
  // ==========================================================

  async getAuditLog(
    filters: Record<string, any>,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ) {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, String(value));
      }
    });

    const url = `${this.edgeFunctionUrl}/audit?${queryParams.toString()}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
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
    environment: string = 'live',
    idempotencyKey?: string
  ): Promise<any> {
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

      if (idempotencyKey) {
        headers['x-idempotency-key'] = idempotencyKey;
      }

      const requestOptions: RequestInit = { method, headers };
      if (body) {
        requestOptions.body = requestBody;
      }

      console.log(`[ServiceExecutionService] ${method} ${url}`);

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('[ServiceExecutionService] Edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

      return responseData;
    } catch (error) {
      console.error('[ServiceExecutionService] Network error:', error);
      return { success: false, error: 'Network error occurred', code: 'NETWORK_ERROR' };
    }
  }

  private generateHMACSignature(payload: string): string {
    if (!this.internalSigningSecret) return '';
    try {
      return crypto.createHmac('sha256', this.internalSigningSecret).update(payload).digest('hex');
    } catch (error) {
      console.error('[ServiceExecutionService] Error generating HMAC signature:', error);
      return '';
    }
  }
}

export default ServiceExecutionService;
