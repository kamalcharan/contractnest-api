// src/services/seedSampleContactsService.ts
// Seeds 3 industry-specific sample contacts into t_contacts during onboarding.
//
// Contacts are flagged is_seed=true, is_live=false so they are clearly
// distinguishable from real tenant data and can be cleaned up / reseeded
// independently via DELETE WHERE tenant_id = ? AND is_seed = true.
//
// Auth: Uses SECURITY DEFINER RPC (seed_sample_contacts) called via anon key.
// The DB function runs as DB owner and bypasses RLS internally.
//
// DATA QUALITY (2026-08-01): seeded contacts used to go in with
// classifications: [] — UNCLASSIFIED. Every classification-filtered surface
// therefore saw zero seeded contacts: the RFQ builder filters
// classifications=['vendor'] and found NO sample vendors even in test mode,
// which dead-ended the buyer's advertised first action ("Ask vendors to
// quote"). They also had no channels, so pickers showed "no email on file".
// Now:
//   - classifications follow the tenant's persona: a BUYER's sample
//     counterparties are their vendors, a SELLER's are their clients,
//     'both' gets both tags so either side's pickers find them.
//   - each contact gets a sample email (reserved example.com domain) and a
//     clearly-fake mobile, inserted into t_contact_channels with the same
//     service-role client (the channels table has no RLS-bypassing RPC and
//     needs none here). Non-fatal: contacts without channels are still
//     seeded contacts.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { getSampleContactsForIndustry } from '../seeds/sampleContacts.seed';

export interface SeedSampleContactsInput {
  tenantId: string;
  industryId: string;
  /** Tenant persona — decides which side of the ledger the samples sit on. */
  businessType?: 'buyer' | 'seller' | 'both';
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

// buyer  → samples are companies the tenant BUYS from        → 'vendor'
// seller → samples are companies the tenant SELLS to          → 'client'
// both   → both sides' pickers must find them                 → both tags
function classificationsFor(businessType?: 'buyer' | 'seller' | 'both'): string[] {
  if (businessType === 'buyer') return ['vendor'];
  if (businessType === 'both') return ['client', 'vendor'];
  return ['client']; // seller, and the legacy default
}

// Deterministic, obviously-sample channel values. example.com is IANA-reserved
// (can never deliver), and the 90000-000xx mobile block reads as a placeholder.
function slugify(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'contact';
}

export async function seedSampleContacts(
  input: SeedSampleContactsInput
): Promise<SeedSampleContactsResult> {
  const { tenantId, industryId, businessType } = input;
  const supabase = buildSupabase();

  console.log('[seedSampleContacts] Starting', { tenantId, industryId, businessType });

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
  const classifications = classificationsFor(businessType);

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
      classifications,
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
  const skipped: boolean = rpcResult?.skipped ?? false;
  console.log(`[seedSampleContacts] Seeded ${contactsSeeded} contacts for industry: ${industryId}`);

  // ── Channels (email + mobile) — non-fatal, only for freshly seeded rows ───
  // Without these, every contact-picker that shows a channel renders
  // "no email on file" and an RFQ/contract addressed to a sample contact has
  // nowhere to go even in test. The jtd-worker's global guardrail blocks all
  // real sends for is_live=false records regardless, and example.com is
  // undeliverable by definition — double-safe.
  if (!skipped && contactsSeeded > 0) {
    try {
      const channelRows = contacts.flatMap((c, index) => {
        const base = slugify(c.name || c.company_name || `contact-${index + 1}`);
        return [
          {
            contact_id: c.id,
            channel_type: 'email',
            value: `${base}@example.com`,
            is_primary: true,
            notes: 'Sample channel — replace with the real address',
          },
          {
            contact_id: c.id,
            channel_type: 'mobile',
            value: `90000000${String(index + 1).padStart(2, '0')}`,
            country_code: '+91',
            is_primary: true,
            notes: 'Sample channel — replace with the real number',
          },
        ];
      });

      const { error: chError } = await supabase.from('t_contact_channels').insert(channelRows);
      if (chError) {
        console.warn('[seedSampleContacts] Channel seed failed (non-fatal):', chError.message);
      } else {
        console.log(`[seedSampleContacts] Seeded ${channelRows.length} channels`);
      }
    } catch (chErr: any) {
      console.warn('[seedSampleContacts] Channel seed error (non-fatal):', chErr?.message);
    }
  }

  return {
    success: true,
    alreadySeeded: skipped,
    contactsSeeded,
    errors: [],
  };
}
