// src/seeds/relationships.seed.ts
// Family Relationships seed data for FamilyKnows
// Uses the existing Roles category master

import { SeedDefinition, SeedItem } from './types';

// FK Relationship seed data - stored in t_category_details under 'roles' category
export const RELATIONSHIP_SEED_DATA: SeedItem[] = [
  {
    code: 'FATHER',
    name: 'Father',
    description: 'Male parent',
    hexcolor: '#3B82F6',  // Blue
    icon_name: 'human-male',
    is_deletable: false,
    sequence_order: 1
  },
  {
    code: 'MOTHER',
    name: 'Mother',
    description: 'Female parent',
    hexcolor: '#EC4899',  // Pink
    icon_name: 'human-female',
    is_deletable: false,
    sequence_order: 2
  },
  {
    code: 'SPOUSE',
    name: 'Spouse',
    description: 'Husband or Wife',
    hexcolor: '#EF4444',  // Red (love)
    icon_name: 'heart',
    is_deletable: false,
    sequence_order: 3
  },
  {
    code: 'SON',
    name: 'Son',
    description: 'Male child',
    hexcolor: '#10B981',  // Green
    icon_name: 'human-male-boy',
    is_deletable: false,
    sequence_order: 4
  },
  {
    code: 'DAUGHTER',
    name: 'Daughter',
    description: 'Female child',
    hexcolor: '#8B5CF6',  // Purple
    icon_name: 'human-female-girl',
    is_deletable: false,
    sequence_order: 5
  },
  {
    code: 'BROTHER',
    name: 'Brother',
    description: 'Male sibling',
    hexcolor: '#06B6D4',  // Cyan
    icon_name: 'account-multiple',
    is_deletable: false,
    sequence_order: 6
  },
  {
    code: 'SISTER',
    name: 'Sister',
    description: 'Female sibling',
    hexcolor: '#F472B6',  // Light pink
    icon_name: 'account-multiple',
    is_deletable: false,
    sequence_order: 7
  },
  {
    code: 'GRANDMOTHER',
    name: 'Grand Mother',
    description: 'Mother of parent',
    hexcolor: '#F59E0B',  // Amber
    icon_name: 'human-female',
    is_deletable: false,
    sequence_order: 8
  },
  {
    code: 'GRANDDAUGHTER',
    name: 'Grand Daughter',
    description: 'Daughter of child',
    hexcolor: '#A855F7',  // Violet
    icon_name: 'human-female-girl',
    is_deletable: false,
    sequence_order: 9
  },
  {
    code: 'GUARDIAN',
    name: 'Guardian',
    description: 'Legal guardian or caretaker',
    hexcolor: '#6366F1',  // Indigo
    icon_name: 'shield-account',
    is_deletable: false,
    sequence_order: 10
  },
  {
    code: 'EXECUTOR',
    name: 'Executor',
    description: 'Estate executor or power of attorney',
    hexcolor: '#64748B',  // Slate
    icon_name: 'briefcase-account',
    is_deletable: false,
    sequence_order: 11
  },
  {
    code: 'OTHER',
    name: 'Other',
    description: 'Other family member or relation',
    hexcolor: '#78716C',  // Stone
    icon_name: 'account-question',
    is_deletable: true,
    sequence_order: 12
  }
];

// Transform seed data to t_category_details structure
export const transformRelationshipForDB = (
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
    form_settings: null  // Relationships don't need form settings
  };
};

// Seed definition for registry
export const relationshipsSeedDefinition: SeedDefinition = {
  category: 'relationships',
  displayName: 'Family Relationships',
  targetTable: 't_category_details',
  dependsOn: [],  // No dependencies
  data: RELATIONSHIP_SEED_DATA,
  transform: transformRelationshipForDB,
  order: 2,  // After sequences
  isRequired: true,
  description: 'Family relationship types for FamilyKnows (Father, Mother, Spouse, etc.)',
  // This seed is specifically for FamilyKnows product
  productCode: 'familyknows'
};

// Export relationship display names for UI
export const RELATIONSHIP_DISPLAY_NAMES: Record<string, string> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  SPOUSE: 'Spouse',
  SON: 'Son',
  DAUGHTER: 'Daughter',
  BROTHER: 'Brother',
  SISTER: 'Sister',
  GRANDMOTHER: 'Grand Mother',
  GRANDDAUGHTER: 'Grand Daughter',
  GUARDIAN: 'Guardian',
  EXECUTOR: 'Executor',
  OTHER: 'Other',
};

// Export relationship icons for UI (MaterialCommunityIcons names)
export const RELATIONSHIP_ICONS: Record<string, string> = {
  FATHER: 'human-male',
  MOTHER: 'human-female',
  SPOUSE: 'heart',
  SON: 'human-male-boy',
  DAUGHTER: 'human-female-girl',
  BROTHER: 'account-multiple',
  SISTER: 'account-multiple',
  GRANDMOTHER: 'human-female',
  GRANDDAUGHTER: 'human-female-girl',
  GUARDIAN: 'shield-account',
  EXECUTOR: 'briefcase-account',
  OTHER: 'account-question',
};

// Export relationship colors for UI
export const RELATIONSHIP_COLORS: Record<string, string> = {
  FATHER: '#3B82F6',
  MOTHER: '#EC4899',
  SPOUSE: '#EF4444',
  SON: '#10B981',
  DAUGHTER: '#8B5CF6',
  BROTHER: '#06B6D4',
  SISTER: '#F472B6',
  GRANDMOTHER: '#F59E0B',
  GRANDDAUGHTER: '#A855F7',
  GUARDIAN: '#6366F1',
  EXECUTOR: '#64748B',
  OTHER: '#78716C',
};
