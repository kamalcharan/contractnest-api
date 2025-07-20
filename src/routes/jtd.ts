// src/routes/jtd.ts
import express from 'express';
import * as jtdController from '../controllers/jtdController';

const router = express.Router();

// Internal endpoints (no auth needed since it's internal)
router.post('/events', jtdController.submitEvent);
router.get('/events/:eventId', jtdController.getEventStatus);

// Provider webhooks (public endpoints)
router.post('/webhooks/gupshup', jtdController.handleGupshupWebhook);
router.post('/webhooks/sendgrid', jtdController.handleSendGridWebhook);
// Add more provider webhooks as needed

export default router;