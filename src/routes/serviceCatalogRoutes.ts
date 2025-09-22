// src/routes/serviceCatalogRoutes.ts

import express from 'express';
import { Request, Response, NextFunction } from 'express';
import {
  getServices,
  getService,
  getServiceResources,
  getMasterData,
  createService,
  updateService,
  deleteService,
  healthCheck,
} from '../controllers/serviceCatalogController';

const router = express.Router();

// ============================================================================
// MIDDLEWARE
// ============================================================================

const serviceCatalogMiddleware = {
  /**
   * Validate required headers
   */
  validateHeaders: (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'];

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authorization header is required',
        timestamp: new Date().toISOString()
      });
    }

    if (!tenantId) {
      return res.status(400).json({
        error: 'x-tenant-id header is required',
        timestamp: new Date().toISOString()
      });
    }

    next();
  },

  /**
   * Validate service ID parameter
   */
  validateServiceId: (req: Request, res: Response, next: NextFunction) => {
    const serviceId = req.params.id;

    if (!serviceId) {
      return res.status(400).json({
        error: 'Service ID is required',
        timestamp: new Date().toISOString()
      });
    }

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(serviceId)) {
      return res.status(400).json({
        error: 'Invalid service ID format',
        timestamp: new Date().toISOString()
      });
    }

    next();
  },

  /**
   * Validate request body for create/update operations
   */
  validateRequestBody: (req: Request, res: Response, next: NextFunction) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Request body is required',
        timestamp: new Date().toISOString()
      });
    }

    // Basic content-type validation
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        error: 'Content-Type must be application/json',
        timestamp: new Date().toISOString()
      });
    }

    next();
  },

  /**
   * Validate query parameters
   */
  validateQueryParams: (req: Request, res: Response, next: NextFunction) => {
    const { 
      is_active, 
      has_resources, 
      price_min, 
      price_max, 
      limit, 
      offset,
      sort_by,
      sort_direction 
    } = req.query;

    // Validate boolean parameters
    if (is_active !== undefined && is_active !== 'true' && is_active !== 'false') {
      return res.status(400).json({
        error: 'is_active parameter must be true or false',
        timestamp: new Date().toISOString()
      });
    }

    if (has_resources !== undefined && has_resources !== 'true' && has_resources !== 'false') {
      return res.status(400).json({
        error: 'has_resources parameter must be true or false',
        timestamp: new Date().toISOString()
      });
    }

    // Validate numeric parameters
    if (price_min !== undefined && (isNaN(Number(price_min)) || Number(price_min) < 0)) {
      return res.status(400).json({
        error: 'price_min must be a non-negative number',
        timestamp: new Date().toISOString()
      });
    }

    if (price_max !== undefined && (isNaN(Number(price_max)) || Number(price_max) < 0)) {
      return res.status(400).json({
        error: 'price_max must be a non-negative number',
        timestamp: new Date().toISOString()
      });
    }

    if (limit !== undefined && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 1000)) {
      return res.status(400).json({
        error: 'limit must be a number between 1 and 1000',
        timestamp: new Date().toISOString()
      });
    }

    if (offset !== undefined && (isNaN(Number(offset)) || Number(offset) < 0)) {
      return res.status(400).json({
        error: 'offset must be a non-negative number',
        timestamp: new Date().toISOString()
      });
    }

    // Validate sort parameters
    if (sort_direction !== undefined && sort_direction !== 'asc' && sort_direction !== 'desc') {
      return res.status(400).json({
        error: 'sort_direction must be "asc" or "desc"',
        timestamp: new Date().toISOString()
      });
    }

    next();
  }
};

// ============================================================================
// SWAGGER DOCUMENTATION
// ============================================================================

/**
 * @swagger
 * tags:
 *   - name: Services
 *     description: Service Catalog Management API
 *   - name: Master Data
 *     description: Master Data for Service Configuration
 *   - name: Health
 *     description: API Health and Status
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *   schemas:
 *     Service:
 *       type: object
 *       required:
 *         - id
 *         - service_name
 *         - category_id
 *         - industry_id
 *         - pricing_config
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         service_name:
 *           type: string
 *         description:
 *           type: string
 *         sku:
 *           type: string
 *         category_id:
 *           type: string
 *         industry_id:
 *           type: string
 *         pricing_config:
 *           $ref: '#/components/schemas/PricingConfig'
 *         service_attributes:
 *           type: object
 *         duration_minutes:
 *           type: integer
 *         is_active:
 *           type: boolean
 *         sort_order:
 *           type: integer
 *         required_resources:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RequiredResource'
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *     PricingConfig:
 *       type: object
 *       required:
 *         - base_price
 *         - currency
 *         - pricing_model
 *       properties:
 *         base_price:
 *           type: number
 *         currency:
 *           type: string
 *         pricing_model:
 *           type: string
 *         tax_inclusive:
 *           type: boolean
 *         billing_cycle:
 *           type: string
 *     RequiredResource:
 *       type: object
 *       required:
 *         - resource_id
 *       properties:
 *         resource_id:
 *           type: string
 *         quantity:
 *           type: integer
 *         is_optional:
 *           type: boolean
 *     CreateServiceRequest:
 *       type: object
 *       required:
 *         - service_name
 *         - category_id
 *         - industry_id
 *         - pricing_config
 *       properties:
 *         service_name:
 *           type: string
 *         description:
 *           type: string
 *         sku:
 *           type: string
 *         category_id:
 *           type: string
 *         industry_id:
 *           type: string
 *         pricing_config:
 *           $ref: '#/components/schemas/PricingConfig'
 *         service_attributes:
 *           type: object
 *         duration_minutes:
 *           type: integer
 *         sort_order:
 *           type: integer
 *         required_resources:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RequiredResource'
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *     UpdateServiceRequest:
 *       type: object
 *       properties:
 *         service_name:
 *           type: string
 *         description:
 *           type: string
 *         sku:
 *           type: string
 *         pricing_config:
 *           $ref: '#/components/schemas/PricingConfig'
 *         service_attributes:
 *           type: object
 *         duration_minutes:
 *           type: integer
 *         sort_order:
 *           type: integer
 *         required_resources:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RequiredResource'
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *     ApiResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *         message:
 *           type: string
 *         timestamp:
 *           type: string
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *         details:
 *           type: string
 *         timestamp:
 *           type: string
 *         requestId:
 *           type: string
 */

// ============================================================================
// HEALTH ENDPOINT
// ============================================================================

/**
 * @swagger
 * /api/service-catalog/health:
 *   get:
 *     tags: [Health]
 *     summary: Health check
 *     description: Check the health status of the service catalog API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         schema:
 *           type: string
 *         description: Tenant identifier (optional for health check)
 *     responses:
 *       200:
 *         description: Health check successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Health check failed
 */
router.get('/health', healthCheck);

// ============================================================================
// MASTER DATA ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/service-catalog/master-data:
 *   get:
 *     tags: [Master Data]
 *     summary: Get master data
 *     description: Retrieve categories, industries, currencies, and tax rates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant identifier
 *     responses:
 *       200:
 *         description: Master data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/master-data',
  serviceCatalogMiddleware.validateHeaders,
  getMasterData
);

// ============================================================================
// SERVICE ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/service-catalog/services:
 *   get:
 *     tags: [Services]
 *     summary: Get services
 *     description: Get all services with optional filtering and pagination
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: search_term
 *         schema:
 *           type: string
 *         description: Search in service names and descriptions
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: industry_id
 *         schema:
 *           type: string
 *         description: Filter by industry ID
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: price_min
 *         schema:
 *           type: number
 *         description: Minimum price filter
 *       - in: query
 *         name: price_max
 *         schema:
 *           type: number
 *         description: Maximum price filter
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         description: Filter by currency
 *       - in: query
 *         name: has_resources
 *         schema:
 *           type: boolean
 *         description: Filter services that require resources
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *         description: Sort field
 *       - in: query
 *         name: sort_direction
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort direction
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *         description: Number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of results to skip
 *     responses:
 *       200:
 *         description: Services retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/services',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateQueryParams,
  getServices
);

/**
 * @swagger
 * /api/service-catalog/services:
 *   post:
 *     tags: [Services]
 *     summary: Create a new service
 *     description: Create a new service in the catalog
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-idempotency-key
 *         schema:
 *           type: string
 *         description: Idempotency key for safe retries
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateServiceRequest'
 *     responses:
 *       201:
 *         description: Service created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Service'
 *       400:
 *         description: Validation error
 *       409:
 *         description: Service already exists
 */
router.post(
  '/services',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateRequestBody,
  createService
);

/**
 * @swagger
 * /api/service-catalog/services/{id}:
 *   get:
 *     tags: [Services]
 *     summary: Get service by ID
 *     description: Get a specific service by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Service retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Service'
 *       404:
 *         description: Service not found
 */
router.get(
  '/services/:id',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  getService
);

/**
 * @swagger
 * /api/service-catalog/services/{id}:
 *   put:
 *     tags: [Services]
 *     summary: Update service
 *     description: Update an existing service
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-idempotency-key
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateServiceRequest'
 *     responses:
 *       200:
 *         description: Service updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Service not found
 *       409:
 *         description: Conflict (duplicate name)
 */
router.put(
  '/services/:id',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  serviceCatalogMiddleware.validateRequestBody,
  updateService
);

/**
 * @swagger
 * /api/service-catalog/services/{id}:
 *   delete:
 *     tags: [Services]
 *     summary: Delete service
 *     description: Soft delete a service
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-idempotency-key
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Service deleted successfully
 *       400:
 *         description: Service cannot be deleted
 *       404:
 *         description: Service not found
 */
router.delete(
  '/services/:id',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  deleteService
);

/**
 * @swagger
 * /api/service-catalog/services/{id}/resources:
 *   get:
 *     tags: [Services]
 *     summary: Get service resources
 *     description: Get resources associated with a service
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Service resources retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Service not found
 */
router.get(
  '/services/:id/resources',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  getServiceResources
);

export default router;