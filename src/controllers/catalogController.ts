// src/controllers/catalogController.ts
// Express API controllers for catalog management
// CLEAN VERSION - Aligned with catalogService and Edge Functions

import { Request, Response } from 'express';
import catalogService from '../services/catalogService';
import { captureException } from '../utils/sentry';
import type {
  CatalogListParams,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
  CreateMultiCurrencyPricingRequest,
  CatalogItemType
} from '../types/catalogTypes';
import { PAGINATION_DEFAULTS } from '../types/catalogTypes';

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * Validate catalog type parameter
 */
const isCatalogType = (value: any): boolean => {
  return [1, 2, 3, 4].includes(value);
};

/**
 * Extract and validate common headers
 */
const extractHeaders = (req: Request): { authHeader: string; tenantId: string } => {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'] as string;

  if (!authHeader) {
    throw new Error('Authorization header is required');
  }

  if (!tenantId) {
    throw new Error('x-tenant-id header is required');
  }

  return { authHeader, tenantId };
};

/**
 * Handle controller errors consistently
 */
const handleControllerError = (
  error: any,
  res: Response,
  operation: string,
  context?: Record<string, any>
) => {
  console.error(`Error in ${operation}:`, error);
  
  // Log to Sentry with context
  captureException(error, {
    tags: { component: 'CatalogController', action: operation },
    extra: context || {}
  });

  // Determine status code and message
  let statusCode = 500;
  let message = error.message || 'Internal server error';

  if (error.message.includes('not found')) {
    statusCode = 404;
  } else if (error.message.includes('already exists') || error.message.includes('duplicate')) {
    statusCode = 409;
  } else if (error.message.includes('validation') || error.message.includes('invalid')) {
    statusCode = 400;
  } else if (error.message.includes('unauthorized') || error.message.includes('forbidden')) {
    statusCode = 401;
  } else if (error.message.includes('rate limit')) {
    statusCode = 429;
  }

  return res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  });
};

// =================================================================
// MAIN CATALOG OPERATIONS
// =================================================================

/**
 * List all catalog items with filtering and pagination
 */
export const listCatalogItems = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);

    // Parse and validate query parameters
    const params: CatalogListParams = {
      catalogType: req.query.catalogType ? parseInt(req.query.catalogType as string) : undefined,
      includeInactive: req.query.includeInactive === 'true',
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : PAGINATION_DEFAULTS.PAGE,
      limit: req.query.limit ? parseInt(req.query.limit as string) : PAGINATION_DEFAULTS.LIMIT,
      sortBy: req.query.sortBy as 'name' | 'created_at' | 'updated_at' | 'type' | 'version',
      sortOrder: req.query.sortOrder as 'asc' | 'desc'
    };

    // Validate catalog type if provided
    if (params.catalogType && !isCatalogType(params.catalogType)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid catalog type',
        validTypes: [1, 2, 3, 4],
        message: '1=Service, 2=Assets, 3=Spare Parts, 4=Equipment'
      });
    }

    // Validate pagination limits
    if (params.limit && params.limit > PAGINATION_DEFAULTS.MAX_LIMIT) {
      params.limit = PAGINATION_DEFAULTS.MAX_LIMIT;
    }

    // Validate sort parameters
    const validSortFields = ['name', 'created_at', 'updated_at', 'type', 'version'];
    if (params.sortBy && !validSortFields.includes(params.sortBy)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sortBy parameter',
        validFields: validSortFields
      });
    }

    if (params.sortOrder && !['asc', 'desc'].includes(params.sortOrder)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sortOrder parameter',
        validValues: ['asc', 'desc']
      });
    }

    console.log('[CatalogController] Listing catalog items with params:', params);

    const result = await catalogService.listCatalogItems(authHeader, tenantId, params);

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'listCatalogItems', {
      tenantId: req.headers['x-tenant-id'],
      queryParams: req.query
    });
  }
};

/**
 * Get single catalog item by ID
 */
export const getCatalogItem = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const catalogId = req.params.id;

    if (!catalogId) {
      return res.status(400).json({ 
        success: false,
        error: 'Catalog ID is required' 
      });
    }

    console.log('[CatalogController] Getting catalog item:', catalogId);

    const result = await catalogService.getCatalogItem(authHeader, tenantId, catalogId);

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'getCatalogItem', {
      catalogId: req.params.id,
      tenantId: req.headers['x-tenant-id']
    });
  }
};

/**
 * Create new catalog item
 */
export const createCatalogItem = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const idempotencyKey = req.headers['idempotency-key'] as string;

    const data: CreateCatalogItemRequest = req.body;

    // Validate required fields
    if (!data.name || !data.type) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields',
        required: ['name', 'type'],
        received: Object.keys(data)
      });
    }

    // Validate catalog data using service validation
    const validation = catalogService.validateCatalogData(data);
    if (!validation.isValid) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid catalog data',
        validation_errors: validation.errors
      });
    }

    // Generate idempotency key if not provided
    const finalIdempotencyKey = idempotencyKey || 
      catalogService.generateIdempotencyKey('create', data);

    console.log('[CatalogController] Creating catalog item:', { 
      name: data.name, 
      type: data.type,
      hasIdempotencyKey: !!finalIdempotencyKey 
    });

    const result = await catalogService.createCatalogItem(
      authHeader, 
      tenantId, 
      data, 
      finalIdempotencyKey
    );

    return res.status(201).json({
      success: true,
      data: result,
      message: 'Catalog item created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'createCatalogItem', {
      tenantId: req.headers['x-tenant-id'],
      itemName: req.body?.name,
      itemType: req.body?.type
    });
  }
};

/**
 * Update catalog item (creates new version)
 */
export const updateCatalogItem = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const catalogId = req.params.id;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!catalogId) {
      return res.status(400).json({ 
        success: false,
        error: 'Catalog ID is required' 
      });
    }

    const data: UpdateCatalogItemRequest = req.body;

    // Validate that at least one field is being updated
    const updateFields = ['name', 'description', 'description_content', 'service_terms', 'terms_content', 'metadata', 'specifications'];
    const hasUpdate = updateFields.some(field => data[field as keyof UpdateCatalogItemRequest] !== undefined);
    
    if (!hasUpdate) {
      return res.status(400).json({
        success: false,
        error: 'At least one field must be provided for update',
        availableFields: updateFields
      });
    }

    // Validate update data using service validation
    const validation = catalogService.validateCatalogData(data);
    if (!validation.isValid) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid catalog data',
        validation_errors: validation.errors 
      });
    }

    // Generate idempotency key if not provided
    const finalIdempotencyKey = idempotencyKey || 
      catalogService.generateIdempotencyKey('update', { catalogId, ...data });

    console.log('[CatalogController] Updating catalog item:', {
      catalogId,
      updatedFields: Object.keys(data),
      hasVersionReason: !!data.version_reason
    });

    const result = await catalogService.updateCatalogItem(
      authHeader, 
      tenantId, 
      catalogId,
      data, 
      finalIdempotencyKey
    );

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Catalog item updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'updateCatalogItem', {
      catalogId: req.params.id,
      tenantId: req.headers['x-tenant-id'],
      updatedFields: Object.keys(req.body)
    });
  }
};

/**
 * Delete catalog item (soft delete)
 */
export const deleteCatalogItem = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const catalogId = req.params.id;

    if (!catalogId) {
      return res.status(400).json({ 
        success: false,
        error: 'Catalog ID is required' 
      });
    }

    console.log('[CatalogController] Deleting catalog item:', catalogId);

    const result = await catalogService.deleteCatalogItem(authHeader, tenantId, catalogId);

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Catalog item deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'deleteCatalogItem', {
      catalogId: req.params.id,
      tenantId: req.headers['x-tenant-id']
    });
  }
};

// =================================================================
// SPECIAL OPERATIONS
// =================================================================

/**
 * Restore deleted catalog item
 */
export const restoreCatalogItem = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const catalogId = req.params.id;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!catalogId) {
      return res.status(400).json({ 
        success: false,
        error: 'Catalog ID is required' 
      });
    }

    // Generate idempotency key if not provided
    const finalIdempotencyKey = idempotencyKey || 
      catalogService.generateIdempotencyKey('restore', { catalogId });

    console.log('[CatalogController] Restoring catalog item:', catalogId);

    const result = await catalogService.restoreCatalogItem(
      authHeader, 
      tenantId, 
      catalogId,
      finalIdempotencyKey
    );

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Catalog item restored successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'restoreCatalogItem', {
      catalogId: req.params.id,
      tenantId: req.headers['x-tenant-id']
    });
  }
};

/**
 * Get version history for catalog item
 */
export const getVersionHistory = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const catalogId = req.params.id;

    if (!catalogId) {
      return res.status(400).json({ 
        success: false,
        error: 'Catalog ID is required' 
      });
    }

    console.log('[CatalogController] Getting version history for:', catalogId);

    const result = await catalogService.getVersionHistory(authHeader, tenantId, catalogId);

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Version history retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'getVersionHistory', {
      catalogId: req.params.id,
      tenantId: req.headers['x-tenant-id']
    });
  }
};

// =================================================================
// MULTI-CURRENCY PRICING OPERATIONS
// =================================================================

/**
 * Get all currencies used by tenant
 */
export const getTenantCurrencies = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);

    console.log('[CatalogController] Getting tenant currencies');

    const result = await catalogService.getTenantCurrencies(authHeader, tenantId);

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Tenant currencies retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'getTenantCurrencies', {
      tenantId: req.headers['x-tenant-id']
    });
  }
};

/**
 * Get pricing for catalog item (supports both detailed and simple views)
 */
export const getCatalogPricing = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const catalogId = req.params.catalogId;
    const detailed = req.query.detailed === 'true';

    if (!catalogId) {
      return res.status(400).json({ 
        success: false,
        error: 'Catalog ID is required' 
      });
    }

    console.log('[CatalogController] Getting catalog pricing:', { catalogId, detailed });

    let result;
    if (detailed) {
      // Get detailed pricing with currency grouping
      result = await catalogService.getCatalogPricingDetails(authHeader, tenantId, catalogId);
    } else {
      // Get simple pricing list
      result = await catalogService.getCatalogPricing(authHeader, tenantId, catalogId);
    }

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Catalog pricing retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'getCatalogPricing', {
      catalogId: req.params.catalogId,
      tenantId: req.headers['x-tenant-id'],
      detailed: req.query.detailed
    });
  }
};

/**
 * Add or update pricing for catalog item (supports both single and multi-currency)
 */
export const upsertPricing = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const catalogId = req.params.catalogId;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!catalogId) {
      return res.status(400).json({ 
        success: false,
        error: 'Catalog ID is required' 
      });
    }

    const data = req.body;

    console.log('[CatalogController] Upserting pricing for:', catalogId);

    // Check if this is multi-currency request
    if (data.currencies && Array.isArray(data.currencies)) {
      // Multi-currency request
      const pricingData: CreateMultiCurrencyPricingRequest = {
        catalog_id: catalogId,
        price_type: data.price_type,
        currencies: data.currencies
      };
      
      // Validate multi-currency data
      const validation = catalogService.validateMultiCurrencyPricingData(pricingData);
      if (!validation.isValid) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid multi-currency pricing data',
          validation_errors: validation.errors 
        });
      }

      // Generate idempotency key if not provided
      const finalIdempotencyKey = idempotencyKey || 
        catalogService.generateIdempotencyKey('multi-pricing', { catalogId, ...data });

      const result = await catalogService.upsertMultiCurrencyPricing(
        authHeader, 
        tenantId, 
        catalogId,
        pricingData, 
        finalIdempotencyKey
      );

      return res.status(201).json({
        success: true,
        data: result,
        message: 'Multi-currency pricing updated successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      // Single currency request (backward compatibility)
      
      // Validate pricing data
      const validation = catalogService.validatePricingData(data);
      if (!validation.isValid) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid pricing data',
          validation_errors: validation.errors 
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

      return res.status(201).json({
        success: true,
        data: result,
        message: 'Pricing updated successfully',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    return handleControllerError(error, res, 'upsertPricing', {
      catalogId: req.params.catalogId,
      tenantId: req.headers['x-tenant-id'],
      isMultiCurrency: !!(req.body.currencies && Array.isArray(req.body.currencies))
    });
  }
};

/**
 * Update pricing for specific currency
 */
export const updateCurrencyPricing = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const catalogId = req.params.catalogId;
    const currency = req.params.currency?.toUpperCase();

    if (!catalogId || !currency) {
      return res.status(400).json({ 
        success: false,
        error: 'Catalog ID and currency are required' 
      });
    }

    const data = req.body;

    // Validate currency format
    if (!/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({ 
        success: false,
        error: 'Currency must be a 3-letter code' 
      });
    }

    // Validate price if provided
    if (data.price !== undefined && (isNaN(Number(data.price)) || Number(data.price) < 0)) {
      return res.status(400).json({ 
        success: false,
        error: 'Price must be a non-negative number' 
      });
    }

    console.log('[CatalogController] Updating currency pricing:', { catalogId, currency });

    const result = await catalogService.updateCurrencyPricing(
      authHeader,
      tenantId,
      catalogId,
      currency,
      data
    );

    return res.status(200).json({
      success: true,
      data: result,
      message: `Pricing for ${currency} updated successfully`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'updateCurrencyPricing', {
      catalogId: req.params.catalogId,
      currency: req.params.currency,
      tenantId: req.headers['x-tenant-id']
    });
  }
};

/**
 * Delete pricing for specific currency
 */
export const deleteCurrencyPricing = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const catalogId = req.params.catalogId;
    const currency = req.params.currency?.toUpperCase();
    const priceType = req.query.price_type as string || 'Fixed';

    if (!catalogId || !currency) {
      return res.status(400).json({ 
        success: false,
        error: 'Catalog ID and currency are required' 
      });
    }

    // Validate currency format
    if (!/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({ 
        success: false,
        error: 'Currency must be a 3-letter code' 
      });
    }

    console.log('[CatalogController] Deleting currency pricing:', { catalogId, currency, priceType });

    await catalogService.deleteCurrencyPricing(
      authHeader,
      tenantId,
      catalogId,
      currency,
      priceType
    );

    return res.status(200).json({
      success: true,
      message: `Pricing for ${currency} deleted successfully`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'deleteCurrencyPricing', {
      catalogId: req.params.catalogId,
      currency: req.params.currency,
      priceType: req.query.price_type,
      tenantId: req.headers['x-tenant-id']
    });
  }
};

// =================================================================
// LEGACY PRICING ENDPOINTS (BACKWARD COMPATIBILITY)
// =================================================================

/**
 * Delete specific pricing by currency (legacy endpoint)
 * Note: This treats the 'pricingId' parameter as currency code for backward compatibility
 */
export const deletePricing = async (req: Request, res: Response) => {
  try {
    const { authHeader, tenantId } = extractHeaders(req);
    const catalogId = req.params.catalogId;
    const currencyCode = req.params.currency; // Changed from pricingId to currency
    
    if (!catalogId || !currencyCode) {
      return res.status(400).json({ 
        success: false,
        error: 'Catalog ID and currency code are required' 
      });
    }

    console.log('[CatalogController] Legacy delete pricing - treating as currency:', currencyCode);

    // Use deleteCurrencyPricing with default price type
    await catalogService.deleteCurrencyPricing(
      authHeader, 
      tenantId, 
      catalogId,
      currencyCode.toUpperCase(),
      'Fixed' // Default price type for legacy calls
    );

    return res.status(200).json({
      success: true,
      message: `Pricing for ${currencyCode} deleted successfully`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return handleControllerError(error, res, 'deletePricing', {
      catalogId: req.params.catalogId,
      currency: req.params.currency,
      tenantId: req.headers['x-tenant-id']
    });
  }
};