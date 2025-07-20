// src/middleware/error.ts
import { Request, Response, NextFunction } from 'express';
import { captureException } from '../utils/sentry';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Default error status and message
  let statusCode = 500;
  let message = 'Something went wrong';
  
  // If it's our custom AppError, use its status code and message
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err.message) {
    // For other errors, use the message if available
    message = err.message;
  }
  
  // Log error to Sentry
  try {
    captureException(err, {
      tags: {
        source: 'api_error_handler',
        error_type: err instanceof AppError ? 'operational' : 'programming'
      },
      url: req.url,
      method: req.method,
      statusCode,
      tenant: req.headers['x-tenant-id'] || 'unknown',
      isOperational: err instanceof AppError ? err.isOperational : false
    });
  } catch (sentryError) {
    console.error('Failed to log error to Sentry:', sentryError);
  }
  
  // Log the error for debugging (except in test environment)
  if (process.env.NODE_ENV !== 'test') {
    console.error('ERROR:', err);
  }
  
  // Send response
  res.status(statusCode).json({
    status: 'error',
    message
  });
};

// Middleware to catch async errors
export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};