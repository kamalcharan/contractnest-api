// src/routes/resourcesRoutes.ts

import express from 'express';
import { Request, Response, NextFunction } from 'express';
import {
  getResources,
  getResourceTypes,
  getResourceTemplates,
  createResource,
  updateResource,
  deleteResource,
  healthCheck,
} from '../controllers/resourcesController';

const router = express.Router();

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Resources validation middleware
 */
const resourcesMiddleware = {
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
   * Validate resource ID parameter
   */
  validateResourceId: (req: Request, res: Response, next: NextFunction) => {
    const resourceId = req.params.id;

    if (!resourceId) {
      return res.status(400).json({
        error: 'Resource ID is required',
        timestamp: new Date().toISOString()
      });
    }

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(resourceId)) {
      return res.status(400).json({
        error: 'Invalid resource ID format',
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
    const { resourceTypeId, nextSequence, resourceId, include_deleted } = req.query;

    // Validate nextSequence parameter
    if (nextSequence !== undefined && nextSequence !== 'true' && nextSequence !== 'false') {
      return res.status(400).json({
        error: 'nextSequence parameter must be true or false',
        timestamp: new Date().toISOString()
      });
    }

    // Validate include_deleted parameter
    if (include_deleted !== undefined && include_deleted !== 'true' && include_deleted !== 'false') {
      return res.status(400).json({
        error: 'include_deleted parameter must be true or false',
        timestamp: new Date().toISOString()
      });
    }

    // Validate resourceTypeId if provided
    if (resourceTypeId && typeof resourceTypeId !== 'string') {
      return res.status(400).json({
        error: 'resourceTypeId must be a string',
        timestamp: new Date().toISOString()
      });
    }

    // Validate resourceId if provided
    if (resourceId && typeof resourceId !== 'string') {
      return res.status(400).json({
        error: 'resourceId must be a string',
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
 *   - name: Resources
 *     description: Catalog Resources Management API
 *   - name: Resource Types
 *     description: Resource Types Management API
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
 *     Resource:
 *       type: object
 *       required:
 *         - id
 *         - resource_type_id
 *         - name
 *         - display_name
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         resource_type_id:
 *           type: string
 *         name:
 *           type: string
 *         display_name:
 *           type: string
 *         description:
 *           type: string
 *         hexcolor:
 *           type: string
 *           pattern: '^#[0-9A-Fa-f]{6}$'
 *         sequence_no:
 *           type: integer
 *         is_active:
 *           type: boolean
 *         is_deletable:
 *           type: boolean
 *     ResourceType:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         requires_human_assignment:
 *           type: boolean
 *         is_active:
 *           type: boolean
 *     CreateResourceRequest:
 *       type: object
 *       required:
 *         - resource_type_id
 *         - name
 *         - display_name
 *       properties:
 *         resource_type_id:
 *           type: string
 *         name:
 *           type: string
 *         display_name:
 *           type: string
 *         description:
 *           type: string
 *         hexcolor:
 *           type: string
 *         sequence_no:
 *           type: integer
 *     UpdateResourceRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         display_name:
 *           type: string
 *         description:
 *           type: string
 *         hexcolor:
 *           type: string
 *         sequence_no:
 *           type: integer
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
 * /api/resources/health:
 *   get:
 *     tags: [Health]
 *     summary: Health check
 *     description: Check the health status of the resources API
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
// RESOURCE TYPES ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/resources/resource-types:
 *   get:
 *     tags: [Resource Types]
 *     summary: Get all resource types
 *     description: Retrieve all available resource types for the sidebar
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
 *         description: Resource types retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ResourceType'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/resource-types',
  resourcesMiddleware.validateHeaders,
  getResourceTypes
);

// ============================================================================
// RESOURCE TEMPLATES — Browse catalog by served industries
// ============================================================================

/**
 * @swagger
 * /api/resources/resource-templates:
 *   get:
 *     tags: [Resource Templates]
 *     summary: Browse resource templates by served industries
 *     description: Get equipment/entity templates filtered by tenant served industries with search and pagination
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search templates by name
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *         description: Number of templates to return (max 100)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *       - in: query
 *         name: resource_type_id
 *         schema:
 *           type: string
 *           enum: [equipment, asset]
 *         description: Filter by resource type (equipment or asset/entity)
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/resource-templates',
  resourcesMiddleware.validateHeaders,
  getResourceTemplates
);

// ============================================================================
// MAIN RESOURCES ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/resources:
 *   get:
 *     tags: [Resources]
 *     summary: Get resources
 *     description: Get all resources, resources by type, single resource, or next sequence number
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: resourceTypeId
 *         schema:
 *           type: string
 *         description: Filter by resource type ID
 *       - in: query
 *         name: resourceId
 *         schema:
 *           type: string
 *         description: Get specific resource by ID
 *       - in: query
 *         name: nextSequence
 *         schema:
 *           type: boolean
 *         description: Get next sequence number (requires resourceTypeId)
 *     responses:
 *       200:
 *         description: Resources retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Resource not found
 */
router.get(
  '/',
  resourcesMiddleware.validateHeaders,
  resourcesMiddleware.validateQueryParams,
  getResources
);

/**
 * @swagger
 * /api/resources:
 *   post:
 *     tags: [Resources]
 *     summary: Create a new resource
 *     description: Create a new catalog resource (manual entry types only)
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
 *             $ref: '#/components/schemas/CreateResourceRequest'
 *     responses:
 *       201:
 *         description: Resource created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Resource'
 *       400:
 *         description: Validation error or resource type doesn't support manual entry
 *       409:
 *         description: Resource already exists
 */
router.post(
  '/',
  resourcesMiddleware.validateHeaders,
  resourcesMiddleware.validateRequestBody,
  createResource
);

/**
 * @swagger
 * /api/resources/{id}:
 *   patch:
 *     tags: [Resources]
 *     summary: Update resource
 *     description: Update an existing resource (manual entry types only)
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
 *             $ref: '#/components/schemas/UpdateResourceRequest'
 *     responses:
 *       200:
 *         description: Resource updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Resource not found
 *       409:
 *         description: Conflict (duplicate name or managed by contacts)
 */
router.patch(
  '/:id',
  resourcesMiddleware.validateHeaders,
  resourcesMiddleware.validateResourceId,
  resourcesMiddleware.validateRequestBody,
  updateResource
);

/**
 * @swagger
 * /api/resources/{id}:
 *   delete:
 *     tags: [Resources]
 *     summary: Delete resource
 *     description: Soft delete a resource (manual entry types only)
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
 *         description: Resource deleted successfully
 *       400:
 *         description: Resource cannot be deleted
 *       404:
 *         description: Resource not found
 */
router.delete(
  '/:id',
  resourcesMiddleware.validateHeaders,
  resourcesMiddleware.validateResourceId,
  deleteResource
);

export default router;