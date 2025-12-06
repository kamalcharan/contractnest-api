// src/middleware/productContext.ts
// Product context middleware for multi-product architecture

import { Request, Response, NextFunction } from 'express';
import {
  getProduct,
  getDefaultProduct,
  isValidProduct,
  VALID_PRODUCTS,
  ProductConfig,
  DEFAULT_PRODUCT
} from '../config/products';
import { captureException } from '../utils/sentry';

// Extend Express Request to include product context
declare global {
  namespace Express {
    interface Request {
      product?: ProductConfig;
      productCode?: string;
    }
  }
}

/**
 * Product Context Middleware
 *
 * Reads X-Product header and attaches product configuration to request.
 * - If header is missing, defaults to 'contractnest'
 * - If header is invalid, returns 400 error
 * - If product is not configured (missing env vars), returns 503 error
 */
export const setProductContext = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get product code from header (case-insensitive)
    const productHeader = req.headers['x-product'] as string | undefined;
    const productCode = productHeader?.toLowerCase() || DEFAULT_PRODUCT;

    // Validate product code
    if (!isValidProduct(productCode)) {
      console.warn(`⚠️ Invalid product code: ${productCode}`);
      return res.status(400).json({
        error: 'Invalid product',
        code: 'INVALID_PRODUCT',
        message: `Unknown product: ${productCode}`,
        valid_products: VALID_PRODUCTS,
      });
    }

    // Get product configuration
    const product = getProduct(productCode);

    if (!product) {
      // This shouldn't happen if isValidProduct passed, but just in case
      console.error(`❌ Product not found in registry: ${productCode}`);
      return res.status(500).json({
        error: 'Product configuration error',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    // Check if product is configured (has Supabase credentials)
    if (!product.isConfigured) {
      console.error(`❌ Product not configured: ${productCode}`);
      console.error(`   Missing: ${product.envPrefix}SUPABASE_URL or ${product.envPrefix}SUPABASE_KEY`);

      captureException(new Error(`Product not configured: ${productCode}`), {
        tags: {
          source: 'productContext',
          product: productCode,
        },
      });

      return res.status(503).json({
        error: 'Product not available',
        code: 'PRODUCT_NOT_CONFIGURED',
        message: `The ${product.name} product is not configured on this server`,
      });
    }

    // Attach product to request
    req.product = product;
    req.productCode = productCode;

    // Log for debugging (only in development)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📦 Product Context: ${productCode} (${product.isConfigured ? 'configured' : 'not configured'})`);
    }

    next();
  } catch (error) {
    console.error('❌ Error in productContext middleware:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'productContext' },
    });

    // On error, try to continue with default product
    const defaultProduct = getDefaultProduct();
    if (defaultProduct?.isConfigured) {
      req.product = defaultProduct;
      req.productCode = DEFAULT_PRODUCT;
      next();
    } else {
      return res.status(500).json({
        error: 'Internal server error',
        code: 'PRODUCT_CONTEXT_ERROR',
      });
    }
  }
};

/**
 * Require specific product middleware
 * Use this to restrict certain routes to specific products
 *
 * Example: app.use('/familyknows', requireProduct('familyknows'), familyKnowsRoutes);
 */
export const requireProduct = (...allowedProducts: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const productCode = req.productCode;

    if (!productCode || !allowedProducts.includes(productCode)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'PRODUCT_ACCESS_DENIED',
        message: `This endpoint is only available for: ${allowedProducts.join(', ')}`,
        current_product: productCode,
      });
    }

    next();
  };
};

/**
 * Exclude specific product middleware
 * Use this to block certain products from accessing routes
 *
 * Example: app.use('/firebase', excludeProduct('familyknows'), firebaseRoutes);
 */
export const excludeProduct = (...excludedProducts: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const productCode = req.productCode;

    if (productCode && excludedProducts.includes(productCode)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'PRODUCT_ACCESS_DENIED',
        message: `This endpoint is not available for: ${productCode}`,
      });
    }

    next();
  };
};

export default setProductContext;
