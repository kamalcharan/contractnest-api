// src/services/whatsapp.service.ts
import axios from 'axios';
import { captureException } from '../utils/sentry';

// Type definitions
export interface SendWhatsAppParams {
  mobile: string;
  templateName: string;
  variables?: Record<string, string>;
  mediaUrl?: string;
}

export interface WhatsAppResult {
  success: boolean;
  message: string;
  data?: any;
}

// MSG91 WhatsApp Service
export const whatsappService = {
  /**
   * Send WhatsApp message using MSG91
   */
  async send(params: SendWhatsAppParams): Promise<WhatsAppResult> {
    try {
      const authKey = process.env.MSG91_AUTH_KEY;
      const whatsappNumber = process.env.MSG91_WHATSAPP_NUMBER;
      const countryCode = process.env.MSG91_COUNTRY_CODE || '91';

      // Validation
      if (!authKey) {
        throw new Error('MSG91_AUTH_KEY is not configured');
      }

      if (!whatsappNumber) {
        throw new Error('MSG91_WHATSAPP_NUMBER is not configured');
      }

      const { mobile, templateName, variables, mediaUrl } = params;

      // Format mobile number
      const formatMobile = (num: string): string => {
        const cleaned = num.replace(/\D/g, '');
        
        // If already has country code, return as is
        if (cleaned.startsWith(countryCode)) {
          return cleaned;
        }
        
        // Add country code
        return `${countryCode}${cleaned}`;
      };

      const formattedMobile = formatMobile(mobile);

      // Build payload
      const payload: any = {
        integrated_number: whatsappNumber,
        content_type: 'template',
        payload: {
          to: formattedMobile,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: 'en',
              policy: 'deterministic'
            }
          }
        }
      };

      // Add variables if provided
      if (variables && Object.keys(variables).length > 0) {
        payload.payload.template.components = [
          {
            type: 'body',
            parameters: Object.values(variables).map(value => ({
              type: 'text',
              text: value
            }))
          }
        ];
      }

      // Add media if provided
      if (mediaUrl) {
        payload.payload.template.components = payload.payload.template.components || [];
        payload.payload.template.components.push({
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: {
                link: mediaUrl
              }
            }
          ]
        });
      }

      // Send WhatsApp message via MSG91 API
      const response = await axios.post(
        'https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/',
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
          message: 'WhatsApp message sent successfully',
          data: response.data
        };
      }

      return {
        success: false,
        message: response.data?.message || 'Failed to send WhatsApp message'
      };
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'whatsapp_service', action: 'send' },
        extra: { 
          mobile: params.mobile,
          templateName: params.templateName 
        }
      });

      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to send WhatsApp message'
      };
    }
  },

  /**
   * Send simple text message (non-template)
   * Note: This may require additional MSG91 configuration/approval
   */
  async sendText(params: {
    mobile: string;
    message: string;
  }): Promise<WhatsAppResult> {
    try {
      const authKey = process.env.MSG91_AUTH_KEY;
      const whatsappNumber = process.env.MSG91_WHATSAPP_NUMBER;
      const countryCode = process.env.MSG91_COUNTRY_CODE || '91';

      // Validation
      if (!authKey || !whatsappNumber) {
        throw new Error('MSG91 WhatsApp configuration is incomplete');
      }

      const { mobile, message } = params;

      // Format mobile number
      const cleaned = mobile.replace(/\D/g, '');
      const formattedMobile = cleaned.startsWith(countryCode) 
        ? cleaned 
        : `${countryCode}${cleaned}`;

      // Build payload for text message
      const payload = {
        integrated_number: whatsappNumber,
        content_type: 'text',
        payload: {
          to: formattedMobile,
          type: 'text',
          text: {
            body: message
          }
        }
      };

      const response = await axios.post(
        'https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/',
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
          message: 'WhatsApp text message sent successfully',
          data: response.data
        };
      }

      return {
        success: false,
        message: response.data?.message || 'Failed to send WhatsApp text message'
      };
    } catch (error: any) {
      console.error('Error sending WhatsApp text:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'whatsapp_service', action: 'sendText' },
        extra: { mobile: params.mobile }
      });

      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to send WhatsApp text'
      };
    }
  },

  /**
   * Test WhatsApp configuration
   */
  async test(): Promise<WhatsAppResult> {
    try {
      const authKey = process.env.MSG91_AUTH_KEY;

      if (!authKey) {
        return {
          success: false,
          message: 'MSG91_AUTH_KEY is not configured'
        };
      }

      // Test with templates list endpoint
      const response = await axios.get(
        'https://control.msg91.com/api/v5/whatsapp/templates',
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
          message: 'WhatsApp service connected successfully',
          data: response.data
        };
      }

      return {
        success: false,
        message: 'Unable to verify WhatsApp connection'
      };
    } catch (error: any) {
      console.error('Error testing WhatsApp service:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'whatsapp_service', action: 'test' }
      });

      return {
        success: false,
        message: error.response?.data?.message || 'Failed to connect to WhatsApp service'
      };
    }
  }
};