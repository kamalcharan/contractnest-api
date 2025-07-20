// src/routes/tenants.ts
import express from 'express';
import { 
  getUserTenants,
  getTenantById,
  createTenant,
  checkTenantAvailability,
  createTenantFromGoogle,
} from '../controllers/tenantController';
import { authenticate } from '../middleware/auth';
// Import the new function from authController since that's where you added it
import { createGoogleTenant } from '../controllers/authController';

const router = express.Router();

/**
 * @swagger
 * /api/tenants/check-availability:
 *   get:
 *     summary: Check if a tenant name is available
 *     tags: [Tenants]
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant name to check
 *     responses:
 *       200:
 *         description: Availability check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 */
router.get('/check-availability', checkTenantAvailability);

/**
 * @swagger
 * /api/tenants:
 *   get:
 *     summary: Get all tenants for the current user
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of tenants
 *       401:
 *         description: Not authenticated
 */
router.get('/', authenticate, getUserTenants);

/**
 * @swagger
 * /api/tenants/{id}:
 *   get:
 *     summary: Get a specific tenant by ID
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant details
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to access this tenant
 *       404:
 *         description: Tenant not found
 */
router.get('/:id', authenticate, getTenantById);

/**
 * @swagger
 * /api/tenants:
 *   post:
 *     summary: Create a new tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Tenant name
 *               domain:
 *                 type: string
 *                 description: Custom domain (optional)
 *     responses:
 *       201:
 *         description: Tenant created successfully
 *       401:
 *         description: Not authenticated
 *       400:
 *         description: Invalid input
 */
router.post('/', authenticate, createTenant);

/**
 * @swagger
 * /api/tenants/create-google:
 *   post:
 *     summary: Create a new tenant for Google-authenticated users
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - workspace_code
 *             properties:
 *               name:
 *                 type: string
 *                 description: Workspace name
 *               workspace_code:
 *                 type: string
 *                 description: Unique workspace code
 *     responses:
 *       201:
 *         description: Tenant created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tenant:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     workspace_code:
 *                       type: string
 *                     is_admin:
 *                       type: boolean
 *                     is_owner:
 *                       type: boolean
 *                     is_default:
 *                       type: boolean
 *       400:
 *         description: Invalid input or workspace code already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 code:
 *                   type: string
 *                   enum: [WORKSPACE_CODE_EXISTS, TENANT_CREATION_FAILED]
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/create-google', authenticate, createGoogleTenant);

// Optional: Keep the old endpoint if it's being used elsewhere
// This can be removed if createTenantFromGoogle is not used
/**
 * @swagger
 * /api/tenants/create-from-google:
 *   post:
 *     summary: Create a new tenant using Google Workspace domain (deprecated)
 *     deprecated: true
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - domain
 *             properties:
 *               domain:
 *                 type: string
 *                 description: Verified Google Workspace domain
 *     responses:
 *       201:
 *         description: Tenant created successfully using Google data
 *       400:
 *         description: Invalid input or domain not verified
 *       401:
 *         description: Not authenticated
 */
if (typeof createTenantFromGoogle === 'function') {
  router.post('/create-from-google', authenticate, createTenantFromGoogle);
}

export default router;