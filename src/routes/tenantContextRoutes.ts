// ============================================================================
// Tenant Context Routes
// ============================================================================
// Purpose: API routes for tenant context - credit availability, subscription status
// Created: January 2025
// ============================================================================

import express from 'express';
import { body } from 'express-validator';
import * as tenantContextController from '../controllers/tenantContextController';

const router = express.Router();

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * @swagger
 * /api/tenant-context/health:
 *   get:
 *     summary: Health check for tenant context service
 *     tags: [TenantContext]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get('/health', tenantContextController.health);

// ============================================================================
// GET ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/tenant-context:
 *   get:
 *     summary: Get tenant context
 *     description: Get comprehensive tenant context including credits, subscription, limits, and flags
 *     tags: [TenantContext]
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant UUID
 *       - in: header
 *         name: x-product-code
 *         required: true
 *         schema:
 *           type: string
 *         description: Product code (contractnest, familyknows)
 *       - in: query
 *         name: refresh
 *         schema:
 *           type: boolean
 *         description: Set to true to bypass cache
 *     responses:
 *       200:
 *         description: Tenant context retrieved successfully
 *       400:
 *         description: Missing required headers
 *       401:
 *         description: Unauthorized
 */
router.get('/', tenantContextController.getContext);

/**
 * @swagger
 * /api/tenant-context/can-send/{channel}:
 *   get:
 *     summary: Check if tenant can send via channel
 *     description: Quick check if tenant has credits and active subscription for channel
 *     tags: [TenantContext]
 *     parameters:
 *       - in: path
 *         name: channel
 *         required: true
 *         schema:
 *           type: string
 *           enum: [whatsapp, sms, email, inapp, push]
 *         description: Communication channel
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-product-code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Can send status returned
 */
router.get('/can-send/:channel', tenantContextController.canSendChannel);

/**
 * @swagger
 * /api/tenant-context/waiting-jtds:
 *   get:
 *     summary: Get count of JTDs waiting for credits
 *     description: Returns count of blocked notifications by channel
 *     tags: [TenantContext]
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: channel
 *         schema:
 *           type: string
 *         description: Filter by specific channel
 *     responses:
 *       200:
 *         description: Waiting JTD counts returned
 */
router.get('/waiting-jtds', tenantContextController.getWaitingJtdCount);

// ============================================================================
// POST ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/tenant-context/init:
 *   post:
 *     summary: Initialize tenant context
 *     description: Called during tenant signup to initialize context record
 *     tags: [TenantContext]
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-product-code
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               business_name:
 *                 type: string
 *                 description: Optional business name
 *     responses:
 *       200:
 *         description: Context initialized successfully
 */
router.post(
  '/init',
  [
    body('business_name')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Business name must be string with max 255 characters')
  ],
  tenantContextController.initContext
);

/**
 * @swagger
 * /api/tenant-context/invalidate-cache:
 *   post:
 *     summary: Invalidate cached tenant context
 *     description: Force cache invalidation for a tenant
 *     tags: [TenantContext]
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-product-code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cache invalidated
 */
router.post('/invalidate-cache', tenantContextController.invalidateCache);

export default router;
