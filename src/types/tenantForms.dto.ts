// ============================================================================
// Tenant Forms DTOs — Selections + Submissions
// ============================================================================

// ---- SELECTIONS ----

export interface ToggleSelectionRequest {
  form_template_id: string;
}

export interface TenantSelectionResponse {
  id: string;
  tenant_id: string;
  form_template_id: string;
  is_active: boolean;
  selected_by: string;
  selected_at: string;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
  m_form_templates?: {
    id: string;
    name: string;
    description: string | null;
    category: string;
    form_type: string;
    tags: string[];
    version: number;
    status: string;
  };
}

export interface ListSelectionsResponse {
  data: TenantSelectionResponse[];
}

// ---- SUBMISSIONS ----

export interface CreateSubmissionRequest {
  form_template_id: string;
  service_event_id: string;
  contract_id: string;
  mapping_id?: string;
  responses?: Record<string, unknown>;
  computed_values?: Record<string, unknown>;
  device_info?: Record<string, unknown>;
}

export interface UpdateSubmissionRequest {
  responses?: Record<string, unknown>;
  computed_values?: Record<string, unknown>;
  status?: 'draft' | 'submitted';
}

export interface ListSubmissionsRequest {
  event_id?: string;
  contract_id?: string;
  template_id?: string;
}

export interface FormSubmissionResponse {
  id: string;
  tenant_id: string;
  form_template_id: string;
  form_template_version: number;
  service_event_id: string;
  contract_id: string;
  mapping_id: string | null;
  responses: Record<string, unknown>;
  computed_values: Record<string, unknown>;
  status: string;
  submitted_by: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comments: string | null;
  device_info: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ListSubmissionsResponse {
  data: FormSubmissionResponse[];
}
