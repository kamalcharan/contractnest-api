// ============================================================================
// Contract Composer Service — VaNi Phase 1.2 (per-step pipeline)
// ============================================================================
// Purpose: intent text → reviewable contract draft, exposed as FIVE stateless
// steps so the VaNi Canvas can show each card the moment its work truly
// completes (no simulated progress — retro rule):
//
//   1. parseIntentOnly   LLM     free text → intent + nomenclature (closed list)
//   2. resolveBuyer      code    contacts lookup → resolved/ambiguous/not_found
//   3. buildShortlist    code    catalog scan → ≤24 ranked candidates
//   4. selectBlocks      LLM     candidates → selection + gap flags
//   5. assembleDraft     code    prices/totals, calendar, assets & coverage,
//                                evidence, readiness → wizard-compatible draft
//
// Stateless between steps: the client carries intent/buyer/candidates/
// selections forward; every step re-validates what it receives. The
// template-match tier (p1.3) will slot between steps 2 and 3.
//
// The composer NEVER writes a contract. Finalization goes through the same
// createContract path the wizard uses (useContractSubmission on the UI).
// ============================================================================

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { catBlocksService } from './catBlocksService';
import { catTemplatesService } from './catTemplatesService';
import { taxSettingsService } from './taxSettingsService';
import ContactService from './contactService';
import ProductMasterdataService from './productMasterdataService';
import resourcesService from './resourcesService';
import { clientAssetRegistryService } from './clientAssetRegistryService';
import vaniInteractionLogger from './vaniInteractionLogger';
import vaniLLMClient from './vaniLLMClient';
import {
  deriveComputedEvents,
  DerivationBlock,
  durationToDays,
} from './contractEventsDerivationService';
import { RequestContext } from '../types/catalogStudioTypes';

// ─── Types ───

export interface ComposerCallContext {
  tenantId: string;
  userId: string;
  userJWT: string;
  environment: string; // 'live' | 'test'
}

export interface ParsedIntent {
  contract_kind: string;
  nomenclature: string;
  buyer_text: string;
  duration: { value: number; unit: 'days' | 'months' | 'years' };
  start_date: string;
  grace_period_days: number;
  acceptance: 'payment' | 'signoff' | 'auto' | '';
  billing: { mode: 'prepaid' | 'emi' | 'per_block'; emi_months: number; cycle: string };
  equipment_hint: string;
  activities: string[];
  special_asks: string[];
}

export interface NomenclatureItem {
  id: string;
  name: string;
  group: string;
  /** Industries this contract type applies to (from form_settings.industries) */
  industries?: string[];
}

export interface BuyerResolution {
  status: 'resolved' | 'ambiguous' | 'not_found';
  contact?: { id: string; name: string };
  candidates?: Array<{ id: string; name: string; company_name?: string }>;
}

/** Step 1 result */
export interface ParseStepResult {
  intent: ParsedIntent;
  nomenclatureMatch: NomenclatureItem | null;
  interactionId: string;
}

/** Compact candidate payload carried between steps 3 → 4 → 5 */
export interface CandidatePayload {
  key: string;             // 'B1'...
  block_id: string;
  name: string;
  description: string;
  activity: string;
  cycle_days: number;
  /** Saved billing cycle for this block (template path); '' = fall back to intent */
  cycle?: string;
  price: number;
  currency: string;
  tax_rate: number;
  form_template_id: string | null;
  equipment: string;
  icon: string;
}

/** Step 3 result */
export interface ShortlistStepResult {
  candidates: CandidatePayload[];
  scannedCount: number;
}

/** Template tier — a signed-off template that answers the request */
export interface TemplateMatch {
  template_id: string;
  name: string;
  score: number;
  reasons: string[];
  category: string | null;
  total: number | null;
  currency: string;
  blocks_count: number;
}

/** Template-match step result */
export interface TemplateMatchStepResult {
  match: TemplateMatch | null;
  considered: number;
  /** Set when the server quick-parsed the raw text (no LLM parse needed) */
  quickIntent: ParsedIntent | null;
  nomenclatureMatch: NomenclatureItem | null;
}

/** Step 4 result */
export interface SelectStepResult {
  selections: Array<{ block_id: string; quantity: number; reason: string }>;
  gaps: ComposedGap[];
  summary: string;
  interactionId: string;
}

export interface ComposedGap {
  severity: 'warning' | 'info';
  message: string;
}

export interface PrefillBlock {
  id: string;
  name: string;
  description: string;
  icon: string;
  quantity: number;
  cycle: string;
  customCycleDays?: number;
  serviceCycleDays?: number;
  unlimited: boolean;
  price: number;
  currency: string;
  totalPrice: number;
  categoryName: string;
  categoryColor: string;
  categoryId?: string;
  isFlyBy: boolean;
  taxRate?: number;
  taxInclusion?: 'inclusive' | 'exclusive';
  taxes: Array<{ id: string; name: string; rate: number }>;
  config: { showDescription?: boolean; notes?: string };
}

export interface PrefillEquipmentDetail {
  id: string;
  asset_registry_id: string | null;
  added_by_tenant_id: string;
  added_by_role: 'seller' | 'buyer';
  resource_type: 'equipment' | 'entity';
  category_id: string | null;
  category_name: string;
  item_name: string;
  quantity: number;
  make: string;
  model: string;
  serial_number: string;
  condition: string;
  criticality: string;
  location: string;
  purchase_date: string;
  warranty_expiry: string;
  area_sqft: string;
  dimensions: string;
  capacity: string;
  specifications: Record<string, any>;
  notes: string;
}

export interface PrefillCoverageType {
  id: string;
  sub_category: string;
  resource_id: string;
  resource_name: string;
}

export interface StepReadiness {
  id: string;
  label: string;
  ready: boolean;
  note?: string;
}

export interface ComposeResult {
  draft: {
    contractName: string;
    buyerId: string;
    buyerName: string;
    nomenclatureId: string | null;
    nomenclatureName: string | null;
    nomenclatureGroup: string | null;
    acceptanceMethod: 'payment' | 'signoff' | 'auto';
    startDate?: string;
    durationValue: number;
    durationUnit: string;
    gracePeriodValue: number;
    gracePeriodUnit: string;
    currency: string;
    paymentMode: 'prepaid' | 'emi' | 'defined';
    emiMonths: number;
    billingCycleType: 'unified' | 'mixed';
    perBlockPaymentType: Record<string, 'prepaid' | 'postpaid'>;
    selectedBlocks: PrefillBlock[];
    equipmentDetails: PrefillEquipmentDetail[];
    allowBuyerToAdd: boolean;
    coverageTypes: PrefillCoverageType[];
    evidencePolicyType: 'none' | 'upload' | 'smart_form';
    evidenceSelectedForms: Array<{ form_template_id: string; name: string; version: number; category: string; sort_order: number }>;
    description: string;
    // Totals (server-computed so the canvas can finalize without the billing step)
    totalValue: number;
    baseSubtotal: number;
    taxTotal: number;
    grandTotal: number;
    selectedTaxRateIds: string[];
    taxBreakdown: Array<{ tax_rate_id: string; name: string; rate: number; amount: number }>;
  };
  vani: {
    summary: string;
    gaps: ComposedGap[];
    blockReasons: Record<string, string>;
  };
  readiness: {
    steps: StepReadiness[];
    readyCount: number;
    totalCount: number;
    needsYou: string[];
  };
  eventsPreview: {
    serviceEvents: number;
    billingEvents: number;
    estimatedTotal: number;
  };
}

const MAX_CANDIDATES = 24;
const MAX_SELECTED_BLOCKS = 8;
const MAX_BLOCK_PAGES = 10;
const VALID_ACTIVITIES = ['pm', 'inspection', 'repair', 'install', 'decommission', 'spare_part'];
const ASSET_GROUPS = new Set(['equipment_maintenance', 'facility_property']);

// ─── Service ───

class ContractComposerService {
  private contactService = new ContactService();
  private masterdataService = new ProductMasterdataService();

  private loadSkill(fileName: string, replacements: Record<string, string>): string {
    const skillPath = path.join(process.cwd(), 'src', 'skills', fileName);
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill file not found at: ${skillPath}`);
    }
    let content = fs.readFileSync(skillPath, 'utf-8');
    for (const [token, value] of Object.entries(replacements)) {
      content = content.split(token).join(value);
    }
    return content;
  }

  private toCatalogContext(ctx: ComposerCallContext): RequestContext {
    return {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      product: 'contractnest',
      isAdmin: false,
      environment: (ctx.environment === 'test' ? 'test' : 'live'),
      accessToken: ctx.userJWT,
    };
  }

  private supabaseRead() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  // Service-role read for tenant-scoped ICP tables (smartprofile, semantic
  // clusters, materialized resources). The composer is already tenant-guarded
  // (auth + entitlement), and every query below is filtered by ctx.tenantId,
  // so this only ever reads the calling tenant's own rows.
  private supabaseServiceRead() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  // ==========================================================================
  // ICP signal for smart chips — the tenant's REAL Smart Profile vocabulary
  // (approved keywords + semantic clusters) and their materialized resources.
  // Read-only, tenant-scoped, never throws (chips degrade to empty on any gap).
  // ==========================================================================
  async fetchTenantIcp(ctx: ComposerCallContext): Promise<{
    vocabulary: string[];
    clusters: Array<{ primary_term: string; category: string }>;
    persona: string;
    resources: Array<{ name: string; type: string }>;
    industryIds: string[];
  }> {
    const empty = { vocabulary: [] as string[], clusters: [] as Array<{ primary_term: string; category: string }>, persona: '', resources: [] as Array<{ name: string; type: string }>, industryIds: [] as string[] };
    const supabase = this.supabaseServiceRead();
    if (!supabase) return empty;
    try {
      const [profileRes, clusterRes, resourceRes, tprofRes, servedRes] = await Promise.all([
        supabase
          .from('t_tenant_smartprofiles')
          .select('approved_keywords, suggested_keywords, profile_type')
          .eq('tenant_id', ctx.tenantId)
          .eq('is_active', true)
          .limit(1),
        supabase
          .from('t_semantic_clusters')
          .select('primary_term, related_terms, category')
          .eq('tenant_id', ctx.tenantId)
          .eq('is_active', true),
        supabase
          .from('t_category_resources_master')
          .select('display_name, name, resource_type_id, sequence_no')
          .eq('tenant_id', ctx.tenantId)
          .eq('is_active', true)
          .eq('is_live', true)
          .order('sequence_no', { ascending: true })
          .limit(12),
        supabase
          .from('t_tenant_profiles')
          .select('industry_id')
          .eq('tenant_id', ctx.tenantId)
          .limit(1),
        supabase
          .from('t_tenant_served_industries')
          .select('industry_id')
          .eq('tenant_id', ctx.tenantId),
      ]);

      const profile: any = (profileRes.data || [])[0] || {};
      const clusters: any[] = clusterRes.data || [];
      const resourceRows: any[] = resourceRes.data || [];

      const industryIds = new Set<string>();
      const ownInd = (tprofRes.data || [])[0]?.industry_id;
      if (ownInd) industryIds.add(String(ownInd));
      for (const s of (servedRes.data || [])) if (s.industry_id) industryIds.add(String(s.industry_id));

      const vocab = new Set<string>();
      for (const k of [...(profile.approved_keywords || []), ...(profile.suggested_keywords || [])]) {
        if (k) vocab.add(String(k).toLowerCase());
      }
      for (const c of clusters) {
        if (c.primary_term) vocab.add(String(c.primary_term).toLowerCase());
        for (const rt of (c.related_terms || [])) if (rt) vocab.add(String(rt).toLowerCase());
      }

      const seen = new Set<string>();
      const resources = resourceRows
        .map((r: any) => ({ name: String(r.display_name || r.name || '').trim(), type: String(r.resource_type_id || '') }))
        .filter((r) => r.name && !seen.has(r.name.toLowerCase()) && seen.add(r.name.toLowerCase()));

      return {
        vocabulary: Array.from(vocab),
        clusters: clusters
          .filter((c: any) => c.primary_term)
          .map((c: any) => ({ primary_term: String(c.primary_term), category: String(c.category || '') })),
        persona: String(profile.profile_type || ''),
        resources,
        industryIds: Array.from(industryIds),
      };
    } catch (e: any) {
      console.warn('⚠️ Composer: ICP fetch failed (chips degrade):', e.message);
      return empty;
    }
  }

  // ==========================================================================
  // ICP chips — Phase B: borrowed chips for thin/cold-start tenants.
  //   1) Curated ICP archetype (m_icp_archetypes) matched by industry / persona
  //      / vocabulary — works from day one, even with an empty profile.
  //   2) Embedding neighbours (icp_similar_tenants) — borrow the vocabulary of
  //      the most similar profiled tenants once this tenant has an embedding.
  // Both are grounded starters; they only fill slots the tenant's OWN data left
  // empty (called only when the own-data candidate pool is short).
  // ==========================================================================
  async fetchIcpBorrowedChips(
    ctx: ComposerCallContext,
    icp: { vocabulary: string[]; persona: string; industryIds: string[] }
  ): Promise<{ archetype: string[]; neighbour: string[] }> {
    const supabase = this.supabaseServiceRead();
    if (!supabase) return { archetype: [], neighbour: [] };

    const archetype: string[] = [];
    const neighbour: string[] = [];

    // 1) Archetype classification
    try {
      const { data: rows } = await supabase
        .from('m_icp_archetypes')
        .select('id, personas, industry_ids, keywords, chip_patterns, sort_order')
        .eq('is_active', true);
      const arches: any[] = rows || [];
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
      const best = arches
        .map((a) => ({ a, s: score(a) }))
        .sort((x, y) => y.s - x.s)[0];
      const chosen = best && best.s >= 0 ? best.a : arches.find((a) => a.id === 'generic_service');
      if (chosen) archetype.push(...(chosen.chip_patterns || []).map((s: string) => String(s)));
    } catch (e: any) {
      console.warn('⚠️ Composer: archetype chips failed:', e.message);
    }

    // 2) Embedding neighbours — borrow their cluster vocabulary (needs an embedding)
    try {
      const { data: sim } = await supabase.rpc('icp_similar_tenants', { p_tenant_id: ctx.tenantId, p_limit: 5 });
      const neighbourIds: string[] = (sim || []).map((r: any) => r.tenant_id).filter(Boolean);
      if (neighbourIds.length) {
        const { data: nclusters } = await supabase
          .from('t_semantic_clusters')
          .select('primary_term')
          .in('tenant_id', neighbourIds)
          .eq('is_active', true)
          .limit(20);
        const seen = new Set<string>();
        const terms = (nclusters || [])
          .map((c: any) => String(c.primary_term || '').trim())
          .filter((t: string) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
          .slice(0, 3);
        const tc = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
        for (const t of terms) neighbour.push(`1 year ${tc(t)} service package, billed quarterly`);
      }
    } catch (e: any) {
      console.warn('⚠️ Composer: neighbour chips failed:', e.message);
    }

    return { archetype, neighbour };
  }

  // ==========================================================================
  // Nomenclature helpers
  // ==========================================================================

  async fetchNomenclatures(ctx: ComposerCallContext): Promise<NomenclatureItem[]> {
    try {
      const res = await this.masterdataService.getGlobalMasterData(
        'cat_contract_nomenclature',
        true,
        ctx.userJWT
      );
      const items: any[] = Array.isArray(res?.data) ? res.data : [];
      return items
        .map((it) => ({
          id: it.id,
          name: it.form_settings?.short_name || it.display_name || it.sub_cat_name || '',
          group: it.form_settings?.group || '',
          industries: Array.isArray(it.form_settings?.industries)
            ? it.form_settings.industries.map((s: any) => String(s))
            : [],
        }))
        .filter((n) => n.id && n.name);
    } catch (e: any) {
      console.warn('⚠️ Composer: nomenclature fetch failed:', e.message);
      return [];
    }
  }

  // Smart nomenclature: keep only the contract types that fit the tenant's ICP —
  // their resource types (equipment/consumable→equipment_maintenance,
  // asset→facility_property, service or service-led→service_delivery), any
  // nomenclature whose industries overlap the tenant's, plus the always-on
  // flexible_hybrid catch-all. Falls back to the FULL list when there's no signal
  // (so a blank/new tenant still sees everything).
  relevantNomenclatures(
    nomenclatures: NomenclatureItem[],
    icp: { industryIds: string[]; resources: Array<{ type: string }>; persona: string }
  ): NomenclatureItem[] {
    const industrySet = new Set((icp.industryIds || []).map((s) => String(s).toLowerCase()));
    const types = new Set((icp.resources || []).map((r) => r.type));
    const hasHard = types.has('equipment') || types.has('consumable') || types.has('asset');

    const relevantGroups = new Set<string>(['flexible_hybrid']);
    if (types.has('equipment') || types.has('consumable')) relevantGroups.add('equipment_maintenance');
    if (types.has('asset')) relevantGroups.add('facility_property');
    if (types.has('service') || !hasHard) relevantGroups.add('service_delivery');

    const relevant = nomenclatures.filter((n) =>
      relevantGroups.has(n.group) ||
      (n.industries || []).some((i) => industrySet.has(String(i).toLowerCase()))
    );
    // Only shrink when it actually narrows things; otherwise keep the full list.
    return relevant.length > 0 && relevant.length < nomenclatures.length ? relevant : nomenclatures;
  }

  matchNomenclature(text: string, list: NomenclatureItem[]): NomenclatureItem | null {
    if (!text || list.length === 0) return null;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const needle = norm(text);
    if (!needle) return null;

    const exact = list.find((n) => norm(n.name) === needle);
    if (exact) return exact;

    const contains = list.find((n) => needle.includes(norm(n.name)) || norm(n.name).includes(needle));
    return contains || null;
  }

  // ==========================================================================
  // STEP 1 — parse intent (LLM)
  // ==========================================================================

  async parseIntentOnly(text: string, ctx: ComposerCallContext): Promise<ParseStepResult> {
    if (!vaniLLMClient.isEnabled()) {
      throw new Error('VaNi LLM is not configured (VANI_LLM_URL)');
    }

    const [nomenclaturesAll, icp] = await Promise.all([
      this.fetchNomenclatures(ctx),
      this.fetchTenantIcp(ctx).catch(() => ({ vocabulary: [], clusters: [], persona: '', resources: [], industryIds: [] } as any)),
    ]);
    // Smart nomenclature: shrink the closed list the LLM picks from to the
    // tenant's ICP-relevant contract types (faster, more accurate). Resolution
    // below still matches the FULL list, so a valid choice is never lost.
    const nomenclatures = this.relevantNomenclatures(nomenclaturesAll, icp);
    const nomenclatureLines = nomenclatures.length > 0
      ? nomenclatures.map((n) => `- ${n.name} (${n.group})`).join('\n')
      : '- (none available)';

    const systemPrompt = this.loadSkill('vani-intent-parser.md', {
      '{{NOMENCLATURES}}': nomenclatureLines,
      '{{USER_CONTEXT}}': `Today's date: ${new Date().toISOString().slice(0, 10)}.`,
    });

    const { parsed, interactionId } = await vaniInteractionLogger.loggedJSONCall<Partial<ParsedIntent>>(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        skill: 'contract_composer:intent_parse',
        contextPayload: { input_chars: text.length, nomenclature_options: nomenclatures.length },
      },
      systemPrompt,
      text,
      { maxTokens: 320 }
    );

    const intent = this.normalizeIntent(parsed);
    const nomenclatureMatch =
      this.matchNomenclature(intent.nomenclature, nomenclaturesAll) ||
      this.matchNomenclature(intent.contract_kind, nomenclaturesAll);

    return { intent, nomenclatureMatch, interactionId };
  }

  /** Clamp the LLM's output into a safe, complete ParsedIntent */
  normalizeIntent(raw: Partial<ParsedIntent>): ParsedIntent {
    const durUnit = ['days', 'months', 'years'].includes(raw.duration?.unit as string)
      ? (raw.duration!.unit as 'days' | 'months' | 'years')
      : 'years';
    const durValue = Math.max(1, Math.min(3650, Number(raw.duration?.value) || 1));

    const mode = ['prepaid', 'emi', 'per_block'].includes(raw.billing?.mode as string)
      ? raw.billing!.mode
      : 'prepaid';
    const cycle = ['monthly', 'fortnightly', 'quarterly'].includes(raw.billing?.cycle as string)
      ? raw.billing!.cycle
      : '';

    let activities = (Array.isArray(raw.activities) ? raw.activities : [])
      .filter((a) => VALID_ACTIVITIES.includes(a));
    if (activities.length === 0) activities = ['pm', 'inspection'];

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.start_date || '') ? raw.start_date! : '';
    const acceptance = ['payment', 'signoff', 'auto'].includes(raw.acceptance as string)
      ? (raw.acceptance as ParsedIntent['acceptance'])
      : '';

    return {
      contract_kind: (raw.contract_kind || 'Service Contract').slice(0, 60),
      nomenclature: (raw.nomenclature || '').slice(0, 60),
      buyer_text: (raw.buyer_text || '').slice(0, 120),
      duration: { value: durValue, unit: durUnit },
      start_date: startDate,
      grace_period_days: Math.max(0, Math.min(365, Number(raw.grace_period_days) || 0)),
      acceptance,
      billing: {
        mode: mode as ParsedIntent['billing']['mode'],
        emi_months: mode === 'emi' ? Math.max(2, Math.min(60, Number(raw.billing?.emi_months) || 12)) : 0,
        cycle: mode === 'per_block' ? (cycle || 'quarterly') : '',
      },
      equipment_hint: (raw.equipment_hint || '').slice(0, 60),
      activities,
      special_asks: (Array.isArray(raw.special_asks) ? raw.special_asks : []).slice(0, 5).map(String),
    };
  }

  // ==========================================================================
  // STEP 2 — resolve buyer (deterministic)
  // ==========================================================================

  async resolveBuyer(buyerText: string, ctx: ComposerCallContext): Promise<BuyerResolution> {
    if (!buyerText.trim()) return { status: 'not_found' };

    const result = await this.contactService.listContacts(
      { search: buyerText.trim(), per_page: 10, status: 'active' },
      ctx.userJWT,
      ctx.tenantId,
      ctx.environment
    );

    const items: any[] = Array.isArray(result?.data) ? result.data : (result?.data?.items || []);
    if (!result?.success || items.length === 0) return { status: 'not_found' };

    const norm = (s: string) => (s || '').toLowerCase().trim();
    const needle = norm(buyerText);
    const exact = items.filter(
      (c) => norm(c.name) === needle || norm(c.company_name) === needle
    );

    const pick = (c: any) => ({ id: c.id, name: c.name || c.company_name || 'Unnamed' });

    if (exact.length === 1) return { status: 'resolved', contact: pick(exact[0]) };
    if (items.length === 1) return { status: 'resolved', contact: pick(items[0]) };

    return {
      status: 'ambiguous',
      candidates: items.slice(0, 5).map((c) => ({
        id: c.id,
        name: c.name || 'Unnamed',
        company_name: c.company_name || undefined,
      })),
    };
  }

  // ==========================================================================
  // STEP 3 — shortlist (deterministic catalog scan + rank)
  // ==========================================================================

  async buildShortlist(intent: ParsedIntent, ctx: ComposerCallContext): Promise<ShortlistStepResult> {
    const allBlocks = await this.fetchTenantBlocks(ctx);
    const equipmentNames = await this.fetchResourceTemplateNames(allBlocks);

    const hintTokens = intent.equipment_hint
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1);

    const activityRank: Record<string, number> = {};
    intent.activities.forEach((a, i) => { activityRank[a] = intent.activities.length - i; });

    const scored = allBlocks
      .map((b) => {
        const activity = b.config?.kt_service_activity || '';
        if (!activity || !intent.activities.includes(activity)) return null;
        if (activity === 'spare_part' && !intent.activities.includes('spare_part')) return null;

        const equipment = equipmentNames.get(b.resource_template_id) || '';
        const haystack = `${b.name} ${equipment}`.toLowerCase();

        let score = (activityRank[activity] || 0) * 10;
        if (hintTokens.length > 0) {
          const hits = hintTokens.filter((t) => haystack.includes(t)).length;
          if (hits === 0 && equipment) score -= 15;
          score += hits * 20;
        }
        if (Number(b.base_price) > 0) score += 5;

        return { block: b, activity, equipment, score };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES);

    if (scored.length === 0) {
      throw new Error(
        'No matching service blocks found in your catalog for this request. ' +
        'Add blocks in Catalog Studio or re-seed from VaNi Seeding first.'
      );
    }

    const candidates: CandidatePayload[] = scored.map((s, i) => ({
      key: `B${i + 1}`,
      block_id: s.block.id,
      name: s.block.name,
      description: s.block.description || '',
      activity: s.activity,
      cycle_days: Number(s.block.config?.serviceCycles?.days) || 0,
      price: Number(s.block.base_price) || 0,
      currency: s.block.currency || 'INR',
      tax_rate: Number(s.block.tax_rate) || 0,
      form_template_id: s.block.form_template_id || null,
      equipment: s.equipment,
      icon: s.block.icon || 'wrench',
    }));

    return { candidates, scannedCount: allBlocks.length };
  }

  // ==========================================================================
  // TEMPLATE TIER — deterministic; templates ARE the cache
  // ==========================================================================
  // A signed-off template that answers the request skips the catalog scan
  // AND the LLM block selection entirely. Combined with quickParseIntent a
  // repeat contract runs with zero LLM calls.

  /**
   * Deterministic parse of simple requests ("1 year AMC for Kamal Industries
   * with quarterly billing"). Returns null unless BOTH a duration and a
   * nomenclature keyword are found — and callers must only trust the result
   * when a template also matches it (double confirmation).
   */
  quickParseIntent(
    text: string,
    nomenclatures: NomenclatureItem[]
  ): { intent: ParsedIntent; nomenclatureMatch: NomenclatureItem } | null {
    const lower = text.toLowerCase();

    const durMatch = lower.match(/(\d+)[\s-]*(year|month|day)s?\b/);
    const nomenclatureMatch = this.matchNomenclature(text, nomenclatures);
    if (!durMatch || !nomenclatureMatch) return null;

    // Billing: per-block cycle keywords, EMI, else prepaid
    let mode: ParsedIntent['billing']['mode'] = 'prepaid';
    let cycle = '';
    let emiMonths = 0;
    const cycleMatch = lower.match(/\b(monthly|fortnightly|quarterly)\b/);
    if (/\bemi\b|instal?lments?/.test(lower)) {
      mode = 'emi';
      const em = lower.match(/(\d+)[\s-]*(?:month\s*)?emi|emi[^0-9]{0,10}(\d+)/);
      emiMonths = Number(em?.[1] || em?.[2]) || 12;
    } else if (cycleMatch && /\bbill|payment|paid\b/.test(lower)) {
      mode = 'per_block';
      cycle = cycleMatch[1];
    }

    // Buyer: "for <Name>" up to a delimiter keyword
    const buyerMatch = text.match(
      /\bfor\s+([A-Za-z][A-Za-z0-9&.,'()\- ]{2,60}?)(?=\s+(?:with|billed|billing|starting|from|paying|and)\b|\s*[,.;]|$)/
    );

    const acceptance: ParsedIntent['acceptance'] = /sign[\s-]?off/.test(lower) ? 'signoff' : '';

    const intent = this.normalizeIntent({
      contract_kind: nomenclatureMatch.name,
      nomenclature: nomenclatureMatch.name,
      buyer_text: (buyerMatch?.[1] || '').trim(),
      duration: { value: Number(durMatch[1]), unit: `${durMatch[2]}s` as 'days' | 'months' | 'years' },
      acceptance,
      billing: { mode, emi_months: emiMonths, cycle },
    });

    return { intent, nomenclatureMatch };
  }

  /** Tokens too generic to count as evidence of a template match */
  private static MATCH_STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'contract', 'service', 'services', 'template',
    'year', 'years', 'month', 'months', 'day', 'days', 'billing', 'billed',
    'plan', 'annual', 'monthly', 'quarterly', 'new', 'per',
  ]);

  private async fetchSignedOffTemplates(ctx: ComposerCallContext): Promise<any[]> {
    const res = await catTemplatesService.listTemplates(this.toCatalogContext(ctx), {
      is_active: true,
      limit: 100,
    } as any);
    const templates: any[] = (res.data as any)?.templates || [];
    // Only tenant-owned, signed-off templates with a saved wizard state qualify
    return templates.filter((t) => {
      const s = t.settings || {};
      return (
        t.tenant_id &&
        s.lifecycle === 'signed_off' &&
        Array.isArray(s.wizard_state?.selectedBlocks) &&
        s.wizard_state.selectedBlocks.length > 0
      );
    });
  }

  private scoreTemplate(
    t: any,
    text: string,
    intent: ParsedIntent,
    nomenclatureMatch: NomenclatureItem | null
  ): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;
    const defaults = t.settings?.defaults || {};

    // Contract type: nomenclature group vs template category
    if (nomenclatureMatch && t.category && t.category === nomenclatureMatch.group) {
      score += 2;
      reasons.push('Same contract family');
    }
    if (
      defaults.nomenclature_name &&
      intent.nomenclature &&
      String(defaults.nomenclature_name).toLowerCase() === intent.nomenclature.toLowerCase()
    ) {
      score += 3;
      reasons.push(`Same contract type (${defaults.nomenclature_name})`);
    }

    // Keyword overlap: template name/tags/description vs the request text
    const textTokens = new Set(
      text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
    );
    const templateTokens = new Set(
      `${t.name} ${(t.tags || []).join(' ')} ${t.description || ''}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !ContractComposerService.MATCH_STOPWORDS.has(w))
    );
    let hits = 0;
    templateTokens.forEach((tok) => { if (textTokens.has(tok)) hits += 1; });
    if (hits > 0) {
      score += Math.min(hits, 4);
      reasons.push(`${hits} keyword match${hits > 1 ? 'es' : ''}`);
    }

    // Equipment hint (from LLM parse) against template tokens
    if (intent.equipment_hint) {
      const hintHit = intent.equipment_hint
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .some((h) => h.length > 2 && templateTokens.has(h));
      if (hintHit) {
        score += 2;
        reasons.push('Equipment matches');
      }
    }

    // Duration proximity vs template default
    const dDays = durationToDays(intent.duration.value, intent.duration.unit);
    const tDays = defaults.duration_value
      ? durationToDays(Number(defaults.duration_value), defaults.duration_unit || 'years')
      : 0;
    if (tDays > 0 && Math.abs(dDays - tDays) / tDays <= 0.15) {
      score += 2;
      reasons.push('Duration matches');
    }

    return { score, reasons };
  }

  /**
   * Match a signed-off template against the request. When `intent` is null the
   * raw text is quick-parsed first; the quick intent is only returned when a
   * template actually matched it (the double-confirmation rule).
   */
  async matchTemplate(
    text: string,
    intent: ParsedIntent | null,
    ctx: ComposerCallContext
  ): Promise<TemplateMatchStepResult> {
    const nomenclatures = await this.fetchNomenclatures(ctx);

    let quick: ParsedIntent | null = null;
    let nomenclatureMatch: NomenclatureItem | null = null;
    let effectiveIntent = intent;

    if (!effectiveIntent) {
      const qp = this.quickParseIntent(text, nomenclatures);
      if (!qp) return { match: null, considered: 0, quickIntent: null, nomenclatureMatch: null };
      effectiveIntent = qp.intent;
      quick = qp.intent;
      nomenclatureMatch = qp.nomenclatureMatch;
    } else {
      nomenclatureMatch =
        this.matchNomenclature(effectiveIntent.nomenclature, nomenclatures) ||
        this.matchNomenclature(effectiveIntent.contract_kind, nomenclatures);
    }

    const templates = await this.fetchSignedOffTemplates(ctx);
    const MATCH_THRESHOLD = 5;

    const scored = templates
      .map((t) => ({ t, ...this.scoreTemplate(t, text, effectiveIntent!, nomenclatureMatch) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const match: TemplateMatch | null =
      best && best.score >= MATCH_THRESHOLD
        ? {
            template_id: best.t.id,
            name: best.t.name,
            score: best.score,
            reasons: best.reasons,
            category: best.t.category || null,
            total: best.t.total ?? null,
            currency: best.t.currency || 'INR',
            blocks_count: (best.t.settings?.wizard_state?.selectedBlocks || []).length,
          }
        : null;

    return {
      match,
      considered: templates.length,
      // Double confirmation: only hand the quick intent back when it produced a match
      quickIntent: match ? quick : null,
      nomenclatureMatch,
    };
  }

  /**
   * Instantiate a signed-off template as a draft: template blocks become
   * synthetic candidates + selections so assembleDraft (the single assemble
   * path) does pricing, assets, evidence, events and readiness as usual.
   */
  async assembleFromTemplate(
    templateId: string,
    intent: ParsedIntent,
    buyer: { id: string; name: string } | null,
    ctx: ComposerCallContext,
    defaultCurrency?: string
  ): Promise<ComposeResult> {
    const res = await catTemplatesService.getTemplate(this.toCatalogContext(ctx), templateId);
    const t: any = (res.data as any)?.template || res.data;
    if (!res.success || !t?.id) throw new Error('Template not found');

    const settings = t.settings || {};
    if (settings.lifecycle !== 'signed_off') {
      throw new Error('Template is not signed off — sign it off on the Templates page first.');
    }
    const wizardBlocks: any[] = settings.wizard_state?.selectedBlocks || [];
    if (wizardBlocks.length === 0) throw new Error('Template has no blocks');

    const durationDays = durationToDays(intent.duration.value, intent.duration.unit);

    // Synthetic candidates from the template's saved block configs. cycle_days
    // falls back to duration/qty so assembleDraft's quantity clamp preserves —
    // or rescales, when the requested duration differs — the template's counts.
    const candidates: CandidatePayload[] = wizardBlocks.map((b: any, i: number) => {
      const qty = Math.max(1, Number(b.quantity) || 1);
      return {
        key: `T${i + 1}`,
        block_id: String(b.id),
        name: String(b.name || 'Service'),
        description: String(b.description || ''),
        activity: 'pm',
        cycle_days: Number(b.serviceCycleDays) || Math.max(1, Math.floor(durationDays / qty)),
        cycle: String(b.cycle || ''),
        price: Number(b.config?.customPrice ?? b.price) || 0,
        currency: b.currency || t.currency || 'INR',
        tax_rate: Number(b.taxRate) || 0,
        form_template_id: null,
        equipment: '',
        icon: b.icon || 'layout-template',
      };
    });

    const selections = wizardBlocks.map((b: any) => ({
      block_id: String(b.id),
      quantity: Math.max(1, Number(b.quantity) || 1),
      reason: `From template "${t.name}"`,
    }));

    // Template defaults become the baseline setup when instantiating — billing,
    // EMI, grace and acceptance carry over — but an EXPLICIT user request wins.
    const defaults = settings.defaults || {};
    const tplPay = String(defaults.payment_mode || '');
    const tplCycleType = String(defaults.billing_cycle_type || '');
    const blockCycles = wizardBlocks
      .map((b: any) => String(b.cycle || ''))
      .filter((c: string) => c && c !== 'prepaid');
    const userAskedBilling =
      intent.billing.mode === 'emi' || (intent.billing.mode === 'per_block' && !!intent.billing.cycle);

    let billing = intent.billing;
    if (!userAskedBilling && tplPay) {
      if (tplPay === 'emi' && (Number(defaults.emi_months) || 0) > 0) {
        billing = { mode: 'emi', emi_months: Number(defaults.emi_months), cycle: '' };
      } else if (tplPay === 'defined' || tplCycleType === 'mixed' || blockCycles.length > 0) {
        billing = { mode: 'per_block', emi_months: 0, cycle: blockCycles[0] || intent.billing.cycle || 'monthly' };
      } else {
        billing = { mode: 'prepaid', emi_months: 0, cycle: '' };
      }
    }

    const graceDays = Number(intent.grace_period_days) > 0
      ? intent.grace_period_days
      : (Number(defaults.grace_period_value) > 0
          ? durationToDays(Number(defaults.grace_period_value), defaults.grace_period_unit || 'days')
          : intent.grace_period_days);

    const mergedIntent: ParsedIntent = {
      ...intent,
      acceptance: intent.acceptance || (defaults.acceptance_method as ParsedIntent['acceptance']) || '',
      nomenclature: intent.nomenclature || String(defaults.nomenclature_name || ''),
      grace_period_days: graceDays,
      billing,
    };

    const result = await this.assembleDraft(
      mergedIntent,
      buyer,
      candidates,
      {
        selections,
        gaps: [],
        summary: `Instantiated from your signed-off template "${t.name}" — no AI selection needed.`,
      },
      ctx,
      defaultCurrency || t.currency
    );

    // Template-carried evidence policy wins over the generic proposal
    if (defaults.evidence_policy_type) {
      result.draft.evidencePolicyType = defaults.evidence_policy_type;
      result.draft.evidenceSelectedForms = Array.isArray(defaults.evidence_selected_forms)
        ? defaults.evidence_selected_forms
        : [];
    }

    // Template-carried CONTRACT-LEVEL tax. Wizard-authored templates put tax on
    // selected_tax_rate_ids (not per-block), which the fast path would otherwise
    // drop. Apply them to the subtotal — but ONLY when the per-block tax came out
    // zero, so we never double-count a template that already taxes per block.
    const taxRateIds: string[] = Array.isArray(defaults.selected_tax_rate_ids)
      ? defaults.selected_tax_rate_ids.filter(Boolean)
      : [];
    if (taxRateIds.length && result.draft.taxTotal === 0 && result.draft.baseSubtotal > 0) {
      try {
        const allRates = await taxSettingsService.getTaxRates(ctx.userJWT, ctx.tenantId);
        const chosen = (allRates || []).filter((r: any) => taxRateIds.includes(r.id));
        if (chosen.length) {
          const subtotal = result.draft.baseSubtotal;
          const breakdown = chosen.map((r: any) => ({
            tax_rate_id: r.id,
            name: r.name,
            rate: Number(r.rate) || 0,
            amount: Math.round(subtotal * (Number(r.rate) || 0)) / 100,
          }));
          const taxTotal = Math.round(breakdown.reduce((s, b) => s + b.amount, 0) * 100) / 100;
          result.draft.selectedTaxRateIds = chosen.map((r: any) => r.id);
          result.draft.taxBreakdown = breakdown;
          result.draft.taxTotal = taxTotal;
          result.draft.grandTotal = Math.round((subtotal + taxTotal) * 100) / 100;
        }
      } catch (e: any) {
        console.warn('⚠️ Composer: template tax-rate apply failed (tax degrades):', e.message);
      }
    }

    // Honest note when the template was built for a different duration
    const tDays = defaults.duration_value
      ? durationToDays(Number(defaults.duration_value), defaults.duration_unit || 'years')
      : 0;
    if (tDays > 0 && Math.abs(tDays - durationDays) / tDays > 0.15) {
      result.vani.gaps.push({
        severity: 'info',
        message: `Template was built for ${defaults.duration_value} ${defaults.duration_unit}; quantities were rescaled to ${intent.duration.value} ${intent.duration.unit} — review the blocks.`,
      });
    }

    return result;
  }

  // ==========================================================================
  // SMART SUGGESTIONS — deterministic helper chips for the canvas
  // ==========================================================================
  // Built from the tenant's own data, in priority order:
  //   1. published templates (chips that hit the zero-LLM fast path)
  //   2. equipment from their catalog + their nomenclature vocabulary
  //   3. service-delivery phrasing when they sell services
  // No LLM, no new tables. Empty result → the UI falls back to static chips.

  async buildSuggestions(
    mode: 'contract' | 'template',
    ctx: ComposerCallContext
  ): Promise<{ suggestions: string[] }> {
    const suggestions: string[] = [];
    const push = (text: string) => {
      const t = text.replace(/\s+/g, ' ').trim();
      if (t && !suggestions.some((x) => x.toLowerCase() === t.toLowerCase()) && suggestions.length < 4) {
        suggestions.push(t);
      }
    };

    const durText = (v: any, u: any) => {
      const val = Number(v) || 1;
      const unit = String(u || 'years').replace(/s$/, '');
      return `${val} ${unit}${val > 1 ? 's' : ''}`;
    };

    try {
      const [templates, nomenclatures, icp] = await Promise.all([
        this.fetchSignedOffTemplates(ctx).catch(() => [] as any[]),
        this.fetchNomenclatures(ctx).catch(() => [] as NomenclatureItem[]),
        this.fetchTenantIcp(ctx).catch(() => ({ vocabulary: [] as string[], clusters: [] as Array<{ primary_term: string; category: string }>, persona: '', resources: [] as Array<{ name: string; type: string }>, industryIds: [] as string[] })),
      ]);

      // ICP relevance = how many of the tenant's OWN vocabulary terms (approved
      // keywords + semantic cluster terms) a candidate contains — drives ranking
      // so the most "like their business" chip wins within each archetype.
      const icpScore = (text: string): number => {
        if (!icp.vocabulary.length || !text) return 0;
        const lc = text.toLowerCase();
        let s = 0;
        for (const term of icp.vocabulary) {
          if (term.length >= 3 && lc.includes(term)) s++;
        }
        return s;
      };
      const titleCase = (s: string) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
      const nomFor = (group: string): string => nomenclatures.find((x) => x.group === group)?.name || '';

      // Each chip is a distinct OFFERING — never a specific buyer (the buyer is
      // chosen on the composer's buyer card). We build candidates tagged by
      // ARCHETYPE, then select a DIVERSE set so the row portrays the tenant's
      // whole portfolio (their best template, an equipment AMC, a facility FMC, a
      // service package, a consulting program) instead of four look-alikes.
      type ChipCand = { text: string; archetype: string; score: number };
      const cands: ChipCand[] = [];
      const equipNom = nomFor('equipment_maintenance');
      const facNom = nomFor('facility_property');

      // Templates — whole signed-off contracts (highest trust). Billing suffix is
      // derived from the template's real blocks, never invented.
      [...templates]
        .sort((a, b) =>
          icpScore(`${b.name} ${b.settings?.defaults?.nomenclature_name || ''} ${b.category || ''}`) -
          icpScore(`${a.name} ${a.settings?.defaults?.nomenclature_name || ''} ${a.category || ''}`))
        .slice(0, 2)
        .forEach((t, i) => {
          const d = t.settings?.defaults || {};
          const kind = d.nomenclature_name || t.name;
          const dur = durText(d.duration_value || 1, d.duration_unit || 'years');
          const cyc = t.settings?.wizard_state?.selectedBlocks?.[0]?.cycle;
          const billing = ['monthly', 'fortnightly', 'quarterly'].includes(cyc)
            ? ` with ${cyc} billing`
            : d.payment_mode === 'emi' && d.emi_months ? ` on ${d.emi_months}-month EMI` : '';
          const text = mode === 'contract'
            ? `${dur} ${kind}${billing}`
            : `${dur} ${kind} based on a different scope than "${t.name}"`;
          cands.push({ text, archetype: 'template', score: 100 - i + icpScore(`${t.name} ${kind}`) });
        });

      // Resource-backed chips — the tenant's REAL materialized resources in their
      // OWN display names, top 3 per type, ranked by vocabulary overlap.
      const resourceChips = (type: string, archetype: string, base: number, phrase: (name: string) => string) => {
        icp.resources
          .filter((r) => r.type === type)
          .map((r) => ({ name: r.name, score: icpScore(r.name) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .forEach((r, i) => cands.push({ text: phrase(r.name), archetype, score: base - i + r.score }));
      };
      const eqPhrase = (n: string) => mode === 'contract'
        ? `1 year ${n} ${equipNom || 'AMC'}, billed quarterly`
        : `1 year ${n} ${equipNom || 'AMC'} with quarterly PM visits and sign-off acceptance`;
      resourceChips('equipment', 'equipment', 60, eqPhrase);
      resourceChips('consumable', 'equipment', 58, eqPhrase);
      resourceChips('asset', 'facility', 55, (n) => mode === 'contract'
        ? `1 year ${n} ${facNom || 'FMC'}, billed monthly`
        : `1 year ${n} ${facNom || 'FMC'} with monthly service visits and sign-off acceptance`);
      resourceChips('service', 'service', 52, (n) => mode === 'contract'
        ? `6 month ${n} service package, billed monthly`
        : `6 month ${n} service package with monthly reviews and sign-off acceptance`);

      // Consulting/vocabulary chip — the tenant's STRONGEST semantic clusters as a
      // program, in their own words. Real cluster terms only; sellers/both only.
      if (icp.persona !== 'buyer') {
        icp.clusters.slice(0, 2).forEach((c, i) => {
          const term = titleCase(c.primary_term);
          const text = mode === 'contract'
            ? `1 year ${term} program, billed quarterly`
            : `1 year ${term} program with quarterly reviews and sign-off acceptance`;
          cands.push({ text, archetype: 'consulting', score: 48 - i });
        });
      }

      // Phase B: when the tenant's OWN data didn't yield a full row, borrow from
      // their ICP archetype (+ embedding neighbours) — so cold-start / thin
      // tenants still get relevant, composable starters, not generic examples.
      // Scored below all own-data chips: neighbours above archetype fallback.
      if (cands.length < 4) {
        const borrowed = await this.fetchIcpBorrowedChips(ctx, icp)
          .catch(() => ({ archetype: [] as string[], neighbour: [] as string[] }));
        borrowed.neighbour.forEach((text, i) => cands.push({ text, archetype: 'borrowed', score: 30 - i }));
        borrowed.archetype.forEach((text, i) => cands.push({ text, archetype: 'archetype', score: 20 - i }));
      }

      // Diverse selection: the best of each archetype first (so the row spans the
      // tenant's portfolio), then fill any remaining slots with the next best.
      cands.sort((a, b) => b.score - a.score);
      const usedArchetypes = new Set<string>();
      for (const c of cands) {
        if (suggestions.length >= 4) break;
        if (usedArchetypes.has(c.archetype)) continue;
        usedArchetypes.add(c.archetype);
        push(c.text);
      }
      for (const c of cands) {
        if (suggestions.length >= 4) break;
        push(c.text);
      }
    } catch (e: any) {
      console.warn('⚠️ Composer: suggestions build failed:', e.message);
    }

    return { suggestions };
  }

  // ==========================================================================
  // STEP 4 — select blocks + gaps (LLM over the shortlist)
  // ==========================================================================

  async selectBlocks(
    intent: ParsedIntent,
    nomenclature: NomenclatureItem | null,
    candidates: CandidatePayload[],
    ctx: ComposerCallContext
  ): Promise<SelectStepResult> {
    if (!vaniLLMClient.isEnabled()) {
      throw new Error('VaNi LLM is not configured (VANI_LLM_URL)');
    }
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error('candidates (from the shortlist step) are required');
    }

    const durationDays = durationToDays(intent.duration.value, intent.duration.unit);
    const candidateLines = candidates
      .map((c) =>
        `${c.key} | ${c.name} | activity:${c.activity} | cycle_days:${c.cycle_days || 'one-time'} | ` +
        `price:${c.price} ${c.currency}${c.equipment ? ` | equipment:${c.equipment}` : ''}`
      )
      .join('\n');

    const templateContext = await this.buildTemplateContext(ctx);

    const systemPrompt = this.loadSkill('vani-block-composer.md', {
      '{{CONTRACT_KIND}}': nomenclature ? `${nomenclature.name} (${nomenclature.group})` : intent.contract_kind,
      '{{DURATION}}': `${intent.duration.value} ${intent.duration.unit}`,
      '{{DURATION_DAYS}}': String(durationDays),
      '{{EQUIPMENT}}': intent.equipment_hint || 'not specified',
      '{{MAX_BLOCKS}}': String(MAX_SELECTED_BLOCKS),
      '{{TEMPLATE_CONTEXT}}': templateContext,
      '{{CANDIDATES}}': candidateLines,
    });

    const userMessage =
      `Compose the contract. Special asks: ${intent.special_asks.join('; ') || 'none'}.`;

    const { parsed, interactionId } = await vaniInteractionLogger.loggedJSONCall<{
      selected?: Array<{ key: string; quantity: number; reason?: string }>;
      gaps?: Array<{ severity?: string; message?: string }>;
      summary?: string;
    }>(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        skill: 'contract_composer:block_select',
        contextPayload: {
          contract_kind: intent.contract_kind,
          nomenclature: nomenclature?.name || null,
          equipment: intent.equipment_hint,
          activities: intent.activities,
          candidate_count: candidates.length,
        },
      },
      systemPrompt,
      userMessage,
      { maxTokens: 500, timeoutMs: 240000 }
    );

    const byKey = new Map(candidates.map((c) => [c.key.toUpperCase(), c]));
    const selections = (parsed.selected || [])
      .map((s) => {
        const cand = byKey.get(String(s.key).toUpperCase());
        if (!cand) return null;
        const cycleQty = cand.cycle_days
          ? Math.max(1, Math.floor(durationDays / cand.cycle_days))
          : 1;
        const qty = Math.max(1, Math.min(Number(s.quantity) || cycleQty, Math.max(cycleQty, 1)));
        return { block_id: cand.block_id, quantity: qty, reason: (s.reason || '').slice(0, 120) };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .slice(0, MAX_SELECTED_BLOCKS);

    if (selections.length === 0) {
      throw new Error('VaNi could not compose a block selection for this request — try rephrasing.');
    }

    const gaps: ComposedGap[] = (parsed.gaps || [])
      .filter((g) => g && g.message)
      .slice(0, 6)
      .map((g) => ({
        severity: g.severity === 'warning' ? 'warning' : 'info',
        message: String(g.message).slice(0, 200),
      }));

    return {
      selections,
      gaps,
      summary: (parsed.summary || 'Draft composed from your catalog.').slice(0, 400),
      interactionId,
    };
  }

  // ==========================================================================
  // STEP 5 — assemble the wizard-compatible draft (deterministic)
  // ==========================================================================

  async assembleDraft(
    intent: ParsedIntent,
    buyer: { id: string; name: string } | null,
    candidates: CandidatePayload[],
    selection: Pick<SelectStepResult, 'selections' | 'gaps' | 'summary'>,
    ctx: ComposerCallContext,
    /** Tenant default currency (UI-supplied); contract currency unless blocks force otherwise */
    defaultCurrency?: string
  ): Promise<ComposeResult> {
    // Nomenclature: re-resolve server-side (source of truth)
    const nomenclatures = await this.fetchNomenclatures(ctx);
    const nomenclature =
      this.matchNomenclature(intent.nomenclature, nomenclatures) ||
      this.matchNomenclature(intent.contract_kind, nomenclatures);
    const isAssetGroup = !!nomenclature && ASSET_GROUPS.has(nomenclature.group);

    const durationDays = durationToDays(intent.duration.value, intent.duration.unit);
    const byId = new Map(candidates.map((c) => [c.block_id, c]));

    const perBlock = intent.billing.mode === 'per_block';
    const perBlockPaymentType: Record<string, 'prepaid' | 'postpaid'> = {};
    const blockReasons: Record<string, string> = {};

    const selectedBlocks: PrefillBlock[] = selection.selections
      .map((s) => {
        const cand = byId.get(s.block_id);
        if (!cand) return null;
        const cycleQty = cand.cycle_days
          ? Math.max(1, Math.floor(durationDays / cand.cycle_days))
          : 1;
        const qty = Math.max(1, Math.min(Number(s.quantity) || cycleQty, Math.max(cycleQty, 1)));

        // Template blocks carry their own saved cycle; LLM candidates fall back
        // to the request's cycle (or prepaid for non-per-block billing).
        const cycle = perBlock ? (cand.cycle || intent.billing.cycle || 'monthly') : 'prepaid';
        if (perBlock) perBlockPaymentType[cand.block_id] = 'postpaid';
        blockReasons[cand.block_id] = s.reason;

        return {
          id: cand.block_id,
          name: cand.name,
          description: cand.description,
          icon: cand.icon,
          quantity: qty,
          cycle,
          serviceCycleDays: cand.cycle_days || undefined,
          unlimited: false,
          price: cand.price,
          currency: cand.currency,
          totalPrice: Math.round(cand.price * qty * 100) / 100,
          categoryName: 'Service',
          categoryColor: '#3B82F6',
          categoryId: 'service',
          isFlyBy: false,
          taxRate: cand.tax_rate,
          taxInclusion: 'exclusive' as const,
          taxes: [],
          config: { showDescription: false, notes: s.reason || undefined },
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    if (selectedBlocks.length === 0) {
      throw new Error('Selections did not match the shortlist — rerun the shortlist step.');
    }

    // Contract currency: tenant default wins; block-price currency mismatches
    // are flagged, never silently converted.
    const blockCurrency = selectedBlocks[0]?.currency || 'INR';
    const currency = (defaultCurrency || '').trim().toUpperCase() || blockCurrency;
    const mismatched = Array.from(new Set(
      selectedBlocks.map((b) => b.currency).filter((c) => c && c !== currency)
    ));

    // Totals (server-side, so the canvas review can finalize without the
    // wizard's billing step; taxInclusion is 'exclusive' for catalog prices)
    const baseSubtotal = Math.round(selectedBlocks.reduce((s, b) => s + b.price * b.quantity, 0) * 100) / 100;
    const taxTotal = Math.round(selectedBlocks.reduce(
      (s, b) => s + (b.price * b.quantity * (b.taxRate || 0)) / 100, 0
    ) * 100) / 100;
    const grandTotal = Math.round((baseSubtotal + taxTotal) * 100) / 100;

    // Assets & coverage
    const gaps: ComposedGap[] = [];
    if (mismatched.length > 0) {
      gaps.push({
        severity: 'warning',
        message: `Some blocks are priced in ${mismatched.join('/')} but the contract currency is ${currency} — prices are not converted; review pricing.`,
      });
    }
    let equipmentDetails: PrefillEquipmentDetail[] = [];
    let coverageTypes: PrefillCoverageType[] = [];
    let allowBuyerToAdd = false;

    if (isAssetGroup) {
      const assetInfo = await this.buildAssetPrefill(buyer, nomenclature!, candidates, selection.selections, ctx);
      equipmentDetails = assetInfo.equipmentDetails;
      coverageTypes = assetInfo.coverageTypes;
      allowBuyerToAdd = assetInfo.allowBuyerToAdd;
      gaps.push(...assetInfo.gaps);
    }

    // Evidence proposal
    const selectedCandidates = selection.selections
      .map((s) => byId.get(s.block_id))
      .filter((c): c is CandidatePayload => !!c);
    const evidence = await this.buildEvidenceProposal(selectedCandidates, isAssetGroup);

    // Acceptance
    const acceptanceMethod = intent.acceptance || 'signoff';
    if (!intent.acceptance) {
      gaps.push({
        severity: 'info',
        message: 'Acceptance defaulted to Sign-off (buyer approves) — change it if needed.',
      });
    }

    gaps.push(...selection.gaps);

    // Forward calendar (Phase-0 derivation — parity with wizard)
    const derivationBlocks: DerivationBlock[] = selectedBlocks.map((blk) => ({
      id: blk.id,
      name: blk.name,
      categoryId: 'service',
      quantity: blk.quantity,
      cycle: blk.cycle,
      serviceCycleDays: blk.serviceCycleDays,
      unlimited: false,
      currency: blk.currency,
      totalPrice: blk.totalPrice,
    }));

    const events = deriveComputedEvents({
      startDate: intent.start_date ? new Date(intent.start_date) : new Date(),
      durationValue: intent.duration.value,
      durationUnit: intent.duration.unit,
      selectedBlocks: derivationBlocks,
      paymentMode: intent.billing.mode === 'per_block' ? 'defined' : intent.billing.mode,
      emiMonths: intent.billing.emi_months,
      perBlockPaymentType,
      billingCycleType: perBlock ? 'mixed' : 'unified',
      grandTotal,
      currency,
    }) || [];

    const readiness = this.buildReadiness({
      nomenclature,
      buyerResolved: !!buyer,
      isAssetGroup,
      coverageCount: coverageTypes.length,
      blocksCount: selectedBlocks.length,
      acceptanceDefaulted: !intent.acceptance,
      evidenceType: evidence.evidencePolicyType,
    });

    const durText = `${intent.duration.value} ${intent.duration.unit === 'years' && intent.duration.value === 1 ? 'Year' : intent.duration.unit}`;
    const kindLabel = nomenclature?.name || intent.contract_kind;
    const buyerLabel = buyer?.name || intent.buyer_text || 'New Client';

    return {
      draft: {
        contractName: `${kindLabel} — ${buyerLabel} — ${durText}`,
        buyerId: buyer?.id || '',
        buyerName: buyer?.name || '',
        nomenclatureId: nomenclature?.id || null,
        nomenclatureName: nomenclature?.name || null,
        nomenclatureGroup: nomenclature?.group || null,
        acceptanceMethod,
        startDate: intent.start_date || undefined,
        durationValue: intent.duration.value,
        durationUnit: intent.duration.unit,
        gracePeriodValue: intent.grace_period_days,
        gracePeriodUnit: 'days',
        currency,
        paymentMode: intent.billing.mode === 'per_block' ? 'defined' : intent.billing.mode,
        emiMonths: intent.billing.emi_months,
        billingCycleType: perBlock ? 'mixed' : 'unified',
        perBlockPaymentType,
        selectedBlocks,
        equipmentDetails,
        allowBuyerToAdd,
        coverageTypes,
        evidencePolicyType: evidence.evidencePolicyType,
        evidenceSelectedForms: evidence.forms,
        description: selection.summary,
        totalValue: baseSubtotal,
        baseSubtotal,
        taxTotal,
        grandTotal,
        selectedTaxRateIds: [],
        taxBreakdown: [],
      },
      vani: {
        summary: selection.summary,
        gaps,
        blockReasons,
      },
      readiness,
      eventsPreview: {
        serviceEvents: events.filter((e) => e.event_type === 'service').length,
        billingEvents: events.filter((e) => e.event_type === 'billing').length,
        estimatedTotal: grandTotal,
      },
    };
  }

  // ==========================================================================
  // Feedback passthrough
  // ==========================================================================

  recordFeedback(
    interactionIds: string[],
    feedback: { wasAccepted?: boolean; wasEdited?: boolean; userRating?: number }
  ): void {
    for (const id of interactionIds) {
      if (id) vaniInteractionLogger.recordFeedback(id, feedback);
    }
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  private async buildAssetPrefill(
    buyer: { id: string; name: string } | null,
    nomenclature: NomenclatureItem,
    candidates: CandidatePayload[],
    selections: Array<{ block_id: string }>,
    ctx: ComposerCallContext
  ): Promise<{
    equipmentDetails: PrefillEquipmentDetail[];
    coverageTypes: PrefillCoverageType[];
    allowBuyerToAdd: boolean;
    gaps: ComposedGap[];
  }> {
    const gaps: ComposedGap[] = [];
    const isFacility = nomenclature.group === 'facility_property';
    const resourceTypeId = isFacility ? 'asset' : 'equipment';
    const authHeader = `Bearer ${ctx.userJWT}`;

    let resources: any[] = [];
    try {
      resources = await resourcesService.getAllResources(authHeader, ctx.tenantId);
      resources = resources.filter((r: any) => r.resource_type_id === resourceTypeId && r.is_active !== false);
    } catch (e: any) {
      console.warn('⚠️ Composer: resources fetch failed:', e.message);
    }

    let assets: any[] = [];
    if (buyer) {
      try {
        const res = await clientAssetRegistryService.listAssets(authHeader, ctx.tenantId, {
          contact_id: buyer.id,
          resource_type_id: resourceTypeId,
          limit: 200,
        });
        assets = Array.isArray(res?.data) ? res.data : (res?.data?.items || []);
      } catch (e: any) {
        console.warn('⚠️ Composer: client assets fetch failed:', e.message);
      }
    }

    const coverageMap = new Map<string, PrefillCoverageType>();
    const addCoverage = (r: any) => {
      if (r && !coverageMap.has(r.id)) {
        coverageMap.set(r.id, {
          id: r.id,
          sub_category: r.sub_category || '',
          resource_id: r.id,
          resource_name: r.display_name || r.name || 'Resource',
        });
      }
    };
    for (const asset of assets) {
      addCoverage(resources.find((r: any) => r.id === asset.asset_type_id));
    }

    const norm = (s: string) => (s || '').toLowerCase();
    const selectedIds = new Set(selections.map((s) => s.block_id));
    const equipmentNames = Array.from(new Set(
      candidates.filter((c) => selectedIds.has(c.block_id)).map((c) => c.equipment).filter(Boolean)
    ));
    for (const eq of equipmentNames) {
      const eqTokens = norm(eq).split(/[^a-z0-9]+/).filter((t) => t.length > 2);
      const match = resources.find((r: any) => {
        const hay = norm(`${r.name} ${r.display_name}`);
        return eqTokens.some((t) => hay.includes(t));
      });
      addCoverage(match);
    }

    const equipmentDetails: PrefillEquipmentDetail[] = assets.slice(0, 50).map((a: any) => ({
      id: a.id,
      asset_registry_id: a.id,
      added_by_tenant_id: ctx.tenantId,
      added_by_role: 'seller' as const,
      resource_type: isFacility ? ('entity' as const) : ('equipment' as const),
      category_id: a.asset_type_id || null,
      category_name: resources.find((r: any) => r.id === a.asset_type_id)?.display_name || '',
      item_name: a.name || 'Asset',
      quantity: 1,
      make: a.make || '',
      model: a.model || '',
      serial_number: a.serial_number || '',
      condition: a.condition || '',
      criticality: a.criticality || '',
      location: typeof a.location === 'string' ? a.location : '',
      purchase_date: a.purchase_date || '',
      warranty_expiry: a.warranty_expiry || '',
      area_sqft: a.area_sqft ? String(a.area_sqft) : '',
      dimensions: a.dimensions ? String(a.dimensions) : '',
      capacity: a.capacity ? String(a.capacity) : '',
      specifications: a.specifications || {},
      notes: '',
    }));

    let allowBuyerToAdd = false;
    if (buyer && assets.length === 0) {
      allowBuyerToAdd = true;
      gaps.push({
        severity: 'warning',
        message: `${buyer.name} has no registered ${isFacility ? 'facility assets' : 'equipment'} — 'buyer can add equipment' was enabled. Register their assets for precise coverage.`,
      });
    }
    if (coverageMap.size === 0) {
      gaps.push({
        severity: 'warning',
        message: 'No coverage types could be derived — pick at least one in the Assets step (it is required).',
      });
    }

    return {
      equipmentDetails,
      coverageTypes: Array.from(coverageMap.values()),
      allowBuyerToAdd,
      gaps,
    };
  }

  private async buildEvidenceProposal(
    selectedCandidates: CandidatePayload[],
    isAssetGroup: boolean
  ): Promise<{
    evidencePolicyType: 'none' | 'upload' | 'smart_form';
    forms: Array<{ form_template_id: string; name: string; version: number; category: string; sort_order: number }>;
  }> {
    const formIds = Array.from(new Set(
      selectedCandidates.map((c) => c.form_template_id).filter((id): id is string => !!id)
    ));

    if (formIds.length > 0) {
      try {
        const supabase = this.supabaseRead();
        if (supabase) {
          const { data, error } = await supabase
            .from('m_form_templates')
            .select('id, name, category, version')
            .in('id', formIds);
          if (!error && data && data.length > 0) {
            return {
              evidencePolicyType: 'smart_form',
              forms: data.map((f: any, i: number) => ({
                form_template_id: f.id,
                name: f.name || 'Checklist',
                version: Number(f.version) || 1,
                category: f.category || '',
                sort_order: i,
              })),
            };
          }
        }
      } catch (e: any) {
        console.warn('⚠️ Composer: form template lookup failed:', e.message);
      }
    }

    return { evidencePolicyType: isAssetGroup ? 'upload' : 'none', forms: [] };
  }

  private buildReadiness(input: {
    nomenclature: NomenclatureItem | null;
    buyerResolved: boolean;
    isAssetGroup: boolean;
    coverageCount: number;
    blocksCount: number;
    acceptanceDefaulted: boolean;
    evidenceType: string;
  }): ComposeResult['readiness'] {
    const steps: StepReadiness[] = [
      { id: 'path', label: 'Path', ready: true },
      {
        id: 'nomenclature', label: 'Contract Type',
        ready: !!input.nomenclature,
        note: input.nomenclature ? input.nomenclature.name : 'Pick the contract type',
      },
      {
        id: 'acceptance', label: 'Acceptance',
        ready: true,
        note: input.acceptanceDefaulted ? 'Defaulted to Sign-off' : undefined,
      },
      {
        id: 'counterparty', label: 'Buyer',
        ready: input.buyerResolved,
        note: input.buyerResolved ? undefined : 'Select or create the buyer',
      },
      { id: 'details', label: 'Details', ready: true },
      ...(input.isAssetGroup
        ? [{
            id: 'assetSelection', label: 'Assets & Coverage',
            ready: input.coverageCount > 0,
            note: input.coverageCount > 0
              ? `${input.coverageCount} coverage type(s)`
              : 'Pick at least one coverage type (required)',
          }]
        : []),
      { id: 'billingCycle', label: 'Billing Cycle', ready: true },
      { id: 'blocks', label: 'Service Blocks', ready: input.blocksCount > 0 },
      { id: 'billingView', label: 'Billing View', ready: true },
      {
        id: 'evidencePolicy', label: 'Evidence',
        ready: true,
        note: input.evidenceType === 'smart_form' ? 'Smart forms proposed' : undefined,
      },
      { id: 'events', label: 'Events Preview', ready: true },
      { id: 'review', label: 'Review & Send', ready: true },
    ];

    const needsYou = steps.filter((s) => !s.ready).map((s) => s.note || s.label);
    return {
      steps,
      readyCount: steps.filter((s) => s.ready).length,
      totalCount: steps.length,
      needsYou,
    };
  }

  private async fetchTenantBlocks(ctx: ComposerCallContext): Promise<any[]> {
    const catalogCtx = this.toCatalogContext(ctx);
    const blocks: any[] = [];

    for (let page = 1; page <= MAX_BLOCK_PAGES; page++) {
      const res = await catBlocksService.listBlocks(catalogCtx, {
        is_active: true,
        page,
        limit: 100,
      } as any);
      if (!res.success || !res.data) break;

      const pageBlocks: any[] = (res.data as any).blocks || [];
      blocks.push(...pageBlocks);

      const total = (res.data as any).total ?? blocks.length;
      if (blocks.length >= total || pageBlocks.length === 0) break;
    }
    return blocks;
  }

  private async fetchResourceTemplateNames(blocks: any[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const ids = Array.from(
      new Set(blocks.map((b) => b.resource_template_id).filter(Boolean))
    );
    if (ids.length === 0) return map;

    try {
      const supabase = this.supabaseRead();
      if (!supabase) return map;
      const { data, error } = await supabase
        .from('m_catalog_resource_templates')
        .select('id, name')
        .in('id', ids);
      if (!error && data) {
        for (const row of data) map.set(row.id, row.name);
      }
    } catch (e: any) {
      console.warn('⚠️ Composer: resource template lookup failed (ranking degrades):', e.message);
    }
    return map;
  }

  /** Resource names WITH their type — facilities must not be phrased as AMC */
  private async fetchResourceInfo(blocks: any[]): Promise<Array<{ name: string; type: string }>> {
    const ids = Array.from(new Set(blocks.map((b) => b.resource_template_id).filter(Boolean)));
    if (ids.length === 0) return [];
    try {
      const supabase = this.supabaseRead();
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('m_catalog_resource_templates')
        .select('id, name, resource_type_id')
        .in('id', ids);
      if (error || !data) return [];
      const seen = new Set<string>();
      return data
        .filter((r: any) => r.name && !seen.has(r.name) && seen.add(r.name))
        .map((r: any) => ({ name: r.name, type: r.resource_type_id || 'equipment' }));
    } catch {
      return [];
    }
  }

  private async buildTemplateContext(ctx: ComposerCallContext): Promise<string> {
    try {
      const res = await catTemplatesService.listTemplates(this.toCatalogContext(ctx), {
        is_active: true,
        limit: 10,
      } as any);
      const templates: any[] = (res.data as any)?.templates || [];
      if (templates.length === 0) {
        return 'Seller templates: none saved yet (cold start — compose from candidates alone).';
      }
      return (
        'Seller templates (names only, for context):\n' +
        templates.map((t) => `- ${t.name}`).join('\n')
      );
    } catch {
      return 'Seller templates: unavailable.';
    }
  }
}

export const contractComposerService = new ContractComposerService();
export default contractComposerService;
