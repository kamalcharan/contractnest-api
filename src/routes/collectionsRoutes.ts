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
router.post('/payments/:jobId/nudge', toolLimit, controller.nudge);
router.post('/payments/:jobId/call', toolLimit, controller.logCall);
router.post('/payments/:jobId/escalate', toolLimit, controller.escalate);
router.post('/payments/:jobId/pause', toolLimit, controller.pause);
router.post('/payments/:jobId/resume', toolLimit, controller.resume);

export default router;
