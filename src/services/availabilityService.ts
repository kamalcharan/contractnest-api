// ============================================================================
// Availability Service — who works when (migration jtd-nucleus/024)
// ============================================================================
// Per-user working hours and weekly off (NULL = the tenant's cadence settings)
// and dated leave. Same precedent as the cadence settings service: server-side
// Supabase client (service role), the RPCs do the work and refuse with a
// machine-readable `reason`:
//   get_user_availability(p_tenant, p_user)
//   set_user_availability(p_tenant, p_user, p_work_start, p_work_end, p_weekly_off, p_actor)
//   add_user_leave(p_tenant, p_user, p_date, p_part, p_label, p_actor)
//   remove_user_leave(p_tenant, p_user, p_date)
//   get_team_availability(p_tenant, p_days)
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AvailabilityResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: any };
}

class AvailabilityService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  /** Transport errors → RPC_ERROR; {success:false, reason} → the reason as the code. */
  private async call(fn: string, args: Record<string, unknown>): Promise<AvailabilityResult> {
    const supabase = this.client();
    if (!supabase) return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[AvailabilityService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      if (data && data.success === false) {
        return { success: false, error: { code: data.reason || 'REFUSED', message: data.message || `Refused: ${data.reason || 'unknown'}`, details: data } };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[AvailabilityService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  getUser(tenantId: string, userId: string) {
    return this.call('get_user_availability', { p_tenant: tenantId, p_user: userId });
  }

  /** NULL hours + NULL weekly off = back to the tenant's settings. */
  setUser(tenantId: string, userId: string, workStart: string | null, workEnd: string | null, weeklyOff: number[] | null, actorId: string | null) {
    return this.call('set_user_availability', {
      p_tenant: tenantId, p_user: userId, p_work_start: workStart, p_work_end: workEnd, p_weekly_off: weeklyOff, p_actor: actorId,
    });
  }

  addLeave(tenantId: string, userId: string, date: string, part: 'full' | 'am' | 'pm', label: string | null, actorId: string | null) {
    return this.call('add_user_leave', { p_tenant: tenantId, p_user: userId, p_date: date, p_part: part, p_label: label, p_actor: actorId });
  }

  removeLeave(tenantId: string, userId: string, date: string) {
    return this.call('remove_user_leave', { p_tenant: tenantId, p_user: userId, p_date: date });
  }

  team(tenantId: string, days: number) {
    return this.call('get_team_availability', { p_tenant: tenantId, p_days: days });
  }
}

export default new AvailabilityService();
