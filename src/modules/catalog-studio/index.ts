// backend/src/modules/catalog-studio/index.ts
/**
 * Catalog Studio API
 * Main entry point for catalog studio module
 */

// Types
export * from '../../types/catalogStudioTypes';

// Services
export { CatBlocksService, catBlocksService } from '../../services/catBlocksService';
export { CatTemplatesService, catTemplatesService } from '../../services/catTemplatesService';

// Controller
export { catalogStudioController } from '../../controllers/catalogStudioController';

// Routes
export { default as catalogStudioRoutes } from '../../routes/catalogStudioRoutes';
