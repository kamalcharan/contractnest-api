// src/services/ktServiceFormGeneratorService.ts
// Auto-generates one SmartForm per KT service group (catalog_name ||
// service_name — same grouping key as ktCatBlockMapperService) and
// registers it in m_kt_service_form_map, a master mapping that tenant
// onboarding reads from to auto-attach the right form to a newly-seeded
// catalog block. No manual per-block admin action required.
//
// Triggered by the KT page right after "Generate Service Names" persists
// (that's the step that makes service_name available; catalog_name is
// already written by the Cycles step, which is part of the automatic
// "+Generate KT" chain).
//
// Composition logic below is a deliberate 1:1 port of
// contractnest-ui's useAutoComposeForm.ts (composeBlockForm + its
// section builders) -- no React/DOM dependency there, pure data
// transformation, so it runs the same way server-side. Kept in sync
// manually, matching how this repo already duplicates DTO shapes
// between frontend and backend rather than sharing a package.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Form schema types (ported from contractnest-ui/src/pages/settings/smart-forms/types)
// ============================================================================

interface FormFieldOption {
  label: string;
  value: string;
}

interface FormField {
  id: string;
  type: string;
  label: string;
  help_text?: string;
  placeholder?: string;
  validation?: Record<string, unknown>;
  options?: FormFieldOption[];
}

interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

interface FormSchema {
  id: string;
  title: string;
  description: string;
  version: number;
  sections: FormSection[];
  settings: {
    allow_draft: boolean;
    require_all_sections: boolean;
    show_progress: boolean;
  };
}

interface CheckpointValue {
  id: string;
  label: string;
  severity: string;
}

interface Checkpoint {
  id: string;
  checkpoint_type: string;
  section_name: string;
  name: string;
  description: string | null;
  unit: string | null;
  normal_min: number | null;
  normal_max: number | null;
  amber_threshold: number | null;
  red_threshold: number | null;
  threshold_note: string | null;
  values?: CheckpointValue[];
}

interface Variant {
  id: string;
  name: string;
  capacity_range: string | null;
}

export interface KtFormGenerationResult {
  service_name: string;
  status: 'created' | 'skipped_existing' | 'skipped_no_checkpoints';
  form_template_id?: string;
}

// ============================================================================
// Section builders — ported 1:1 from useAutoComposeForm.ts
// ============================================================================

function buildIdentificationSection(variants: Variant[]): FormSection {
  const variantOptions: FormFieldOption[] = variants.map((v) => ({
    label: v.capacity_range ? `${v.name} (${v.capacity_range})` : v.name,
    value: v.id,
  }));

  return {
    id: 'identification',
    title: 'Equipment Identification',
    fields: [
      { id: 'asset_id', type: 'text', label: 'Equipment ID / Tag Number', validation: { required: true } },
      { id: 'serial_number', type: 'text', label: 'Serial Number', validation: { required: true } },
      { id: 'make_model', type: 'text', label: 'Make & Model', validation: { required: true } },
      { id: 'location', type: 'text', label: 'Location / Department', validation: { required: true } },
      {
        id: 'variant_id', type: 'select', label: 'Equipment Variant / Type',
        validation: { required: true },
        options: variantOptions,
        help_text: 'Select the specific variant — this determines which parts and thresholds apply',
      },
      { id: 'service_date', type: 'date', label: 'Service Date', validation: { required: true } },
      { id: 'technician_name', type: 'text', label: 'Technician Name', validation: { required: true } },
    ],
  };
}

function buildConditionSections(checkpoints: Checkpoint[]): FormSection[] {
  const conditions = checkpoints.filter((cp) => cp.checkpoint_type === 'condition');
  if (conditions.length === 0) return [];

  const grouped: Record<string, Checkpoint[]> = {};
  for (const cp of conditions) {
    const key = cp.section_name || 'Condition Checks';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(cp);
  }

  return Object.entries(grouped).map(([sectionName, cps]) => ({
    id: `cond_${sectionName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    title: sectionName,
    description: `${cps.length} condition checks`,
    fields: cps.map((cp): FormField => ({
      id: `cp_${cp.id}`,
      type: 'checkpoint',
      label: cp.name,
      help_text: cp.description || undefined,
      validation: { required: true },
      options: (cp.values && cp.values.length > 0)
        ? cp.values.map((v) => ({ label: v.label, value: v.label.toLowerCase().replace(/[^a-z0-9]+/g, '_') }))
        : [
            { label: 'OK', value: 'ok' },
            { label: 'Needs Attention', value: 'attention' },
            { label: 'Critical', value: 'critical' },
          ],
    })),
  }));
}

function buildReadingSections(checkpoints: Checkpoint[]): FormSection[] {
  const readings = checkpoints.filter((cp) => cp.checkpoint_type === 'reading');
  if (readings.length === 0) return [];

  const grouped: Record<string, Checkpoint[]> = {};
  for (const cp of readings) {
    const key = cp.section_name || 'Readings';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(cp);
  }

  return Object.entries(grouped).map(([sectionName, cps]) => ({
    id: `read_${sectionName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    title: `${sectionName} — Readings`,
    description: `${cps.length} measurements`,
    fields: cps.map((cp): FormField => {
      const rangeHint = cp.normal_min != null && cp.normal_max != null
        ? `Normal: ${cp.normal_min}–${cp.normal_max} ${cp.unit || ''}`
        : undefined;
      const thresholdHint = cp.amber_threshold != null
        ? `⚠ ${cp.amber_threshold} ${cp.unit || ''} | 🔴 ${cp.red_threshold ?? '—'} ${cp.unit || ''}`
        : undefined;

      return {
        id: `cp_${cp.id}`,
        type: 'number',
        label: cp.unit ? `${cp.name} (${cp.unit})` : cp.name,
        placeholder: rangeHint,
        help_text: [cp.threshold_note, thresholdHint].filter(Boolean).join(' · ') || undefined,
        validation: {
          required: true,
          ...(cp.normal_min != null ? { min: cp.red_threshold != null && cp.red_threshold < cp.normal_min ? Math.floor(cp.red_threshold * 0.5) : undefined } : {}),
          ...(cp.normal_max != null ? { max: cp.red_threshold != null && cp.red_threshold > cp.normal_max ? Math.ceil(cp.red_threshold * 1.5) : undefined } : {}),
        },
      };
    }),
  }));
}

function buildSignOffSection(): FormSection {
  return {
    id: 'signoff',
    title: 'Sign-Off & Approval',
    fields: [
      {
        id: 'overall_status', type: 'select', label: 'Overall Assessment',
        validation: { required: true },
        options: [
          { label: '🟢 Pass — All checks satisfactory', value: 'pass' },
          { label: '🟡 Conditional — Minor issues noted', value: 'conditional' },
          { label: '🔴 Fail — Critical issues found', value: 'fail' },
        ],
      },
      { id: 'remarks', type: 'textarea', label: 'Remarks / Observations' },
      {
        id: 'next_action', type: 'select', label: 'Recommended Next Action',
        options: [
          { label: 'No action needed', value: 'none' },
          { label: 'Schedule follow-up', value: 'follow_up' },
          { label: 'Escalate to supervisor', value: 'escalate' },
          { label: 'Part replacement needed', value: 'part_replacement' },
        ],
      },
      { id: 'next_service_date', type: 'date', label: 'Recommended Next Service Date' },
    ],
  };
}

function composeServiceForm(
  serviceName: string,
  variants: Variant[],
  checkpoints: Checkpoint[],
  generatedAt: number,
): FormSchema {
  const conditionSections = buildConditionSections(checkpoints);
  const readingSections = buildReadingSections(checkpoints);
  const totalFields = 7 +
    conditionSections.reduce((s, sec) => s + sec.fields.length, 0) +
    readingSections.reduce((s, sec) => s + sec.fields.length, 0) +
    4;

  return {
    id: `kt_service_${generatedAt}`,
    title: serviceName,
    description: `Auto-composed from Knowledge Tree · ${checkpoints.length} checkpoints · ${totalFields} fields`,
    version: 1,
    sections: [
      buildIdentificationSection(variants),
      ...conditionSections,
      ...readingSections,
      buildSignOffSection(),
    ],
    settings: {
      allow_draft: true,
      require_all_sections: false,
      show_progress: true,
    },
  };
}

// ============================================================================
// Service
// ============================================================================

export class KtServiceFormGeneratorService {
  private supabase: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) {
      throw new Error('KtServiceFormGeneratorService: Missing SUPABASE_URL or SUPABASE_KEY');
    }
    this.supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async generateFormsForTemplate(
    resourceTemplateId: string,
    accessToken: string,
  ): Promise<{ results: KtFormGenerationResult[] }> {
    const sb = this.supabase;

    // m_form_templates.created_by is NOT NULL — resolve the real caller
    // from their bearer token (same pattern the smart-forms edge function
    // already uses: db.auth.getUser(token)), rather than trusting a
    // request header the frontend never actually sends.
    const { data: userRes } = await sb.auth.getUser(accessToken);
    const userId = userRes?.user?.id;
    if (!userId) {
      throw new Error('Could not resolve caller identity from access token');
    }

    // Lazy import to avoid a require-cycle at module load (ktCatBlockMapperService
    // already exists as a singleton instance elsewhere in this codebase).
    const { ktCatBlockMapperService } = await import('./ktCatBlockMapperService');
    const groups = await ktCatBlockMapperService.getServiceCheckpointGroups(resourceTemplateId);

    if (groups.length === 0) {
      return { results: [] };
    }

    const [checkpointsRes, valuesRes, variantsRes, existingMapRes] = await Promise.all([
      sb.from('m_equipment_checkpoints')
        .select('id, checkpoint_type, section_name, name, description, unit, normal_min, normal_max, amber_threshold, red_threshold, threshold_note')
        .eq('resource_template_id', resourceTemplateId)
        .eq('is_active', true),
      sb.from('m_checkpoint_values')
        .select('checkpoint_id, label, severity, sort_order')
        .order('sort_order'),
      sb.from('m_equipment_variants')
        .select('id, name, capacity_range')
        .eq('resource_template_id', resourceTemplateId),
      sb.from('m_kt_service_form_map')
        .select('service_name')
        .eq('resource_template_id', resourceTemplateId),
    ]);

    const checkpoints = checkpointsRes.data || [];
    const values = valuesRes.data || [];
    const variants = (variantsRes.data || []) as Variant[];
    const alreadyMapped = new Set((existingMapRes.data || []).map((r: any) => r.service_name));

    const valuesByCheckpoint = new Map<string, CheckpointValue[]>();
    for (const v of values) {
      const arr = valuesByCheckpoint.get(v.checkpoint_id) || [];
      arr.push({ id: v.checkpoint_id, label: v.label, severity: v.severity });
      valuesByCheckpoint.set(v.checkpoint_id, arr);
    }

    const checkpointById = new Map<string, Checkpoint>(
      checkpoints.map((cp: any) => [cp.id, { ...cp, values: valuesByCheckpoint.get(cp.id) || [] }]),
    );

    const results: KtFormGenerationResult[] = [];

    for (const group of groups) {
      if (alreadyMapped.has(group.serviceName)) {
        results.push({ service_name: group.serviceName, status: 'skipped_existing' });
        continue;
      }

      const groupCheckpoints = group.checkpointIds
        .map((id) => checkpointById.get(id))
        .filter((cp): cp is Checkpoint => Boolean(cp));

      if (groupCheckpoints.length === 0) {
        results.push({ service_name: group.serviceName, status: 'skipped_no_checkpoints' });
        continue;
      }

      const schema = composeServiceForm(group.serviceName, variants, groupCheckpoints, Date.now());

      const { data: created, error: createError } = await sb
        .from('m_form_templates')
        .insert({
          name: `${group.serviceName} — Service Form`,
          description: `Auto-composed from Knowledge Tree. ${groupCheckpoints.length} checkpoints.`,
          category: 'maintenance',
          form_type: 'during_service',
          tags: ['auto-composed', 'knowledge-tree', 'kt-service-form', resourceTemplateId],
          schema,
          version: 1,
          // Deterministically composed from vetted Knowledge Tree checkpoint
          // data (no free-form LLM output) -- auto-approved so it's
          // immediately visible on the tenant Smart Forms selection page,
          // rather than sitting invisible in 'draft' until an admin manually
          // reviews it (resolves PRD Section 13 Open Decision #2).
          status: 'approved',
          created_by: userId,
          approved_by: userId,
          approved_at: new Date().toISOString(),
          review_notes: 'Auto-approved — deterministically composed from Knowledge Tree data.',
          source: 'knowledge_tree',
          resource_template_id: resourceTemplateId,
        })
        .select('id')
        .single();

      if (createError || !created) {
        console.error(`[ktServiceFormGenerator] Failed to create form for "${group.serviceName}":`, createError?.message);
        continue;
      }

      const { error: mapError } = await sb
        .from('m_kt_service_form_map')
        .upsert({
          resource_template_id: resourceTemplateId,
          service_name: group.serviceName,
          form_template_id: created.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'resource_template_id,service_name' });

      if (mapError) {
        console.error(`[ktServiceFormGenerator] Failed to register mapping for "${group.serviceName}":`, mapError.message);
        continue;
      }

      results.push({ service_name: group.serviceName, status: 'created', form_template_id: created.id });
    }

    return { results };
  }

  // Read-only status per service group — powers the admin KT tree page's
  // "Per-Service Forms" panel. Sourced from m_kt_service_form_map (platform
  // master, one row per resource_template_id + service_name) instead of
  // tenant-owned m_cat_blocks, which showed one duplicate row per tenant
  // that had seeded the equipment.
  async getFormStatusForTemplate(resourceTemplateId: string): Promise<{
    service_name: string;
    checkpoint_count: number;
    form_template_id: string | null;
    form_status: string | null;
  }[]> {
    const sb = this.supabase;
    const { ktCatBlockMapperService } = await import('./ktCatBlockMapperService');
    const groups = await ktCatBlockMapperService.getServiceCheckpointGroups(resourceTemplateId);
    if (groups.length === 0) return [];

    const { data: mapRows } = await sb
      .from('m_kt_service_form_map')
      .select('service_name, form_template_id')
      .eq('resource_template_id', resourceTemplateId);
    const formIdByService = new Map((mapRows || []).map((r: any) => [r.service_name, r.form_template_id]));

    const formIds = [...formIdByService.values()].filter(Boolean) as string[];
    const { data: formRows } = formIds.length
      ? await sb.from('m_form_templates').select('id, status').in('id', formIds)
      : { data: [] as any[] };
    const statusById = new Map((formRows || []).map((f: any) => [f.id, f.status]));

    return groups.map((g) => {
      const formTemplateId = formIdByService.get(g.serviceName) || null;
      return {
        service_name: g.serviceName,
        checkpoint_count: g.checkpointIds.length,
        form_template_id: formTemplateId,
        form_status: formTemplateId ? (statusById.get(formTemplateId) || null) : null,
      };
    });
  }
}

export const ktServiceFormGeneratorService = new KtServiceFormGeneratorService();
