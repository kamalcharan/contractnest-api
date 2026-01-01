/**
 * Cat Templates Service
 * Communicates with cat-templates edge function
 */

import crypto from 'crypto';
import {
  CatTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CopyTemplateRequest,
  TemplateQueryParams,
  ApiResponse,
  TemplateListResponse,
  RequestContext,
} from './catalogStudioTypes';

export class CatTemplatesService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is required');
    }

    this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/cat-templates`;
    this.internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET || '';

    if (!this.internalSigningSecret) {
      console.warn('⚠️ INTERNAL_SIGNING_SECRET not set - requests will not be signed');
    }
  }

  /**
   * Generate HMAC signature for request authentication
   */
  private generateHMACSignature(payload: string, timestamp: string): string {
    if (!this.internalSigningSecret) {
      return '';
    }

    try {
      const data = payload + timestamp;
      return crypto
        .createHmac('sha256', this.internalSigningSecret)
        .update(data)
        .digest('hex');
    } catch (error) {
      console.error('Error generating HMAC signature:', error);
      return '';
    }
  }

  /**
   * Make authenticated request to edge function
   */
  private async makeRequest<T>(
    method: string,
    path: string,
    context: RequestContext,
    body?: any
  ): Promise<ApiResponse<T>> {
    const timestamp = new Date().toISOString();
    const requestBody = body ? JSON.stringify(body) : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${context.accessToken}`,
      'x-tenant-id': context.tenantId,
      'x-user-id': context.userId,
      'x-product': context.product,
      'x-is-admin': String(context.isAdmin),
      'x-environment': context.environment,
      'x-timestamp': timestamp,
    };

    // Add HMAC signature
    if (this.internalSigningSecret) {
      headers['x-signature'] = this.generateHMACSignature(requestBody, timestamp);
    }

    try {
      const url = `${this.edgeFunctionUrl}${path}`;
      const response = await fetch(url, {
        method,
        headers,
        body: body ? requestBody : undefined,
      });

      const responseData = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: responseData.error?.code || 'EDGE_FUNCTION_ERROR',
            message: responseData.error?.message || 'Edge function request failed',
            details: responseData.error?.details,
          },
        };
      }

      return {
        success: true,
        data: responseData.data,
        meta: responseData.meta,
      };
    } catch (error: any) {
      console.error('CatTemplatesService request error:', error);
      return {
        success: false,
        error: {
          code: 'SERVICE_ERROR',
          message: error.message || 'Service request failed',
        },
      };
    }
  }

  /**
   * List tenant templates
   */
  async listTemplates(
    context: RequestContext,
    params?: TemplateQueryParams
  ): Promise<ApiResponse<TemplateListResponse>> {
    const queryString = params ? this.buildQueryString(params) : '';
    const path = queryString ? `?${queryString}` : '';
    return this.makeRequest<TemplateListResponse>('GET', path, context);
  }

  /**
   * List system templates (global templates)
   */
  async listSystemTemplates(
    context: RequestContext,
    params?: TemplateQueryParams
  ): Promise<ApiResponse<TemplateListResponse>> {
    const queryString = params ? this.buildQueryString(params) : '';
    const path = `/system${queryString ? `?${queryString}` : ''}`;
    return this.makeRequest<TemplateListResponse>('GET', path, context);
  }

  /**
   * List public templates (from other tenants)
   */
  async listPublicTemplates(
    context: RequestContext,
    params?: TemplateQueryParams
  ): Promise<ApiResponse<TemplateListResponse>> {
    const queryString = params ? this.buildQueryString(params) : '';
    const path = `/public${queryString ? `?${queryString}` : ''}`;
    return this.makeRequest<TemplateListResponse>('GET', path, context);
  }

  /**
   * Get single template by ID
   */
  async getTemplate(
    context: RequestContext,
    templateId: string
  ): Promise<ApiResponse<CatTemplate>> {
    return this.makeRequest<CatTemplate>('GET', `/${templateId}`, context);
  }

  /**
   * Create new template
   */
  async createTemplate(
    context: RequestContext,
    data: CreateTemplateRequest
  ): Promise<ApiResponse<CatTemplate>> {
    return this.makeRequest<CatTemplate>('POST', '', context, data);
  }

  /**
   * Copy system template to tenant space
   */
  async copyTemplate(
    context: RequestContext,
    templateId: string,
    data?: CopyTemplateRequest
  ): Promise<ApiResponse<CatTemplate>> {
    return this.makeRequest<CatTemplate>('POST', `/${templateId}/copy`, context, data || {});
  }

  /**
   * Update existing template
   */
  async updateTemplate(
    context: RequestContext,
    templateId: string,
    data: UpdateTemplateRequest
  ): Promise<ApiResponse<CatTemplate>> {
    return this.makeRequest<CatTemplate>('PATCH', `/${templateId}`, context, data);
  }

  /**
   * Delete template - soft delete
   */
  async deleteTemplate(
    context: RequestContext,
    templateId: string
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.makeRequest<{ deleted: boolean }>('DELETE', `/${templateId}`, context);
  }

  /**
   * Build query string from parameters
   */
  private buildQueryString(params: TemplateQueryParams): string {
    const searchParams = new URLSearchParams();

    if (params.status_id) {
      searchParams.append('status_id', params.status_id);
    }
    if (params.is_public !== undefined) {
      searchParams.append('is_public', String(params.is_public));
    }
    if (params.search) {
      searchParams.append('search', params.search);
    }
    if (params.page) {
      searchParams.append('page', String(params.page));
    }
    if (params.limit) {
      searchParams.append('limit', String(params.limit));
    }

    return searchParams.toString();
  }
}

// Export singleton instance
export const catTemplatesService = new CatTemplatesService();
