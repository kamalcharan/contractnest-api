// ============================================================================
// Admin JTD Service — Edge Function Proxy
// ============================================================================
// Purpose: Proxy Admin JTD API requests to the admin-jtd-management edge function
// Pattern: matches adminTenantService.ts — no business logic, typed returns
// ============================================================================

import axios from 'axios';
import { SUPABASE_URL } from '../utils/supabaseConfig';

import type {
  ListTenantStatsRequest,
  ListEventsRequest,
  QueueMetricsResponse,
  TenantStatsResponse,
  EventsListResponse,
  EventDetailResponse,
  WorkerHealthResponse,
  RetryEventRequest,
  CancelEventRequest,
  ForceCompleteRequest,
  RequeueDlqRequest,
  ListDlqRequest,
  ActionResponse,
  DlqListResponse,
} from '../types/adminJtd.dto';

const BASE_URL = `${SUPABASE_URL}/functions/v1/admin-jtd-management`;

export class AdminJtdService {

  private getHeaders(authHeader: string, tenantId: string) {
    return {
      Authorization: authHeader,
      'x-tenant-id': tenantId,
      'x-is-admin': 'true',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Build URLSearchParams from a filters object, skipping undefined values
   */
  private buildParams(filters: Record<string, string | number | undefined>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  /**
   * GET /queue-metrics
   * Live queue depth, DLQ count, status distribution, actionable counts
   */
  async getQueueMetrics(authHeader: string, tenantId: string): Promise<QueueMetricsResponse> {
    try {
      const url = `${BASE_URL}/queue-metrics`;
      console.log(`[adminJtdService] Fetching queue metrics from: ${url}`);

      const response = await axios.get<QueueMetricsResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] getQueueMetrics error:', error.message);
      throw error;
    }
  }

  /**
   * GET /tenant-stats
   * Per-tenant JTD volume, channel mix, success/failure rates, costs
   */
  async getTenantStats(
    authHeader: string,
    tenantId: string,
    filters: ListTenantStatsRequest
  ): Promise<TenantStatsResponse> {
    try {
      const url = `${BASE_URL}/tenant-stats${this.buildParams(filters as Record<string, string | number | undefined>)}`;
      console.log(`[adminJtdService] Fetching tenant stats from: ${url}`);

      const response = await axios.get<TenantStatsResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] getTenantStats error:', error.message);
      throw error;
    }
  }

  /**
   * GET /events
   * Paginated, filterable JTD event list across all tenants
   */
  async getEvents(
    authHeader: string,
    tenantId: string,
    filters: ListEventsRequest
  ): Promise<EventsListResponse> {
    try {
      const url = `${BASE_URL}/events${this.buildParams(filters as Record<string, string | number | undefined>)}`;
      console.log(`[adminJtdService] Fetching events from: ${url}`);

      const response = await axios.get<EventsListResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] getEvents error:', error.message);
      throw error;
    }
  }

  /**
   * GET /event-detail
   * Full JTD record with status history timeline for drill-down
   */
  async getEventDetail(
    authHeader: string,
    tenantId: string,
    jtdId: string
  ): Promise<EventDetailResponse> {
    try {
      const url = `${BASE_URL}/event-detail?jtd_id=${encodeURIComponent(jtdId)}`;
      console.log(`[adminJtdService] Fetching event detail from: ${url}`);

      const response = await axios.get<EventDetailResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] getEventDetail error:', error.message);
      throw error;
    }
  }

  /**
   * GET /worker-health
   * Worker status (healthy|idle|degraded|stalled|unknown), throughput, error rates
   */
  async getWorkerHealth(authHeader: string, tenantId: string): Promise<WorkerHealthResponse> {
    try {
      const url = `${BASE_URL}/worker-health`;
      console.log(`[adminJtdService] Fetching worker health from: ${url}`);

      const response = await axios.get<WorkerHealthResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] getWorkerHealth error:', error.message);
      throw error;
    }
  }

  // ===========================================================================
  // R2 — Admin Action Methods
  // ===========================================================================

  private getHeadersWithAdmin(authHeader: string, tenantId: string, adminName: string) {
    return {
      ...this.getHeaders(authHeader, tenantId),
      'x-admin-name': adminName,
    };
  }

  /**
   * POST /retry-event
   * Retry a failed JTD event — resets to queued and re-enqueues
   */
  async retryEvent(
    authHeader: string,
    tenantId: string,
    adminName: string,
    body: RetryEventRequest
  ): Promise<ActionResponse> {
    try {
      const url = `${BASE_URL}/retry-event`;
      console.log(`[adminJtdService] Retrying event: ${body.jtd_id}`);

      const response = await axios.post<ActionResponse>(url, body, {
        headers: this.getHeadersWithAdmin(authHeader, tenantId, adminName),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] retryEvent error:', error.message);
      throw error;
    }
  }

  /**
   * POST /cancel-event
   * Cancel a pending/queued/scheduled JTD event
   */
  async cancelEvent(
    authHeader: string,
    tenantId: string,
    adminName: string,
    body: CancelEventRequest
  ): Promise<ActionResponse> {
    try {
      const url = `${BASE_URL}/cancel-event`;
      console.log(`[adminJtdService] Cancelling event: ${body.jtd_id}`);

      const response = await axios.post<ActionResponse>(url, body, {
        headers: this.getHeadersWithAdmin(authHeader, tenantId, adminName),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] cancelEvent error:', error.message);
      throw error;
    }
  }

  /**
   * POST /force-complete
   * Force-complete a stuck processing event as sent or failed
   */
  async forceComplete(
    authHeader: string,
    tenantId: string,
    adminName: string,
    body: ForceCompleteRequest
  ): Promise<ActionResponse> {
    try {
      const url = `${BASE_URL}/force-complete`;
      console.log(`[adminJtdService] Force-completing event: ${body.jtd_id} as ${body.target_status}`);

      const response = await axios.post<ActionResponse>(url, body, {
        headers: this.getHeadersWithAdmin(authHeader, tenantId, adminName),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] forceComplete error:', error.message);
      throw error;
    }
  }

  /**
   * GET /dlq-messages
   * Paginated list of dead-letter queue messages with JTD context
   */
  async listDlqMessages(
    authHeader: string,
    tenantId: string,
    filters: ListDlqRequest
  ): Promise<DlqListResponse> {
    try {
      const url = `${BASE_URL}/dlq-messages${this.buildParams(filters as Record<string, string | number | undefined>)}`;
      console.log(`[adminJtdService] Fetching DLQ messages from: ${url}`);

      const response = await axios.get<DlqListResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] listDlqMessages error:', error.message);
      throw error;
    }
  }

  /**
   * POST /requeue-dlq
   * Move a single DLQ message back to the main processing queue
   */
  async requeueDlqMessage(
    authHeader: string,
    tenantId: string,
    adminName: string,
    body: RequeueDlqRequest
  ): Promise<ActionResponse> {
    try {
      const url = `${BASE_URL}/requeue-dlq`;
      console.log(`[adminJtdService] Requeuing DLQ message: ${body.msg_id}`);

      const response = await axios.post<ActionResponse>(url, body, {
        headers: this.getHeadersWithAdmin(authHeader, tenantId, adminName),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] requeueDlqMessage error:', error.message);
      throw error;
    }
  }

  /**
   * POST /purge-dlq
   * Delete all messages from the dead-letter queue
   */
  async purgeDlq(
    authHeader: string,
    tenantId: string,
    adminName: string
  ): Promise<ActionResponse> {
    try {
      const url = `${BASE_URL}/purge-dlq`;
      console.log(`[adminJtdService] Purging DLQ`);

      const response = await axios.post<ActionResponse>(url, {}, {
        headers: this.getHeadersWithAdmin(authHeader, tenantId, adminName),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminJtdService] purgeDlq error:', error.message);
      throw error;
    }
  }
}

export const adminJtdService = new AdminJtdService();
