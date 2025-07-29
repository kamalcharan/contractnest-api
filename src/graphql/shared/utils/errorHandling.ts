// src/graphql/shared/utils/errorHandling.ts
// GraphQL Error Handling Utilities
// Provides standardized error formatting, logging, and user-friendly error responses

import { GraphQLError, GraphQLFormattedError } from 'graphql';
import { 
  GraphQLContext,
  GraphQLCatalogError,
  GraphQLValidationError,
  GraphQLNotFoundError,
  GraphQLVersioningError,
  GraphQLAuthenticationError,
  GraphQLAuthorizationError
} from '../types/catalogContext';

// =================================================================
// ERROR TYPES AND INTERFACES
// =================================================================

/**
 * Standard error codes for consistent client-side handling
 */
export enum ErrorCodes {
  // Authentication & Authorization
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  MISSING_PERMISSIONS = 'MISSING_PERMISSIONS',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  FIELD_TOO_LONG = 'FIELD_TOO_LONG',
  FIELD_TOO_SHORT = 'FIELD_TOO_SHORT',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_VALUE = 'INVALID_VALUE',

  // Business Logic
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CONFLICT = 'CONFLICT',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  VERSIONING_ERROR = 'VERSIONING_ERROR',
  
  // External Services
  EDGE_FUNCTION_ERROR = 'EDGE_FUNCTION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Error context for logging and debugging
 */
export interface ErrorContext {
  // Request context
  operation?: string;
  operationType?: 'query' | 'mutation' | 'subscription';
  fieldName?: string;
  path?: (string | number)[];
  
  // User context
  userId?: string;
  tenantId?: string;
  sessionId?: string;
  requestId?: string;
  
  // Additional context
  input?: any;
  variables?: any;
  metadata?: Record<string, any>;
  
  // Technical details
  stackTrace?: string;
  timestamp?: string;
  environment?: string;
}

/**
 * Formatted error response
 */
export interface FormattedErrorResponse {
  message: string;
  code: string;
  severity: ErrorSeverity;
  field?: string;
  path?: (string | number)[];
  context?: ErrorContext;
  suggestions?: string[];
  documentation?: string;
  timestamp: string;
}

/**
 * Error logging configuration
 */
export interface ErrorLoggingConfig {
  logLevel: 'none' | 'error' | 'warn' | 'info' | 'debug';
  includeStackTrace: boolean;
  includeContext: boolean;
  maskSensitiveData: boolean;
  logToConsole: boolean;
  logToExternal: boolean;
  externalLogger?: (error: FormattedErrorResponse) => void;
}

// =================================================================
// ERROR FORMATTING FUNCTIONS
// =================================================================

/**
 * Format GraphQL error for client response
 */
export function formatGraphQLError(error: GraphQLError, context?: GraphQLContext): GraphQLFormattedError {
  try {
    const formattedError = formatError(error, context);
    
    return {
      message: formattedError.message,
      extensions: {
        code: formattedError.code,
        severity: formattedError.severity,
        field: formattedError.field,
        context: formattedError.context,
        suggestions: formattedError.suggestions,
        documentation: formattedError.documentation,
        timestamp: formattedError.timestamp
      },
      locations: error.locations,
      path: error.path
    };
  } catch (formatError) {
    console.error('Error formatting GraphQL error:', formatError);
    
    // Fallback error format
    return {
      message: 'An unexpected error occurred',
      extensions: {
        code: ErrorCodes.INTERNAL_ERROR,
        severity: ErrorSeverity.HIGH,
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Format any error into standardized response
 */
export function formatError(error: any, context?: GraphQLContext): FormattedErrorResponse {
  const timestamp = new Date().toISOString();
  const errorContext = buildErrorContext(error, context);

  // Handle known error types
  if (error instanceof GraphQLAuthenticationError) {
    return {
      message: error.message,
      code: ErrorCodes.UNAUTHENTICATED,
      severity: ErrorSeverity.MEDIUM,
      context: errorContext,
      suggestions: ['Please log in to access this resource', 'Check if your authentication token is valid'],
      timestamp
    };
  }

  if (error instanceof GraphQLAuthorizationError) {
    return {
      message: error.message,
      code: ErrorCodes.FORBIDDEN,
      severity: ErrorSeverity.MEDIUM,
      context: errorContext,
      suggestions: ['Check if you have the required permissions', 'Contact your administrator for access'],
      timestamp
    };
  }

  if (error instanceof GraphQLValidationError) {
    return {
      message: error.message,
      code: ErrorCodes.VALIDATION_ERROR,
      severity: ErrorSeverity.LOW,
      context: {
        ...errorContext,
        validationErrors: error.validationErrors
      },
      suggestions: ['Check the input data format', 'Verify all required fields are provided'],
      timestamp
    };
  }

  if (error instanceof GraphQLNotFoundError) {
    return {
      message: error.message,
      code: ErrorCodes.NOT_FOUND,
      severity: ErrorSeverity.LOW,
      context: errorContext,
      suggestions: ['Verify the ID is correct', 'Check if the resource exists'],
      timestamp
    };
  }

  if (error instanceof GraphQLVersioningError) {
    return {
      message: error.message,
      code: ErrorCodes.VERSIONING_ERROR,
      severity: ErrorSeverity.MEDIUM,
      context: errorContext,
      suggestions: ['Refresh your data and try again', 'Check if the item has been modified'],
      timestamp
    };
  }

  if (error instanceof GraphQLCatalogError) {
    return {
      message: error.message,
      code: error.code as ErrorCodes,
      severity: getSeverityFromStatusCode(error.statusCode),
      context: errorContext,
      timestamp
    };
  }

  // Handle database errors
  if (error.code?.startsWith('P') || error.code?.startsWith('42')) { // Postgres error codes
    return {
      message: 'Database operation failed',
      code: ErrorCodes.DATABASE_ERROR,
      severity: ErrorSeverity.HIGH,
      context: {
        ...errorContext,
        databaseError: error.code,
        databaseMessage: error.message
      },
      suggestions: ['Try again later', 'Contact support if the problem persists'],
      timestamp
    };
  }

  // Handle Edge Function errors
  if (error.message?.includes('Edge Function') || error.statusCode) {
    return {
      message: error.message || 'External service error',
      code: ErrorCodes.EDGE_FUNCTION_ERROR,
      severity: getSeverityFromStatusCode(error.statusCode || 500),
      context: {
        ...errorContext,
        statusCode: error.statusCode,
        edgeFunctionError: true
      },
      suggestions: ['Try again later', 'Check if the service is available'],
      timestamp
    };
  }

  // Handle timeout errors
  if (error.message?.includes('timeout') || error.name === 'TimeoutError') {
    return {
      message: 'Operation timed out',
      code: ErrorCodes.TIMEOUT_ERROR,
      severity: ErrorSeverity.MEDIUM,
      context: errorContext,
      suggestions: ['Try again with a simpler request', 'Check your network connection'],
      timestamp
    };
  }

  // Handle rate limit errors
  if (error.message?.includes('rate limit') || error.statusCode === 429) {
    return {
      message: 'Rate limit exceeded',
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      severity: ErrorSeverity.LOW,
      context: errorContext,
      suggestions: ['Wait a moment before trying again', 'Reduce the frequency of requests'],
      timestamp
    };
  }

  // Generic error fallback
  return {
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : error.message || 'Unknown error',
    code: ErrorCodes.INTERNAL_ERROR,
    severity: ErrorSeverity.HIGH,
    context: errorContext,
    suggestions: ['Try again later', 'Contact support if the problem persists'],
    timestamp
  };
}

/**
 * Format validation errors
 */
export function formatValidationErrors(errors: any[]): FormattedErrorResponse[] {
  return errors.map(error => ({
    message: error.message || 'Validation failed',
    code: ErrorCodes.VALIDATION_ERROR,
    severity: ErrorSeverity.LOW,
    field: error.field,
    context: {
      validationCode: error.code,
      value: error.value,
      constraint: error.constraint
    },
    timestamp: new Date().toISOString()
  }));
}

/**
 * Format bulk operation errors
 */
export function formatBulkErrors(errors: any[]): FormattedErrorResponse[] {
  return errors.map((error, index) => ({
    message: error.error || error.message || 'Bulk operation failed',
    code: error.code || ErrorCodes.INTERNAL_ERROR,
    severity: ErrorSeverity.MEDIUM,
    context: {
      itemIndex: error.item_index || index,
      itemId: error.item_id,
      bulkOperation: true
    },
    timestamp: new Date().toISOString()
  }));
}

// =================================================================
// ERROR LOGGING FUNCTIONS
// =================================================================

/**
 * Log error with context
 */
export function logError(error: any, context?: GraphQLContext, config?: Partial<ErrorLoggingConfig>): void {
  const defaultConfig: ErrorLoggingConfig = {
    logLevel: 'error',
    includeStackTrace: process.env.NODE_ENV !== 'production',
    includeContext: true,
    maskSensitiveData: true,
    logToConsole: true,
    logToExternal: false
  };

  const loggingConfig = { ...defaultConfig, ...config };

  if (loggingConfig.logLevel === 'none') {
    return;
  }

  try {
    const formattedError = formatError(error, context);
    const logEntry = {
      ...formattedError,
      ...(loggingConfig.includeStackTrace && error.stack ? { stackTrace: error.stack } : {}),
      ...(loggingConfig.includeContext ? { fullContext: buildErrorContext(error, context) } : {})
    };

    // Mask sensitive data
    if (loggingConfig.maskSensitiveData) {
      maskSensitiveData(logEntry);
    }

    // Log to console
    if (loggingConfig.logToConsole) {
      const severity = formattedError.severity.toLowerCase();
      switch (severity) {
        case 'critical':
        case 'high':
          console.error('GraphQL Error:', logEntry);
          break;
        case 'medium':
          console.warn('GraphQL Warning:', logEntry);
          break;
        default:
          console.log('GraphQL Info:', logEntry);
      }
    }

    // Log to external service
    if (loggingConfig.logToExternal && loggingConfig.externalLogger) {
      loggingConfig.externalLogger(formattedError);
    }

    // Log to audit system if available
    if (context?.auditLogger) {
      context.auditLogger.logGraphQLOperation(
        'error',
        context.metadata.operation_name || 'unknown',
        false,
        undefined,
        error.message,
        {
          error_code: formattedError.code,
          error_severity: formattedError.severity,
          error_context: formattedError.context
        }
      );
    }

  } catch (loggingError) {
    console.error('Failed to log error:', loggingError);
    console.error('Original error:', error);
  }
}

/**
 * Log performance warning for slow operations
 */
export function logPerformanceWarning(operationName: string, duration: number, context?: GraphQLContext): void {
  const threshold = parseInt(process.env.SLOW_OPERATION_THRESHOLD || '5000'); // 5 seconds

  if (duration > threshold) {
    logError({
      message: `Slow GraphQL operation: ${operationName} took ${duration}ms`,
      code: 'PERFORMANCE_WARNING',
      severity: ErrorSeverity.MEDIUM
    }, context, {
      logLevel: 'warn',
      includeStackTrace: false
    });
  }
}

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * Build error context from error and GraphQL context
 */
function buildErrorContext(error: any, context?: GraphQLContext): ErrorContext {
  const errorContext: ErrorContext = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  };

  // Add GraphQL context
  if (context) {
    errorContext.userId = context.user?.id;
    errorContext.tenantId = context.tenant?.id;
    errorContext.sessionId = context.metadata?.session_id;
    errorContext.requestId = context.metadata?.request_id;
    errorContext.operation = context.metadata?.operation_name;
  }

  // Add error-specific context
  if (error.path) {
    errorContext.path = error.path;
  }

  if (error.fieldName) {
    errorContext.fieldName = error.fieldName;
  }

  if (error.operationType) {
    errorContext.operationType = error.operationType;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    errorContext.stackTrace = error.stack;
  }

  return errorContext;
}

/**
 * Get error severity from HTTP status code
 */
function getSeverityFromStatusCode(statusCode: number): ErrorSeverity {
  if (statusCode >= 500) return ErrorSeverity.HIGH;
  if (statusCode >= 400) return ErrorSeverity.MEDIUM;
  return ErrorSeverity.LOW;
}

/**
 * Mask sensitive data in error logs
 */
function maskSensitiveData(logEntry: any): void {
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization', 'cookie'];
  
  function maskObject(obj: any): void {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        obj[key] = '[MASKED]';
      } else if (typeof value === 'object') {
        maskObject(value);
      }
    }
  }
  
  maskObject(logEntry);
}

/**
 * Create user-friendly error message
 */
export function createUserFriendlyMessage(error: FormattedErrorResponse): string {
  const baseMessage = error.message;
  
  if (error.suggestions && error.suggestions.length > 0) {
    return `${baseMessage}. ${error.suggestions[0]}`;
  }
  
  return baseMessage;
}

/**
 * Check if error should be retried
 */
export function isRetryableError(error: any): boolean {
  const retryableCodes = [
    ErrorCodes.TIMEOUT_ERROR,
    ErrorCodes.SERVICE_UNAVAILABLE,
    ErrorCodes.RATE_LIMIT_EXCEEDED,
    ErrorCodes.EXTERNAL_SERVICE_ERROR
  ];

  return retryableCodes.includes(error.code) || 
         error.statusCode >= 500 ||
         error.message?.includes('timeout');
}

/**
 * Get error documentation URL
 */
export function getErrorDocumentationUrl(errorCode: string): string | undefined {
  const baseUrl = process.env.ERROR_DOCS_BASE_URL || 'https://docs.example.com/errors';
  
  const codeMap: Record<string, string> = {
    [ErrorCodes.UNAUTHENTICATED]: 'authentication',
    [ErrorCodes.FORBIDDEN]: 'permissions',
    [ErrorCodes.VALIDATION_ERROR]: 'validation',
    [ErrorCodes.NOT_FOUND]: 'not-found',
    [ErrorCodes.VERSIONING_ERROR]: 'versioning'
  };

  const path = codeMap[errorCode];
  return path ? `${baseUrl}/${path}` : undefined;
}

// =================================================================
// ERROR MIDDLEWARE
// =================================================================

/**
 * Express error middleware for GraphQL errors
 */
export function createErrorMiddleware(config?: Partial<ErrorLoggingConfig>) {
  return (error: any, req: any, res: any, next: any) => {
    logError(error, req.context, config);
    
    const formattedError = formatError(error, req.context);
    
    res.status(error.statusCode || 500).json({
      errors: [formattedError]
    });
  };
}

/**
 * Apollo Server error formatter
 */
export function createApolloErrorFormatter(config?: Partial<ErrorLoggingConfig>) {
  return (error: GraphQLError, context?: GraphQLContext) => {
    logError(error, context, config);
    return formatGraphQLError(error, context);
  };
}

// =================================================================
// EXPORTS
// =================================================================

export default {
  ErrorCodes,
  ErrorSeverity,
  formatGraphQLError,
  formatError,
  formatValidationErrors,
  formatBulkErrors,
  logError,
  logPerformanceWarning,
  createUserFriendlyMessage,
  isRetryableError,
  getErrorDocumentationUrl,
  createErrorMiddleware,
  createApolloErrorFormatter
};