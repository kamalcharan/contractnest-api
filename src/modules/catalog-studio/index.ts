// backend/src/modules/catalog-studio/index.ts
/**
 * Catalog Studio API
 * Main entry point for catalog studio module
 */

// Types
export * from './catalogStudioTypes';

// Services
export { CatBlocksService, catBlocksService } from './catBlocksService';
export { CatTemplatesService, catTemplatesService } from './catTemplatesService';

// Controller
export { catalogStudioController } from './catalogStudioController';

// Routes
export { default as catalogStudioRoutes } from './catalogStudioRoutes';
