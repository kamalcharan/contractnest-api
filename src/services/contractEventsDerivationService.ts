// ============================================================================
// Contract Events Derivation Service
// ============================================================================
// Purpose: Server-side derivation of the contract forward calendar
//          (service visits + billing schedule) from contract terms.
//
// This is a 1:1 port of the wizard's client-side computation:
//   contractnest-ui/src/utils/service-contracts/contractEvents.ts
//     → computeContractEvents()
//   contractnest-ui/src/components/contracts/ContractWizard/index.tsx
//     → computeEventsForApi()  (formatting into t_contracts.computed_events)
//
// PARITY CONTRACT: the output of deriveComputedEvents() must be identical to
// what the ContractWizard sends as `computed_events`. Any change to the UI
// algorithm must be mirrored here (and vice versa). The parity test at
// src/__tests__/contractEventsDerivationParity.ts enforces this.
//
// TIMEZONE NOTE: like the UI, date arithmetic uses local-time Date methods
// (setDate/setMonth). Run the API with the same TZ as the tenant's users
// (e.g. TZ=Asia/Kolkata) for day-identical output. IST has no DST, so
// results are stable within a timezone.
// ============================================================================

// ─── Types ───
// Mirrors the fields of ConfigurableBlock (contractnest-ui) that the
// computation actually reads. Anything else on the block is ignored.

export type EventType = 'service' | 'billing';
export type BillingSubType = 'upfront' | 'emi' | 'on_completion' | 'recurring';

export interface DerivationBlock {
  id: string;
  name: string;
  categoryId?: string;
  quantity: number;
  cycle: string;                 // 'prepaid' | 'postpaid' | 'monthly' | 'fortnightly' | 'quarterly' | 'halfyearly' | 'annual' | 'custom'
  customCycleDays?: number;      // for cycle === 'custom'
  serviceCycleDays?: number;     // days between recurring service visits
  unlimited: boolean;
  currency?: string;
  totalPrice?: number;
  price?: number;                // per-unit / per-period rate (cadence math)
  taxRate?: number;
  taxInclusion?: 'inclusive' | 'exclusive';
  // Parity with ConfigurableBlock.config — billing-only skip + cadence pricing
  config?: {
    billingOnly?: boolean;
    customPrice?: number;
    cadenceFinalPayment?: number;
    cadencePricing?: { baseAmount?: number; baseMonths?: number; rates?: unknown[]; defaultCadence?: string } | null;
  } | null;
}

export interface DeriveEventsInput {
  startDate: string | Date;      // ISO string accepted (API-friendly)
  durationValue: number;
  durationUnit: string;          // 'days' | 'months' | 'years'
  selectedBlocks: DerivationBlock[];
  paymentMode: 'prepaid' | 'emi' | 'defined';
  emiMonths: number;
  perBlockPaymentType: Record<string, 'prepaid' | 'postpaid'>;
  billingCycleType: 'unified' | 'mixed' | null;
  grandTotal: number;
  currency: string;
  /** Optional per-event date overrides keyed by deterministic event id */
  eventOverrides?: Record<string, string | Date>;
}

/** Internal computed event (dates as Date, mirrors UI ContractEvent) */
export interface DerivedEvent {
  id: string;
  block_id: string;
  block_name: string;
  category_id: string;
  event_type: EventType;
  billing_sub_type?: BillingSubType;
  billing_cycle_label?: string;
  sequence_number: number;
  total_occurrences: number;
  scheduled_date: Date;
  original_date: Date;
  amount?: number;
  currency?: string;
  status: 'scheduled';
  assigned_to?: string;
  assigned_to_name?: string;
}

/** Matches t_contracts.computed_events JSONB entries (ComputedEvent in the UI) */
export interface ComputedEventPayload {
  block_id: string;
  block_name: string;
  category_id?: string;
  event_type: EventType;
  billing_sub_type?: BillingSubType;
  billing_cycle_label?: string;
  sequence_number: number;
  total_occurrences: number;
  scheduled_date: string;        // ISO
  amount?: number;
  currency?: string;
  assigned_to?: string;
  assigned_to_name?: string;
}

// ─── Category pricing rules ───
// Mirrors contractnest-ui/src/utils/catalog-studio/categories.ts:
// categoryHasPricing() — true only for categories whose wizard steps include
// 'pricing'. In CATEGORY_METADATA those are 'service' and 'spare'.
const PRICED_CATEGORY_IDS = new Set(['service', 'spare']);

export function categoryHasPricing(categoryId: string): boolean {
  return PRICED_CATEGORY_IDS.has(categoryId);
}

// ─── Helpers (verbatim semantics from the UI implementation) ───

/** Convert duration to total days */
export function durationToDays(value: number, unit: string): number {
  switch (unit) {
    case 'days': return value;
    case 'months': return value * 30;
    case 'years': return value * 365;
    default: return value * 30;
  }
}

/** Add days to a date (returns new Date) */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Add months to a date */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** Deterministic event ID */
function makeEventId(blockId: string, eventType: EventType, seq: number): string {
  return `evt_${eventType}_${blockId.slice(0, 8)}_${seq}`;
}

/** How many recurring periods fit in the contract duration */
function countRecurringPeriods(durationDays: number, periodDays: number): number {
  if (periodDays <= 0) return 1;
  return Math.max(1, Math.ceil(durationDays / periodDays));
}

/** Billing cycle to period in days */
function cycleToPeriodDays(cycle: string, customDays?: number): number {
  switch (cycle) {
    case 'monthly': return 30;
    case 'fortnightly': return 14;
    case 'quarterly': return 90;
    // Cadence-pricing cycles (cyclical pricing rate cards)
    case 'halfyearly': return 182;
    case 'annual': return 365;
    case 'custom': return customDays || 30;
    default: return 0; // prepaid/postpaid are one-time, not recurring
  }
}

/** Human-readable cycle label */
function cycleLabel(cycle: string): string {
  switch (cycle) {
    case 'prepaid': return 'Prepaid';
    case 'postpaid': return 'Postpaid';
    case 'monthly': return 'Monthly';
    case 'fortnightly': return 'Fortnightly';
    case 'quarterly': return 'Quarterly';
    case 'halfyearly': return '6-Monthly';
    case 'annual': return 'Annual';
    case 'custom': return 'Custom Cycle';
    default: return cycle;
  }
}

// ─── Main computation (1:1 port of computeContractEvents) ───

export function deriveContractEvents(input: DeriveEventsInput): DerivedEvent[] {
  const {
    durationValue,
    durationUnit,
    selectedBlocks,
    paymentMode,
    emiMonths,
    perBlockPaymentType,
    grandTotal,
    currency,
  } = input;

  const startDate = input.startDate instanceof Date
    ? input.startDate
    : new Date(input.startDate);

  const events: DerivedEvent[] = [];
  const totalDays = durationToDays(durationValue, durationUnit);
  const endDate = addDays(startDate, totalDays);

  // ─── SERVICE EVENTS ───
  // For each priced, non-unlimited block
  for (const block of selectedBlocks) {
    const hasPricing = categoryHasPricing(block.categoryId || '');
    if (!hasPricing || block.unlimited) continue;

    // Billing-only blocks (fees/dues like memberships) bill on their cycle
    // but never generate service events/visits (parity with UI)
    if (block.config?.billingOnly) continue;

    const qty = block.quantity || 1;

    if (block.serviceCycleDays && block.serviceCycleDays > 0 && qty > 1) {
      // Recurring service: qty events, each serviceCycleDays apart
      for (let i = 0; i < qty; i++) {
        const dayOffset = i * block.serviceCycleDays;
        const date = addDays(startDate, dayOffset);

        events.push({
          id: makeEventId(block.id, 'service', i + 1),
          block_id: block.id,
          block_name: block.name,
          category_id: block.categoryId || '',
          event_type: 'service',
          sequence_number: i + 1,
          total_occurrences: qty,
          scheduled_date: date,
          original_date: new Date(date),
          status: 'scheduled',
        });
      }
    } else {
      // One-time service delivery on Day 1
      events.push({
        id: makeEventId(block.id, 'service', 1),
        block_id: block.id,
        block_name: block.name,
        category_id: block.categoryId || '',
        event_type: 'service',
        sequence_number: 1,
        total_occurrences: 1,
        scheduled_date: new Date(startDate),
        original_date: new Date(startDate),
        status: 'scheduled',
      });
    }
  }

  // ─── BILLING EVENTS ───

  if (paymentMode === 'prepaid') {
    // Upfront: 1 billing event on Day 1 for full amount
    events.push({
      id: makeEventId('contract', 'billing', 1),
      block_id: '_contract',
      block_name: 'Full Payment (Upfront)',
      category_id: '',
      event_type: 'billing',
      billing_sub_type: 'upfront',
      billing_cycle_label: 'Upfront',
      sequence_number: 1,
      total_occurrences: 1,
      scheduled_date: new Date(startDate),
      original_date: new Date(startDate),
      amount: grandTotal,
      currency,
      status: 'scheduled',
    });
  } else if (paymentMode === 'emi') {
    // EMI: N monthly installments
    const installment = Math.round((grandTotal / emiMonths) * 100) / 100;
    for (let i = 0; i < emiMonths; i++) {
      const date = i === 0 ? new Date(startDate) : addMonths(startDate, i);
      events.push({
        id: makeEventId('emi', 'billing', i + 1),
        block_id: '_emi',
        block_name: `EMI Installment`,
        category_id: '',
        event_type: 'billing',
        billing_sub_type: 'emi',
        billing_cycle_label: `EMI ${i + 1}/${emiMonths}`,
        sequence_number: i + 1,
        total_occurrences: emiMonths,
        scheduled_date: date,
        original_date: new Date(date),
        amount: installment,
        currency,
        status: 'scheduled',
      });
    }
  } else if (paymentMode === 'defined') {
    // Per-block billing: each block generates its own billing events
    for (const block of selectedBlocks) {
      const hasPricing = categoryHasPricing(block.categoryId || '');
      if (!hasPricing || block.unlimited) continue;

      const blockCycle = block.cycle || 'prepaid';
      const blockPayType = perBlockPaymentType[block.id] || 'prepaid';
      const blockTotal = block.totalPrice || 0;

      if (blockCycle === 'prepaid' || blockPayType === 'prepaid') {
        // On acceptance — 1 event
        events.push({
          id: makeEventId(block.id, 'billing', 1),
          block_id: block.id,
          block_name: block.name,
          category_id: block.categoryId || '',
          event_type: 'billing',
          billing_sub_type: 'upfront',
          billing_cycle_label: 'Prepaid',
          sequence_number: 1,
          total_occurrences: 1,
          scheduled_date: new Date(startDate),
          original_date: new Date(startDate),
          amount: blockTotal,
          currency: block.currency || currency,
          status: 'scheduled',
        });
      } else if (blockCycle === 'postpaid') {
        // On completion — 1 event at end
        events.push({
          id: makeEventId(block.id, 'billing', 1),
          block_id: block.id,
          block_name: block.name,
          category_id: block.categoryId || '',
          event_type: 'billing',
          billing_sub_type: 'on_completion',
          billing_cycle_label: 'Postpaid',
          sequence_number: 1,
          total_occurrences: 1,
          scheduled_date: new Date(endDate),
          original_date: new Date(endDate),
          amount: blockTotal,
          currency: block.currency || currency,
          status: 'scheduled',
        });
      } else if (block.config?.cadencePricing) {
        // Cadence-priced (cyclical pricing): the payment count derives from
        // (cadence, contract term) — NOT from quantity, which stays the
        // service-visit count. Full payments at the per-period rate, plus a
        // seller-set final payment when the term doesn't divide evenly.
        // (1:1 port of the UI branch in contractEvents.ts)
        const periodDays = cycleToPeriodDays(blockCycle, block.customCycleDays);
        const durationMonths = Math.max(1, Math.round(totalDays / 30));
        const periodMonths = Math.max(1, Math.round(periodDays / 30));
        const fullPayments = Math.max(0, Math.floor(durationMonths / periodMonths));
        const remMonths = durationMonths - fullPayments * periodMonths;
        const cfg = block.config;
        const effRate = cfg?.customPrice ?? block.price ?? 0;
        const preTaxFinal = remMonths > 0
          ? (typeof cfg?.cadenceFinalPayment === 'number' ? cfg.cadenceFinalPayment : Math.round((effRate * remMonths) / periodMonths))
          : 0;
        const taxFactor = (block.taxRate || 0) > 0 && block.taxInclusion === 'exclusive' ? 1 + (block.taxRate || 0) / 100 : 1;
        const finalWithTax = Math.round(preTaxFinal * taxFactor * 100) / 100;
        const count = fullPayments + (finalWithTax > 0 ? 1 : 0);
        const perPeriodAmount = fullPayments > 0
          ? Math.round(((blockTotal - finalWithTax) / fullPayments) * 100) / 100
          : 0;

        const startIdx = events.length;
        for (let i = 0; i < fullPayments; i++) {
          const date = addDays(startDate, i * periodDays);
          if (date > endDate) break;
          events.push({
            id: makeEventId(block.id, 'billing', i + 1),
            block_id: block.id,
            block_name: block.name,
            category_id: block.categoryId || '',
            event_type: 'billing',
            billing_sub_type: 'recurring',
            billing_cycle_label: `${cycleLabel(blockCycle)} ${i + 1}/${count}`,
            sequence_number: i + 1,
            total_occurrences: count,
            scheduled_date: date,
            original_date: new Date(date),
            amount: perPeriodAmount,
            currency: block.currency || currency,
            status: 'scheduled',
          });
        }
        const emittedFull = events.length - startIdx;
        // Last full payment absorbs rounding against the regular share
        if (emittedFull === fullPayments && emittedFull > 0) {
          events[events.length - 1].amount =
            Math.round(((blockTotal - finalWithTax) - perPeriodAmount * (fullPayments - 1)) * 100) / 100;
        }
        // Seller-decided final payment for the leftover months
        if (finalWithTax > 0) {
          const date = addDays(startDate, fullPayments * periodDays);
          events.push({
            id: makeEventId(block.id, 'billing', fullPayments + 1),
            block_id: block.id,
            block_name: block.name,
            category_id: block.categoryId || '',
            event_type: 'billing',
            billing_sub_type: 'recurring',
            billing_cycle_label: `${cycleLabel(blockCycle)} final (${remMonths} mo)`,
            sequence_number: fullPayments + 1,
            total_occurrences: count,
            scheduled_date: date > endDate ? new Date(endDate) : date,
            original_date: date > endDate ? new Date(endDate) : new Date(date),
            amount: finalWithTax,
            currency: block.currency || currency,
            status: 'scheduled',
          });
        }
      } else {
        // Recurring: monthly, fortnightly, quarterly, custom
        const periodDays = cycleToPeriodDays(blockCycle, block.customCycleDays);
        const count = countRecurringPeriods(totalDays, periodDays);
        const perPeriodAmount = Math.round((blockTotal / count) * 100) / 100;

        for (let i = 0; i < count; i++) {
          const date = addDays(startDate, i * periodDays);
          // Don't generate events past the contract end
          if (date > endDate) break;

          events.push({
            id: makeEventId(block.id, 'billing', i + 1),
            block_id: block.id,
            block_name: block.name,
            category_id: block.categoryId || '',
            event_type: 'billing',
            billing_sub_type: 'recurring',
            billing_cycle_label: `${cycleLabel(blockCycle)} ${i + 1}/${count}`,
            sequence_number: i + 1,
            total_occurrences: count,
            scheduled_date: date,
            original_date: new Date(date),
            amount: perPeriodAmount,
            currency: block.currency || currency,
            status: 'scheduled',
          });
        }
      }
    }
  }

  // Sort all events by scheduled_date, then by type (service before billing on same day)
  events.sort((a, b) => {
    const dateDiff = a.scheduled_date.getTime() - b.scheduled_date.getTime();
    if (dateDiff !== 0) return dateDiff;
    // Service events before billing events on the same day
    if (a.event_type === 'service' && b.event_type === 'billing') return -1;
    if (a.event_type === 'billing' && b.event_type === 'service') return 1;
    return 0;
  });

  return events;
}

// ─── API payload formatting (1:1 port of computeEventsForApi) ───

/**
 * Derive events and format them for t_contracts.computed_events —
 * identical to the payload the ContractWizard sends.
 * Returns undefined when there is nothing to schedule (matches UI behaviour).
 */
export function deriveComputedEvents(input: DeriveEventsInput): ComputedEventPayload[] | undefined {
  const rawEvents = deriveContractEvents(input);
  if (!rawEvents || rawEvents.length === 0) return undefined;

  const overrides = input.eventOverrides || {};

  return rawEvents.map((event) => {
    const overriddenDate = overrides[event.id];
    const scheduledDate = overriddenDate || event.scheduled_date;

    return {
      block_id: event.block_id,
      block_name: event.block_name,
      category_id: event.category_id || undefined,
      event_type: event.event_type,
      billing_sub_type: event.billing_sub_type || undefined,
      billing_cycle_label: event.billing_cycle_label || undefined,
      sequence_number: event.sequence_number,
      total_occurrences: event.total_occurrences,
      scheduled_date: scheduledDate instanceof Date
        ? scheduledDate.toISOString()
        : new Date(scheduledDate).toISOString(),
      amount: event.amount || undefined,
      currency: event.currency || input.currency,
      assigned_to: event.assigned_to || undefined,
      assigned_to_name: event.assigned_to_name || undefined,
    };
  });
}
