// ============================================================================
// Collections routes — Ops on JTD, Collections lane
// Mounted at /api/jtd/collections (see src/index.ts). Same middleware chain
// as the VaNi routes: authenticate → ensureTenant → rate limit → controller.
//
//   GET  /worklist?horizon=30            jtd_collections_worklist (legacy shape)
//   GET  /board?horizon=&from=&to=&bands=&kinds=&channel=&age=&cycle=&who=&q=&limit=&limits=
//                                        jtd_collections_board — the cockpit reads THIS
//   GET  /contracts/:contractId/activity?sources=&limit=&offset=
//                                        jtd_contract_activity — the Audit tab + the card's History drawer
//   POST /payments/:jobId/nudge          jtd_nudge_payment      {channel, note}
//   POST /payments/:jobId/call           jtd_log_payment_call   {called_at, outcome, notes, promise_date}
//   POST /payments/:jobId/escalate       jtd_escalate_payment_call {assign_to, note, due_at}  (self + due_at = Follow up)
//   POST /payments/:jobId/pause          jtd_pause_dunning      {reason, until, note}
//   POST /payments/:jobId/resume         jtd_resume_dunning     {note}
//   GET  /board?lanes=collections,services&slot=…  jtd_ops_board (both lanes, migration 014)
//   POST /visits/:eventId/assign         jtd_assign_visit       {assign_to, note}
//   POST /visits/:eventId/schedule       jtd_schedule_visit     {scheduled_at, confirmed, note}
//   POST /visits/:eventId/confirm-slot   jtd_confirm_visit_slot {note}
//   POST /visits/:eventId/start          jtd_start_visit        {note}
//   POST /visits/:eventId/complete       jtd_complete_visit     {notes}
//   GET  /plan                           jtd_plan               the register's Plan tab (023)
//   POST /plan/:day/place                jtd_plan_day           "Plan this day" (VaNi leverage)
//   POST /plan/:day/ask                  jtd_ask_day            "Ask everyone"  (VaNi leverage)
// ============================================================================

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import CollectionsController from '../controllers/collectionsController';

const router = express.Router();
const controller = new CollectionsController();

router.use(authenticate);

router.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'x-tenant-id header is required' },
      metadata: { timestamp: new Date().toISOString() }
    });
    return;
  }
  next();
});

const readLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } }
});
// Tools send messages / create tasks — generous for a busy chair, but bounded.
const toolLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many actions, please slow down' } }
});

router.get('/worklist', readLimit, controller.worklist);
router.get('/board', readLimit, controller.board);
router.get('/contracts/:contractId/activity', readLimit, controller.contractActivity);
// Commitments Register · Activity tab (migration 016): tenant-wide, ?from&to&groups&who&q&contract_id&limit&offset
router.get('/activity', readLimit, controller.activity);
// Commitments Register · Follow-ups lane (migration 017): call tasks open or closed, ?from&to&who&kind&state&q&limit&offset
router.get('/tasks', readLimit, controller.tasks);
router.post('/payments/:jobId/nudge', toolLimit, controller.nudge);
router.post('/payments/:jobId/call', toolLimit, controller.logCall);
router.post('/payments/:jobId/escalate', toolLimit, controller.escalate);
router.post('/payments/:jobId/pause', toolLimit, controller.pause);
router.post('/payments/:jobId/resume', toolLimit, controller.resume);
// Services lane (migration 014) — :eventId is the service event = the board row id
router.post('/visits/:eventId/assign', toolLimit, controller.assignVisit);
router.post('/visits/:eventId/schedule', toolLimit, controller.scheduleVisit);
router.post('/visits/:eventId/confirm-slot', toolLimit, controller.confirmVisitSlot);
router.post('/visits/:eventId/start', toolLimit, controller.startVisit);
router.post('/visits/:eventId/complete', toolLimit, controller.completeVisit);
// Appointments = the visit's slot, closed with the customer (migration 015)
//   {channel: share|email|whatsapp, note} → share returns message+link+phone for wa.me/copy; email/whatsapp queue a send
router.post('/visits/:eventId/ask', toolLimit, controller.askVisitSlot);
// Plan view (migration 023): the register's Plan tab
//   GET  /plan?from&to&lanes&who&q      jtd_plan — every day of the window with its cards, counts, VaNi on/off
//   POST /plan/:day/place               jtd_plan_day — "Plan this day" (VaNi leverage: refuses vani_off)
//   POST /plan/:day/ask {channel}       jtd_ask_day  — "Ask everyone"  (VaNi leverage: refuses vani_off)
router.get('/plan', readLimit, controller.plan);
router.post('/plan/:day/place', toolLimit, controller.planDay);
router.post('/plan/:day/ask', toolLimit, controller.askDay);
// Expense side (migration 021): the buyer answers a proposed slot in-app — {action: accept|propose|decline, proposed_at?, note?}
router.post('/slots/:appointmentId/respond', toolLimit, controller.respondSlot);

export default router;
