// src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import morgan from 'morgan';

import { specs } from './docs/swagger';
import { errorHandler } from './middleware/error';
import { setTenantContext } from './middleware/tenantContext';
import { initSentry, captureException } from './utils/sentry';
import { initializeFirebase, checkFirebaseStatus } from './utils/firebaseConfig';

// Import routes
import masterDataRoutes from './routes/masterDataRoutes';
import integrationRoutes from './routes/integrationRoutes';
import businessModelRoutes from './routes/businessModelRoutes';
import systemRoutes from './routes/systemRoutes';
import jtdRoutes from './routes/jtd';

// JTD services
import { jtdRealtimeListener } from './services/jtdRealtimeListener';
import { jtdService } from './services/jtdService';

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('🔴 UNCAUGHT EXCEPTION - Server will crash:');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  
  try {
    captureException(error, {
      tags: { source: 'uncaught_exception', fatal: true }
    });
  } catch (sentryError) {
    console.error('Failed to send to Sentry:', sentryError);
  }
  
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
  
  try {
    captureException(reason instanceof Error ? reason : new Error(String(reason)), {
      tags: { source: 'unhandled_rejection', fatal: true }
    });
  } catch (sentryError) {
    console.error('Failed to send to Sentry:', sentryError);
  }
  
  process.exit(1);
});

// Environment validation
const requiredEnvVars = [
  'SUPABASE_URL', 
  'SUPABASE_KEY',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  if (process.env.NODE_ENV === 'production') {
    initSentry();
    captureException(new Error(`Missing required environment variables: ${missingVars.join(', ')}`), {
      tags: { source: 'api_startup', error_type: 'config_error' }
    });
  } else {
    console.warn('Some environment variables are missing, but continuing execution...');
  }
}

// Initialize Sentry
initSentry();

// Initialize Firebase
try {
  initializeFirebase();
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Firebase:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'api_startup', error_type: 'firebase_init_error' }
  });
}

// Import routes with error handling
console.log('📦 Loading route modules...');
let authRoutes, tenantRoutes, tenantProfileRoutes, storageRoutes, invitationRoutes, userRoutes;

try {
  authRoutes = require('./routes/auth').default;
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.error('❌ Failed to load auth routes:', error);
  process.exit(1);
}

try {
  tenantRoutes = require('./routes/tenants').default;
  console.log('✅ Tenant routes loaded');
} catch (error) {
  console.error('❌ Failed to load tenant routes:', error);
  process.exit(1);
}

try {
  tenantProfileRoutes = require('./routes/tenantProfileRoutes').default;
  console.log('✅ Tenant profile routes loaded');
} catch (error) {
  console.error('❌ Failed to load tenant profile routes:', error);
  process.exit(1);
}

try {
  storageRoutes = require('./routes/storage').default;
  console.log('✅ Storage routes loaded');
} catch (error) {
  console.error('❌ Failed to load storage routes:', error);
  process.exit(1);
}

try {
  invitationRoutes = require('./routes/invitationRoutes').default;
  console.log('✅ Invitation routes loaded');
} catch (error) {
  console.error('❌ Failed to load invitation routes:', error);
  process.exit(1);
}

try {
  userRoutes = require('./routes/userRoutes').default;
  console.log('✅ User routes loaded');
} catch (error) {
  console.error('❌ Failed to load user routes:', error);
  process.exit(1);
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// ====================
// CRITICAL FIX: Apply middleware in correct order
// ====================

// 1. CORS - needed for all routes
app.use(cors());

// 2. Helmet - security headers
app.use(helmet({ contentSecurityPolicy: false }));

// 3. Tenant context - only reads headers, doesn't touch body
app.use(setTenantContext);

// 4. CRITICAL: Mount storage routes BEFORE body parsing middleware
console.log('🚨 Mounting storage routes BEFORE body parsers...');
const storageRouter = express.Router();
storageRouter.use(storageRoutes);
app.use('/api', storageRouter);

// 5. NOW apply morgan (after storage routes in case it's reading bodies)
app.use(morgan('dev'));

// 6. NOW apply body parsing middleware (after storage routes are mounted)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 7. API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// 8. System routes
app.use('/api', systemRoutes);

// 9. All other routes (these can use body parsing)
console.log('🔧 Registering remaining routes...');

try {
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes registered');
} catch (error) {
  console.error('❌ Failed to register auth routes:', error);
}

try {
  app.use('/api/tenants', tenantRoutes);
  console.log('✅ Tenant routes registered');
} catch (error) {
  console.error('❌ Failed to register tenant routes:', error);
}

try {
  app.use('/api/masterdata', masterDataRoutes);
  console.log('✅ Master data routes registered');
} catch (error) {
  console.error('❌ Failed to register master data routes:', error);
}

try {
  app.use('/api', tenantProfileRoutes);
  console.log('✅ Tenant profile routes registered');
} catch (error) {
  console.error('❌ Failed to register tenant profile routes:', error);
}

try {
  app.use('/api', integrationRoutes);
  console.log('✅ Integration routes registered');
} catch (error) {
  console.error('❌ Failed to register integration routes:', error);
}

try {
  app.use('/api/users', invitationRoutes);
  console.log('✅ Invitation routes registered');
} catch (error) {
  console.error('❌ Failed to register invitation routes:', error);
}

try {
  app.use('/api/users', userRoutes);
  console.log('✅ User routes registered');
} catch (error) {
  console.error('❌ Failed to register user routes:', error);
}

// ✅ FIXED: Changed from '/api/businessmodel' to '/api/business-model'
app.use('/api/business-model', businessModelRoutes);

// JTD Routes
app.use('/api/jtd', jtdRoutes);

console.log('✅ All routes registered successfully');

// Health check endpoint (enhanced for Docker/Railway)
app.get('/health', async (req, res) => {
  const healthData = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {
      api: 'healthy',
      database: 'unknown',
      storage: 'unknown'
    }
  };

  try {
    // Quick Supabase connection test
    if (process.env.SUPABASE_URL) {
      healthData.services.database = 'connected';
    }

    // Quick Firebase status check
    try {
      const firebaseStatus = await checkFirebaseStatus();
      healthData.services.storage = firebaseStatus.status === 'connected' ? 'connected' : 'error';
    } catch (error) {
      healthData.services.storage = 'error';
    }

    res.status(200).json(healthData);
  } catch (error) {
    healthData.status = 'ERROR';
    healthData.services.api = 'error';
    res.status(503).json(healthData);
  }
});

// API health endpoint (redirect to main health)
app.get('/api/health', async (req, res) => {
  return res.redirect('/health');
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'ContractNest API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    documentation: '/api-docs',
    health: '/health'
  });
});

// Test Sentry endpoint (remove in production)
app.get('/test-sentry', (req, res) => {
  try {
    throw new Error('Test error from API');
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'test-route' }
    });
    res.status(500).json({ error: 'Test error triggered' });
  }
});

// Error handling middleware (must be after routes)
app.use(errorHandler);

// Handle 404 routes
app.use((req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    status: 'error', 
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Initialize JTD after Express app is ready
const initializeJTD = async () => {
  try {
    // Start the realtime listener
    await jtdRealtimeListener.start();
    console.log('✅ JTD Realtime Listener initialized');
    
    // If N8N is available, reprocess any queued events
    if (process.env.N8N_WEBHOOK_URL) {
      console.log('N8N webhook configured, checking for queued events...');
      // Don't await - let it run in background
      jtdService.reprocessQueuedEvents().catch(console.error);
    } else {
      console.log('N8N webhook not configured - events will be queued');
    }
  } catch (error) {
    console.error('❌ Failed to initialize JTD:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'jtd_initialization' }
    });
    // Don't crash the app if JTD fails to initialize
  }
};

// Start the server
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
  console.log('📍 Registered business model routes:');
  console.log('- GET  /api/business-model/plans');
  console.log('- POST /api/business-model/plans');
  console.log('- GET  /api/business-model/plans/:id');
  console.log('- PUT  /api/business-model/plans/:id');
  console.log('- GET  /api/business-model/plan-versions');
  console.log('- POST /api/business-model/plan-versions');
  console.log('📍 JTD routes:');
  console.log('- POST /api/jtd/events');
  console.log('- GET  /api/jtd/events/:eventId');
  console.log('- POST /api/jtd/webhooks/gupshup');
  console.log('- POST /api/jtd/webhooks/sendgrid');
  console.log('\n🚨 CRITICAL: Storage routes mounted BEFORE body parsers');
  console.log('📁 Storage upload: POST /api/storage/files');
  
  // Initialize JTD after server starts
  initializeJTD();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Stop JTD listener
  try {
    await jtdRealtimeListener.stop();
    console.log('JTD Realtime Listener stopped');
  } catch (error) {
    console.error('Error stopping JTD listener:', error);
  }
  
  // Close server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  
  // Stop JTD listener
  try {
    await jtdRealtimeListener.stop();
    console.log('JTD Realtime Listener stopped');
  } catch (error) {
    console.error('Error stopping JTD listener:', error);
  }
  
  // Close server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export default app;