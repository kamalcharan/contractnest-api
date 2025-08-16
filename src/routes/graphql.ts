// src/routes/graphql.ts
// ✅ PRODUCTION: Updated GraphQL routes with Resources integration

import { Router, Request, Response, NextFunction } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { printSchema } from 'graphql';
import rateLimit from 'express-rate-limit';

import { AuthRequest } from '../middleware/auth';
import { createApolloServer, graphqlMiddleware, exampleQueries } from '../graphql/server';

// =================================================================
// RATE LIMITING CONFIGURATION
// =================================================================

/**
 * Environment-specific rate limiting for GraphQL
 */
const createGraphQLRateLimit = (environment: 'production' | 'development') => {
  const config = {
    production: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        success: false,
        error: 'Too many GraphQL requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    },
    development: {
      windowMs: 15 * 60 * 1000, // 15 minutes  
      max: 1000, // more lenient for development
      message: {
        success: false,
        error: 'Rate limit exceeded (development mode)',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    }
  };

  return rateLimit(config[environment]);
};

// =================================================================
// AUTHENTICATION MIDDLEWARE
// =================================================================

/**
 * Simple authentication middleware that checks for user
 */
function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'UNAUTHENTICATED'
    });
  }
  next();
}

/**
 * Optional authentication middleware
 */
function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Continue regardless of authentication status
  next();
}

// =================================================================
// GRAPHQL ROUTE HANDLERS
// =================================================================

/**
 * Main GraphQL endpoint with full security
 */
async function handleGraphQLEndpoint(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Get Apollo Server instance
    const server = createApolloServer();
    
    // Apply Apollo Server Express middleware
    const graphqlHandler = server.getMiddleware({ 
      path: '/graphql',
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true
      }
    });

    // Call the GraphQL handler with proper parameters
    return (graphqlHandler as any)(req, res, next);
  } catch (error: any) {
    console.error('[GraphQL Endpoint] Error:', error);
    res.status(500).json({
      success: false,
      error: 'GraphQL server error',
      message: error?.message || 'Unknown error'
    });
  }
}

/**
 * Development GraphQL playground endpoint
 */
async function handleGraphQLPlayground(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({
        success: false,
        error: 'GraphQL Playground not available in production'
      });
    }

    // ✅ UPDATED: Enhanced HTML playground with Resources info
    const playgroundHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GraphQL Playground - ContractNest</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/css/index.css" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .container { padding: 20px; max-width: 800px; margin: 0 auto; }
            .module { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 6px; }
            .endpoint { background: #e10098; color: white; padding: 8px 12px; margin: 5px; display: inline-block; border-radius: 4px; text-decoration: none; }
            .endpoint:hover { background: #c1007a; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 ContractNest GraphQL API</h1>
            <p>Development interface for GraphQL operations</p>
            
            <div class="module">
              <h3>📋 Catalog Management</h3>
              <p>Complete catalog management with resource composition support</p>
              <ul>
                <li>Query catalog items with linked resources</li>
                <li>Create/update catalog items</li>
                <li>Multi-currency pricing support</li>
                <li>Environment segregation (production/test)</li>
              </ul>
            </div>

            <div class="module">
              <h3>🔧 Resource Management</h3>
              <p>Comprehensive resource management for service catalog</p>
              <ul>
                <li><strong>Team Staff:</strong> Employee resources with contact integration</li>
                <li><strong>Equipment:</strong> Tools, machines, and equipment</li>
                <li><strong>Consumables:</strong> Supplies and materials</li>
                <li><strong>Assets:</strong> Fixed assets and facilities</li>
                <li><strong>Partners:</strong> External contractors and vendors</li>
              </ul>
            </div>

            <h3>🔗 Available Endpoints</h3>
            <div style="margin: 20px 0;">
              <a href="/api/graphql" class="endpoint">GraphQL Endpoint</a>
              <a href="/api/graphql/schema" class="endpoint">View Schema</a>
              <a href="/api/graphql/examples" class="endpoint">Example Queries</a>
              <a href="/api/graphql/health" class="endpoint">Health Check</a>
            </div>

            <h3>📖 Quick Examples</h3>
            <div style="background: #f1f3f4; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <h4>Query Resources by Type:</h4>
              <pre><code>query {
  resourcesByType(resourceType: EQUIPMENT) {
    success
    data {
      id
      name
      displayName
      status
    }
  }
}</code></pre>
            </div>

            <div style="background: #f1f3f4; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <h4>Create New Resource:</h4>
              <pre><code>mutation {
  createResource(input: {
    resourceTypeId: EQUIPMENT
    name: "Air Compressor"
    displayName: "Industrial Air Compressor"
    description: "50 gallon industrial air compressor"
  }) {
    success
    data {
      id
      name
      environmentLabel
    }
    message
  }
}</code></pre>
            </div>

            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              💡 Use headers: Authorization, x-tenant-id, x-environment for authenticated requests
            </p>
          </div>
        </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(playgroundHTML);
  } catch (error: any) {
    console.error('[GraphQL Playground] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Playground error',
      message: error?.message || 'Unknown error'
    });
  }
}

/**
 * GraphQL schema introspection endpoint
 */
async function handleGraphQLSchema(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({
        success: false,
        error: 'Schema introspection not available in production'
      });
    }

    const server = createApolloServer();
    
    // Access schema through server's executable schema
    const executableSchema = (server as any).schema;
    
    if (!executableSchema) {
      return res.status(500).json({
        success: false,
        error: 'Schema not available'
      });
    }

    const schemaString = printSchema(executableSchema);

    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename=contractnest-schema.graphql');
      return res.send(schemaString);
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send(schemaString);
  } catch (error: any) {
    console.error('[GraphQL Schema] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Schema generation error',
      message: error?.message || 'Unknown error'
    });
  }
}

/**
 * GraphQL examples endpoint
 */
async function handleGraphQLExamples(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({
        success: false,
        error: 'Examples not available in production'
      });
    }

    // ✅ UPDATED: Enhanced examples with Resources
    const examples = {
      info: {
        title: 'ContractNest GraphQL API Examples',
        description: 'Example queries and mutations for catalog and resource management',
        version: '1.0.0',
        endpoint: '/api/graphql',
        modules: ['catalog', 'resources']
      },
      authentication: {
        note: 'All requests require authentication headers',
        headers: {
          'Authorization': 'Bearer <your-jwt-token>',
          'x-tenant-id': '<your-tenant-id>',
          'x-user-id': '<your-user-id>',
          'x-environment': 'production|test'
        }
      },
      examples: exampleQueries,
      variables: {
        // ✅ NEW: Resource examples
        createResourceExample: {
          input: {
            resourceTypeId: "EQUIPMENT",
            name: "Air Compressor",
            displayName: "Industrial Air Compressor - 50 Gallon",
            description: "High-capacity industrial air compressor for pneumatic tools",
            hexcolor: "#4A90E2",
            sequenceNo: 1
          }
        },
        createTeamStaffExample: {
          input: {
            resourceTypeId: "TEAM_STAFF",
            name: "John Smith",
            displayName: "John Smith - Senior HVAC Technician",
            description: "Experienced HVAC technician with 10+ years experience",
            contactId: "contact-uuid-here",
            hexcolor: "#50C878"
          }
        },
        resourceQueryExample: {
          query: {
            filters: {
              resourceTypeId: ["EQUIPMENT", "TEAM_STAFF"],
              isActive: true
            },
            sort: [
              {
                field: "SEQUENCE_NO",
                direction: "ASC"
              }
            ],
            pagination: {
              page: 1,
              limit: 20
            }
          }
        },
        // EXISTING: Catalog examples
        createCatalogItemExample: {
          input: {
            name: "HVAC Maintenance Service",
            type: "SERVICE",
            priceAttributes: {
              type: "FIXED",
              baseAmount: 500.00,
              currency: "INR",
              billingMode: "manual"
            },
            shortDescription: "Quarterly HVAC system maintenance",
            descriptionContent: "Complete maintenance service for HVAC systems including inspection, cleaning, and minor repairs.",
            resourceRequirements: {
              teamStaff: ["team-staff-uuid"],
              equipment: ["equipment-uuid"],
              consumables: [],
              assets: [],
              partners: []
            },
            serviceAttributes: {
              estimatedDuration: 120,
              complexityLevel: "MEDIUM",
              requiresCustomerPresence: false,
              locationRequirements: ["on_site"]
            }
          }
        },
        filtersExample: {
          filters: {
            type: ["SERVICE"],
            status: ["ACTIVE"],
            complexityLevel: ["LOW", "MEDIUM"]
          },
          pagination: {
            first: 20
          }
        }
      },
      // ✅ NEW: Resource usage examples
      resourceUsage: {
        workflow: [
          "1. Query resource types: resourceTypes",
          "2. Create resources: createResource",
          "3. Link resources to catalog items",
          "4. Query catalog with resources: getCatalogItemsWithResources"
        ],
        teamStaffWorkflow: [
          "1. Ensure contact exists with team_member classification",
          "2. Create team_staff resource with contactId",
          "3. Link to catalog items requiring human resources"
        ]
      }
    };

    res.json({
      success: true,
      data: examples,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[GraphQL Examples] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Examples generation error',
      message: error?.message || 'Unknown error'
    });
  }
}

/**
 * GraphQL health check endpoint
 */
async function handleGraphQLHealth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const server = createApolloServer();
    
    // ✅ UPDATED: Enhanced health check with Resources
    const healthData = {
      status: 'healthy',
      service: 'graphql-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      modules: {
        catalog: 'available',
        resources: 'available' // ✅ NEW
      },
      features: {
        introspection: process.env.NODE_ENV !== 'production',
        playground: process.env.NODE_ENV !== 'production',
        rateLimiting: true,
        authentication: true,
        hmacSecurity: true,
        environmentSegregation: true, // ✅ NEW
        bulkOperations: true, // ✅ NEW
        resourceManagement: true // ✅ NEW
      },
      endpoints: {
        graphql: '/api/graphql',
        playground: process.env.NODE_ENV !== 'production' ? '/api/graphql/playground' : null,
        schema: process.env.NODE_ENV !== 'production' ? '/api/graphql/schema' : null,
        examples: process.env.NODE_ENV !== 'production' ? '/api/graphql/examples' : null,
        health: '/api/graphql/health'
      },
      // ✅ NEW: Resource types available
      resourceTypes: [
        'TEAM_STAFF',
        'EQUIPMENT', 
        'CONSUMABLE',
        'ASSET',
        'PARTNER'
      ]
    };

    res.json({
      success: true,
      data: healthData
    });
  } catch (error: any) {
    console.error('[GraphQL Health] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error?.message || 'Unknown error'
    });
  }
}

// =================================================================
// ROUTER SETUP
// =================================================================

/**
 * Create GraphQL router with all endpoints
 */
export function createGraphQLRouter(): Router {
  const router = Router();
  const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  
  // Apply rate limiting
  const graphqlRateLimit = createGraphQLRateLimit(environment);
  router.use(graphqlRateLimit);

  // Main GraphQL endpoint (requires authentication and HMAC)
  router.use('/graphql', 
    graphqlMiddleware,
    requireAuth,
    handleGraphQLEndpoint
  );

  // Development endpoints (no authentication required)
  if (process.env.NODE_ENV !== 'production') {
    router.get('/graphql/playground', optionalAuth, handleGraphQLPlayground);
    router.get('/graphql/schema', optionalAuth, handleGraphQLSchema);
    router.get('/graphql/examples', optionalAuth, handleGraphQLExamples);
  }

  // Health check endpoint (always available)
  router.get('/graphql/health', optionalAuth, handleGraphQLHealth);

  return router;
}

// =================================================================
// APOLLO SERVER INTEGRATION HELPER
// =================================================================

/**
 * Apply Apollo Server to Express app
 */
export async function applyApolloServerToApp(app: any): Promise<void> {
  try {
    const server = createApolloServer();
    
    // Start the server
    await server.start();
    
    // Apply middleware to Express app
    server.applyMiddleware({ 
      app, 
      path: '/api/graphql',
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true
      }
    });

    console.log(`[GraphQL] Apollo Server applied to Express app at /api/graphql`);
  } catch (error: any) {
    console.error('[GraphQL] Failed to apply Apollo Server to Express app:', error);
    throw error;
  }
}

// =================================================================
// EXPORT DEFAULT ROUTER
// =================================================================

export default createGraphQLRouter();