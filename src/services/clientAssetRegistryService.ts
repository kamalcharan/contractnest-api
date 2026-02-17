// src/services/clientAssetRegistryService.ts
// Service layer for Client Asset Registry — calls Express API (which proxies to Edge)

import api from './api';
import { API_ENDPOINTS } from './serviceURLs';
import type {
  ClientAsset,
  ClientAssetFilters,
  ClientAssetFormData,
  ClientAssetListResponse,
  EquipmentCategory,
} from '@/types/clientAssetRegistry';

class ClientAssetRegistryService {

  // ── Equipment Categories (from DB) ──────────────────────────────────

  async getEquipmentCategories(): Promise<EquipmentCategory[]> {
    try {
      const url = API_ENDPOINTS.RESOURCES.RESOURCE_TYPES_BY_PARENT('equipment');
      const response = await api.get(url);
      const data = response.data?.data || response.data;
      return Array.isArray(data) ? data : [];
    } catch (error: any) {
      throw this.handleError(error, 'Failed to load equipment categories');
    }
  }

  // ── List Assets (with filters) ────────────────────────────────────

  async listAssets(filters: ClientAssetFilters = {}): Promise<ClientAssetListResponse> {
    try {
      const url = API_ENDPOINTS.CLIENT_ASSET_REGISTRY.LIST_WITH_FILTERS(filters);
      const response = await api.get(url);
      const data = response.data?.data || response.data;

      if (Array.isArray(data)) {
        return {
          success: true,
          data,
          pagination: { total: data.length, limit: filters.limit || 50, offset: filters.offset || 0, has_more: false },
        };
      }

      return {
        success: true,
        data: data?.data || data?.items || [],
        pagination: data?.pagination || { total: 0, limit: 50, offset: 0, has_more: false },
      };
    } catch (error: any) {
      throw this.handleError(error, 'Failed to load client assets');
    }
  }

  // ── Get Single Asset ──────────────────────────────────────────────

  async getAsset(id: string): Promise<ClientAsset> {
    try {
      const url = API_ENDPOINTS.CLIENT_ASSET_REGISTRY.GET(id);
      const response = await api.get(url);
      return response.data?.data || response.data;
    } catch (error: any) {
      throw this.handleError(error, 'Failed to load asset');
    }
  }

  // ── Create Asset ──────────────────────────────────────────────────

  async createAsset(formData: ClientAssetFormData): Promise<ClientAsset> {
    try {
      const payload = this.transformForAPI(formData);
      const response = await api.post(API_ENDPOINTS.CLIENT_ASSET_REGISTRY.CREATE, payload, {
        headers: {
          'x-idempotency-key': `create-client-asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        },
      });
      return response.data?.data || response.data;
    } catch (error: any) {
      throw this.handleError(error, 'Failed to create asset');
    }
  }

  // ── Update Asset ──────────────────────────────────────────────────

  async updateAsset(id: string, formData: Partial<ClientAssetFormData>): Promise<ClientAsset> {
    try {
      const payload = this.transformForAPI(formData);
      const url = API_ENDPOINTS.CLIENT_ASSET_REGISTRY.UPDATE(id);
      const response = await api.patch(url, payload);
      return response.data?.data || response.data;
    } catch (error: any) {
      throw this.handleError(error, 'Failed to update asset');
    }
  }

  // ── Delete (soft) Asset ───────────────────────────────────────────

  async deleteAsset(id: string): Promise<void> {
    try {
      const url = API_ENDPOINTS.CLIENT_ASSET_REGISTRY.DELETE(id);
      await api.delete(url);
    } catch (error: any) {
      throw this.handleError(error, 'Failed to delete asset');
    }
  }

  // ── Get Children (hierarchy) ──────────────────────────────────────

  async getChildren(parentAssetId: string): Promise<ClientAsset[]> {
    try {
      const url = API_ENDPOINTS.CLIENT_ASSET_REGISTRY.CHILDREN(parentAssetId);
      const response = await api.get(url);
      const data = response.data?.data || response.data;
      return Array.isArray(data) ? data : [];
    } catch (error: any) {
      throw this.handleError(error, 'Failed to load child assets');
    }
  }

  // ── Contract-Asset Linking ────────────────────────────────────────

  async getContractAssets(contractId: string): Promise<any[]> {
    try {
      const url = API_ENDPOINTS.CLIENT_ASSET_REGISTRY.CONTRACT_ASSETS(contractId);
      const response = await api.get(url);
      return response.data?.data || [];
    } catch (error: any) {
      throw this.handleError(error, 'Failed to load contract assets');
    }
  }

  async linkContractAssets(contractId: string, assets: Array<{ asset_id: string; coverage_type?: string }>): Promise<any> {
    try {
      const response = await api.post(API_ENDPOINTS.CLIENT_ASSET_REGISTRY.LINK_CONTRACT_ASSETS, {
        contract_id: contractId,
        assets,
      });
      return response.data;
    } catch (error: any) {
      throw this.handleError(error, 'Failed to link assets to contract');
    }
  }

  async unlinkContractAsset(contractId: string, assetId: string): Promise<any> {
    try {
      const url = API_ENDPOINTS.CLIENT_ASSET_REGISTRY.UNLINK_CONTRACT_ASSET(contractId, assetId);
      const response = await api.delete(url);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error, 'Failed to unlink asset from contract');
    }
  }

  // ── Private helpers ───────────────────────────────────────────────

  private transformForAPI(formData: Partial<ClientAssetFormData>): Record<string, any> {
    const payload: Record<string, any> = { ...formData };

    // Remove empty optional fields entirely (express-validator rejects null)
    const optionalFields = [
      'code', 'description', 'location', 'make', 'model',
      'serial_number', 'purchase_date', 'warranty_expiry',
      'last_service_date', 'asset_type_id', 'parent_asset_id',
    ];
    for (const field of optionalFields) {
      if (payload[field] === '' || payload[field] === undefined || payload[field] === null) {
        delete payload[field];
      }
    }

    if (payload.specifications) {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(payload.specifications)) {
        if (k.trim() && String(v).trim()) {
          cleaned[k.trim()] = String(v).trim();
        }
      }
      payload.specifications = cleaned;
    }

    if (payload.tags) {
      payload.tags = payload.tags.filter((t: string) => t.trim());
    }

    return payload;
  }

  private handleError(error: any, defaultMessage: string): Error {
    const message = error.response?.data?.error || error.response?.data?.message || error.message || defaultMessage;
    const err = new Error(message);
    (err as any).status = error.response?.status;
    (err as any).code = error.response?.data?.code;
    return err;
  }
}

const clientAssetRegistryService = new ClientAssetRegistryService();
export default clientAssetRegistryService;
