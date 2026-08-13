// ============================================================================
// Extend Service — customer touchpoints (Website / WhatsApp / Email)
// ============================================================================
// Server-side Supabase client (service role); the SECURITY DEFINER RPCs
// (migration 033-035, extend-touchpoints-storefront) own the logic.
// Public storefront RPCs are gated by the opaque storefront key; touchpoint
// management RPCs are called behind authenticate + x-tenant-id.
// Mirrors sessionCheckinService's pattern exactly.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface ExtendServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

class ExtendService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<ExtendServiceResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[ExtendService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      // RPCs return {success:false,...} for business refusals — pass through
      if (data && data.success === false) {
        return {
          success: false,
          error: { code: data.error_code || 'REFUSED', message: data.error || 'Request refused' },
        };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[ExtendService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  // ── public (storefront-key-gated) ──
  resolveStorefront(key: string) {
    return this.call('resolve_storefront', { p_key: key });
  }
  purchaseFromStorefront(key: string, buyer: Record<string, unknown>) {
    return this.call('purchase_from_storefront', { p_key: key, p_buyer: buyer });
  }

  // ── authenticated (tenant-scoped) ──
  listTouchpoints(tenantId: string) {
    return this.call('list_touchpoints', { p_tenant_id: tenantId });
  }
  createTouchpoint(tenantId: string, templateId: string, type: string, userId: string | null) {
    return this.call('create_touchpoint', {
      p_tenant_id: tenantId,
      p_template_id: templateId,
      p_type: type,
      p_user_id: userId,
    });
  }
  setTouchpointActive(tenantId: string, touchpointId: string, active: boolean) {
    return this.call('set_touchpoint_active', {
      p_tenant_id: tenantId,
      p_touchpoint_id: touchpointId,
      p_active: active,
    });
  }
}

export default new ExtendService();
