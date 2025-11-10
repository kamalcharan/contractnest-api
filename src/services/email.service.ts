// src/services/email.service.ts
import axios from 'axios';
import { captureException } from '../utils/sentry';

// Type definitions
export interface SendEmailParams {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    name: string;
    content: string; // base64
  }>;
}

export interface EmailResult {
  success: boolean;
  message: string;
  data?: any;
}

// MSG91 Email Service
export const emailService = {
  /**
   * Send email using MSG91
   */
  async send(params: SendEmailParams): Promise<EmailResult> {
    try {
      const authKey = process.env.MSG91_AUTH_KEY;
      const senderEmail = process.env.MSG91_SENDER_EMAIL;
      const senderName = process.env.MSG91_SENDER_NAME;

      // Validation
      if (!authKey) {
        throw new Error('MSG91_AUTH_KEY is not configured');
      }

      if (!senderEmail) {
        throw new Error('MSG91_SENDER_EMAIL is not configured');
      }

      if (!senderName) {
        throw new Error('MSG91_SENDER_NAME is not configured');
      }

      const { to, subject, body, cc, bcc, attachments } = params;

      // Prepare recipients
      const recipients = Array.isArray(to) ? to : [to];

      // Build payload
      const payload: any = {
        from: {
          email: senderEmail,
          name: senderName
        },
        to: recipients.map(email => ({ email })),
        subject,
        body
      };

      // Add optional fields
      if (cc && cc.length > 0) {
        payload.cc = cc.map(email => ({ email }));
      }

      if (bcc && bcc.length > 0) {
        payload.bcc = bcc.map(email => ({ email }));
      }

      if (attachments && attachments.length > 0) {
        payload.attachments = attachments;
      }

      // Send email via MSG91 API
      const response = await axios.post(
        'https://control.msg91.com/api/v5/email/send',
        payload,
        {
          headers: {
            'authkey': authKey,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.type === 'success') {
        return {
          success: true,
          message: 'Email sent successfully',
          data: response.data
        };
      }

      return {
        success: false,
        message: response.data?.message || 'Failed to send email'
      };
    } catch (error: any) {
      console.error('Error sending email:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'email_service', action: 'send' },
        extra: { 
          to: params.to,
          subject: params.subject 
        }
      });

      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to send email'
      };
    }
  },

  /**
   * Send email using template
   */
  async sendTemplate(params: {
    to: string | string[];
    templateId: string;
    variables: Record<string, string>;
    cc?: string[];
    bcc?: string[];
  }): Promise<EmailResult> {
    try {
      const authKey = process.env.MSG91_AUTH_KEY;
      const senderEmail = process.env.MSG91_SENDER_EMAIL;
      const senderName = process.env.MSG91_SENDER_NAME;

      // Validation
      if (!authKey || !senderEmail || !senderName) {
        throw new Error('MSG91 email configuration is incomplete');
      }

      const { to, templateId, variables, cc, bcc } = params;
      const recipients = Array.isArray(to) ? to : [to];

      // Build payload for template
      const payload: any = {
        from: {
          email: senderEmail,
          name: senderName
        },
        to: recipients.map(email => ({ email })),
        template_id: templateId,
        variables
      };

      if (cc && cc.length > 0) {
        payload.cc = cc.map(email => ({ email }));
      }

      if (bcc && bcc.length > 0) {
        payload.bcc = bcc.map(email => ({ email }));
      }

      const response = await axios.post(
        'https://control.msg91.com/api/v5/email/send',
        payload,
        {
          headers: {
            'authkey': authKey,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.type === 'success') {
        return {
          success: true,
          message: 'Template email sent successfully',
          data: response.data
        };
      }

      return {
        success: false,
        message: response.data?.message || 'Failed to send template email'
      };
    } catch (error: any) {
      console.error('Error sending template email:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'email_service', action: 'sendTemplate' },
        extra: { 
          to: params.to,
          templateId: params.templateId 
        }
      });

      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to send template email'
      };
    }
  },

  /**
   * Test email configuration
   */
  async test(): Promise<EmailResult> {
    try {
      const authKey = process.env.MSG91_AUTH_KEY;

      if (!authKey) {
        return {
          success: false,
          message: 'MSG91_AUTH_KEY is not configured'
        };
      }

      // Test with balance check endpoint
      const response = await axios.get(
        'https://control.msg91.com/api/v5/email/balance',
        {
          headers: {
            'authkey': authKey,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data) {
        return {
          success: true,
          message: 'Email service connected successfully',
          data: response.data
        };
      }

      return {
        success: false,
        message: 'Unable to verify email connection'
      };
    } catch (error: any) {
      console.error('Error testing email service:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'email_service', action: 'test' }
      });

      return {
        success: false,
        message: error.response?.data?.message || 'Failed to connect to email service'
      };
    }
  }
};