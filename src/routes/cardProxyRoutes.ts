// backend/src/routes/cardProxyRoutes.ts
import { Router, Request, Response } from 'express';

const router = Router();

const N8N_CARD_URL = 'https://n8n.srv1096269.hstgr.cloud/webhook/card-webhook-001/bbb-card';
const N8N_VCARD_URL = 'https://n8n.srv1096269.hstgr.cloud/webhook/vcard-webhook-001/bbb-vcard';

// View Business Card (HTML)
router.get('/card/:membershipId', async (req: Request, res: Response) => {
  try {
    const { membershipId } = req.params;
    
    if (!membershipId || membershipId.length < 10) {
      return res.status(400).send('Invalid membership ID');
    }

    const response = await fetch(`${N8N_CARD_URL}/${membershipId}`);
    
    if (!response.ok) {
      console.error(`Card fetch failed: ${response.status}`);
      return res.status(response.status).send('Error loading business card');
    }

    const html = await response.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (error) {
    console.error('Card proxy error:', error);
    res.status(500).send('Error loading business card');
  }
});

// Download vCard
router.get('/vcard/:membershipId', async (req: Request, res: Response) => {
  try {
    const { membershipId } = req.params;
    
    if (!membershipId || membershipId.length < 10) {
      return res.status(400).send('Invalid membership ID');
    }

    const response = await fetch(`${N8N_VCARD_URL}/${membershipId}`);
    
    if (!response.ok) {
      console.error(`vCard fetch failed: ${response.status}`);
      return res.status(response.status).send('Error loading contact');
    }

    const vcard = await response.text();
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contact.vcf"');
    res.send(vcard);
  } catch (error) {
    console.error('vCard proxy error:', error);
    res.status(500).send('Error loading contact');
  }
});

export default router;