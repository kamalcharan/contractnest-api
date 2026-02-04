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
}

export const adminJtdService = new AdminJtdService();
