// ============================================================================
// Service Execution Routes
// ============================================================================
// Purpose: Define service execution API endpoints (tickets, evidence, audit)
// Pattern: Routes define WHAT endpoints exist, validators enforce contracts
// ============================================================================

import express from 'express';
import ServiceExecutionController from '../controllers/serviceExecutionController';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import {
  listTicketsValidation,
  getTicketDetailValidation,
  createTicketValidation,
  updateTicketValidation,
  listEvidenceValidation,
  listTicketEvidenceValidation,
  createEvidenceValidation,
  updateEvidenceValidation,
  getAuditLogValidation
} from '../validators/serviceExecutionValidators';

const router = express.Router();
const controller = new ServiceExecutionController();

// =================================================================
// MIDDLEWARE
// =================================================================

router.use(authenticate);

const ensureTenant = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'x-tenant-id header is required' },
      metadata: { timestamp: new Date().toISOString() }
    });
  }
  next();
};

router.use(ensureTenant);

const readRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: 'Too many requests, please try again later', code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, error: 'Too many write requests, please try again later', code: 'WRITE_RATE_LIMIT_EXCEEDED' },
});

router.use(readRateLimit);

// =================================================================
// AUDIT (must be before /:ticketId to avoid matching 'audit' as UUID)
// =================================================================

router.get('/audit', getAuditLogValidation, controller.getAuditLog);

// =================================================================
// EVIDENCE (contract-wide, before /:ticketId)
// =================================================================

router.get('/evidence', listEvidenceValidation, controller.listEvidence);

// =================================================================
// HEALTH
// =================================================================

router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy', service: 'service-execution', timestamp: new Date().toISOString() });
});

// =================================================================
// TICKETS
// =================================================================

router.get('/', listTicketsValidation, controller.listTickets);
router.get('/:ticketId', getTicketDetailValidation, controller.getTicketDetail);
router.post('/', writeRateLimit, createTicketValidation, controller.createTicket);
router.patch('/:ticketId', writeRateLimit, updateTicketValidation, controller.updateTicket);

// =================================================================
// EVIDENCE (ticket-scoped)
// =================================================================

router.get('/:ticketId/evidence', listTicketEvidenceValidation, controller.listEvidence);
router.post('/:ticketId/evidence', writeRateLimit, createEvidenceValidation, controller.createEvidence);
router.patch('/:ticketId/evidence/:evidenceId', writeRateLimit, updateEvidenceValidation, controller.updateEvidence);

export default router;
