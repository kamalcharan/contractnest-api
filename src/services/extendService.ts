// ============================================================================
// Extend Service — storefronts (package-first) + public checkout with OTP
// ============================================================================
// Server-side Supabase client (service role); the SECURITY DEFINER RPCs
// (migration business-model-v2/038) own the logic. Public storefront RPCs are
// gated by the opaque storefront key; management RPCs are called behind
// authenticate + x-tenant-id. Mirrors sessionCheckinService's pattern.
//
// A storefront = t_touchpoints row: name, template_ids (template FAMILIES —
// the storefront follows the latest signed-off version), card_style, faq and
// counters. Channels (website / WhatsApp) are entitlements on the tenant, not
// rows: the same storefront is a widget, a link, a package page and a share.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface ExtendServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface StorefrontPatch {
  name?: string;
  template_ids?: string[];
  card_style?: Record<string, unknown>;
  faq?: Array<{ q: string; a: string }>;
  is_active?: boolean;
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
          data,
        };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[ExtendService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  // ── public (storefront-key-gated) ──
  /** The page / widget payload. `count=false` for the seller's own preview. */
  resolveStorefront(key: string, count = true) {
    return this.call('resolve_storefront', { p_key: key, p_count: count });
  }
  markStarted(key: string) {
    return this.call('storefront_mark_started', { p_key: key });
  }
  otpIssue(key: string, phone: string) {
    return this.call('storefront_otp_issue', { p_key: key, p_phone: phone });
  }
  otpVerify(otpId: string, code: string) {
    return this.call('storefront_otp_verify', { p_otp_id: otpId, p_code: code });
  }
  /** After OTP: name a lead for a checkout that may never finish (migration 039). */
  identify(key: string, buyer: Record<string, unknown>) {
    return this.call('storefront_identify', { p_key: key, p_buyer: buyer });
  }
  purchaseFromStorefront(key: string, buyer: Record<string, unknown>) {
    return this.call('purchase_from_storefront', { p_key: key, p_buyer: buyer });
  }

  // ── authenticated (tenant-scoped) ──
  listStorefronts(tenantId: string) {
    return this.call('list_storefronts', { p_tenant_id: tenantId });
  }
  createStorefront(tenantId: string, templateIds: string[], name: string | null,
                   cardStyle: Record<string, unknown>, userId: string | null) {
    return this.call('create_storefront', {
      p_tenant_id: tenantId,
      p_template_ids: templateIds,
      p_name: name,
      p_card_style: cardStyle,
      p_user_id: userId,
    });
  }
  updateStorefront(tenantId: string, storefrontId: string, patch: StorefrontPatch) {
    return this.call('update_storefront', {
      p_tenant_id: tenantId,
      p_storefront_id: storefrontId,
      p_patch: patch,
    });
  }

  // ── legacy (kept one release for the old /touchpoints routes) ──
  listTouchpoints(tenantId: string) {
    return this.call('list_touchpoints', { p_tenant_id: tenantId });
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
