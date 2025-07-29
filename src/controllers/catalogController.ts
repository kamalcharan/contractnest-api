// src/controllers/catalogController.ts
import { Request, Response } from 'express';
import catalogService from '../services/catalogService';
import { captureException } from '../utils/sentry';

// Since we're having issues with type imports, let's define what we need locally
interface CatalogListParams {
  catalogType?: number;
  includeInactive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 50,
  MAX_LIMIT: 100
};

// Helper function to validate catalog type
const isCatalogType = (value: any): boolean => {
  return [1, 2, 3, 4].includes(value);
};

/**
 * List all catalog items with filtering and pagination
 */
export const listCatalogItems = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    // Parse query parameters
    const params: CatalogListParams = {
      catalogType: req.query.catalogType ? parseInt(req.query.catalogType as string) : undefined,
      includeInactive: req.query.includeInactive === 'true',
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : PAGINATION_DEFAULTS.PAGE,
      limit: req.query.limit ? parseInt(req.query.limit as string) : PAGINATION_DEFAULTS.LIMIT
    };

    // Validate catalog type if provided
    if (params.catalogType && !isCatalogType(params.catalogType)) {
      return res.status(400).json({ 
        error: 'Invalid catalog type',
        validTypes: [1, 2, 3, 4]
      });
    }

    // Validate pagination
    if (params.limit && params.limit > PAGINATION_DEFAULTS.MAX_LIMIT) {
      params.limit = PAGINATION_DEFAULTS.MAX_LIMIT;
    }

    const result = await catalogService.listCatalogItems(authHeader, tenantId, params);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error listing catalog items:', error);
    captureException(error, {
      tags: { component: 'CatalogController', action: 'listCatalogItems' },
      extra: { tenantId: req.headers['x-tenant-id'] }
    });

    return res.status(500).json({ 
      error: 'Failed to retrieve catalog items',
      message: error.message 
    });
  }
};

/**
 * Get single catalog item by ID
 */
export const getCatalogItem = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const catalogId = req.params.id;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!catalogId) {
      return res.status(400).json({ error: 'Catalog ID is required' });
    }

    const result = await catalogService.getCatalogItem(authHeader, tenantId, catalogId);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error getting catalog item:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Catalog item not found' });
    }

    captureException(error, {
      tags: { component: 'CatalogController', action: 'getCatalogItem' },
      extra: { catalogId: req.params.id, tenantId: req.headers['x-tenant-id'] }
    });

    return res.status(500).json({ 
      error: 'Failed to retrieve catalog item',
      message: error.message 
    });
  }
};

/**
 * Create new catalog item
 */
export const createCatalogItem = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    const data = req.body;

    // Validate required fields
    if (!data.catalog_type || !data.name || !data.description) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['catalog_type', 'name', 'description']
      });
    }

    // Validate catalog data
    const validation = catalogService.validateCatalogData(data);
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Invalid catalog data',
        errors: validation.errors 
      });
    }

    // Generate idempotency key if not provided
    const finalIdempotencyKey = idempotencyKey || 
      catalogService.generateIdempotencyKey('create', data);

    const result = await catalogService.createCatalogItem(
      authHeader, 
      tenantId, 
      data, 
      finalIdempotencyKey
    );

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Error creating catalog item:', error);

    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }

    captureException(error, {
      tags: { component: 'CatalogController', action: 'createCatalogItem' },
      extra: { tenantId: req.headers['x-tenant-id'], data: req.body }
    });

    return res.status(500).json({ 
      error: 'Failed to create catalog item',
      message: error.message 
    });
  }
};

/**
 * Update catalog item (creates new version)
 */
export const updateCatalogItem = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const catalogId = req.params.id;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!catalogId) {
      return res.status(400).json({ error: 'Catalog ID is required' });
    }

    const data = req.body;

    // Validate update data
    const validation = catalogService.validateCatalogData(data);
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Invalid catalog data',
        errors: validation.errors 
      });
    }

    // Generate idempotency key if not provided
    const finalIdempotencyKey = idempotencyKey || 
      catalogService.generateIdempotencyKey('update', { catalogId, ...data });

    const result = await catalogService.updateCatalogItem(
      authHeader, 
      tenantId, 
      catalogId,
      data, 
      finalIdempotencyKey
    );

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error updating catalog item:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Catalog item not found' });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }

    captureException(error, {
      tags: { component: 'CatalogController', action: 'updateCatalogItem' },
      extra: { catalogId: req.params.id, tenantId: req.headers['x-tenant-id'] }
    });

    return res.status(500).json({ 
      error: 'Failed to update catalog item',
      message: error.message 
    });
  }
};

/**
 * Delete catalog item (soft delete)
 */
export const deleteCatalogItem = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const catalogId = req.params.id;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!catalogId) {
      return res.status(400).json({ error: 'Catalog ID is required' });
    }

    const result = await catalogService.deleteCatalogItem(authHeader, tenantId, catalogId);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error deleting catalog item:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Catalog item not found' });
    }

    if (error.message.includes('already deleted')) {
      return res.status(400).json({ error: error.message });
    }

    captureException(error, {
      tags: { component: 'CatalogController', action: 'deleteCatalogItem' },
      extra: { catalogId: req.params.id, tenantId: req.headers['x-tenant-id'] }
    });

    return res.status(500).json({ 
      error: 'Failed to delete catalog item',
      message: error.message 
    });
  }
};

/**
 * Restore deleted catalog item
 */
export const restoreCatalogItem = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const catalogId = req.params.id;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!catalogId) {
      return res.status(400).json({ error: 'Catalog ID is required' });
    }

    // Generate idempotency key if not provided
    const finalIdempotencyKey = idempotencyKey || 
      catalogService.generateIdempotencyKey('restore', { catalogId });

    const result = await catalogService.restoreCatalogItem(
      authHeader, 
      tenantId, 
      catalogId,
      finalIdempotencyKey
    );

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error restoring catalog item:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Catalog item not found' });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }

    captureException(error, {
      tags: { component: 'CatalogController', action: 'restoreCatalogItem' },
      extra: { catalogId: req.params.id, tenantId: req.headers['x-tenant-id'] }
    });

    return res.status(500).json({ 
      error: 'Failed to restore catalog item',
      message: error.message 
    });
  }
};

/**
 * Get version history for catalog item
 */
export const getVersionHistory = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const catalogId = req.params.id;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!catalogId) {
      return res.status(400).json({ error: 'Catalog ID is required' });
    }

    const result = await catalogService.getVersionHistory(authHeader, tenantId, catalogId);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error getting version history:', error);

    captureException(error, {
      tags: { component: 'CatalogController', action: 'getVersionHistory' },
      extra: { catalogId: req.params.id, tenantId: req.headers['x-tenant-id'] }
    });

    return res.status(500).json({ 
      error: 'Failed to retrieve version history',
      message: error.message 
    });
  }
};

/**
 * Add or update pricing for catalog item (supports multi-currency)
 */
export const upsertPricing = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const catalogId = req.params.catalogId;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!catalogId) {
      return res.status(400).json({ error: 'Catalog ID is required' });
    }

    const data = req.body;

    // Check if this is multi-currency request
    if (data.currencies && Array.isArray(data.currencies)) {
      // Multi-currency request
      
      // Validate multi-currency data
      const validation = catalogService.validateMultiCurrencyPricingData(data);
      if (!validation.isValid) {
        return res.status(400).json({ 
          error: 'Invalid pricing data',
          errors: validation.errors 
        });
      }

      // Generate idempotency key if not provided
      const finalIdempotencyKey = idempotencyKey || 
        catalogService.generateIdempotencyKey('multi-pricing', { catalogId, ...data });

      const result = await catalogService.upsertMultiCurrencyPricing(
        authHeader, 
        tenantId, 
        catalogId,
        data, 
        finalIdempotencyKey
      );

      return res.status(201).json(result);
    } else {
      // Single currency request (backward compatibility)
      
      // Validate pricing data
      const validation = catalogService.validatePricingData(data);
      if (!validation.isValid) {
        return res.status(400).json({ 
          error: 'Invalid pricing data',
          errors: validation.errors 
        });
      }

      // Generate idempotency key if not provided
      const finalIdempotencyKey = idempotencyKey || 
        catalogService.generateIdempotencyKey('pricing', { catalogId, ...data });

      const result = await catalogService.upsertPricing(
        authHeader, 
        tenantId, 
        catalogId,
        data, 
        finalIdempotencyKey
      );

      return res.status(201).json(result);
    }
  } catch (error: any) {
    console.error('Error upserting pricing:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Catalog item not found' });
    }

    captureException(error, {
      tags: { component: 'CatalogController', action: 'upsertPricing' },
      extra: { catalogId: req.params.catalogId, tenantId: req.headers['x-tenant-id'] }
    });

    return res.status(500).json({ 
      error: 'Failed to update pricing',
      message: error.message 
    });
  }
};

/**
 * Get pricing for catalog item (returns multi-currency data)
 */
export const getCatalogPricing = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const catalogId = req.params.catalogId;
    const detailed = req.query.detailed === 'true';

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!catalogId) {
      return res.status(400).json({ error: 'Catalog ID is required' });
    }

    let result;
    if (detailed) {
      // Get detailed pricing with currency grouping
      result = await catalogService.getCatalogPricingDetails(authHeader, tenantId, catalogId);
    } else {
      // Get simple pricing list
      result = await catalogService.getCatalogPricing(authHeader, tenantId, catalogId);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error getting catalog pricing:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Catalog item not found' });
    }

    captureException(error, {
      tags: { component: 'CatalogController', action: 'getCatalogPricing' },
      extra: { catalogId: req.params.catalogId, tenantId: req.headers['x-tenant-id'] }
    });

    return res.status(500).json({ 
      error: 'Failed to retrieve pricing',
      message: error.message 
    });
  }
};

/**
 * Delete specific pricing (legacy endpoint)
 */
export const deletePricing = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const catalogId = req.params.catalogId;
    const pricingId = req.params.pricingId;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!catalogId || !pricingId) {
      return res.status(400).json({ error: 'Catalog ID and Pricing ID are required' });
    }

    const result = await catalogService.deletePricing(
      authHeader, 
      tenantId, 
      catalogId,
      pricingId
    );

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error deleting pricing:', error);

    captureException(error, {
      tags: { component: 'CatalogController', action: 'deletePricing' },
      extra: { 
        catalogId: req.params.catalogId, 
        pricingId: req.params.pricingId,
        tenantId: req.headers['x-tenant-id'] 
      }
    });

    return res.status(500).json({ 
      error: 'Failed to delete pricing',
      message: error.message 
    });
  }
};

/**
 * Get all currencies used by tenant
 */
export const getTenantCurrencies = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    const result = await catalogService.getTenantCurrencies(authHeader, tenantId);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error getting tenant currencies:', error);
    
    captureException(error, {
      tags: { component: 'CatalogController', action: 'getTenantCurrencies' },
      extra: { tenantId: req.headers['x-tenant-id'] }
    });

    return res.status(500).json({ 
      error: 'Failed to retrieve currencies',
      message: error.message 
    });
  }
};

/**
 * Update pricing for specific currency
 */
export const updateCurrencyPricing = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const catalogId = req.params.catalogId;
    const currency = req.params.currency?.toUpperCase();

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!catalogId || !currency) {
      return res.status(400).json({ error: 'Catalog ID and currency are required' });
    }

    const data = req.body;

    // Validate currency format
    if (!/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({ error: 'Currency must be a 3-letter code' });
    }

    // Validate price
    if (data.price !== undefined && (isNaN(Number(data.price)) || Number(data.price) < 0)) {
      return res.status(400).json({ error: 'Price must be a non-negative number' });
    }

    const result = await catalogService.updateCurrencyPricing(
      authHeader,
      tenantId,
      catalogId,
      currency,
      data
    );

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error updating currency pricing:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Pricing not found for this currency' });
    }

    captureException(error, {
      tags: { component: 'CatalogController', action: 'updateCurrencyPricing' },
      extra: { 
        catalogId: req.params.catalogId,
        currency: req.params.currency,
        tenantId: req.headers['x-tenant-id'] 
      }
    });

    return res.status(500).json({ 
      error: 'Failed to update pricing',
      message: error.message 
    });
  }
};

/**
 * Delete pricing for specific currency
 */
export const deleteCurrencyPricing = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const catalogId = req.params.catalogId;
    const currency = req.params.currency?.toUpperCase();
    const priceType = req.query.price_type as string || 'Fixed';

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!catalogId || !currency) {
      return res.status(400).json({ error: 'Catalog ID and currency are required' });
    }

    // Validate currency format
    if (!/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({ error: 'Currency must be a 3-letter code' });
    }

    const result = await catalogService.deleteCurrencyPricing(
      authHeader,
      tenantId,
      catalogId,
      currency,
      priceType
    );

    return res.status(200).json({
      success: true,
      message: `Pricing for ${currency} deleted successfully`
    });
  } catch (error: any) {
    console.error('Error deleting currency pricing:', error);
    
    if (error.message.includes('base currency')) {
      return res.status(400).json({ error: 'Cannot delete base currency pricing' });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Pricing not found for this currency' });
    }

    captureException(error, {
      tags: { component: 'CatalogController', action: 'deleteCurrencyPricing' },
      extra: { 
        catalogId: req.params.catalogId,
        currency: req.params.currency,
        priceType: req.query.price_type,
        tenantId: req.headers['x-tenant-id'] 
      }
    });

    return res.status(500).json({ 
      error: 'Failed to delete pricing',
      message: error.message 
    });
  }
};