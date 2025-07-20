// src/controllers/jtdController.ts
import { Request, Response } from 'express';
import { jtdService } from '../services/jtdService';
import { captureException } from '../utils/sentry';

/**
 * Submit a new event to JTD
 * This is an internal endpoint used by other services
 */
export const submitEvent = async (req: Request, res: Response) => {
  try {
    const { event_type, payload, event_id } = req.body;
    
    // Validate required fields
    if (!event_type) {
      return res.status(400).json({ 
        error: 'event_type is required' 
      });
    }
    
    if (!payload) {
      return res.status(400).json({ 
        error: 'payload is required' 
      });
    }
    
    const event = await jtdService.createEvent({
      customer_code: 'internal_contractnest',
      external_event_id: event_id,
      external_tenant_id: payload.tenant_id,
      external_user_id: payload.user_id,
      event_type,
      payload
    });
    
    res.json({ 
      success: true, 
      event_id: event.id,
      status: event.status 
    });
  } catch (error) {
    console.error('Error submitting event:', error);
    captureException(error as Error, {
      tags: { source: 'jtd_controller', action: 'submitEvent' },
      extra: { event_type: req.body.event_type }
    });
    res.status(500).json({ 
      error: 'Failed to submit event' 
    });
  }
};

/**
 * Get event status and delivery details
 */
export const getEventStatus = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      return res.status(400).json({ 
        error: 'eventId is required' 
      });
    }
    
    const event = await jtdService.getEventStatus(eventId);
    
    if (!event) {
      return res.status(404).json({ 
        error: 'Event not found' 
      });
    }
    
    res.json(event);
  } catch (error) {
    console.error('Error fetching event status:', error);
    captureException(error as Error, {
      tags: { source: 'jtd_controller', action: 'getEventStatus' },
      extra: { eventId: req.params.eventId }
    });
    res.status(500).json({ 
      error: 'Failed to fetch event status' 
    });
  }
};

/**
 * Handle Gupshup webhook for SMS/WhatsApp delivery status
 */
export const handleGupshupWebhook = async (req: Request, res: Response) => {
  try {
    // Gupshup sends status updates as webhook
    const webhookData = req.body;
    
    console.log('Gupshup webhook received:', webhookData);
    
    // Validate webhook data
    if (!webhookData.messageId) {
      return res.status(400).json({ 
        error: 'Invalid webhook data' 
      });
    }
    
    await jtdService.updateDeliveryStatus('gupshup', webhookData);
    
    // Gupshup expects 200 OK response
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling Gupshup webhook:', error);
    captureException(error as Error, {
      tags: { source: 'jtd_controller', action: 'handleGupshupWebhook' }
    });
    // Still return 200 to avoid webhook retries
    res.status(200).json({ success: false });
  }
};

/**
 * Handle SendGrid webhook for email delivery status
 */
export const handleSendGridWebhook = async (req: Request, res: Response) => {
  try {
    // SendGrid sends an array of events
    const events = Array.isArray(req.body) ? req.body : [req.body];
    
    console.log(`SendGrid webhook received with ${events.length} events`);
    
    // Process each event
    for (const event of events) {
      if (event.sg_message_id) {
        await jtdService.updateDeliveryStatus('sendgrid', event);
      }
    }
    
    // SendGrid expects 200 OK response
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling SendGrid webhook:', error);
    captureException(error as Error, {
      tags: { source: 'jtd_controller', action: 'handleSendGridWebhook' }
    });
    // Still return 200 to avoid webhook retries
    res.status(200).json({ success: false });
  }
};