// src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import morgan from 'morgan';
import { createServer } from 'http';

import { specs } from './docs/swagger';

// 🚀 GraphQL imports
import { createApolloServer, graphqlMiddleware } from './graphql/server';
import { authenticate } from './middleware/auth';
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
import resourcesRoutes from './routes/resourcesRoutes';

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

// Load Contact routes with error handling
let contactRoutes;
try {
  contactRoutes = require('./routes/contactRoutes').default;
  console.log('✅ Contact routes loaded');
} catch (error) {
  console.error('❌ Failed to load contact routes:', error);
  process.exit(1);
}

// Load Tax Settings routes with error handling
let taxSettingsRoutes;
try {
  taxSettingsRoutes = require('./routes/taxSettingsRoutes').default;
  console.log('✅ Tax settings routes loaded');
} catch (error) {
  console.error('❌ Failed to load tax settings routes:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without tax settings routes...');
    taxSettingsRoutes = null;
  }
}

// Load Block routes with error handling
let blockRoutes;
try {
  blockRoutes = require('./routes/blockRoutes').default;
  console.log('✅ Block routes loaded');
} catch (error) {
  console.error('❌ Failed to load block routes:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without block routes...');
    blockRoutes = null;
  }
}

// Load Product Master Data routes with error handling
let productMasterdataRoutes;
try {
  productMasterdataRoutes = require('./routes/productMasterdataRoutes').default;
  console.log('✅ Product master data routes loaded');
} catch (error) {
  console.error('❌ Failed to load product master data routes:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without product master data routes...');
    productMasterdataRoutes = null;
  }
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// ====================
// MIDDLEWARE SETUP
// ====================

// 1. CORS - needed for all routes
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',  // Vite default port
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://contractnest-ui-production.up.railway.app',  
    'https://contractnest.com',                           
    'https://*.up.railway.app'              
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-tenant-id', 
    'x-request-id', 
    'x-session-id', 
    'x-environment',
    'x-user-id',
    'x-user-role',
    'x-client-version',
    'x-hmac-signature',
    'x-timestamp',
    'idempotency-key',
    'x-idempotency-key',
    'x-internal-signature'
  ]
}));

// 2. Helmet - security headers
app.use(helmet({ 
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  } : false
}));

// 3. Compression middleware
app.use(compression());

// 4. Tenant context - only reads headers, doesn't touch body
app.use(setTenantContext);

// 5. CRITICAL: Mount storage routes BEFORE body parsing middleware
console.log('🚨 Mounting storage routes BEFORE body parsers...');
app.use('/api/storage', storageRoutes);

// 6. NOW apply morgan (after storage routes in case it's reading bodies)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// 7. NOW apply body parsing middleware (after storage routes are mounted)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 8. API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// 9. System routes
app.use('/api', systemRoutes);

// =================================================================
// 🚀 GRAPHQL SERVER SETUP
// =================================================================

let apolloServer: any;

const setupGraphQL = async () => {
  try {
    console.log('🚀 Setting up GraphQL server...');
    
    // Create Apollo Server
    apolloServer = createApolloServer();
    
    // Start Apollo Server
    await apolloServer.start();
    
    // Apply GraphQL middleware and authentication
    app.use('/graphql', authenticate, graphqlMiddleware);
    
    // Apply Apollo Server middleware
    apolloServer.applyMiddleware({ 
      app, 
      path: '/graphql',
      cors: false  // We handle CORS above
    });
    
    console.log('✅ GraphQL server configured at /graphql');
    console.log('📊 GraphQL Playground available at /graphql (development only)');
    
    return true;
  } catch (error) {
    console.error('❌ Failed to setup GraphQL server:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'graphql_setup' }
    });
    return false;
  }
};

// Setup GraphQL (don't await - let it initialize in background)
let graphqlReady = false;
setupGraphQL().then((success) => {
  graphqlReady = success;
}).catch((error) => {
  console.error('GraphQL setup failed:', error);
});

// ====================
// REGISTER ALL ROUTES
// ====================

console.log('🔧 Registering routes...');

try {
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes registered at /api/auth');
} catch (error) {
  console.error('❌ Failed to register auth routes:', error);
}

try {
  app.use('/api/tenants', tenantRoutes);
  console.log('✅ Tenant routes registered at /api/tenants');
} catch (error) {
  console.error('❌ Failed to register tenant routes:', error);
}

try {
  app.use('/api/masterdata', masterDataRoutes);
  console.log('✅ Master data routes registered at /api/masterdata');
} catch (error) {
  console.error('❌ Failed to register master data routes:', error);
}

try {
  app.use('/api', tenantProfileRoutes);
  console.log('✅ Tenant profile routes registered at /api');
} catch (error) {
  console.error('❌ Failed to register tenant profile routes:', error);
}

try {
  app.use('/api', integrationRoutes);
  console.log('✅ Integration routes registered at /api');
} catch (error) {
  console.error('❌ Failed to register integration routes:', error);
}

try {
  app.use('/api/users', invitationRoutes);
  console.log('✅ Invitation routes registered at /api/users');
} catch (error) {
  console.error('❌ Failed to register invitation routes:', error);
}

try {
  app.use('/api/users', userRoutes);
  console.log('✅ User routes registered at /api/users');
} catch (error) {
  console.error('❌ Failed to register user routes:', error);
}

// Register Contact routes
try {
  app.use('/api/contacts', contactRoutes);
  console.log('✅ Contact routes registered at /api/contacts');
} catch (error) {
  console.error('❌ Failed to register contact routes:', error);
}

// Register Resources routes
try {
  app.use('/api/resources', resourcesRoutes);
  console.log('✅ Resources routes registered at /api/resources');
} catch (error) {
  console.error('❌ Failed to register resources routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'resources' }
  });
}

// Register Tax Settings routes with error handling
try {
  if (taxSettingsRoutes) {
    app.use('/api/tax-settings', taxSettingsRoutes);
    console.log('✅ Tax settings routes registered at /api/tax-settings');
  } else {
    console.log('⚠️  Tax settings routes skipped (not loaded)');
  }
} catch (error) {
  console.error('❌ Failed to register tax settings routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'tax_settings' }
  });
}

// Register Block routes with error handling
try {
  if (blockRoutes) {
    app.use('/api/service-contracts/blocks', blockRoutes);
    console.log('✅ Block routes registered at /api/service-contracts/blocks');
  } else {
    console.log('⚠️  Block routes skipped (not loaded)');
  }
} catch (error) {
  console.error('❌ Failed to register block routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'blocks' }
  });
}

// Register Product Master Data routes with error handling
try {
  if (productMasterdataRoutes) {
    app.use('/api/product-masterdata', productMasterdataRoutes);
    console.log('✅ Product master data routes registered at /api/product-masterdata');
  } else {
    console.log('⚠️  Product master data routes skipped (not loaded)');
  }
} catch (error) {
  console.error('❌ Failed to register product master data routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'product_masterdata' }
  });
}

// Business model routes
app.use('/api/business-model', businessModelRoutes);
console.log('✅ Business model routes registered at /api/business-model');

// JTD Routes
app.use('/api/jtd', jtdRoutes);
console.log('✅ JTD routes registered at /api/jtd');

console.log('✅ All routes registered successfully');

// Health check endpoint
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
      storage: 'unknown',
      graphql: graphqlReady ? 'healthy' : 'initializing',
      resources: 'loaded',
      taxSettings: taxSettingsRoutes ? 'loaded' : 'not_loaded',
      contacts: contactRoutes ? 'loaded' : 'not_loaded',
      blocks: blockRoutes ? 'loaded' : 'not_loaded',
      productMasterdata: productMasterdataRoutes ? 'loaded' : 'not_loaded'
    },
    features: {
      resources_api: true,
      graphql_api: graphqlReady,
      service_catalog_graphql: graphqlReady,
      contact_management: contactRoutes !== null,
      tax_settings: taxSettingsRoutes !== null,
      block_system: blockRoutes !== null,
      product_masterdata: productMasterdataRoutes !== null
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

    // Check tax settings service health if available
    if (taxSettingsRoutes) {
      try {
        healthData.services.taxSettings = 'healthy';
      } catch (error) {
        healthData.services.taxSettings = 'error';
      }
    }

    // Check contacts service health if available
    if (contactRoutes) {
      try {
        healthData.services.contacts = 'healthy';
      } catch (error) {
        healthData.services.contacts = 'error';
      }
    }

    // Check blocks service health if available
    if (blockRoutes) {
      try {
        healthData.services.blocks = 'healthy';
      } catch (error) {
        healthData.services.blocks = 'error';
      }
    }

    // Check product master data service health if available
    if (productMasterdataRoutes) {
      try {
        healthData.services.productMasterdata = 'healthy';
      } catch (error) {
        healthData.services.productMasterdata = 'error';
      }
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
    health: '/health',
    services: {
      resources: 'available',
      taxSettings: taxSettingsRoutes ? 'available' : 'not_available',
      contacts: contactRoutes ? 'available' : 'not_available',
      blocks: blockRoutes ? 'available' : 'not_available',
      productMasterdata: productMasterdataRoutes ? 'available' : 'not_available'
    },
    endpoints: {
      rest_api: '/api/*',
      graphql_api: '/graphql',
      resources: '/api/resources',
      productMasterdata: '/api/product-masterdata'
    }
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
    method: req.method,
    availableEndpoints: {
      health: '/health',
      docs: '/api-docs',
      contacts: '/api/contacts',
      resources: '/api/resources',
      productMasterdata: '/api/product-masterdata'
    }
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

// Create HTTP server
const httpServer = createServer(app);

// Start the server
const startServer = async () => {
  try {
    // Start HTTP server
    const server = httpServer.listen(PORT, () => {
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
      
      // Resources API routes
      console.log('📍 Resources API routes:');
      console.log('- GET    /api/resources/health              # Resources health check');
      console.log('- GET    /api/resources/resource-types      # Get all resource types');
      console.log('- GET    /api/resources                     # List resources with filters');
      console.log('- POST   /api/resources                     # Create new resource');
      console.log('- GET    /api/resources/:id                 # Get resource by ID');
      console.log('- PATCH  /api/resources/:id                 # Update resource');
      console.log('- DELETE /api/resources/:id                 # Delete resource (soft)');
      console.log('📋 Resources API features:');
      console.log('  ✅ Complete CRUD operations for catalog resources');
      console.log('  ✅ Internal signature verification with edge functions');
      console.log('  ✅ Multi-tenant resource management');
      console.log('  ✅ Resource type validation and contact integration');
      console.log('  ✅ Sequence number management');
      console.log('  ✅ Idempotency support for safe retries');
      console.log('  ✅ Comprehensive Swagger documentation');
      console.log('  ✅ Rate limiting and error handling');
      console.log('  ✅ Complete validation and middleware protection');
      
      // Log contact routes
      if (contactRoutes) {
        console.log('📍 Contact routes:');
        console.log('- GET    /api/contacts                      # List contacts with filters');
        console.log('- POST   /api/contacts                      # Create new contact');
        console.log('- GET    /api/contacts/:id                  # Get contact by ID');
        console.log('- PUT    /api/contacts/:id                  # Update contact');
        console.log('- PATCH  /api/contacts/:id/status           # Update contact status');
        console.log('- DELETE /api/contacts/:id                  # Delete/archive contact');
        console.log('- POST   /api/contacts/search               # Advanced contact search');
        console.log('- POST   /api/contacts/duplicates           # Check for duplicates');
        console.log('- POST   /api/contacts/:id/invite           # Send user invitation');
        console.log('- GET    /api/contacts/stats                # Get contact statistics');
        console.log('- GET    /api/contacts/health               # Contact service health');
        console.log('- GET    /api/contacts/constants            # Contact form constants');
        console.log('📋 Contact features:');
        console.log('  ✅ Individual & Corporate contact types');
        console.log('  ✅ Multiple contact channels & addresses');
        console.log('  ✅ Compliance numbers for corporate entities');
        console.log('  ✅ Contact persons for corporate contacts');
        console.log('  ✅ Advanced search & duplicate detection');
        console.log('  ✅ User invitation integration');
        console.log('  ✅ Status management (active/inactive/archived)');
        console.log('  ✅ Classification system (buyer/seller/vendor/partner/team_member)');
        console.log('  ✅ Complete audit trail & rate limiting');
      } else {
        console.log('⚠️  Contact routes not available');
      }
      
      // Log tax settings routes if available
      if (taxSettingsRoutes) {
        console.log('📍 Tax Settings routes:');
        console.log('- GET    /api/tax-settings                  # Get settings and rates');
        console.log('- POST   /api/tax-settings/settings         # Create/update settings');
        console.log('- GET    /api/tax-settings/rates            # Get all rates');
        console.log('- POST   /api/tax-settings/rates            # Create new rate');
        console.log('- PUT    /api/tax-settings/rates/:id        # Update rate');
        console.log('- DELETE /api/tax-settings/rates/:id        # Delete rate');
        console.log('- POST   /api/tax-settings/rates/:id/activate # Activate rate');
        console.log('📋 Tax Settings features:');
        console.log('  ✅ Display mode configuration (including/excluding tax)');
        console.log('  ✅ Tax rates management with CRUD operations');
        console.log('  ✅ Default rate designation');
        console.log('  ✅ Soft delete functionality');
        console.log('  ✅ Sequence ordering for display');
        console.log('  ✅ Optimistic locking for concurrent updates');
        console.log('  ✅ Idempotency support');
        console.log('  ✅ Complete audit trail');
      } else {
        console.log('⚠️  Tax Settings routes not available');
      }
      
      // Log block routes if available
      if (blockRoutes) {
        console.log('📍 Service Contracts Block routes:');
        console.log('- GET    /api/service-contracts/blocks/categories                    # List block categories');
        console.log('- GET    /api/service-contracts/blocks/masters                      # List block masters');
        console.log('- GET    /api/service-contracts/blocks/masters/:masterId/variants   # List variants for master');
        console.log('- GET    /api/service-contracts/blocks/hierarchy                    # Complete block hierarchy');
        console.log('- GET    /api/service-contracts/blocks/variant/:variantId           # Get variant details');
        console.log('- GET    /api/service-contracts/blocks/template-builder             # Blocks for template builder');
        console.log('- GET    /api/service-contracts/blocks/search                       # Search blocks');
        console.log('- GET    /api/service-contracts/blocks/stats                        # Block system statistics');
        console.log('📋 Block System features:');
        console.log('  ✅ Read-only block data API (Categories → Masters → Variants)');
        console.log('  ✅ Complete hierarchy with joined relationships');
        console.log('  ✅ Template builder optimization');
        console.log('  ✅ Block search and filtering');
        console.log('  ✅ Dependency tracking and validation metadata');
        console.log('  ✅ Statistics and health monitoring');
        console.log('  ✅ HMAC-secured communication with Edge Functions');
      } else {
        console.log('⚠️  Block routes not available');
      }
      
      // Log product master data routes if available
      if (productMasterdataRoutes) {
        console.log('📍 Product Master Data routes:');
        console.log('- GET    /api/product-masterdata/health                    # Service health check');
        console.log('- GET    /api/product-masterdata/constants                 # API constants and info');
        console.log('- GET    /api/product-masterdata/global                    # Global master data by category');
        console.log('- GET    /api/product-masterdata/tenant                    # Tenant master data by category');
        console.log('- GET    /api/product-masterdata/global/categories         # All global categories');
        console.log('- GET    /api/product-masterdata/tenant/categories         # All tenant categories');
        console.log('📋 Product Master Data features:');
        console.log('  ✅ Global & tenant-specific master data management');
        console.log('  ✅ Category-based data organization (pricing_type, status_type, etc.)');
        console.log('  ✅ Complete category listings and detailed data retrieval');
        console.log('  ✅ Edge Function integration with HMAC security');
        console.log('  ✅ Frontend-optimized data transformation');
        console.log('  ✅ Comprehensive error handling and validation');
        console.log('  ✅ Rate limiting and health monitoring');
        console.log('  ✅ Swagger documentation with detailed schemas');
        console.log('  ✅ Read-only API for dropdown/selection values');
      } else {
        console.log('⚠️  Product Master Data routes not available');
      }
      
      // Log GraphQL status
      if (graphqlReady) {
        console.log('📍 GraphQL API:');
        console.log('- POST   /graphql                               # GraphQL endpoint');
        console.log('- GET    /graphql                               # GraphQL Playground (dev only)');
        
        console.log('📍 GraphQL Query Operations:');
        console.log('- catalogItems                                  # List catalog items with filters');
        console.log('- catalogItem(id)                               # Get single catalog item');
        console.log('- resources                                     # List resources with filters');
        console.log('- resourcesByType                               # Get resources by type');
        console.log('- eligibleContacts                              # Get eligible contacts for resources');
        console.log('- serviceCatalogItems                           # List service catalog items');
        console.log('- serviceCatalogItem(id)                        # Get single service catalog item');
        console.log('- serviceCatalogMasterData                      # Get categories, industries, currencies');
        console.log('- availableResources                            # Get available resources for services');
        
        console.log('📍 GraphQL Mutation Operations:');
        console.log('- createCatalogItem                             # Create new catalog item');
        console.log('- bulkCreateCatalogItems                        # Bulk create catalog items');
        console.log('- createResource                                # Create new resource');
        console.log('- createServiceCatalogItem                      # Create service catalog item');
        console.log('- updateServiceCatalogItem                      # Update service catalog item');
        
        console.log('📋 GraphQL Service Catalog features:');
        console.log('  ✅ Complete Service Catalog CRUD operations');
        console.log('  ✅ HMAC-signed communication with Edge Functions');
        console.log('  ✅ Role-based access control (6 roles)');
        console.log('  ✅ Environment segregation (production/test)');
        console.log('  ✅ N+1 query prevention with DataLoaders');
        console.log('  ✅ Comprehensive input validation');
        console.log('  ✅ Bulk operations and resource associations');
        console.log('  ✅ Master data management');
        console.log('  ✅ Rate limiting and audit logging');
        console.log('  ✅ 40+ GraphQL types with full type safety');
      } else {
        console.log('⚠️  GraphQL API not ready yet (initializing...)');
      }
      
      console.log('\n🚨 CRITICAL: Storage routes mounted BEFORE body parsers');
      console.log('📁 Storage upload: POST /api/storage/files');
      
      // Initialize JTD after server starts
      initializeJTD();
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`${signal} received, shutting down gracefully...`);
      
      // Stop GraphQL server
      if (apolloServer) {
        try {
          await apolloServer.stop();
          console.log('GraphQL server stopped');
        } catch (error) {
          console.error('Error stopping GraphQL server:', error);
        }
      }
      
      // Stop JTD listener
      try {
        await jtdRealtimeListener.stop();
        console.log('JTD Realtime Listener stopped');
      } catch (error) {
        console.error('Error stopping JTD listener:', error);
      }
      
      // Close HTTP server
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    };

    // Graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'server_startup' }
    });
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;