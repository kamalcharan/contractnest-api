// src/routes/taxSettingsRoutes.ts
import express from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { createAuditContext } from '../middleware/auditMiddleware'; // Changed from setAuditContext
import { 
  getTaxSettings,
  createUpdateTaxSettings,
  createTaxRate,
  updateTaxRate,
  deleteTaxRate,
  getTaxRates,
  activateTaxRate
} from '../controllers/taxSettingsController';
import {
  taxSettingsValidation,
  createTaxRateValidation,
  updateTaxRateValidation,
  deleteTaxRateValidation,
  getTaxRatesValidation,
  getValidation
} from '../validators/taxSettingsValidators';

const router = express.Router();

// Apply middleware in correct order
router.use(authenticate);
router.use(createAuditContext); // Changed from setAuditContext

// Test route to verify routes are working
router.get('/test', (req, res) => {
  res.json({ message: 'Tax settings routes are working!' });
});

/**
 * @swagger
 * /api/tax-settings:
 *   get:
 *     summary: Get tax settings and rates for a tenant
 *     tags: [Tax Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tax settings and rates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 settings:
 *                   $ref: '#/components/schemas/TaxSettings'
 *                 rates:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TaxRate'
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request - missing tenant ID
 *       500:
 *         description: Internal server error
 */
router.get('/', getValidation, getTaxSettings);

/**
 * @swagger
 * /api/tax-settings/settings:
 *   post:
 *     summary: Create or update tax settings for a tenant
 *     tags: [Tax Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: header
 *         name: idempotency-key
 *         required: false
 *         schema:
 *           type: string
 *         description: Idempotency key for safe retries
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - display_mode
 *             properties:
 *               display_mode:
 *                 type: string
 *                 enum: [including_tax, excluding_tax]
 *                 description: How to display prices
 *               default_tax_rate_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Default tax rate to use
 *     responses:
 *       200:
 *         description: Tax settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaxSettings'
 *       201:
 *         description: Tax settings created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaxSettings'
 *       400:
 *         description: Bad request - validation failed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/settings', taxSettingsValidation, validateRequest, createUpdateTaxSettings);

/**
 * @swagger
 * /api/tax-settings/rates:
 *   get:
 *     summary: Get all active tax rates for a tenant
 *     tags: [Tax Rates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: query
 *         name: active_only
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter to active rates only
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [name, rate, sequence_no, created_at]
 *           default: sequence_no
 *         description: Field to sort by
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Tax rates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TaxRate'
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get('/rates', getTaxRatesValidation, validateRequest, getTaxRates);

/**
 * @swagger
 * /api/tax-settings/rates:
 *   post:
 *     summary: Create a new tax rate
 *     tags: [Tax Rates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: header
 *         name: idempotency-key
 *         required: false
 *         schema:
 *           type: string
 *         description: Idempotency key for safe retries
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - rate
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Tax rate name
 *               rate:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Tax rate percentage (0-100)
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 description: Optional description
 *               is_default:
 *                 type: boolean
 *                 default: false
 *                 description: Whether this is the default rate
 *     responses:
 *       201:
 *         description: Tax rate created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaxRate'
 *       400:
 *         description: Bad request - validation failed
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Conflict - duplicate name or sequence
 *       500:
 *         description: Internal server error
 */
router.post('/rates', createTaxRateValidation, validateRequest, createTaxRate);

/**
 * @swagger
 * /api/tax-settings/rates/{id}:
 *   put:
 *     summary: Update an existing tax rate
 *     tags: [Tax Rates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tax rate ID
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: header
 *         name: idempotency-key
 *         required: false
 *         schema:
 *           type: string
 *         description: Idempotency key for safe retries
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Tax rate name
 *               rate:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Tax rate percentage (0-100)
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 description: Optional description
 *               is_default:
 *                 type: boolean
 *                 description: Whether this is the default rate
 *     responses:
 *       200:
 *         description: Tax rate updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaxRate'
 *       400:
 *         description: Bad request - validation failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tax rate not found
 *       409:
 *         description: Conflict - duplicate name or sequence
 *       500:
 *         description: Internal server error
 */
router.put('/rates/:id', updateTaxRateValidation, validateRequest, updateTaxRate);

/**
 * @swagger
 * /api/tax-settings/rates/{id}:
 *   delete:
 *     summary: Delete (deactivate) a tax rate
 *     tags: [Tax Rates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tax rate ID
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tax rate deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 deletedRate:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tax rate not found
 *       500:
 *         description: Internal server error
 */
router.delete('/rates/:id', deleteTaxRateValidation, validateRequest, deleteTaxRate);

/**
 * @swagger
 * /api/tax-settings/rates/{id}/activate:
 *   post:
 *     summary: Activate a deactivated tax rate
 *     tags: [Tax Rates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tax rate ID
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tax rate activated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaxRate'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tax rate not found
 *       500:
 *         description: Internal server error
 */
router.post('/rates/:id/activate', getValidation, validateRequest, activateTaxRate);

/**
 * @swagger
 * components:
 *   schemas:
 *     TaxSettings:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         tenant_id:
 *           type: string
 *         display_mode:
 *           type: string
 *           enum: [including_tax, excluding_tax]
 *         default_tax_rate_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         version:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     TaxRate:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         tenant_id:
 *           type: string
 *         name:
 *           type: string
 *         rate:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         is_default:
 *           type: boolean
 *         is_active:
 *           type: boolean
 *         sequence_no:
 *           type: integer
 *         description:
 *           type: string
 *           nullable: true
 *         version:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

export default router;