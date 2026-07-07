// ============================================================================
// AppointmentService — Stage 3 Appointments
// Thin HMAC-signed proxy to the `appointments` edge function.
// Mirrors financeService (internal_handshake pattern).
// ============================================================================

import crypto from 'crypto';

export interface AppointmentEdgeResponse {
  success: boolean;
  error?: string;
  code?: string;
  [key: string]: any;
}

export interface AppointmentActionBody {
  performed_by?: string | null;
  performed_by_name?: string | null;
  event_id?: string;
  status?: string;
  scheduled_at?: string;
  notes?: string;
  proposed_slots?: any[];
  assigned_to?: string;
  assigned_to_name?: string;
  version?: number;
}

class AppointmentService {
  private edgeFunctionUrl: string;
  private internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('[AppointmentService] INTERNAL_SIGNING_SECRET not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/appointments';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  async listAppointments(
    status: string | undefined,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<AppointmentEdgeResponse> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return await this.makeRequest('GET', `${this.edgeFunctionUrl}${qs}`, null, userJWT, tenantId, environment);
  }

  async createAppointment(
    body: AppointmentActionBody,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<AppointmentEdgeResponse> {
    return await this.makeRequest('POST', this.edgeFunctionUrl, body, userJWT, tenantId, environment);
  }

  async updateAppointment(
    appointmentId: string,
    body: AppointmentActionBody,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<AppointmentEdgeResponse> {
    return await this.makeRequest('PATCH', `${this.edgeFunctionUrl}/${appointmentId}`, body, userJWT, tenantId, environment);
  }

  private async makeRequest(
    method: string,
    url: string,
    body: AppointmentActionBody | null,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<AppointmentEdgeResponse> {
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

      const requestOptions: RequestInit = { method, headers };
      if (body) {
        requestOptions.body = requestBody;
      }

      console.log(`[AppointmentService] ${method} ${url}`);

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('[AppointmentService] Edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

      return responseData;
    } catch (error) {
      console.error('[AppointmentService] Network error:', error);
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
      console.error('[AppointmentService] Error generating HMAC signature:', error);
      return '';
    }
  }
}

export default AppointmentService;
