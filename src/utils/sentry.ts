// src/utils/sentry.ts
import * as Sentry from '@sentry/node';
import { Request } from 'express';

export const initSentry = (): void => {
  if (!process.env.SENTRY_DSN) {
    console.warn('Sentry DSN not found. Error tracking disabled.');
    return;
  }

  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      initialScope: {
        tags: { "error_source": "api_server" }
      }
    });
    console.log('Sentry initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
  }
};

// Set product context from request
export const setProductContext = (req: Request): void => {
  if (!process.env.SENTRY_DSN) return;

  try {
    // Set product tag
    const productCode = (req as any).productCode;
    if (productCode) {
      Sentry.setTag('product', productCode);
    }
  } catch (error) {
    console.error('Error setting product context:', error);
  }
};

// Set tenant context from request
export const setTenantContext = (req: Request): void => {
  if (!process.env.SENTRY_DSN) return;

  try {
    const tenantId = req.headers['x-tenant-id'];
    if (tenantId) {
      Sentry.setTag('tenant_id', tenantId.toString());
    }

    // Also set product context if available
    setProductContext(req);
  } catch (error) {
    console.error('Error setting tenant context:', error);
  }
};

// Capture exception with additional context
export const captureException = (error: Error, context: Record<string, any> = {}): void => {
  if (!process.env.SENTRY_DSN) {
    console.error('Error:', error);
    console.error('Context:', context);
    return;
  }

  try {
    // Add context as tags and extras
    const { tags = {}, ...extras } = context;

    // Set tags
    Object.entries(tags).forEach(([key, value]) => {
      Sentry.setTag(key, String(value));
    });

    // Add other context as extras
    Object.entries(extras).forEach(([key, value]) => {
      Sentry.setExtra(key, value);
    });

    Sentry.captureException(error);
  } catch (captureError) {
    console.error('Failed to capture exception in Sentry:', captureError);
    console.error('Original error:', error);
  }
};
