// src/seeds/jtdTemplates.seed.ts
// JTD notification template seed data
// NOTE: Actual INSERT logic lives in fn_seed_jtd_templates_for_tenant RPC
// (jtd-nucleus/027 migration), invoked by trg_tenants_seed_jtd_templates on
// t_tenants AFTER INSERT. This file provides SeedDefinition metadata +
// preview data for the onboarding UI — the same split eventStatuses uses.

import { SeedDefinition, SeedItem } from './types';

// =================================================================
// PREVIEW DATA — mirrors what the RPC seeds (for UI preview only)
//
// The registry itself is the set of n_jtd_templates rows with
// tenant_id IS NULL. Every ACTIVE registry row is copied to a tenant EXCEPT
// the identity/access source types (see PLATFORM_SOURCE_TYPES below), which
// stay global only.
//
// One row per (source_type, channel) — never one per environment. Two rows
// differing only by is_live would both satisfy the worker's getTemplate(),
// which ends in .single() and errors on multiple rows. The unique index
// uq_jtd_template_resolution (jtd-nucleus/026) enforces this.
// =================================================================

export const JTD_TEMPLATE_SEED_DATA: SeedItem[] = [
  { code: 'appointment_reminder',    channel: 'sms',      name: 'Appointment Reminder SMS' },
  { code: 'beyond_scope_invoice',    channel: 'whatsapp', name: 'Beyond-scope invoice' },
  { code: 'contract_accepted',       channel: 'email',    name: 'Contract Accepted Email' },
  { code: 'payment_due',             channel: 'email',    name: 'Payment Due Email' },
  { code: 'payment_nudge_email',     channel: 'email',    name: 'Payment nudge (email)' },
  { code: 'payment_nudge_whatsapp',  channel: 'whatsapp', name: 'Payment nudge (WhatsApp)' },
  { code: 'payment_received',        channel: 'email',    name: 'Payment received (Email)' },
  { code: 'payment_received',        channel: 'whatsapp', name: 'Payment received (WhatsApp)' },
  { code: 'payment_request',         channel: 'email',    name: 'Payment Request Email' },
  { code: 'payment_request',         channel: 'whatsapp', name: 'Payment Request WhatsApp' },
  { code: 'service_reminder',        channel: 'email',    name: 'Service Reminder Email' },
  { code: 'service_reminder',        channel: 'sms',      name: 'Service Reminder SMS' },
  { code: 'service_report_ready',    channel: 'whatsapp', name: 'Service report ready' },
  { code: 'service_visit_completed', channel: 'whatsapp', name: 'Service visit completed' },
  { code: 'service_visit_scheduled', channel: 'whatsapp', name: 'Service visit scheduled' },
  { code: 'service_visit_started',   channel: 'whatsapp', name: 'Service visit started' },
  { code: 'visit_slot_request',      channel: 'email',    name: 'Visit slot request (email)' },
  { code: 'visit_slot_request',      channel: 'whatsapp', name: 'Visit slot request (WhatsApp)' },
];

/**
 * Identity/access source types. These stay GLOBAL only and are never seeded
 * per tenant — a tenant that has switched messaging off must still be able to
 * invite a teammate or let a counterparty reach the page where they sign.
 *
 * Mirrors jtd_platform_source_types() in the database and
 * GATE_EXEMPT_SOURCE_TYPES in jtd-worker/index.ts. Three consumers, one list —
 * keep them in step.
 *
 * Password reset / forgot password are NOT here because they are not JTD
 * source types at all; Supabase Auth delivers them directly.
 */
export const PLATFORM_SOURCE_TYPES: string[] = [
  'user_invite',
  'user_created',
  'contract_signoff',
];

// =================================================================
// SEED DEFINITION — registered in SeedRegistry
// =================================================================

/**
 * JTD template seed definition.
 *
 * Unlike sequences/relationships which insert directly into t_category_details,
 * templates are seeded by fn_seed_jtd_templates_for_tenant, which copies every
 * active tenant-scope registry row. It is idempotent (ON CONFLICT on
 * uq_jtd_template_resolution), skips closed tenants, and never touches a row
 * the tenant already has.
 *
 * The `data` array here is for PREVIEW only (onboarding UI).
 * No `transform` is needed — the RPC handles all inserts.
 */
export const jtdTemplatesSeedDefinition: SeedDefinition = {
  category: 'jtdTemplates',
  displayName: 'Notification Templates',
  targetTable: 'n_jtd_templates',
  dependsOn: [],
  data: JTD_TEMPLATE_SEED_DATA,
  order: 4,
  isRequired: true,
  description: 'Per-tenant copies of the notification template registry (email, WhatsApp, SMS)',
  productCode: 'contractnest'
};

// =================================================================
// DISPLAY HELPERS — for UI consumption
// =================================================================

/** Channel display names */
export const JTD_CHANNEL_DISPLAY_NAMES: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  inapp: 'In-App',
};

/** Get preview data grouped by channel */
export const getTemplatePreviewByChannel = (): Record<string, SeedItem[]> => {
  const grouped: Record<string, SeedItem[]> = {};
  for (const item of JTD_TEMPLATE_SEED_DATA) {
    const ch = item.channel as string;
    if (!grouped[ch]) grouped[ch] = [];
    grouped[ch].push(item);
  }
  return grouped;
};

/** Count of templates per channel (for preview) */
export const getTemplateCountByChannel = (): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of JTD_TEMPLATE_SEED_DATA) {
    const ch = item.channel as string;
    counts[ch] = (counts[ch] || 0) + 1;
  }
  return counts;
};
