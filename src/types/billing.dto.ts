// ============================================================================
// Billing DTOs - Request/Response Type Definitions
// ============================================================================
// Purpose: Define API contracts for billing endpoints
// Pattern: API layer defines WHAT can be done (not HOW)
// ============================================================================

// ============================================================================
// REQUEST DTOs
// ============================================================================

/**
 * Record usage event request
 */
export interface RecordUsageRequest {
  tenant_id?: string;         // Optional if x-tenant-id header provided
  metric_type: string;        // 'contract', 'user', 'storage_mb', 'notification_*'
  quantity?: number;          // Default: 1
  metadata?: Record<string, any>;
}

/**
 * Deduct credits request
 */
export interface DeductCreditsRequest {
  tenant_id?: string;
  credit_type: string;        // 'notification', 'ai_report', etc.
  quantity: number;
  channel?: string;           // 'email', 'sms', 'whatsapp' for notifications
  reference_type?: string;    // 'jtd', 'manual', 'contract', etc.
  reference_id?: string;
  description?: string;
}

/**
 * Add credits request
 */
export interface AddCreditsRequest {
  tenant_id?: string;
  credit_type: string;
  quantity: number;
  channel?: string;
  source?: string;            // 'topup', 'subscription', 'manual', 'bonus'
  reference_id?: string;
  description?: string;
}

/**
 * Purchase topup request
 */
export interface PurchaseTopupRequest {
  tenant_id?: string;
  pack_id: string;            // UUID of topup pack
  payment_reference?: string; // Razorpay payment ID
}

/**
 * Check credit availability request
 */
export interface CheckCreditsRequest {
  tenant_id?: string;
  credit_type: string;
  quantity: number;
  channel?: string;
}

/**
 * Usage summary query params
 */
export interface UsageSummaryQuery {
  period_start?: string;      // ISO date string
  period_end?: string;        // ISO date string
}

/**
 * Topup packs query params
 */
export interface TopupPacksQuery {
  product_code?: string;      // 'contractnest', 'familyknows', 'kaladristi'
  credit_type?: string;       // 'notification', 'ai_report'
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/**
 * Standard billing API response wrapper
 */
export interface BillingResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Billing status response
 */
export interface BillingStatusResponse {
  success: boolean;
  tenant_id: string;
  product_code: string;
  status: 'active' | 'trial' | 'grace_period' | 'suspended' | 'cancelled';
  plan_name: string;
  billing_cycle: 'monthly' | 'quarterly' | 'annual';
  current_period: {
    start: string;
    end: string;
    days_remaining: number;
  };
  usage: {
    contracts: MetricUsage;
    users: MetricUsage;
    storage: StorageUsage;
  };
  credits: {
    notifications: CreditBalance;
  };
  alerts: BillingAlert[];
  quick_actions: QuickAction[];
}

export interface MetricUsage {
  used: number;
  limit: number | null;
  percentage: number | null;
  unlimited: boolean;
}

export interface StorageUsage {
  used_mb: number;
  included_mb: number;
  overage_mb: number;
  percentage: number;
}

export interface CreditBalance {
  balance: number;
  low_threshold: number;
  is_low: boolean;
  expires_at?: string;
}

export interface BillingAlert {
  severity: 'info' | 'warning' | 'error';
  message: string;
  action?: string;
}

export interface QuickAction {
  action: string;
  label: string;
  url?: string;
}

/**
 * Subscription details response
 */
export interface SubscriptionDetailsResponse {
  success: boolean;
  subscription: {
    id: string;
    tenant_id: string;
    product_code: string;
    product_name: string;
    plan_name: string;
    plan_description: string;
    status: string;
    billing_cycle: string;
    current_period_start: string;
    current_period_end: string;
    next_billing_date: string;
    trial_end_date?: string;
    grace_end_date?: string;
    created_at: string;
  };
  credits: Record<string, { balance: number; expires_at?: string }>;
  product_config: {
    billing_model: string;
    trial_days: number;
    grace_days: number;
  };
}

/**
 * Credit balance response
 */
export interface CreditBalanceResponse {
  success: boolean;
  tenant_id: string;
  balances: Array<{
    credit_type: string;
    channel?: string;
    balance: number;
    reserved: number;
    available: number;
    expires_at?: string;
  }>;
  total_by_type: Record<string, number>;
}

/**
 * Usage summary response
 */
export interface UsageSummaryResponse {
  success: boolean;
  tenant_id: string;
  subscription_id: string;
  product_code: string;
  status: string;
  period: {
    start: string;
    end: string;
    days_remaining: number;
  };
  metrics: {
    contracts: MetricUsage;
    users: { used: number; included: number; extra: number };
    storage: StorageUsage;
    notifications: { credits_remaining: number; low_threshold: number; is_low: boolean };
  };
  raw_usage: Record<string, number>;
  generated_at: string;
}

/**
 * Invoice estimate response
 */
export interface InvoiceEstimateResponse {
  success: boolean;
  tenant_id: string;
  subscription_id: string;
  product_code: string;
  billing_cycle: string;
  period: {
    start: string;
    end: string;
  };
  usage: Record<string, number>;
  line_items: InvoiceLineItem[];
  summary: {
    base_fee: number;
    usage_charges: number;
    storage_charges: number;
    subtotal: number;
    tax: number;
    total: number;
  };
  currency: string;
  next_billing_date: string;
  estimated_at: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

/**
 * Topup packs response
 */
export interface TopupPacksResponse {
  success: boolean;
  packs: TopupPack[];
  count: number;
}

export interface TopupPack {
  id: string;
  product_code: string;
  credit_type: string;
  name: string;
  quantity: number;
  price: number;
  currency: string;
  expiry_days: number | null;
  price_per_unit: number;
}

/**
 * Credit operation result
 */
export interface CreditOperationResponse {
  success: boolean;
  operation: 'deduct' | 'add' | 'topup' | 'check';
  tenant_id: string;
  credit_type: string;
  quantity: number;
  previous_balance?: number;
  new_balance?: number;
  is_available?: boolean;
  transaction_id?: string;
  error?: string;
}

/**
 * Usage recording result
 */
export interface RecordUsageResponse {
  success: boolean;
  usage_id: string;
  tenant_id: string;
  metric_type: string;
  quantity: number;
  period_total: number;
  recorded_at: string;
}

// ============================================================================
// ERROR RESPONSES
// ============================================================================

export interface BillingErrorResponse {
  success: false;
  error: string;
  code: BillingErrorCode;
  details?: Record<string, any>;
  action?: {
    type: string;
    url?: string;
    label?: string;
  };
}

export type BillingErrorCode =
  | 'VALIDATION_ERROR'
  | 'TENANT_NOT_FOUND'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'INSUFFICIENT_CREDITS'
  | 'PACK_NOT_FOUND'
  | 'PRODUCT_CONFIG_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR';
