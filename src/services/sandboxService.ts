// ============================================================================
// Sandbox Service — clear a tenant's transactional data (keeps masterdata)
// ============================================================================
// Server-side Supabase client (service role); the SECURITY DEFINER RPCs
// (migration 018) own the delete logic. Always scoped to one tenant.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SandboxServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

class SandboxService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<SandboxServiceResult> {
    const supabase = this.client();
    if (!supabase) return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[SandboxService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[SandboxService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  preview(tenantId: string, isLive: boolean) {
    return this.call('sandbox_preview_counts', { p_tenant: tenantId, p_is_live: isLive });
  }

  reset(tenantId: string, isLive: boolean, includeContacts: boolean, includeEquipment: boolean) {
    return this.call('sandbox_reset_transactions', {
      p_tenant: tenantId,
      p_is_live: isLive,
      p_include_contacts: includeContacts,
      p_include_equipment: includeEquipment,
    });
  }
}

export default new SandboxService();
