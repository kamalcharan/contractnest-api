# MSG91 Integration - Environment Setup Guide

## Required Environment Variables

Add these variables to your `.env` file and Railway environment:

```bash
# MSG91 Authentication
MSG91_AUTH_KEY=your_msg91_auth_key_here

# SMS Configuration
MSG91_SENDER_ID=YOURID          # 6-character sender ID (e.g., MSGIND)
MSG91_ROUTE=4                   # 4=Transactional, 1=Promotional, 2=OTP
MSG91_COUNTRY_CODE=91           # Default: 91 (India)

# Email Configuration
MSG91_SENDER_EMAIL=noreply@yourproduct.com
MSG91_SENDER_NAME=Your Product Name

# WhatsApp Configuration
MSG91_WHATSAPP_NUMBER=919876543210    # Your MSG91 WhatsApp Business number
```

## Where to Get These Values

### 1. MSG91_AUTH_KEY
1. Login to [MSG91 Dashboard](https://control.msg91.com/)
2. Go to Settings → API Keys
3. Copy your Auth Key

### 2. MSG91_SENDER_ID (SMS)
1. Go to SMS → Sender IDs
2. Create a new Sender ID (6 characters, alphanumeric)
3. Get it approved by MSG91

### 3. MSG91_SENDER_EMAIL (Email)
1. Go to Email → Sender Domains
2. Add and verify your domain
3. Use any email with that domain (e.g., noreply@yourdomain.com)

### 4. MSG91_WHATSAPP_NUMBER (WhatsApp)
1. Go to WhatsApp → Numbers
2. Purchase or configure a WhatsApp Business number
3. Copy the number (with country code)

## Railway Deployment Setup

1. Go to your Railway project
2. Click on Variables
3. Add all the environment variables listed above
4. Click Deploy

## Local Development Setup

1. Copy the example above to your `.env` file
2. Replace placeholder values with actual credentials
3. Restart your development server

## Testing Configuration

You can test the services using the test endpoints:

```typescript
// Test SMS
await smsService.test();

// Test Email
await emailService.test();

// Test WhatsApp
await whatsappService.test();
```

## Security Notes

- **NEVER commit `.env` file to Git**
- Keep your Auth Key secure
- Rotate keys periodically
- Use different keys for development and production if possible
- MSG91 encrypts sensitive data in transit using HTTPS

## MSG91 Route Types (SMS)

- **Route 1 (Promotional)**: Marketing messages
- **Route 2 (OTP)**: One-time passwords
- **Route 4 (Transactional)**: Order confirmations, notifications (recommended)

## Rate Limits

MSG91 has different rate limits based on your plan:
- Check your dashboard for current limits
- Implement retry logic for 429 errors
- Consider queuing for bulk operations

## Support

For MSG91 specific issues:
- Documentation: https://docs.msg91.com/
- Support: support@msg91.com
- Dashboard: https://control.msg91.com/