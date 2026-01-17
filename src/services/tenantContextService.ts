// contractnest-api/src/services/tenantContextService.ts
// TenantContext Service - Provides tenant context for credit-gated operations
// Created: January 2025

import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';

// ============================================================================
// TYPES
// ============================================================================

export interface TenantContextProfile {
  business_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

export interface TenantContextSubscription {
  id: string | null;
  status: 'active' | 'trial' | 'grace_period' | 'suspended' | null;
  plan_name: string | null;
  billing_cycle: string | null;
  period_start: string | null;
  period_end: string | null;
  trial_end: string | null;
  grace_end: string | null;
  next_billing_date: string | null;
}

export interface TenantContextCredits {
  whatsapp: number;
  sms: number;
  email: number;
  pooled: number;
}

export interface TenantContextLimits {
  users: number | null;
  contracts: number | null;
  storage_mb: number | null;
}

export interface TenantContextUsage {
  users: number;
  contracts: number;
  storage_mb: number;
}

export interface TenantContextAddons {
  vani_ai: boolean;
  rfp: boolean;
}

export interface TenantContextFlags {
  can_access: boolean;
  can_send_whatsapp: boolean;
  can_send_sms: boolean;
  can_send_email: boolean;
  credits_low: boolean;
  near_limit: boolean;
}

export interface TenantContext {
  success: boolean;
  product_code: string;
  tenant_id: string;
  profile: TenantContextProfile;
  subscription: TenantContextSubscription;
  credits: TenantContextCredits;
  limits: TenantContextLimits;
  usage: TenantContextUsage;
  addons: TenantContextAddons;
  flags: TenantContextFlags;
  retrieved_at: string;
  error?: string;
}

export interface WaitingJtdCount {
  whatsapp: number;
  sms: number;
  email: number;
  total: number;
}

// ============================================================================
// IN-MEMORY CACHE (Optional - for high-frequency lookups)
// ============================================================================

interface CacheEntry {
  context: TenantContext;
  expiry: number;
}

// Cache with 30 second TTL
const contextCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

// Clean expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of contextCache.entries()) {
    if (now > entry.expiry) {
      contextCache.delete(key);
    }
  }
}, 60000); // Clean every minute

function getCacheKey(productCode: string, tenantId: string): string {
  return `${productCode}:${tenantId}`;
}

function getFromCache(productCode: string, tenantId: string): TenantContext | null {
  const key = getCacheKey(productCode, tenantId);
  const entry = contextCache.get(key);
  if (entry && Date.now() < entry.expiry) {
    return entry.context;
  }
  if (entry) {
    contextCache.delete(key);
  }
  return null;
}

function setInCache(productCode: string, tenantId: string, context: TenantContext): void {
  const key = getCacheKey(productCode, tenantId);
  contextCache.set(key, {
    context,
    expiry: Date.now() + CACHE_TTL_MS
  });
}

function invalidateCache(productCode: string, tenantId: string): void {
  const key = getCacheKey(productCode, tenantId);
  contextCache.delete(key);
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export const tenantContextService = {
  /**
   * Get tenant context from Edge function / RPC
   * @param authToken - Authorization token from request
   * @param productCode - Product code (e.g., 'contractnest', 'familyknows')
   * @param tenantId - Tenant UUID
   * @param useCache - Whether to use in-memory cache (default: true)
   */
  async getContext(
    authToken: string,
    productCode: string,
    tenantId: string,
    useCache: boolean = true
  ): Promise<TenantContext> {
    try {
      // Check cache first
      if (useCache) {
        const cached = getFromCache(productCode, tenantId);
        if (cached) {
          console.log(`TenantContext cache HIT for ${productCode}:${tenantId}`);
          return cached;
        }
      }

      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Call Edge function
      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/tenant-context`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'x-product-code': productCode,
            'Content-Type': 'application/json'
          }
        }
      );

      const context = response.data as TenantContext;

      // Cache successful response
      if (context.success && useCache) {
        setInCache(productCode, tenantId, context);
      }

      return context;
    } catch (error: any) {
      console.error('Error in getTenantContext service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_context', action: 'getContext' },
        extra: { productCode, tenantId }
      });

      // Return error response
      return {
        success: false,
        product_code: productCode,
        tenant_id: tenantId,
        error: error.message || 'Failed to get tenant context',
        profile: { business_name: null, logo_url: null, primary_color: null, secondary_color: null },
        subscription: { id: null, status: null, plan_name: null, billing_cycle: null, period_start: null, period_end: null, trial_end: null, grace_end: null, next_billing_date: null },
        credits: { whatsapp: 0, sms: 0, email: 0, pooled: 0 },
        limits: { users: null, contracts: null, storage_mb: null },
        usage: { users: 0, contracts: 0, storage_mb: 0 },
        addons: { vani_ai: false, rfp: false },
        flags: { can_access: false, can_send_whatsapp: false, can_send_sms: false, can_send_email: false, credits_low: false, near_limit: false },
        retrieved_at: new Date().toISOString()
      };
    }
  },

  /**
   * Check if tenant can send via specific channel
   * @returns true if tenant has credits and active subscription
   */
  async canSendChannel(
    authToken: string,
    productCode: string,
    tenantId: string,
    channel: 'whatsapp' | 'sms' | 'email' | 'inapp' | 'push'
  ): Promise<boolean> {
    // In-app and push are always free
    if (channel === 'inapp' || channel === 'push') {
      return true;
    }

    const context = await this.getContext(authToken, productCode, tenantId);

    if (!context.success || !context.flags.can_access) {
      return false;
    }

    switch (channel) {
      case 'whatsapp':
        return context.flags.can_send_whatsapp;
      case 'sms':
        return context.flags.can_send_sms;
      case 'email':
        return context.flags.can_send_email;
      default:
        return false;
    }
  },

  /**
   * Get count of JTDs waiting for credits
   */
  async getWaitingJtdCount(
    authToken: string,
    tenantId: string,
    channel?: string
  ): Promise<WaitingJtdCount> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/tenant-context/waiting-jtds`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          },
          params: channel ? { channel } : {}
        }
      );

      if (response.data.success) {
        return response.data.waiting as WaitingJtdCount;
      }

      return { whatsapp: 0, sms: 0, email: 0, total: 0 };
    } catch (error) {
      console.error('Error getting waiting JTD count:', error);
      return { whatsapp: 0, sms: 0, email: 0, total: 0 };
    }
  },

  /**
   * Initialize tenant context (called on signup)
   */
  async initContext(
    authToken: string,
    productCode: string,
    tenantId: string,
    businessName?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/tenant-context/init`,
        { business_name: businessName },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'x-product-code': productCode,
            'Content-Type': 'application/json'
          }
        }
      );

      return { success: response.data.success };
    } catch (error: any) {
      console.error('Error initializing tenant context:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Invalidate cache for a tenant (call after context-changing operations)
   */
  invalidateCache(productCode: string, tenantId: string): void {
    invalidateCache(productCode, tenantId);
    console.log(`TenantContext cache invalidated for ${productCode}:${tenantId}`);
  },

  /**
   * Extract product code from request headers
   * @param req - Express request object
   * @returns product code or null
   */
  getProductCodeFromRequest(req: any): string | null {
    return req.headers['x-product-code'] || null;
  },

  /**
   * Extract tenant ID from request headers
   * @param req - Express request object
   * @returns tenant ID or null
   */
  getTenantIdFromRequest(req: any): string | null {
    return req.headers['x-tenant-id'] || null;
  }
};

export default tenantContextService;
