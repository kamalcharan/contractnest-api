// ============================================================================
// Appointment routes — Stage 3 Appointments
// Mounted at /api/appointments (see src/index.ts registration).
// Chain: authenticate → ensureTenant → rate limit → validators → controller
// ============================================================================

import express from 'express';
import AppointmentController from '../controllers/appointmentController';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import {
  createAppointmentValidation,
  updateAppointmentValidation
} from '../validators/appointmentValidators';

const router = express.Router();
const appointmentController = new AppointmentController();

router.use(authenticate);

const ensureTenant = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'x-tenant-id header is required'
      },
      metadata: { timestamp: new Date().toISOString() }
    });
  }
  next();
};

router.use(ensureTenant);

const readRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many appointment requests, please try again later' }
  }
});

const writeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many appointment actions, please try again later' }
  }
});

router.use(readRateLimit);

/**
 * GET /api/appointments?status=
 * Board feed: appointments + event + customer contact context.
 */
router.get('/', appointmentController.listAppointments);

/**
 * POST /api/appointments
 * Manual "request appointment" for a service event.
 */
router.post(
  '/',
  writeRateLimit,
  createAppointmentValidation,
  appointmentController.createAppointment
);

/**
 * PATCH /api/appointments/:appointmentId
 * Transitions (accept/decline/reschedule/no_response/complete) + edits.
 */
router.patch(
  '/:appointmentId',
  writeRateLimit,
  updateAppointmentValidation,
  appointmentController.updateAppointment
);

/**
 * GET /api/appointments/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'appointments',
    timestamp: new Date().toISOString()
  });
});

export default router;
