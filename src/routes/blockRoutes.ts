// src/routes/blockRoutes.ts
import express from 'express';
import { authenticate } from '../middleware/auth';
import { param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import BlockController from '../controllers/blockController';

const router = express.Router();
const blockController = new BlockController();

/**
 * Handle validation errors middleware
 */
const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      validation_errors: formattedErrors
    });
  }
  
  next();
};

/**
 * UUID validation helper
 */
const validateUUID = (paramName: string) => 
  param(paramName)
    .isUUID()
    .withMessage(`${paramName} must be a valid UUID`);

/**
 * Search query validation
 */
const validateSearchQuery = [
  query('q')
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters')
    .trim()
    .escape(),
  
  query('category')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category filter must be between 1 and 50 characters')
    .trim(),
  
  query('nodeType')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Node type filter must be between 1 and 50 characters')
    .trim(),
  
  handleValidationErrors
];

/**
 * Query parameter validation for masters endpoint
 */
const validateMastersQuery = [
  query('categoryId')
    .optional()
    .isUUID()
    .withMessage('Category ID must be a valid UUID'),
  
  handleValidationErrors
];

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/service-contracts/blocks/categories:
 *   get:
 *     summary: Get all block categories
 *     tags: [Service Contracts - Blocks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of block categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       icon:
 *                         type: string
 *                       sort_order:
 *                         type: number
 *                       active:
 *                         type: boolean
 *                 count:
 *                   type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get('/categories', blockController.getCategories);

/**
 * @swagger
 * /api/service-contracts/blocks/masters:
 *   get:
 *     summary: Get block masters with optional category filter
 *     tags: [Service Contracts - Blocks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by category ID
 *     responses:
 *       200:
 *         description: List of block masters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       category_id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       icon:
 *                         type: string
 *                       node_type:
 *                         type: string
 *                       config:
 *                         type: object
 *                       category:
 *                         type: object
 *                 count:
 *                   type: number
 *                 filters:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get('/masters', validateMastersQuery, blockController.getMasters);

/**
 * @swagger
 * /api/service-contracts/blocks/masters/{masterId}/variants:
 *   get:
 *     summary: Get variants for a specific block master
 *     tags: [Service Contracts - Blocks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: masterId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Block master ID
 *     responses:
 *       200:
 *         description: List of block variants
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       block_id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       node_type:
 *                         type: string
 *                       default_config:
 *                         type: object
 *                       master:
 *                         type: object
 *                 count:
 *                   type: number
 *                 masterId:
 *                   type: string
 *       400:
 *         description: Bad request
 *       404:
 *         description: Master not found
 *       401:
 *         description: Unauthorized
 */
router.get('/masters/:masterId/variants', 
  validateUUID('masterId'),
  handleValidationErrors,
  blockController.getVariants
);

/**
 * @swagger
 * /api/service-contracts/blocks/hierarchy:
 *   get:
 *     summary: Get complete block hierarchy (categories -> masters -> variants)
 *     tags: [Service Contracts - Blocks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Complete block hierarchy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       icon:
 *                         type: string
 *                       masters:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             name:
 *                               type: string
 *                             variants:
 *                               type: array
 *                               items:
 *                                 type: object
 *                 summary:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: number
 *                     masters:
 *                       type: number
 *                     variants:
 *                       type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get('/hierarchy', blockController.getHierarchy);

/**
 * @swagger
 * /api/service-contracts/blocks/variant/{variantId}:
 *   get:
 *     summary: Get specific block variant details
 *     tags: [Service Contracts - Blocks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Block variant ID
 *     responses:
 *       200:
 *         description: Block variant details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     block_id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     node_type:
 *                       type: string
 *                     default_config:
 *                       type: object
 *                     master:
 *                       type: object
 *       400:
 *         description: Bad request
 *       404:
 *         description: Variant not found
 *       401:
 *         description: Unauthorized
 */
router.get('/variant/:variantId',
  validateUUID('variantId'),
  handleValidationErrors,
  blockController.getVariantById
);

/**
 * @swagger
 * /api/service-contracts/blocks/template-builder:
 *   get:
 *     summary: Get blocks optimized for template builder UI
 *     tags: [Service Contracts - Blocks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Blocks prepared for template builder
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       masters:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             variants:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   isAvailable:
 *                                     type: boolean
 *                                   maxInstances:
 *                                     type: number
 *                                     nullable: true
 *                                   dependencies:
 *                                     type: array
 *                                     items:
 *                                       type: string
 *                                   displayName:
 *                                     type: string
 *                                   searchTerms:
 *                                     type: array
 *                                     items:
 *                                       type: string
 *                 summary:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get('/template-builder', blockController.getBlocksForTemplateBuilder);

/**
 * @swagger
 * /api/service-contracts/blocks/search:
 *   get:
 *     summary: Search blocks by name, description, or category
 *     tags: [Service Contracts - Blocks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Search query
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: Filter by category name
 *       - in: query
 *         name: nodeType
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: Filter by node type
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       displayPath:
 *                         type: string
 *                       category:
 *                         type: object
 *                       master:
 *                         type: object
 *                 count:
 *                   type: number
 *                 query:
 *                   type: string
 *                 filters:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get('/search', validateSearchQuery, blockController.searchBlocks);

/**
 * @swagger
 * /api/service-contracts/blocks/stats:
 *   get:
 *     summary: Get block system statistics
 *     tags: [Service Contracts - Blocks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Block system statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: object
 *                       properties:
 *                         categories:
 *                           type: number
 *                         masters:
 *                           type: number
 *                         variants:
 *                           type: number
 *                     byCategory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           masters:
 *                             type: number
 *                           variants:
 *                             type: number
 *                     byNodeType:
 *                       type: object
 *                     health:
 *                       type: object
 *                       properties:
 *                         activeCategories:
 *                           type: number
 *                         averageVariantsPerMaster:
 *                           type: number
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', blockController.getBlockStats);

export default router;