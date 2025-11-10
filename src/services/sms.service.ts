// src/services/sms.service.ts
import axios from 'axios';
import { captureException } from '../utils/sentry';

// Type definitions
export interface SendSMSParams {
  mobile: string | string[];
  message: string;
  templateId?: string;
  variables?: Record<string, string>;
}

export interface SMSResult {
  success: boolean;
  message: string;
  data?: any;
}

// MSG91 SMS Service
export const smsService = {
  /**
   * Send SMS using MSG91
   */
  async send(params: SendSMSParams): Promise<SMSResult> {
    try {
      const authKey = process.env.MSG91_AUTH_KEY;
      const senderId = process.env.MSG91_SENDER_ID;
      const route = process.env.MSG91_ROUTE || '4'; // Default: Transactional
      const countryCode = process.env.MSG91_COUNTRY_CODE || '91';

      // Validation
      if (!authKey) {
        throw new Error('MSG91_AUTH_KEY is not configured');
      }

      if (!senderId) {
        throw new Error('MSG91_SENDER_ID is not configured');
      }

      const { mobile, message, templateId, variables } = params;

      // Format mobile numbers
      const formatMobile = (num: string): string => {
        // Remove any non-digit characters
        const cleaned = num.replace(/\D/g, '');
        
        // If already has country code, return as is
        if (cleaned.startsWith(countryCode)) {
          return cleaned;
        }
        
        // Add country code
        return `${countryCode}${cleaned}`;
      };

      const recipients = Array.isArray(mobile) 
        ? mobile.map(formatMobile) 
        : [formatMobile(mobile)];

      // Build payload
      const payload: any = {
        sender: senderId,
        route: route,
        country: countryCode,
        sms: recipients.map(num => ({
          message: message,
          to: [num]
        }))
      };

      // Add template fields if provided
      if (templateId && variables) {
        payload.template_id = templateId;
        payload.sms[0].variables = variables;
      }

      // Send SMS via MSG91 API
      const response = await axios.post(
        'https://control.msg91.com/api/v5/flow/',
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
          message: 'SMS sent successfully',
          data: response.data
        };
      }

      return {
        success: false,
        message: response.data?.message || 'Failed to send SMS'
      };
    } catch (error: any) {
      console.error('Error sending SMS:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'sms_service', action: 'send' },
        extra: { 
          mobile: params.mobile,
          messageLength: params.message?.length 
        }
      });

      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to send SMS'
      };
    }
  },

  /**
   * Send OTP SMS
   */
  async sendOTP(params: {
    mobile: string;
    otp: string;
    templateId?: string;
  }): Promise<SMSResult> {
    try {
      const authKey = process.env.MSG91_AUTH_KEY;
      const senderId = process.env.MSG91_SENDER_ID;
      const countryCode = process.env.MSG91_COUNTRY_CODE || '91';

      // Validation
      if (!authKey || !senderId) {
        throw new Error('MSG91 SMS configuration is incomplete');
      }

      const { mobile, otp, templateId } = params;

      // Format mobile number
      const cleaned = mobile.replace(/\D/g, '');
      const formattedMobile = cleaned.startsWith(countryCode) 
        ? cleaned 
        : `${countryCode}${cleaned}`;

      // Build OTP payload
      const payload: any = {
        sender: senderId,
        route: '2', // OTP route
        country: countryCode,
        sms: [{
          message: `Your OTP is ${otp}. Please do not share this with anyone.`,
          to: [formattedMobile]
        }]
      };

      if (templateId) {
        payload.template_id = templateId;
        payload.sms[0].variables = { otp };
      }

      const response = await axios.post(
        'https://control.msg91.com/api/v5/flow/',
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
          message: 'OTP sent successfully',
          data: response.data
        };
      }

      return {
        success: false,
        message: response.data?.message || 'Failed to send OTP'
      };
    } catch (error: any) {
      console.error('Error sending OTP:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'sms_service', action: 'sendOTP' },
        extra: { mobile: params.mobile }
      });

      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to send OTP'
      };
    }
  },

  /**
   * Test SMS configuration
   */
  async test(): Promise<SMSResult> {
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
        'https://control.msg91.com/api/v5/user/getBalance',
        {
          headers: {
            'authkey': authKey,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.balance !== undefined) {
        return {
          success: true,
          message: `SMS service connected successfully. Balance: ${response.data.balance} credits`,
          data: response.data
        };
      }

      return {
        success: false,
        message: 'Unable to verify SMS connection'
      };
    } catch (error: any) {
      console.error('Error testing SMS service:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'sms_service', action: 'test' }
      });

      return {
        success: false,
        message: error.response?.data?.message || 'Failed to connect to SMS service'
      };
    }
  }
};