// src/seeds/eventStatuses.seed.ts
// Event Status Configuration seed data
// NOTE: Actual INSERT logic lives in seed_event_status_defaults RPC (018 migration).
// This file provides SeedDefinition metadata + preview data for onboarding UI.

import { SeedDefinition, SeedItem } from './types';

// =================================================================
// PREVIEW DATA — mirrors what the RPC seeds (for UI preview only)
// =================================================================

export const EVENT_STATUS_SEED_DATA: SeedItem[] = [
  // --- SERVICE statuses ---
  { code: 'scheduled',       name: 'Scheduled',         event_type: 'service',    hex_color: '#6B7280', is_initial: true,  is_terminal: false },
  { code: 'assigned',        name: 'Assigned',          event_type: 'service',    hex_color: '#3B82F6', is_initial: false, is_terminal: false },
  { code: 'in_progress',     name: 'In Progress',       event_type: 'service',    hex_color: '#F59E0B', is_initial: false, is_terminal: false },
  { code: 'on_hold',         name: 'On Hold',           event_type: 'service',    hex_color: '#EF4444', is_initial: false, is_terminal: false },
  { code: 'pending_review',  name: 'Pending Review',    event_type: 'service',    hex_color: '#8B5CF6', is_initial: false, is_terminal: false },
  { code: 'completed',       name: 'Completed',         event_type: 'service',    hex_color: '#10B981', is_initial: false, is_terminal: true  },
  { code: 'cancelled',       name: 'Cancelled',         event_type: 'service',    hex_color: '#DC2626', is_initial: false, is_terminal: true  },
  { code: 'skipped',         name: 'Skipped',           event_type: 'service',    hex_color: '#9CA3AF', is_initial: false, is_terminal: true  },

  // --- SPARE_PART statuses ---
  { code: 'scheduled',       name: 'Scheduled',         event_type: 'spare_part', hex_color: '#6B7280', is_initial: true,  is_terminal: false },
  { code: 'requested',       name: 'Requested',         event_type: 'spare_part', hex_color: '#3B82F6', is_initial: false, is_terminal: false },
  { code: 'approved',        name: 'Approved',          event_type: 'spare_part', hex_color: '#10B981', is_initial: false, is_terminal: false },
  { code: 'ordered',         name: 'Ordered',           event_type: 'spare_part', hex_color: '#F59E0B', is_initial: false, is_terminal: false },
  { code: 'in_transit',      name: 'In Transit',        event_type: 'spare_part', hex_color: '#06B6D4', is_initial: false, is_terminal: false },
  { code: 'delivered',       name: 'Delivered',         event_type: 'spare_part', hex_color: '#8B5CF6', is_initial: false, is_terminal: false },
  { code: 'installed',       name: 'Installed',         event_type: 'spare_part', hex_color: '#059669', is_initial: false, is_terminal: true  },
  { code: 'cancelled',       name: 'Cancelled',         event_type: 'spare_part', hex_color: '#DC2626', is_initial: false, is_terminal: true  },
  { code: 'returned',        name: 'Returned',          event_type: 'spare_part', hex_color: '#78716C', is_initial: false, is_terminal: true  },

  // --- BILLING statuses ---
  { code: 'scheduled',       name: 'Scheduled',         event_type: 'billing',    hex_color: '#6B7280', is_initial: true,  is_terminal: false },
  { code: 'invoiced',        name: 'Invoiced',          event_type: 'billing',    hex_color: '#3B82F6', is_initial: false, is_terminal: false },
  { code: 'sent',            name: 'Sent',              event_type: 'billing',    hex_color: '#8B5CF6', is_initial: false, is_terminal: false },
  { code: 'partially_paid',  name: 'Partially Paid',    event_type: 'billing',    hex_color: '#F59E0B', is_initial: false, is_terminal: false },
  { code: 'paid',            name: 'Paid',              event_type: 'billing',    hex_color: '#10B981', is_initial: false, is_terminal: true  },
  { code: 'overdue',         name: 'Overdue',           event_type: 'billing',    hex_color: '#EF4444', is_initial: false, is_terminal: false },
  { code: 'disputed',        name: 'Disputed',          event_type: 'billing',    hex_color: '#DC2626', is_initial: false, is_terminal: false },
  { code: 'written_off',     name: 'Written Off',       event_type: 'billing',    hex_color: '#78716C', is_initial: false, is_terminal: true  },
  { code: 'cancelled',       name: 'Cancelled',         event_type: 'billing',    hex_color: '#9CA3AF', is_initial: false, is_terminal: true  },
];

// =================================================================
// SEED DEFINITION — registered in SeedRegistry
// =================================================================

/**
 * Event statuses seed definition.
 * Unlike sequences/relationships which insert directly into t_category_details,
 * event statuses are seeded via the edge function's POST /seed endpoint
 * which calls the seed_event_status_defaults RPC in the 018 migration.
 *
 * The `data` array here is for PREVIEW only (onboarding UI).
 * No `transform` is needed — the RPC handles all inserts.
 */
export const eventStatusesSeedDefinition: SeedDefinition = {
  category: 'eventStatuses',
  displayName: 'Event Status Configuration',
  targetTable: 'm_event_status_config',
  dependsOn: [],
  data: EVENT_STATUS_SEED_DATA,
  order: 3,
  isRequired: true,
  description: 'Default status workflows for service, spare part, and billing events',
  productCode: 'contractnest'
};

// =================================================================
// DISPLAY HELPERS — for UI consumption
// =================================================================

/** Event types with their display names */
export const EVENT_TYPE_DISPLAY_NAMES: Record<string, string> = {
  service: 'Service',
  spare_part: 'Spare Part',
  billing: 'Billing',
};

/** Get preview data grouped by event type */
export const getStatusPreviewByEventType = (): Record<string, SeedItem[]> => {
  const grouped: Record<string, SeedItem[]> = {};
  for (const item of EVENT_STATUS_SEED_DATA) {
    const type = item.event_type as string;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(item);
  }
  return grouped;
};

/** Count of statuses per event type (for preview) */
export const getStatusCountByEventType = (): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of EVENT_STATUS_SEED_DATA) {
    const type = item.event_type as string;
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
};
