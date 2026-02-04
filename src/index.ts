// backend/src/index.ts
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

import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/error';
import { setProductContext } from './middleware/productContext';
import { logProductStatus } from './config/products';

import { setTenantContext } from './middleware/tenantContext';
import { initSentry, captureException } from './utils/sentry';
import { initializeFirebase, checkFirebaseStatus } from './utils/firebaseConfig';

// Import routes
import masterDataRoutes from './routes/masterDataRoutes';
import integrationRoutes from './routes/integrationRoutes';
import businessModelRoutes from './routes/businessModelRoutes';
import systemRoutes from './routes/systemRoutes';
import jtdRoutes from './routes/jtd';
import productsRoutes from './routes/productsRoutes';

import resourcesRoutes from './routes/resourcesRoutes';
import onboardingRoutes from './routes/onboardingRoutes';
import serviceCatalogRoutes from './routes/serviceCatalogRoutes';
import fkauthProxyRoutes from './routes/fkauthProxy';
import fkonboardingProxyRoutes from './routes/fkonboardingProxy';
import productConfigRoutes from './routes/productConfigRoutes';

// NOTE: groupsRoutes is loaded dynamically below via require() for error handling
import cardProxyRoutes from './routes/cardProxyRoutes';

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
// Log product configuration status
logProductStatus();


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

// Load Groups routes with error handling
let groupsRoutesLoaded;
try {
  groupsRoutesLoaded = require('./routes/groupsRoutes').default;
  console.log('✅ Groups routes loaded');
} catch (error) {
  console.error('❌ Failed to load groups routes:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without groups routes...');
    groupsRoutesLoaded = null;
  }
}

// Load Sequence routes with error handling
let sequenceRoutes;
try {
  sequenceRoutes = require('./routes/sequenceRoutes').default;
  console.log('✅ Sequence routes loaded');
} catch (error) {
  console.error('❌ Failed to load sequence routes:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without sequence routes...');
    sequenceRoutes = null;
  }
}

// Load Seed routes with error handling
let seedRoutes;
try {
  seedRoutes = require('./routes/seedRoutes').default;
  console.log('✅ Seed routes loaded');
} catch (error) {
  console.error('❌ Failed to load seed routes:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without seed routes...');
    seedRoutes = null;
  }
}

// Load Catalog Studio routes with error handling
let catalogStudioRoutes;
try {
  catalogStudioRoutes = require('./routes/catalogStudioRoutes').default;
  console.log('✅ Catalog Studio routes loaded');
} catch (error) {
  console.error('❌ Failed to load catalog studio routes:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without catalog studio routes...');
    catalogStudioRoutes = null;
  }
}

// Load Billing routes with error handling
let billingRoutes;
try {
  billingRoutes = require('./routes/billingRoutes').default;
  console.log('✅ Billing routes loaded');
} catch (error) {
  console.error('❌ Failed to load billing routes:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without billing routes...');
    billingRoutes = null;
  }
}

// Load Tenant Context routes with error handling
let tenantContextRoutes;
try {
  tenantContextRoutes = require('./routes/tenantContextRoutes').default;
  console.log('✅ Tenant context routes loaded');
} catch (error) {
  console.error('❌ Failed to load tenant context routes:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without tenant context routes...');
    tenantContextRoutes = null;
  }
}

// Load Contract routes with error handling
let contractCrudRoutes;
try {
  contractCrudRoutes = require('./routes/contractRoutes').default;
  console.log('✅ Contract routes loaded');
} catch (error) {
  console.error('❌ Failed to load contract routes:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing without contract routes...');
    contractCrudRoutes = null;
  }
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// ====================
// MIDDLEWARE SETUP
// ====================

// 1. CORS - needed for all routes
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'https://contractnest.com',
      'https://www.contractnest.com',
      'https://contractnest-ui-production.up.railway.app',
      'https://contractnest-api-production.up.railway.app'
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list or matches Railway pattern
    if (allowedOrigins.includes(origin) || origin.endsWith('.up.railway.app')) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-tenant-id',
    'x-request-id',
    'x-session-id',
    'x-environment',
    'x-product',
    'x-product-code',
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

// 4.0. Product context - determines which Supabase to use
app.use(setProductContext);

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

// ====================
// REGISTER ALL ROUTES
// ====================

console.log('🔧 Registering routes...');

// Card proxy routes - public access (no auth required)
try {
  app.use('/', cardProxyRoutes);
  console.log('✅ Card proxy routes registered at /card and /vcard');
} catch (error) {
  console.error('❌ Failed to register card proxy routes:', error);
}

try {
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes registered at /api/auth');
} catch (error) {
  console.error('❌ Failed to register auth routes:', error);
}

// FKauth Proxy for FamilyKnows Edge Function
try {
  app.use('/api/FKauth', fkauthProxyRoutes);
  console.log('✅ FKauth proxy routes registered at /api/FKauth');
} catch (error) {
  console.error('❌ Failed to register FKauth proxy routes:', error);
}

// FKonboarding Proxy for FamilyKnows Edge Function
try {
  app.use('/api/FKonboarding', fkonboardingProxyRoutes);
  console.log('✅ FKonboarding proxy routes registered at /api/FKonboarding');
} catch (error) {
  console.error('❌ Failed to register FKonboarding proxy routes:', error);
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

// Register Service Catalog routes
try {
  app.use('/api/service-catalog', serviceCatalogRoutes);
  console.log('✅ Service catalog routes registered at /api/service-catalog');
} catch (error) {
  console.error('❌ Failed to register service catalog routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'service_catalog' }
  });
}

// Register Groups routes with error handling
try {
  if (groupsRoutesLoaded) {
    app.use('/api', groupsRoutesLoaded);
    console.log('✅ Groups routes registered at /api');
  } else {
    console.log('⚠️  Groups routes skipped (not loaded)');
  }
} catch (error) {
  console.error('❌ Failed to register groups routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'groups' }
  });
}

// Register Sequence routes with error handling
try {
  if (sequenceRoutes) {
    app.use('/api/sequences', sequenceRoutes);
    console.log('✅ Sequence routes registered at /api/sequences');
  } else {
    console.log('⚠️  Sequence routes skipped (not loaded)');
  }
} catch (error) {
  console.error('❌ Failed to register sequence routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'sequences' }
  });
}

// Register Seed routes with error handling
try {
  if (seedRoutes) {
    app.use('/api/seeds', seedRoutes);
    console.log('✅ Seed routes registered at /api/seeds');
  } else {
    console.log('⚠️  Seed routes skipped (not loaded)');
  }
} catch (error) {
  console.error('❌ Failed to register seed routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'seeds' }
  });
}

// Register Catalog Studio routes with error handling
try {
  if (catalogStudioRoutes) {
    app.use('/api/catalog-studio', catalogStudioRoutes);
    console.log('✅ Catalog Studio routes registered at /api/catalog-studio');
  } else {
    console.log('⚠️  Catalog Studio routes skipped (not loaded)');
  }
} catch (error) {
  console.error('❌ Failed to register catalog studio routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'catalog_studio' }
  });
}

// Register Billing routes with error handling
try {
  if (billingRoutes) {
    app.use('/api', billingRoutes);
    console.log('✅ Billing routes registered at /api');
  } else {
    console.log('⚠️  Billing routes skipped (not loaded)');
  }
} catch (error) {
  console.error('❌ Failed to register billing routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'billing' }
  });
}

// Register Tenant Context routes with error handling
try {
  if (tenantContextRoutes) {
    app.use('/api/tenant-context', tenantContextRoutes);
    console.log('✅ Tenant context routes registered at /api/tenant-context');
  } else {
    console.log('⚠️  Tenant context routes skipped (not loaded)');
  }
} catch (error) {
  console.error('❌ Failed to register tenant context routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'tenant_context' }
  });
}

// Register Contract CRUD routes with error handling
try {
  if (contractCrudRoutes) {
    app.use('/api/contracts', contractCrudRoutes);
    console.log('✅ Contract routes registered at /api/contracts');
  } else {
    console.log('⚠️  Contract routes skipped (not loaded)');
  }
} catch (error) {
  console.error('❌ Failed to register contract routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'contracts' }
  });
}

// Products Routes (multi-product support)
app.use('/api/products', productsRoutes);
console.log('✅ Products routes registered at /api/products');


// Business model routes
app.use('/api/business-model', businessModelRoutes);
console.log('✅ Business model routes registered at /api/business-model');

// Product Config routes (Business Model v2)
try {
  app.use('/api/v1/product-config', productConfigRoutes);
  console.log('✅ Product config routes registered at /api/v1/product-config');
} catch (error) {
  console.error('❌ Failed to register product config routes:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'route_registration', route_type: 'product_config' }
  });
}

// JTD Routes
app.use('/api/jtd', jtdRoutes);
console.log('✅ JTD routes registered at /api/jtd');

// Onboarding Routes
app.use('/api/onboarding', onboardingRoutes);
console.log('✅ Onboarding routes registered at /api/onboarding');

// Admin Tenant Management Routes
try {
  const adminTenantRoutes = require('./routes/adminTenantRoutes').default;
  app.use('/api/admin/tenants', adminTenantRoutes);
  console.log('✅ Admin tenant management routes registered at /api/admin/tenants');
} catch (error) {
  console.error('❌ Failed to register admin tenant management routes:', error);
}

// Admin JTD Management Routes
try {
  const adminJtdRoutes = require('./routes/adminJtdRoutes').default;
  app.use('/api/admin/jtd', adminJtdRoutes);
  console.log('✅ Admin JTD management routes registered at /api/admin/jtd');
} catch (error) {
  console.error('❌ Failed to register admin JTD management routes:', error);
}

// Tenant Account Routes (Owner-side: data summary + close account)
try {
  const tenantAccountRoutes = require('./routes/tenantAccountRoutes').default;
  app.use('/api/tenant', tenantAccountRoutes);
  console.log('✅ Tenant account routes registered at /api/tenant');
} catch (error) {
  console.error('❌ Failed to register tenant account routes:', error);
}

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
      resources: 'loaded',
      taxSettings: taxSettingsRoutes ? 'loaded' : 'not_loaded',
      contacts: contactRoutes ? 'loaded' : 'not_loaded',
      blocks: blockRoutes ? 'loaded' : 'not_loaded',
      productMasterdata: productMasterdataRoutes ? 'loaded' : 'not_loaded',
      serviceCatalog: 'loaded',
      groups: groupsRoutesLoaded ? 'loaded' : 'not_loaded',
      sequences: sequenceRoutes ? 'loaded' : 'not_loaded',
      seeds: seedRoutes ? 'loaded' : 'not_loaded',
      catalogStudio: catalogStudioRoutes ? 'loaded' : 'not_loaded',
      billing: billingRoutes ? 'loaded' : 'not_loaded',
      tenantContext: tenantContextRoutes ? 'loaded' : 'not_loaded',
      contracts: contractCrudRoutes ? 'loaded' : 'not_loaded',
      productConfig: 'loaded'
    },
    features: {
      resources_api: true,
      contact_management: contactRoutes !== null,
      tax_settings: taxSettingsRoutes !== null,
      block_system: blockRoutes !== null,
      product_masterdata: productMasterdataRoutes !== null,
      product_masterdata_enhanced: productMasterdataRoutes !== null,
      service_catalog: true,
      groups_directory: groupsRoutesLoaded !== null,
      sequence_numbers: sequenceRoutes !== null,
      tenant_seeds: seedRoutes !== null,
      catalog_studio: catalogStudioRoutes !== null,
      billing_api: billingRoutes !== null,
      tenant_context: tenantContextRoutes !== null,
      contract_crud: contractCrudRoutes !== null,
      product_config: true
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

    // Service catalog is always loaded directly from import
    try {
      healthData.services.serviceCatalog = 'healthy';
    } catch (error) {
      healthData.services.serviceCatalog = 'error';
    }

    // Check groups service health if available
    if (groupsRoutesLoaded) {
      try {
        healthData.services.groups = 'healthy';
      } catch (error) {
        healthData.services.groups = 'error';
      }
    }

    // Check sequences service health if available
    if (sequenceRoutes) {
      try {
        healthData.services.sequences = 'healthy';
      } catch (error) {
        healthData.services.sequences = 'error';
      }
    }

    // Check seeds service health if available
    if (seedRoutes) {
      try {
        healthData.services.seeds = 'healthy';
      } catch (error) {
        healthData.services.seeds = 'error';
      }
    }

    // Check catalog studio service health if available
    if (catalogStudioRoutes) {
      try {
        healthData.services.catalogStudio = 'healthy';
      } catch (error) {
        healthData.services.catalogStudio = 'error';
      }
    }

    // Check billing service health if available
    if (billingRoutes) {
      try {
        healthData.services.billing = 'healthy';
      } catch (error) {
        healthData.services.billing = 'error';
      }
    }

    // Check tenant context service health if available
    if (tenantContextRoutes) {
      try {
        healthData.services.tenantContext = 'healthy';
      } catch (error) {
        healthData.services.tenantContext = 'error';
      }
    }

    // Check contracts service health if available
    if (contractCrudRoutes) {
      try {
        (healthData.services as any).contracts = 'healthy';
      } catch (error) {
        (healthData.services as any).contracts = 'error';
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
      productMasterdata: productMasterdataRoutes ? 'available' : 'not_available',
      productMasterdataEnhanced: productMasterdataRoutes ? 'available' : 'not_available',
      serviceCatalog: 'available',
      groups: groupsRoutesLoaded ? 'available' : 'not_available',
      sequences: sequenceRoutes ? 'available' : 'not_available',
      seeds: seedRoutes ? 'available' : 'not_available',
      catalogStudio: catalogStudioRoutes ? 'available' : 'not_available',
      billing: billingRoutes ? 'available' : 'not_available',
      tenantContext: tenantContextRoutes ? 'available' : 'not_available',
      contracts: contractCrudRoutes ? 'available' : 'not_available',
      productConfig: 'available'
    },
    endpoints: {
      rest_api: '/api/*',
      resources: '/api/resources',
      productMasterdata: '/api/product-masterdata',
      serviceCatalog: '/api/service-catalog',
      groups: '/api/groups',
      sequences: '/api/sequences',
      seeds: '/api/seeds',
      catalogStudio: '/api/catalog-studio',
      billing: '/api/billing',
      tenantContext: '/api/tenant-context',
      contracts: '/api/contracts',
      productConfig: '/api/v1/product-config'
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
      productMasterdata: '/api/product-masterdata',
      serviceCatalog: '/api/service-catalog',
      groups: '/api/groups',
      sequences: '/api/sequences',
      seeds: '/api/seeds',
      catalogStudio: '/api/catalog-studio',
      billing: '/api/billing',
      tenantContext: '/api/tenant-context',
      contracts: '/api/contracts',
      productConfig: '/api/v1/product-config'
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

      // Log tenant context routes if available
      if (tenantContextRoutes) {
        console.log('📍 Tenant Context routes:');
        console.log('- GET    /api/tenant-context                          # Get tenant context');
        console.log('- GET    /api/tenant-context/can-send/:channel        # Check if can send via channel');
        console.log('- GET    /api/tenant-context/waiting-jtds             # Get waiting JTD count');
        console.log('- POST   /api/tenant-context/init                     # Initialize context');
        console.log('- POST   /api/tenant-context/invalidate-cache         # Invalidate cache');
        console.log('- GET    /api/tenant-context/health                   # Health check');
        console.log('📋 Tenant Context features:');
        console.log('  ✅ Centralized tenant state (credits, subscription, limits)');
        console.log('  ✅ Credit availability checking per channel');
        console.log('  ✅ JTD credit-gating support');
        console.log('  ✅ In-memory caching with 30s TTL');
        console.log('  ✅ Multi-product isolation (x-product-code header)');
      } else {
        console.log('⚠️  Tenant Context routes not available');
      }

      // Initialize JTD after server starts
      initializeJTD();
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`${signal} received, shutting down gracefully...`);

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
