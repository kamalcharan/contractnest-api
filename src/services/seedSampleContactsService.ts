// src/services/seedSampleContactsService.ts
// Seeds 3 industry-specific sample contacts into t_contacts during onboarding.
//
// Contacts are flagged is_seed=true, is_live=false so they are clearly
// distinguishable from real tenant data and can be cleaned up / reseeded
// independently via DELETE WHERE tenant_id = ? AND is_seed = true.
//
// Auth: Uses SECURITY DEFINER RPC (seed_sample_contacts) called via anon key.
// The DB function runs as DB owner and bypasses RLS internally.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { getSampleContactsForIndustry } from '../seeds/sampleContacts.seed';

export interface SeedSampleContactsInput {
  tenantId: string;
  industryId: string;
}

export interface SeedSampleContactsResult {
  success: boolean;
  alreadySeeded: boolean;
  contactsSeeded: number;
  errors: string[];
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('[seedSampleContacts] Missing SUPABASE_URL or Supabase key');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function seedSampleContacts(
  input: SeedSampleContactsInput
): Promise<SeedSampleContactsResult> {
  const { tenantId, industryId } = input;
  const supabase = buildSupabase();

  console.log('[seedSampleContacts] Starting', { tenantId, industryId });

  // ── Idempotency check ────────────────────────────────────────────────────
  const { count: existingCount } = await supabase
    .from('t_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_seed', true);

  if ((existingCount ?? 0) > 0) {
    console.log('[seedSampleContacts] Sample contacts already exist, skipping');
    return {
      success: true,
      alreadySeeded: true,
      contactsSeeded: existingCount ?? 0,
      errors: [],
    };
  }

  // ── Build contact payloads with pre-generated UUIDs ───────────────────────
  const templates = getSampleContactsForIndustry(industryId);
  const generatedIds = templates.map(() => randomUUID());

  const contacts = templates.map((template, index) => {
    const parentContactId =
      template.type === 'contact_person' && template.corporateIndex !== undefined
        ? generatedIds[template.corporateIndex]
        : null;

    return {
      id: generatedIds[index],
      type: template.type,
      status: 'active',
      salutation: template.salutation ?? null,
      // t_contacts constraint: corporate has company_name only, others have name only
      name: template.type !== 'corporate' ? (template.name ?? null) : null,
      company_name: template.type === 'corporate' ? (template.company_name ?? null) : null,
      designation: template.designation ?? null,
      department: template.department ?? null,
      is_primary_contact: false,
      parent_contact_id: parentContactId,
      classifications: [],
      tags: [],
      notes: template.notes ?? null,
    };
  });

  // ── Call SECURITY DEFINER RPC ─────────────────────────────────────────────
  const { data: rpcResult, error: rpcError } = await supabase.rpc('seed_sample_contacts', {
    p_tenant_id: tenantId,
    p_contacts: contacts,
  });

  if (rpcError) {
    console.error('[seedSampleContacts] RPC error:', rpcError);
    return {
      success: false,
      alreadySeeded: false,
      contactsSeeded: 0,
      errors: [rpcError.message],
    };
  }

  const contactsSeeded: number = rpcResult?.contactsSeeded ?? 0;
  console.log(`[seedSampleContacts] Seeded ${contactsSeeded} contacts for industry: ${industryId}`);

  return {
    success: true,
    alreadySeeded: rpcResult?.skipped ?? false,
    contactsSeeded,
    errors: [],
  };
}
