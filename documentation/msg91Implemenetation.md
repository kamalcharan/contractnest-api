# MSG91 Integration - Complete Setup & Implementation Guide

## 📦 What I've Created

### 1. Three Service Files (Ready to Use)
```
src/services/
├── email.service.ts       ✅ MSG91 Email integration
├── sms.service.ts         ✅ MSG91 SMS integration
└── whatsapp.service.ts    ✅ MSG91 WhatsApp integration
```

### 2. Documentation
```
├── MSG91_SETUP_GUIDE.md   ✅ Environment setup instructions
└── USAGE_EXAMPLES.ts      ✅ Implementation examples
```

## 🚀 Quick Start (5 Steps)

### Step 1: Copy Service Files
Copy the three service files to your `src/services/` directory:
```bash
# From where I created them
cp email.service.ts /path/to/contractnest-api/src/services/
cp sms.service.ts /path/to/contractnest-api/src/services/
cp whatsapp.service.ts /path/to/contractnest-api/src/services/
```

### Step 2: Add Environment Variables

#### Local Development (.env file):
```bash
# Add these to your .env file
MSG91_AUTH_KEY=your_auth_key_from_msg91_dashboard
MSG91_SENDER_ID=YOURID
MSG91_ROUTE=4
MSG91_COUNTRY_CODE=91
MSG91_SENDER_EMAIL=noreply@yourproduct.com
MSG91_SENDER_NAME=Your Product Name
MSG91_WHATSAPP_NUMBER=919876543210
```

#### Railway Production:
1. Go to Railway Dashboard
2. Select your project
3. Click "Variables"
4. Add all variables listed above
5. Click "Deploy"

### Step 3: Test Services (Optional but Recommended)
Add a test endpoint to verify configuration:

```typescript
// In src/routes/systemRoutes.ts or create new test route
import { emailService } from '../services/email.service';
import { smsService } from '../services/sms.service';
import { whatsappService } from '../services/whatsapp.service';

router.get('/test-messaging', async (req, res) => {
  const results = {
    email: await emailService.test(),
    sms: await smsService.test(),
    whatsapp: await whatsappService.test()
  };
  
  res.json(results);
});
```

### Step 4: Use in Your Invitation Flow
Example in your invitation controller:

```typescript
// src/controllers/invitationController.ts
import { emailService } from '../services/email.service';

export const sendInvitation = async (req, res) => {
  const { email, userName, companyName } = req.body;
  
  const result = await emailService.send({
    to: email,
    subject: `Invitation to join ${companyName}`,
    body: `<h2>Hello ${userName}!</h2><p>You're invited...</p>`
  });
  
  if (result.success) {
    res.json({ success: true, message: 'Invitation sent' });
  } else {
    res.status(500).json({ success: false, message: result.message });
  }
};
```

### Step 5: Deploy & Test
1. Commit changes
2. Push to Git
3. Railway auto-deploys
4. Test with: `GET /test-messaging`
5. Use in invitation flow!

## 📋 Architecture Benefits

### ✅ What We Achieved:

1. **Simple & Clean**
   - No complex provider patterns needed
   - Direct environment variable usage
   - Easy to understand and maintain

2. **Product-Level Control**
   - Admin configures once
   - All tenants use same credentials
   - No UI complexity for configuration

3. **Easy to Switch Providers**
   - Want to switch from MSG91 to SendGrid?
   - Just update one service file
   - Change environment variables
   - No database changes needed

4. **Standard Pattern**
   - Follows your existing service structure
   - Uses your Sentry error tracking
   - Matches integrationService.ts pattern

## 🔄 Switching Providers Later (Example)

If you want to switch Email from MSG91 to SendGrid:

1. Update `email.service.ts`:
```typescript
// Change this:
const response = await axios.post(
  'https://control.msg91.com/api/v5/email/send',
  ...
);

// To this:
const response = await axios.post(
  'https://api.sendgrid.com/v3/mail/send',
  ...
);
```

2. Update environment variables:
```bash
# Old
MSG91_AUTH_KEY=xxx
MSG91_SENDER_EMAIL=xxx

# New
SENDGRID_API_KEY=xxx
SENDGRID_SENDER_EMAIL=xxx
```

3. Deploy. Done! ✅

## 📊 What Each Service Provides

### email.service.ts
```typescript
emailService.send({ to, subject, body, cc?, bcc?, attachments? })
emailService.sendTemplate({ to, templateId, variables })
emailService.test()
```

### sms.service.ts
```typescript
smsService.send({ mobile, message, templateId?, variables? })
smsService.sendOTP({ mobile, otp, templateId? })
smsService.test()
```

### whatsapp.service.ts
```typescript
whatsappService.send({ mobile, templateName, variables?, mediaUrl? })
whatsappService.sendText({ mobile, message })
whatsappService.test()
```

## 🎯 Next Steps - Your Action Items

### Immediate (Today):
1. ✅ Copy three service files to `src/services/`
2. ✅ Add environment variables to `.env`
3. ✅ Add same variables to Railway
4. ✅ Test services with `/test-messaging` endpoint

### Short-term (This Week):
1. 🔄 Integrate `emailService.send()` in invitation flow
2. 🔄 Update invitation controller to use new service
3. 🔄 Test full invitation flow (dev → staging → production)
4. 🔄 Monitor Sentry for any errors

### Optional Enhancements:
- Add SMS notifications for urgent events
- Add WhatsApp for user engagement
- Create email templates for different scenarios
- Add retry logic for failed sends
- Implement queuing for bulk operations

## 🐛 Troubleshooting

### "MSG91_AUTH_KEY is not configured"
- Check if variable exists in Railway
- Restart Railway deployment after adding variables
- Verify variable name matches exactly (case-sensitive)

### "Failed to send email/sms"
- Check MSG91 dashboard for balance
- Verify sender email/ID is approved
- Check MSG91 API status
- Look at Sentry for detailed error

### SMS not delivering
- Verify mobile number format (with country code)
- Check if number is in DND registry (India)
- Use transactional route (4) instead of promotional

### WhatsApp not working
- Verify template is approved in MSG91
- Template variables must match exactly
- WhatsApp number must be verified
- Check if recipient has WhatsApp

## 📞 Support

### MSG91 Support:
- Documentation: https://docs.msg91.com/
- Email: support@msg91.com
- Dashboard: https://control.msg91.com/

### Internal:
- Check Sentry for errors
- Review Railway logs
- Test with `/test-messaging` endpoint

## ✨ Summary

**What you have now:**
- ✅ Three production-ready service files
- ✅ Simple environment variable configuration
- ✅ Clean architecture that's easy to maintain
- ✅ Ready to integrate with invitation flow

**What you DON'T need:**
- ❌ Database migrations
- ❌ UI for configuration
- ❌ Complex provider patterns
- ❌ Tenant-level credentials

**Time to production:**
- Copy files: 2 minutes
- Add env vars: 3 minutes  
- Test services: 5 minutes
- Integrate: 10 minutes
- **Total: ~20 minutes to go live!** 🚀

---

Need help with integration? Let me know and I can help you update your invitation controller!