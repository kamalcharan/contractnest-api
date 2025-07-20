// src/services/jtdService.ts
import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL, SUPABASE_KEY } from '../utils/supabaseConfig';

interface CreateEventData {
  customer_code: string;
  external_event_id?: string;
  external_tenant_id?: string;
  external_user_id?: string;
  event_type: string;
  payload: any;
}

interface TenantPreferences {
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  inapp_enabled: boolean;
}

class JTDService {
  private n8nWebhookUrl: string | null = null;
  private supabaseUrl: string;
  private serviceKey: string;
  
  constructor() {
    this.n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || null;
    this.supabaseUrl = SUPABASE_URL || '';
    this.serviceKey = SUPABASE_KEY || '';
  }
  
  async createEvent(data: CreateEventData) {
    try {
      // Insert event into database using REST API
      const response = await axios.post(
        `${this.supabaseUrl}/rest/v1/n_events`,
        {
          ...data,
          status: 'received'
        },
        {
          headers: {
            'apikey': this.serviceKey,
            'Authorization': `Bearer ${this.serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          }
        }
      );
      
      const event = response.data[0];
      
      // Check tenant preferences if tenant_id exists
      if (data.external_tenant_id) {
        const preferences = await this.getTenantPreferences(data.external_tenant_id);
        
        // Store preferences in event for N8N to use
        event.tenant_preferences = preferences;
      }
      
      // Trigger N8N if available
      if (this.n8nWebhookUrl) {
        // Don't await - let it process asynchronously
        this.triggerN8N(event).catch(error => {
          console.error('N8N trigger failed:', error);
          // Update event status to indicate N8N failure
          this.updateEventStatus(event.id, 'n8n_trigger_failed', error.message);
        });
      } else {
        // No N8N configured - event stays in 'received' status
        console.log('N8N not configured, event stored for later processing');
      }
      
      return event;
    } catch (error) {
      console.error('Error creating JTD event:', error);
      captureException(error as Error, {
        tags: { component: 'JTDService', action: 'createEvent' },
        extra: { eventType: data.event_type }
      });
      throw error;
    }
  }
  
  private async triggerN8N(event: any) {
    if (!this.n8nWebhookUrl) return;
    
    try {
      const response = await fetch(this.n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event.id,
          event_type: event.event_type,
          customer_code: event.customer_code,
          tenant_id: event.external_tenant_id,
          payload: event.payload,
          tenant_preferences: event.tenant_preferences || {
            email_enabled: true,
            sms_enabled: false,
            whatsapp_enabled: false,
            inapp_enabled: true
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`N8N webhook failed: ${response.status}`);
      }
      
      // Update event status
      await this.updateEventStatus(event.id, 'processing');
      
      console.log('N8N webhook triggered for event:', event.id);
    } catch (error) {
      console.error('N8N trigger error:', error);
      throw error;
    }
  }
  
  async getTenantPreferences(tenantId: string): Promise<TenantPreferences> {
    try {
      const response = await axios.get(
        `${this.supabaseUrl}/rest/v1/n_tenant_preferences?tenant_id=eq.${tenantId}`,
        {
          headers: {
            'apikey': this.serviceKey,
            'Authorization': `Bearer ${this.serviceKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const data = response.data[0];
      
      if (!data) {
        // Return defaults if no preferences found
        return {
          email_enabled: true,
          sms_enabled: false,
          whatsapp_enabled: false,
          inapp_enabled: true
        };
      }
      
      return {
        email_enabled: data.email_enabled,
        sms_enabled: data.sms_enabled,
        whatsapp_enabled: data.whatsapp_enabled,
        inapp_enabled: data.inapp_enabled
      };
    } catch (error) {
      console.error('Error fetching tenant preferences:', error);
      // Return defaults on error
      return {
        email_enabled: true,
        sms_enabled: false,
        whatsapp_enabled: false,
        inapp_enabled: true
      };
    }
  }
  
  async updateEventStatus(eventId: string, status: string, errorMessage?: string) {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };
      
      if (status === 'processing') {
        updateData.processed_at = new Date().toISOString();
      } else if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }
      
      if (errorMessage) {
        updateData.error_message = errorMessage;
      }
      
      await axios.patch(
        `${this.supabaseUrl}/rest/v1/n_events?id=eq.${eventId}`,
        updateData,
        {
          headers: {
            'apikey': this.serviceKey,
            'Authorization': `Bearer ${this.serviceKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error('Error updating event status:', error);
    }
  }
  
  async getEventStatus(eventId: string) {
    try {
      // Get event with deliveries
      const eventResponse = await axios.get(
        `${this.supabaseUrl}/rest/v1/n_events?id=eq.${eventId}`,
        {
          headers: {
            'apikey': this.serviceKey,
            'Authorization': `Bearer ${this.serviceKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const event = eventResponse.data[0];
      
      if (!event) {
        return null;
      }
      
      // Get deliveries for this event
      const deliveriesResponse = await axios.get(
        `${this.supabaseUrl}/rest/v1/n_deliveries?event_id=eq.${eventId}`,
        {
          headers: {
            'apikey': this.serviceKey,
            'Authorization': `Bearer ${this.serviceKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      event.n_deliveries = deliveriesResponse.data;
      
      return event;
    } catch (error) {
      console.error('Error fetching event status:', error);
      throw error;
    }
  }
  
  async updateDeliveryStatus(provider: string, webhookData: any) {
    try {
      let updates: any = {};
      let providerMessageId: string = '';
      
      if (provider === 'gupshup') {
        providerMessageId = webhookData.messageId;
        updates = {
          status: this.mapGupshupStatus(webhookData.status),
          status_details: webhookData,
          delivered_at: webhookData.deliveredTS ? new Date(webhookData.deliveredTS).toISOString() : null,
          updated_at: new Date().toISOString()
        };
      } else if (provider === 'sendgrid') {
        providerMessageId = webhookData.sg_message_id;
        updates = {
          status: this.mapSendGridStatus(webhookData.event),
          status_details: webhookData,
          updated_at: new Date().toISOString()
        };
        
        if (webhookData.event === 'delivered') {
          updates.delivered_at = new Date().toISOString();
        }
      }
      
      if (providerMessageId) {
        await axios.patch(
          `${this.supabaseUrl}/rest/v1/n_deliveries?provider_message_id=eq.${providerMessageId}`,
          updates,
          {
            headers: {
              'apikey': this.serviceKey,
              'Authorization': `Bearer ${this.serviceKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
      }
    } catch (error) {
      console.error('Error updating delivery status:', error);
      throw error;
    }
  }
  
  private mapGupshupStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'DELIVERED': 'delivered',
      'SENT': 'sent',
      'FAILED': 'failed',
      'READ': 'read',
      'PENDING': 'pending'
    };
    return statusMap[status] || status.toLowerCase();
  }
  
  private mapSendGridStatus(event: string): string {
    const statusMap: Record<string, string> = {
      'processed': 'sent',
      'delivered': 'delivered',
      'bounce': 'failed',
      'dropped': 'failed',
      'deferred': 'pending',
      'open': 'delivered',
      'click': 'delivered'
    };
    return statusMap[event] || event.toLowerCase();
  }
  
  // Method to reprocess queued events (when N8N becomes available)
  async reprocessQueuedEvents() {
    if (!this.n8nWebhookUrl) {
      console.log('N8N not configured, cannot reprocess');
      return;
    }
    
    try {
      // Get all received events that haven't been processed
      const response = await axios.get(
        `${this.supabaseUrl}/rest/v1/n_events?status=eq.received&order=created_at.asc&limit=100`,
        {
          headers: {
            'apikey': this.serviceKey,
            'Authorization': `Bearer ${this.serviceKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const queuedEvents = response.data;
      
      console.log(`Found ${queuedEvents?.length || 0} queued events to reprocess`);
      
      // Process each event
      for (const event of queuedEvents || []) {
        await this.triggerN8N(event);
        // Add delay to avoid overwhelming N8N
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('Error reprocessing queued events:', error);
      captureException(error as Error, {
        tags: { component: 'JTDService', action: 'reprocessQueuedEvents' }
      });
    }
  }
}

export const jtdService = new JTDService();