// ============================================================================
// VaNi Site Controller — the chat on the tenant's own website (migration 040)
// ============================================================================
// Public (key in the URL, no auth): resolve · chat · lead. Gated on the
// tenant's VaNi flag (vani_is_enabled → VANI_OFF) and, when the tenant listed
// domains, on the Origin/Referer host. Management (authenticate + tenant):
// get / update the site config — mounted on the Extend router.

import { Request, Response } from 'express';
import vaniSiteService, { ChatTurn } from '../services/vaniSiteService';

const KEY_RE = /^(vn-[0-9a-f]{20}|sf-[0-9a-f]{32})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The host to check against the tenant's allowed list is the CUSTOMER'S page.
 * The chat runs in our iframe, so the request's own Origin/Referer is always
 * our app; the iframe passes the host page's URL as `page_url` (chat body) or
 * `?page=` (resolve). Without it, fall back to Origin/Referer (the package
 * page's inline "Ask VaNi", where our own origin is the page).
 */
function hostOf(req: Request, pageUrl?: string | null): string | null {
  const src = pageUrl || (req.headers.origin as string) || (req.headers.referer as string) || '';
  try { return src ? new URL(src).hostname : null; } catch { return null; }
}
function status(code?: string): number {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'VALIDATION_ERROR': return 400;
    case 'VANI_OFF': case 'DOMAIN_NOT_ALLOWED': return 403;
    default: return 500;
  }
}
function badKey(res: Response) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'This link is not available' } }); }

class VaniSiteController {
  /** GET /:key?storefront=&fresh=1 → greeting, seller, packages, FAQ, hand-off. Never counts. */
  resolve = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!KEY_RE.test(key)) { badKey(res); return; }
    const sf = typeof req.query.storefront === 'string' && /^sf-[0-9a-f]{32}$/.test(req.query.storefront) ? req.query.storefront : null;
    const r = await vaniSiteService.resolve(key, sf, req.query.fresh === '1');
    if (!r.success || !r.data) { res.status(status(r.error?.code)).json({ success: false, error: r.error }); return; }
    const site = r.data;
    // the page needs to know why it should not render, without leaking the config
    const { tenant_id, allowed_domains, ...pub } = site as any;
    const page = typeof req.query.page === 'string' ? req.query.page.slice(0, 500) : null;
    res.json({ success: true, data: { ...pub, domain_ok: vaniSiteService.domainAllowed(site, hostOf(req, page)) } });
  };

  /** POST /:key/chat {message, session_id?, storefront_key?, page_url?, history?[]} */
  chat = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!KEY_RE.test(key)) { badKey(res); return; }
    const message = String(req.body?.message ?? '').trim().slice(0, 1000);
    if (!message) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Say something first' } }); return; }
    const sessionId = typeof req.body?.session_id === 'string' && UUID_RE.test(req.body.session_id) ? req.body.session_id : null;
    const sf = typeof req.body?.storefront_key === 'string' && /^sf-[0-9a-f]{32}$/.test(req.body.storefront_key) ? req.body.storefront_key : null;
    const pageUrl = typeof req.body?.page_url === 'string' ? req.body.page_url.slice(0, 500) : null;
    const history: ChatTurn[] = Array.isArray(req.body?.history)
      ? req.body.history.filter((t: any) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
          .slice(-8).map((t: any) => ({ role: t.role, text: String(t.text).slice(0, 600) }))
      : [];

    const r = await vaniSiteService.resolve(key, sf);
    if (!r.success || !r.data) { res.status(status(r.error?.code)).json({ success: false, error: r.error }); return; }
    const site = r.data;
    if (!site.vani_enabled || !site.enabled) {
      res.status(403).json({ success: false, error: { code: 'VANI_OFF', message: 'VaNi is not switched on for this business yet' } }); return;
    }
    if (!vaniSiteService.domainAllowed(site, hostOf(req, pageUrl))) {
      res.status(403).json({ success: false, error: { code: 'DOMAIN_NOT_ALLOWED', message: 'This site is not on the allowed list' } }); return;
    }

    const answer = await vaniSiteService.answer(site, message, history);
    // capture policy: 'first' asks before the first answer; 'never' never asks; 'interest' follows the answer
    const askContact = site.capture_mode === 'never' ? false : site.capture_mode === 'first' ? true : answer.ask_contact;
    const logged = await vaniSiteService.logTurn(key, sessionId, sf, pageUrl, message, answer);
    const pkg = answer.package_family ? site.packages.find((p) => p.family_id === answer.package_family) || null : null;
    res.json({
      success: true,
      data: {
        session_id: logged.success ? logged.data?.session_id : sessionId,
        reply: { text: answer.text, source: answer.source, answered: answer.answered, handoff: answer.handoff, ask_contact: askContact },
        package: pkg,
        handoff: answer.handoff ? site.handoff : null,
      },
    });
  };

  /** POST /:key/lead {session_id?, name, phone, country_code?, email?, company?} */
  lead = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!KEY_RE.test(key)) { badKey(res); return; }
    const name = String(req.body?.name ?? '').trim().slice(0, 160);
    const phone = String(req.body?.phone ?? '').trim().slice(0, 24);
    const email = String(req.body?.email ?? '').trim().slice(0, 200);
    if (!name || (phone.replace(/\D/g, '').length < 10 && !/\S+@\S+\.\S+/.test(email))) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A name and a mobile number (or email) are needed' } }); return;
    }
    const sessionId = typeof req.body?.session_id === 'string' && UUID_RE.test(req.body.session_id) ? req.body.session_id : null;
    const r = await vaniSiteService.resolve(key, null);
    if (!r.success || !r.data) { res.status(status(r.error?.code)).json({ success: false, error: r.error }); return; }
    if (!r.data.vani_enabled || !r.data.enabled) { res.status(403).json({ success: false, error: { code: 'VANI_OFF', message: 'VaNi is not switched on for this business yet' } }); return; }
    const countryCode = /^[A-Za-z]{2}$/.test(String(req.body?.country_code ?? '')) ? String(req.body.country_code).toUpperCase() : null;
    const out = await vaniSiteService.capture(key, sessionId, { name, phone, country_code: countryCode, email, company: String(req.body?.company ?? '').trim().slice(0, 200) });
    if (!out.success) { res.status(status(out.error?.code)).json({ success: false, error: out.error }); return; }
    res.status(201).json({ success: true, data: { session_id: out.data?.session_id, is_new_contact: !!out.data?.is_new_contact, seller_name: r.data.seller?.name } });
  };

  // ── management (mounted on /api/extend, behind authenticate) ──
  getConfig = async (req: Request, res: Response): Promise<void> => {
    const tenantId = String(req.headers['x-tenant-id'] || '');
    if (!UUID_RE.test(tenantId)) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'x-tenant-id is required' } }); return; }
    const r = await vaniSiteService.getConfig(tenantId);
    res.status(r.success ? 200 : 500).json(r.success ? r : { success: false, error: r.error });
  };
  updateConfig = async (req: Request, res: Response): Promise<void> => {
    const tenantId = String(req.headers['x-tenant-id'] || '');
    if (!UUID_RE.test(tenantId)) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'x-tenant-id is required' } }); return; }
    const b = req.body || {};
    const patch: Record<string, unknown> = {};
    if (typeof b.greeting === 'string') patch.greeting = b.greeting.slice(0, 300);
    if (b.handoff_mode === 'capture' || b.handoff_mode === 'whatsapp') patch.handoff_mode = b.handoff_mode;
    if (typeof b.handoff_phone === 'string') patch.handoff_phone = b.handoff_phone.slice(0, 24);
    if (['interest', 'first', 'never'].includes(b.capture_mode)) patch.capture_mode = b.capture_mode;
    if (Array.isArray(b.allowed_domains)) patch.allowed_domains = b.allowed_domains.filter((x: unknown) => typeof x === 'string').slice(0, 20);
    if (Array.isArray(b.storefront_ids)) patch.storefront_ids = b.storefront_ids.filter((x: unknown) => typeof x === 'string' && UUID_RE.test(x));
    if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
    if (Object.keys(patch).length === 0) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Nothing to update' } }); return; }
    const r = await vaniSiteService.updateConfig(tenantId, patch);
    res.status(r.success ? 200 : status(r.error?.code)).json(r.success ? r : { success: false, error: r.error });
  };
}

export default new VaniSiteController();
