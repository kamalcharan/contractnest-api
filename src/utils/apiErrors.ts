// ============================================
// STANDARD API ERROR UTILITIES
// ============================================
// Provides consistent error responses across all API endpoints
// Usage: Import and use in controllers for standardized error handling
// ============================================

import { Response } from 'express';

/**
 * Standard error codes used across the API
 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  BAD_REQUEST: 'BAD_REQUEST'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Standard error response interface
 */
export interface ApiErrorResponse {
  error: string;
  code: ErrorCode;
  fields?: Record<string, string>;
  details?: string[];
  requestId?: string;
  timestamp?: string;
}

/**
 * Generate a unique request ID for tracking
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Validation error - 400 Bad Request
 * Use when request body/params fail validation
 *
 * @example
 * return validationError(res, { email: 'Invalid email format', name: 'Name is required' });
 */
export function validationError(
  res: Response,
  fields: Record<string, string>,
  requestId?: string
): Response {
  const response: ApiErrorResponse = {
    error: 'Validation failed',
    code: ErrorCodes.VALIDATION_ERROR,
    fields,
    requestId: requestId || generateRequestId(),
    timestamp: new Date().toISOString()
  };
  return res.status(400).json(response);
}

/**
 * Bad request error - 400 Bad Request
 * Use when request is malformed but not a validation issue
 *
 * @example
 * return badRequestError(res, 'Missing required header: x-tenant-id');
 */
export function badRequestError(
  res: Response,
  message: string,
  requestId?: string
): Response {
  const response: ApiErrorResponse = {
    error: message,
    code: ErrorCodes.BAD_REQUEST,
    requestId: requestId || generateRequestId(),
    timestamp: new Date().toISOString()
  };
  return res.status(400).json(response);
}

/**
 * Unauthorized error - 401 Unauthorized
 * Use when authentication is missing or invalid
 *
 * @example
 * return unauthorizedError(res, 'Invalid or expired token');
 */
export function unauthorizedError(
  res: Response,
  message: string = 'Unauthorized',
  requestId?: string
): Response {
  const response: ApiErrorResponse = {
    error: message,
    code: ErrorCodes.UNAUTHORIZED,
    requestId: requestId || generateRequestId(),
    timestamp: new Date().toISOString()
  };
  return res.status(401).json(response);
}

/**
 * Forbidden error - 403 Forbidden
 * Use when user is authenticated but lacks permission
 *
 * @example
 * return forbiddenError(res, 'You do not have permission to access this resource');
 */
export function forbiddenError(
  res: Response,
  message: string = 'Forbidden',
  requestId?: string
): Response {
  const response: ApiErrorResponse = {
    error: message,
    code: ErrorCodes.FORBIDDEN,
    requestId: requestId || generateRequestId(),
    timestamp: new Date().toISOString()
  };
  return res.status(403).json(response);
}

/**
 * Not found error - 404 Not Found
 * Use when requested resource doesn't exist
 *
 * @example
 * return notFoundError(res, 'Plan');
 */
export function notFoundError(
  res: Response,
  resource: string,
  requestId?: string
): Response {
  const response: ApiErrorResponse = {
    error: `${resource} not found`,
    code: ErrorCodes.NOT_FOUND,
    requestId: requestId || generateRequestId(),
    timestamp: new Date().toISOString()
  };
  return res.status(404).json(response);
}

/**
 * Conflict error - 409 Conflict
 * Use when request conflicts with current state (e.g., duplicate)
 *
 * @example
 * return conflictError(res, 'A plan with this name already exists');
 */
export function conflictError(
  res: Response,
  message: string,
  requestId?: string
): Response {
  const response: ApiErrorResponse = {
    error: message,
    code: ErrorCodes.CONFLICT,
    requestId: requestId || generateRequestId(),
    timestamp: new Date().toISOString()
  };
  return res.status(409).json(response);
}

/**
 * Rate limited error - 429 Too Many Requests
 * Use when request exceeds rate limits
 *
 * @example
 * return rateLimitedError(res, 60); // Retry after 60 seconds
 */
export function rateLimitedError(
  res: Response,
  retryAfterSeconds: number = 60,
  requestId?: string
): Response {
  const response: ApiErrorResponse = {
    error: 'Too many requests. Please try again later.',
    code: ErrorCodes.RATE_LIMITED,
    requestId: requestId || generateRequestId(),
    timestamp: new Date().toISOString()
  };
  return res
    .status(429)
    .setHeader('Retry-After', String(retryAfterSeconds))
    .json(response);
}

/**
 * Internal error - 500 Internal Server Error
 * Use for unexpected errors (always log the actual error)
 *
 * @example
 * console.error('Database error:', error);
 * return internalError(res, requestId);
 */
export function internalError(
  res: Response,
  requestId?: string,
  details?: string
): Response {
  const response: ApiErrorResponse = {
    error: 'Internal server error',
    code: ErrorCodes.INTERNAL_ERROR,
    requestId: requestId || generateRequestId(),
    timestamp: new Date().toISOString()
  };

  // Only include details in non-production environments
  if (details && process.env.NODE_ENV !== 'production') {
    response.details = [details];
  }

  return res.status(500).json(response);
}

/**
 * Service unavailable error - 503 Service Unavailable
 * Use when a downstream service is unavailable
 *
 * @example
 * return serviceUnavailableError(res, 'Edge function is temporarily unavailable');
 */
export function serviceUnavailableError(
  res: Response,
  message: string = 'Service temporarily unavailable',
  requestId?: string
): Response {
  const response: ApiErrorResponse = {
    error: message,
    code: ErrorCodes.SERVICE_UNAVAILABLE,
    requestId: requestId || generateRequestId(),
    timestamp: new Date().toISOString()
  };
  return res.status(503).json(response);
}

/**
 * Handle errors from Edge function responses
 * Maps Edge error status codes to appropriate API responses
 *
 * @example
 * catch (error) {
 *   return handleEdgeError(res, error, requestId);
 * }
 */
export function handleEdgeError(
  res: Response,
  error: any,
  requestId?: string
): Response {
  const status = error.response?.status || 500;
  const message = error.response?.data?.error || error.message || 'An unknown error occurred';
  const details = error.response?.data?.details;

  const response: ApiErrorResponse = {
    error: message,
    code: mapStatusToErrorCode(status),
    requestId: requestId || generateRequestId(),
    timestamp: new Date().toISOString()
  };

  if (details) {
    response.details = Array.isArray(details) ? details : [details];
  }

  return res.status(status).json(response);
}

/**
 * Map HTTP status code to error code
 */
function mapStatusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400: return ErrorCodes.VALIDATION_ERROR;
    case 401: return ErrorCodes.UNAUTHORIZED;
    case 403: return ErrorCodes.FORBIDDEN;
    case 404: return ErrorCodes.NOT_FOUND;
    case 409: return ErrorCodes.CONFLICT;
    case 429: return ErrorCodes.RATE_LIMITED;
    case 503: return ErrorCodes.SERVICE_UNAVAILABLE;
    default: return ErrorCodes.INTERNAL_ERROR;
  }
}
