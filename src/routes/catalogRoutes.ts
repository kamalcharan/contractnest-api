// src/routes/catalogRoutes.ts
// Express routes for catalog management with comprehensive Swagger documentation
// CLEAN VERSION - Aligned with Edge Functions and Controllers

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

// =================================================================
// MIDDLEWARE SETUP
// =================================================================

// Apply authentication middleware to all routes
router.use(authenticate);

// Middleware to ensure tenant ID is present
const ensureTenant = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    return res.status(400).json({ 
      success: false,
      error: 'x-tenant-id header is required',
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Apply tenant check to all routes
router.use(ensureTenant);

// =================================================================
// MAIN CATALOG OPERATIONS
// =================================================================

/**
 * @swagger
 * /api/catalog:
 *   get:
 *     summary: List catalog items with filtering and pagination
 *     description: Retrieve a paginated list of catalog items with optional filtering by type, search, and status
 *     tags: [Catalog Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: query
 *         name: catalogType
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3, 4]
 *         description: Filter by catalog type (1=Service, 2=Assets, 3=Spare Parts, 4=Equipment)
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include inactive items in results
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: Search term for item names
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, created_at, updated_at, type, version]
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of catalog items retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/CatalogItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationInfo'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/', listCatalogItems);

/**
 * @swagger
 * /api/catalog:
 *   post:
 *     summary: Create a new catalog item
 *     description: Create a new catalog item with pricing information
 *     tags: [Catalog Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: header
 *         name: idempotency-key
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Idempotency key to prevent duplicate creation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCatalogItemRequest'
 *     responses:
 *       201:
 *         description: Catalog item created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CatalogItem'
 *                 message:
 *                   type: string
 *                   example: "Catalog item created successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/', validateCatalogInput('create'), createCatalogItem);

/**
 * @swagger
 * /api/catalog/{id}:
 *   get:
 *     summary: Get a catalog item by ID
 *     description: Retrieve detailed information about a specific catalog item
 *     tags: [Catalog Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *     responses:
 *       200:
 *         description: Catalog item retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CatalogItem'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', getCatalogItem);

/**
 * @swagger
 * /api/catalog/{id}:
 *   put:
 *     summary: Update a catalog item
 *     description: Update an existing catalog item (creates a new version)
 *     tags: [Catalog Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: header
 *         name: idempotency-key
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Idempotency key to prevent duplicate updates
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCatalogItemRequest'
 *     responses:
 *       200:
 *         description: Catalog item updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CatalogItem'
 *                 message:
 *                   type: string
 *                   example: "Catalog item updated successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.put('/:id', validateCatalogInput('update'), updateCatalogItem);

/**
 * @swagger
 * /api/catalog/{id}:
 *   delete:
 *     summary: Delete a catalog item
 *     description: Soft delete a catalog item (marks as inactive)
 *     tags: [Catalog Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *     responses:
 *       200:
 *         description: Catalog item deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Catalog item deleted successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.delete('/:id', deleteCatalogItem);

// =================================================================
// SPECIAL OPERATIONS
// =================================================================

/**
 * @swagger
 * /api/catalog/restore/{id}:
 *   post:
 *     summary: Restore a deleted catalog item
 *     description: Restore a previously deleted (inactive) catalog item
 *     tags: [Catalog Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: header
 *         name: idempotency-key
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Idempotency key to prevent duplicate restoration
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *     responses:
 *       200:
 *         description: Catalog item restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CatalogItem'
 *                 message:
 *                   type: string
 *                   example: "Catalog item restored successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/restore/:id', restoreCatalogItem);

/**
 * @swagger
 * /api/catalog/versions/{id}:
 *   get:
 *     summary: Get version history for a catalog item
 *     description: Retrieve all versions of a catalog item showing the evolution history
 *     tags: [Version Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *     responses:
 *       200:
 *         description: Version history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     root:
 *                       $ref: '#/components/schemas/CatalogItem'
 *                     versions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/CatalogItem'
 *                 message:
 *                   type: string
 *                   example: "Version history retrieved successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/versions/:id', getVersionHistory);

// =================================================================
// MULTI-CURRENCY PRICING ENDPOINTS
// =================================================================

/**
 * @swagger
 * /api/catalog/multi-currency:
 *   get:
 *     summary: Get tenant currencies
 *     description: Retrieve all currencies used by the tenant with usage statistics
 *     tags: [Multi-Currency Pricing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *     responses:
 *       200:
 *         description: Tenant currencies retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     currencies:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["INR", "USD", "EUR"]
 *                     statistics:
 *                       type: object
 *                       additionalProperties:
 *                         type: integer
 *                       example: {"INR": 150, "USD": 75, "EUR": 30}
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/multi-currency', getTenantCurrencies);

/**
 * @swagger
 * /api/catalog/multi-currency/{catalogId}:
 *   get:
 *     summary: Get pricing details for a catalog item
 *     description: Retrieve multi-currency pricing information for a specific catalog item
 *     tags: [Multi-Currency Pricing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: path
 *         name: catalogId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *       - in: query
 *         name: detailed
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Return detailed pricing information with currency grouping
 *     responses:
 *       200:
 *         description: Pricing details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   oneOf:
 *                     - type: array
 *                       items:
 *                         $ref: '#/components/schemas/CatalogPricing'
 *                     - $ref: '#/components/schemas/CatalogPricingDetails'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/multi-currency/:catalogId', getCatalogPricing);

/**
 * @swagger
 * /api/catalog/multi-currency:
 *   post:
 *     summary: Create or update multi-currency pricing
 *     description: Create or update pricing for multiple currencies for a catalog item
 *     tags: [Multi-Currency Pricing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: header
 *         name: idempotency-key
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Idempotency key to prevent duplicate pricing updates
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMultiCurrencyPricingRequest'
 *     responses:
 *       201:
 *         description: Multi-currency pricing updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     catalog_id:
 *                       type: string
 *                       format: uuid
 *                     price_type:
 *                       type: string
 *                       enum: [Fixed, "Unit Price", Hourly, Daily]
 *                     updated_currencies:
 *                       type: array
 *                       items:
 *                         type: string
 *                     pricing:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/CatalogPricing'
 *                 message:
 *                   type: string
 *                   example: "Multi-currency pricing updated successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/multi-currency', upsertPricing);

/**
 * @swagger
 * /api/catalog/multi-currency/{catalogId}/{currency}:
 *   put:
 *     summary: Update pricing for a specific currency
 *     description: Update pricing information for a specific currency of a catalog item
 *     tags: [Multi-Currency Pricing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: path
 *         name: catalogId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[A-Z]{3}$"
 *         description: 3-letter currency code (e.g., USD, EUR, INR)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CurrencyPricingUpdate'
 *     responses:
 *       200:
 *         description: Currency pricing updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CatalogPricing'
 *                 message:
 *                   type: string
 *                   example: "Pricing for USD updated successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.put('/multi-currency/:catalogId/:currency', updateCurrencyPricing);

/**
 * @swagger
 * /api/catalog/multi-currency/{catalogId}/{currency}:
 *   delete:
 *     summary: Delete pricing for a specific currency
 *     description: Remove pricing information for a specific currency of a catalog item
 *     tags: [Multi-Currency Pricing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: path
 *         name: catalogId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[A-Z]{3}$"
 *         description: 3-letter currency code (e.g., USD, EUR, INR)
 *       - in: query
 *         name: price_type
 *         schema:
 *           type: string
 *           enum: [Fixed, "Unit Price", Hourly, Daily]
 *           default: Fixed
 *         description: Price type to delete
 *     responses:
 *       200:
 *         description: Currency pricing deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Pricing for USD deleted successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.delete('/multi-currency/:catalogId/:currency', deleteCurrencyPricing);

// =================================================================
// LEGACY PRICING ENDPOINTS (BACKWARD COMPATIBILITY)
// =================================================================

/**
 * @swagger
 * /api/catalog/pricing/{catalogId}:
 *   post:
 *     summary: Create or update pricing (legacy)
 *     description: Legacy endpoint for creating or updating pricing (supports both single and multi-currency)
 *     tags: [Legacy Pricing]
 *     deprecated: true
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: header
 *         name: idempotency-key
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Idempotency key to prevent duplicate updates
 *       - in: path
 *         name: catalogId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/CreatePricingRequest'
 *               - $ref: '#/components/schemas/CreateMultiCurrencyPricingRequest'
 *     responses:
 *       201:
 *         description: Pricing updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/CatalogPricing'
 *                     - type: object
 *                       properties:
 *                         catalog_id:
 *                           type: string
 *                           format: uuid
 *                         updated_currencies:
 *                           type: array
 *                           items:
 *                             type: string
 *                         pricing:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/CatalogPricing'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/pricing/:catalogId', validatePricingInput(), upsertPricing);

/**
 * @swagger
 * /api/catalog/pricing/{catalogId}:
 *   get:
 *     summary: Get catalog pricing (legacy)
 *     description: Legacy endpoint for retrieving pricing information
 *     tags: [Legacy Pricing]
 *     deprecated: true
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: path
 *         name: catalogId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *     responses:
 *       200:
 *         description: Pricing retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CatalogPricing'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/pricing/:catalogId', getCatalogPricing);

/**
 * @swagger
 * /api/catalog/pricing/{catalogId}/{currency}:
 *   delete:
 *     summary: Delete pricing by currency (legacy)
 *     description: Legacy endpoint for deleting pricing by currency code
 *     tags: [Legacy Pricing]
 *     deprecated: true
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant identifier
 *       - in: path
 *         name: catalogId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Catalog item ID
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[A-Z]{3}$"
 *         description: 3-letter currency code (e.g., USD, EUR, INR)
 *     responses:
 *       200:
 *         description: Pricing deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Pricing for USD deleted successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.delete('/pricing/:catalogId/:currency', deletePricing);

export default router;

// =================================================================
// SWAGGER COMPONENT SCHEMAS
// =================================================================

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   
 *   schemas:
 *     CatalogItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique catalog item identifier
 *         tenant_id:
 *           type: string
 *           format: uuid
 *           description: Tenant identifier
 *         type:
 *           type: string
 *           enum: [service, equipment, spare_part, asset]
 *           description: Type of catalog item
 *         name:
 *           type: string
 *           maxLength: 255
 *           description: Item name
 *         short_description:
 *           type: string
 *           maxLength: 500
 *           description: Brief description
 *         description_content:
 *           type: string
 *           maxLength: 10000
 *           description: Detailed description
 *         terms_content:
 *           type: string
 *           maxLength: 20000
 *           description: Service terms and conditions
 *         is_active:
 *           type: boolean
 *           description: Whether the item is active
 *         status:
 *           type: string
 *           enum: [active, inactive, draft]
 *           description: Item status
 *         version_number:
 *           type: integer
 *           minimum: 1
 *           description: Version number
 *         is_current_version:
 *           type: boolean
 *           description: Whether this is the current version
 *         pricing_list:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CatalogPricing'
 *           description: Multi-currency pricing information
 *         pricing_summary:
 *           type: object
 *           properties:
 *             currencies:
 *               type: array
 *               items:
 *                 type: string
 *             base_currency:
 *               type: string
 *             count:
 *               type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 * 
 *     CatalogPricing:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         catalog_id:
 *           type: string
 *           format: uuid
 *         price_type:
 *           type: string
 *           enum: [Fixed, "Unit Price", Hourly, Daily]
 *         currency:
 *           type: string
 *           pattern: "^[A-Z]{3}$"
 *           example: "USD"
 *         price:
 *           type: number
 *           minimum: 0
 *           multipleOf: 0.01
 *         tax_included:
 *           type: boolean
 *         tax_rate_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         is_base_currency:
 *           type: boolean
 *         is_active:
 *           type: boolean
 *         attributes:
 *           type: object
 *           additionalProperties: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 * 
 *     CreateCatalogItemRequest:
 *       type: object
 *       required:
 *         - name
 *         - type
 *       properties:
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *         type:
 *           type: string
 *           enum: [service, equipment, spare_part, asset]
 *         description:
 *           type: string
 *           maxLength: 10000
 *         description_content:
 *           type: string
 *           maxLength: 10000
 *         short_description:
 *           type: string
 *           maxLength: 500
 *         terms_content:
 *           type: string
 *           maxLength: 20000
 *         service_terms:
 *           type: string
 *           maxLength: 20000
 *         price_attributes:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               enum: [fixed, unit_price, hourly, daily]
 *             base_amount:
 *               type: number
 *               minimum: 0
 *             currency:
 *               type: string
 *               pattern: "^[A-Z]{3}$"
 *             billing_mode:
 *               type: string
 *               enum: [manual, automatic]
 *         tax_config:
 *           type: object
 *           properties:
 *             use_tenant_default:
 *               type: boolean
 *             specific_tax_rates:
 *               type: array
 *               items:
 *                 type: string
 *                 format: uuid
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *         specifications:
 *           type: object
 *           additionalProperties: true
 * 
 *     UpdateCatalogItemRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *         description:
 *           type: string
 *           maxLength: 10000
 *         description_content:
 *           type: string
 *           maxLength: 10000
 *         service_terms:
 *           type: string
 *           maxLength: 20000
 *         terms_content:
 *           type: string
 *           maxLength: 20000
 *         version_reason:
 *           type: string
 *           minLength: 3
 *           maxLength: 500
 *           description: Reason for this version update
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *         specifications:
 *           type: object
 *           additionalProperties: true
 * 
 *     CreateMultiCurrencyPricingRequest:
 *       type: object
 *       required:
 *         - catalog_id
 *         - price_type
 *         - currencies
 *       properties:
 *         catalog_id:
 *           type: string
 *           format: uuid
 *         price_type:
 *           type: string
 *           enum: [fixed, unit_price, hourly, daily]
 *         currencies:
 *           type: array
 *           minItems: 1
 *           items:
 *             type: object
 *             required:
 *               - currency
 *               - price
 *             properties:
 *               currency:
 *                 type: string
 *                 pattern: "^[A-Z]{3}$"
 *               price:
 *                 type: number
 *                 minimum: 0
 *                 multipleOf: 0.01
 *               is_base_currency:
 *                 type: boolean
 *                 default: false
 *               tax_included:
 *                 type: boolean
 *                 default: false
 *               tax_rate_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               attributes:
 *                 type: object
 *                 additionalProperties: true
 * 
 *     CreatePricingRequest:
 *       type: object
 *       required:
 *         - price_type
 *         - currency
 *         - price
 *       properties:
 *         price_type:
 *           type: string
 *           enum: [Fixed, "Unit Price", Hourly, Daily]
 *         currency:
 *           type: string
 *           pattern: "^[A-Z]{3}$"
 *         price:
 *           type: number
 *           minimum: 0
 *           multipleOf: 0.01
 *         tax_included:
 *           type: boolean
 *           default: false
 *         tax_rate_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         attributes:
 *           type: object
 *           additionalProperties: true
 * 
 *     CurrencyPricingUpdate:
 *       type: object
 *       required:
 *         - price
 *       properties:
 *         price_type:
 *           type: string
 *           enum: [Fixed, "Unit Price", Hourly, Daily]
 *         price:
 *           type: number
 *           minimum: 0
 *           multipleOf: 0.01
 *         tax_included:
 *           type: boolean
 *         tax_rate_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         attributes:
 *           type: object
 *           additionalProperties: true
 * 
 *     CatalogPricingDetails:
 *       type: object
 *       properties:
 *         catalog_id:
 *           type: string
 *           format: uuid
 *         base_currency:
 *           type: string
 *         currencies:
 *           type: array
 *           items:
 *             type: string
 *         pricing_by_currency:
 *           type: object
 *           additionalProperties:
 *             $ref: '#/components/schemas/CatalogPricing'
 *         pricing_list:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CatalogPricing'
 * 
 *     PaginationInfo:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *           minimum: 1
 *         limit:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         total:
 *           type: integer
 *           minimum: 0
 *         totalPages:
 *           type: integer
 *           minimum: 0
 *         has_more:
 *           type: boolean
 * 
 *   responses:
 *     BadRequest:
 *       description: Bad request - invalid parameters
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "Invalid request parameters"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 * 
 *     ValidationError:
 *       description: Validation error - invalid data
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "Validation failed"
 *               validation_errors:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     field:
 *                       type: string
 *                     message:
 *                       type: string
 *               timestamp:
 *                 type: string
 *                 format: date-time
 * 
 *     Unauthorized:
 *       description: Unauthorized - invalid or missing authentication
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "Authorization header is required"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 * 
 *     NotFound:
 *       description: Resource not found
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "Catalog item not found"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 * 
 *     Conflict:
 *       description: Conflict - resource already exists or operation not allowed
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "Catalog item already exists"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 * 
 *     InternalError:
 *       description: Internal server error
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "Internal server error"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 */