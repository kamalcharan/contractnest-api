// ============================================================================
// Group Sessions Dashboard Routes — mounted at /api/group-sessions
// ============================================================================
// Authenticated, chair-side read model for the generic Group Sessions dashboard.
// tenant/environment are read from headers inside the controller.

import express from 'express';
import groupSessionsDashboardController from '../controllers/groupSessionsDashboardController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

// GET /api/group-sessions/sessions                     → overview list + aggregates
router.get('/sessions', groupSessionsDashboardController.dashSessions);
// GET /api/group-sessions/occurrences/:blockId         → occurrences for a block
router.get('/occurrences/:blockId', groupSessionsDashboardController.dashOccurrences);
// POST /api/group-sessions/occurrences/:blockId/generate → generate schedule from cadence
router.post('/occurrences/:blockId/generate', groupSessionsDashboardController.generateSchedule);
// POST /api/group-sessions/occurrences/:blockId/add      → add an ad-hoc occurrence
router.post('/occurrences/:blockId/add', groupSessionsDashboardController.addOccurrence);
// POST /api/group-sessions/occurrence/:id/move           → move one occurrence (holiday)
router.post('/occurrence/:id/move', groupSessionsDashboardController.moveOccurrence);
// POST /api/group-sessions/occurrence/:id/status         → skip/cancel/restore/held
router.post('/occurrence/:id/status', groupSessionsDashboardController.setOccurrenceStatus);
// POST /api/group-sessions/occurrence/:id/assign          → assign (or clear) this occurrence's chair
router.post('/occurrence/:id/assign', groupSessionsDashboardController.assignChair);
// POST /api/group-sessions/occurrences/:blockId/assign-default → set the default chair for every future occurrence
router.post('/occurrences/:blockId/assign-default', groupSessionsDashboardController.assignDefaultChair);
// GET /api/group-sessions/roster/:blockId              → roster + dues for a block
router.get('/roster/:blockId', groupSessionsDashboardController.dashRoster);
// POST /api/group-sessions/token/:blockId              → mint/return the block QR token
router.post('/token/:blockId', groupSessionsDashboardController.ensureToken);
// GET /api/group-sessions/occurrence/:id/attendance    → one occurrence's roster present/absent
router.get('/occurrence/:id/attendance', groupSessionsDashboardController.occurrenceAttendance);
// POST /api/group-sessions/occurrence/:id/mark         → chair marks member present/absent
router.post('/occurrence/:id/mark', groupSessionsDashboardController.markAttendance);
// GET /api/group-sessions/member/:memberId/block/:blockId → member-in-block profile
router.get('/member/:memberId/block/:blockId', groupSessionsDashboardController.memberBlock);
// GET /api/group-sessions/member/:memberId             → member drill-down
router.get('/member/:memberId', groupSessionsDashboardController.dashMember);

export default router;
