// src/services/clientAssetRegistryService.ts
// Calls the client-asset-registry edge function via axios.

import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';

const EDGE_BASE = `${SUPABASE_URL}/functions/v1/client-asset-registry`;

function buildHeaders(authToken: string, tenantId: string) {
  return {
    Authorization: authToken,
    'x-tenant-id': tenantId,
    'Content-Type': 'application/json'
  };
}

export const clientAssetRegistryService = {

  // ── Assets CRUD ──────────────────────────────────────────────

  async listAssets(
    authToken: string,
    tenantId: string,
    params: {
      contact_id?: string;
      resource_type_id?: string;
      status?: string;
      is_live?: boolean;
      limit?: number;
      offset?: number;
      id?: string;
    }
  ) {
    try {
      const response = await axios.get(EDGE_BASE, {
        headers: buildHeaders(authToken, tenantId),
        params
      });
      return response.data;
    } catch (error) {
      console.error('Error in clientAssetRegistryService.listAssets:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_client_asset_registry', action: 'listAssets' },
        tenantId
      });
      throw error;
    }
  },

  async createAsset(authToken: string, tenantId: string, data: any) {
    try {
      const response = await axios.post(EDGE_BASE, data, {
        headers: buildHeaders(authToken, tenantId)
      });
      return response.data;
    } catch (error) {
      console.error('Error in clientAssetRegistryService.createAsset:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_client_asset_registry', action: 'createAsset' },
        tenantId
      });
      throw error;
    }
  },

  async updateAsset(authToken: string, tenantId: string, assetId: string, data: any) {
    try {
      const response = await axios.patch(`${EDGE_BASE}?id=${assetId}`, data, {
        headers: buildHeaders(authToken, tenantId)
      });
      return response.data;
    } catch (error) {
      console.error('Error in clientAssetRegistryService.updateAsset:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_client_asset_registry', action: 'updateAsset' },
        tenantId
      });
      throw error;
    }
  },

  async deleteAsset(authToken: string, tenantId: string, assetId: string) {
    try {
      const response = await axios.delete(`${EDGE_BASE}?id=${assetId}`, {
        headers: buildHeaders(authToken, tenantId)
      });
      return response.data;
    } catch (error) {
      console.error('Error in clientAssetRegistryService.deleteAsset:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_client_asset_registry', action: 'deleteAsset' },
        tenantId
      });
      throw error;
    }
  },

  // ── Hierarchy ────────────────────────────────────────────────

  async getChildren(authToken: string, tenantId: string, parentAssetId: string) {
    try {
      const response = await axios.get(`${EDGE_BASE}/children`, {
        headers: buildHeaders(authToken, tenantId),
        params: { parent_asset_id: parentAssetId }
      });
      return response.data;
    } catch (error) {
      console.error('Error in clientAssetRegistryService.getChildren:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_client_asset_registry', action: 'getChildren' },
        tenantId
      });
      throw error;
    }
  },

  // ── Contract ↔ Asset linking ─────────────────────────────────

  async getContractAssets(authToken: string, tenantId: string, contractId: string) {
    try {
      const response = await axios.get(`${EDGE_BASE}/contract-assets`, {
        headers: buildHeaders(authToken, tenantId),
        params: { contract_id: contractId }
      });
      return response.data;
    } catch (error) {
      console.error('Error in clientAssetRegistryService.getContractAssets:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_client_asset_registry', action: 'getContractAssets' },
        tenantId
      });
      throw error;
    }
  },

  async linkContractAssets(authToken: string, tenantId: string, data: any) {
    try {
      const response = await axios.post(`${EDGE_BASE}/contract-assets`, data, {
        headers: buildHeaders(authToken, tenantId)
      });
      return response.data;
    } catch (error) {
      console.error('Error in clientAssetRegistryService.linkContractAssets:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_client_asset_registry', action: 'linkContractAssets' },
        tenantId
      });
      throw error;
    }
  },

  async unlinkContractAsset(authToken: string, tenantId: string, contractId: string, assetId: string) {
    try {
      const response = await axios.delete(`${EDGE_BASE}/contract-assets`, {
        headers: buildHeaders(authToken, tenantId),
        params: { contract_id: contractId, asset_id: assetId }
      });
      return response.data;
    } catch (error) {
      console.error('Error in clientAssetRegistryService.unlinkContractAsset:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_client_asset_registry', action: 'unlinkContractAsset' },
        tenantId
      });
      throw error;
    }
  }
};
