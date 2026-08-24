// src/services/contractServiceV2.ts
// JTD Nucleus initiative — Milestone 1. New, versioned sibling of
// contractService.ts. That file is untouched. Talks to the new
// contracts-v2 edge function (create_contract_transaction_v2) instead
// of contracts (create_contract_transaction). Create only, for now —
// mirrors contractService.ts's createContract + makeRequest + HMAC
// signing exactly, just pointed at the v2 edge function.

import crypto from 'crypto';

interface EdgeFunctionResponseV2<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

class ContractServiceV2 {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('[ContractServiceV2] INTERNAL_SIGNING_SECRET not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/contracts-v2';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  async createContract(
    contractData: any,
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live',
    idempotencyKey?: string
  ): Promise<EdgeFunctionResponseV2> {
    const requestPayload = {
      ...contractData,
      name: contractData.title || contractData.name,
      contract_type: contractData.contract_type || contractData.contact_classification,
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

  /**
   * JTD Nucleus Step 3 fix — V2 status transition. On activation the RPC
   * materializes n_jtd job rows from computed_events BEFORE delegating to
   * the untouched V1 status engine (whose events trigger then skips by its
   * own computed_events-NOT-NULL guard). Covers the wizard's
   * draft→update→activate path (CN-1019 gap).
   */
  async updateContractStatus(
    contractId: string,
    statusData: { status: string; note?: string; version?: number },
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponseV2> {
    const url = `${this.edgeFunctionUrl}/${contractId}/status`;
    const payload = { ...statusData, updated_by: userId };
    return await this.makeRequest('PATCH', url, payload, userJWT, tenantId, environment);
  }

  /**
   * JTD Nucleus Step 3 — single-call contract view aggregate.
   * GET contracts-v2/:id/details → get_contract_details_v2:
   * contract + blocks + events (n_jtd jobs, legacy fallback) + CNAK
   * + invoices, one round-trip.
   */
  async getContractDetails(
    contractId: string,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponseV2> {
    const url = `${this.edgeFunctionUrl}/${contractId}/details`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  /**
   * JTD Nucleus Step 4 — V2 payment. POST contracts-v2/:id/record-payment
   * → record_invoice_payment_v2: receipt / invoice header / auto-activation
   * via the untouched V1 core, then settlement against n_jtd JOB rows
   * (allocations carry jtd_id; job status → paid / partial_payment).
   * Payload mirrors V1 contractService.recordPayment exactly.
   */
  async recordPayment(
    contractId: string,
    paymentData: any,
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponseV2> {
    const requestPayload = {
      ...paymentData,
      recorded_by: userId
    };

    const url = `${this.edgeFunctionUrl}/${contractId}/record-payment`;
    return await this.makeRequest('POST', url, requestPayload, userJWT, tenantId, environment);
  }

  private async makeRequest(
    method: string,
    url: string,
    body: any,
    userJWT: string,
    tenantId: string,
    environment: string = 'live',
    idempotencyKey?: string
  ): Promise<EdgeFunctionResponseV2> {
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

      console.log(`[ContractServiceV2] ${method} ${url}`);

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('[ContractServiceV2] Edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

      return responseData;
    } catch (error) {
      console.error('[ContractServiceV2] Network error:', error);
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
      console.error('[ContractServiceV2] HMAC generation error:', error);
      return '';
    }
  }
}

export default ContractServiceV2;
