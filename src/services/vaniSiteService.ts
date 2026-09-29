// ============================================================================
// VaNi Site Service — VaNi on the tenant's own website (migration 040)
// ============================================================================
// The one piece of logic that is not in the RPCs: ANSWERING. Ground truth is
// the tenant's published packages and the FAQ they wrote on the Extend page.
//   1. FAQ first — token overlap against the FAQ questions (no model, no cost)
//   2. the VaNi LLM (vaniLLMClient, structured JSON) with the packages + FAQ
//      as the only facts it may use; asked to name a package worth showing
//   3. deterministic hand-off when the model is off or fails
// Every turn is logged by vani_site_chat_log; a name + mobile becomes a lead
// through vani_site_capture → lead_capture (kind 'vani').

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import vaniLLMClient from './vaniLLMClient';

export interface VaniSiteResult<T = any> { success: boolean; data?: T; error?: { code: string; message: string } }

export interface SitePackage {
  id: string; family_id: string; name: string; description: string | null; currency: string; price: number;
  term: { value: number | null; unit: string | null }; lines: Array<{ name: string; quantity: number; total_price: number }>;
  storefront_key: string | null;
}
export interface SiteResolve {
  site_key: string; tenant_id: string; storefront_key: string | null;
  seller: { name: string; logo_url: string | null; primary_color: string | null; city: string | null };
  greeting: string; handoff: { mode: 'capture' | 'whatsapp'; phone: string | null }; capture_mode: 'interest' | 'first' | 'never';
  allowed_domains: string[]; enabled: boolean; vani_enabled: boolean;
  card_style: Record<string, string>; packages: SitePackage[]; faq: Array<{ q: string; a: string }>;
}
export interface ChatTurn { role: 'user' | 'assistant'; text: string }
export interface Answer {
  text: string; package_family: string | null; answered: boolean; handoff: boolean; ask_contact: boolean; source: 'faq' | 'llm' | 'fallback';
}

const STOP = new Set(['the', 'a', 'an', 'is', 'it', 'do', 'does', 'you', 'your', 'i', 'we', 'can', 'of', 'for', 'to', 'in', 'on', 'and', 'or', 'are', 'what', 'how', 'much', 'with', 'this', 'that', 'my', 'me', 'be', 'have', 'has', 'will', 'there', 'any', 'about', 'please', 'hi', 'hello']);
const tokens = (s: string): Set<string> => new Set(
  (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ''))
);

const fmtMoney = (n: number, c: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: c || 'INR', maximumFractionDigits: 0 }).format(n || 0);
const termLabel = (t: SitePackage['term']) => t?.value && t?.unit ? `${t.value} ${t.value === 1 ? String(t.unit).replace(/s$/, '') : t.unit}` : '';

class VaniSiteService {
  private cache = new Map<string, { at: number; data: SiteResolve }>();

  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }
  private async call(fn: string, args: Record<string, unknown>): Promise<VaniSiteResult> {
    const supabase = this.client();
    if (!supabase) return { success: false, error: { code: 'CONFIG', message: 'Supabase is not configured' } };
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) { console.error(`[VaniSite] ${fn} failed:`, error.message); return { success: false, error: { code: 'RPC_ERROR', message: error.message } }; }
      if (data && data.success === false) return { success: false, error: { code: data.error_code || 'REFUSED', message: data.error || 'Request refused' }, data };
      return { success: true, data };
    } catch (e: any) {
      console.error(`[VaniSite] ${fn} error:`, e.message);
      return { success: false, error: { code: 'UNEXPECTED', message: e.message || 'Unexpected error' } };
    }
  }

  // ── management ──
  getConfig(tenantId: string) { return this.call('vani_site_get_config', { p_tenant_id: tenantId }); }
  updateConfig(tenantId: string, patch: Record<string, unknown>) {
    this.cache.clear();
    return this.call('vani_site_update_config', { p_tenant_id: tenantId, p_patch: patch });
  }

  // ── public ──
  /** Resolve by site key (vn-…) or storefront key (sf-…); cached 60 s per key+scope. */
  async resolve(key: string, storefrontKey: string | null, fresh = false): Promise<VaniSiteResult<SiteResolve>> {
    const ck = `${key}|${storefrontKey || ''}`;
    const hit = this.cache.get(ck);
    if (!fresh && hit && Date.now() - hit.at < 60_000) return { success: true, data: hit.data };
    const r = await this.call('vani_site_resolve', { p_key: key, p_storefront_key: storefrontKey });
    if (r.success) {
      this.cache.set(ck, { at: Date.now(), data: r.data as SiteResolve });
      if (this.cache.size > 2000) this.cache.clear();
    }
    return r as VaniSiteResult<SiteResolve>;
  }
  logTurn(key: string, sessionId: string | null, storefrontKey: string | null, pageUrl: string | null, visitor: string, assistant: Answer) {
    return this.call('vani_site_chat_log', {
      p_key: key, p_session_id: sessionId, p_storefront_key: storefrontKey, p_page_url: pageUrl, p_visitor: visitor,
      p_assistant: { text: assistant.text, package_family: assistant.package_family, answered: assistant.answered, handoff: assistant.handoff, source: assistant.source },
    });
  }
  capture(key: string, sessionId: string | null, contact: Record<string, unknown>) {
    return this.call('vani_site_capture', { p_key: key, p_session_id: sessionId, p_contact: contact });
  }

  /** Is this host allowed by the tenant's list? Empty list = anywhere. */
  domainAllowed(site: SiteResolve, host: string | null): boolean {
    const list = site.allowed_domains || [];
    if (list.length === 0) return true;
    if (!host) return false;
    const h = host.toLowerCase().replace(/:\d+$/, '');
    return list.some((d) => h === d || h.endsWith('.' + d));
  }

  // ── answering ──
  async answer(site: SiteResolve, message: string, history: ChatTurn[]): Promise<Answer> {
    const q = message.trim();
    const wantsPerson = /\b(call|talk|speak|someone|human|person|contact me|ring)\b/i.test(q);
    const sellerName = site.seller?.name || 'the team';

    // 1. FAQ first
    const qt = tokens(q);
    let best: { row: { q: string; a: string }; score: number } | null = null;
    for (const row of site.faq || []) {
      const ft = tokens(row.q);
      if (ft.size === 0 || qt.size === 0) continue;
      let common = 0; ft.forEach((t) => { if (qt.has(t)) common += 1; });
      const score = common / Math.min(ft.size, qt.size);
      if (score >= 0.6 && common >= 1 && (!best || score > best.score)) best = { row, score };
    }
    if (best && !wantsPerson) {
      const pkg = this.packageMentioned(site, q) || null;
      return { text: best.row.a, package_family: pkg?.family_id || null, answered: true, handoff: false, ask_contact: false, source: 'faq' };
    }

    // 2. the model, grounded
    if (vaniLLMClient.isEnabled() && !wantsPerson) {
      try {
        const sys = this.systemPrompt(site);
        const convo = history.slice(-6).map((t) => `${t.role === 'user' ? 'Visitor' : 'VaNi'}: ${t.text}`).join('\n');
        const user = `${convo ? convo + '\n' : ''}Visitor: ${q}\n\nAnswer as JSON only.`;
        const r = await vaniLLMClient.completeJSON<{ answer?: string; package_family?: string | null; ask_contact?: boolean; handoff?: boolean; grounded?: boolean }>(
          sys, user, { label: 'vani-site', maxTokens: 320, temperature: 0.2 });
        const p = r.parsed || {};
        const text = String(p.answer || '').trim();
        if (text) {
          const fam = site.packages.find((x) => x.family_id === p.package_family)?.family_id || null;
          const handoff = !!p.handoff || p.grounded === false;
          return { text, package_family: fam, answered: !handoff, handoff, ask_contact: !!p.ask_contact || handoff, source: 'llm' };
        }
      } catch (e: any) {
        console.warn('[VaniSite] LLM answer failed, falling back:', e?.message);
      }
    }

    // 3. deterministic
    if (wantsPerson) {
      return { text: `Of course. Leave your name and mobile and ${sellerName} will call you back.`, package_family: null, answered: true, handoff: true, ask_contact: true, source: 'fallback' };
    }
    const pkg = this.packageMentioned(site, q) || (site.packages.length === 1 ? site.packages[0] : null);
    if (pkg) {
      const lines = pkg.lines.slice(0, 3).map((l) => l.name + (l.quantity > 1 ? ` × ${l.quantity}` : '')).join(', ');
      return {
        text: `${pkg.name} is ${pkg.price > 0 ? fmtMoney(pkg.price, pkg.currency) : 'free'}${termLabel(pkg.term) ? ` for ${termLabel(pkg.term)}` : ''}${lines ? ` and includes ${lines}` : ''}. Want me to open it, or shall ${sellerName} call you?`,
        package_family: pkg.family_id, answered: true, handoff: false, ask_contact: false, source: 'fallback',
      };
    }
    if (site.packages.length > 1) {
      const names = site.packages.slice(0, 4).map((p) => `${p.name} (${p.price > 0 ? fmtMoney(p.price, p.currency) : 'free'})`).join(', ');
      return { text: `${sellerName} offers ${names}. Which one should I tell you about?`, package_family: null, answered: true, handoff: false, ask_contact: false, source: 'fallback' };
    }
    return {
      text: `I answer from ${sellerName}'s packages and FAQ, and I don't have that one. Leave your name and mobile and ${sellerName} will reply.`,
      package_family: null, answered: false, handoff: true, ask_contact: true, source: 'fallback',
    };
  }

  private packageMentioned(site: SiteResolve, q: string): SitePackage | undefined {
    const qt = tokens(q);
    let best: SitePackage | undefined; let bestScore = 0;
    for (const p of site.packages) {
      const pt = tokens(p.name);
      let common = 0; pt.forEach((t) => { if (qt.has(t)) common += 1; });
      if (common > bestScore) { bestScore = common; best = p; }
    }
    return bestScore > 0 ? best : undefined;
  }

  private systemPrompt(site: SiteResolve): string {
    const seller = site.seller?.name || 'the seller';
    const pk = site.packages.map((p) => {
      const lines = p.lines.map((l) => `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ''}${l.total_price > 0 ? ` (${fmtMoney(l.total_price, p.currency)})` : ''}`).join('; ');
      return `- ${p.name} [family ${p.family_id}] — ${p.price > 0 ? fmtMoney(p.price, p.currency) : 'free'}${termLabel(p.term) ? ` for ${termLabel(p.term)}` : ''}${p.description ? `. ${p.description}` : ''}${lines ? `. Includes: ${lines}` : ''}`;
    }).join('\n');
    const faq = (site.faq || []).map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n');
    return [
      `You are VaNi, the assistant on ${seller}'s website. You help visitors understand ${seller}'s packages and choose one.`,
      `RULES: Use ONLY the packages and FAQ below as facts. Never invent prices, coverage, terms or availability. If the visitor asks something the facts do not cover, say you will pass it to ${seller} and ask for their name and mobile. Keep answers under 70 words, warm and direct, no bullet lists. Currency is INR.`,
      `PACKAGES:\n${pk || '(none published)'}`,
      faq ? `FAQ (answer from this first):\n${faq}` : 'FAQ: (none)',
      `Reply with ONE JSON object: {"answer": string, "package_family": string|null (the family id of ONE package worth showing now, else null), "ask_contact": boolean (true when the visitor shows buying intent or wants a call), "handoff": boolean (true when you could not answer from the facts), "grounded": boolean}`,
    ].join('\n\n');
  }
}

export default new VaniSiteService();
