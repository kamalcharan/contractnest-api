// src/services/contractService.ts
// API service layer for contract & RFQ operations
// Communicates with Edge function via HMAC-signed requests

import crypto from 'crypto';

interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  pagination?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

interface ContractListFilters {
  record_type?: string;
  contract_type?: string;
  status?: string;
  search?: string;
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_order?: string;
}

class ContractService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('INTERNAL_SIGNING_SECRET not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/contracts';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  // ==========================================================
  // CRUD METHODS
  // ==========================================================

  async listContracts(
    filters: ContractListFilters,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    const queryParams = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });

    const url = `${this.edgeFunctionUrl}?${queryParams.toString()}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async getContractById(
    contractId: string,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contractId}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async getContractStats(
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/stats`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async createContract(
    contractData: any,
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live',
    idempotencyKey?: string
  ): Promise<EdgeFunctionResponse> {
    const requestPayload = {
      ...contractData,
      // DB RPC expects 'name'; API public interface uses 'title'
      name: contractData.title || contractData.name,
      // Ensure contract_type is stored for list filtering (client/vendor/partner)
      // Wizard sends contact_classification but omits contract_type to bypass API validator
      contract_type: contractData.contract_type || contractData.contact_classification,
      tenant_id: tenantId,
      created_by: userId
    };

    return await this.makeRequest(
      'POST',
      this.edgeFunctionUrl,
      requestPayload,
      userJWT,
      tenantId,
      environment,
      idempotencyKey
    );
  }

  async updateContract(
    contractId: string,
    updateData: any,
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live',
    idempotencyKey?: string
  ): Promise<EdgeFunctionResponse> {
    const requestPayload = {
      ...updateData,
      // DB RPC expects 'name'; API public interface uses 'title'
      ...(updateData.title ? { name: updateData.title } : {}),
      tenant_id: tenantId,
      updated_by: userId
    };

    const url = `${this.edgeFunctionUrl}/${contractId}`;
    return await this.makeRequest(
      'PUT',
      url,
      requestPayload,
      userJWT,
      tenantId,
      environment,
      idempotencyKey
    );
  }

  async updateContractStatus(
    contractId: string,
    statusData: { status: string; note?: string; version?: number },
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    const requestPayload = {
      ...statusData,
      performed_by_id: userId
    };

    const url = `${this.edgeFunctionUrl}/${contractId}/status`;
    return await this.makeRequest('PATCH', url, requestPayload, userJWT, tenantId, environment);
  }

  async deleteContract(
    contractId: string,
    deleteData: { version?: number; note?: string },
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    const requestPayload = {
      ...deleteData,
      performed_by_id: userId
    };

    const url = `${this.edgeFunctionUrl}/${contractId}`;
    return await this.makeRequest('DELETE', url, requestPayload, userJWT, tenantId, environment);
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
  ): Promise<EdgeFunctionResponse> {
    try {
      const requestBody = body ? JSON.stringify(body) : '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userJWT}`,
        'x-tenant-id': tenantId,
        'x-environment': environment
      };

      // HMAC signature (internal_handshake)
      if (this.internalSigningSecret) {
        headers['x-internal-signature'] = this.generateHMACSignature(requestBody);
      }

      // Idempotency key
      if (idempotencyKey) {
        headers['x-idempotency-key'] = idempotencyKey;
      }

      const requestOptions: RequestInit = {
        method,
        headers
      };

      if (body) {
        requestOptions.body = requestBody;
      }

      console.log(`[ContractService] ${method} ${url}`);

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('[ContractService] Edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

      return responseData;
    } catch (error) {
      console.error('[ContractService] Network error:', error);
      return {
        success: false,
        error: 'Network error occurred',
        code: 'NETWORK_ERROR'
      };
    }
  }

  // =================================================================
  // NOTIFICATION METHODS
  // =================================================================

  async sendNotification(
    contractId: string,
    notifyData: any,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contractId}/notify`;
    return await this.makeRequest('POST', url, notifyData || {}, userJWT, tenantId, environment);
  }

  // =================================================================
  // INVOICE & PAYMENT METHODS
  // =================================================================

  async getContractInvoices(
    contractId: string,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contractId}/invoices`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async recordPayment(
    contractId: string,
    paymentData: any,
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    const requestPayload = {
      ...paymentData,
      recorded_by: userId
    };

    const url = `${this.edgeFunctionUrl}/${contractId}/invoices/record-payment`;
    return await this.makeRequest('POST', url, requestPayload, userJWT, tenantId, environment);
  }

  async cancelInvoice(
    contractId: string,
    data: { invoice_id: string; action: string; reason?: string },
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    const requestPayload = {
      ...data,
      performed_by: userId
    };

    const url = `${this.edgeFunctionUrl}/${contractId}/invoices/cancel`;
    return await this.makeRequest('POST', url, requestPayload, userJWT, tenantId, environment);
  }

  // =================================================================
  // PUBLIC METHODS (no auth / HMAC — uses service role key)
  // =================================================================

  async validateContractAccess(
    cnak: string,
    secretCode: string
  ): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/public/validate`;
    return await this.makePublicRequest(url, { cnak, secret_code: secretCode });
  }

  async respondToContract(data: {
    cnak: string;
    secret_code: string;
    action: string;
    responded_by?: string;
    responder_name?: string;
    responder_email?: string;
    rejection_reason?: string;
  }): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/public/respond`;
    return await this.makePublicRequest(url, data);
  }

  /**
   * Claim a contract using CNAK (authenticated)
   * Called when a buyer wants to add a contract to their ContractHub
   */
  async claimContract(
    cnak: string,
    userJWT: string,
    tenantId: string,
    userId: string
  ): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/claim`;
    const payload = { cnak, user_id: userId };
    return await this.makeRequest('POST', url, payload, userJWT, tenantId, 'live');
  }

  /**
   * Make a request to a public edge function endpoint
   * No HMAC signing, no tenant/auth headers — just service role key
   */
  private async makePublicRequest(
    url: string,
    body: any
  ): Promise<EdgeFunctionResponse> {
    try {
      const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
      const requestBody = JSON.stringify(body);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      };

      console.log(`[ContractService] PUBLIC POST ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: requestBody
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('[ContractService] Public edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

      return responseData;
    } catch (error) {
      console.error('[ContractService] Public request network error:', error);
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
      console.error('[ContractService] Error generating HMAC signature:', error);
      return '';
    }
  }
}

export default ContractService;
