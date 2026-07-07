// ============================================================================
// Onboarding Smart Profile autobuild (Piece 1)
// ============================================================================
// Builds the tenant's Smart Profile in the BACKGROUND during onboarding, from
// the website URL already captured at the branding step. Mirrors the proven
// Settings wizard sequence exactly:
//
//   scrape-website (n8n)  →  save profile  →  generate clusters (n8n)  →  save clusters
//
// TWO HARD RULES:
//   • HONEST — if the scrape/AI returns no real content, persist NOTHING.
//   • IDEMPOTENT — if the tenant already has a profile, skip.
//
// TEMP INSTRUMENTATION: every step also writes a row to t_sp_autobuild_debug so
// the exact failure point is visible server-side (the client console has been
// hard to capture). Remove once the onboarding path is confirmed working.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { groupsService } from './groupsService';

export interface AutobuildParams {
  authHeader: string;
  tenantId: string;
  websiteUrl: string;
  environment?: string;
}

export interface AutobuildResult {
  built: boolean;
  reason?: string;
}

// ── TEMP debug sink ─────────────────────────────────────────────────────────
function dbgClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
async function dbg(tenantId: string, step: string, detail: any) {
  const line = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log(`[SP autobuild] ${step}:`, line);
  try {
    const c = dbgClient();
    if (c) await c.from('t_sp_autobuild_debug').insert({ tenant_id: tenantId, step, detail: line });
  } catch { /* never let debug logging break the build */ }
}

export async function autobuildSmartProfile(params: AutobuildParams): Promise<AutobuildResult> {
  const { authHeader, tenantId, environment = 'live' } = params;
  const url = (params.websiteUrl || '').trim();

  await dbg(tenantId, 'start', { url, environment, hasAuth: !!authHeader });
  if (!url) { await dbg(tenantId, 'end', 'no_url'); return { built: false, reason: 'no_url' }; }

  // ── Idempotency ──────────────────────────────────────────────────────────
  try {
    const existing: any = await groupsService.getSmartProfile(authHeader, tenantId);
    const sp = existing?.smartprofile || existing?.data?.smartprofile || existing?.data || existing;
    await dbg(tenantId, 'idempotency', {
      raw: existing ? JSON.stringify(existing).slice(0, 300) : null,
      hasDesc: !!sp?.ai_enhanced_description, hasId: !!sp?.id,
    });
    if (sp && (sp.ai_enhanced_description || sp.id)) {
      await dbg(tenantId, 'end', 'already_exists');
      return { built: false, reason: 'already_exists' };
    }
  } catch (e: any) {
    await dbg(tenantId, 'idempotency_err', e?.message || String(e));
  }

  // ── 1) Scrape ──────────────────────────────────────────────────────────────
  let scraped: any;
  try {
    scraped = await groupsService.scrapeWebsiteForSmartProfile(authHeader, tenantId, url, environment);
    await dbg(tenantId, 'scrape_ok', {
      keys: scraped ? Object.keys(scraped) : null,
      descLen: String(scraped?.ai_enhanced_description || '').length,
      raw: JSON.stringify(scraped || {}).slice(0, 400),
    });
  } catch (e: any) {
    await dbg(tenantId, 'scrape_err', {
      message: e?.message, status: e?.response?.status,
      data: JSON.stringify(e?.response?.data || {}).slice(0, 400),
    });
    await dbg(tenantId, 'end', 'scrape_failed');
    return { built: false, reason: 'scrape_failed' };
  }

  const description = String(scraped?.ai_enhanced_description || '').trim();
  const keywords: string[] = Array.isArray(scraped?.suggested_keywords) ? scraped.suggested_keywords : [];
  if (!description) {
    await dbg(tenantId, 'end', 'no_description');
    return { built: false, reason: 'no_description' };
  }

  // ── 2) Save profile ──────────────────────────────────────────────────────
  try {
    const saved = await groupsService.saveSmartProfile(authHeader, tenantId, {
      ai_enhanced_description: description,
      approved_keywords: keywords,
      website_url: url,
      generation_method: 'website',
      profile_type: 'business',
    });
    await dbg(tenantId, 'save_ok', JSON.stringify(saved || {}).slice(0, 300));
  } catch (e: any) {
    await dbg(tenantId, 'save_err', {
      message: e?.message, status: e?.response?.status,
      data: JSON.stringify(e?.response?.data || {}).slice(0, 400),
    });
    await dbg(tenantId, 'end', 'save_failed');
    return { built: false, reason: 'save_failed' };
  }

  // ── 3) Clusters (best-effort) ────────────────────────────────────────────
  try {
    const gen: any = await groupsService.generateSmartProfileClusters(authHeader, tenantId, description, keywords, environment);
    const clusters = (gen?.clusters || [])
      .map((c: any) => ({
        primary_term: c.primary_term,
        related_terms: c.related_terms || [],
        category: c.category || '',
        confidence_score: c.confidence_score ?? 0.9,
        is_active: true,
      }))
      .filter((c: any) => c.primary_term && String(c.primary_term).trim());
    if (clusters.length > 0) {
      await groupsService.saveSmartProfileClusters(authHeader, tenantId, clusters);
    }
    await dbg(tenantId, 'clusters_ok', { count: clusters.length });
  } catch (e: any) {
    await dbg(tenantId, 'clusters_err', e?.message || String(e));
  }

  await dbg(tenantId, 'end', 'built');
  return { built: true };
}

export default { autobuildSmartProfile };
