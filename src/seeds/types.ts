// src/seeds/types.ts
// Type definitions for the Seed Registry

export interface SeedItem {
  [key: string]: any;
}

export interface SeedDefinition {
  // Unique category identifier
  category: string;

  // Display name for UI
  displayName: string;

  // Target table(s) for this seed
  targetTable: string;

  // Dependencies - these must be seeded first
  dependsOn?: string[];

  // The actual seed data
  data: SeedItem[];

  // Transform function to map seed data to table structure
  transform?: (item: SeedItem, tenantId: string, isLive: boolean, categoryId?: string) => any;

  // Order for seeding (lower = first)
  order: number;

  // Whether this seed is required during onboarding
  isRequired: boolean;

  // Description for documentation
  description: string;

  // Product code - optional, if set only seeds for this product (e.g., 'familyknows', 'contractnest')
  productCode?: string;
}

export interface SeedResult {
  success: boolean;
  category: string;
  displayName: string;
  inserted: number;
  skipped: number;
  errors: string[];
  items?: string[];
}

export interface TenantSeedResult {
  success: boolean;
  tenantId: string;
  environment: 'live' | 'test';
  results: SeedResult[];
  totalInserted: number;
  totalSkipped: number;
  errors: string[];
  timestamp: string;
}

export interface SeedPreview {
  category: string;
  displayName: string;
  description: string;
  itemCount: number;
  items: Array<{
    code: string;
    name: string;
    preview?: string;
  }>;
  productCode?: string;
}

export interface SeedStatus {
  category: string;
  isSeeded: boolean;
  count: number;
  lastSeededAt?: string;
}
