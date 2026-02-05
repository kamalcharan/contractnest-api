// src/routes/contactRoutes.ts
// Express routes for contact management
// Reconstructed based on ContactController and ContactService

import express from 'express';
import ContactController from '../controllers/contactController';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const contactController = new ContactController();

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
      code: 'MISSING_TENANT_ID',
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Apply tenant check to all routes
router.use(ensureTenant);

// Rate limiting for contact operations
const contactRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many contact requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const createContactRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit contact creation to 20 per 15 minutes
  message: {
    success: false,
    error: 'Too many contact creation requests, please try again later',
    code: 'CREATE_RATE_LIMIT_EXCEEDED'
  }
});

// Apply rate limiting
router.use(contactRateLimit);

// =================================================================
// CONTACT ROUTES
// =================================================================

/**
 * @swagger
 * /api/contacts:
 *   get:
 *     summary: List contacts with filtering and pagination
 *     description: Retrieve a paginated list of contacts with optional filtering
 *     tags: [Contacts]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, archived]
 *           default: active
 *         description: Filter by contact status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [individual, corporate, contact_person]
 *         description: Filter by contact type
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: Search term for contact names, emails, companies
 *       - in: query
 *         name: classifications
 *         schema:
 *           type: string
 *         description: Comma-separated list of classifications to filter by
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
 *         description: Number of contacts per page
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include inactive contacts in results
 *       - in: query
 *         name: includeArchived
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include archived contacts in results
 *     responses:
 *       200:
 *         description: List of contacts retrieved successfully
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
 *                     $ref: '#/components/schemas/Contact'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
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
router.get('/', contactController.listContacts);

/**
 * @swagger
 * /api/contacts/stats:
 *   get:
 *     summary: Get contact statistics
 *     description: Retrieve contact statistics for dashboard and analytics
 *     tags: [Contacts]
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
 *         name: contact_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional specific contact ID for detailed stats
 *     responses:
 *       200:
 *         description: Contact statistics retrieved successfully
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
 *                     total:
 *                       type: integer
 *                       description: Total number of contacts
 *                     active:
 *                       type: integer
 *                       description: Number of active contacts
 *                     inactive:
 *                       type: integer
 *                       description: Number of inactive contacts
 *                     archived:
 *                       type: integer
 *                       description: Number of archived contacts
 *                     byType:
 *                       type: object
 *                       properties:
 *                         individual:
 *                           type: integer
 *                         corporate:
 *                           type: integer
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
router.get('/stats', contactController.getContactStats);

/**
 * @swagger
 * /api/contacts/health:
 *   get:
 *     summary: Contact service health check
 *     description: Check the health status of the contact service
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 service:
 *                   type: string
 *                   example: contacts
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'contacts',
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /api/contacts/constants:
 *   get:
 *     summary: Get contact form constants
 *     description: Retrieve constants needed for contact forms (statuses, types, classifications)
 *     tags: [Contacts]
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
 *                     statuses:
 *                       type: array
 *                       items:
 *                         type: string
 *                     types:
 *                       type: array
 *                       items:
 *                         type: string
 *                     classifications:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.get('/constants', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      statuses: ['active', 'inactive', 'archived'],
      types: ['individual', 'corporate', 'contact_person'],
      classifications: ['buyer', 'seller', 'vendor', 'partner', 'service_provider'],
      channelTypes: ['email', 'mobile', 'landline', 'whatsapp', 'fax'],
      addressTypes: ['home', 'office', 'billing', 'shipping', 'factory', 'warehouse', 'other']
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /api/contacts:
 *   post:
 *     summary: Create a new contact
 *     description: Create a new individual or corporate contact
 *     tags: [Contacts]
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
 *             $ref: '#/components/schemas/CreateContactRequest'
 *     responses:
 *       201:
 *         description: Contact created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Contact'
 *                 message:
 *                   type: string
 *                   example: "Contact created successfully"
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
router.post('/', createContactRateLimit, contactController.createContact);

/**
 * @swagger
 * /api/contacts/search:
 *   post:
 *     summary: Advanced contact search
 *     description: Perform advanced search across contacts with complex filters
 *     tags: [Contacts]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search query string
 *               filters:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     enum: [active, inactive, archived]
 *                   type:
 *                     type: string
 *                     enum: [individual, corporate]
 *                   classifications:
 *                     type: array
 *                     items:
 *                       type: string
 *                   page:
 *                     type: integer
 *                     minimum: 1
 *                   limit:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 100
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
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
 *                     $ref: '#/components/schemas/Contact'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
 */
router.post('/search', contactController.searchContacts);

/**
 * @swagger
 * /api/contacts/duplicates:
 *   post:
 *     summary: Check for duplicate contacts
 *     description: Check if a contact with similar details already exists
 *     tags: [Contacts]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               company_name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Duplicate check completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 duplicates:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Contact'
 *                 has_duplicates:
 *                   type: boolean
 */
router.post('/duplicates', contactController.checkDuplicates);

/**
 * @swagger
 * /api/contacts/{id}/cockpit:
 *   get:
 *     summary: Get contact cockpit summary
 *     description: Get dashboard data including contracts, events, LTV, health score
 *     tags: [Contacts]
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
 *         description: Contact ID
 *       - in: query
 *         name: days_ahead
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Number of days to look ahead for events
 *     responses:
 *       200:
 *         description: Cockpit summary retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/cockpit', contactController.getContactCockpit);

/**
 * @swagger
 * /api/contacts/{id}:
 *   get:
 *     summary: Get a contact by ID
 *     description: Retrieve detailed information about a specific contact
 *     tags: [Contacts]
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
 *         description: Contact ID
 *     responses:
 *       200:
 *         description: Contact retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Contact'
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
router.get('/:id', contactController.getContact);

/**
 * @swagger
 * /api/contacts/{id}:
 *   put:
 *     summary: Update a contact
 *     description: Update an existing contact's information
 *     tags: [Contacts]
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
 *         description: Contact ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateContactRequest'
 *     responses:
 *       200:
 *         description: Contact updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Contact'
 *                 message:
 *                   type: string
 *                   example: "Contact updated successfully"
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
router.put('/:id', contactController.updateContact);

/**
 * @swagger
 * /api/contacts/{id}/status:
 *   patch:
 *     summary: Update contact status
 *     description: Update only the status of a contact (active/inactive/archived)
 *     tags: [Contacts]
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
 *         description: Contact ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, archived]
 *                 description: New status for the contact
 *     responses:
 *       200:
 *         description: Contact status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Contact'
 *                 message:
 *                   type: string
 *                   example: "Contact status updated successfully"
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
router.patch('/:id/status', contactController.updateContactStatus);

/**
 * @swagger
 * /api/contacts/{id}:
 *   delete:
 *     summary: Delete a contact
 *     description: Soft delete a contact (marks as archived) or hard delete if forced
 *     tags: [Contacts]
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
 *         description: Contact ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               force:
 *                 type: boolean
 *                 default: false
 *                 description: If true, permanently delete the contact
 *     responses:
 *       200:
 *         description: Contact deleted successfully
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
 *                   example: "Contact deleted successfully"
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
router.delete('/:id', contactController.deleteContact);

/**
 * @swagger
 * /api/contacts/{id}/invite:
 *   post:
 *     summary: Send user invitation to contact
 *     description: Send an invitation email to the contact to join the platform
 *     tags: [Contacts]
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
 *         description: Contact ID
 *     responses:
 *       200:
 *         description: Invitation sent successfully
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
 *                   example: "Invitation sent successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/:id/invite', contactController.sendInvitation);

export default router;

// =================================================================
// SWAGGER COMPONENT SCHEMAS FOR CONTACTS
// =================================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     Contact:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique contact identifier
 *         tenant_id:
 *           type: string
 *           format: uuid
 *           description: Tenant identifier
 *         type:
 *           type: string
 *           enum: [individual, corporate, contact_person]
 *           description: Type of contact
 *         status:
 *           type: string
 *           enum: [active, inactive, archived]
 *           description: Contact status
 *         name:
 *           type: string
 *           description: Individual contact name
 *         company_name:
 *           type: string
 *           description: Corporate contact name
 *         registration_number:
 *           type: string
 *           description: Corporate registration number
 *         salutation:
 *           type: string
 *           description: Salutation for individual contacts
 *         classifications:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               classification_value:
 *                 type: string
 *               classification_label:
 *                 type: string
 *         contact_channels:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               channel_type:
 *                 type: string
 *               value:
 *                 type: string
 *               country_code:
 *                 type: string
 *               is_primary:
 *                 type: boolean
 *               is_verified:
 *                 type: boolean
 *         addresses:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               address_type:
 *                 type: string
 *               line1:
 *                 type: string
 *               line2:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               country:
 *                 type: string
 *               postal_code:
 *                 type: string
 *               is_primary:
 *                 type: boolean
 *         tags:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               tag_value:
 *                 type: string
 *               tag_label:
 *                 type: string
 *               tag_color:
 *                 type: string
 *         compliance_numbers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type_value:
 *                 type: string
 *               type_label:
 *                 type: string
 *               number:
 *                 type: string
 *               is_verified:
 *                 type: boolean
 *         notes:
 *           type: string
 *           description: Additional notes about the contact
 *         potential_duplicate:
 *           type: boolean
 *           description: Whether this contact might be a duplicate
 *         duplicate_reasons:
 *           type: array
 *           items:
 *             type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 * 
 *     CreateContactRequest:
 *       type: object
 *       required:
 *         - type
 *         - classifications
 *         - contact_channels
 *       properties:
 *         type:
 *           type: string
 *           enum: [individual, corporate]
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           default: active
 *         name:
 *           type: string
 *           description: Required for individual contacts
 *         company_name:
 *           type: string
 *           description: Required for corporate contacts
 *         registration_number:
 *           type: string
 *           description: Corporate registration number
 *         salutation:
 *           type: string
 *           description: Salutation for individual contacts
 *         classifications:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               classification_value:
 *                 type: string
 *               classification_label:
 *                 type: string
 *         contact_channels:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               channel_type:
 *                 type: string
 *               value:
 *                 type: string
 *               country_code:
 *                 type: string
 *               is_primary:
 *                 type: boolean
 *         addresses:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               address_type:
 *                 type: string
 *               label:
 *                 type: string
 *               line1:
 *                 type: string
 *               line2:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               country:
 *                 type: string
 *               postal_code:
 *                 type: string
 *               is_primary:
 *                 type: boolean
 *         tags:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               tag_value:
 *                 type: string
 *               tag_label:
 *                 type: string
 *               tag_color:
 *                 type: string
 *         compliance_numbers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type_value:
 *                 type: string
 *               type_label:
 *                 type: string
 *               number:
 *                 type: string
 *               issuing_authority:
 *                 type: string
 *               valid_from:
 *                 type: string
 *                 format: date
 *               valid_to:
 *                 type: string
 *                 format: date
 *               is_verified:
 *                 type: boolean
 *         notes:
 *           type: string
 *         send_invitation:
 *           type: boolean
 *           default: false
 * 
 *     UpdateContactRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         company_name:
 *           type: string
 *         registration_number:
 *           type: string
 *         salutation:
 *           type: string
 *         classifications:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               classification_value:
 *                 type: string
 *               classification_label:
 *                 type: string
 *         tags:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               tag_value:
 *                 type: string
 *               tag_label:
 *                 type: string
 *               tag_color:
 *                 type: string
 *         compliance_numbers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type_value:
 *                 type: string
 *               type_label:
 *                 type: string
 *               number:
 *                 type: string
 *               issuing_authority:
 *                 type: string
 *               valid_from:
 *                 type: string
 *                 format: date
 *               valid_to:
 *                 type: string
 *                 format: date
 *               is_verified:
 *                 type: boolean
 *         notes:
 *           type: string
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
 *               code:
 *                 type: string
 *                 example: "BAD_REQUEST"
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
 *               code:
 *                 type: string
 *                 example: "VALIDATION_ERROR"
 *               validation_errors:
 *                 type: array
 *                 items:
 *                   type: string
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
 *                 example: "Contact not found"
 *               code:
 *                 type: string
 *                 example: "NOT_FOUND"
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
 *                 example: "Contact already exists"
 *               code:
 *                 type: string
 *                 example: "DUPLICATE_FOUND"
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
 *               code:
 *                 type: string
 *                 example: "INTERNAL_ERROR"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 */