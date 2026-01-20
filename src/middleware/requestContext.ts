// ============================================
// REQUEST CONTEXT MIDDLEWARE
// ============================================
// Extracts and validates common request headers:
// - Authorization (required)
// - x-tenant-id (required)
// - x-product (optional, defaults to 'contractnest')
// - x-idempotency-key (optional)
// - x-user-id (optional)
//
// Attaches context to req.context for use in controllers
// ============================================

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Request context interface
 * Attached to req.context by the middleware
 */
export interface RequestContext {
  /** Authorization header value */
  authToken: string;
  /** Tenant ID from x-tenant-id header */
  tenantId: string;
  /** Product code from x-product header (default: 'contractnest') */
  productCode: string;
  /** Idempotency key from x-idempotency-key header (optional) */
  idempotencyKey?: string;
  /** User ID from x-user-id header (optional) */
  userId?: string;
  /** Unique request ID for tracing */
  requestId: string;
  /** Request start timestamp */
  startTime: number;
}

// Extend Express Request type to include context
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

/**
 * Middleware to extract and validate request context
 *
 * Usage in routes:
 * router.use(requestContextMiddleware);
 *
 * Then in controller:
 * const { authToken, tenantId, productCode, idempotencyKey } = req.context!;
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Extract headers
  const authToken = req.headers.authorization as string;
  const tenantId = req.headers['x-tenant-id'] as string;
  const productCode = (req.headers['x-product'] as string) || 'contractnest';
  const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
  const userId = req.headers['x-user-id'] as string | undefined;

  // Validate required headers
  if (!authToken) {
    res.status(401).json({
      error: 'Authorization header is required',
      code: 'UNAUTHORIZED',
      requestId
    });
    return;
  }

  if (!tenantId) {
    res.status(400).json({
      error: 'x-tenant-id header is required',
      code: 'BAD_REQUEST',
      requestId
    });
    return;
  }

  // Attach context to request
  req.context = {
    authToken,
    tenantId,
    productCode,
    idempotencyKey,
    userId,
    requestId,
    startTime
  };

  // Log request for debugging
  console.log(`[API] ${req.method} ${req.path} | tenant: ${tenantId.substring(0, 8)}... | product: ${productCode} | idempotency: ${idempotencyKey ? 'yes' : 'no'}`);

  next();
}

/**
 * Middleware to require idempotency key for mutating operations
 * Use after requestContextMiddleware
 *
 * Usage:
 * router.post('/plans', requestContextMiddleware, requireIdempotencyKey, createPlan);
 */
export function requireIdempotencyKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.context?.idempotencyKey) {
    res.status(400).json({
      error: 'x-idempotency-key header is required for this operation',
      code: 'BAD_REQUEST',
      requestId: req.context?.requestId
    });
    return;
  }
  next();
}

/**
 * Generate an idempotency key for client-side use
 * Can be used by the API to generate keys if client doesn't provide one
 *
 * @returns UUID v4 as idempotency key
 */
export function generateIdempotencyKey(): string {
  return uuidv4();
}

/**
 * Helper to get context from request with type safety
 * Throws if context is not set (middleware not applied)
 */
export function getRequestContext(req: Request): RequestContext {
  if (!req.context) {
    throw new Error('Request context not set. Did you forget to apply requestContextMiddleware?');
  }
  return req.context;
}

/**
 * Helper to build headers for Edge function calls
 * Includes all context headers needed by Edge
 */
export function buildEdgeHeaders(context: RequestContext): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': context.authToken,
    'x-tenant-id': context.tenantId,
    'x-product': context.productCode,
    'Content-Type': 'application/json'
  };

  if (context.idempotencyKey) {
    headers['x-idempotency-key'] = context.idempotencyKey;
  }

  if (context.userId) {
    headers['x-user-id'] = context.userId;
  }

  return headers;
}
