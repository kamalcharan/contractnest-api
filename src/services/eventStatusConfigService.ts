// ============================================================================
// Event Status Config Service
// ============================================================================
// Purpose: HTTP client for event-status-config Edge Function
// Pattern: Service layer communicates with Edge via HMAC-signed requests
// ============================================================================

import crypto from 'crypto';
import {
  UpsertStatusRequest,
  DeleteStatusRequest,
  UpsertTransitionRequest,
  DeleteTransitionRequest
} from '../types/eventStatusConfigTypes';

interface EdgeResponse {
  success: boolean;
  data?: any;
  error?: string;
  code?: string;
}

class EventStatusConfigService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('[EventStatusConfigService] INTERNAL_SIGNING_SECRET not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/event-status-config';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  // ==========================================================
  // READ METHODS
  // ==========================================================

  /**
   * Get status definitions for an event type
   * GET /event-status-config/statuses?event_type=service
   */
  async getStatuses(
    eventType: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeResponse> {
    const url = `${this.edgeFunctionUrl}/statuses?event_type=${encodeURIComponent(eventType)}`;
    return await this.makeRequest('GET', url, null, tenantId, environment);
  }

  /**
   * Get status transitions for an event type
   * GET /event-status-config/transitions?event_type=service&from_status=scheduled
   */
  async getTransitions(
    eventType: string,
    tenantId: string,
    environment: string = 'live',
    fromStatus?: string
  ): Promise<EdgeResponse> {
    const params = new URLSearchParams({ event_type: eventType });
    if (fromStatus) {
      params.append('from_status', fromStatus);
    }

    const url = `${this.edgeFunctionUrl}/transitions?${params.toString()}`;
    return await this.makeRequest('GET', url, null, tenantId, environment);
  }

  // ==========================================================
  // WRITE METHODS
  // ==========================================================

  /**
   * Create or update a status definition
   * POST /event-status-config/statuses
   */
  async upsertStatus(
    body: UpsertStatusRequest,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeResponse> {
    const url = `${this.edgeFunctionUrl}/statuses`;
    return await this.makeRequest('POST', url, body, tenantId, environment);
  }

  /**
   * Soft-delete a status definition
   * DELETE /event-status-config/statuses
   */
  async deleteStatus(
    body: DeleteStatusRequest,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeResponse> {
    const url = `${this.edgeFunctionUrl}/statuses`;
    return await this.makeRequest('DELETE', url, body, tenantId, environment);
  }

  /**
   * Create or update a status transition
   * POST /event-status-config/transitions
   */
  async upsertTransition(
    body: UpsertTransitionRequest,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeResponse> {
    const url = `${this.edgeFunctionUrl}/transitions`;
    return await this.makeRequest('POST', url, body, tenantId, environment);
  }

  /**
   * Remove a status transition
   * DELETE /event-status-config/transitions
   */
  async deleteTransition(
    body: DeleteTransitionRequest,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeResponse> {
    const url = `${this.edgeFunctionUrl}/transitions`;
    return await this.makeRequest('DELETE', url, body, tenantId, environment);
  }

  /**
   * Seed system defaults for a tenant
   * POST /event-status-config/seed
   */
  async seedDefaults(
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeResponse> {
    const url = `${this.edgeFunctionUrl}/seed`;
    return await this.makeRequest('POST', url, null, tenantId, environment);
  }

  // ==========================================================
  // HTTP REQUEST HANDLER (with HMAC internal_handshake)
  // ==========================================================

  private async makeRequest(
    method: string,
    url: string,
    body: any,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeResponse> {
    try {
      const requestBody = body ? JSON.stringify(body) : '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        'x-environment': environment
      };

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

      console.log(`[EventStatusConfigService] ${method} ${url}`);

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('[EventStatusConfigService] Edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

      return responseData;
    } catch (error) {
      console.error('[EventStatusConfigService] Network error:', error);
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
      console.error('[EventStatusConfigService] Error generating HMAC signature:', error);
      return '';
    }
  }
}

export default EventStatusConfigService;
