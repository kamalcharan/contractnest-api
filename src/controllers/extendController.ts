// ============================================================================
// Extend Controller — storefronts (package-first) + public checkout with OTP
// ============================================================================
// Public endpoints (storefront key in the URL, no auth) drive the hosted
// pages /p/:key (package page), /buy/:key (checkout) and the widget frame
// /w/:key; management endpoints (authenticate + x-tenant-id) drive /extend.
// Thin — the RPCs (migration business-model-v2/038) own the logic. The one
// piece of logic that lives here is sending the OTP code by SMS (MSG91).
// ============================================================================

import { Request, Response } from 'express';
import extendService, { StorefrontPatch } from '../services/extendService';
import { smsService } from '../services/sms.service';

const STOREFRONT_KEY_RE = /^sf-[0-9a-f]{32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD_KEYS = ['view', 'label', 'color', 'shape', 'open'] as const;

function refusalStatus(code?: string): number {
  switch (code) {
    case 'NOT_FOUND':
    case 'TEMPLATE_GONE':
    case 'NOT_ENTITLED':
    case 'OTP_NOT_FOUND':
      return 404;
    case 'VALIDATION_ERROR':
    case 'OTP_INVALID':
    case 'OTP_EXPIRED':
    case 'OTP_LOCKED':
    case 'PHONE_NOT_VERIFIED':
      return 400;
    case 'TOUCHPOINT_NOT_ENTITLED':
      return 403;
    case 'TEMPLATE_NOT_FOUND':
      return 404;
    case 'TEMPLATE_NOT_PUBLISHABLE':
      return 422;
    case 'RATE_LIMITED':
      return 429;
    default:
      return 500;
  }
}

function badKey(res: Response): void {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'This link is not available' } });
}

/** Only known card-style keys, as strings; the RPC validates the values. */
function pickCardStyle(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of CARD_KEYS) {
    const v = (raw as any)[k];
    if (typeof v === 'string') out[k] = v.trim().slice(0, 60);
  }
  return out;
}

/**
 * Whether the OTP code may be echoed back to the browser. Off in production
 * unless STOREFRONT_OTP_DEV_ECHO=true is set explicitly — the code in the
 * response is a testing convenience, never a delivery channel.
 */
function devEchoAllowed(): boolean {
  if (process.env.STOREFRONT_OTP_DEV_ECHO === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

class ExtendController {
  // ── public (storefront-key-gated) ──

  resolveStorefront = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!STOREFRONT_KEY_RE.test(key)) { badKey(res); return; }
    // ?preview=1 is the seller's own configurator; it must not count as a view
    const preview = req.query.preview === '1' || req.query.preview === 'true';
    const result = await extendService.resolveStorefront(key, !preview);
    if (!result.success) {
      res.status(refusalStatus(result.error?.code)).json({ success: false, error: result.error });
      return;
    }
    res.json(result);
  };

  markStarted = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!STOREFRONT_KEY_RE.test(key)) { badKey(res); return; }
    const result = await extendService.markStarted(key);
    res.status(result.success ? 200 : refusalStatus(result.error?.code)).json(
      result.success ? { success: true } : { success: false, error: result.error });
  };

  /** POST /:key/otp {phone} → sends a 6-digit code by SMS; returns otp_id. */
  otpIssue = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!STOREFRONT_KEY_RE.test(key)) { badKey(res); return; }
    const phone = String(req.body?.phone ?? '').trim().slice(0, 24);
    if (phone.replace(/\D/g, '').length < 10) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a valid mobile number' } });
      return;
    }
    const issued = await extendService.otpIssue(key, phone);
    if (!issued.success) {
      res.status(refusalStatus(issued.error?.code)).json({ success: false, error: issued.error });
      return;
    }
    const { otp_id, code, expires_in } = issued.data as { otp_id: string; code: string; phone: string; expires_in: number };

    // Send the code. The RPC hands the code only to this process.
    let delivered = false;
    let deliveryError: string | null = null;
    if (process.env.MSG91_AUTH_KEY && process.env.MSG91_SENDER_ID) {
      const sent = await smsService.sendOTP({ mobile: phone, otp: code, templateId: process.env.MSG91_OTP_TEMPLATE_ID || undefined });
      delivered = sent.success;
      if (!sent.success) deliveryError = sent.message;
    } else {
      deliveryError = 'SMS is not configured';
    }

    if (!delivered && !devEchoAllowed()) {
      console.error('[Extend] OTP could not be sent:', deliveryError);
      res.status(502).json({ success: false, error: { code: 'OTP_SEND_FAILED', message: 'We could not send the code right now. Please try again in a minute.' } });
      return;
    }
    res.json({
      success: true,
      data: {
        otp_id, expires_in, delivered,
        // testing convenience only (see devEchoAllowed)
        ...(delivered ? {} : { dev_code: code, delivery_note: deliveryError }),
      },
    });
  };

  /** POST /:key/otp/verify {otp_id, code} → verify_token for the purchase. */
  otpVerify = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!STOREFRONT_KEY_RE.test(key)) { badKey(res); return; }
    const otpId = String(req.body?.otp_id ?? '');
    const code = String(req.body?.code ?? '').trim().slice(0, 12);
    if (!UUID_RE.test(otpId) || !/^\d{4,8}$/.test(code)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter the code you received' } });
      return;
    }
    const result = await extendService.otpVerify(otpId, code);
    if (!result.success) {
      res.status(refusalStatus(result.error?.code)).json({
        success: false, error: result.error,
        ...(typeof result.data?.attempts_left === 'number' ? { attempts_left: result.data.attempts_left } : {}),
      });
      return;
    }
    res.json({ success: true, data: { phone: result.data.phone, verify_token: result.data.verify_token } });
  };

  /** POST /:key/identify {name, phone, country_code?, otp_token, template_id?, email?, company?, channel?}
   *  → the verified buyer becomes a lead with an interest row ("started checkout"). */
  identify = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!STOREFRONT_KEY_RE.test(key)) { badKey(res); return; }
    const name = String(req.body?.name ?? '').trim().slice(0, 160);
    const phone = String(req.body?.phone ?? '').trim().slice(0, 24);
    const otpToken = String(req.body?.otp_token ?? '').trim().slice(0, 128);
    const templateId = String(req.body?.template_id ?? '').trim();
    if (!name || phone.replace(/\D/g, '').length < 10 || !otpToken) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name, mobile and a verified code are required' } });
      return;
    }
    const channel = ['website', 'whatsapp', 'link'].includes(String(req.body?.channel)) ? String(req.body.channel) : 'website';
    const countryCode = /^[A-Za-z]{2}$/.test(String(req.body?.country_code ?? '')) ? String(req.body.country_code).toUpperCase() : null;
    const result = await extendService.identify(key, {
      name, phone, country_code: countryCode, otp_token: otpToken, channel,
      template_id: UUID_RE.test(templateId) ? templateId : null,
      email: String(req.body?.email ?? '').trim().slice(0, 200),
      company: String(req.body?.company ?? '').trim().slice(0, 200),
    });
    if (!result.success) {
      res.status(refusalStatus(result.error?.code)).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, data: { contact_id: result.data?.contact_id, interest_id: result.data?.interest_id } });
  };

  /** POST /:key/purchase {name, phone, country_code?, otp_token, template_id?, email?, company?}
   *  → 201 {contract_id, contract_number, acceptance_method 'payment'|'signoff', payment_options, review_path} */
  purchase = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!STOREFRONT_KEY_RE.test(key)) { badKey(res); return; }
    const name = String(req.body?.name ?? '').trim().slice(0, 160);
    const company = String(req.body?.company ?? '').trim().slice(0, 200);
    const email = String(req.body?.email ?? '').trim().slice(0, 200);
    const phone = String(req.body?.phone ?? '').trim().slice(0, 24);
    const otpToken = String(req.body?.otp_token ?? '').trim().slice(0, 128);
    const templateId = String(req.body?.template_id ?? '').trim();
    if (!name || phone.replace(/\D/g, '').length < 10) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name and mobile number are required' } });
      return;
    }
    if (!otpToken) {
      res.status(400).json({ success: false, error: { code: 'PHONE_NOT_VERIFIED', message: 'Verify your mobile number first' } });
      return;
    }
    if (templateId && !UUID_RE.test(templateId)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'That package is not on this storefront' } });
      return;
    }
    const countryCode = /^[A-Za-z]{2}$/.test(String(req.body?.country_code ?? '')) ? String(req.body.country_code).toUpperCase() : null;
    const result = await extendService.purchaseFromStorefront(key, {
      name, company, email, phone, country_code: countryCode, otp_token: otpToken, template_id: templateId || null,
    });
    if (!result.success) {
      res.status(refusalStatus(result.error?.code)).json({ success: false, error: result.error });
      return;
    }
    res.status(201).json(result);
  };

  // ── authenticated (tenant-scoped) ──

  private tenantOf(req: Request): string | null {
    const tenantId = req.headers['x-tenant-id'];
    return typeof tenantId === 'string' && UUID_RE.test(tenantId) ? tenantId : null;
  }
  private userOf(req: Request): string | null {
    const id = (req as any).user?.id;
    return typeof id === 'string' && UUID_RE.test(id) ? id : null;
  }
  private noTenant(res: Response): void {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'x-tenant-id is required' } });
  }

  listStorefronts = async (req: Request, res: Response): Promise<void> => {
    const tenantId = this.tenantOf(req);
    if (!tenantId) { this.noTenant(res); return; }
    const result = await extendService.listStorefronts(tenantId);
    res.status(result.success ? 200 : 500).json(result.success ? result : { success: false, error: result.error });
  };

  createStorefront = async (req: Request, res: Response): Promise<void> => {
    const tenantId = this.tenantOf(req);
    if (!tenantId) { this.noTenant(res); return; }
    const rawIds = Array.isArray(req.body?.template_ids) ? req.body.template_ids
                 : req.body?.template_id ? [req.body.template_id] : [];
    const templateIds = rawIds.filter((x: unknown) => typeof x === 'string' && UUID_RE.test(x));
    if (templateIds.length === 0 || templateIds.length > 12) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Pick between 1 and 12 packages' } });
      return;
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) || null : null;
    const result = await extendService.createStorefront(tenantId, templateIds, name, pickCardStyle(req.body?.card_style), this.userOf(req));
    if (!result.success) {
      res.status(refusalStatus(result.error?.code)).json({ success: false, error: result.error });
      return;
    }
    res.status(201).json(result);
  };

  updateStorefront = async (req: Request, res: Response): Promise<void> => {
    const tenantId = this.tenantOf(req);
    if (!tenantId) { this.noTenant(res); return; }
    const storefrontId = req.params.id || '';
    if (!UUID_RE.test(storefrontId)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'storefront id is required' } });
      return;
    }
    const b = req.body || {};
    const patch: StorefrontPatch = {};
    if (typeof b.name === 'string') patch.name = b.name.trim().slice(0, 120);
    if (Array.isArray(b.template_ids)) {
      patch.template_ids = b.template_ids.filter((x: unknown) => typeof x === 'string' && UUID_RE.test(x));
    }
    if (b.card_style && typeof b.card_style === 'object') patch.card_style = pickCardStyle(b.card_style);
    if (Array.isArray(b.faq)) {
      patch.faq = b.faq
        .filter((r: any) => r && typeof r === 'object')
        .slice(0, 20)
        .map((r: any) => ({ q: String(r.q ?? '').trim().slice(0, 300), a: String(r.a ?? '').trim().slice(0, 300) }));
    }
    if (typeof b.is_active === 'boolean') patch.is_active = b.is_active;
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Nothing to update' } });
      return;
    }
    const result = await extendService.updateStorefront(tenantId, storefrontId, patch);
    if (!result.success) {
      res.status(refusalStatus(result.error?.code)).json({ success: false, error: result.error });
      return;
    }
    res.json(result);
  };

  // ── legacy /touchpoints (one release; the new UI does not call these) ──

  listTouchpoints = async (req: Request, res: Response): Promise<void> => {
    const tenantId = this.tenantOf(req);
    if (!tenantId) { this.noTenant(res); return; }
    const result = await extendService.listTouchpoints(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  };

  setTouchpointActive = async (req: Request, res: Response): Promise<void> => {
    const tenantId = this.tenantOf(req);
    if (!tenantId) { this.noTenant(res); return; }
    const touchpointId = req.params.id || '';
    const active = req.body?.is_active;
    if (!UUID_RE.test(touchpointId) || typeof active !== 'boolean') {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'touchpoint id and boolean is_active are required' } });
      return;
    }
    const result = await extendService.setTouchpointActive(tenantId, touchpointId, active);
    res.status(result.success ? 200 : result.error?.code === 'NOT_FOUND' ? 404 : 500).json(result);
  };
}

export default new ExtendController();
