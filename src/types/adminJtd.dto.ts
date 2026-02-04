// ============================================================================
// Admin JTD DTOs - Request/Response Type Definitions
// ============================================================================
// Purpose: Define API contracts for Admin JTD Management endpoints (Release 1)
// Pattern: API layer defines WHAT can be done (not HOW)
// ============================================================================

// ============================================================================
// REQUEST DTOs
// ============================================================================

/**
 * GET /api/admin/jtd/queue/metrics
 * No request params — returns live snapshot
 */
// (no request DTO needed)

/**
 * GET /api/admin/jtd/tenants/stats
 */
export interface ListTenantStatsRequest {
  page?: number;          // Default: 1
  limit?: number;         // Default: 20, Max: 100
  search?: string;        // Search tenant name
  sort_by?: 'total_jtds' | 'failed' | 'total_cost' | 'tenant_name';
  sort_dir?: 'asc' | 'desc';
}

/**
 * GET /api/admin/jtd/events
 */
export interface ListEventsRequest {
  page?: number;          // Default: 1
  limit?: number;         // Default: 50, Max: 100
  tenant_id?: string;     // UUID — filter by tenant
  status?: string;        // JTD status code
  event_type?: string;    // Event type code
  channel?: string;       // Channel code
  source_type?: string;   // Source type code
  search?: string;        // Recipient name/contact/ref/ID
  date_from?: string;     // ISO 8601 date
  date_to?: string;       // ISO 8601 date
  sort_by?: 'created_at' | 'priority' | 'status';
  sort_dir?: 'asc' | 'desc';
}

/**
 * GET /api/admin/jtd/events/:id
 */
export interface GetEventDetailRequest {
  id: string;             // UUID
}

/**
 * GET /api/admin/jtd/worker/health
 * No request params — returns live snapshot
 */
// (no request DTO needed)

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/**
 * Queue metrics response
 */
export interface QueueMetricsResponse {
  success: true;
  data: {
    main_queue: {
      length: number;
      oldest_age_sec: number | null;
      newest_age_sec: number | null;
    };
    dlq: {
      length: number;
      oldest_age_sec: number | null;
    };
    status_distribution: Record<string, number>;
    last_24h: {
      by_event_type: Record<string, number>;
      by_channel: Record<string, number>;
    };
    actionable: {
      currently_processing: number;
      scheduled_due: number;
      failed_retryable: number;
      no_credits_waiting: number;
    };
    generated_at: string;
  };
}

/**
 * Per-tenant JTD stats item
 */
export interface TenantJtdStatsItem {
  tenant_id: string;
  tenant_name: string;
  tenant_status: string;
  vani_enabled: boolean;
  total_jtds: number;
  sent: number;
  failed: number;
  pending: number;
  no_credits: number;
  cancelled: number;
  success_rate: number;
  total_cost: number;
  by_channel: Record<string, number>;
  last_jtd_at: string | null;
  daily_limit: number | null;
  daily_used: number;
  monthly_limit: number | null;
  monthly_used: number;
}

export interface TenantStatsResponse {
  success: true;
  data: TenantJtdStatsItem[];
  global: {
    total_jtds: number;
    total_sent: number;
    total_failed: number;
    total_no_credits: number;
    total_cost: number;
  };
  pagination: PaginationResponse;
}

/**
 * JTD event list item
 */
export interface JtdEventItem {
  id: string;
  tenant_id: string;
  tenant_name: string;
  event_type_code: string;
  channel_code: string | null;
  source_type_code: string;
  source_ref: string | null;
  status_code: string;
  previous_status: string | null;
  priority: number;
  recipient_name: string | null;
  recipient_contact: string | null;
  template_key: string | null;
  retry_count: number;
  max_retries: number;
  cost: number;
  error_message: string | null;
  error_code: string | null;
  provider_code: string | null;
  provider_message_id: string | null;
  performed_by_type: string;
  performed_by_name: string | null;
  scheduled_at: string | null;
  executed_at: string | null;
  completed_at: string | null;
  created_at: string;
  status_changes: number;
}

export interface EventsListResponse {
  success: true;
  data: JtdEventItem[];
  pagination: PaginationResponse;
}

/**
 * JTD event detail with status history
 */
export interface StatusHistoryEntry {
  id: string;
  from_status_code: string | null;
  to_status_code: string;
  is_valid: boolean;
  performed_by_type: string;
  performed_by_name: string | null;
  reason: string | null;
  details: Record<string, any>;
  duration_seconds: number | null;
  created_at: string;
}

export interface EventDetailResponse {
  success: true;
  data: JtdEventItem & {
    jtd_number: string | null;
    source_id: string | null;
    template_id: string | null;
    template_variables: Record<string, any>;
    payload: Record<string, any>;
    business_context: Record<string, any>;
    execution_result: Record<string, any> | null;
    provider_response: Record<string, any> | null;
    metadata: Record<string, any>;
    tags: string[];
  };
  status_history: StatusHistoryEntry[];
}

/**
 * Worker health response
 */
export type WorkerStatus = 'healthy' | 'idle' | 'degraded' | 'stalled' | 'unknown';

export interface WorkerHealthResponse {
  success: true;
  data: {
    status: WorkerStatus;
    last_executed_at: string | null;
    last_completed_at: string | null;
    currently_processing: number;
    stuck_count: number;
    throughput: {
      last_1h: number;
      last_24h: number;
      avg_duration_sec: number;
    };
    errors: {
      last_1h: number;
      last_24h: number;
      error_rate_1h: number;
    };
    queue: {
      length: number;
      oldest_age_sec: number | null;
      dlq_length: number;
    };
    generated_at: string;
  };
}

// ============================================================================
// R2 — ACTION REQUEST DTOs
// ============================================================================

/** POST /api/admin/jtd/actions/retry */
export interface RetryEventRequest {
  jtd_id: string;
  reason?: string;
}

/** POST /api/admin/jtd/actions/cancel */
export interface CancelEventRequest {
  jtd_id: string;
  reason?: string;
}

/** POST /api/admin/jtd/actions/force-complete */
export interface ForceCompleteRequest {
  jtd_id: string;
  target_status: 'sent' | 'failed';
  reason?: string;
}

/** POST /api/admin/jtd/actions/requeue-dlq */
export interface RequeueDlqRequest {
  msg_id: number;
}

/** GET /api/admin/jtd/dlq/messages */
export interface ListDlqRequest {
  page?: number;
  limit?: number;
}

// ============================================================================
// R2 — ACTION RESPONSE DTOs
// ============================================================================

export interface ActionResponse {
  success: boolean;
  event_id?: string;
  msg_id?: number;
  jtd_id?: string;
  from_status?: string;
  to_status?: string;
  message?: string;
  error?: string;
  purged_count?: number;
}

export interface DlqMessageItem {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  jtd_id: string | null;
  tenant_id: string | null;
  tenant_name: string;
  event_type: string | null;
  channel: string | null;
  priority: string | null;
  error_message: string;
  status_code: string;
  recipient: string;
  age_seconds: number;
}

export interface DlqListResponse {
  success: true;
  data: DlqMessageItem[];
  pagination: PaginationResponse;
}

// ============================================================================
// SHARED
// ============================================================================

export interface PaginationResponse {
  current_page: number;
  total_pages: number;
  total_records: number;
  limit: number;
  has_next: boolean;
  has_prev: boolean;
}
