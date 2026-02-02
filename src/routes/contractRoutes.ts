// ============================================================================
// Contract Routes
// ============================================================================
// Purpose: Define contract & RFQ API endpoints
// Pattern: Routes define WHAT endpoints exist, validators enforce contracts
// ============================================================================

import express from 'express';
import ContractController from '../controllers/contractController';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import {
  listContractsValidation,
  getContractByIdValidation,
  createContractValidation,
  updateContractValidation,
  updateContractStatusValidation,
  deleteContractValidation
} from '../validators/contractValidators';

const router = express.Router();
const contractController = new ContractController();

// =================================================================
// MIDDLEWARE
// =================================================================

// Authentication (required for all contract routes)
router.use(authenticate);

// Tenant ID validation
const ensureTenant = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'x-tenant-id header is required'
      },
      metadata: { timestamp: new Date().toISOString() }
    });
  }
  next();
};

router.use(ensureTenant);

// Rate limiting
const contractRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutes
  max: 100,                             // 100 requests per window
  message: {
    success: false,
    error: 'Too many contract requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const createContractRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutes
  max: 30,                              // 30 creates per window
  message: {
    success: false,
    error: 'Too many contract creation requests, please try again later',
    code: 'CREATE_RATE_LIMIT_EXCEEDED'
  }
});

router.use(contractRateLimit);

// =================================================================
// READ ENDPOINTS
// =================================================================

/**
 * @route GET /api/contracts
 * @description List contracts with filtering and pagination
 * @query {string} record_type - Filter by record_type (contract, rfq)
 * @query {string} contract_type - Filter by contract_type
 * @query {string} status - Filter by status
 * @query {string} search - Search in title, contract_number
 * @query {number} page - Page number (default: 1)
 * @query {number} per_page - Items per page (default: 20, max: 100)
 * @query {string} sort_by - Sort field (default: created_at)
 * @query {string} sort_order - Sort direction: asc | desc (default: desc)
 * @returns {ContractListItem[]}
 */
router.get(
  '/',
  listContractsValidation,
  contractController.listContracts
);

/**
 * @route GET /api/contracts/stats
 * @description Get contract dashboard statistics
 * @returns {ContractStatsData}
 */
router.get(
  '/stats',
  contractController.getContractStats
);

/**
 * @route GET /api/contracts/health
 * @description Health check for contract service
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'contracts',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route GET /api/contracts/:id
 * @description Get single contract by ID with blocks, vendors, attachments, history
 * @param {string} id - Contract UUID
 * @returns {ContractDetail}
 */
router.get(
  '/:id',
  getContractByIdValidation,
  contractController.getContract
);

// =================================================================
// WRITE ENDPOINTS
// =================================================================

/**
 * @route POST /api/contracts
 * @description Create new contract or RFQ
 * @header {string} x-idempotency-key - Idempotency key (recommended)
 * @body {CreateContractRequest}
 * @returns {ContractDetail} 201 Created
 */
router.post(
  '/',
  createContractRateLimit,
  createContractValidation,
  contractController.createContract
);

/**
 * @route PUT /api/contracts/:id
 * @description Update existing contract (optimistic concurrency via version)
 * @param {string} id - Contract UUID
 * @header {string} x-idempotency-key - Idempotency key (recommended)
 * @body {UpdateContractRequest} - Must include version field
 * @returns {ContractDetail}
 */
router.put(
  '/:id',
  updateContractValidation,
  contractController.updateContract
);

/**
 * @route PATCH /api/contracts/:id/status
 * @description Update contract status with flow validation
 * @param {string} id - Contract UUID
 * @body {UpdateContractStatusRequest}
 * @returns {ContractDetail}
 */
router.patch(
  '/:id/status',
  updateContractStatusValidation,
  contractController.updateContractStatus
);

/**
 * @route DELETE /api/contracts/:id
 * @description Soft delete contract (draft/cancelled only)
 * @param {string} id - Contract UUID
 * @body {DeleteContractRequest}
 * @returns {{ success: true, message: string }}
 */
router.delete(
  '/:id',
  deleteContractValidation,
  contractController.deleteContract
);

// =================================================================
// INVOICE & PAYMENT ENDPOINTS
// =================================================================

/**
 * @route GET /api/contracts/:id/invoices
 * @description Get all invoices for a contract with collection summary
 * @param {string} id - Contract UUID
 * @returns {InvoicesResponse}
 */
router.get(
  '/:id/invoices',
  contractController.getContractInvoices
);

/**
 * @route POST /api/contracts/:id/invoices/record-payment
 * @description Record a payment receipt against a contract invoice
 * @param {string} id - Contract UUID
 * @body {RecordPaymentRequest}
 * @returns {ReceiptResponse}
 */
router.post(
  '/:id/invoices/record-payment',
  contractController.recordPayment
);

export default router;
