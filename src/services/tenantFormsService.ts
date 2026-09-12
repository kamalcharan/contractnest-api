// ============================================================================
// Tenant Forms Service — Edge Function Proxy (Selections + Submissions)
// ============================================================================

import axios from 'axios';
import { SUPABASE_URL } from '../utils/supabaseConfig';
import type {
  ToggleSelectionRequest,
  ListSelectionsResponse,
  TenantSelectionResponse,
  CreateSubmissionRequest,
  UpdateSubmissionRequest,
  ListSubmissionsRequest,
  ListSubmissionsResponse,
  FormSubmissionResponse,
} from '../types/tenantForms.dto';

const BASE_URL = `${SUPABASE_URL}/functions/v1/smart-forms`;

export class TenantFormsService {

  private getHeaders(authHeader: string, tenantId: string) {
    return {
      Authorization: authHeader,
      'x-tenant-id': tenantId,
      'Content-Type': 'application/json',
    };
  }

  // ---- TEMPLATES (B2.4: real block picker reads approved forms) ----

  async listTemplates(
    authHeader: string,
    tenantId: string,
    params: { status?: string; category?: string; form_type?: string; search?: string; limit?: number } = {}
  ): Promise<any> {
    try {
      const qs = new URLSearchParams();
      qs.set('status', params.status || 'approved');
      if (params.category) qs.set('category', params.category);
      if (params.form_type) qs.set('form_type', params.form_type);
      if (params.search) qs.set('search', params.search);
      qs.set('limit', String(Math.min(params.limit || 100, 100)));
      const url = `${BASE_URL}?${qs.toString()}`;
      const response = await axios.get(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });
      return response.data;
    } catch (error: any) {
      console.error('[TenantFormsService] listTemplates error:', error.message);
      throw error;
    }
  }

  async getTemplate(
    authHeader: string,
    tenantId: string,
    templateId: string
  ): Promise<any> {
    try {
      const url = `${BASE_URL}/${encodeURIComponent(templateId)}`;
      const response = await axios.get(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });
      return response.data;
    } catch (error: any) {
      console.error('[TenantFormsService] getTemplate error:', error.message);
      throw error;
    }
  }

  // ---- MAPPINGS (B2.5: resolved form mappings for a contract) ----

  async listMappings(
    authHeader: string,
    tenantId: string,
    contractId: string
  ): Promise<any> {
    try {
      const url = `${BASE_URL}/mappings?contract_id=${encodeURIComponent(contractId)}`;
      const response = await axios.get(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });
      return response.data;
    } catch (error: any) {
      console.error('[TenantFormsService] listMappings error:', error.message);
      throw error;
    }
  }

  // ---- SELECTIONS ----

  async listSelections(
    authHeader: string,
    tenantId: string
  ): Promise<ListSelectionsResponse> {
    try {
      const url = `${BASE_URL}/selections`;
      const response = await axios.get<ListSelectionsResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });
      return response.data;
    } catch (error: any) {
      console.error('[tenantFormsService] listSelections error:', error.message);
      throw error;
    }
  }

  async toggleSelection(
    authHeader: string,
    tenantId: string,
    body: ToggleSelectionRequest
  ): Promise<TenantSelectionResponse> {
    try {
      const url = `${BASE_URL}/selections`;
      const response = await axios.post<TenantSelectionResponse>(url, body, {
        headers: this.getHeaders(authHeader, tenantId),
      });
      return response.data;
    } catch (error: any) {
      console.error('[tenantFormsService] toggleSelection error:', error.message);
      throw error;
    }
  }

  // ---- SUBMISSIONS ----

  async listSubmissions(
    authHeader: string,
    tenantId: string,
    filters: ListSubmissionsRequest
  ): Promise<ListSubmissionsResponse> {
    try {
      const params = new URLSearchParams();
      if (filters.event_id) params.append('event_id', filters.event_id);
      if (filters.contract_id) params.append('contract_id', filters.contract_id);
      if (filters.template_id) params.append('template_id', filters.template_id);
      const qs = params.toString();
      const url = `${BASE_URL}/submissions${qs ? `?${qs}` : ''}`;

      const response = await axios.get<ListSubmissionsResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });
      return response.data;
    } catch (error: any) {
      console.error('[tenantFormsService] listSubmissions error:', error.message);
      throw error;
    }
  }

  async getSubmission(
    authHeader: string,
    tenantId: string,
    submissionId: string
  ): Promise<FormSubmissionResponse> {
    try {
      const url = `${BASE_URL}/submissions/${submissionId}`;
      const response = await axios.get<FormSubmissionResponse>(url, {
        headers: this.getHeaders(authHeader, tenantId),
      });
      return response.data;
    } catch (error: any) {
      console.error('[tenantFormsService] getSubmission error:', error.message);
      throw error;
    }
  }

  async createSubmission(
    authHeader: string,
    tenantId: string,
    body: CreateSubmissionRequest
  ): Promise<FormSubmissionResponse> {
    try {
      const url = `${BASE_URL}/submissions`;
      const response = await axios.post<FormSubmissionResponse>(url, body, {
        headers: this.getHeaders(authHeader, tenantId),
      });
      return response.data;
    } catch (error: any) {
      console.error('[tenantFormsService] createSubmission error:', error.message);
      throw error;
    }
  }

  async updateSubmission(
    authHeader: string,
    tenantId: string,
    submissionId: string,
    body: UpdateSubmissionRequest
  ): Promise<FormSubmissionResponse> {
    try {
      const url = `${BASE_URL}/submissions/${submissionId}`;
      const response = await axios.put<FormSubmissionResponse>(url, body, {
        headers: this.getHeaders(authHeader, tenantId),
      });
      return response.data;
    } catch (error: any) {
      console.error('[tenantFormsService] updateSubmission error:', error.message);
      throw error;
    }
  }
}

export const tenantFormsService = new TenantFormsService();
