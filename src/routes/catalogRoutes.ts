// src/routes/catalogRoutes.ts
import express from 'express';
import {
  listCatalogItems,
  getCatalogItem,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  restoreCatalogItem,
  getVersionHistory,
  upsertPricing,
  getCatalogPricing,
  deletePricing,
  getTenantCurrencies,
  updateCurrencyPricing,
  deleteCurrencyPricing
} from '../controllers/catalogController';
import { validateCatalogInput, validatePricingInput } from '../middleware/catalogValidation';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Middleware to ensure tenant ID is present
const ensureTenant = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    return res.status(400).json({ error: 'x-tenant-id header is required' });
  }
  next();
};

// Apply tenant check to all routes
router.use(ensureTenant);

// Catalog routes
router.get('/', listCatalogItems);
router.post('/', validateCatalogInput('create'), createCatalogItem);
router.get('/:id', getCatalogItem);
router.put('/:id', validateCatalogInput('update'), updateCatalogItem);
router.delete('/:id', deleteCatalogItem);

// Special operations
router.post('/restore/:id', restoreCatalogItem);
router.get('/versions/:id', getVersionHistory);

// Multi-currency endpoints (matching what catalogService expects)
router.get('/multi-currency', getTenantCurrencies); // Get all currencies used by tenant
router.get('/multi-currency/:catalogId', getCatalogPricing); // Get pricing for catalog item
router.post('/multi-currency', upsertPricing); // Create/update multi-currency pricing
router.put('/multi-currency/:catalogId/:currency', updateCurrencyPricing);
router.delete('/multi-currency/:catalogId/:currency', deleteCurrencyPricing);

// Legacy pricing routes (keep for backward compatibility)
router.post('/pricing/:catalogId', validatePricingInput(), upsertPricing);
router.get('/pricing/:catalogId', getCatalogPricing);
router.delete('/pricing/:catalogId/:pricingId', deletePricing);

export default router;