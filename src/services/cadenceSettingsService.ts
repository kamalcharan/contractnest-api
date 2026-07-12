// ============================================================================
// Cadence Settings Service — Group Session / smart Service Cycles (batch 2a)
// ============================================================================
// The tenant-level holiday calendar every service cycle can respect. Follows
// the vani-desk precedent: server-side Supabase client (service role); the RPCs
// (migration 016) do the work:
//   get_tenant_cadence_settings(p_tenant)
//   upsert_tenant_cadence_settings(p_tenant, p_weekly_holidays, p_default_shift)
//   add_tenant_holiday(p_tenant, p_date, p_label)
//   remove_tenant_holiday(p_tenant, p_date)
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface CadenceServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

class CadenceSettingsService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<CadenceServiceResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[CadenceSettingsService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[CadenceSettingsService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  getSettings(tenantId: string) {
    return this.call('get_tenant_cadence_settings', { p_tenant: tenantId });
  }

  updateSettings(tenantId: string, weeklyHolidays: number[], defaultShift: string) {
    return this.call('upsert_tenant_cadence_settings', {
      p_tenant: tenantId,
      p_weekly_holidays: weeklyHolidays,
      p_default_shift: defaultShift,
    });
  }

  addHoliday(tenantId: string, date: string, label?: string) {
    return this.call('add_tenant_holiday', { p_tenant: tenantId, p_date: date, p_label: label ?? null });
  }

  removeHoliday(tenantId: string, date: string) {
    return this.call('remove_tenant_holiday', { p_tenant: tenantId, p_date: date });
  }
}

export default new CadenceSettingsService();
