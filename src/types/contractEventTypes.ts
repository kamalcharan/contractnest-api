// ============================================================================
// Contract Event DTOs - Request/Response Type Definitions
// ============================================================================
// Purpose: Define API contracts for contract events (timeline) endpoints
// Pattern: API layer defines WHAT can be done (not HOW)
// ============================================================================

// ============================================================================
// ENUMS / CONSTANTS
// ============================================================================

export const CONTRACT_EVENT_TYPES = {
  SERVICE: 'service',
  BILLING: 'billing'
} as const;

export const CONTRACT_EVENT_STATUSES = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  OVERDUE: 'overdue'
} as const;

export const BILLING_SUB_TYPES = {
  ADVANCE: 'advance',
  MILESTONE: 'milestone',
  RECURRING: 'recurring',
  FINAL: 'final'
} as const;

// Valid status transitions (for reference)
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],      // Terminal state
  cancelled: [],      // Terminal state
  overdue: ['in_progress', 'completed', 'cancelled']
};

export type ContractEventType = typeof CONTRACT_EVENT_TYPES[keyof typeof CONTRACT_EVENT_TYPES];
export type ContractEventStatus = typeof CONTRACT_EVENT_STATUSES[keyof typeof CONTRACT_EVENT_STATUSES];
export type BillingSubType = typeof BILLING_SUB_TYPES[keyof typeof BILLING_SUB_TYPES];

// ============================================================================
// REQUEST DTOs
// ============================================================================

/**
 * List contract events query filters
 * GET /api/contract-events
 */
export interface ListContractEventsQuery {
  contract_id?: string;           // UUID - filter by specific contract
  contact_id?: string;            // UUID - filter by customer (buyer/vendor)
  assigned_to?: string;           // UUID - filter by assignee
  status?: ContractEventStatus;   // Filter by status
  event_type?: ContractEventType; // Filter by event type
  date_from?: string;             // ISO date - filter from date
  date_to?: string;               // ISO date - filter to date
  page?: number;                  // Default: 1
  per_page?: number;              // Default: 20, Max: 100
  sort_by?: string;               // Default: scheduled_date
  sort_order?: 'asc' | 'desc';    // Default: asc
}

/**
 * Get date summary query filters
 * GET /api/contract-events/dates
 */
export interface DateSummaryQuery {
  contract_id?: string;           // UUID - filter by specific contract
  contact_id?: string;            // UUID - filter by customer
  assigned_to?: string;           // UUID - filter by assignee
  event_type?: ContractEventType; // Filter by event type
}

/**
 * Create contract events (bulk insert) request
 * POST /api/contract-events
 */
export interface CreateContractEventsRequest {
  contract_id: string;            // UUID - required
  events: ContractEventInput[];   // Array of events to create
}

/**
 * Single event input for bulk create
 */
export interface ContractEventInput {
  block_id: string;               // UUID - source block
  block_name: string;             // Block display name
  category_id?: string;           // Optional category UUID
  event_type: ContractEventType;  // 'service' or 'billing'
  billing_sub_type?: BillingSubType; // For billing events
  billing_cycle_label?: string;   // e.g., "Cycle 1 of 12"
  sequence_number: number;        // Order within block
  total_occurrences: number;      // Total events in series
  scheduled_date: string;         // ISO date
  amount?: number;                // For billing events
  currency?: string;              // ISO currency code
  assigned_to?: string;           // UUID - assignee
  assigned_to_name?: string;      // Assignee display name
  notes?: string;                 // Optional notes
}

/**
 * Update contract event request
 * PATCH /api/contract-events/:id
 */
export interface UpdateContractEventRequest {
  version: number;                // Required for optimistic concurrency
  status?: ContractEventStatus;   // Status change
  scheduled_date?: string;        // Reschedule
  assigned_to?: string;           // Reassign
  assigned_to_name?: string;      // Assignee name
  notes?: string;                 // Update notes
  amount?: number;                // Update amount (billing only)
  reason?: string;                // Reason for change (audit trail)
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/**
 * Standard Edge function response wrapper
 */
export interface ContractEventEdgeResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  pagination?: ContractEventPagination;
}

/**
 * Pagination metadata
 */
export interface ContractEventPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

/**
 * Contract event list item
 */
export interface ContractEventListItem {
  id: string;
  tenant_id: string;
  contract_id: string;
  contract_number?: string;
  contract_title?: string;
  block_id: string;
  block_name: string;
  category_id: string | null;
  event_type: ContractEventType;
  billing_sub_type: BillingSubType | null;
  billing_cycle_label: string | null;
  sequence_number: number;
  total_occurrences: number;
  scheduled_date: string;
  original_date: string;
  amount: number | null;
  currency: string | null;
  status: ContractEventStatus;
  assigned_to: string | null;
  assigned_to_name: string | null;
  notes: string | null;
  version: number;
  is_live: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * List events response
 */
export interface ListContractEventsResponse {
  success: boolean;
  data: {
    items: ContractEventListItem[];
    total_count: number;
    page_info: {
      has_next_page: boolean;
      has_prev_page: boolean;
      current_page: number;
      total_pages: number;
    };
    filters_applied: ListContractEventsQuery;
  };
}

/**
 * Date bucket for summary
 */
export interface DateBucketSummary {
  count: number;
  service_count: number;
  billing_count: number;
  billing_amount: number;
  by_status: Record<string, number>;
}

/**
 * Date summary response
 */
export interface DateSummaryResponse {
  success: boolean;
  data: {
    overdue: DateBucketSummary;
    today: DateBucketSummary;
    tomorrow: DateBucketSummary;
    this_week: DateBucketSummary;
    next_week: DateBucketSummary;
    later: DateBucketSummary;
    totals: {
      total_events: number;
      total_billing_amount: number;
    };
  };
}

/**
 * Create events response
 */
export interface CreateContractEventsResponse {
  success: boolean;
  data: {
    inserted_count: number;
    event_ids: string[];
  };
}

/**
 * Update event response
 */
export interface UpdateContractEventResponse {
  success: boolean;
  data: ContractEventListItem;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export type ContractEventErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'BATCH_TOO_LARGE'
  | 'MISSING_TENANT_ID'
  | 'INTERNAL_ERROR'
  | 'EDGE_FUNCTION_ERROR'
  | 'NETWORK_ERROR';
