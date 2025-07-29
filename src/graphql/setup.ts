// src/graphql/setup.ts
// GraphQL Setup Module - Main entry point for GraphQL server integration
// Initializes and exports GraphQL server for Express app integration

import { Express } from 'express';
import { Server } from 'http';
import { ApolloServer } from '@apollo/server';
import { GraphQLContext } from './shared/types/catalogContext';
import { createExecutableSchema, validateSchema, getSchemaInfo } from './config/schemaBuilder';
import { createGraphQLRouter, initializeGraphQLServer, setupGraphQLSubscriptions } from './routes/graphqlRoutes';

// =================================================================
// GRAPHQL SETUP CONFIGURATION
// =================================================================

export interface GraphQLSetupConfig {
  app: Express;
  httpServer?: Server;
  path?: string;
  enableSubscriptions?: boolean;
  enablePlayground?: boolean;
  enableIntrospection?: boolean;
}

export interface GraphQLSetupResult {
  success: boolean;
  server?: ApolloServer<GraphQLContext>;
  path: string;
  subscriptionsEnabled: boolean;
  playgroundEnabled: boolean;
  schemaInfo?: any;
  errors?: string[];
}

// =================================================================
// MAIN SETUP FUNCTION
// =================================================================

/**
 * Setup GraphQL server with Express app (overloaded function)
 */
export async function setupGraphQL(app: Express): Promise<GraphQLSetupResult>;
export async function setupGraphQL(config: GraphQLSetupConfig): Promise<GraphQLSetupResult>;
export async function setupGraphQL(appOrConfig: Express | GraphQLSetupConfig): Promise<GraphQLSetupResult> {
  // Handle both function signatures
  const config: GraphQLSetupConfig = isExpressApp(appOrConfig) 
    ? {
        app: appOrConfig,
        path: process.env.GRAPHQL_PATH || '/graphql',
        enableSubscriptions: process.env.GRAPHQL_SUBSCRIPTIONS_ENABLED === 'true',
        enablePlayground: process.env.GRAPHQL_PLAYGROUND_ENABLED === 'true' || process.env.NODE_ENV === 'development',
        enableIntrospection: process.env.GRAPHQL_INTROSPECTION_ENABLED === 'true' || process.env.NODE_ENV !== 'production'
      }
    : appOrConfig;
  const errors: string[] = [];
  const path = config.path || '/graphql';

  console.log('🚀 Setting up GraphQL server...');

  try {
    // 1. Validate environment
    console.log('📋 Validating environment configuration...');
    const envValidation = validateEnvironment();
    if (!envValidation.isValid) {
      errors.push(...envValidation.errors);
      console.error('❌ Environment validation failed:', envValidation.errors);
    }

    // 2. Build and validate schema
    console.log('🔧 Building GraphQL schema...');
    const schema = createExecutableSchema();
    
    const schemaValidation = validateSchema(schema);
    if (!schemaValidation.isValid) {
      errors.push(...schemaValidation.errors);
      console.warn('⚠️ Schema validation warnings:', schemaValidation.errors);
    }

    // Get schema info for logging
    const schemaInfo = getSchemaInfo(schema);
    if (schemaInfo) {
      console.log('📊 Schema info:', {
        totalTypes: schemaInfo.totalTypes,
        queryFields: schemaInfo.queryFields,
        mutationFields: schemaInfo.mutationFields,
        subscriptionFields: schemaInfo.subscriptionFields,
        customScalars: schemaInfo.customScalars.length,
        catalogTypes: schemaInfo.catalogTypes.length
      });
    }

    // 3. Initialize Apollo Server
    console.log('🔧 Initializing Apollo Server...');
    const apolloServer = await initializeGraphQLServer(config.httpServer);

    // 4. Setup subscriptions if enabled
    const subscriptionsEnabled = config.enableSubscriptions ?? true;
    if (subscriptionsEnabled && config.httpServer) {
      console.log('📡 Setting up GraphQL subscriptions...');
      setupGraphQLSubscriptions(config.httpServer);
    }

    // 5. Setup GraphQL routes
    console.log('🛣️ Setting up GraphQL routes...');
    const graphqlRouter = createGraphQLRouter(config.httpServer);
    config.app.use(path, graphqlRouter);

    console.log('✅ GraphQL server setup completed successfully');
    console.log(`🌐 GraphQL endpoint: http://localhost:${process.env.PORT || 3000}${path}`);
    
    if (config.enablePlayground ?? (process.env.NODE_ENV === 'development')) {
      console.log(`🎮 GraphQL Playground: http://localhost:${process.env.PORT || 3000}${path}`);
    }

    return {
      success: true,
      server: apolloServer,
      path,
      subscriptionsEnabled,
      playgroundEnabled: config.enablePlayground ?? (process.env.NODE_ENV === 'development'),
      schemaInfo,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error: any) {
    console.error('❌ GraphQL setup failed:', error);
    errors.push(`Setup failed: ${error.message}`);

    return {
      success: false,
      path,
      subscriptionsEnabled: false,
      playgroundEnabled: false,
      errors
    };
  }
}

/**
 * Setup GraphQL server with automatic configuration
 */
export async function setupGraphQLAuto(app: Express, httpServer?: Server): Promise<GraphQLSetupResult> {
  const config: GraphQLSetupConfig = {
    app,
    httpServer,
    path: process.env.GRAPHQL_PATH || '/graphql',
    enableSubscriptions: process.env.GRAPHQL_SUBSCRIPTIONS_ENABLED === 'true',
    enablePlayground: process.env.GRAPHQL_PLAYGROUND_ENABLED === 'true' || process.env.NODE_ENV === 'development',
    enableIntrospection: process.env.GRAPHQL_INTROSPECTION_ENABLED === 'true' || process.env.NODE_ENV !== 'production'
  };

  return setupGraphQL(config);
}

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Check if the parameter is an Express app
 */
function isExpressApp(obj: any): obj is Express {
  return obj && typeof obj.use === 'function' && typeof obj.listen === 'function';
}

/**
 * Validate environment configuration
 */
function validateEnvironment(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required environment variables
  const required = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'INTERNAL_SIGNING_SECRET'
  ];

  required.forEach(envVar => {
    if (!process.env[envVar]) {
      errors.push(`Missing required environment variable: ${envVar}`);
    }
  });

  // Validate signing secret strength
  if (process.env.INTERNAL_SIGNING_SECRET && process.env.INTERNAL_SIGNING_SECRET.length < 32) {
    errors.push('INTERNAL_SIGNING_SECRET should be at least 32 characters for security');
  }

  // Validate URLs
  if (process.env.SUPABASE_URL && !isValidUrl(process.env.SUPABASE_URL)) {
    errors.push('SUPABASE_URL is not a valid URL');
  }

  if (process.env.EDGE_FUNCTIONS_URL && !isValidUrl(process.env.EDGE_FUNCTIONS_URL)) {
    errors.push('EDGE_FUNCTIONS_URL is not a valid URL');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate URL format
 */
function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

// =================================================================
// HEALTH CHECK FUNCTIONS
// =================================================================

/**
 * Check GraphQL server health
 */
export async function checkGraphQLHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  checks: Record<string, boolean>;
  timestamp: string;
}> {
  const checks: Record<string, boolean> = {};
  
  try {
    // Check environment variables
    checks.environment = validateEnvironment().isValid;
    
    // Check schema compilation
    try {
      const schema = createExecutableSchema();
      checks.schema = !!schema;
    } catch {
      checks.schema = false;
    }
    
    // Check database connection (if available)
    // This would typically test Supabase connection
    checks.database = !!process.env.SUPABASE_URL;
    
    // Check Edge Functions URL
    checks.edge_functions = !!process.env.EDGE_FUNCTIONS_URL;
    
    const allHealthy = Object.values(checks).every(check => check);
    
    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Health check failed:', error);
    
    return {
      status: 'unhealthy',
      checks: { error: false },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get GraphQL server info
 */
export function getGraphQLInfo(): {
  version: string;
  environment: string;
  features: string[];
  endpoints: Record<string, string>;
} {
  const features: string[] = [];
  
  if (process.env.GRAPHQL_SUBSCRIPTIONS_ENABLED === 'true') {
    features.push('subscriptions');
  }
  
  if (process.env.GRAPHQL_PLAYGROUND_ENABLED === 'true' || process.env.NODE_ENV === 'development') {
    features.push('playground');
  }
  
  if (process.env.GRAPHQL_INTROSPECTION_ENABLED === 'true' || process.env.NODE_ENV !== 'production') {
    features.push('introspection');
  }

  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  const graphqlPath = process.env.GRAPHQL_PATH || '/graphql';
  
  return {
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    features,
    endpoints: {
      graphql: `${baseUrl}${graphqlPath}`,
      playground: features.includes('playground') ? `${baseUrl}${graphqlPath}` : 'disabled',
      health: `${baseUrl}${graphqlPath}/health`
    }
  };
}

// =================================================================
// SHUTDOWN FUNCTIONS
// =================================================================

/**
 * Gracefully shutdown GraphQL server
 */
export async function shutdownGraphQL(): Promise<void> {
  try {
    console.log('🔄 Shutting down GraphQL server...');
    
    // Import shutdown function dynamically to avoid circular imports
    const { shutdownGraphQLServer } = await import('./routes/graphqlRoutes');
    await shutdownGraphQLServer();
    
    console.log('✅ GraphQL server shutdown complete');
  } catch (error) {
    console.error('❌ GraphQL server shutdown failed:', error);
  }
}

// =================================================================
// DEVELOPMENT HELPERS
// =================================================================

/**
 * Setup GraphQL with development features
 */
export async function setupGraphQLDev(app: Express, httpServer?: Server): Promise<GraphQLSetupResult> {
  console.log('🛠️ Setting up GraphQL in development mode...');
  
  const result = await setupGraphQL({
    app,
    httpServer,
    path: '/graphql',
    enableSubscriptions: true,
    enablePlayground: true,
    enableIntrospection: true
  });

  if (result.success) {
    console.log('🎉 Development GraphQL server ready!');
    console.log('📚 Available endpoints:');
    console.log(`   • GraphQL API: http://localhost:${process.env.PORT || 3000}/graphql`);
    console.log(`   • Playground: http://localhost:${process.env.PORT || 3000}/graphql`);
    console.log(`   • Health: http://localhost:${process.env.PORT || 3000}/graphql/health`);
  }

  return result;
}

/**
 * Log GraphQL startup banner
 */
export function logGraphQLBanner(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    GraphQL Server Ready                     ║
║                                                              ║
║  🚀 Catalog API with Edge Function Integration              ║
║  📊 Real-time Subscriptions & Audit Logging                ║
║  🔐 JWT Authentication & Role-based Permissions            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
}

// =================================================================
// EXPORTS
// =================================================================

export default {
  setupGraphQL,
  setupGraphQLAuto,
  setupGraphQLDev,
  checkGraphQLHealth,
  getGraphQLInfo,
  shutdownGraphQL,
  logGraphQLBanner
};