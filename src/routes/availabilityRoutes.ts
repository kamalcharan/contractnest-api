// ============================================================================
// Availability routes — who works when (migration jtd-nucleus/024)
// Mounted at /api/availability (see src/index.ts). authenticate → x-tenant-id → controller.
//   GET    /users/:userId          get_user_availability
//   PUT    /users/:userId          set_user_availability   { work_start?, work_end?, weekly_off? } (all null = inherit)
//   POST   /users/:userId/leave    add_user_leave          { date, part: full|am|pm, label? }
//   DELETE /users/:userId/leave    remove_user_leave       ?date=YYYY-MM-DD
//   GET    /team?days=60           get_team_availability
// ============================================================================

import express from 'express';
import { authenticate } from '../middleware/auth';
import availabilityController from '../controllers/availabilityController';

const router = express.Router();
router.use(authenticate);
router.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'x-tenant-id header is required' }, metadata: { timestamp: new Date().toISOString() } });
    return;
  }
  next();
});

router.get('/team', availabilityController.team);
router.get('/users/:userId', availabilityController.getUser);
router.put('/users/:userId', availabilityController.setUser);
router.post('/users/:userId/leave', availabilityController.addLeave);
router.delete('/users/:userId/leave', availabilityController.removeLeave);

export default router;
