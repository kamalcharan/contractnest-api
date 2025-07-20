// src/services/jtdRealtimeListener.ts
import { createClient } from '@supabase/supabase-js';
import { jtdService } from './jtdService';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL, SUPABASE_KEY } from '../utils/supabaseConfig';

interface AuthUserPayload {
  id: string;
  email: string;
  phone?: string;
  raw_user_meta_data?: {
    first_name?: string;
    last_name?: string;
    tenant_id?: string;
  };
}

interface InvitationPayload {
  id: string;
  email: string;
  tenant_id: string;
  role_id: string;
  invited_by: string;
  expires_at: string;
}

export class JTDRealtimeListener {
  private supabase: any;
  private channels: Map<string, any> = new Map();
  private isListening: boolean = false;
  
  constructor() {
    // Initialize Supabase client for realtime only
    // Use service_role key for full access
    if (SUPABASE_URL && SUPABASE_KEY) {
      this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });
    }
  }
  
  async start() {
    if (!this.supabase) {
      console.error('Supabase client not initialized for JTD Realtime');
      return;
    }
    
    if (this.isListening) {
      console.log('JTD Realtime Listener already running');
      return;
    }
    
    console.log('Starting JTD Realtime Listener...');
    
    try {
      // Listen to t_user_tenants table - this is created after user profile
      const userTenantChannel = this.supabase
        .channel('jtd-user-tenants')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 't_user_tenants'
        }, async (payload: any) => {
          console.log('New user-tenant relationship detected:', payload.new);
          console.log('User-tenant payload:', JSON.stringify(payload.new, null, 2));
          
          if (payload.new && payload.new.user_id && payload.new.tenant_id) {
            console.log('✅ Realtime is working properly on t_user_tenants!');
            
            // Get user profile details
            let userProfile = null;
            let userEmail = '';
            
            try {
              // Get profile data
              const profileResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/t_user_profiles?user_id=eq.${payload.new.user_id}`,
                {
                  headers: {
                    'apikey': SUPABASE_KEY!,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              if (profileResponse.ok) {
                const profileData = await profileResponse.json();
                userProfile = profileData[0];
              }
              
              // Get tenant name
              const tenantResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/t_tenants?id=eq.${payload.new.tenant_id}`,
                {
                  headers: {
                    'apikey': SUPABASE_KEY!,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              let tenantName = 'Unknown';
              if (tenantResponse.ok) {
                const tenantData = await tenantResponse.json();
                if (tenantData[0]) {
                  tenantName = tenantData[0].name;
                }
              }
              
              // Create JTD event for new user
              await jtdService.createEvent({
                customer_code: 'internal_contractnest',
                external_event_id: `user_${payload.new.user_id}_${Date.now()}`,
                external_tenant_id: payload.new.tenant_id,
                external_user_id: payload.new.user_id,
                event_type: 'user.created',
                payload: {
                  user_id: payload.new.user_id,
                  email: userProfile?.email || '',
                  first_name: userProfile?.first_name || '',
                  last_name: userProfile?.last_name || '',
                  user_code: userProfile?.user_code || '',
                  tenant_id: payload.new.tenant_id,
                  tenant_name: tenantName,
                  role: payload.new.role || 'member'
                }
              });
              
              console.log('Created JTD event for user.created');
            } catch (error) {
              console.error('Error processing user-tenant event:', error);
            }
          }
        })
        .subscribe((status: string, err?: any) => {
          console.log('User-tenant channel subscription status:', status);
          if (err) {
            console.error('User-tenant channel subscription error:', err);
          }
        });
      
      this.channels.set('user-tenants', userTenantChannel);
      
      // Also test with invitations (keep this as is)
      const invitationChannel = this.supabase
        .channel('jtd-invitations')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 't_user_invitations'
        }, async (payload: any) => {
          console.log('New invitation detected:', payload.new);
          console.log('Invitation payload:', JSON.stringify(payload.new, null, 2));
          await this.handleInvitationCreated(payload.new as InvitationPayload);
        })
        .subscribe((status: string, err?: any) => {
          console.log('Invitations channel subscription status:', status);
          if (err) {
            console.error('Invitations channel subscription error:', err);
          }
        });
      
      this.channels.set('invitations', invitationChannel);
      
      // Listen to password reset requests (if you have a table for this)
      // Add more listeners as needed
      
      this.isListening = true;
      console.log('JTD Realtime Listener started successfully');
    } catch (error) {
      console.error('Error starting JTD Realtime Listener:', error);
      captureException(error as Error, {
        tags: { component: 'JTDRealtimeListener', action: 'start' }
      });
      throw error;
    }
  }
  
  async stop() {
    if (!this.supabase) return;
    
    console.log('Stopping JTD Realtime Listener...');
    
    for (const [name, channel] of this.channels) {
      await this.supabase.removeChannel(channel);
      console.log(`Removed channel: ${name}`);
    }
    
    this.channels.clear();
    this.isListening = false;
    console.log('JTD Realtime Listener stopped');
  }
  
  private async handleUserCreated(user: AuthUserPayload) {
    try {
      console.log('handleUserCreated called with:', JSON.stringify(user, null, 2));
      
      // Extract tenant_id from metadata
      const tenantId = user.raw_user_meta_data?.tenant_id;
      
      if (!tenantId) {
        console.warn('No tenant_id found for user:', user.id);
        console.warn('User metadata:', user.raw_user_meta_data);
        return;
      }
      
      // Get tenant details using REST API
      const tenantResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/t_tenants?id=eq.${tenantId}`,
        {
          headers: {
            'apikey': SUPABASE_KEY!,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const tenantData = await tenantResponse.json();
      const tenant = tenantData[0];
      
      // Create JTD event
      await jtdService.createEvent({
        customer_code: 'internal_contractnest',
        external_event_id: `auth_${user.id}_${Date.now()}`,
        external_tenant_id: tenantId,
        external_user_id: user.id,
        event_type: 'user.created',
        payload: {
          user_id: user.id,
          email: user.email,
          phone: user.phone,
          first_name: user.raw_user_meta_data?.first_name || '',
          last_name: user.raw_user_meta_data?.last_name || '',
          tenant_id: tenantId,
          tenant_name: tenant?.name || 'Unknown'
        }
      });
      
      console.log('Created JTD event for user.created:', user.id);
    } catch (error) {
      console.error('Error handling user created:', error);
      captureException(error as Error, {
        tags: { component: 'JTDRealtimeListener', action: 'handleUserCreated' },
        extra: { userId: user.id }
      });
    }
  }
  
  private async handleInvitationCreated(invitation: InvitationPayload) {
    try {
      // Get tenant and inviter details using REST API
      const tenantResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/t_tenants?id=eq.${invitation.tenant_id}`,
        {
          headers: {
            'apikey': SUPABASE_KEY!,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const tenantData = await tenantResponse.json();
      const tenant = tenantData[0];
      
      const inviterResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/t_user_profiles?user_id=eq.${invitation.invited_by}`,
        {
          headers: {
            'apikey': SUPABASE_KEY!,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const inviterData = await inviterResponse.json();
      const inviter = inviterData[0];
      
      // Create JTD event
      await jtdService.createEvent({
        customer_code: 'internal_contractnest',
        external_event_id: `invite_${invitation.id}`,
        external_tenant_id: invitation.tenant_id,
        external_user_id: invitation.invited_by,
        event_type: 'invitation.sent',
        payload: {
          invitation_id: invitation.id,
          email: invitation.email,
          tenant_id: invitation.tenant_id,
          tenant_name: tenant?.name || 'Unknown',
          invited_by_name: inviter ? `${inviter.first_name} ${inviter.last_name}` : 'Team Member',
          expires_at: invitation.expires_at
        }
      });
      
      console.log('Created JTD event for invitation.sent:', invitation.id);
    } catch (error) {
      console.error('Error handling invitation created:', error);
      captureException(error as Error, {
        tags: { component: 'JTDRealtimeListener', action: 'handleInvitationCreated' },
        extra: { invitationId: invitation.id }
      });
    }
  }
}

// Export singleton instance
export const jtdRealtimeListener = new JTDRealtimeListener();