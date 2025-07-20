// src/routes/invitationRoutes.ts
import express from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { 
  createInvitationValidation,
  validateInvitationValidation,
  acceptInvitationValidation 
} from '../validators/invitation';
import * as invitationController from '../controllers/invitationController';

const router = express.Router();

// Protected routes (require authentication)

/**
 * @swagger
 * /api/users/invitations:
 *   get:
 *     summary: List all invitations for the current tenant
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, pending, sent, resent, accepted, expired, cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of invitations with pagination
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/invitations',
  authenticate,
  invitationController.listInvitations
);

/**
 * @swagger
 * /api/users/invitations/{id}:
 *   get:
 *     summary: Get a specific invitation
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invitation ID
 *     responses:
 *       200:
 *         description: Invitation details
 *       404:
 *         description: Invitation not found
 */
router.get(
  '/invitations/:id',
  authenticate,
  invitationController.getInvitation
);

/**
 * @swagger
 * /api/users/invitations:
 *   post:
 *     summary: Create a new invitation
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               mobile_number:
 *                 type: string
 *               invitation_method:
 *                 type: string
 *                 enum: [email, sms, whatsapp]
 *               role_id:
 *                 type: string
 *               custom_message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Invitation created
 *       400:
 *         description: Bad request
 */
router.post(
  '/invitations',
  authenticate,
  createInvitationValidation,
  validateRequest,
  invitationController.createInvitation
);

/**
 * @swagger
 * /api/users/invitations/{id}/resend:
 *   post:
 *     summary: Resend an invitation
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invitation ID
 *     responses:
 *       200:
 *         description: Invitation resent
 *       404:
 *         description: Invitation not found
 */
router.post(
  '/invitations/:id/resend',
  authenticate,
  invitationController.resendInvitation
);

/**
 * @swagger
 * /api/users/invitations/{id}/cancel:
 *   post:
 *     summary: Cancel an invitation
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invitation ID
 *     responses:
 *       200:
 *         description: Invitation cancelled
 *       404:
 *         description: Invitation not found
 */
router.post(
  '/invitations/:id/cancel',
  authenticate,
  invitationController.cancelInvitation
);

// Public routes (no authentication required)

/**
 * @swagger
 * /api/users/invitations/validate:
 *   post:
 *     summary: Validate an invitation code
 *     tags: [Invitations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_code
 *               - secret_code
 *             properties:
 *               user_code:
 *                 type: string
 *               secret_code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invitation valid
 *       400:
 *         description: Invalid invitation
 */
router.post(
  '/invitations/validate',
  validateInvitationValidation,
  validateRequest,
  invitationController.validateInvitation
);

/**
 * @swagger
 * /api/users/invitations/accept:
 *   post:
 *     summary: Accept an invitation
 *     tags: [Invitations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_code
 *               - secret_code
 *               - user_id
 *             properties:
 *               user_code:
 *                 type: string
 *               secret_code:
 *                 type: string
 *               user_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invitation accepted
 *       400:
 *         description: Invalid invitation
 */
router.post(
  '/invitations/accept',
  acceptInvitationValidation,
  validateRequest,
  invitationController.acceptInvitation
);

export default router;