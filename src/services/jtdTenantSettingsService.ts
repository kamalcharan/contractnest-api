// src/services/jtdTenantSettingsService.ts
// Tenant-facing JTD message-type settings — forwards to the jtd-tenant-settings
// edge function. Same tenant-route pattern as integrationService.ts (forwards
// caller's Authorization + x-tenant-id, no additional server-side check here).

import axios from 'axios';
import { SUPABASE_URL } from '../utils/supabaseConfig';
import { captureException } from '../utils/sentry';

export interface JtdMessageTypeTemplate {
  channel_code: string;
  subject: string | null;
  content: string;
}

export interface JtdMessageTypeSetting {
  source_type_code: string;
  name: string;
  description: string | null;
  is_global: boolean;
  is_enabled: boolean;
  templates: JtdMessageTypeTemplate[];
}

export const jtdTenantSettingsService = {
  async listMessageTypes(authToken: string, tenantId: string): Promise<JtdMessageTypeSetting[]> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/jtd-tenant-settings/message-types`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data?.data || [];
    } catch (error) {
      console.error('Error in listMessageTypes service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_jtd_tenant_settings', action: 'listMessageTypes' },
        extra: { tenantId }
      });
      throw error;
    }
  },

  async toggleMessageType(
    authToken: string,
    tenantId: string,
    sourceTypeCode: string,
    isEnabled: boolean
  ): Promise<{ success: boolean; data: { source_type_code: string; is_enabled: boolean } }> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.patch(
        `${SUPABASE_URL}/functions/v1/jtd-tenant-settings/message-types/${encodeURIComponent(sourceTypeCode)}`,
        { is_enabled: isEnabled },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in toggleMessageType service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_jtd_tenant_settings', action: 'toggleMessageType' },
        extra: { tenantId, sourceTypeCode }
      });
      throw error;
    }
  }
};
