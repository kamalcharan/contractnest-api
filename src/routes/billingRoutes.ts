// ============================================================================
// Billing Routes
// ============================================================================
// Purpose: Define billing API endpoints
// Pattern: Routes define WHAT endpoints exist, validators enforce contracts
// ============================================================================

import express from 'express';
import * as billingController from '../controllers/billingController';
import {
  tenantIdParamValidation,
  usageSummaryQueryValidation,
  topupPacksQueryValidation,
  recordUsageValidation,
  deductCreditsValidation,
  addCreditsValidation,
  purchaseTopupValidation,
  checkCreditsValidation
} from '../validators/billingValidators';

const router = express.Router();

// ============================================================================
// GET ENDPOINTS - Read Operations
// ============================================================================

/**
 * @route GET /api/billing/status/:tenantId
 * @description Get comprehensive billing status (bot-friendly)
 * @param {string} tenantId - Tenant UUID
 * @returns {BillingStatusResponse}
 */
router.get(
  '/billing/status/:tenantId',
  tenantIdParamValidation,
  billingController.getBillingStatus
);

/**
 * @route GET /api/billing/subscription/:tenantId
 * @description Get detailed subscription information
 * @param {string} tenantId - Tenant UUID
 * @returns {SubscriptionDetailsResponse}
 */
router.get(
  '/billing/subscription/:tenantId',
  tenantIdParamValidation,
  billingController.getSubscriptionDetails
);

/**
 * @route GET /api/billing/credits/:tenantId
 * @description Get credit balances for tenant
 * @param {string} tenantId - Tenant UUID
 * @returns {CreditBalanceResponse}
 */
router.get(
  '/billing/credits/:tenantId',
  tenantIdParamValidation,
  billingController.getCreditBalance
);

/**
 * @route GET /api/billing/usage/:tenantId
 * @description Get usage summary with limits
 * @param {string} tenantId - Tenant UUID
 * @query {string} period_start - Optional ISO date
 * @query {string} period_end - Optional ISO date
 * @returns {UsageSummaryResponse}
 */
router.get(
  '/billing/usage/:tenantId',
  [...tenantIdParamValidation, ...usageSummaryQueryValidation],
  billingController.getUsageSummary
);

/**
 * @route GET /api/billing/invoice-estimate/:tenantId
 * @description Get estimated invoice for current billing period
 * @param {string} tenantId - Tenant UUID
 * @returns {InvoiceEstimateResponse}
 */
router.get(
  '/billing/invoice-estimate/:tenantId',
  tenantIdParamValidation,
  billingController.getInvoiceEstimate
);

/**
 * @route GET /api/billing/alerts/:tenantId
 * @description Get billing alerts for tenant
 * @param {string} tenantId - Tenant UUID
 * @returns {BillingAlert[]}
 */
router.get(
  '/billing/alerts/:tenantId',
  tenantIdParamValidation,
  billingController.getBillingAlerts
);

/**
 * @route GET /api/billing/topup-packs
 * @description Get available topup packs
 * @query {string} product_code - Optional filter by product
 * @query {string} credit_type - Optional filter by credit type
 * @returns {TopupPacksResponse}
 */
router.get(
  '/billing/topup-packs',
  topupPacksQueryValidation,
  billingController.getTopupPacks
);

// ============================================================================
// POST ENDPOINTS - Write Operations
// ============================================================================

/**
 * @route POST /api/billing/usage
 * @description Record a usage event
 * @body {RecordUsageRequest}
 * @returns {RecordUsageResponse}
 */
router.post(
  '/billing/usage',
  recordUsageValidation,
  billingController.recordUsage
);

/**
 * @route POST /api/billing/credits/deduct
 * @description Deduct credits from tenant balance
 * @body {DeductCreditsRequest}
 * @returns {CreditOperationResponse}
 */
router.post(
  '/billing/credits/deduct',
  deductCreditsValidation,
  billingController.deductCredits
);

/**
 * @route POST /api/billing/credits/add
 * @description Add credits to tenant balance
 * @body {AddCreditsRequest}
 * @returns {CreditOperationResponse}
 */
router.post(
  '/billing/credits/add',
  addCreditsValidation,
  billingController.addCredits
);

/**
 * @route POST /api/billing/credits/topup
 * @description Purchase a topup pack
 * @body {PurchaseTopupRequest}
 * @returns {CreditOperationResponse}
 */
router.post(
  '/billing/credits/topup',
  purchaseTopupValidation,
  billingController.purchaseTopup
);

/**
 * @route POST /api/billing/credits/check
 * @description Check credit availability without deducting
 * @body {CheckCreditsRequest}
 * @returns {CreditOperationResponse}
 */
router.post(
  '/billing/credits/check',
  checkCreditsValidation,
  billingController.checkCreditAvailability
);

export default router;
