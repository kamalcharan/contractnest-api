// src/graphql/config/graphqlConfig.ts
// Complete GraphQL configuration using the actual schema from schemaBuilder

import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault, ApolloServerPluginLandingPageProductionDefault } from '@apollo/server/plugin/landingPage/default';
import { createClient } from '@supabase/supabase-js';
import { Server } from 'http';
import { Request } from 'express';

import { 
  GraphQLContext, 
  GraphQLUser,
  TenantContext,
  RequestMetadata,
  createRequestMetadata,
  GraphQLAuthenticationError,
  GraphQLAuthorizationError
} from '../shared/types/catalogContext';
import { GraphQLAuditService, createGraphQLAuditService } from '../shared/services/auditService';
import { AuditContext } from '../../constants/auditConstants';
import { createExecutableSchema } from './schemaBuilder';

// =================================================================
// APOLLO SERVER CONFIGURATION
// =================================================================

export interface GraphQLServerConfig {
  httpServer?: Server;
  enableSubscriptions?: boolean;
  enablePlayground?: boolean;
  enableIntrospection?: boolean;
  environment: 'development' | 'staging' | 'production';
}

/**
 * Create Apollo Server with complete schema and GraphQL Playground
 */
export async function createGraphQLServer(config: GraphQLServerConfig): Promise<{
  server: ApolloServer<GraphQLContext>;
}> {
  
  // Use the complete schema from schemaBuilder
  const schema = createExecutableSchema();

  // Configure Apollo Server plugins
  const plugins = [
    // Handle HTTP server drainage
    config.httpServer ? ApolloServerPluginDrainHttpServer({ httpServer: config.httpServer }) : null,
    
    // Landing page configuration with GraphQL Playground
    config.environment === 'production' 
      ? ApolloServerPluginLandingPageProductionDefault({
          footer: false,
          embed: false
        })
      : ApolloServerPluginLandingPageLocalDefault({
          footer: false,
          embed: true,
          includeCookies: true
        }),

    // Custom audit logging plugin
    auditLoggingPlugin(),

    // Performance monitoring plugin
    performanceMonitoringPlugin(),

    // Error handling plugin
    errorHandlingPlugin(config.environment),

  ].filter((plugin): plugin is NonNullable<typeof plugin> => plugin !== null);

  // Create Apollo Server
  const server = new ApolloServer<GraphQLContext>({
    schema,
    plugins,
    introspection: true, // Always enable introspection for development
    includeStacktraceInErrorResponses: config.environment === 'development',
    formatError: (formattedError, error) => {
      // Enhanced error formatting with audit logging
      console.error('GraphQL Error:', {
        message: formattedError.message,
        code: formattedError.extensions?.code,
        path: formattedError.path
      });

      // Remove sensitive information in production
      if (config.environment === 'production') {
        delete formattedError.extensions?.exception;
        if ('locations' in formattedError) {
          delete (formattedError as any).locations;
        }
      }

      return formattedError;
    },
  });

  return { server };
}

// =================================================================
// APOLLO SERVER PLUGINS
// =================================================================

function auditLoggingPlugin() {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation(requestContext: any) {
          const { request, contextValue } = requestContext;
          const context = contextValue as GraphQLContext;
          
          if (context?.auditLogger) {
            const operationType = request.query?.match(/^\s*(query|mutation|subscription)/i)?.[1]?.toLowerCase() || 'query';
            const operationName = request.operationName || 'unnamed_operation';
            
            try {
              await context.auditLogger.logGraphQLOperation(
                operationType as any,
                operationName,
                true,
                undefined,
                undefined,
                {
                  query: request.query,
                  variables: request.variables,
                  user_id: context.user?.id,
                  tenant_id: context.tenant?.id
                }
              );
            } catch (error) {
              console.warn('Failed to log GraphQL operation:', error);
            }
          }
        },

        async willSendResponse(requestContext: any) {
          const { response, contextValue } = requestContext;
          const context = contextValue as GraphQLContext;
          
          if (response.body?.singleResult?.errors && context?.auditLogger) {
            const errors = response.body.singleResult.errors;
            const operationName = requestContext.request.operationName || 'unnamed_operation';
            
            try {
              await context.auditLogger.logGraphQLOperation(
                'query' as any,
                operationName,
                false,
                undefined,
                errors.map((e: any) => e.message).join(', '),
                {
                  error_count: errors.length,
                  errors: errors.map((e: any) => ({
                    message: e.message,
                    code: e.extensions?.code,
                    path: e.path
                  }))
                }
              );
            } catch (error) {
              console.warn('Failed to log GraphQL error:', error);
            }
          }
        }
      };
    }
  };
}

function performanceMonitoringPlugin() {
  return {
    async requestDidStart() {
      const startTime = Date.now();
      
      return {
        async willSendResponse(requestContext: any) {
          const duration = Date.now() - startTime;
          const { request, contextValue } = requestContext;
          const context = contextValue as GraphQLContext;
          
          // Log performance metrics for slow queries
          if (duration > 1000 && context?.auditLogger) {
            const operationName = request.operationName || 'unnamed_operation';
            
            try {
              await context.auditLogger.logGraphQLOperation(
                'query' as any,
                `${operationName}_performance`,
                true,
                duration,
                undefined,
                {
                  duration,
                  memory_usage: process.memoryUsage().heapUsed,
                  query_complexity: request.query?.length || 0
                }
              );
            } catch (error) {
              console.warn('Failed to log performance metrics:', error);
            }
          }

          if (context?.config.environment === 'development') {
            console.log(`GraphQL Operation: ${request.operationName || 'unnamed'} - ${duration}ms`);
          }
        }
      };
    }
  };
}

function errorHandlingPlugin(environment: string) {
  return {
    async requestDidStart() {
      return {
        async didEncounterErrors(requestContext: any) {
          const { errors, contextValue } = requestContext;
          const context = contextValue as GraphQLContext;
          
          for (const error of errors) {
            console.error('GraphQL Error Details:', {
              message: error.message,
              code: error.extensions?.code,
              path: error.path,
              user_id: context?.user?.id,
              tenant_id: context?.tenant?.id,
              environment: environment
            });

            // Log authentication/authorization errors with audit
            if (context?.auditLogger && (
              error.extensions?.code === 'UNAUTHENTICATED' || 
              error.extensions?.code === 'FORBIDDEN'
            )) {
              try {
                await context.auditLogger.logGraphQLOperation(
                  'query' as any,
                  'auth_failure',
                  false,
                  undefined,
                  error.message,
                  {
                    auth_failure_type: error.extensions.code === 'UNAUTHENTICATED' ? 'authentication' : 'authorization',
                    attempted_operation: requestContext.request.operationName || 'unknown_operation',
                    error_message: error.message,
                    path: error.path
                  }
                );
              } catch (auditError) {
                console.warn('Failed to log auth failure:', auditError);
              }
            }
          }
        }
      };
    }
  };
}

// =================================================================
// CONTEXT BUILDER
// =================================================================

export async function createGraphQLContext(req: Request): Promise<GraphQLContext> {
  // Extract authentication token
  const authHeader = req.headers.authorization;
  let user: GraphQLUser | undefined;
  
  if (authHeader?.startsWith('Bearer ')) {
    user = extractUserFromToken(authHeader.substring(7)) || undefined;
  }

  // Extract tenant information - make it optional for playground
  const tenantId = req.headers['x-tenant-id'] as string;
  
  // Create default tenant for playground/testing
  const tenant: TenantContext = {
    id: tenantId || 'default-tenant',
    is_live: req.headers['x-environment'] !== 'test',
    user_is_admin: false,
  };

  // Create Supabase client
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  );

  // Create request metadata
  const metadata = createRequestMetadata(req);

  // Create configuration
  const config = {
    edge_functions_url: process.env.EDGE_FUNCTIONS_URL || '',
    internal_signing_secret: process.env.INTERNAL_SIGNING_SECRET || '',
    environment: (process.env.NODE_ENV as any) || 'development'
  };

  // Create base context
  const context: GraphQLContext = {
    user,
    tenant,
    supabase,
    req,
    metadata,
    config,
    auditLogger: null as any, // Will be set below
    
    // Helper methods
    createAuditContext(): AuditContext {
      return {
        tenantId: tenant.id,
        userId: user?.id,
        userEmail: user?.email,
        sessionId: metadata.session_id,
        ipAddress: metadata.ip_address,
        userAgent: metadata.user_agent,
        allTenantIds: user?.tenants?.map(t => t.id) || [tenant.id],
        isSuperAdmin: user?.is_super_admin || false,
        isTenantAdmin: tenant.user_is_admin,
      };
    },

    hasPermission(permission: string): boolean {
      if (user?.is_super_admin) return true;
      if (tenant.user_is_admin) return true;
      return tenant.user_permissions?.includes(permission) || false;
    },

    isLiveEnvironment(): boolean {
      return tenant.is_live;
    }
  };

  // Create audit logger with context
  try {
    context.auditLogger = createGraphQLAuditService(context);
  } catch (error) {
    console.warn('Failed to create audit logger:', error);
    // Create a mock audit logger for development
    context.auditLogger = {
      logGraphQLOperation: async () => {},
    } as any;
  }

  // Validate tenant access for user (optional for playground)
  if (user && tenantId) {
    try {
      const { data: userTenant } = await supabase
        .from('t_user_tenants')
        .select('is_admin, status')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .single();

      if (userTenant) {
        tenant.user_is_admin = userTenant.is_admin;
      }
    } catch (error) {
      console.warn('Failed to validate tenant access:', error);
    }
  }

  return context;
}

// =================================================================
// HELPER FUNCTIONS
// =================================================================

function extractUserFromToken(token: string): GraphQLUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch (error) {
    console.warn('Failed to extract user from token:', error);
    return null;
  }
}

// =================================================================
// CONFIGURATION HELPERS
// =================================================================

export function validateGraphQLConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!process.env.SUPABASE_URL) {
    errors.push('SUPABASE_URL environment variable is required');
  }
  
  if (!process.env.SUPABASE_KEY) {
    errors.push('SUPABASE_KEY environment variable is required');
  }
  
  // Make signing secret optional for development
  if (!process.env.INTERNAL_SIGNING_SECRET && process.env.NODE_ENV === 'production') {
    errors.push('INTERNAL_SIGNING_SECRET environment variable is required for production');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function getGraphQLConfigFromEnv(): GraphQLServerConfig {
  return {
    enableSubscriptions: process.env.GRAPHQL_SUBSCRIPTIONS_ENABLED === 'true',
    enablePlayground: process.env.GRAPHQL_PLAYGROUND_ENABLED === 'true' || process.env.NODE_ENV === 'development',
    enableIntrospection: process.env.GRAPHQL_INTROSPECTION_ENABLED === 'true' || process.env.NODE_ENV !== 'production',
    environment: (process.env.NODE_ENV as any) || 'development'
  };
}

export default {
  createGraphQLServer,
  createGraphQLContext,
  validateGraphQLConfig,
  getGraphQLConfigFromEnv
};