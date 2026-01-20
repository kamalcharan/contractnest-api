// src/utils/apiResponseHelpers.ts
// Standardized API response helpers for consistent error handling
// Aligns with Edge Function response format

import { Response } from 'express';

// =================================================================
// TYPES
// =================================================================

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  metadata?: {
    request_id?: string;
    duration_ms?: number;
    timestamp: string;
    pagination?: PaginationMeta;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    request_id?: string;
    timestamp: string;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
}

// =================================================================
// ERROR CODES
// =================================================================

export const ERROR_CODES = {
  // 400 Bad Request
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_FORMAT: 'INVALID_FORMAT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // 401 Unauthorized
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // 403 Forbidden
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // 404 Not Found
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',

  // 409 Conflict
  CONFLICT: 'CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',

  // 422 Unprocessable Entity
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',

  // 429 Too Many Requests
  RATE_LIMITED: 'RATE_LIMITED',

  // 500 Internal Server Error
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EDGE_FUNCTION_ERROR: 'EDGE_FUNCTION_ERROR',

  // 503 Service Unavailable
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// =================================================================
// RESPONSE HELPERS
// =================================================================

/**
 * Send standardized success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  options?: {
    requestId?: string;
    startTime?: number;
    pagination?: PaginationMeta;
  }
): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...(options?.requestId && { request_id: options.requestId }),
      ...(options?.startTime && { duration_ms: Date.now() - options.startTime }),
      ...(options?.pagination && { pagination: options.pagination })
    }
  };

  res.status(statusCode).json(response);
}

/**
 * Send standardized error response
 */
export function sendError(
  res: Response,
  code: ErrorCode,
  message: string,
  statusCode: number = 400,
  options?: {
    details?: any;
    requestId?: string;
  }
): void {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(options?.details && { details: options.details })
    },
    metadata: {
      timestamp: new Date().toISOString(),
      ...(options?.requestId && { request_id: options.requestId })
    }
  };

  res.status(statusCode).json(response);
}

// =================================================================
// SPECIFIC ERROR HELPERS
// =================================================================

/**
 * 400 Bad Request
 */
export function badRequest(res: Response, message: string, details?: any, requestId?: string): void {
  sendError(res, ERROR_CODES.BAD_REQUEST, message, 400, { details, requestId });
}

/**
 * 400 Validation Error
 */
export function validationError(res: Response, errors: any[], requestId?: string): void {
  sendError(res, ERROR_CODES.VALIDATION_ERROR, `Validation failed with ${errors.length} error(s)`, 400, {
    details: errors,
    requestId
  });
}

/**
 * 401 Unauthorized
 */
export function unauthorized(res: Response, message: string = 'Authentication required', requestId?: string): void {
  sendError(res, ERROR_CODES.UNAUTHORIZED, message, 401, { requestId });
}

/**
 * 403 Forbidden
 */
export function forbidden(res: Response, message: string = 'Access denied', requestId?: string): void {
  sendError(res, ERROR_CODES.FORBIDDEN, message, 403, { requestId });
}

/**
 * 404 Not Found
 */
export function notFound(res: Response, resource: string = 'Resource', requestId?: string): void {
  sendError(res, ERROR_CODES.NOT_FOUND, `${resource} not found`, 404, { requestId });
}

/**
 * 409 Version Conflict (for optimistic locking)
 */
export function versionConflict(
  res: Response,
  resource: string = 'Resource',
  expectedVersion?: number,
  currentVersion?: number,
  requestId?: string
): void {
  let message = `${resource} was modified by another user. Please refresh and try again.`;
  if (expectedVersion !== undefined && currentVersion !== undefined) {
    message = `${resource} version conflict. Expected version ${expectedVersion}, but current version is ${currentVersion}. Please refresh and try again.`;
  }
  sendError(res, ERROR_CODES.VERSION_CONFLICT, message, 409, { requestId });
}

/**
 * 409 Duplicate Entry
 */
export function duplicateEntry(res: Response, field: string, requestId?: string): void {
  sendError(res, ERROR_CODES.DUPLICATE_ENTRY, `A record with this ${field} already exists`, 409, { requestId });
}

/**
 * 422 Business Rule Violation
 */
export function businessRuleViolation(res: Response, message: string, requestId?: string): void {
  sendError(res, ERROR_CODES.BUSINESS_RULE_VIOLATION, message, 422, { requestId });
}

/**
 * 500 Internal Server Error
 */
export function internalError(res: Response, message: string = 'An unexpected error occurred', requestId?: string): void {
  sendError(res, ERROR_CODES.INTERNAL_ERROR, message, 500, { requestId });
}

/**
 * 500 Edge Function Error
 */
export function edgeFunctionError(res: Response, functionName: string, originalError?: any, requestId?: string): void {
  const message = `Error calling ${functionName} edge function`;
  sendError(res, ERROR_CODES.EDGE_FUNCTION_ERROR, message, 500, {
    details: originalError ? { original_error: originalError.message || originalError } : undefined,
    requestId
  });
}

// =================================================================
// RESPONSE PARSING HELPERS
// =================================================================

/**
 * Handle Edge Function response and send appropriate API response
 * Maps Edge error codes to HTTP status codes
 */
export function handleEdgeResponse(
  res: Response,
  edgeResponse: any,
  requestId?: string,
  startTime?: number
): void {
  // Success response from edge
  if (edgeResponse.success === true || edgeResponse.data) {
    sendSuccess(res, edgeResponse.data || edgeResponse, 200, { requestId, startTime });
    return;
  }

  // Error response from edge
  const errorCode = edgeResponse.error?.code || 'UNKNOWN_ERROR';
  const errorMessage = edgeResponse.error?.message || 'Unknown error occurred';

  // Map edge error codes to HTTP status
  const statusMap: Record<string, number> = {
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    VERSION_CONFLICT: 409,
    VALIDATION_ERROR: 400,
    INVALID_SIGNATURE: 403,
    MISSING_AUTH: 401,
    MISSING_TENANT: 400,
    INVALID_ID: 400,
    NOT_DELETABLE: 400,
    INTERNAL_ERROR: 500
  };

  const statusCode = statusMap[errorCode] || 400;
  sendError(res, errorCode as ErrorCode, errorMessage, statusCode, { requestId });
}

// =================================================================
// PAGINATION HELPERS
// =================================================================

/**
 * Create pagination metadata
 */
export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  return {
    page,
    limit,
    total,
    has_more: (page - 1) * limit + limit < total
  };
}

/**
 * Parse pagination params from request query
 */
export function parsePaginationParams(query: any): { page: number; limit: number; offset: number } | null {
  const pageParam = query.page;
  const limitParam = query.limit;

  if (!pageParam && !limitParam) {
    return null;
  }

  const page = Math.max(1, parseInt(pageParam || '1', 10));
  const limit = Math.min(Math.max(1, parseInt(limitParam || '50', 10)), 100);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}
