// ============================================================================
// Group Sessions Dashboard Service — chair-side read model (Batch: GS dashboard)
// ============================================================================
// Server-side Supabase client (service role). The SECURITY DEFINER RPCs
// (migration 018_group_session_dashboard_rpcs) own all logic; this service only
// forwards tenant/is_live/ids. Generic for any tenant — a "group session" is any
// contract flagged metadata.group_session_owner='true'. Read-only.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface GsDashResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

class GroupSessionsDashboardService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<GsDashResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[GroupSessionsDashboardService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[GroupSessionsDashboardService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  /** Overview: list group sessions + aggregates for the tenant/environment. */
  dashSessions(tenantId: string, isLive: boolean) {
    return this.call('gs_dash_sessions', { p_tenant: tenantId, p_is_live: isLive });
  }

  /** Occurrences (shared schedule) for one group-session block. */
  dashOccurrences(tenantId: string, blockId: string, isLive: boolean) {
    return this.call('gs_dash_occurrences', { p_tenant: tenantId, p_block: blockId, p_is_live: isLive });
  }

  /** Generate the shared schedule for a block from its cadence config. */
  generateSchedule(tenantId: string, blockId: string, isLive: boolean, start?: string | null, end?: string | null) {
    return this.call('gs_generate_schedule', {
      p_tenant: tenantId, p_block: blockId, p_is_live: isLive,
      p_start: start ?? null, p_end: end ?? null,
    });
  }

  /** Move one occurrence to a new date (holiday reschedule). Refused once the
   * occurrence is 'held' (gs_schedule_move returns {ok:false, reason:'occurrence_completed'}). */
  scheduleMove(tenantId: string, occurrenceId: string, newDate: string, note?: string | null, changedBy?: string | null, changedByName?: string | null) {
    return this.call('gs_schedule_move', {
      p_tenant: tenantId, p_id: occurrenceId, p_new_date: newDate, p_note: note ?? null,
      p_changed_by: changedBy ?? null, p_changed_by_name: changedByName ?? null,
    });
  }

  /** Change one occurrence's status (scheduled/held/skipped/cancelled). Refuses
   * to transition away from 'held' once set. */
  scheduleStatus(tenantId: string, occurrenceId: string, status: string, note?: string | null, changedBy?: string | null, changedByName?: string | null) {
    return this.call('gs_schedule_status', {
      p_tenant: tenantId, p_id: occurrenceId, p_status: status, p_note: note ?? null,
      p_changed_by: changedBy ?? null, p_changed_by_name: changedByName ?? null,
    });
  }

  /** Add an ad-hoc occurrence to a block's schedule. */
  scheduleAdd(tenantId: string, blockId: string, isLive: boolean, date: string, note?: string | null) {
    return this.call('gs_schedule_add', {
      p_tenant: tenantId, p_block: blockId, p_is_live: isLive, p_date: date, p_note: note ?? null,
    });
  }

  /** Assign (or, with assignedTo=null, clear) one occurrence's chair — also
   * upserts/soft-deletes the linked appointment (gs_schedule_assign). Refused
   * once the occurrence is 'held'. */
  assignChair(tenantId: string, occurrenceId: string, assignedTo: string | null, assignedToName: string | null, changedBy?: string | null, changedByName?: string | null) {
    return this.call('gs_schedule_assign', {
      p_tenant: tenantId, p_id: occurrenceId, p_assigned_to: assignedTo, p_assigned_to_name: assignedToName,
      p_changed_by: changedBy ?? null, p_changed_by_name: changedByName ?? null,
    });
  }

  /** Set the default chair for every future, non-cancelled, non-held occurrence of a block. */
  assignDefaultChair(tenantId: string, blockId: string, isLive: boolean, assignedTo: string, assignedToName: string | null, changedBy?: string | null, changedByName?: string | null) {
    return this.call('gs_schedule_assign_default', {
      p_tenant: tenantId, p_block: blockId, p_is_live: isLive, p_assigned_to: assignedTo, p_assigned_to_name: assignedToName,
      p_changed_by: changedBy ?? null, p_changed_by_name: changedByName ?? null,
    });
  }

  /** Roster (distinct members of active contracts carrying the block) + dues. */
  dashRoster(tenantId: string, blockId: string, isLive: boolean) {
    return this.call('gs_dash_roster', { p_tenant: tenantId, p_block: blockId, p_is_live: isLive });
  }

  /** Member drill-down: attendance history + billing/dues. */
  dashMember(tenantId: string, memberId: string) {
    return this.call('gs_dash_member', { p_tenant: tenantId, p_member: memberId });
  }

  /** Mint/return the static check-in (QR) token for a block + environment. */
  ensureBlockToken(tenantId: string, blockId: string, isLive: boolean) {
    return this.call('gs_ensure_block_token', { p_tenant: tenantId, p_block: blockId, p_is_live: isLive });
  }

  /** One occurrence's roster with present/absent + present count. */
  occurrenceAttendance(tenantId: string, occurrenceId: string) {
    return this.call('gs_occurrence_attendance', { p_tenant: tenantId, p_occurrence: occurrenceId });
  }

  /** Chair marks a member present/absent for an occurrence. */
  markAttendance(tenantId: string, occurrenceId: string, memberId: string, present: boolean, memberName?: string | null, changedBy?: string | null, changedByName?: string | null) {
    return this.call('gs_mark_attendance', {
      p_tenant: tenantId, p_occurrence: occurrenceId, p_member: memberId,
      p_present: present, p_member_name: memberName ?? null,
      p_changed_by: changedBy ?? null, p_changed_by_name: changedByName ?? null,
    });
  }

  /** Member profile within a block: attendance grid + dues + billing. */
  memberBlock(tenantId: string, blockId: string, memberId: string, isLive: boolean) {
    return this.call('gs_member_block', { p_tenant: tenantId, p_block: blockId, p_member: memberId, p_is_live: isLive });
  }
}

export const groupSessionsDashboardService = new GroupSessionsDashboardService();
export default groupSessionsDashboardService;
