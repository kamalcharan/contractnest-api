// ============================================================================
// Admin Forms DTOs - Request/Response Type Definitions
// ============================================================================
// Purpose: Define API contracts for Admin Smart Forms endpoints
// Pattern: API layer defines WHAT can be done (not HOW)
// Edge function: smart-forms
// ============================================================================

// ============================================================================
// REQUEST DTOs
// ============================================================================

/**
 * GET /api/admin/forms
 * List templates with filters and pagination
 */
export interface ListTemplatesRequest {
  page?: number;          // Default: 1
  limit?: number;         // Default: 20, Max: 100
  status?: string;        // draft | in_review | approved | past
  category?: string;      // calibration | inspection | audit | maintenance | etc.
  form_type?: string;     // pre_service | post_service | during_service | standalone
  search?: string;        // Search name + description (max 200 chars)
}

/**
 * POST /api/admin/forms
 * Create a new form template
 */
export interface CreateTemplateRequest {
  name: string;
  description?: string;
  category: string;
  form_type: string;
  tags?: string[];
  schema: Record<string, unknown>;
}

/**
 * PUT /api/admin/forms/:id
 * Update a draft template
 */
export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  category?: string;
  form_type?: string;
  tags?: string[];
  schema?: Record<string, unknown>;
}

/**
 * POST /api/admin/forms/validate
 * Validate a form schema (no DB)
 */
export interface ValidateSchemaRequest {
  schema: Record<string, unknown>;
}

/**
 * POST /api/admin/forms/:id/approve
 */
export interface ApproveTemplateRequest {
  notes?: string;
}

/**
 * POST /api/admin/forms/:id/reject
 */
export interface RejectTemplateRequest {
  notes: string;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/**
 * Single form template record
 */
export interface FormTemplateResponse {
  id: string;
  name: string;
  description: string | null;
  category: string;
  form_type: string;
  tags: string[];
  schema: Record<string, unknown>;
  version: number;
  parent_template_id: string | null;
  status: string;
  thumbnail_url: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Paginated template list response
 */
export interface ListTemplatesResponse {
  data: FormTemplateResponse[];
  pagination: PaginationResponse;
}

/**
 * Schema validation response
 */
export interface ValidateSchemaResponse {
  valid: boolean;
  errors: string[];
}

/**
 * Delete template response
 */
export interface DeleteTemplateResponse {
  success: boolean;
  deleted: string;
}

// ============================================================================
// SHARED
// ============================================================================

export interface PaginationResponse {
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
}
