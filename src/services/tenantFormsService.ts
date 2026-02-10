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
