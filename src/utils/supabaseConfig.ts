// src/utils/supabaseConfig.ts
// Multi-product Supabase configuration

import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Request } from 'express';
import { captureException } from './sentry';
import { getProduct, getDefaultProduct, ProductConfig } from '../config/products';

dotenv.config();

// ============================================================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================================================

// Default ContractNest Supabase configuration
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_KEY = process.env.SUPABASE_KEY;

export const validateSupabaseConfig = (source: string, endpoint: string) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    captureException(new Error('Missing Supabase configuration'), {
      tags: { source },
      endpoint,
      missing: !SUPABASE_URL ? 'SUPABASE_URL' : 'SUPABASE_KEY'
    });
    return false;
  }
  return true;
};

// ============================================================================
// MULTI-PRODUCT SUPPORT
// ============================================================================

// Cache for Supabase clients (one per product)
const supabaseClients: Map<string, SupabaseClient> = new Map();

/**
 * Get Supabase configuration for a specific product
 */
export const getSupabaseConfig = (productCode: string): { url: string; key: string } | null => {
  const product = getProduct(productCode);

  if (!product || !product.isConfigured) {
    return null;
  }

  return {
    url: product.supabaseUrl!,
    key: product.supabaseKey!,
  };
};

/**
 * Get or create a Supabase client for a specific product
 * Clients are cached for performance
 */
export const getSupabaseClientForProduct = (productCode: string): SupabaseClient | null => {
  // Check cache first
  if (supabaseClients.has(productCode)) {
    return supabaseClients.get(productCode)!;
  }

  // Get product config
  const config = getSupabaseConfig(productCode);

  if (!config) {
    console.error(`❌ Cannot create Supabase client for product: ${productCode}`);
    return null;
  }

  // Create new client
  const client = createClient(config.url, config.key);

  // Cache it
  supabaseClients.set(productCode, client);

  console.log(`✅ Created Supabase client for product: ${productCode}`);

  return client;
};

/**
 * Get Supabase client from Express request (uses req.product)
 * Falls back to default product if not set
 */
export const getSupabaseClientFromRequest = (req: Request): SupabaseClient | null => {
  // Access productCode from request (set by productContext middleware)
  const productCode = (req as any).productCode || 'contractnest';
  return getSupabaseClientForProduct(productCode);
};

/**
 * Validate Supabase config for a specific product
 */
export const validateProductSupabaseConfig = (
  productCode: string,
  source: string,
  endpoint: string
): boolean => {
  const product = getProduct(productCode);

  if (!product) {
    captureException(new Error(`Unknown product: ${productCode}`), {
      tags: { source, product: productCode },
      endpoint,
    });
    return false;
  }

  if (!product.isConfigured) {
    captureException(new Error(`Product not configured: ${productCode}`), {
      tags: { source, product: productCode },
      endpoint,
      missing: `${product.envPrefix}SUPABASE_URL or ${product.envPrefix}SUPABASE_KEY`,
    });
    return false;
  }

  return true;
};

/**
 * Get Supabase URL for a product (for Edge Function calls)
 */
export const getSupabaseUrlForProduct = (productCode: string): string | null => {
  const product = getProduct(productCode);
  return product?.supabaseUrl || null;
};

/**
 * Get Supabase Key for a product (for Edge Function calls)
 */
export const getSupabaseKeyForProduct = (productCode: string): string | null => {
  const product = getProduct(productCode);
  return product?.supabaseKey || null;
};

/**
 * Clear cached Supabase clients (useful for testing or config reload)
 */
export const clearSupabaseClientCache = (): void => {
  supabaseClients.clear();
  console.log('🧹 Cleared Supabase client cache');
};

/**
 * Get all configured products
 */
export const getConfiguredProducts = (): string[] => {
  const { products } = require('../config/products');
  return Object.entries(products)
    .filter(([_, config]: [string, any]) => config.isConfigured)
    .map(([code]: [string, any]) => code);
};
