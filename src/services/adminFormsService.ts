// ============================================================================
// Admin Forms Service — Edge Function Proxy
// ============================================================================
// Purpose: Proxy Admin Forms API requests to the smart-forms edge function
// Pattern: matches adminJtdService.ts — no business logic, typed returns
// ============================================================================

import axios from 'axios';
import { SUPABASE_URL } from '../utils/supabaseConfig';

import type {
  ListTemplatesRequest,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  ValidateSchemaRequest,
  ApproveTemplateRequest,
  RejectTemplateRequest,
  ListTemplatesResponse,
  FormTemplateResponse,
  ValidateSchemaResponse,
  DeleteTemplateResponse,
} from '../types/adminForms.dto';

const BASE_URL = `${SUPABASE_URL}/functions/v1/smart-forms`;

export class AdminFormsService {

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

  // ============================================================================
  // GET — Read Operations
  // ============================================================================

  /**
   * GET /smart-forms
   * List templates with filters and pagination
   */
  async listTemplates(
    authHeader: string,
    tenantId: string,
    filters: ListTemplatesRequest
  ): Promise<ListTemplatesResponse> {
    try {
      const url = `${BASE_URL}${this.buildParams(filters as Record<string, string | number | undefined>)}`;
      console.log(`[adminFormsService] Fetching templates from: ${url}`);

      const response = await axios.get<ListTemplatesResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] listTemplates error:', error.message);
      throw error;
    }
  }

  /**
   * GET /smart-forms/:id
   * Get a single template by ID
   */
  async getTemplate(
    authHeader: string,
    tenantId: string,
    templateId: string
  ): Promise<FormTemplateResponse> {
    try {
      const url = `${BASE_URL}/${templateId}`;
      console.log(`[adminFormsService] Fetching template: ${templateId}`);

      const response = await axios.get<FormTemplateResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] getTemplate error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // POST/PUT/DELETE — Write Operations
  // ============================================================================

  /**
   * POST /smart-forms
   * Create a new form template
   */
  async createTemplate(
    authHeader: string,
    tenantId: string,
    body: CreateTemplateRequest
  ): Promise<FormTemplateResponse> {
    try {
      const url = `${BASE_URL}`;
      console.log(`[adminFormsService] Creating template: ${body.name}`);

      const response = await axios.post<FormTemplateResponse>(url, body, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] createTemplate error:', error.message);
      throw error;
    }
  }

  /**
   * PUT /smart-forms/:id
   * Update a draft template
   */
  async updateTemplate(
    authHeader: string,
    tenantId: string,
    templateId: string,
    body: UpdateTemplateRequest
  ): Promise<FormTemplateResponse> {
    try {
      const url = `${BASE_URL}/${templateId}`;
      console.log(`[adminFormsService] Updating template: ${templateId}`);

      const response = await axios.put<FormTemplateResponse>(url, body, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] updateTemplate error:', error.message);
      throw error;
    }
  }

  /**
   * DELETE /smart-forms/:id
   * Delete a draft template
   */
  async deleteTemplate(
    authHeader: string,
    tenantId: string,
    templateId: string
  ): Promise<DeleteTemplateResponse> {
    try {
      const url = `${BASE_URL}/${templateId}`;
      console.log(`[adminFormsService] Deleting template: ${templateId}`);

      const response = await axios.delete<DeleteTemplateResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] deleteTemplate error:', error.message);
      throw error;
    }
  }

  /**
   * POST /smart-forms/validate
   * Validate form schema JSON (no DB call)
   */
  async validateSchema(
    authHeader: string,
    tenantId: string,
    body: ValidateSchemaRequest
  ): Promise<ValidateSchemaResponse> {
    try {
      const url = `${BASE_URL}/validate`;
      console.log(`[adminFormsService] Validating schema`);

      const response = await axios.post<ValidateSchemaResponse>(url, body, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] validateSchema error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // Workflow Actions — Status Transitions + Multi-Step RPCs
  // ============================================================================

  /**
   * POST /smart-forms/:id/clone
   * Clone template to new draft (RPC)
   */
  async cloneTemplate(
    authHeader: string,
    tenantId: string,
    templateId: string
  ): Promise<FormTemplateResponse> {
    try {
      const url = `${BASE_URL}/${templateId}/clone`;
      console.log(`[adminFormsService] Cloning template: ${templateId}`);

      const response = await axios.post<FormTemplateResponse>(url, {}, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] cloneTemplate error:', error.message);
      throw error;
    }
  }

  /**
   * POST /smart-forms/:id/submit-review
   * Submit draft for review (draft → in_review)
   */
  async submitForReview(
    authHeader: string,
    tenantId: string,
    templateId: string
  ): Promise<FormTemplateResponse> {
    try {
      const url = `${BASE_URL}/${templateId}/submit-review`;
      console.log(`[adminFormsService] Submitting for review: ${templateId}`);

      const response = await axios.post<FormTemplateResponse>(url, {}, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] submitForReview error:', error.message);
      throw error;
    }
  }

  /**
   * POST /smart-forms/:id/approve
   * Approve template (in_review → approved)
   */
  async approveTemplate(
    authHeader: string,
    tenantId: string,
    templateId: string,
    body: ApproveTemplateRequest
  ): Promise<FormTemplateResponse> {
    try {
      const url = `${BASE_URL}/${templateId}/approve`;
      console.log(`[adminFormsService] Approving template: ${templateId}`);

      const response = await axios.post<FormTemplateResponse>(url, body, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] approveTemplate error:', error.message);
      throw error;
    }
  }

  /**
   * POST /smart-forms/:id/reject
   * Reject template (in_review → draft, notes required)
   */
  async rejectTemplate(
    authHeader: string,
    tenantId: string,
    templateId: string,
    body: RejectTemplateRequest
  ): Promise<FormTemplateResponse> {
    try {
      const url = `${BASE_URL}/${templateId}/reject`;
      console.log(`[adminFormsService] Rejecting template: ${templateId}`);

      const response = await axios.post<FormTemplateResponse>(url, body, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] rejectTemplate error:', error.message);
      throw error;
    }
  }

  /**
   * POST /smart-forms/:id/new-version
   * Create new version from approved template (approved → past + new draft, RPC)
   */
  async newVersion(
    authHeader: string,
    tenantId: string,
    templateId: string
  ): Promise<FormTemplateResponse> {
    try {
      const url = `${BASE_URL}/${templateId}/new-version`;
      console.log(`[adminFormsService] Creating new version from: ${templateId}`);

      const response = await axios.post<FormTemplateResponse>(url, {}, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] newVersion error:', error.message);
      throw error;
    }
  }

  /**
   * POST /smart-forms/:id/archive
   * Archive approved template (approved → past)
   */
  async archiveTemplate(
    authHeader: string,
    tenantId: string,
    templateId: string
  ): Promise<FormTemplateResponse> {
    try {
      const url = `${BASE_URL}/${templateId}/archive`;
      console.log(`[adminFormsService] Archiving template: ${templateId}`);

      const response = await axios.post<FormTemplateResponse>(url, {}, {
        headers: this.getHeaders(authHeader, tenantId),
      });

      return response.data;
    } catch (error: any) {
      console.error('[adminFormsService] archiveTemplate error:', error.message);
      throw error;
    }
  }
}

export const adminFormsService = new AdminFormsService();
