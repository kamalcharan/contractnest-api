// src/graphql/config/schemaBuilder.ts
// GraphQL Schema Builder - Combines all schemas and resolvers
// Creates executable schema for Apollo Server with proper type merging

import { makeExecutableSchema } from '@graphql-tools/schema';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { loadFilesSync } from '@graphql-tools/load-files';
import { GraphQLSchema, GraphQLScalarType } from 'graphql';
import { Kind } from 'graphql/language';
import path from 'path';

// Import resolvers
import { catalogResolvers } from '../catalog/resolvers';

// =================================================================
// SCALAR RESOLVERS
// =================================================================

/**
 * Custom scalar type resolvers
 * Implements the scalar types defined in scalars.graphql
 */
const scalarResolvers = {
  /**
   * DateTime scalar - ISO 8601 datetime strings
   */
  DateTime: new GraphQLScalarType({
    name: 'DateTime',
    description: 'A date-time string at UTC, such as 2007-12-03T10:15:30Z',
    serialize(value: any): string {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'string') {
        return new Date(value).toISOString();
      }
      throw new Error('DateTime must be a Date object or ISO string');
    },
    parseValue(value: any): Date {
      if (typeof value === 'string') {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid DateTime format');
        }
        return date;
      }
      throw new Error('DateTime must be a string');
    },
    parseLiteral(ast): Date {
      if (ast.kind === Kind.STRING) {
        const date = new Date(ast.value);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid DateTime format');
        }
        return date;
      }
      throw new Error('DateTime must be a string literal');
    }
  }),

  /**
   * JSON scalar - Any valid JSON value
   */
  JSON: new GraphQLScalarType({
    name: 'JSON',
    description: 'The `JSON` scalar type represents JSON values as specified by ECMA-404',
    serialize(value: any): any {
      return value;
    },
    parseValue(value: any): any {
      return value;
    },
    parseLiteral(ast): any {
      function parseAst(astNode: any): any {
        switch (astNode.kind) {
          case Kind.STRING:
            try {
              return JSON.parse(astNode.value);
            } catch {
              return astNode.value;
            }
          case Kind.BOOLEAN:
            return astNode.value;
          case Kind.INT:
          case Kind.FLOAT:
            return parseFloat(astNode.value);
          case Kind.OBJECT:
            return astNode.fields.reduce((acc: any, field: any) => {
              acc[field.name.value] = parseAst(field.value);
              return acc;
            }, {});
          case Kind.LIST:
            return astNode.values.map((value: any) => parseAst(value));
          case Kind.NULL:
            return null;
          default:
            throw new Error(`Unexpected kind in JSON literal: ${astNode.kind}`);
        }
      }
      
      return parseAst(ast);
    }
  }),

  /**
   * UUID scalar - UUID strings
   */
  UUID: new GraphQLScalarType({
    name: 'UUID',
    description: 'A field whose value is a generic Universally Unique Identifier',
    serialize(value: any): string {
      if (typeof value === 'string') {
        if (isValidUUID(value)) {
          return value;
        }
        throw new Error('Invalid UUID format');
      }
      throw new Error('UUID must be a string');
    },
    parseValue(value: any): string {
      if (typeof value === 'string') {
        if (isValidUUID(value)) {
          return value;
        }
        throw new Error('Invalid UUID format');
      }
      throw new Error('UUID must be a string');
    },
    parseLiteral(ast): string {
      if (ast.kind === Kind.STRING) {
        if (isValidUUID(ast.value)) {
          return ast.value;
        }
        throw new Error('Invalid UUID format');
      }
      throw new Error('UUID must be a string literal');
    }
  }),

  /**
   * PositiveInt scalar - Positive integers only
   */
  PositiveInt: new GraphQLScalarType({
    name: 'PositiveInt',
    description: 'A field whose value is a positive integer',
    serialize(value: any): number {
      const num = parseInt(value, 10);
      if (isNaN(num) || num <= 0) {
        throw new Error('PositiveInt must be a positive integer');
      }
      return num;
    },
    parseValue(value: any): number {
      const num = parseInt(value, 10);
      if (isNaN(num) || num <= 0) {
        throw new Error('PositiveInt must be a positive integer');
      }
      return num;
    },
    parseLiteral(ast): number {
      if (ast.kind === Kind.INT) {
        const num = parseInt(ast.value, 10);
        if (num <= 0) {
          throw new Error('PositiveInt must be a positive integer');
        }
        return num;
      }
      throw new Error('PositiveInt must be an integer literal');
    }
  }),

  /**
   * NonNegativeInt scalar - Non-negative integers (0 or positive)
   */
  NonNegativeInt: new GraphQLScalarType({
    name: 'NonNegativeInt',
    description: 'A field whose value is a non-negative integer',
    serialize(value: any): number {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 0) {
        throw new Error('NonNegativeInt must be a non-negative integer');
      }
      return num;
    },
    parseValue(value: any): number {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 0) {
        throw new Error('NonNegativeInt must be a non-negative integer');
      }
      return num;
    },
    parseLiteral(ast): number {
      if (ast.kind === Kind.INT) {
        const num = parseInt(ast.value, 10);
        if (num < 0) {
          throw new Error('NonNegativeInt must be a non-negative integer');
        }
        return num;
      }
      throw new Error('NonNegativeInt must be an integer literal');
    }
  }),

  /**
   * NonEmptyString scalar - Strings that cannot be empty
   */
  NonEmptyString: new GraphQLScalarType({
    name: 'NonEmptyString',
    description: 'A string that cannot be passed as an empty string',
    serialize(value: any): string {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
      throw new Error('NonEmptyString cannot be empty');
    },
    parseValue(value: any): string {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
      throw new Error('NonEmptyString cannot be empty');
    },
    parseLiteral(ast): string {
      if (ast.kind === Kind.STRING && ast.value.trim().length > 0) {
        return ast.value;
      }
      throw new Error('NonEmptyString cannot be empty');
    }
  }),

  /**
   * Currency scalar - ISO 4217 currency codes
   */
  Currency: new GraphQLScalarType({
    name: 'Currency',
    description: 'A field whose value is a Currency: https://en.wikipedia.org/wiki/ISO_4217',
    serialize(value: any): string {
      if (typeof value === 'string' && isValidCurrency(value)) {
        return value.toUpperCase();
      }
      throw new Error('Currency must be a valid ISO 4217 currency code');
    },
    parseValue(value: any): string {
      if (typeof value === 'string' && isValidCurrency(value)) {
        return value.toUpperCase();
      }
      throw new Error('Currency must be a valid ISO 4217 currency code');
    },
    parseLiteral(ast): string {
      if (ast.kind === Kind.STRING && isValidCurrency(ast.value)) {
        return ast.value.toUpperCase();
      }
      throw new Error('Currency must be a valid ISO 4217 currency code');
    }
  })
};

// =================================================================
// ROOT TYPE RESOLVERS
// =================================================================

/**
 * Root Query resolver
 * Delegates to module-specific query resolvers
 */
const rootQueryResolver = {
  Query: {
    // Health check
    hello: () => 'Hello from GraphQL!',
    
    // Health status
    health: async (_: any, __: any, context: any) => {
      try {
        // Test database connection
        let dbStatus = 'unknown';
        try {
          const { data, error } = await context.supabase.from('t_tenants').select('count').limit(1);
          dbStatus = error ? 'error' : 'connected';
        } catch (error) {
          dbStatus = 'error';
        }

        return {
          status: 'OK',
          timestamp: new Date().toISOString(),
          services: {
            database: dbStatus,
            audit: 'connected',
            edge_functions: context.config.edge_functions_url ? 'configured' : 'not_configured'
          }
        };
      } catch (error) {
        return {
          status: 'ERROR',
          timestamp: new Date().toISOString(),
          services: {
            database: 'error',
            audit: 'error',
            edge_functions: 'error'
          }
        };
      }
    },

    // Catalog queries (delegate to catalog resolvers)
    ...catalogResolvers.Query
  }
};

/**
 * Root Mutation resolver
 * Delegates to module-specific mutation resolvers
 */
const rootMutationResolver = {
  Mutation: {
    // Catalog mutations (delegate to catalog resolvers)
    ...catalogResolvers.Mutation
  }
};

/**
 * Root Subscription resolver
 * Delegates to module-specific subscription resolvers
 */
const rootSubscriptionResolver = {
  Subscription: {
    // Catalog subscriptions (delegate to catalog resolvers)
    ...catalogResolvers.Subscription
  }
};

// =================================================================
// SCHEMA LOADING AND MERGING
// =================================================================

/**
 * Load all GraphQL schema files
 */
function loadSchemaFiles(): string[] {
  try {
    const schemaDir = path.join(__dirname, '../');
    
    // Load schema files in specific order
    const schemaFiles = [
      // Shared schemas first
      path.join(schemaDir, 'shared/schema/scalars.graphql'),
      path.join(schemaDir, 'shared/schema/common.graphql'),
      
      // Catalog schema
      path.join(schemaDir, 'catalog/schema/catalog.graphql')
    ];

    console.log('Loading GraphQL schema files:', schemaFiles);

    // Load files using @graphql-tools/load-files
    const typeDefs = loadFilesSync(schemaFiles, {
      extensions: ['graphql'],
      recursive: false
    });

    if (!typeDefs || typeDefs.length === 0) {
      throw new Error('No GraphQL schema files found');
    }

    console.log(`Loaded ${typeDefs.length} schema files successfully`);
    return typeDefs;

  } catch (error) {
    console.error('Error loading schema files:', error);
    
    // Fallback: return basic schema if file loading fails
    return [
      `
      scalar DateTime
      scalar JSON
      scalar UUID
      
      type Query {
        hello: String
        health: HealthStatus
      }
      
      type HealthStatus {
        status: String!
        timestamp: DateTime!
        services: ServiceStatus!
      }
      
      type ServiceStatus {
        database: String!
        audit: String!
        edge_functions: String!
      }
      
      type Mutation {
        _empty: String
      }
      
      type Subscription {
        _empty: String
      }
      `
    ];
  }
}

/**
 * Merge all resolvers
 */
function mergeAllResolvers() {
  try {
    console.log('Merging resolvers...');
    
    // Import catalog resolvers
    const catalogResolversModule = catalogResolvers || {};
    
    // Build the complete resolver map
    const resolvers = {
      // Scalar resolvers first
      ...scalarResolvers,
      
      // Root resolvers
      Query: {
        ...rootQueryResolver.Query,
        ...(catalogResolversModule.Query || {})
      },
      
      Mutation: {
        ...rootMutationResolver.Mutation,
        ...(catalogResolversModule.Mutation || {})
      },
      
      Subscription: {
        ...rootSubscriptionResolver.Subscription,
        ...(catalogResolversModule.Subscription || {})
      },
      
      // Type resolvers
      CatalogItem: catalogResolversModule.CatalogItem || {},
      CatalogCategory: catalogResolversModule.CatalogCategory || {},
      CatalogIndustry: catalogResolversModule.CatalogIndustry || {}
    };

    console.log('Merged resolvers successfully');
    console.log('Available scalar resolvers:', Object.keys(scalarResolvers));
    console.log('Available Query resolvers:', Object.keys(resolvers.Query || {}));
    console.log('Available Mutation resolvers:', Object.keys(resolvers.Mutation || {}));
    
    return resolvers;

  } catch (error) {
    console.error('Error merging resolvers:', error);
    
    // Fallback: return basic resolvers with scalars
    return {
      ...scalarResolvers,
      Query: {
        hello: () => 'Hello from GraphQL!',
        health: () => ({ status: 'OK', timestamp: new Date().toISOString(), services: {} })
      },
      Mutation: {
        _empty: () => null
      },
      Subscription: {
        _empty: () => null
      }
    };
  }
}

// =================================================================
// SCHEMA BUILDER FUNCTIONS
// =================================================================

/**
 * Create executable GraphQL schema
 */
export function createExecutableSchema(): GraphQLSchema {
  try {
    console.log('🔧 Building GraphQL schema...');

    // Load and merge type definitions
    const typeDefs = loadSchemaFiles();
    const mergedTypeDefs = mergeTypeDefs(typeDefs);

    // Merge resolvers
    const resolvers = mergeAllResolvers();

    // Create executable schema with simplified configuration
    const schema = makeExecutableSchema({
      typeDefs: mergedTypeDefs,
      resolvers
      // Remove all resolver validation options to avoid conflicts
    });

    console.log('✅ GraphQL schema built successfully');
    return schema;

  } catch (error: any) {
    console.error('❌ Failed to build GraphQL schema:', error);
    
    // Create minimal fallback schema
    const fallbackTypeDefs = `
      scalar DateTime
      scalar JSON
      scalar UUID
      scalar PositiveInt
      scalar NonNegativeInt
      scalar NonEmptyString
      scalar Currency
      
      type Query {
        hello: String
        health: HealthStatus
      }
      
      type HealthStatus {
        status: String!
        timestamp: DateTime!
        services: ServiceStatuses!
      }
      
      type ServiceStatuses {
        database: String!
        audit: String!
        edge_functions: String!
      }
      
      type Mutation {
        _empty: String
      }
      
      type Subscription {
        _empty: String
      }
    `;

    const fallbackResolvers = {
      ...scalarResolvers,
      Query: {
        hello: () => 'GraphQL schema build failed - using fallback',
        health: () => ({
          status: 'ERROR',
          timestamp: new Date().toISOString(),
          services: {
            database: 'error',
            audit: 'error', 
            edge_functions: 'error'
          }
        })
      },
      Mutation: {
        _empty: () => null
      },
      Subscription: {
        _empty: () => null
      }
    };

    return makeExecutableSchema({
      typeDefs: fallbackTypeDefs,
      resolvers: fallbackResolvers
      // Remove all validation options to avoid conflicts
    });
  }
}

/**
 * Validate schema integrity
 */
export function validateSchema(schema: GraphQLSchema): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    // Basic schema validation
    if (!schema) {
      errors.push('Schema is null or undefined');
      return { isValid: false, errors };
    }

    // Check for required types
    const queryType = schema.getQueryType();
    if (!queryType) {
      errors.push('Schema missing Query type');
    }

    const mutationType = schema.getMutationType();
    if (!mutationType) {
      errors.push('Schema missing Mutation type');
    }

    // Check for catalog types
    const catalogItemType = schema.getType('CatalogItem');
    if (!catalogItemType) {
      errors.push('Schema missing CatalogItem type');
    }

    // Check for custom scalars
    const dateTimeType = schema.getType('DateTime');
    if (!dateTimeType) {
      errors.push('Schema missing DateTime scalar');
    }

    const jsonType = schema.getType('JSON');
    if (!jsonType) {
      errors.push('Schema missing JSON scalar');
    }

    const uuidType = schema.getType('UUID');
    if (!uuidType) {
      errors.push('Schema missing UUID scalar');
    }

    console.log('Schema validation completed:', {
      isValid: errors.length === 0,
      errorCount: errors.length
    });

    return {
      isValid: errors.length === 0,
      errors
    };

  } catch (error: any) {
    errors.push(`Schema validation error: ${error.message}`);
    return { isValid: false, errors };
  }
}

/**
 * Get schema information for debugging
 */
export function getSchemaInfo(schema: GraphQLSchema) {
  try {
    const typeMap = schema.getTypeMap();
    const queryType = schema.getQueryType();
    const mutationType = schema.getMutationType();
    const subscriptionType = schema.getSubscriptionType();

    const info = {
      totalTypes: Object.keys(typeMap).length,
      queryFields: queryType ? Object.keys(queryType.getFields()).length : 0,
      mutationFields: mutationType ? Object.keys(mutationType.getFields()).length : 0,
      subscriptionFields: subscriptionType ? Object.keys(subscriptionType.getFields()).length : 0,
      customScalars: Object.keys(typeMap).filter(name => 
        typeMap[name].astNode?.kind === 'ScalarTypeDefinition' && 
        !['String', 'Int', 'Float', 'Boolean', 'ID'].includes(name)
      ),
      catalogTypes: Object.keys(typeMap).filter(name => name.startsWith('Catalog'))
    };

    return info;
  } catch (error) {
    console.error('Error getting schema info:', error);
    return null;
  }
}

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Validate UUID format
 */
function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate currency code (basic validation - could be enhanced)
 */
function isValidCurrency(value: string): boolean {
  // Basic validation for 3-letter currency codes
  // Could be enhanced with full ISO 4217 list
  const currencyRegex = /^[A-Z]{3}$/;
  return currencyRegex.test(value.toUpperCase());
}

// =================================================================
// EXPORTS
// =================================================================

export default {
  createExecutableSchema,
  validateSchema,
  getSchemaInfo,
  scalarResolvers
};