// src/routes/productMasterdataRoutes.ts
import express from 'express';
import ProductMasterdataController from '../controllers/productMasterdataController';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const productMasterdataController = new ProductMasterdataController();

// =================================================================
// MIDDLEWARE SETUP
// =================================================================

// Rate limiting for master data operations
const masterdataRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs (master data is read-heavy)
  message: {
    success: false,
    error: 'Too many master data requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
router.use(masterdataRateLimit);

// =================================================================
// PUBLIC ROUTES (No Authentication Required)
// =================================================================

/**
 * @swagger
 * /api/product-masterdata/health:
 *   get:
 *     summary: Product master data service health check
 *     description: Check the health status of the product master data service and edge function
 *     tags: [System, Product Master Data]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 service:
 *                   type: string
 *                   example: product-masterdata
 *                 edge_function_status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Service is unhealthy
 */
router.get('/health', productMasterdataController.healthCheck);

/**
 * @swagger
 * /api/product-masterdata/constants:
 *   get:
 *     summary: Get product master data constants
 *     description: Retrieve constants and configuration info for master data API
 *     tags: [Product Master Data]
 *     responses:
 *       200:
 *         description: Constants retrieved successfully
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
 *                     endpoints:
 *                       type: array
 *                       items:
 *                         type: string
 *                     query_parameters:
 *                       type: array
 *                       items:
 *                         type: string
 *                     required_headers:
 *                       type: object
 *                     common_categories:
 *                       type: array
 *                       items:
 *                         type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/constants', productMasterdataController.getConstants);

// =================================================================
// AUTHENTICATED ROUTES
// =================================================================

// Apply authentication middleware to remaining routes
router.use(authenticate);

/**
 * @swagger
 * /api/product-masterdata/global:
 *   get:
 *     summary: Get global product master data
 *     description: Retrieve global master data for a specific category
 *     tags: [Product Master Data]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category_name
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           pattern: '^[a-zA-Z0-9_-]+$'
 *         description: Name of the category to retrieve
 *         example: pricing_type
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Global master data retrieved successfully
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
 *                     $ref: '#/components/schemas/CategoryDetail'
 *                 category_info:
 *                   $ref: '#/components/schemas/CategoryInfo'
 *                 total_count:
 *                   type: integer
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
router.get('/global', productMasterdataController.getGlobalMasterData);

/**
 * @swagger
 * /api/product-masterdata/tenant:
 *   get:
 *     summary: Get tenant-specific master data
 *     description: Retrieve tenant-specific master data for a category
 *     tags: [Product Master Data]
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
 *         name: category_name
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           pattern: '^[a-zA-Z0-9_-]+$'
 *         description: Name of the category to retrieve
 *         example: custom_fields
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Tenant master data retrieved successfully
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
 *                     $ref: '#/components/schemas/CategoryDetail'
 *                 category_info:
 *                   $ref: '#/components/schemas/CategoryInfo'
 *                 tenant_id:
 *                   type: string
 *                   format: uuid
 *                 total_count:
 *                   type: integer
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
router.get('/tenant', productMasterdataController.getTenantMasterData);

/**
 * @swagger
 * /api/product-masterdata/global/categories:
 *   get:
 *     summary: Get all global categories
 *     description: Retrieve all available global categories
 *     tags: [Product Master Data]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Global categories retrieved successfully
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
 *                     $ref: '#/components/schemas/CategoryMaster'
 *                 total_count:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/global/categories', productMasterdataController.getAllGlobalCategories);

/**
 * @swagger
 * /api/product-masterdata/tenant/categories:
 *   get:
 *     summary: Get all tenant categories
 *     description: Retrieve all available tenant-specific categories
 *     tags: [Product Master Data]
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
 *         name: is_active
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Tenant categories retrieved successfully
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
 *                     $ref: '#/components/schemas/CategoryMaster'
 *                 tenant_id:
 *                   type: string
 *                   format: uuid
 *                 total_count:
 *                   type: integer
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
router.get('/tenant/categories', productMasterdataController.getAllTenantCategories);

export default router;

// =================================================================
// SWAGGER COMPONENT SCHEMAS FOR PRODUCT MASTER DATA
// =================================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     CategoryMaster:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique category identifier
 *         category_name:
 *           type: string
 *           description: Name of the category
 *           example: pricing_type
 *         description:
 *           type: string
 *           nullable: true
 *           description: Category description
 *           example: Different pricing models available
 *         sequence_no:
 *           type: integer
 *           description: Sort order sequence number
 *           example: 1
 *         is_active:
 *           type: boolean
 *           description: Whether the category is active
 *           example: true
 *         tenant_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: Tenant ID (null for global categories)
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 * 
 *     CategoryDetail:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique detail identifier
 *         category_id:
 *           type: string
 *           format: uuid
 *           description: Reference to category master
 *         detail_name:
 *           type: string
 *           description: Display name of the detail
 *           example: Fixed Price
 *         detail_value:
 *           type: string
 *           description: Value/code of the detail
 *           example: fixed
 *         description:
 *           type: string
 *           nullable: true
 *           description: Detail description
 *           example: Fixed pricing model
 *         sequence_no:
 *           type: integer
 *           description: Sort order sequence number
 *           example: 1
 *         is_active:
 *           type: boolean
 *           description: Whether the detail is active
 *           example: true
 *         tenant_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: Tenant ID (null for global details)
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *         display_name:
 *           type: string
 *           description: Frontend-friendly display name
 *           example: Fixed Price
 *         is_selectable:
 *           type: boolean
 *           description: Whether this item can be selected in UI
 *           example: true
 * 
 *     CategoryInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Category identifier
 *         name:
 *           type: string
 *           description: Category name
 *           example: pricing_type
 *         description:
 *           type: string
 *           nullable: true
 *           description: Category description
 *           example: Different pricing models available
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
 *                 example: "category_name parameter is required"
 *               code:
 *                 type: string
 *                 example: "MISSING_CATEGORY_NAME"
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
 *               code:
 *                 type: string
 *                 example: "UNAUTHORIZED"
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
 *                 example: "Failed to get master data"
 *               code:
 *                 type: string
 *                 example: "INTERNAL_ERROR"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 * 
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */