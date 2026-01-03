// backend/src/services/catTemplatesService.ts
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
} from '../types/catalogStudioTypes';

export class CatTemplatesService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      console.warn('⚠️ SUPABASE_URL not set - CatTemplatesService will use mock mode');
      this.edgeFunctionUrl = '';
    } else {
      this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/cat-templates`;
    }
    this.internalSecret = process.env.INTERNAL_SIGNING_SECRET || '';
    console.log('✅ Cat Templates Service: Initialized successfully');
  }

  /**
   * Generate HMAC-SHA256 signature matching Edge Function format
   * Edge expects: payload = `${timestamp}.${body}` with base64 encoding
   */
  private generateSignature(body: string, timestamp: string): string {
    if (!this.internalSecret) {
      return '';
    }
    try {
      const payload = `${timestamp}.${body}`;
      return crypto
        .createHmac('sha256', this.internalSecret)
        .update(payload)
        .digest('base64');
    } catch (error) {
      console.error('Error generating signature:', error);
      return '';
    }
  }

  private async makeRequest<T>(
    method: string,
    path: string,
    context: RequestContext,
    body?: any
  ): Promise<ApiResponse<T>> {
    if (!this.edgeFunctionUrl) {
      console.log('📦 CatTemplatesService: No edge function URL, returning mock data');
      return {
        success: true,
        data: { templates: [], total: 0 } as unknown as T,
      };
    }

    const requestBody = body ? JSON.stringify(body) : '';
    const timestamp = Date.now().toString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${context.accessToken}`,
      'x-tenant-id': context.tenantId,
      'x-is-admin': String(context.isAdmin),
      'x-timestamp': timestamp,
    };

    if (this.internalSecret) {
      headers['x-internal-signature'] = this.generateSignature(requestBody, timestamp);
    }

    try {
      const url = `${this.edgeFunctionUrl}${path}`;
      console.log(`📦 CatTemplatesService: ${method} ${url}`);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? requestBody : undefined,
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('📦 CatTemplatesService error:', responseData);
        return {
          success: false,
          error: {
            code: responseData.error?.code || 'EDGE_FUNCTION_ERROR',
            message: responseData.error?.message || 'Edge function request failed',
          },
        };
      }

      return {
        success: true,
        data: responseData.data,
        meta: responseData.metadata,
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

  async listTemplates(context: RequestContext, params?: TemplateQueryParams): Promise<ApiResponse<TemplateListResponse>> {
    if (!this.edgeFunctionUrl) return { success: true, data: { templates: [], total: 0 } };
    const qs = params ? this.buildQueryString(params) : '';
    return this.makeRequest<TemplateListResponse>('GET', qs ? `?${qs}` : '', context);
  }

  async listSystemTemplates(context: RequestContext, params?: TemplateQueryParams): Promise<ApiResponse<TemplateListResponse>> {
    if (!this.edgeFunctionUrl) return { success: true, data: { templates: [], total: 0 } };
    const qs = params ? this.buildQueryString(params) : '';
    return this.makeRequest<TemplateListResponse>('GET', `/system${qs ? `?${qs}` : ''}`, context);
  }

  async listPublicTemplates(context: RequestContext, params?: TemplateQueryParams): Promise<ApiResponse<TemplateListResponse>> {
    if (!this.edgeFunctionUrl) return { success: true, data: { templates: [], total: 0 } };
    const qs = params ? this.buildQueryString(params) : '';
    return this.makeRequest<TemplateListResponse>('GET', `/public${qs ? `?${qs}` : ''}`, context);
  }

  async getTemplate(context: RequestContext, templateId: string): Promise<ApiResponse<CatTemplate>> {
    if (!this.edgeFunctionUrl) return { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
    return this.makeRequest<CatTemplate>('GET', `?id=${templateId}`, context);
  }

  async createTemplate(context: RequestContext, data: CreateTemplateRequest): Promise<ApiResponse<CatTemplate>> {
    if (!this.edgeFunctionUrl) {
      return {
        success: true,
        data: {
          id: crypto.randomUUID(),
          name: data.name,
          description: data.description,
          blocks: data.blocks,
          is_system: false,
          is_public: data.is_public || false,
          is_live: false,
          status_id: data.status_id || 'draft',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as CatTemplate,
      };
    }
    return this.makeRequest<CatTemplate>('POST', '', context, data);
  }

  async copyTemplate(context: RequestContext, templateId: string, data?: CopyTemplateRequest): Promise<ApiResponse<CatTemplate>> {
    if (!this.edgeFunctionUrl) {
      return {
        success: true,
        data: {
          id: crypto.randomUUID(),
          name: data?.name || 'Copy',
          blocks: [],
          is_system: false,
          is_public: false,
          is_live: false,
          status_id: 'draft',
          copied_from_id: templateId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as CatTemplate,
      };
    }
    return this.makeRequest<CatTemplate>('POST', `?id=${templateId}&action=copy`, context, data || {});
  }

  async updateTemplate(context: RequestContext, templateId: string, data: UpdateTemplateRequest): Promise<ApiResponse<CatTemplate>> {
    if (!this.edgeFunctionUrl) {
      return {
        success: true,
        data: {
          id: templateId,
          name: data.name || 'Updated',
          blocks: data.blocks || [],
          is_system: false,
          is_public: data.is_public || false,
          is_live: false,
          status_id: data.status_id || 'draft',
          updated_at: new Date().toISOString(),
        } as CatTemplate,
      };
    }
    return this.makeRequest<CatTemplate>('PATCH', `?id=${templateId}`, context, data);
  }

  async deleteTemplate(context: RequestContext, templateId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    if (!this.edgeFunctionUrl) return { success: true, data: { deleted: true } };
    return this.makeRequest<{ deleted: boolean }>('DELETE', `?id=${templateId}`, context);
  }

  private buildQueryString(params: TemplateQueryParams): string {
    const sp = new URLSearchParams();
    if (params.status_id) sp.append('status_id', params.status_id);
    if (params.is_public !== undefined) sp.append('is_public', String(params.is_public));
    if (params.search) sp.append('search', params.search);
    if (params.page) sp.append('page', String(params.page));
    if (params.limit) sp.append('limit', String(params.limit));
    return sp.toString();
  }
}

export const catTemplatesService = new CatTemplatesService();