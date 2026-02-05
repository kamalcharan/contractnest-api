// ============================================================================
// Contract Event Service
// ============================================================================
// Purpose: HTTP client for contract events Edge Function
// Pattern: Service layer communicates with Edge via HMAC-signed requests
// ============================================================================

import crypto from 'crypto';
import {
  ListContractEventsQuery,
  DateSummaryQuery,
  CreateContractEventsRequest,
  UpdateContractEventRequest,
  ContractEventEdgeResponse
} from '../types/contractEventTypes';

interface ContractEventListFilters {
  contract_id?: string;
  contact_id?: string;
  assigned_to?: string;
  status?: string;
  event_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_order?: string;
}

interface DateSummaryFilters {
  contract_id?: string;
  contact_id?: string;
  assigned_to?: string;
  event_type?: string;
}

class ContractEventService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('[ContractEventService] INTERNAL_SIGNING_SECRET not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/contract-events';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  // ==========================================================
  // READ METHODS
  // ==========================================================

  /**
   * List contract events with filtering and pagination
   * GET /contract-events
   */
  async listEvents(
    filters: ContractEventListFilters,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<ContractEventEdgeResponse> {
    const queryParams = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, String(value));
      }
    });

    const url = `${this.edgeFunctionUrl}?${queryParams.toString()}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  /**
   * Get date summary (buckets: overdue, today, tomorrow, this_week, next_week, later)
   * GET /contract-events/dates
   */
  async getDateSummary(
    filters: DateSummaryFilters,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<ContractEventEdgeResponse> {
    const queryParams = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, String(value));
      }
    });

    const url = `${this.edgeFunctionUrl}/dates?${queryParams.toString()}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  // ==========================================================
  // WRITE METHODS
  // ==========================================================

  /**
   * Create contract events (bulk insert)
   * POST /contract-events
   */
  async createEvents(
    data: CreateContractEventsRequest,
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live',
    idempotencyKey?: string
  ): Promise<ContractEventEdgeResponse> {
    const requestPayload = {
      contract_id: data.contract_id,
      events: data.events,
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

  /**
   * Update a single contract event
   * PATCH /contract-events/:id
   */
  async updateEvent(
    eventId: string,
    updateData: UpdateContractEventRequest,
    userJWT: string,
    tenantId: string,
    userId: string,
    userName: string,
    environment: string = 'live'
  ): Promise<ContractEventEdgeResponse> {
    const requestPayload = {
      ...updateData,
      tenant_id: tenantId,
      changed_by: userId,
      changed_by_name: userName
    };

    const url = `${this.edgeFunctionUrl}/${eventId}`;
    return await this.makeRequest('PATCH', url, requestPayload, userJWT, tenantId, environment);
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
  ): Promise<ContractEventEdgeResponse> {
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

      console.log(`[ContractEventService] ${method} ${url}`);

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('[ContractEventService] Edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

      return responseData;
    } catch (error) {
      console.error('[ContractEventService] Network error:', error);
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
      console.error('[ContractEventService] Error generating HMAC signature:', error);
      return '';
    }
  }
}

export default ContractEventService;
