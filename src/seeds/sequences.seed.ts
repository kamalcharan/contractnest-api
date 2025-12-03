// src/seeds/sequences.seed.ts
// Sequence Numbers seed data - Single source of truth

import { SeedDefinition, SeedItem } from './types';

// Default sequence configurations
export const SEQUENCE_SEED_DATA: SeedItem[] = [
  {
    code: 'CONTACT',
    name: 'Contact Number',
    description: 'Auto-generated number for contacts',
    prefix: 'CT',
    separator: '-',
    suffix: '',
    padding_length: 4,
    start_value: 1001,
    reset_frequency: 'NEVER',
    increment_by: 1,
    hexcolor: '#3B82F6',  // Blue
    icon_name: 'Users',
    is_deletable: false,
    sequence_order: 1
  },
  {
    code: 'CONTRACT',
    name: 'Contract Number',
    description: 'Auto-generated number for contracts',
    prefix: 'CN',
    separator: '-',
    suffix: '',
    padding_length: 4,
    start_value: 1001,
    reset_frequency: 'YEARLY',
    increment_by: 1,
    hexcolor: '#10B981',  // Green
    icon_name: 'FileText',
    is_deletable: false,
    sequence_order: 2
  },
  {
    code: 'INVOICE',
    name: 'Invoice Number',
    description: 'Auto-generated number for invoices',
    prefix: 'INV',
    separator: '-',
    suffix: '',
    padding_length: 5,
    start_value: 10001,
    reset_frequency: 'YEARLY',
    increment_by: 1,
    hexcolor: '#F59E0B',  // Amber
    icon_name: 'Receipt',
    is_deletable: false,
    sequence_order: 3
  },
  {
    code: 'QUOTATION',
    name: 'Quotation Number',
    description: 'Auto-generated number for quotations',
    prefix: 'QT',
    separator: '-',
    suffix: '',
    padding_length: 4,
    start_value: 1001,
    reset_frequency: 'YEARLY',
    increment_by: 1,
    hexcolor: '#8B5CF6',  // Purple
    icon_name: 'FileQuestion',
    is_deletable: false,
    sequence_order: 4
  },
  {
    code: 'RECEIPT',
    name: 'Receipt Number',
    description: 'Auto-generated number for receipts',
    prefix: 'RCP',
    separator: '-',
    suffix: '',
    padding_length: 5,
    start_value: 10001,
    reset_frequency: 'YEARLY',
    increment_by: 1,
    hexcolor: '#EC4899',  // Pink
    icon_name: 'CreditCard',
    is_deletable: false,
    sequence_order: 5
  },
  {
    code: 'PROJECT',
    name: 'Project Number',
    description: 'Auto-generated number for projects',
    prefix: 'PRJ',
    separator: '-',
    suffix: '',
    padding_length: 4,
    start_value: 1001,
    reset_frequency: 'YEARLY',
    increment_by: 1,
    hexcolor: '#06B6D4',  // Cyan
    icon_name: 'Folder',
    is_deletable: true,
    sequence_order: 6
  },
  {
    code: 'TASK',
    name: 'Task Number',
    description: 'Auto-generated number for tasks',
    prefix: 'TSK',
    separator: '-',
    suffix: '',
    padding_length: 5,
    start_value: 10001,
    reset_frequency: 'NEVER',
    increment_by: 1,
    hexcolor: '#64748B',  // Slate
    icon_name: 'CheckSquare',
    is_deletable: true,
    sequence_order: 7
  },
  {
    code: 'TICKET',
    name: 'Support Ticket Number',
    description: 'Auto-generated number for support tickets',
    prefix: 'TKT',
    separator: '-',
    suffix: '',
    padding_length: 5,
    start_value: 10001,
    reset_frequency: 'YEARLY',
    increment_by: 1,
    hexcolor: '#EF4444',  // Red
    icon_name: 'Ticket',
    is_deletable: true,
    sequence_order: 8
  }
];

// Generate sequence preview string
export const generateSequencePreview = (item: SeedItem): string => {
  const paddedNumber = String(item.start_value).padStart(item.padding_length, '0');
  return `${item.prefix}${item.separator}${paddedNumber}${item.suffix || ''}`;
};

// Transform seed data to t_category_details structure
export const transformSequenceForDB = (
  item: SeedItem,
  tenantId: string,
  isLive: boolean,
  categoryId?: string
): any => {
  return {
    tenant_id: tenantId,
    category_id: categoryId || '',
    sub_cat_name: item.code,
    display_name: item.name,
    description: item.description,
    hexcolor: item.hexcolor,
    icon_name: item.icon_name,
    sequence_no: item.sequence_order,
    is_active: true,
    is_deletable: item.is_deletable,
    is_live: isLive,
    form_settings: {
      prefix: item.prefix,
      separator: item.separator,
      suffix: item.suffix || '',
      padding_length: item.padding_length,
      start_value: item.start_value,
      increment_by: item.increment_by,
      reset_frequency: item.reset_frequency
    }
  };
};

// Seed definition for registry
export const sequencesSeedDefinition: SeedDefinition = {
  category: 'sequences',
  displayName: 'Sequence Numbers',
  targetTable: 't_category_details',
  dependsOn: [],  // No dependencies
  data: SEQUENCE_SEED_DATA,
  transform: transformSequenceForDB,
  order: 1,
  isRequired: true,
  description: 'Auto-generated number formats for contacts, invoices, contracts, and more'
};

// Entity display names mapping
export const ENTITY_DISPLAY_NAMES: Record<string, string> = {
  CONTACT: 'Contacts',
  CONTRACT: 'Contracts',
  INVOICE: 'Invoices',
  QUOTATION: 'Quotations',
  RECEIPT: 'Receipts',
  PROJECT: 'Projects',
  TASK: 'Tasks',
  TICKET: 'Support Tickets',
};

// Reset frequency options
export const RESET_FREQUENCY_OPTIONS = [
  { value: 'NEVER', label: 'Never' },
  { value: 'YEARLY', label: 'Yearly (Jan 1st)' },
  { value: 'MONTHLY', label: 'Monthly (1st of month)' },
  { value: 'QUARTERLY', label: 'Quarterly (Apr, Jul, Oct, Jan)' }
] as const;
