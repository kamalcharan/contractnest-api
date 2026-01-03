// backend/src/services/catBlocksService.ts
import crypto from 'crypto';
import {
  CatBlock,
  CreateBlockRequest,
  UpdateBlockRequest,
  BlockQueryParams,
  ApiResponse,
  BlockListResponse,
  RequestContext,
} from '../types/catalogStudioTypes';

export class CatBlocksService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    
    if (!supabaseUrl) {
      console.warn('⚠️ SUPABASE_URL not set - CatBlocksService will use mock mode');
      this.edgeFunctionUrl = '';
    } else {
      this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/cat-blocks`;
    }

    this.internalSecret = process.env.INTERNAL_SIGNING_SECRET || '';

    if (!this.internalSecret) {
      console.warn('⚠️ INTERNAL_SIGNING_SECRET not set - requests will not be signed');
    }
    
    console.log('✅ Cat Blocks Service: Initialized successfully');
  }

  /**
   * Generate HMAC-SHA256 signature matching Edge Function format
   * Edge expects: payload = `${timestamp}.${body}` with base64 encoding
   */
  private generateSignature(body: string, timestamp: string): string {
    if (!this.internalSecret) {
      console.warn('Cannot generate signature: INTERNAL_SIGNING_SECRET not configured');
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
      console.log('📦 CatBlocksService: No edge function URL, returning mock data');
      return {
        success: true,
        data: { blocks: [], total: 0 } as unknown as T,
      };
    }

    const requestBody = body ? JSON.stringify(body) : '';
    const timestamp = Date.now().toString();  // Edge expects milliseconds as string

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${context.accessToken}`,
      'x-tenant-id': context.tenantId,
      'x-is-admin': String(context.isAdmin),
      'x-timestamp': timestamp,  // Required by Edge Function
    };

    // Add signature (required for all requests)
    if (this.internalSecret) {
      headers['x-internal-signature'] = this.generateSignature(requestBody, timestamp);
    }

    try {
      const url = `${this.edgeFunctionUrl}${path}`;
      console.log(`📦 CatBlocksService: ${method} ${url}`);
      
      const response = await fetch(url, {
        method,
        headers,
        body: body ? requestBody : undefined,
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('📦 CatBlocksService error:', responseData);
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
        meta: responseData.metadata,
      };
    } catch (error: any) {
      console.error('CatBlocksService request error:', error);
      return {
        success: false,
        error: {
          code: 'SERVICE_ERROR',
          message: error.message || 'Service request failed',
        },
      };
    }
  }

  async listBlocks(
    context: RequestContext,
    params?: BlockQueryParams
  ): Promise<ApiResponse<BlockListResponse>> {
    if (!this.edgeFunctionUrl) {
      return { success: true, data: { blocks: [], total: 0 } };
    }
    
    const queryString = params ? this.buildQueryString(params) : '';
    const path = queryString ? `?${queryString}` : '';
    return this.makeRequest<BlockListResponse>('GET', path, context);
  }

  async getBlock(
    context: RequestContext,
    blockId: string
  ): Promise<ApiResponse<CatBlock>> {
    if (!this.edgeFunctionUrl) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Block not found' } };
    }
    return this.makeRequest<CatBlock>('GET', `?id=${blockId}`, context);
  }

  async createBlock(
    context: RequestContext,
    data: CreateBlockRequest
  ): Promise<ApiResponse<CatBlock>> {
    if (!context.isAdmin) {
      return {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can create blocks' },
      };
    }
    
    if (!this.edgeFunctionUrl) {
      const mockBlock: CatBlock = {
        id: crypto.randomUUID(),
        name: data.name,
        description: data.description,
        block_type_id: data.block_type_id,
        pricing_mode_id: data.pricing_mode_id,
        is_admin: data.is_admin || false,
        visible: data.visible !== false,
        is_active: true,
        config: data.config,
        tags: data.tags,
        created_by: context.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return { success: true, data: mockBlock };
    }
    
    return this.makeRequest<CatBlock>('POST', '', context, data);
  }

  async updateBlock(
    context: RequestContext,
    blockId: string,
    data: UpdateBlockRequest
  ): Promise<ApiResponse<CatBlock>> {
    if (!context.isAdmin) {
      return {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can update blocks' },
      };
    }
    
    if (!this.edgeFunctionUrl) {
      return {
        success: true,
        data: {
          id: blockId,
          name: data.name || 'Updated Block',
          block_type_id: data.block_type_id || 'service',
          pricing_mode_id: data.pricing_mode_id || 'independent',
          is_admin: false,
          visible: true,
          is_active: true,
          config: data.config || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };
    }
    
    return this.makeRequest<CatBlock>('PATCH', `?id=${blockId}`, context, data);
  }

  async deleteBlock(
    context: RequestContext,
    blockId: string
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    if (!context.isAdmin) {
      return {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can delete blocks' },
      };
    }
    
    if (!this.edgeFunctionUrl) {
      return { success: true, data: { deleted: true } };
    }
    
    return this.makeRequest<{ deleted: boolean }>('DELETE', `?id=${blockId}`, context);
  }

  private buildQueryString(params: BlockQueryParams): string {
    const searchParams = new URLSearchParams();

    if (params.block_type_id) {
      searchParams.append('block_type_id', params.block_type_id);
    }
    if (params.pricing_mode_id) {
      searchParams.append('pricing_mode_id', params.pricing_mode_id);
    }
    if (params.is_active !== undefined) {
      searchParams.append('is_active', String(params.is_active));
    }
    if (params.tags && params.tags.length > 0) {
      searchParams.append('tags', params.tags.join(','));
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

export const catBlocksService = new CatBlocksService();