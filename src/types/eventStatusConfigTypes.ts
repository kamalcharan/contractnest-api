// ============================================================================
// Event Status Configuration DTOs - Request/Response Type Definitions
// ============================================================================
// Purpose: Define API contracts for event status config endpoints
// Tables:  m_event_status_config, m_event_status_transitions
// ============================================================================

// ============================================================================
// STATUS DEFINITION TYPES
// ============================================================================

/**
 * A single status definition for an event type
 */
export interface EventStatusDefinition {
  id: string;
  status_code: string;
  display_name: string;
  description: string | null;
  hex_color: string;
  icon_name: string | null;
  display_order: number;
  is_initial: boolean;
  is_terminal: boolean;
  source: string;             // 'system' | 'tenant' | 'vani'
}

/**
 * Response from get_event_status_config RPC
 */
export interface GetEventStatusConfigResponse {
  success: boolean;
  event_type: string;
  is_tenant_override: boolean;
  statuses: EventStatusDefinition[];
}

// ============================================================================
// TRANSITION TYPES
// ============================================================================

/**
 * A single status transition rule
 */
export interface EventStatusTransition {
  id: string;
  from_status: string;
  to_status: string;
  requires_reason: boolean;
  requires_evidence: boolean;
}

/**
 * Response from get_event_status_transitions RPC
 */
export interface GetEventStatusTransitionsResponse {
  success: boolean;
  event_type: string;
  is_tenant_override: boolean;
  transitions: EventStatusTransition[];
}

// ============================================================================
// REQUEST DTOs
// ============================================================================

/**
 * GET /api/event-status-config/statuses
 */
export interface GetStatusesQuery {
  event_type: string;         // required
}

/**
 * GET /api/event-status-config/transitions
 */
export interface GetTransitionsQuery {
  event_type: string;         // required
  from_status?: string;       // optional: filter to specific source status
}

/**
 * POST /api/event-status-config/statuses — upsert a status definition
 */
export interface UpsertStatusRequest {
  event_type: string;
  status_code: string;
  display_name: string;
  description?: string;
  hex_color?: string;
  icon_name?: string;
  display_order?: number;
  is_initial?: boolean;
  is_terminal?: boolean;
}

/**
 * DELETE /api/event-status-config/statuses — soft-delete a status
 */
export interface DeleteStatusRequest {
  event_type: string;
  status_code: string;
}

/**
 * POST /api/event-status-config/transitions — upsert a transition
 */
export interface UpsertTransitionRequest {
  event_type: string;
  from_status: string;
  to_status: string;
  requires_reason?: boolean;
  requires_evidence?: boolean;
}

/**
 * DELETE /api/event-status-config/transitions — remove a transition
 */
export interface DeleteTransitionRequest {
  id: string;
}

// ============================================================================
// SEED RESPONSE
// ============================================================================

/**
 * POST /api/event-status-config/seed — seed defaults for tenant
 */
export interface SeedEventStatusResponse {
  success: boolean;
  tenant_id: string;
  statuses_seeded: number;
  transitions_seeded: number;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export type EventStatusConfigErrorCode =
  | 'VALIDATION_ERROR'
  | 'MISSING_TENANT_ID'
  | 'RPC_ERROR'
  | 'EDGE_FUNCTION_ERROR'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR';
