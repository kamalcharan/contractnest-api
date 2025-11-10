// EXAMPLE: Using MSG91 Services in Invitation Flow
// This shows how to integrate the email/sms/whatsapp services

// ============================================
// Example 1: Send Email Invitation
// ============================================

import { emailService } from '../services/email.service';
import { smsService } from '../services/sms.service';
import { whatsappService } from '../services/whatsapp.service';

/**
 * Send user invitation via email
 */
export async function sendEmailInvitation(params: {
  email: string;
  userName: string;
  inviteLink: string;
  companyName: string;
}) {
  const { email, userName, inviteLink, companyName } = params;

  // Option 1: Plain email
  const result = await emailService.send({
    to: email,
    subject: `You're invited to join ${companyName}`,
    body: `
      <html>
        <body>
          <h2>Hello ${userName}!</h2>
          <p>You've been invited to join ${companyName} on ContractNest.</p>
          <p>Click the link below to accept your invitation:</p>
          <p><a href="${inviteLink}">Accept Invitation</a></p>
          <p>This link will expire in 7 days.</p>
          <br>
          <p>Best regards,<br>${companyName} Team</p>
        </body>
      </html>
    `
  });

  if (result.success) {
    console.log('✅ Invitation email sent successfully');
  } else {
    console.error('❌ Failed to send invitation email:', result.message);
  }

  return result;
}

/**
 * Send invitation via SMS
 */
export async function sendSMSInvitation(params: {
  mobile: string;
  userName: string;
  inviteLink: string;
  companyName: string;
}) {
  const { mobile, userName, inviteLink, companyName } = params;

  const result = await smsService.send({
    mobile: mobile,
    message: `Hi ${userName}! You're invited to join ${companyName}. Click: ${inviteLink} (expires in 7 days)`
  });

  if (result.success) {
    console.log('✅ Invitation SMS sent successfully');
  } else {
    console.error('❌ Failed to send invitation SMS:', result.message);
  }

  return result;
}

/**
 * Send invitation via WhatsApp
 * Note: Requires pre-approved template in MSG91
 */
export async function sendWhatsAppInvitation(params: {
  mobile: string;
  userName: string;
  companyName: string;
  inviteCode: string;
}) {
  const { mobile, userName, companyName, inviteCode } = params;

  // Using a template (must be pre-created in MSG91)
  const result = await whatsappService.send({
    mobile: mobile,
    templateName: 'user_invitation', // Your MSG91 template name
    variables: {
      '1': userName,
      '2': companyName,
      '3': inviteCode
    }
  });

  if (result.success) {
    console.log('✅ Invitation WhatsApp sent successfully');
  } else {
    console.error('❌ Failed to send invitation WhatsApp:', result.message);
  }

  return result;
}

// ============================================
// Example 2: Send OTP for Verification
// ============================================

/**
 * Send OTP via SMS
 */
export async function sendOTPViaSMS(mobile: string, otp: string) {
  const result = await smsService.sendOTP({
    mobile: mobile,
    otp: otp
  });

  return result;
}

/**
 * Send OTP via Email
 */
export async function sendOTPViaEmail(email: string, otp: string, userName: string) {
  const result = await emailService.send({
    to: email,
    subject: 'Your Verification Code',
    body: `
      <html>
        <body>
          <h2>Hello ${userName}!</h2>
          <p>Your verification code is:</p>
          <h1 style="color: #4F46E5; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
          <p><strong>Do not share this code with anyone.</strong></p>
        </body>
      </html>
    `
  });

  return result;
}

// ============================================
// Example 3: Send Welcome Email After Signup
// ============================================

export async function sendWelcomeEmail(params: {
  email: string;
  userName: string;
  companyName: string;
}) {
  const { email, userName, companyName } = params;

  const result = await emailService.send({
    to: email,
    subject: `Welcome to ${companyName}!`,
    body: `
      <html>
        <body>
          <h2>Welcome aboard, ${userName}! 🎉</h2>
          <p>We're excited to have you as part of ${companyName}.</p>
          <h3>Getting Started:</h3>
          <ul>
            <li>Complete your profile</li>
            <li>Explore the dashboard</li>
            <li>Invite team members</li>
          </ul>
          <p>If you need any help, feel free to reach out to our support team.</p>
          <br>
          <p>Best regards,<br>The ${companyName} Team</p>
        </body>
      </html>
    `
  });

  return result;
}

// ============================================
// Example 4: Send Notification to Multiple Users
// ============================================

export async function sendBulkNotification(params: {
  emails: string[];
  subject: string;
  message: string;
}) {
  const { emails, subject, message } = params;

  // Send to multiple recipients at once
  const result = await emailService.send({
    to: emails, // Array of emails
    subject: subject,
    body: `
      <html>
        <body>
          <p>${message}</p>
        </body>
      </html>
    `
  });

  return result;
}

// ============================================
// Example 5: Controller Integration
// ============================================

// In your invitation controller:
export const invitationController = {
  /**
   * Send invitation endpoint
   * POST /api/users/invite
   */
  async sendInvitation(req: Request, res: Response) {
    try {
      const { email, mobile, userName, companyName, channel } = req.body;

      // Generate invitation link
      const inviteToken = generateToken(); // Your token generation logic
      const inviteLink = `${process.env.FRONTEND_URL}/accept-invite/${inviteToken}`;

      let result;

      // Send via selected channel
      switch (channel) {
        case 'email':
          result = await sendEmailInvitation({
            email,
            userName,
            inviteLink,
            companyName
          });
          break;

        case 'sms':
          result = await sendSMSInvitation({
            mobile,
            userName,
            inviteLink,
            companyName
          });
          break;

        case 'whatsapp':
          result = await sendWhatsAppInvitation({
            mobile,
            userName,
            companyName,
            inviteCode: inviteToken.substring(0, 6)
          });
          break;

        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid channel specified'
          });
      }

      if (result.success) {
        // Save invitation to database
        // await saveInvitationToDatabase({ email, mobile, token: inviteToken });

        return res.status(200).json({
          success: true,
          message: `Invitation sent successfully via ${channel}`,
          data: result.data
        });
      } else {
        return res.status(500).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send invitation'
      });
    }
  }
};

// ============================================
// Example 6: Testing Services
// ============================================

/**
 * Health check for messaging services
 * GET /api/health/messaging
 */
export async function checkMessagingHealth() {
  const results = {
    email: await emailService.test(),
    sms: await smsService.test(),
    whatsapp: await whatsappService.test()
  };

  return {
    status: 'OK',
    services: {
      email: results.email.success ? 'healthy' : 'error',
      sms: results.sms.success ? 'healthy' : 'error',
      whatsapp: results.whatsapp.success ? 'healthy' : 'error'
    },
    details: results
  };
}

// Helper function (mock)
function generateToken(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}