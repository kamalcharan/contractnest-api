// ============================================================================
// Collections Controller — Ops on JTD, Collections lane
// ============================================================================
// Derives the ACTOR from the authenticated user (VaNi will use its service
// identity later), the environment from x-environment, validates the body
// shape, and maps the RPC's machine-readable refusal `reason` to an HTTP
// status + error code the UI can turn into copy. No business rules here.
// Spec: specs/OPS-JTD-TOOLS-SPEC.md §4, §8.
// ============================================================================

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError, internalError, ERROR_CODES } from '../utils/apiResponseHelpers';
import collectionsService, { Actor, BoardFilters, PlanFilters } from '../services/collectionsService';
import { invoiceService } from '../services/invoiceService';

const CHANNELS = ['email', 'whatsapp'] as const;
const OUTCOMES = ['reached', 'no_answer', 'promised', 'disputed', 'other'] as const;
const PAUSE_REASONS = ['promise', 'dispute', 'manual'] as const;

// Refusals that are the caller's doing (400/404/409) vs. everything else (500).
const REFUSAL_STATUS: Record<string, number> = {
  job_not_found: 404,
  contract_not_found: 404,
  contract_required: 400,
  assignee_not_in_tenant: 404,
  job_not_open: 409,
  already_paid: 409,
  nothing_owed: 409,
  paused: 409,
  declaration_pending: 409,
  already_sent_just_now: 409,
  duplicate_rung: 409,
  call_already_open: 409,
  no_recipient: 422,
  no_address: 422,
  no_template: 422,
  incomplete: 422,
  unsupported_channel: 400,
  invalid_outcome: 400,
  promise_date_required: 400,
  due_in_past: 400,
  // services lane
  visit_not_found: 404,
  visit_closed: 409,
  visit_in_progress: 409,
  visit_already_started: 409,
  // ask the customer (migration 015) — no_address / no_template are shared with the nudge tool above
  no_customer: 404,
  group_contract: 409,
  bad_channel: 400,
  already_assigned: 409,
  already_confirmed: 409,
  no_slot_to_confirm: 409,
  scheduled_at_required: 400,
  slot_in_past: 400,
  downstream_refused: 409,
  invalid_reason: 400,
  actor_required: 401,
  // plan view (migration 023)
  vani_off: 403,
  day_required: 400,
  day_passed: 400,
};

class CollectionsController {
  private tenantId(req: AuthRequest): string {
    return (req.headers['x-tenant-id'] as string) || '';
  }

  private isLive(req: AuthRequest): boolean {
    return ((req.headers['x-environment'] as string) || 'live') === 'live';
  }

  /** The signed-in human is the actor. Name from the profile when present, else email. */
  private actor(req: AuthRequest): Actor | null {
    const u = req.user;
    if (!u?.id) return null;
    const name =
      [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
      u.user_metadata?.full_name ||
      u.email ||
      null;
    return { type: 'user', id: u.id, name };
  }

  private refuse(res: Response, error: { code: string; message: string; details?: any }) {
    const status = REFUSAL_STATUS[error.code] ?? (error.code === 'RPC_ERROR' || error.code === 'INTERNAL' || error.code === 'CONFIG' ? 500 : 409);
    const code =
      status === 404 ? ERROR_CODES.NOT_FOUND :
      status === 400 ? ERROR_CODES.VALIDATION_ERROR :
      status === 401 ? ERROR_CODES.UNAUTHORIZED :
      status === 500 ? ERROR_CODES.INTERNAL_ERROR :
      ERROR_CODES.CONFLICT;
    // The RPC's reason travels as the code so the UI can pick its own copy;
    // the human message is the fallback.
    res.status(status).json({
      success: false,
      error: { code: error.code, category: code, message: error.message, details: error.details ?? null },
      metadata: { timestamp: new Date().toISOString() }
    });
  }

  private str(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }

  /** GET /worklist?horizon=30 */
  worklist = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const horizon = Math.min(Math.max(parseInt(String(req.query.horizon ?? '30'), 10) || 30, 1), 120);
      const result = await collectionsService.worklist(this.tenantId(req), this.isLive(req), horizon);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] worklist error:', error);
      internalError(res, 'Failed to load the collections worklist');
    }
  };

  /**
   * GET /board?horizon=30&from=&to=&bands=3,14&kinds=a,b&channel=&age=&cycle=&who=&q=&limit=20&limits=overdue:40,b2:60
   * Everything is optional. Values are shaped here (types, enums, clamps) and
   * defaulted again inside the RPC, so a bad query can never raise.
   */
  board = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const qs = req.query as Record<string, unknown>;
      const int = (v: unknown, lo: number, hi: number): number | undefined => {
        const n = parseInt(String(v ?? ''), 10);
        return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : undefined;
      };
      const isoDate = (v: unknown): string | undefined => {
        const s = this.str(v);
        return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined;
      };
      const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => {
        const s = this.str(v);
        return s && (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
      };
      const list = (v: unknown): string[] | undefined => {
        const s = this.str(v);
        if (!s) return undefined;
        const items = s.split(',').map((x) => x.trim()).filter((x) => /^[a-z_]{1,40}$/.test(x));
        return items.length ? items : undefined;
      };

      const filters: BoardFilters = {};
      const horizon = int(qs.horizon, 1, 120);
      if (horizon !== undefined) filters.horizon_days = horizon;
      const from = isoDate(qs.from);
      const to = isoDate(qs.to);
      if (from) filters.from = from;
      if (to) filters.to = to;
      const bands = (this.str(qs.bands) || '').split(',').map((x) => parseInt(x.trim(), 10));
      if (bands.length === 2 && bands.every((n) => Number.isFinite(n) && n > 0) && bands[1] > bands[0]) {
        filters.bands = [bands[0], bands[1]];
      }
      const kinds = list(qs.kinds);
      if (kinds) filters.kinds = kinds;
      const lanes = list(qs.lanes)?.filter((l) => l === 'collections' || l === 'services' || l === 'payables' || l === 'acceptance');
      if (lanes?.length) filters.lanes = lanes;
      const slot = oneOf(qs.slot, ['confirmed', 'proposed', 'none'] as const);
      if (slot) filters.slot = slot;
      const channel = oneOf(qs.channel, ['email', 'whatsapp', 'call'] as const);
      if (channel) filters.channel = channel;
      const age = oneOf(qs.age, ['0-7', '8-30', '31-90', '90+'] as const);
      if (age) filters.age = age;
      const cycle = this.str(qs.cycle);
      if (cycle && cycle.length <= 60) filters.cycle = cycle;
      const who = oneOf(qs.who, ['team', 'mine', 'unassigned'] as const);
      if (who) filters.who = who;
      const q = this.str(qs.q);
      if (q) filters.q = q.slice(0, 80);
      const limit = int(qs.limit, 1, 200);
      if (limit !== undefined) filters.limit = limit;
      // limits=overdue:40,b2:60 → { overdue: 40, b2: 60 }
      const limitsRaw = this.str(qs.limits);
      if (limitsRaw) {
        const limits: Record<string, number> = {};
        for (const pair of limitsRaw.split(',')) {
          const [k, v] = pair.split(':').map((x) => x.trim());
          const n = int(v, 1, 500);
          if (k && /^[a-z0-9_]{1,16}$/.test(k) && n !== undefined) limits[k] = n;
        }
        if (Object.keys(limits).length) filters.limits = limits;
      }

      // perspective=expense → the buyer's board (migration 021); anything else is the revenue board.
      const perspective = oneOf(qs.perspective, ['revenue', 'expense'] as const) || 'revenue';
      const result = await collectionsService.board(this.tenantId(req), this.isLive(req), filters, req.user?.id || null, perspective);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] board error:', error);
      internalError(res, 'Failed to load the collections board');
    }
  };

  /** GET /contracts/:contractId/activity?sources=service,billing,collections&limit=50&offset=0 */
  /**
   * GET /activity?from&to&groups&who&q&contract_id&limit&offset
   * The Commitments Register's Activity tab (migration 016). Dates are IST
   * calendar days; the RPC defaults the window to the last 30 days.
   */
  activity = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const qs = req.query as Record<string, unknown>;
      const isoDate = (v: unknown) => { const s = this.str(v); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined; };
      const uuid = (v: unknown) => { const s = this.str(v); return s && /^[0-9a-f-]{36}$/i.test(s) ? s : undefined; };
      const allowedGroups = ['appointments', 'followups', 'calls', 'reminders', 'visits', 'payments', 'other'];
      const groups = (this.str(qs.groups) || '').split(',').map((g) => g.trim()).filter((g) => allowedGroups.includes(g));
      const filters: Record<string, unknown> = {};
      const from = isoDate(qs.from); const to = isoDate(qs.to);
      if (from) filters.from = from;
      if (to) filters.to = to;
      if (groups.length) filters.groups = groups;
      const who = uuid(qs.who); if (who) filters.who = who;
      const contractId = uuid(qs.contract_id); if (contractId) filters.contract_id = contractId;
      const q = this.str(qs.q); if (q) filters.q = q.slice(0, 80);
      filters.limit = Math.min(Math.max(parseInt(String(qs.limit ?? '50'), 10) || 50, 1), 500);
      filters.offset = Math.max(parseInt(String(qs.offset ?? '0'), 10) || 0, 0);
      const result = await collectionsService.activity(this.tenantId(req), this.isLive(req), filters);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] activity error:', error);
      internalError(res, 'Failed to load the activity');
    }
  };

  /**
   * GET /tasks?from&to&who&kind&state&q&limit&offset
   * The Commitments Register's Follow-ups lane (migration 017): call tasks,
   * open or closed. Dates are IST calendar days on the task's due date.
   */
  tasks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const qs = req.query as Record<string, unknown>;
      const isoDate = (v: unknown) => { const s = this.str(v); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined; };
      const uuid = (v: unknown) => { const s = this.str(v); return s && /^[0-9a-f-]{36}$/i.test(s) ? s : undefined; };
      const filters: Record<string, unknown> = {};
      const from = isoDate(qs.from); const to = isoDate(qs.to);
      if (from) filters.from = from;
      if (to) filters.to = to;
      const who = uuid(qs.who); if (who) filters.who = who;
      const kind = this.str(qs.kind); if (kind === 'follow_up' || kind === 'escalation') filters.kind = kind;
      const state = this.str(qs.state); if (state === 'open' || state === 'closed' || state === 'all') filters.state = state;
      const q = this.str(qs.q); if (q) filters.q = q.slice(0, 80);
      filters.limit = Math.min(Math.max(parseInt(String(qs.limit ?? '100'), 10) || 100, 1), 500);
      filters.offset = Math.max(parseInt(String(qs.offset ?? '0'), 10) || 0, 0);
      const result = await collectionsService.tasks(this.tenantId(req), this.isLive(req), filters);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] tasks error:', error);
      internalError(res, 'Failed to load the follow-ups');
    }
  };

  contractActivity = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const contractId = String(req.params.contractId || '');
      if (!/^[0-9a-f-]{36}$/i.test(contractId)) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'contractId must be a uuid', 400); return; }
      const allowed = ['service', 'billing', 'collections'];
      const sources = (this.str(req.query.sources) || '').split(',').map((s) => s.trim()).filter((s) => allowed.includes(s));
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 500);
      const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
      const result = await collectionsService.contractActivity(
        this.tenantId(req), this.isLive(req), contractId, sources.length ? sources : null, limit, offset
      );
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] contractActivity error:', error);
      internalError(res, 'Failed to load the contract activity');
    }
  };

  /**
   * POST /slots/:appointmentId/respond  {action: accept|propose|decline, proposed_at?, note?}
   * Expense side (migration 021): the buyer answers the seller's proposed slot
   * in-app. proposed_at: ISO, or a local date-time read as IST.
   */
  respondSlot = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to answer a slot', 401); return; }
      const id = String(req.params.appointmentId || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'appointmentId is required', 400); return; }
      const action = this.str(req.body?.action);
      if (action !== 'accept' && action !== 'propose' && action !== 'decline') { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'action must be accept, propose or decline', 400); return; }
      let when = this.str(req.body?.proposed_at);
      if (action === 'propose') {
        if (!when) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'proposed_at is required to propose a time', 400); return; }
        if (/^\d{4}-\d{2}-\d{2}$/.test(when)) when = `${when}T10:00:00+05:30`;
        else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(when)) when = `${when}${when.length === 16 ? ':00' : ''}+05:30`;
        if (Number.isNaN(Date.parse(when))) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'proposed_at must be a date or date-time', 400); return; }
      }
      const result = await collectionsService.respondSlot(this.tenantId(req), id, action, action === 'propose' ? new Date(when!).toISOString() : null, this.str(req.body?.note));
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] respondSlot error:', error);
      internalError(res, 'Failed to answer the slot');
    }
  };

  // ── Services lane: visit tools. :eventId is the service event (= the board row id). ──
  private eventId(req: AuthRequest): string | null {
    const id = String(req.params.eventId || '');
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  }

  /** :day as an ISO calendar day (YYYY-MM-DD), else null. */
  private day(req: AuthRequest): string | null {
    const d = String(req.params.day || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null;
  }

  /** The public app origin the /slot/:token link is built on (same rule as askVisitSlot). */
  private linkBase(req: AuthRequest): string {
    const origin = typeof req.headers.origin === 'string' && /^https?:\/\//.test(req.headers.origin) ? req.headers.origin : null;
    return process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || origin || 'https://app.contractnest.com';
  }

  // ── Plan view (migration jtd-nucleus/023) ─────────────────────────────────
  /** GET /plan?from=&to=&lanes=&who=&q=  — every day of the window with its cards lined up */
  plan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const qs = req.query as Record<string, unknown>;
      const isoDate = (v: unknown): string | undefined => {
        const s = this.str(v);
        return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined;
      };
      const filters: PlanFilters = {};
      const from = isoDate(qs.from); if (from) filters.from = from;
      const to = isoDate(qs.to); if (to) filters.to = to;
      const lanes = (this.str(qs.lanes) || '').split(',').map((x) => x.trim()).filter((l) => l === 'collections' || l === 'services');
      if (lanes.length) filters.lanes = lanes;
      const who = this.str(qs.who);
      if (who === 'team' || who === 'mine' || who === 'unassigned') filters.who = who;
      const q = this.str(qs.q); if (q) filters.q = q.slice(0, 80);
      const result = await collectionsService.plan(this.tenantId(req), this.isLive(req), filters, req.user?.id || null);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] plan error:', error);
      internalError(res, 'Failed to load the plan');
    }
  };

  /** POST /plan/:day/place — "Plan this day": propose a slot for every unslotted service on the day (VaNi leverage) */
  planDay = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to plan the day', 401); return; }
      const day = this.day(req);
      if (!day) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'day must be YYYY-MM-DD', 400); return; }
      const result = await collectionsService.planDay(this.tenantId(req), day, actor, this.isLive(req));
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] planDay error:', error);
      internalError(res, 'Failed to plan the day');
    }
  };

  /** POST /plan/:day/ask {channel: email|whatsapp} — "Ask everyone" on the day (VaNi leverage) */
  askDay = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to ask the customers', 401); return; }
      const day = this.day(req);
      if (!day) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'day must be YYYY-MM-DD', 400); return; }
      const channel = this.str(req.body?.channel);
      if (channel !== 'email' && channel !== 'whatsapp') { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'channel must be email or whatsapp', 400); return; }
      const result = await collectionsService.askDay(this.tenantId(req), day, channel, actor, this.isLive(req), this.linkBase(req));
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] askDay error:', error);
      internalError(res, 'Failed to ask the customers');
    }
  };

  /** POST /visits/:eventId/assign  {assign_to, note} */
  assignVisit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to assign a visit', 401); return; }
      const eventId = this.eventId(req);
      const assignTo = this.str(req.body?.assign_to);
      if (!eventId || !assignTo) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'eventId and assign_to are required', 400); return; }
      const result = await collectionsService.assignVisit(this.tenantId(req), eventId, assignTo, actor, this.str(req.body?.note));
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] assignVisit error:', error);
      internalError(res, 'Failed to assign the visit');
    }
  };

  /** POST /visits/:eventId/schedule  {scheduled_at (ISO or YYYY-MM-DD[THH:mm]), confirmed, note} */
  scheduleVisit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to schedule a visit', 401); return; }
      const eventId = this.eventId(req);
      let when = this.str(req.body?.scheduled_at);
      if (!eventId || !when) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'eventId and scheduled_at are required', 400); return; }
      // A bare date means 10:00 IST; a local date-time without zone is read as IST.
      if (/^\d{4}-\d{2}-\d{2}$/.test(when)) when = `${when}T10:00:00+05:30`;
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(when)) when = `${when}${when.length === 16 ? ':00' : ''}+05:30`;
      if (Number.isNaN(Date.parse(when))) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'scheduled_at must be a date or date-time', 400); return; }
      const confirmed = req.body?.confirmed === true || String(req.body?.confirmed) === 'true';
      const result = await collectionsService.scheduleVisit(this.tenantId(req), eventId, new Date(when).toISOString(), confirmed, actor, this.str(req.body?.note));
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] scheduleVisit error:', error);
      internalError(res, 'Failed to schedule the visit');
    }
  };

  /**
   * POST /visits/:eventId/ask  {channel: share|email|whatsapp, note}
   * Ask the customer to confirm the slot. `share` returns the message + the
   * /slot/:token link (+ phone/email) for wa.me or copy and sends nothing;
   * email/whatsapp queue a send through the JTD worker (registered template
   * required — the RPC refuses no_template otherwise).
   */
  askVisitSlot = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to ask the customer', 401); return; }
      const eventId = this.eventId(req);
      if (!eventId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'eventId is required', 400); return; }
      const channel = this.str(req.body?.channel) || 'share';
      if (!['share', 'email', 'whatsapp'].includes(channel)) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'channel must be share, email or whatsapp', 400); return; }
      // The public link is built on the app origin: configured, else the caller's origin (the app itself), else production.
      const origin = typeof req.headers.origin === 'string' && /^https?:\/\//.test(req.headers.origin) ? req.headers.origin : null;
      const linkBase = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || origin || 'https://app.contractnest.com';
      const result = await collectionsService.askVisitSlot(this.tenantId(req), eventId, channel as 'share' | 'email' | 'whatsapp', actor, this.str(req.body?.note), linkBase);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] askVisitSlot error:', error);
      internalError(res, 'Failed to ask the customer');
    }
  };

  /** POST /visits/:eventId/confirm-slot  {note} */
  confirmVisitSlot = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to confirm a slot', 401); return; }
      const eventId = this.eventId(req);
      if (!eventId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'eventId is required', 400); return; }
      const result = await collectionsService.confirmVisitSlot(this.tenantId(req), eventId, actor, this.str(req.body?.note));
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] confirmVisitSlot error:', error);
      internalError(res, 'Failed to confirm the slot');
    }
  };

  /** POST /visits/:eventId/start  {note} */
  startVisit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to start a visit', 401); return; }
      const eventId = this.eventId(req);
      if (!eventId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'eventId is required', 400); return; }
      const result = await collectionsService.startVisit(this.tenantId(req), eventId, actor, this.str(req.body?.note));
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] startVisit error:', error);
      internalError(res, 'Failed to start the visit');
    }
  };

  /** POST /visits/:eventId/complete  {notes} */
  completeVisit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to complete a visit', 401); return; }
      const eventId = this.eventId(req);
      if (!eventId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'eventId is required', 400); return; }
      const result = await collectionsService.completeVisit(this.tenantId(req), eventId, actor, this.str(req.body?.notes));
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] completeVisit error:', error);
      internalError(res, 'Failed to complete the visit');
    }
  };

  /** POST /payments/:jobId/nudge  {channel, note} */
  nudge = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to send reminders', 401); return; }
      const tenantId = this.tenantId(req);
      const jobId = String(req.params.jobId || '');
      const channel = String(req.body?.channel || '');
      if (!jobId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'jobId is required', 400); return; }
      if (!(CHANNELS as readonly string[]).includes(channel)) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'channel must be email or whatsapp', 400); return;
      }

      // Pay line: the tenant's offline UPI when configured (same source the
      // invoice send uses). Gateway link minting is deliberately not done for
      // a reminder — a failed lookup must never block the nudge.
      let upiId: string | null = null;
      let paymentLink: string | null = null;
      try {
        const cfg = await invoiceService.getTenantPaymentConfig({ tenantId, isLive: this.isLive(req) });
        if (cfg?.data?.configured && cfg.data.upi_id) {
          upiId = String(cfg.data.upi_id);
          paymentLink = `upi://pay?pa=${encodeURIComponent(upiId)}&cu=INR`;
        }
      } catch (e: any) {
        console.warn('[CollectionsController] UPI config lookup failed, sending without a pay line:', e?.message);
      }

      const result = await collectionsService.nudge(
        tenantId, jobId, channel as 'email' | 'whatsapp', actor, this.str(req.body?.note), paymentLink, upiId
      );
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] nudge error:', error);
      internalError(res, 'Failed to send the reminder');
    }
  };

  /** POST /payments/:jobId/call  {called_at, outcome, notes, promise_date} */
  logCall = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to log a call', 401); return; }
      const jobId = String(req.params.jobId || '');
      const outcome = String(req.body?.outcome || '');
      if (!jobId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'jobId is required', 400); return; }
      if (!(OUTCOMES as readonly string[]).includes(outcome)) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, `outcome must be one of ${OUTCOMES.join(', ')}`, 400); return;
      }
      const calledAt = this.str(req.body?.called_at);
      if (calledAt && Number.isNaN(Date.parse(calledAt))) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'called_at must be a date-time', 400); return;
      }
      const promiseDate = this.str(req.body?.promise_date);
      if (promiseDate && !/^\d{4}-\d{2}-\d{2}$/.test(promiseDate)) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'promise_date must be YYYY-MM-DD', 400); return;
      }

      const result = await collectionsService.logCall(
        this.tenantId(req), jobId, actor, calledAt, outcome, this.str(req.body?.notes), promiseDate
      );
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] logCall error:', error);
      internalError(res, 'Failed to log the call');
    }
  };

  /** POST /payments/:jobId/escalate  {assign_to, note, due_at}  — due_at: YYYY-MM-DD (→ 10:00 IST) or an ISO date-time */
  escalate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to assign a call', 401); return; }
      const jobId = String(req.params.jobId || '');
      const assignTo = this.str(req.body?.assign_to);
      if (!jobId || !assignTo) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'jobId and assign_to are required', 400); return; }
      let dueAt = this.str(req.body?.due_at);
      if (dueAt) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) dueAt = `${dueAt}T10:00:00+05:30`;
        if (Number.isNaN(Date.parse(dueAt))) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'due_at must be a date or date-time', 400); return; }
        dueAt = new Date(dueAt).toISOString();
      }

      const result = await collectionsService.escalate(this.tenantId(req), jobId, assignTo, actor, this.str(req.body?.note), dueAt);
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] escalate error:', error);
      internalError(res, 'Failed to assign the call');
    }
  };

  /** POST /payments/:jobId/pause  {reason, until, note} */
  pause = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to pause reminders', 401); return; }
      const jobId = String(req.params.jobId || '');
      const reason = String(req.body?.reason || '');
      if (!jobId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'jobId is required', 400); return; }
      if (!(PAUSE_REASONS as readonly string[]).includes(reason)) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, `reason must be one of ${PAUSE_REASONS.join(', ')}`, 400); return;
      }
      const until = this.str(req.body?.until);
      if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'until must be YYYY-MM-DD', 400); return;
      }

      const result = await collectionsService.pause(this.tenantId(req), jobId, reason, actor, until, this.str(req.body?.note));
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] pause error:', error);
      internalError(res, 'Failed to pause reminders');
    }
  };

  /** POST /payments/:jobId/resume  {note} */
  resume = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const actor = this.actor(req);
      if (!actor) { sendError(res, ERROR_CODES.UNAUTHORIZED, 'Sign in to resume reminders', 401); return; }
      const jobId = String(req.params.jobId || '');
      if (!jobId) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'jobId is required', 400); return; }

      const result = await collectionsService.resume(this.tenantId(req), jobId, actor, this.str(req.body?.note));
      if (!result.success) { this.refuse(res, result.error!); return; }
      sendSuccess(res, result.data);
    } catch (error) {
      console.error('[CollectionsController] resume error:', error);
      internalError(res, 'Failed to resume reminders');
    }
  };
}

export default CollectionsController;
