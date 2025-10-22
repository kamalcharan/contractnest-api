// src/routes/serviceCatalogRoutes.ts
// ✅ UPDATED: Uses class-based controller pattern

import express, { Request, Response, NextFunction } from 'express';
import serviceCatalogController from '../controllers/serviceCatalogController';

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
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization header is required'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'x-tenant-id header is required'
        },
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
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Service ID is required'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(serviceId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FORMAT',
          message: 'Invalid service ID format. Expected UUID.'
        },
        timestamp: new Date().toISOString()
      });
    }

    next();
  },

  /**
   * Validate request body for create/update operations
   */
  validateRequestBody: (req: Request, res: Response, next: NextFunction) => {
    if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Request body is required and cannot be empty'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Content-type validation
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: 'Content-Type must be application/json'
        },
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
      sort_direction 
    } = req.query;

    // Validate boolean parameters
    if (is_active !== undefined && is_active !== 'true' && is_active !== 'false') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: 'is_active parameter must be "true" or "false"'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (has_resources !== undefined && has_resources !== 'true' && has_resources !== 'false') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: 'has_resources parameter must be "true" or "false"'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Validate numeric parameters
    if (price_min !== undefined) {
      const minPrice = Number(price_min);
      if (isNaN(minPrice) || minPrice < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'price_min must be a non-negative number'
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    if (price_max !== undefined) {
      const maxPrice = Number(price_max);
      if (isNaN(maxPrice) || maxPrice < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'price_max must be a non-negative number'
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    if (limit !== undefined) {
      const limitNum = Number(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'limit must be a number between 1 and 1000'
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    if (offset !== undefined) {
      const offsetNum = Number(offset);
      if (isNaN(offsetNum) || offsetNum < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'offset must be a non-negative number'
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    // Validate sort direction
    if (sort_direction !== undefined && sort_direction !== 'asc' && sort_direction !== 'desc') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: 'sort_direction must be "asc" or "desc"'
        },
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
 */
router.get('/health', serviceCatalogController.healthCheck);

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
 */
router.get(
  '/master-data',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogController.getMasterData
);

// ============================================================================
// SERVICE STATISTICS ENDPOINT
// ⚠️ IMPORTANT: Must come BEFORE /services/:id to avoid route conflict
// ============================================================================

/**
 * @swagger
 * /api/service-catalog/services/statistics:
 *   get:
 *     tags: [Services]
 *     summary: Get service statistics
 *     description: Get aggregate statistics about services
 */
router.get(
  '/services/statistics',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogController.getServiceStatistics
);

// ============================================================================
// SERVICE COLLECTION ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/service-catalog/services:
 *   get:
 *     tags: [Services]
 *     summary: Get services
 *     description: Get all services with optional filtering, sorting, and pagination
 */
router.get(
  '/services',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateQueryParams,
  serviceCatalogController.getServices
);

/**
 * @swagger
 * /api/service-catalog/services:
 *   post:
 *     tags: [Services]
 *     summary: Create a new service
 *     description: Create a new service in the catalog
 */
router.post(
  '/services',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateRequestBody,
  serviceCatalogController.createService
);

// ============================================================================
// INDIVIDUAL SERVICE ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/service-catalog/services/{id}:
 *   get:
 *     tags: [Services]
 *     summary: Get service by ID
 *     description: Get a specific service by its ID
 */
router.get(
  '/services/:id',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  serviceCatalogController.getService
);

/**
 * @swagger
 * /api/service-catalog/services/{id}:
 *   put:
 *     tags: [Services]
 *     summary: Update service
 *     description: Update an existing service
 */
router.put(
  '/services/:id',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  serviceCatalogMiddleware.validateRequestBody,
  serviceCatalogController.updateService
);

/**
 * @swagger
 * /api/service-catalog/services/{id}:
 *   delete:
 *     tags: [Services]
 *     summary: Delete service
 *     description: Soft delete a service (deactivate)
 */
router.delete(
  '/services/:id',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  serviceCatalogController.deleteService
);

// ============================================================================
// SERVICE STATUS ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/service-catalog/services/{id}/status:
 *   patch:
 *     tags: [Services]
 *     summary: Toggle service status
 *     description: Activate or deactivate a service
 */
router.patch(
  '/services/:id/status',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  serviceCatalogMiddleware.validateRequestBody,
  serviceCatalogController.toggleServiceStatus
);

/**
 * @swagger
 * /api/service-catalog/services/{id}/activate:
 *   post:
 *     tags: [Services]
 *     summary: Activate service
 *     description: Activate an inactive service
 */
router.post(
  '/services/:id/activate',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  serviceCatalogController.activateService
);

// ============================================================================
// SERVICE VERSION HISTORY ENDPOINT
// ============================================================================

/**
 * @swagger
 * /api/service-catalog/services/{id}/versions:
 *   get:
 *     tags: [Services]
 *     summary: Get service version history
 *     description: Get all versions of a service
 */
router.get(
  '/services/:id/versions',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  serviceCatalogController.getServiceVersionHistory
);

// ============================================================================
// SERVICE RESOURCES ENDPOINT
// ============================================================================

/**
 * @swagger
 * /api/service-catalog/services/{id}/resources:
 *   get:
 *     tags: [Services]
 *     summary: Get service resources
 *     description: Get all resources associated with a service
 */
router.get(
  '/services/:id/resources',
  serviceCatalogMiddleware.validateHeaders,
  serviceCatalogMiddleware.validateServiceId,
  serviceCatalogController.getServiceResources
);

// ============================================================================
// EXPORT
// ============================================================================

export default router;