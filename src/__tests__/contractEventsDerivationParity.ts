// ============================================================================
// Parity test: contractEventsDerivationService vs the ContractWizard algorithm
// ============================================================================
// Verifies that the backend port produces byte-identical computed_events to
// the UI implementation.
//
// The REFERENCE section below is a verbatim copy of the computation from:
//   contractnest-ui/src/utils/service-contracts/contractEvents.ts  (computeContractEvents)
//   contractnest-ui/src/components/contracts/ContractWizard/index.tsx (computeEventsForApi)
//   contractnest-ui/src/utils/catalog-studio/categories.ts (categoryHasPricing)
// If the UI algorithm changes, update the reference copy AND the service.
//
// Run:  npx ts-node src/__tests__/contractEventsDerivationParity.ts
// Exits 0 on full parity, 1 on any mismatch.
// ============================================================================

import { deriveComputedEvents, DeriveEventsInput } from '../services/contractEventsDerivationService';

// ────────────────────────────────────────────────────────────────────────────
// REFERENCE — verbatim UI algorithm (do not "improve"; it must match the UI)
// ────────────────────────────────────────────────────────────────────────────

type RefEventType = 'service' | 'billing';

interface RefBlock {
  id: string; name: string; categoryId?: string; quantity: number; cycle: string;
  customCycleDays?: number; serviceCycleDays?: number; unlimited: boolean;
  currency?: string; totalPrice?: number;
  price?: number; taxRate?: number; taxInclusion?: 'inclusive' | 'exclusive';
  config?: {
    billingOnly?: boolean;
    customPrice?: number;
    cadenceFinalPayment?: number;
    cadencePricing?: { baseAmount?: number; baseMonths?: number; rates?: unknown[]; defaultCadence?: string } | null;
  } | null;
}

interface RefEvent {
  id: string; block_id: string; block_name: string; category_id: string;
  event_type: RefEventType; billing_sub_type?: string; billing_cycle_label?: string;
  sequence_number: number; total_occurrences: number;
  scheduled_date: Date; original_date: Date;
  amount?: number; currency?: string; status: 'scheduled';
  assigned_to?: string; assigned_to_name?: string;
}

// categoryHasPricing — from CATEGORY_METADATA: only 'service' and 'spare'
// have a 'pricing' wizard step.
const refCategoryHasPricing = (categoryId: string): boolean =>
  categoryId === 'service' || categoryId === 'spare';

function refAddDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function refAddMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
function refMakeEventId(blockId: string, eventType: RefEventType, seq: number): string {
  return `evt_${eventType}_${blockId.slice(0, 8)}_${seq}`;
}
function refDurationToDays(value: number, unit: string): number {
  switch (unit) {
    case 'days': return value;
    case 'months': return value * 30;
    case 'years': return value * 365;
    default: return value * 30;
  }
}
function refCountRecurringPeriods(durationDays: number, periodDays: number): number {
  if (periodDays <= 0) return 1;
  return Math.max(1, Math.ceil(durationDays / periodDays));
}
function refCycleToPeriodDays(cycle: string, customDays?: number): number {
  switch (cycle) {
    case 'monthly': return 30;
    case 'fortnightly': return 14;
    case 'quarterly': return 90;
    case 'halfyearly': return 182;
    case 'annual': return 365;
    case 'custom': return customDays || 30;
    default: return 0;
  }
}
function refCycleLabel(cycle: string): string {
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

interface RefInput {
  startDate: Date; durationValue: number; durationUnit: string;
  selectedBlocks: RefBlock[]; paymentMode: 'prepaid' | 'emi' | 'defined';
  emiMonths: number; perBlockPaymentType: Record<string, 'prepaid' | 'postpaid'>;
  billingCycleType: 'unified' | 'mixed' | null; grandTotal: number; currency: string;
}

function refComputeContractEvents(input: RefInput): RefEvent[] {
  const {
    startDate, durationValue, durationUnit, selectedBlocks,
    paymentMode, emiMonths, perBlockPaymentType, grandTotal, currency,
  } = input;

  const events: RefEvent[] = [];
  const totalDays = refDurationToDays(durationValue, durationUnit);
  const endDate = refAddDays(startDate, totalDays);

  for (const block of selectedBlocks) {
    const hasPricing = refCategoryHasPricing(block.categoryId || '');
    if (!hasPricing || block.unlimited) continue;

    if (block.config?.billingOnly) continue;

    const qty = block.quantity || 1;

    if (block.serviceCycleDays && block.serviceCycleDays > 0 && qty > 1) {
      for (let i = 0; i < qty; i++) {
        const dayOffset = i * block.serviceCycleDays;
        const date = refAddDays(startDate, dayOffset);
        events.push({
          id: refMakeEventId(block.id, 'service', i + 1),
          block_id: block.id, block_name: block.name,
          category_id: block.categoryId || '',
          event_type: 'service', sequence_number: i + 1, total_occurrences: qty,
          scheduled_date: date, original_date: new Date(date), status: 'scheduled',
        });
      }
    } else {
      events.push({
        id: refMakeEventId(block.id, 'service', 1),
        block_id: block.id, block_name: block.name,
        category_id: block.categoryId || '',
        event_type: 'service', sequence_number: 1, total_occurrences: 1,
        scheduled_date: new Date(startDate), original_date: new Date(startDate), status: 'scheduled',
      });
    }
  }

  if (paymentMode === 'prepaid') {
    events.push({
      id: refMakeEventId('contract', 'billing', 1),
      block_id: '_contract', block_name: 'Full Payment (Upfront)', category_id: '',
      event_type: 'billing', billing_sub_type: 'upfront', billing_cycle_label: 'Upfront',
      sequence_number: 1, total_occurrences: 1,
      scheduled_date: new Date(startDate), original_date: new Date(startDate),
      amount: grandTotal, currency, status: 'scheduled',
    });
  } else if (paymentMode === 'emi') {
    const installment = Math.round((grandTotal / emiMonths) * 100) / 100;
    for (let i = 0; i < emiMonths; i++) {
      const date = i === 0 ? new Date(startDate) : refAddMonths(startDate, i);
      events.push({
        id: refMakeEventId('emi', 'billing', i + 1),
        block_id: '_emi', block_name: `EMI Installment`, category_id: '',
        event_type: 'billing', billing_sub_type: 'emi',
        billing_cycle_label: `EMI ${i + 1}/${emiMonths}`,
        sequence_number: i + 1, total_occurrences: emiMonths,
        scheduled_date: date, original_date: new Date(date),
        amount: installment, currency, status: 'scheduled',
      });
    }
  } else if (paymentMode === 'defined') {
    for (const block of selectedBlocks) {
      const hasPricing = refCategoryHasPricing(block.categoryId || '');
      if (!hasPricing || block.unlimited) continue;

      const blockCycle = block.cycle || 'prepaid';
      const blockPayType = perBlockPaymentType[block.id] || 'prepaid';
      const blockTotal = block.totalPrice || 0;

      if (blockCycle === 'prepaid' || blockPayType === 'prepaid') {
        events.push({
          id: refMakeEventId(block.id, 'billing', 1),
          block_id: block.id, block_name: block.name, category_id: block.categoryId || '',
          event_type: 'billing', billing_sub_type: 'upfront', billing_cycle_label: 'Prepaid',
          sequence_number: 1, total_occurrences: 1,
          scheduled_date: new Date(startDate), original_date: new Date(startDate),
          amount: blockTotal, currency: block.currency || currency, status: 'scheduled',
        });
      } else if (blockCycle === 'postpaid') {
        events.push({
          id: refMakeEventId(block.id, 'billing', 1),
          block_id: block.id, block_name: block.name, category_id: block.categoryId || '',
          event_type: 'billing', billing_sub_type: 'on_completion', billing_cycle_label: 'Postpaid',
          sequence_number: 1, total_occurrences: 1,
          scheduled_date: new Date(endDate), original_date: new Date(endDate),
          amount: blockTotal, currency: block.currency || currency, status: 'scheduled',
        });
      } else if (block.config?.cadencePricing) {
        const periodDays = refCycleToPeriodDays(blockCycle, block.customCycleDays);
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
          const date = refAddDays(startDate, i * periodDays);
          if (date > endDate) break;
          events.push({
            id: refMakeEventId(block.id, 'billing', i + 1),
            block_id: block.id, block_name: block.name, category_id: block.categoryId || '',
            event_type: 'billing', billing_sub_type: 'recurring',
            billing_cycle_label: `${refCycleLabel(blockCycle)} ${i + 1}/${count}`,
            sequence_number: i + 1, total_occurrences: count,
            scheduled_date: date, original_date: new Date(date),
            amount: perPeriodAmount, currency: block.currency || currency, status: 'scheduled',
          });
        }
        const emittedFull = events.length - startIdx;
        if (emittedFull === fullPayments && emittedFull > 0) {
          events[events.length - 1].amount =
            Math.round(((blockTotal - finalWithTax) - perPeriodAmount * (fullPayments - 1)) * 100) / 100;
        }
        if (finalWithTax > 0) {
          const date = refAddDays(startDate, fullPayments * periodDays);
          events.push({
            id: refMakeEventId(block.id, 'billing', fullPayments + 1),
            block_id: block.id, block_name: block.name, category_id: block.categoryId || '',
            event_type: 'billing', billing_sub_type: 'recurring',
            billing_cycle_label: `${refCycleLabel(blockCycle)} final (${remMonths} mo)`,
            sequence_number: fullPayments + 1, total_occurrences: count,
            scheduled_date: date > endDate ? new Date(endDate) : date,
            original_date: date > endDate ? new Date(endDate) : new Date(date),
            amount: finalWithTax, currency: block.currency || currency, status: 'scheduled',
          });
        }
      } else {
        const periodDays = refCycleToPeriodDays(blockCycle, block.customCycleDays);
        const count = refCountRecurringPeriods(totalDays, periodDays);
        const perPeriodAmount = Math.round((blockTotal / count) * 100) / 100;

        for (let i = 0; i < count; i++) {
          const date = refAddDays(startDate, i * periodDays);
          if (date > endDate) break;
          events.push({
            id: refMakeEventId(block.id, 'billing', i + 1),
            block_id: block.id, block_name: block.name, category_id: block.categoryId || '',
            event_type: 'billing', billing_sub_type: 'recurring',
            billing_cycle_label: `${refCycleLabel(blockCycle)} ${i + 1}/${count}`,
            sequence_number: i + 1, total_occurrences: count,
            scheduled_date: date, original_date: new Date(date),
            amount: perPeriodAmount, currency: block.currency || currency, status: 'scheduled',
          });
        }
      }
    }
  }

  events.sort((a, b) => {
    const dateDiff = a.scheduled_date.getTime() - b.scheduled_date.getTime();
    if (dateDiff !== 0) return dateDiff;
    if (a.event_type === 'service' && b.event_type === 'billing') return -1;
    if (a.event_type === 'billing' && b.event_type === 'service') return 1;
    return 0;
  });

  return events;
}

// computeEventsForApi formatting (ContractWizard/index.tsx)
function refComputeEventsForApi(
  input: RefInput,
  eventOverrides: Record<string, Date> = {}
): any[] | undefined {
  const rawEvents = refComputeContractEvents(input);
  if (!rawEvents || rawEvents.length === 0) return undefined;

  return rawEvents.map((event) => {
    const overriddenDate = eventOverrides[event.id];
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

// ────────────────────────────────────────────────────────────────────────────
// SCENARIOS
// ────────────────────────────────────────────────────────────────────────────

const START = new Date('2026-08-01T06:30:00.000Z');

const hvacPM: RefBlock = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444', name: 'HVAC Preventive Maintenance',
  categoryId: 'service', quantity: 12, cycle: 'monthly', serviceCycleDays: 30,
  unlimited: false, currency: 'INR', totalPrice: 144000,
};
const chillerDeep: RefBlock = {
  id: 'bbbbbbbb-1111-2222-3333-444444444444', name: 'Chiller Deep Service',
  categoryId: 'service', quantity: 4, cycle: 'quarterly', serviceCycleDays: 90,
  unlimited: false, currency: 'INR', totalPrice: 72000,
};
const compressorSpare: RefBlock = {
  id: 'cccccccc-1111-2222-3333-444444444444', name: 'Compressor Spare',
  categoryId: 'spare', quantity: 1, cycle: 'prepaid',
  unlimited: false, currency: 'INR', totalPrice: 18000,
};
const oneTimeInstall: RefBlock = {
  id: 'dddddddd-1111-2222-3333-444444444444', name: 'Split AC Installation',
  categoryId: 'service', quantity: 1, cycle: 'postpaid',
  unlimited: false, currency: 'INR', totalPrice: 9500,
};
const unlimitedCallout: RefBlock = {
  id: 'eeeeeeee-1111-2222-3333-444444444444', name: 'Unlimited Emergency Call-outs',
  categoryId: 'service', quantity: 1, cycle: 'prepaid',
  unlimited: true, currency: 'INR', totalPrice: 24000,
};
const termsText: RefBlock = {
  id: 'ffffffff-1111-2222-3333-444444444444', name: 'Terms & Conditions',
  categoryId: 'text', quantity: 1, cycle: 'prepaid',
  unlimited: false, currency: 'INR', totalPrice: 0,
};
const cadenceQuarterly: RefBlock = {
  id: '77777777-1111-2222-3333-444444444444', name: 'Multipay AMC (billing only)',
  categoryId: 'service', quantity: 1, cycle: 'quarterly',
  unlimited: false, currency: 'INR', totalPrice: 16800, price: 4200,
  config: {
    billingOnly: true,
    cadencePricing: { baseAmount: 15000, baseMonths: 12, rates: [], defaultCadence: 'monthly' },
  },
};
const cadenceWithFinal: RefBlock = {
  id: '88888888-1111-2222-3333-444444444444', name: 'Cadence With Final Payment',
  categoryId: 'service', quantity: 1, cycle: 'quarterly',
  unlimited: false, currency: 'INR', totalPrice: 11000, price: 4200,
  config: {
    cadenceFinalPayment: 2600,
    cadencePricing: { baseAmount: 15000, baseMonths: 12, rates: [], defaultCadence: 'quarterly' },
  },
};
const cadenceAnnual: RefBlock = {
  id: '66666666-1111-2222-3333-444444444444', name: 'Cadence Annual',
  categoryId: 'service', quantity: 1, cycle: 'annual',
  unlimited: false, currency: 'INR', totalPrice: 15000, price: 15000,
  config: {
    cadencePricing: { baseAmount: 15000, baseMonths: 12, rates: [], defaultCadence: 'annual' },
  },
};
const customCycleBlock: RefBlock = {
  id: '99999999-1111-2222-3333-444444444444', name: 'Water Treatment (45-day cycle)',
  categoryId: 'service', quantity: 8, cycle: 'custom', customCycleDays: 45, serviceCycleDays: 45,
  unlimited: false, currency: 'INR', totalPrice: 56000,
};

interface Scenario {
  name: string;
  input: RefInput;
  overrides?: Record<string, Date>;
}

const SCENARIOS: Scenario[] = [
  {
    name: '1-year AMC, prepaid, recurring PM + unlimited + text block',
    input: {
      startDate: START, durationValue: 1, durationUnit: 'years',
      selectedBlocks: [hvacPM, unlimitedCallout, termsText],
      paymentMode: 'prepaid', emiMonths: 0, perBlockPaymentType: {},
      billingCycleType: 'unified', grandTotal: 198240, currency: 'INR',
    },
  },
  {
    name: '1-year AMC, EMI 5 months, PM + chiller (uneven installment rounding)',
    input: {
      startDate: START, durationValue: 12, durationUnit: 'months',
      selectedBlocks: [hvacPM, chillerDeep],
      paymentMode: 'emi', emiMonths: 5, perBlockPaymentType: {},
      billingCycleType: 'unified', grandTotal: 254880.5, currency: 'INR',
    },
  },
  {
    name: 'defined per-block billing: prepaid spare + postpaid install + monthly PM + quarterly chiller + custom cycle',
    input: {
      startDate: START, durationValue: 1, durationUnit: 'years',
      selectedBlocks: [compressorSpare, oneTimeInstall, hvacPM, chillerDeep, customCycleBlock, unlimitedCallout],
      paymentMode: 'defined', emiMonths: 0,
      perBlockPaymentType: {
        [compressorSpare.id]: 'prepaid',
        [oneTimeInstall.id]: 'postpaid',
        [hvacPM.id]: 'postpaid',       // recurring path (cycle=monthly, not prepaid)
        [chillerDeep.id]: 'postpaid',  // recurring path (cycle=quarterly)
        [customCycleBlock.id]: 'postpaid',
      },
      billingCycleType: 'mixed', grandTotal: 299500, currency: 'INR',
    },
  },
  {
    name: 'cadence-priced billing-only block: 4 quarterly payments, no service events',
    input: {
      startDate: START, durationValue: 1, durationUnit: 'years',
      selectedBlocks: [cadenceQuarterly],
      paymentMode: 'defined', emiMonths: 0,
      perBlockPaymentType: { [cadenceQuarterly.id]: 'postpaid' },
      billingCycleType: 'mixed', grandTotal: 16800, currency: 'INR',
    },
  },
  {
    name: 'cadence with seller-set final payment (8-month term, quarterly)',
    input: {
      startDate: START, durationValue: 8, durationUnit: 'months',
      selectedBlocks: [cadenceWithFinal],
      paymentMode: 'defined', emiMonths: 0,
      perBlockPaymentType: { [cadenceWithFinal.id]: 'postpaid' },
      billingCycleType: 'mixed', grandTotal: 11000, currency: 'INR',
    },
  },
  {
    name: 'cadence annual: single payment for the whole term',
    input: {
      startDate: START, durationValue: 12, durationUnit: 'months',
      selectedBlocks: [cadenceAnnual],
      paymentMode: 'defined', emiMonths: 0,
      perBlockPaymentType: { [cadenceAnnual.id]: 'postpaid' },
      billingCycleType: 'mixed', grandTotal: 15000, currency: 'INR',
    },
  },
  {
    name: '90-day contract in days unit, defined billing, fortnightly cycle',
    input: {
      startDate: START, durationValue: 90, durationUnit: 'days',
      selectedBlocks: [{ ...hvacPM, cycle: 'fortnightly', quantity: 3, serviceCycleDays: 30 }],
      paymentMode: 'defined', emiMonths: 0,
      perBlockPaymentType: { [hvacPM.id]: 'postpaid' },
      billingCycleType: 'unified', grandTotal: 36000, currency: 'INR',
    },
  },
  {
    name: 'event overrides applied (user adjusted two dates in preview)',
    input: {
      startDate: START, durationValue: 6, durationUnit: 'months',
      selectedBlocks: [chillerDeep],
      paymentMode: 'prepaid', emiMonths: 0, perBlockPaymentType: {},
      billingCycleType: 'unified', grandTotal: 72000, currency: 'INR',
    },
    overrides: {
      [`evt_service_${chillerDeep.id.slice(0, 8)}_2`]: new Date('2026-11-20T06:30:00.000Z'),
      [`evt_billing_contract_1`]: new Date('2026-08-05T06:30:00.000Z'),
    },
  },
  {
    name: 'empty: no priced blocks → undefined',
    input: {
      startDate: START, durationValue: 1, durationUnit: 'years',
      selectedBlocks: [termsText],
      paymentMode: 'defined', emiMonths: 0, perBlockPaymentType: {},
      billingCycleType: null, grandTotal: 0, currency: 'INR',
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// RUN
// ────────────────────────────────────────────────────────────────────────────

function stable(v: any): string {
  return JSON.stringify(v, null, 2);
}

let failures = 0;

for (const scenario of SCENARIOS) {
  const expected = refComputeEventsForApi(scenario.input, scenario.overrides || {});

  const serviceInput: DeriveEventsInput = {
    ...scenario.input,
    startDate: scenario.input.startDate.toISOString(), // API receives ISO strings
    eventOverrides: scenario.overrides,
  };
  const actual = deriveComputedEvents(serviceInput);

  const expectedJson = stable(expected ?? null);
  const actualJson = stable(actual ?? null);

  if (expectedJson === actualJson) {
    const n = expected ? expected.length : 0;
    console.log(`✅ PARITY  ${scenario.name}  (${n} events)`);
  } else {
    failures++;
    console.error(`❌ MISMATCH  ${scenario.name}`);
    const expLines = expectedJson.split('\n');
    const actLines = actualJson.split('\n');
    const max = Math.max(expLines.length, actLines.length);
    for (let i = 0; i < max; i++) {
      if (expLines[i] !== actLines[i]) {
        console.error(`   line ${i + 1}:`);
        console.error(`     UI     : ${expLines[i] ?? '<missing>'}`);
        console.error(`     backend: ${actLines[i] ?? '<missing>'}`);
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n❌ ${failures} scenario(s) failed parity`);
  process.exit(1);
} else {
  console.log(`\n✅ All ${SCENARIOS.length} scenarios byte-identical to the ContractWizard algorithm`);
  process.exit(0);
}
