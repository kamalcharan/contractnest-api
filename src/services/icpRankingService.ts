// ============================================================================
// ICP Ranking Service — onboarding resource seeding (Piece 2)
// ============================================================================
// Overlays a PER-TENANT relevance score on the resource-template catalog the
// onboarding "What do you work with?" step already renders. The step used to
// order templates by a STATIC, global signal (is_recommended / popularity_score
// — identical for every tenant in an industry). This service ranks the same
// list against the calling tenant's REAL ICP:
//
//   • Smart Profile vocabulary  (approved keywords + semantic-cluster terms)
//   • ICP archetype keywords    (m_icp_archetypes matched by industry/persona)
//   • Embedding-neighbour terms  (icp_similar_tenants → their cluster vocabulary)
//   • The tenant's own materialized resources (re-seed / settings case)
//   • Industry overlap + the static signal, as stable tiebreakers
//
// SELF-CONTAINED on purpose: its own service-role reads, its own archetype
// scoring — no dependency on contractComposerService internals, so it ships as
// pure additions. Read-only, tenant-scoped, NEVER throws: any gap degrades to
// an empty ranking, and the UI then keeps its existing static order (no
// regression). Reuses the SAME m_icp_archetypes table + icp_similar_tenants RPC
// the smart chips use, so "same/near profiles get the same recommendations".
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import resourcesService from './resourcesService';

// Per-template ranking result. `forYou` = an actual ICP-vocabulary/archetype/
// neighbour keyword matched (not merely an industry or static hit) — the UI
// uses it to draw the "★ For you" badge.
export interface TemplateRank {
  score: number;
  forYou: boolean;
}
export type RankingMap = Record<string, TemplateRank>;

interface TenantIcp {
  vocabulary: string[];
  persona: string;
  industryIds: string[];
  resourceNames: string[];
}

// Weights — ICP keyword hits dominate; industry + static signals only break ties
// so the ordering stays stable when the ICP is thin.
const W_KEYWORD       = 8;   // per distinct ICP keyword found in a template
const W_KEYWORD_CAP   = 48;  // ceiling on keyword contribution (6 hits)
const W_INDUSTRY      = 40;  // template industry ∈ tenant industries
const W_RECOMMENDED   = 5;   // preserve the static "Rec" signal as a tiebreaker
const W_POPULARITY    = 0.05; // popularity_score (0..100) → 0..5

class IcpRankingService {
  private supabaseServiceRead(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  // ── Tenant ICP: vocabulary + persona + industries + own resources ──────────
  private async fetchTenantIcp(supabase: SupabaseClient, tenantId: string): Promise<TenantIcp> {
    const empty: TenantIcp = { vocabulary: [], persona: '', industryIds: [], resourceNames: [] };
    try {
      const [profileRes, clusterRes, resourceRes, tprofRes, servedRes] = await Promise.all([
        supabase.from('t_tenant_smartprofiles')
          .select('approved_keywords, suggested_keywords, profile_type')
          .eq('tenant_id', tenantId).eq('is_active', true).limit(1),
        supabase.from('t_semantic_clusters')
          .select('primary_term, related_terms')
          .eq('tenant_id', tenantId).eq('is_active', true),
        supabase.from('t_category_resources_master')
          .select('display_name, name')
          .eq('tenant_id', tenantId).eq('is_active', true).eq('is_live', true).limit(24),
        supabase.from('t_tenant_profiles')
          .select('industry_id').eq('tenant_id', tenantId).limit(1),
        supabase.from('t_tenant_served_industries')
          .select('industry_id').eq('tenant_id', tenantId),
      ]);

      const profile: any = (profileRes.data || [])[0] || {};
      const clusters: any[] = clusterRes.data || [];

      const industryIds = new Set<string>();
      const ownInd = (tprofRes.data || [])[0]?.industry_id;
      if (ownInd) industryIds.add(String(ownInd).toLowerCase());
      for (const s of (servedRes.data || [])) if (s.industry_id) industryIds.add(String(s.industry_id).toLowerCase());

      const vocab = new Set<string>();
      for (const k of [...(profile.approved_keywords || []), ...(profile.suggested_keywords || [])]) {
        if (k) vocab.add(String(k).toLowerCase().trim());
      }
      for (const c of clusters) {
        if (c.primary_term) vocab.add(String(c.primary_term).toLowerCase().trim());
        for (const rt of (c.related_terms || [])) if (rt) vocab.add(String(rt).toLowerCase().trim());
      }

      const seen = new Set<string>();
      const resourceNames = (resourceRes.data || [])
        .map((r: any) => String(r.display_name || r.name || '').toLowerCase().trim())
        .filter((n: string) => n && !seen.has(n) && seen.add(n));

      return {
        vocabulary: Array.from(vocab).filter(Boolean),
        persona: String(profile.profile_type || ''),
        industryIds: Array.from(industryIds),
        resourceNames,
      };
    } catch (e: any) {
      console.warn('⚠️ IcpRanking: ICP fetch failed (ranking degrades):', e.message);
      return empty;
    }
  }

  // ── Archetype keywords (m_icp_archetypes) matched by industry/persona/vocab ──
  private async fetchArchetypeKeywords(supabase: SupabaseClient, icp: TenantIcp): Promise<string[]> {
    try {
      const { data: rows } = await supabase
        .from('m_icp_archetypes')
        .select('id, personas, industry_ids, keywords, sort_order')
        .eq('is_active', true);
      const arches: any[] = rows || [];
      if (arches.length === 0) return [];

      const industrySet = new Set(icp.industryIds.map((s) => s.toLowerCase()));
      const vocabSet = new Set(icp.vocabulary.map((s) => s.toLowerCase()));
      const score = (a: any): number => {
        const inds: string[] = a.industry_ids || [];
        const kws: string[] = a.keywords || [];
        const personas: string[] = a.personas || [];
        const indHits = inds.filter((i: string) => industrySet.has(String(i).toLowerCase())).length;
        const kwHits = kws.filter((k: string) => vocabSet.has(String(k).toLowerCase())).length;
        const personaOk = personas.length === 0 || (icp.persona && personas.includes(icp.persona));
        if (a.id !== 'generic_service' && indHits === 0 && kwHits === 0) return -1; // no signal
        return indHits * 3 + kwHits + (personaOk ? 1 : -2);
      };
      const best = arches.map((a) => ({ a, s: score(a) })).sort((x, y) => y.s - x.s)[0];
      const chosen = best && best.s >= 0 ? best.a : arches.find((a) => a.id === 'generic_service');
      return chosen ? (chosen.keywords || []).map((s: string) => String(s).toLowerCase().trim()).filter(Boolean) : [];
    } catch (e: any) {
      console.warn('⚠️ IcpRanking: archetype fetch failed:', e.message);
      return [];
    }
  }

  // ── Embedding neighbours → borrow their cluster vocabulary (needs an embedding) ──
  private async fetchNeighbourTerms(supabase: SupabaseClient, tenantId: string): Promise<string[]> {
    try {
      const { data: sim } = await supabase.rpc('icp_similar_tenants', { p_tenant_id: tenantId, p_limit: 5 });
      const neighbourIds: string[] = (sim || []).map((r: any) => r.tenant_id).filter(Boolean);
      if (!neighbourIds.length) return [];
      const { data: nclusters } = await supabase
        .from('t_semantic_clusters')
        .select('primary_term')
        .in('tenant_id', neighbourIds).eq('is_active', true).limit(24);
      const seen = new Set<string>();
      return (nclusters || [])
        .map((c: any) => String(c.primary_term || '').toLowerCase().trim())
        .filter((t: string) => t && !seen.has(t) && seen.add(t));
    } catch (e: any) {
      console.warn('⚠️ IcpRanking: neighbour fetch failed:', e.message);
      return [];
    }
  }

  // ── Public: rank the tenant's resource-template catalog ─────────────────────
  // Returns {} when there is no ICP signal (blank/cold tenant or no service-role
  // key) — the UI then keeps its existing static order. Never throws.
  async rankTemplatesForTenant(authHeader: string, tenantId: string): Promise<RankingMap> {
    const supabase = this.supabaseServiceRead();
    if (!supabase) return {};

    // ICP first — if the tenant has no signal at all, skip the template fetch.
    const icp = await this.fetchTenantIcp(supabase, tenantId);
    const [archetypeKeywords, neighbourTerms] = await Promise.all([
      this.fetchArchetypeKeywords(supabase, icp),
      this.fetchNeighbourTerms(supabase, tenantId),
    ]);

    // Distinct ICP keyword set (all count toward the "For you" badge). Longer than
    // 2 chars so single letters / stop-fragments don't produce noise matches.
    const icpKeywords = Array.from(new Set([
      ...icp.vocabulary,
      ...archetypeKeywords,
      ...neighbourTerms,
      ...icp.resourceNames,
    ])).filter((k) => k.length > 2);

    const hasSignal = icpKeywords.length > 0 || icp.industryIds.length > 0;
    if (!hasSignal) return {};

    // Fetch the same catalog the onboarding step renders (tenant served industries).
    let templates: any[] = [];
    try {
      const resp = await resourcesService.getResourceTemplates(authHeader, tenantId, { limit: 500 });
      templates = resp?.data || [];
    } catch (e: any) {
      console.warn('⚠️ IcpRanking: template fetch failed:', e.message);
      return {};
    }
    if (templates.length === 0) return {};

    const industrySet = new Set(icp.industryIds.map((s) => s.toLowerCase()));
    const ranking: RankingMap = {};

    for (const t of templates) {
      const text = [
        t.name, t.sub_category, t.description,
        ...(Array.isArray(t.make_examples) ? t.make_examples : []),
      ].filter(Boolean).join(' ').toLowerCase();

      let keywordScore = 0;
      let hits = 0;
      for (const kw of icpKeywords) {
        if (text.includes(kw)) { keywordScore += W_KEYWORD; hits += 1; }
      }
      if (keywordScore > W_KEYWORD_CAP) keywordScore = W_KEYWORD_CAP;

      const industryHit = t.industry_id && industrySet.has(String(t.industry_id).toLowerCase());
      const recBoost = t.is_recommended ? W_RECOMMENDED : 0;
      const popBoost = Math.min(5, (Number(t.popularity_score) || 0) * W_POPULARITY);

      const score = keywordScore + (industryHit ? W_INDUSTRY : 0) + recBoost + popBoost;
      if (score > 0) ranking[t.id] = { score: Math.round(score), forYou: hits > 0 };
    }

    return ranking;
  }
}

export default new IcpRankingService();
