// ============================================================================
// Billing Service
// ============================================================================
// Purpose: HTTP client to call billing Edge functions
// Pattern: API service → Edge function → RPC
// Note: NO business logic here - just HTTP client to Edge
// ============================================================================

import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';
import {
  RecordUsageRequest,
  DeductCreditsRequest,
  AddCreditsRequest,
  PurchaseTopupRequest,
  CheckCreditsRequest,
  BillingStatusResponse,
  SubscriptionDetailsResponse,
  CreditBalanceResponse,
  UsageSummaryResponse,
  InvoiceEstimateResponse,
  TopupPacksResponse,
  CreditOperationResponse,
  RecordUsageResponse,
  BillingAlert
} from '../types/billing.dto';

// Edge function base URL
const BILLING_EDGE_URL = `${SUPABASE_URL}/functions/v1/billing`;

/**
 * Helper to make authenticated requests to Edge function
 */
async function callBillingEdge<T>(
  method: 'GET' | 'POST',
  path: string,
  authToken: string,
  tenantId: string,
  data?: any,
  params?: Record<string, string>
): Promise<T> {
  try {
    const response = await axios({
      method,
      url: `${BILLING_EDGE_URL}${path}`,
      headers: {
        'Authorization': authToken,
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json'
      },
      data: method === 'POST' ? data : undefined,
      params: method === 'GET' ? params : undefined
    });

    return response.data;
  } catch (error: any) {
    console.error(`Billing Edge call failed: ${method} ${path}`, error.response?.data || error.message);

    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'billing_service', path },
      extra: { method, tenantId }
    });

    // Re-throw with Edge error message if available
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw error;
  }
}

// ============================================================================
// SERVICE EXPORTS
// ============================================================================

export const billingService = {
  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * Get billing status (bot-friendly comprehensive status)
   * GET /billing/status/:tenantId
   */
  async getBillingStatus(
    authToken: string,
    tenantId: string
  ): Promise<BillingStatusResponse> {
    return callBillingEdge('GET', `/status/${tenantId}`, authToken, tenantId);
  },

  /**
   * Get subscription details
   * GET /billing/subscription/:tenantId
   */
  async getSubscriptionDetails(
    authToken: string,
    tenantId: string
  ): Promise<SubscriptionDetailsResponse> {
    return callBillingEdge('GET', `/subscription/${tenantId}`, authToken, tenantId);
  },

  /**
   * Get credit balances
   * GET /billing/credits/:tenantId
   */
  async getCreditBalance(
    authToken: string,
    tenantId: string
  ): Promise<CreditBalanceResponse> {
    return callBillingEdge('GET', `/credits/${tenantId}`, authToken, tenantId);
  },

  /**
   * Get usage summary
   * GET /billing/usage/:tenantId
   */
  async getUsageSummary(
    authToken: string,
    tenantId: string,
    periodStart?: string,
    periodEnd?: string
  ): Promise<UsageSummaryResponse> {
    const params: Record<string, string> = {};
    if (periodStart) params.period_start = periodStart;
    if (periodEnd) params.period_end = periodEnd;

    return callBillingEdge('GET', `/usage/${tenantId}`, authToken, tenantId, undefined, params);
  },

  /**
   * Get invoice estimate
   * GET /billing/invoice-estimate/:tenantId
   */
  async getInvoiceEstimate(
    authToken: string,
    tenantId: string
  ): Promise<InvoiceEstimateResponse> {
    return callBillingEdge('GET', `/invoice-estimate/${tenantId}`, authToken, tenantId);
  },

  /**
   * Get billing alerts
   * GET /billing/alerts/:tenantId
   */
  async getBillingAlerts(
    authToken: string,
    tenantId: string
  ): Promise<{ success: boolean; alerts: BillingAlert[] }> {
    return callBillingEdge('GET', `/alerts/${tenantId}`, authToken, tenantId);
  },

  /**
   * Get available topup packs
   * GET /billing/topup-packs
   */
  async getTopupPacks(
    authToken: string,
    tenantId: string,
    productCode?: string,
    creditType?: string
  ): Promise<TopupPacksResponse> {
    const params: Record<string, string> = {};
    if (productCode) params.product_code = productCode;
    if (creditType) params.credit_type = creditType;

    return callBillingEdge('GET', '/topup-packs', authToken, tenantId, undefined, params);
  },

  // ==========================================================================
  // WRITE OPERATIONS
  // ==========================================================================

  /**
   * Record usage event
   * POST /billing/usage
   */
  async recordUsage(
    authToken: string,
    tenantId: string,
    request: RecordUsageRequest
  ): Promise<RecordUsageResponse> {
    return callBillingEdge('POST', '/usage', authToken, tenantId, {
      ...request,
      tenant_id: request.tenant_id || tenantId
    });
  },

  /**
   * Deduct credits
   * POST /billing/credits/deduct
   */
  async deductCredits(
    authToken: string,
    tenantId: string,
    request: DeductCreditsRequest
  ): Promise<CreditOperationResponse> {
    return callBillingEdge('POST', '/credits-deduct', authToken, tenantId, {
      ...request,
      tenant_id: request.tenant_id || tenantId
    });
  },

  /**
   * Add credits
   * POST /billing/credits/add
   */
  async addCredits(
    authToken: string,
    tenantId: string,
    request: AddCreditsRequest
  ): Promise<CreditOperationResponse> {
    return callBillingEdge('POST', '/credits-add', authToken, tenantId, {
      ...request,
      tenant_id: request.tenant_id || tenantId
    });
  },

  /**
   * Purchase topup pack
   * POST /billing/credits/topup
   */
  async purchaseTopup(
    authToken: string,
    tenantId: string,
    request: PurchaseTopupRequest
  ): Promise<CreditOperationResponse> {
    return callBillingEdge('POST', '/credits-topup', authToken, tenantId, {
      ...request,
      tenant_id: request.tenant_id || tenantId
    });
  },

  /**
   * Check credit availability (without deducting)
   * POST /billing/credits/check
   */
  async checkCreditAvailability(
    authToken: string,
    tenantId: string,
    request: CheckCreditsRequest
  ): Promise<CreditOperationResponse> {
    return callBillingEdge('POST', '/credits-check', authToken, tenantId, {
      ...request,
      tenant_id: request.tenant_id || tenantId
    });
  }
};

// Default export for convenience
export default billingService;
