// src/seeds/SeedRegistry.ts
// Central registry and orchestrator for all tenant seed data

import {
  SeedDefinition,
  SeedResult,
  TenantSeedResult,
  SeedPreview,
  SeedStatus
} from './types';
import {
  sequencesSeedDefinition,
  SEQUENCE_SEED_DATA,
  generateSequencePreview
} from './sequences.seed';

// =================================================================
// SEED REGISTRY
// Add new seed definitions here as the system grows
// =================================================================

export const SeedRegistry: Record<string, SeedDefinition> = {
  sequences: sequencesSeedDefinition,
  // Future seeds:
  // roles: rolesSeedDefinition,
  // tags: tagsSeedDefinition,
  // statuses: statusesSeedDefinition,
  // notifications: notificationsSeedDefinition,
};

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * Topological sort for seed dependencies
 * Ensures seeds are executed in correct order based on dependencies
 */
export const sortSeedsByDependencies = (categories: string[]): string[] => {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (category: string) => {
    if (visited.has(category)) return;
    if (visiting.has(category)) {
      throw new Error(`Circular dependency detected for seed: ${category}`);
    }

    visiting.add(category);

    const definition = SeedRegistry[category];
    if (definition?.dependsOn) {
      for (const dep of definition.dependsOn) {
        if (categories.includes(dep)) {
          visit(dep);
        }
      }
    }

    visiting.delete(category);
    visited.add(category);
    sorted.push(category);
  };

  // Sort by order first, then apply dependency sorting
  const orderedCategories = categories.sort((a, b) => {
    const orderA = SeedRegistry[a]?.order ?? 999;
    const orderB = SeedRegistry[b]?.order ?? 999;
    return orderA - orderB;
  });

  for (const category of orderedCategories) {
    visit(category);
  }

  return sorted;
};

/**
 * Get all registered seed categories
 */
export const getAllSeedCategories = (): string[] => {
  return Object.keys(SeedRegistry);
};

/**
 * Get required seed categories (for onboarding)
 */
export const getRequiredSeedCategories = (): string[] => {
  return Object.entries(SeedRegistry)
    .filter(([_, def]) => def.isRequired)
    .map(([key]) => key);
};

/**
 * Get seed definition by category
 */
export const getSeedDefinition = (category: string): SeedDefinition | undefined => {
  return SeedRegistry[category];
};

/**
 * Get preview data for a seed category (for UI display)
 */
export const getSeedPreview = (category: string): SeedPreview | null => {
  const definition = SeedRegistry[category];
  if (!definition) return null;

  let items: Array<{ code: string; name: string; preview?: string }> = [];

  if (category === 'sequences') {
    items = SEQUENCE_SEED_DATA.map(item => ({
      code: item.code,
      name: item.name,
      preview: generateSequencePreview(item)
    }));
  } else {
    // Generic mapping for other seed types
    items = definition.data.map(item => ({
      code: item.code || item.id || 'unknown',
      name: item.name || item.display_name || item.code || 'Unknown'
    }));
  }

  return {
    category: definition.category,
    displayName: definition.displayName,
    description: definition.description,
    itemCount: definition.data.length,
    items
  };
};

/**
 * Get all seed previews
 */
export const getAllSeedPreviews = (): SeedPreview[] => {
  return getAllSeedCategories()
    .map(category => getSeedPreview(category))
    .filter((preview): preview is SeedPreview => preview !== null);
};

/**
 * Get seed data for a category
 */
export const getSeedData = (category: string): any[] => {
  const definition = SeedRegistry[category];
  return definition?.data || [];
};

// =================================================================
// EXPORTS
// =================================================================

export {
  SEQUENCE_SEED_DATA,
  generateSequencePreview,
  sequencesSeedDefinition
} from './sequences.seed';

export * from './types';
