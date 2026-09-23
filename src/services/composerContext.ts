// Shared context for the EXISTING composer. No drafting, pricing or event engine here.
import { createClient } from '@supabase/supabase-js';

export type Relationship = 'client' | 'partner' | 'vendor';
export type Workflow = 'contract' | 'template' | 'rfq';
export interface ComposerContext {
  tenantId: string;
  userId: string;
  userJWT: string;
  environment: 'live' | 'test';
  workflow: Workflow;
  relationship: Relationship | null;
}
export class ComposerContextError extends Error {
  constructor(public code: string, message: string, public status = 422, public details?: unknown) {
    super(message);
    this.name = 'ComposerContextError';
  }
}
const verified = new WeakSet<object>();
export function assertVerifiedContext(ctx: ComposerContext): void {
  if (!verified.has(ctx)) throw new ComposerContextError('UNVERIFIED_CONTEXT', 'Workspace access must be verified.', 403);
}
export function contextDatabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ComposerContextError('CONTEXT_UNAVAILABLE', 'Workspace context is unavailable. Please retry.', 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Call only after authentication. A supplied tenant header is NOT authorization. */
export async function verifyComposerContext(
  input: { tenantId: unknown; userId: unknown; userJWT: string; environment: unknown; expected?: any; infoOnly?: boolean },
  database = contextDatabase
): Promise<ComposerContext> {
  if (typeof input.tenantId !== 'string' || !uuid.test(input.tenantId))
    throw new ComposerContextError('INVALID_TENANT', 'A valid workspace is required.', 400);
  if (typeof input.userId !== 'string' || !uuid.test(input.userId))
    throw new ComposerContextError('UNAUTHENTICATED', 'Sign in again.', 401);
  if (input.environment !== 'live' && input.environment !== 'test')
    throw new ComposerContextError('INVALID_ENVIRONMENT', 'Choose Live or Test explicitly.', 400);
  const scope = input.expected;
  if (!input.infoOnly && (!scope || scope.tenantId !== input.tenantId || scope.environment !== input.environment))
    throw new ComposerContextError('CONTEXT_CHANGED', 'Workspace or Live/Test changed. Reopen VaNi and start again.', 409);
  if (!input.infoOnly && !['contract', 'template', 'rfq'].includes(scope.workflow))
    throw new ComposerContextError('INVALID_WORKFLOW', 'Choose the drafting workflow.', 400);
  if (scope?.relationship != null && !['client', 'partner', 'vendor'].includes(scope.relationship))
    throw new ComposerContextError('INVALID_RELATIONSHIP', 'Choose Client, Partner or Vendor.', 400);
  const { data, error } = await database().from('t_user_tenants')
    .select('id').eq('user_id', input.userId).eq('tenant_id', input.tenantId).eq('status', 'active').maybeSingle();
  if (error) throw new ComposerContextError('CONTEXT_UNAVAILABLE', 'Could not verify workspace membership. Nothing was composed.', 503);
  if (!data) throw new ComposerContextError('TENANT_ACCESS_DENIED', 'You do not have active access to this workspace.', 403);
  const ctx: ComposerContext = {
    tenantId: input.tenantId, userId: input.userId, userJWT: input.userJWT,
    environment: input.environment, workflow: scope?.workflow || 'contract', relationship: scope?.relationship || null,
  };
  verified.add(ctx);
  return ctx;
}
export function requireRelationship(ctx: ComposerContext): Relationship {
  assertVerifiedContext(ctx);
  if (!ctx.relationship) throw new ComposerContextError('RELATIONSHIP_REQUIRED', 'Choose Client, Partner or Vendor before selecting a contact.');
  return ctx.relationship;
}
export function contextWithRelationship(ctx: ComposerContext, relationship: Relationship): ComposerContext {
  assertVerifiedContext(ctx);
  if (!['client', 'partner', 'vendor'].includes(relationship))
    throw new ComposerContextError('INVALID_RELATIONSHIP', 'Choose Client, Partner or Vendor.', 400);
  const scoped = { ...ctx, relationship };
  verified.add(scoped);
  return scoped;
}
export function classificationsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map(v => typeof v === 'string' ? v : v?.classification_value)
    .filter((v): v is string => typeof v === 'string').map(v => v.trim().toLowerCase())));
}

/** Re-read the selected contact, never trust a client-supplied name/classification. */
export async function verifyComposerContact(ctx: ComposerContext, id: string, database = contextDatabase) {
  const relationship = requireRelationship(ctx);
  if (!uuid.test(id)) throw new ComposerContextError('INVALID_CONTACT', 'Select a registered contact.');
  const { data, error } = await database().from('t_contacts').select('id, name, company_name, classifications')
    .eq('tenant_id', ctx.tenantId).eq('is_live', ctx.environment === 'live')
    .eq('status', 'active').eq('id', id).maybeSingle();
  if (error) throw new ComposerContextError('CONTACT_UNAVAILABLE', 'Could not verify this contact. Please retry.', 503);
  if (!data || !classificationsOf(data.classifications).includes(relationship))
    throw new ComposerContextError('CONTACT_RELATIONSHIP_MISMATCH', 'This contact does not match the selected relationship in this workspace and environment.');
  return { id: data.id as string, name: String(data.name || data.company_name || '') };
}

export interface SharedComposerFacts {
  schemaVersion: 1;
  scope: { tenantId: string; environment: 'live' | 'test'; workflow: Workflow; relationship: Relationship | null };
  facts: { approvedKeywords: string[]; persona: string | null; industryIds: string[]; resources: Array<{ name: string; type: string }> };
  suggestions: { persona: string | null; keywords: string[]; clusters: Array<{ primary_term: string; category: string }> };
  unknown: string[];
  sources: Record<string, { table: string; state: 'available' | 'missing' | 'unavailable'; revision?: string }>;
}
const factsCache = new WeakMap<ComposerContext, Promise<SharedComposerFacts>>();
export function publicScope(ctx: ComposerContext) {
  assertVerifiedContext(ctx);
  return { tenantId: ctx.tenantId, environment: ctx.environment, workflow: ctx.workflow, relationship: ctx.relationship };
}
/** Request-local memo only: never reuse profile/contact data across tenants or environments. */
export function loadComposerFacts(ctx: ComposerContext, database = contextDatabase): Promise<SharedComposerFacts> {
  assertVerifiedContext(ctx);
  const cached = factsCache.get(ctx);
  if (cached) return cached;
  const task = (async (): Promise<SharedComposerFacts> => {
    const db = database();
    const results = await Promise.all([
      db.from('t_tenant_smartprofiles').select('approved_keywords, suggested_keywords, profile_type, updated_at')
        .eq('tenant_id', ctx.tenantId).eq('is_active', true).order('updated_at', { ascending: false }).limit(1),
      db.from('t_semantic_clusters').select('primary_term, category').eq('tenant_id', ctx.tenantId).eq('is_active', true),
      db.from('t_category_resources_master').select('display_name, name, resource_type_id')
        .eq('tenant_id', ctx.tenantId).eq('is_active', true).eq('is_live', ctx.environment === 'live')
        .order('sequence_no', { ascending: true }).limit(100),
      db.from('t_tenant_profiles').select('industry_id, persona, updated_at').eq('tenant_id', ctx.tenantId).limit(1),
      db.from('t_tenant_served_industries').select('industry_id').eq('tenant_id', ctx.tenantId),
    ]);
    const tables = ['t_tenant_smartprofiles', 't_semantic_clusters', 't_category_resources_master', 't_tenant_profiles', 't_tenant_served_industries'];
    const sources: SharedComposerFacts['sources'] = {};
    results.forEach((r, i) => {
      const revision = (r.data?.[0] as { updated_at?: string } | undefined)?.updated_at;
      sources[tables[i]] = { table: tables[i], state: r.error ? 'unavailable' : r.data?.length ? 'available' : 'missing',
        ...(!r.error && revision ? { revision } : {}) };
    });
    const rows = results.map(r => r.error ? [] : r.data || []) as any[][];
    const profile = rows[0][0] || {};
    const tenantProfile = rows[3][0] || {};
    const strings = (values: unknown) => Array.isArray(values) ? values.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean) : [];
    const unknown = Object.entries(sources).filter(([, s]) => s.state !== 'available').map(([name]) => name);
    // Currency isn't stored in these profile tables. The UI's INR is an application preference, NOT a tenant fact.
    unknown.push('tenant_default_currency');
    if (!tenantProfile.persona) unknown.push('persona');
    if (!strings(profile.approved_keywords).length) unknown.push('approved_keywords');
    return {
      schemaVersion: 1, scope: publicScope(ctx),
      facts: {
        approvedKeywords: strings(profile.approved_keywords),
        persona: tenantProfile.persona || null,
        industryIds: Array.from(new Set([tenantProfile.industry_id, ...rows[4].map(r => r.industry_id)].filter(Boolean))),
        resources: rows[2].map(r => ({ name: String(r.display_name || r.name || ''), type: String(r.resource_type_id || '') })).filter(r => r.name),
      },
      suggestions: {
        persona: profile.profile_type || null,
        keywords: strings(profile.suggested_keywords),
        clusters: rows[1].filter(r => r.primary_term).map(r => ({ primary_term: String(r.primary_term), category: String(r.category || '') })),
      },
      unknown, sources,
    };
  })();
  factsCache.set(ctx, task);
  return task;
}
