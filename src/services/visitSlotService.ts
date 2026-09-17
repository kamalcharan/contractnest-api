// ============================================================================
// Visit Slot Service — the customer's side of an appointment (public, token-gated)
// ============================================================================
// Server-side Supabase client (service role); the SECURITY DEFINER RPCs
// (migration jtd-nucleus/015) own the logic. The slot_token in the URL IS the
// grant — the check-in pattern. No tenant header, no auth.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface VisitSlotResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class VisitSlotService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<VisitSlotResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[VisitSlotService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[VisitSlotService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  isToken(token: string | undefined): token is string {
    return !!token && UUID_RE.test(token);
  }

  resolve(token: string) {
    return this.call('visit_slot_resolve', { p_token: token });
  }

  respond(token: string, action: 'accept' | 'propose' | 'decline', proposedAt: string | null, note: string | null) {
    return this.call('visit_slot_respond', { p_token: token, p_action: action, p_proposed_at: proposedAt, p_note: note });
  }
}

export const visitSlotService = new VisitSlotService();
export default visitSlotService;
