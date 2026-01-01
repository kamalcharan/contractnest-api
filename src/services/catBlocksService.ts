/**
 * Cat Blocks Service
 * Communicates with cat-blocks edge function
 */

import crypto from 'crypto';
import {
  CatBlock,
  CreateBlockRequest,
  UpdateBlockRequest,
  BlockQueryParams,
  ApiResponse,
  BlockListResponse,
  RequestContext,
} from './catalogStudioTypes';

export class CatBlocksService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is required');
    }

    this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/cat-blocks`;
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

  /**
   * List all blocks (filtered by admin status)
   */
  async listBlocks(
    context: RequestContext,
    params?: BlockQueryParams
  ): Promise<ApiResponse<BlockListResponse>> {
    const queryString = params ? this.buildQueryString(params) : '';
    const path = queryString ? `?${queryString}` : '';
    return this.makeRequest<BlockListResponse>('GET', path, context);
  }

  /**
   * Get single block by ID
   */
  async getBlock(
    context: RequestContext,
    blockId: string
  ): Promise<ApiResponse<CatBlock>> {
    return this.makeRequest<CatBlock>('GET', `/${blockId}`, context);
  }

  /**
   * Create new block (admin only)
   */
  async createBlock(
    context: RequestContext,
    data: CreateBlockRequest
  ): Promise<ApiResponse<CatBlock>> {
    if (!context.isAdmin) {
      return {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only admins can create blocks',
        },
      };
    }
    return this.makeRequest<CatBlock>('POST', '', context, data);
  }

  /**
   * Update existing block (admin only)
   */
  async updateBlock(
    context: RequestContext,
    blockId: string,
    data: UpdateBlockRequest
  ): Promise<ApiResponse<CatBlock>> {
    if (!context.isAdmin) {
      return {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only admins can update blocks',
        },
      };
    }
    return this.makeRequest<CatBlock>('PATCH', `/${blockId}`, context, data);
  }

  /**
   * Delete block - soft delete (admin only)
   */
  async deleteBlock(
    context: RequestContext,
    blockId: string
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    if (!context.isAdmin) {
      return {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only admins can delete blocks',
        },
      };
    }
    return this.makeRequest<{ deleted: boolean }>('DELETE', `/${blockId}`, context);
  }

  /**
   * Build query string from parameters
   */
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

// Export singleton instance
export const catBlocksService = new CatBlocksService();
