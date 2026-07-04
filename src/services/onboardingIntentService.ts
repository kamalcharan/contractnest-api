// src/services/onboardingIntentService.ts
// Sprint 1 (Tasks 2 + 3 / S8): durable onboarding intent + canonical industry resolution.
//
// - persistSelectedResources / getSelectedResources back the t_tenant_selected_resources
//   table (S8): the tenant's resource picks finally survive the React state they used
//   to die in. purpose='sell' drives the seller catalog seed; purpose='own' drives the
//   buyer registry seed. A 'both' tenant may hold one row per purpose for one template.
// - resolveIndustryTemplates wraps the resolve_industry_resource_templates RPC
//   (recursive parent_id walk + junction + universal templates). Coverage is defined
//   as ≥1 row matched via 'tagged' or 'junction' — universal templates apply to every
//   industry and therefore do NOT count as KT coverage for the no_coverage kill-switch.
//
// Race-condition handling: selections are upserted on the (tenant_id,
// resource_template_id, purpose) unique key, so a double-submitted onboarding
// step updates selected_at instead of erroring or duplicating.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type SelectionPurpose = 'sell' | 'own';
export type SelectionSource = 'onboarding' | 'settings' | 'agent';

export interface ResourceSelection {
  resource_template_id: string;
  purpose: SelectionPurpose;
}

export interface ResolvedTemplate {
  resource_template_id: string;
  template_name: string;
  resource_type_id: string;
  matched_industry_id: string | null;
  via: 'tagged' | 'junction' | 'universal';
}

export interface IndustryResolution {
  templates: ResolvedTemplate[];
  /** true when at least one template matched via tagged/junction (universal excluded) */
  hasCoverage: boolean;
  industryIds: string[];
}

// Architecture note: the API layer holds only the ANON key by design (service
// keys live in edge-function secrets). RLS-protected reads/writes therefore run
// as the AUTHENTICATED user by forwarding the caller's JWT — which also means
// tenant policies are genuinely enforced instead of bypassed.
function getClient(authToken?: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_KEY;
  if (!url || (!serviceKey && !anonKey)) {
    throw new Error('onboardingIntentService: Missing SUPABASE_URL or SUPABASE_KEY');
  }
  if (serviceKey) {
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return createClient(url, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authToken ? { headers: { Authorization: authToken } } : undefined,
  });
}

export async function persistSelectedResources(
  tenantId: string,
  selections: ResourceSelection[],
  source: SelectionSource = 'onboarding',
  createdBy: string | null = null,
  authToken?: string,
): Promise<{ persisted: number; errors: string[] }> {
  if (!selections.length) return { persisted: 0, errors: [] };

  const sb = getClient(authToken);
  const rows = selections.map(s => ({
    tenant_id: tenantId,
    resource_template_id: s.resource_template_id,
    purpose: s.purpose,
    source,
    selected_at: new Date().toISOString(),
    created_by: createdBy,
  }));

  const { error } = await sb
    .from('t_tenant_selected_resources')
    .upsert(rows, { onConflict: 'tenant_id,resource_template_id,purpose' });

  if (error) {
    console.error('[onboardingIntent] persistSelectedResources failed:', error.message);
    return { persisted: 0, errors: [error.message] };
  }

  // Owner decision (2026-07-02): the picks ARE the tenant's Resources.
  // Materialize them into t_category_resources_master (idempotent RPC) so
  // Settings → Resources, catalog-studio dependencies, wizard coverage and
  // VaNi all read the same working set. Non-fatal: reseed can recover.
  try {
    const { data: mat, error: matError } = await sb.rpc('materialize_tenant_resources', {
      p_tenant_id: tenantId,
    });
    if (matError) {
      console.warn('[onboardingIntent] materialize_tenant_resources failed (recoverable via reseed):', matError.message);
    } else {
      console.log(`[onboardingIntent] resources materialized: ${mat?.resourcesMaterialized ?? 0}`);
    }
  } catch (e: any) {
    console.warn('[onboardingIntent] materialize_tenant_resources threw (recoverable via reseed):', e.message);
  }

  return { persisted: rows.length, errors: [] };
}

export async function getSelectedResources(
  tenantId: string,
  purpose?: SelectionPurpose,
  authToken?: string,
): Promise<Array<{ resource_template_id: string; purpose: SelectionPurpose; source: string; selected_at: string }>> {
  const sb = getClient(authToken);
  let query = sb
    .from('t_tenant_selected_resources')
    .select('resource_template_id, purpose, source, selected_at')
    .eq('tenant_id', tenantId);
  if (purpose) query = query.eq('purpose', purpose);

  const { data, error } = await query;
  if (error) {
    console.error('[onboardingIntent] getSelectedResources failed:', error.message);
    return [];
  }
  return data || [];
}

export async function resolveIndustryTemplates(industryIds: string[], authToken?: string): Promise<IndustryResolution> {
  const ids = [...new Set(industryIds.filter(Boolean))];
  if (!ids.length) return { templates: [], hasCoverage: false, industryIds: ids };

  const sb = getClient(authToken);
  const { data, error } = await sb.rpc('resolve_industry_resource_templates', {
    p_industry_ids: ids,
  });

  if (error) {
    // Resolution failure must be loud — callers treat it as an error, never as empty success
    throw new Error(`resolve_industry_resource_templates failed: ${error.message}`);
  }

  const templates = (data || []) as ResolvedTemplate[];
  const hasCoverage = templates.some(t => t.via === 'tagged' || t.via === 'junction');
  return { templates, hasCoverage, industryIds: ids };
}
