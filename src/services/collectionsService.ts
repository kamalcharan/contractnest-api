// ============================================================================
// Collections Service — Ops on JTD, Collections lane
// ============================================================================
// Thin pass-through to the ladder tools and the cockpit reader (migration
// jtd-nucleus/009). Every tool takes an explicit actor: today the signed-in
// user; VaNi will call the same RPCs with its own well-known id. Nothing here
// decides anything — validation, guards and bookkeeping live in the RPCs and
// come back as { success:false, reason } which the controller maps to HTTP.
// Spec: specs/OPS-JTD-TOOLS-SPEC.md §4, §8.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Actor {
  type: 'user' | 'vani' | 'system';
  id: string;
  name: string | null;
}

/** Mirrors the reader's p_filters contract. Every key optional; the RPC defaults and clamps. */
export interface BoardFilters {
  horizon_days?: number;
  from?: string;          // YYYY-MM-DD — with `to`, a custom window replacing the horizon
  to?: string;
  bands?: [number, number];
  kinds?: string[];
  /** 'collections' | 'services' — absent = all lanes */
  lanes?: string[];
  /** services only: 'confirmed' | 'proposed' | 'none' */
  slot?: 'confirmed' | 'proposed' | 'none';
  channel?: 'email' | 'whatsapp' | 'call';
  age?: '0-7' | '8-30' | '31-90' | '90+';
  cycle?: string;
  who?: 'team' | 'mine' | 'unassigned';
  q?: string;
  limit?: number;
  limits?: Record<string, number>;
}

/** jtd_plan's p_filters: a window (≤120 days, defaults today + 13), lanes, Who, search. */
export interface PlanFilters {
  from?: string;   // YYYY-MM-DD
  to?: string;
  lanes?: string[];
  who?: 'team' | 'mine' | 'unassigned';
  q?: string;
}

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: any };
}

class CollectionsService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  /** One shape for every RPC: transport errors → RPC_ERROR; {success:false, reason} → the reason as the code. */
  private async call(fn: string, params: Record<string, unknown>): Promise<ToolResult> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    }
    try {
      const { data, error } = await supabase.rpc(fn, params);
      if (error) {
        console.error(`[CollectionsService] ${fn} failed:`, error.message);
        return { success: false, error: { code: 'RPC_ERROR', message: error.message } };
      }
      if (!data?.success) {
        return {
          success: false,
          error: { code: data?.reason || 'TOOL_REFUSED', message: data?.message || `The tool refused: ${data?.reason || 'unknown'}`, details: data }
        };
      }
      return { success: true, data };
    } catch (e: any) {
      console.error(`[CollectionsService] ${fn} error:`, e.message);
      return { success: false, error: { code: 'INTERNAL', message: e.message } };
    }
  }

  worklist(tenantId: string, isLive: boolean, horizonDays: number) {
    return this.call('jtd_collections_worklist', {
      p_tenant: tenantId, p_is_live: isLive, p_horizon_days: horizonDays
    });
  }

  /**
   * The board (migration jtd-nucleus/010): one row per open payment job with
   * kind + anchor + bucket, filters and per-bucket paging applied server-side.
   * `userId` is only used by the who=mine filter.
   */
  board(tenantId: string, isLive: boolean, filters: BoardFilters, userId: string | null, perspective: 'revenue' | 'expense' = 'revenue') {
    // jtd_ops_board (migration 014) serves BOTH lanes — collections + services — in one row model.
    // jtd_ops_board_expense (migration 021) is the buyer's board — same shape, lanes payables · services · acceptance.
    return this.call(perspective === 'expense' ? 'jtd_ops_board_expense' : 'jtd_ops_board', {
      p_tenant: tenantId, p_is_live: isLive, p_filters: filters, p_user: userId
    });
  }

  /** Expense side (migration 021): the buyer answers a proposed slot from inside the app — same tool as /slot/:token. */
  respondSlot(tenantId: string, appointmentId: string, action: 'accept' | 'propose' | 'decline', proposedAt: string | null, note: string | null) {
    return this.call('jtd_buyer_respond_slot', {
      p_tenant: tenantId, p_appointment_id: appointmentId, p_action: action, p_proposed_at: proposedAt, p_note: note
    });
  }

  // ── Services lane: visit tools (migration 014). The event id IS the row/job id. ──
  assignVisit(tenantId: string, eventId: string, assignTo: string, actor: Actor, note: string | null) {
    return this.call('jtd_assign_visit', {
      p_tenant: tenantId, p_event_id: eventId, p_assign_to: assignTo,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name, p_note: note
    });
  }

  scheduleVisit(tenantId: string, eventId: string, scheduledAt: string, confirmed: boolean, actor: Actor, note: string | null) {
    return this.call('jtd_schedule_visit', {
      p_tenant: tenantId, p_event_id: eventId, p_scheduled_at: scheduledAt, p_confirmed: confirmed,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name, p_note: note
    });
  }

  confirmVisitSlot(tenantId: string, eventId: string, actor: Actor, note: string | null) {
    return this.call('jtd_confirm_visit_slot', {
      p_tenant: tenantId, p_event_id: eventId,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name, p_note: note
    });
  }

  startVisit(tenantId: string, eventId: string, actor: Actor, note: string | null) {
    return this.call('jtd_start_visit', {
      p_tenant: tenantId, p_event_id: eventId,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name, p_note: note
    });
  }

  /**
   * Ask the customer to confirm the slot (migration 015). `share` sends nothing
   * and returns the message + link (+ phone/email) for wa.me / copy; email and
   * whatsapp queue a communication row and need a registered provider template.
   * `linkBase` is the public app origin the /slot/:token link is built on.
   */
  askVisitSlot(tenantId: string, eventId: string, channel: 'share' | 'email' | 'whatsapp', actor: Actor, note: string | null, linkBase: string) {
    return this.call('jtd_ask_visit_slot', {
      p_tenant: tenantId, p_event_id: eventId, p_channel: channel,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name, p_note: note, p_link_base: linkBase
    });
  }

  completeVisit(tenantId: string, eventId: string, actor: Actor, notes: string | null) {
    return this.call('jtd_complete_visit', {
      p_tenant: tenantId, p_event_id: eventId,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name, p_notes: notes
    });
  }

  /**
   * The Commitments Register's Activity tab (migration jtd-nucleus/016): the
   * tenant-wide activity timeline — appointments · follow-ups · calls ·
   * reminders · visits · payments — with from/to, groups, who, q, paging.
   */
  activity(tenantId: string, isLive: boolean, filters: Record<string, unknown>) {
    return this.call('jtd_activity', { p_tenant: tenantId, p_is_live: isLive, p_filters: filters });
  }

  /**
   * The Commitments Register's Follow-ups lane (migration jtd-nucleus/017):
   * every call task, open or closed — due date, assignee, kind (follow_up |
   * escalation), the payment it is about, how it closed. Filters from/to,
   * who, kind, state, q, paging.
   */
  tasks(tenantId: string, isLive: boolean, filters: Record<string, unknown>) {
    return this.call('jtd_tasks', { p_tenant: tenantId, p_is_live: isLive, p_filters: filters });
  }

  /**
   * One activity timeline for a contract (migration jtd-nucleus/012): service
   * audit + billing-event audit + every JTD communication/task/declaration.
   */
  contractActivity(tenantId: string, isLive: boolean, contractId: string,
                   sources: string[] | null, limit: number, offset: number) {
    return this.call('jtd_contract_activity', {
      p_tenant: tenantId, p_contract_id: contractId, p_is_live: isLive,
      p_sources: sources, p_limit: limit, p_offset: offset
    });
  }

  // ── Plan view (migration jtd-nucleus/023) ─────────────────────────────────
  /**
   * The Commitments Register's Plan tab: every day of the window with its board
   * cards lined up (jtd_ops_board regrouped by IST anchor day), per-day counts,
   * carried (overdue) and parked rows, and whether VaNi is on for the tenant.
   */
  plan(tenantId: string, isLive: boolean, filters: PlanFilters, userId: string | null) {
    return this.call('jtd_plan', { p_tenant: tenantId, p_is_live: isLive, p_filters: filters, p_user: userId });
  }

  /** "Plan this day" — proposes a slot for every unslotted service on the day. VaNi leverage: the RPC refuses vani_off. */
  planDay(tenantId: string, day: string, actor: Actor, isLive: boolean) {
    return this.call('jtd_plan_day', {
      p_tenant: tenantId, p_day: day,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name, p_is_live: isLive
    });
  }

  /** "Ask everyone" — asks every proposed-not-asked slot of the day on email or WhatsApp. VaNi leverage: refuses vani_off. */
  askDay(tenantId: string, day: string, channel: 'email' | 'whatsapp', actor: Actor, isLive: boolean, linkBase: string) {
    return this.call('jtd_ask_day', {
      p_tenant: tenantId, p_day: day, p_channel: channel,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name, p_is_live: isLive, p_link_base: linkBase
    });
  }

  nudge(tenantId: string, jobId: string, channel: 'email' | 'whatsapp', actor: Actor,
        note: string | null, paymentLink: string | null, upiId: string | null) {
    return this.call('jtd_nudge_payment', {
      p_tenant: tenantId, p_job_id: jobId, p_channel: channel,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name,
      p_note: note, p_payment_link: paymentLink, p_upi_id: upiId
    });
  }

  logCall(tenantId: string, jobId: string, actor: Actor, calledAt: string | null, outcome: string,
          notes: string | null, promiseDate: string | null) {
    return this.call('jtd_log_payment_call', {
      p_tenant: tenantId, p_job_id: jobId,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name,
      p_called_at: calledAt, p_outcome: outcome, p_notes: notes, p_promise_date: promiseDate
    });
  }

  /** Assign a call; with `dueAt` it is a dated task ("Follow up" when assigned to oneself). */
  escalate(tenantId: string, jobId: string, assignTo: string, actor: Actor, note: string | null, dueAt: string | null = null) {
    return this.call('jtd_escalate_payment_call', {
      p_tenant: tenantId, p_job_id: jobId, p_assign_to: assignTo,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name, p_note: note, p_due_at: dueAt
    });
  }

  pause(tenantId: string, jobId: string, reason: string, actor: Actor, until: string | null, note: string | null) {
    return this.call('jtd_pause_dunning', {
      p_tenant: tenantId, p_job_id: jobId, p_reason: reason,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name,
      p_until: until, p_note: note
    });
  }

  resume(tenantId: string, jobId: string, actor: Actor, note: string | null) {
    return this.call('jtd_resume_dunning', {
      p_tenant: tenantId, p_job_id: jobId,
      p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name, p_note: note
    });
  }
}

export const collectionsService = new CollectionsService();
export default collectionsService;
