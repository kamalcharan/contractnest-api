// src/graphql/resolvers/catalog/catalogResolvers.ts
// ✅ PRODUCTION: Complete GraphQL resolvers for catalog with resource composition

import { 
  CatalogServiceConfig,
  CatalogItemType,
  ResourceType,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
  CatalogItemQuery,
  ResourceListParams,
  ServiceComplexityLevel,
  SupportedCurrency,
  SortDirection,
  CatalogError,
  NotFoundError,
  ValidationError
} from '../../../types/catalog';

// Import services from their actual locations
import { CatalogService } from '../../../services/catalogService';
import { CatalogValidationService } from '../../../services/catalogValidationService';

// =================================================================
// GRAPHQL CONTEXT INTERFACE
// =================================================================

interface GraphQLContext {
  tenantId: string;
  userId: string;
  userJWT: string;
  isLive: boolean;
  environmentLabel: string;
  requestId: string;
  userRole?: string;
  clientVersion?: string;
  catalogService: CatalogService;
  validationService: CatalogValidationService;
  redis: any;
  req: any;
}

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Convert GraphQL enum to internal type
 */
function convertGraphQLEnums(input: any): any {
  if (!input) return input;
  
  if (Array.isArray(input)) {
    return input.map(convertGraphQLEnums);
  }
  
  if (typeof input === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') {
        // Convert enum values from SCREAMING_SNAKE_CASE to snake_case
        if (key.includes('Type') || key === 'type' || key === 'status' || key === 'complexityLevel') {
          converted[key] = value.toLowerCase();
        } else {
          converted[key] = value;
        }
      } else {
        converted[key] = convertGraphQLEnums(value);
      }
    }
    return converted;
  }
  
  return input;
}

/**
 * Create environment info for responses
 */
function createEnvironmentInfo(context: GraphQLContext) {
  return {
    isLive: context.isLive,
    environmentLabel: context.environmentLabel,
    tenantId: context.tenantId,
    requestId: context.requestId,
    timestamp: new Date()
  };
}

/**
 * Handle GraphQL errors consistently
 */
function handleGraphQLError(error: any, context: GraphQLContext) {
  console.error(`[GraphQL Error] ${context.environmentLabel} (${context.requestId}):`, error);
  
  if (error instanceof ValidationError) {
    throw new Error(`Validation failed: ${error.validationErrors.map(e => e.message).join(', ')}`);
  }
  
  if (error instanceof NotFoundError) {
    throw new Error(error.message);
  }
  
  if (error instanceof CatalogError) {
    throw new Error(`Catalog error: ${error.message}`);
  }
  
  throw new Error('An unexpected error occurred');
}

/**
 * Apply pagination defaults
 */
function applyPaginationDefaults(pagination: any) {
  return {
    page: pagination?.first ? Math.ceil((pagination.first || 20) / 20) : 1,
    limit: Math.min(pagination?.first || 20, 100)
  };
}

// =================================================================
// QUERY RESOLVERS
// =================================================================

const catalogQueries = {
  // Get single catalog item
  catalogItem: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
    try {
      console.log(`[GraphQL Query] getCatalogItem: ${id} (${context.environmentLabel})`);
      
      const result = await context.catalogService.getCatalogItemById(id);
      
      if (!result.success || !result.data) {
        throw new NotFoundError('Catalog item', id);
      }
      
      return result.data;
    } catch (error) {
      handleGraphQLError(error, context);
    }
  },

  // Query catalog items with pagination
  catalogItems: async (
    _: any, 
    { filters, sort, pagination }: {
      filters?: any;
      sort?: any[];
      pagination?: any;
    }, 
    context: GraphQLContext
  ) => {
    try {
      console.log(`[GraphQL Query] catalogItems (${context.environmentLabel}):`, {
        filters: Object.keys(filters || {}),
        pagination
      });

      // Convert GraphQL input to internal format
      const convertedFilters = convertGraphQLEnums(filters);
      const convertedSort = sort?.map(s => convertGraphQLEnums(s));
      const paginationParams = applyPaginationDefaults(pagination);

      const query: CatalogItemQuery = {
        filters: convertedFilters,
        sort: convertedSort,
        pagination: paginationParams,
        include_related: true,
        include_resources: true
      };

      const result = await context.catalogService.queryCatalogItems(query);

      if (!result.success) {
        throw new Error(result.error || 'Failed to query catalog items');
      }

      // Convert to GraphQL connection format
      const edges = (result.data || []).map((item: any, index: number) => ({
        node: item,
        cursor: Buffer.from(`${paginationParams.page}:${index}`).toString('base64')
      }));

      const hasNextPage = result.pagination?.has_more || false;
      const hasPreviousPage = paginationParams.page > 1;

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: result.pagination?.total || 0,
        summary: {
          totalItems: result.pagination?.total || 0,
          byType: {}, // TODO: Calculate from data
          byStatus: {}, // TODO: Calculate from data
          withResources: 0, // TODO: Calculate from data
          environmentLabel: context.environmentLabel,
          isLive: context.isLive
        }
      };
    } catch (error) {
      handleGraphQLError(error, context);
    }
  },

  // Get tenant resources
  tenantResources: async (
    _: any,
    { filters, sort, pagination }: {
      filters?: any;
      sort?: any;
      pagination?: any;
    },
    context: GraphQLContext
  ) => {
    try {
      console.log(`[GraphQL Query] tenantResources (${context.environmentLabel})`);

      const convertedFilters = convertGraphQLEnums(filters);
      const paginationParams = applyPaginationDefaults(pagination);

      const params: ResourceListParams = {
        ...convertedFilters,
        ...paginationParams,
        sortBy: sort?.[0]?.field || 'created_at',
        sortOrder: sort?.[0]?.direction?.toLowerCase() as SortDirection || 'desc',
        is_live: context.isLive
      };

      const result = await context.catalogService.getTenantResources(params);

      const edges = result.resources.map((resource: any, index: number) => ({
        node: resource,
        cursor: Buffer.from(`${params.page}:${index}`).toString('base64')
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage: result.pagination.page * result.pagination.limit < result.pagination.total,
          hasPreviousPage: result.pagination.page > 1,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: result.pagination.total,
        summary: {
          totalResources: result.pagination.total,
          byType: {}, // TODO: Calculate
          byStatus: {}, // TODO: Calculate
          withPricing: 0, // TODO: Calculate
          teamStaffWithContacts: 0, // TODO: Calculate
          environmentLabel: context.environmentLabel,
          isLive: context.isLive
        }
      };
    } catch (error) {
      handleGraphQLError(error, context);
    }
  },

  // Get single resource
  resource: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
    try {
      console.log(`[GraphQL Query] getResource: ${id} (${context.environmentLabel})`);
      
      const result = await context.catalogService.getResourceDetails(id);
      return result.resource;
    } catch (error) {
      handleGraphQLError(error, context);
    }
  },

  // Get eligible contacts for resource type
  eligibleContacts: async (
    _: any, 
    { resourceType }: { resourceType: ResourceType }, 
    context: GraphQLContext
  ) => {
    try {
      console.log(`[GraphQL Query] eligibleContacts: ${resourceType} (${context.environmentLabel})`);

      const convertedResourceType = resourceType.toLowerCase() as 'team_staff' | 'partner';
      const contacts = await context.catalogService.getEligibleContacts(convertedResourceType);

      return {
        success: true,
        data: contacts.map((contact: any) => ({
          ...contact,
          displayName: contact.company_name || contact.name || `Contact ${contact.id}`,
          primaryEmail: contact.primary_email,
          primaryPhone: contact.primary_phone
        })),
        summary: {
          totalEligible: contacts.length,
          resourceType: resourceType
        },
        environmentInfo: createEnvironmentInfo(context)
      };
    } catch (error) {
      handleGraphQLError(error, context);
    }
  },

  // Get tenant configuration
  tenantConfig: async (_: any, __: any, context: GraphQLContext) => {
    try {
      return {
        environmentInfo: createEnvironmentInfo(context),
        supportedFeatures: {
          resourceTypes: ['TEAM_STAFF', 'EQUIPMENT', 'CONSUMABLE', 'ASSET', 'PARTNER'],
          catalogTypes: ['SERVICE', 'EQUIPMENT', 'SPARE_PART', 'ASSET'],
          supportedCurrencies: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CAD', 'AUD'],
          complexityLevels: ['LOW', 'MEDIUM', 'HIGH', 'EXPERT'],
          pricingTypes: ['FIXED', 'UNIT_PRICE', 'HOURLY', 'DAILY'],
          resourcePricingTypes: ['FIXED', 'HOURLY', 'PER_USE', 'DAILY', 'MONTHLY', 'PER_UNIT']
        },
        limits: {
          bulkCreate: 100,
          bulkUpdate: 100,
          bulkDelete: 50,
          queryLimit: 100,
          descriptionLength: 10000,
          termsLength: 20000
        },
        contactClassifications: {
          teamStaff: ['team_member'],
          partner: ['partner', 'vendor']
        }
      };
    } catch (error) {
      handleGraphQLError(error, context);
    }
  },

  // Health check
  healthCheck: async (_: any, __: any, context: GraphQLContext) => {
    try {
      return {
        status: 'healthy',
        environmentInfo: createEnvironmentInfo(context),
        service: 'catalog-graphql',
        version: '1.0.0',
        features: {
          resourceComposition: true,
          environmentSegregation: true,
          contactIntegration: true,
          multiCurrencyPricing: true,
          bulkOperations: true
        }
      };
    } catch (error) {
      handleGraphQLError(error, context);
    }
  }
};

// =================================================================
// MUTATION RESOLVERS
// =================================================================

const catalogMutations = {
  // Create catalog item
  createCatalogItem: async (
    _: any,
    { input }: { input: any },
    context: GraphQLContext
  ) => {
    try {
      console.log(`[GraphQL Mutation] createCatalogItem: ${input.name} (${context.environmentLabel})`);

      // Convert GraphQL input to internal format
      const convertedInput = convertGraphQLEnums(input);
      
      // Transform GraphQL input to service request
      const createRequest: CreateCatalogItemRequest = {
        ...convertedInput,
        is_live: context.isLive
      };

      // Validate request
      const validation = await context.validationService.validateCreateRequest(createRequest);
      if (!validation.is_valid) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
          environmentInfo: createEnvironmentInfo(context)
        };
      }

      // Create catalog item
      const result = await context.catalogService.createCatalogItem(createRequest);

      return {
        success: result.success,
        data: result.data,
        message: result.message,
        errors: [],
        warnings: validation.warnings || [],
        environmentInfo: createEnvironmentInfo(context)
      };
    } catch (error: any) {
      console.error(`[GraphQL Mutation] createCatalogItem error:`, error);
      return {
        success: false,
        errors: [{ field: 'general', message: error?.message || 'Unknown error' }],
        environmentInfo: createEnvironmentInfo(context)
      };
    }
  },

  // Update catalog item
  updateCatalogItem: async (
    _: any,
    { id, input }: { id: string; input: any },
    context: GraphQLContext
  ) => {
    try {
      console.log(`[GraphQL Mutation] updateCatalogItem: ${id} (${context.environmentLabel})`);

      // Convert GraphQL input to internal format
      const convertedInput = convertGraphQLEnums(input);

      // Get current item for validation
      const currentResult = await context.catalogService.getCatalogItemById(id);
      if (!currentResult.success || !currentResult.data) {
        return {
          success: false,
          errors: [{ field: 'id', message: 'Catalog item not found' }],
          environmentInfo: createEnvironmentInfo(context)
        };
      }

      // Validate update request
      const validation = await context.validationService.validateUpdateRequest(
        currentResult.data,
        convertedInput
      );
      
      if (!validation.is_valid) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
          environmentInfo: createEnvironmentInfo(context)
        };
      }

      // Update catalog item
      const result = await context.catalogService.updateCatalogItem(id, convertedInput);

      return {
        success: result.success,
        data: result.data,
        message: result.message,
        errors: [],
        warnings: validation.warnings || [],
        environmentInfo: createEnvironmentInfo(context)
      };
    } catch (error: any) {
      console.error(`[GraphQL Mutation] updateCatalogItem error:`, error);
      return {
        success: false,
        errors: [{ field: 'general', message: error?.message || 'Unknown error' }],
        environmentInfo: createEnvironmentInfo(context)
      };
    }
  },

  // Delete catalog item
  deleteCatalogItem: async (
    _: any,
    { id }: { id: string },
    context: GraphQLContext
  ) => {
    try {
      console.log(`[GraphQL Mutation] deleteCatalogItem: ${id} (${context.environmentLabel})`);

      const result = await context.catalogService.deleteCatalogItem(id);

      return {
        success: result.success,
        message: result.message,
        errors: [],
        environmentInfo: createEnvironmentInfo(context)
      };
    } catch (error: any) {
      console.error(`[GraphQL Mutation] deleteCatalogItem error:`, error);
      return {
        success: false,
        errors: [{ field: 'general', message: error?.message || 'Unknown error' }],
        environmentInfo: createEnvironmentInfo(context)
      };
    }
  },

  // Bulk create catalog items
  bulkCreateCatalogItems: async (
    _: any,
    { input }: { input: { items: any[] } },
    context: GraphQLContext
  ) => {
    try {
      console.log(`[GraphQL Mutation] bulkCreateCatalogItems: ${input.items.length} items (${context.environmentLabel})`);

      // Validate bulk operation limits
      const bulkValidation = context.validationService.validateBulkOperationLimits(
        input.items.length,
        'create'
      );

      if (!bulkValidation.is_valid) {
        return {
          success: false,
          message: 'Bulk operation limit exceeded',
          data: {
            totalRequested: input.items.length,
            totalSuccessful: 0,
            totalFailed: input.items.length,
            successful: [],
            failed: input.items.map((item, index) => ({
              index,
              id: '',
              name: item.name,
              errors: bulkValidation.errors
            }))
          },
          environmentInfo: createEnvironmentInfo(context)
        };
      }

      const successful: any[] = [];
      const failed: any[] = [];

      // Process each item
      for (let i = 0; i < input.items.length; i++) {
        try {
          const item = input.items[i];
          const convertedInput = convertGraphQLEnums(item);
          
          const createRequest: CreateCatalogItemRequest = {
            ...convertedInput,
            is_live: context.isLive
          };

          const validation = await context.validationService.validateCreateRequest(createRequest);
          if (!validation.is_valid) {
            failed.push({
              index: i,
              id: '',
              name: item.name,
              errors: validation.errors
            });
            continue;
          }

          const result = await context.catalogService.createCatalogItem(createRequest);
          
          if (result.success) {
            successful.push({
              index: i,
              id: result.data?.id || '',
              name: item.name
            });
          } else {
            failed.push({
              index: i,
              id: '',
              name: item.name,
              errors: [{ field: 'general', message: result.error || 'Unknown error' }]
            });
          }
        } catch (error: any) {
          failed.push({
            index: i,
            id: '',
            name: input.items[i].name,
            errors: [{ field: 'general', message: error.message }]
          });
        }
      }

      return {
        success: true,
        message: `Bulk operation completed: ${successful.length} created, ${failed.length} failed`,
        data: {
          totalRequested: input.items.length,
          totalSuccessful: successful.length,
          totalFailed: failed.length,
          successful,
          failed
        },
        environmentInfo: createEnvironmentInfo(context)
      };
    } catch (error: any) {
      console.error(`[GraphQL Mutation] bulkCreateCatalogItems error:`, error);
      return {
        success: false,
        message: 'Bulk operation failed',
        data: {
          totalRequested: input.items.length,
          totalSuccessful: 0,
          totalFailed: input.items.length,
          successful: [],
          failed: []
        },
        environmentInfo: createEnvironmentInfo(context)
      };
    }
  },

  // Bulk update catalog items
  bulkUpdateCatalogItems: async (
    _: any,
    { input }: { input: { updates: Array<{ id: string; data: any }> } },
    context: GraphQLContext
  ) => {
    try {
      console.log(`[GraphQL Mutation] bulkUpdateCatalogItems: ${input.updates.length} items (${context.environmentLabel})`);

      const bulkValidation = context.validationService.validateBulkOperationLimits(
        input.updates.length,
        'update'
      );

      if (!bulkValidation.is_valid) {
        return {
          success: false,
          message: 'Bulk operation limit exceeded',
          data: {
            totalRequested: input.updates.length,
            totalSuccessful: 0,
            totalFailed: input.updates.length,
            successful: [],
            failed: input.updates.map((update, index) => ({
              index,
              id: update.id,
              name: '',
              errors: bulkValidation.errors
            }))
          },
          environmentInfo: createEnvironmentInfo(context)
        };
      }

      const successful: any[] = [];
      const failed: any[] = [];

      for (let i = 0; i < input.updates.length; i++) {
        try {
          const update = input.updates[i];
          const convertedInput = convertGraphQLEnums(update.data);

          // Get current item
          const currentResult = await context.catalogService.getCatalogItemById(update.id);
          if (!currentResult.success || !currentResult.data) {
            failed.push({
              index: i,
              id: update.id,
              name: '',
              errors: [{ field: 'id', message: 'Item not found' }]
            });
            continue;
          }

          const validation = await context.validationService.validateUpdateRequest(
            currentResult.data,
            convertedInput
          );
          
          if (!validation.is_valid) {
            failed.push({
              index: i,
              id: update.id,
              name: currentResult.data.name,
              errors: validation.errors
            });
            continue;
          }

          const result = await context.catalogService.updateCatalogItem(update.id, convertedInput);
          
          if (result.success) {
            successful.push({
              index: i,
              id: update.id,
              name: currentResult.data.name
            });
          } else {
            failed.push({
              index: i,
              id: update.id,
              name: currentResult.data.name,
              errors: [{ field: 'general', message: result.error || 'Unknown error' }]
            });
          }
        } catch (error: any) {
          failed.push({
            index: i,
            id: input.updates[i].id,
            name: '',
            errors: [{ field: 'general', message: error.message }]
          });
        }
      }

      return {
        success: true,
        message: `Bulk operation completed: ${successful.length} updated, ${failed.length} failed`,
        data: {
          totalRequested: input.updates.length,
          totalSuccessful: successful.length,
          totalFailed: failed.length,
          successful,
          failed
        },
        environmentInfo: createEnvironmentInfo(context)
      };
    } catch (error: any) {
      console.error(`[GraphQL Mutation] bulkUpdateCatalogItems error:`, error);
      return {
        success: false,
        message: 'Bulk operation failed',
        data: {
          totalRequested: input.updates.length,
          totalSuccessful: 0,
          totalFailed: input.updates.length,
          successful: [],
          failed: []
        },
        environmentInfo: createEnvironmentInfo(context)
      };
    }
  },

  // Bulk delete catalog items
  bulkDeleteCatalogItems: async (
    _: any,
    { input }: { input: { ids: string[] } },
    context: GraphQLContext
  ) => {
    try {
      console.log(`[GraphQL Mutation] bulkDeleteCatalogItems: ${input.ids.length} items (${context.environmentLabel})`);

      const bulkValidation = context.validationService.validateBulkOperationLimits(
        input.ids.length,
        'delete'
      );

      if (!bulkValidation.is_valid) {
        return {
          success: false,
          message: 'Bulk operation limit exceeded',
          data: {
            totalRequested: input.ids.length,
            totalSuccessful: 0,
            totalFailed: input.ids.length,
            successful: [],
            failed: input.ids.map((id, index) => ({
              index,
              id,
              name: '',
              errors: bulkValidation.errors
            }))
          },
          environmentInfo: createEnvironmentInfo(context)
        };
      }

      const successful: any[] = [];
      const failed: any[] = [];

      for (let i = 0; i < input.ids.length; i++) {
        try {
          const id = input.ids[i];

          // Get current item to get name
          const currentResult = await context.catalogService.getCatalogItemById(id);
          const itemName = currentResult.data?.name || '';

          const result = await context.catalogService.deleteCatalogItem(id);
          
          if (result.success) {
            successful.push({
              index: i,
              id,
              name: itemName
            });
          } else {
            failed.push({
              index: i,
              id,
              name: itemName,
              errors: [{ field: 'general', message: result.error || 'Unknown error' }]
            });
          }
        } catch (error: any) {
          failed.push({
            index: i,
            id: input.ids[i],
            name: '',
            errors: [{ field: 'general', message: error.message }]
          });
        }
      }

      return {
        success: true,
        message: `Bulk operation completed: ${successful.length} deleted, ${failed.length} failed`,
        data: {
          totalRequested: input.ids.length,
          totalSuccessful: successful.length,
          totalFailed: failed.length,
          successful,
          failed
        },
        environmentInfo: createEnvironmentInfo(context)
      };
    } catch (error: any) {
      console.error(`[GraphQL Mutation] bulkDeleteCatalogItems error:`, error);
      return {
        success: false,
        message: 'Bulk operation failed',
        data: {
          totalRequested: input.ids.length,
          totalSuccessful: 0,
          totalFailed: input.ids.length,
          successful: [],
          failed: []
        },
        environmentInfo: createEnvironmentInfo(context)
      };
    }
  }
};

// =================================================================
// FIELD RESOLVERS
// =================================================================

const catalogFieldResolvers = {
  CatalogItem: {
    // Resolve linked resources
    linkedResources: async (parent: any, _: any, context: GraphQLContext) => {
      if (parent.linked_resources) {
        return parent.linked_resources;
      }
      
      // Lazy load if not included
      try {
        const result = await context.catalogService.getCatalogItemById(parent.id);
        return result.data?.linked_resources || [];
      } catch (error) {
        console.error('[Field Resolver] linkedResources error:', error);
        return [];
      }
    },

    // Resolve industry information
    industry: async (parent: any, _: any, context: GraphQLContext) => {
      if (parent.industry_id) {
        return {
          id: parent.industry_id,
          name: parent.industry_name || null,
          icon: parent.industry_icon || null
        };
      }
      return null;
    },

    // Resolve category information
    category: async (parent: any, _: any, context: GraphQLContext) => {
      if (parent.category_id) {
        return {
          id: parent.category_id,
          name: parent.category_name || null,
          icon: parent.category_icon || null
        };
      }
      return null;
    },

    // Resolve parent catalog item
    parent: async (parent: any, _: any, context: GraphQLContext) => {
      if (parent.parent_id) {
        try {
          const result = await context.catalogService.getCatalogItemById(parent.parent_id);
          return result.data || null;
        } catch (error) {
          return null;
        }
      }
      return null;
    },

    // Resolve children catalog items
    children: async (parent: any, _: any, context: GraphQLContext) => {
      try {
        const query: CatalogItemQuery = {
          filters: {
            parent_id: parent.id,
            is_live: context.isLive
          },
          pagination: { page: 1, limit: 50 }
        };
        
        const result = await context.catalogService.queryCatalogItems(query);
        return result.data || [];
      } catch (error) {
        return [];
      }
    }
  },

  Resource: {
    // Resolve contact for team_staff resources
    contact: async (parent: any, _: any, context: GraphQLContext) => {
      if (parent.contact_id) {
        try {
          const result = await context.catalogService.getResourceDetails(parent.id);
          return result.contact_info ? {
            ...result.contact_info,
            displayName: result.contact_info.name,
            primaryEmail: result.contact_info.email,
            primaryPhone: result.contact_info.phone,
            classifications: result.contact_info.classifications || []
          } : null;
        } catch (error) {
          return null;
        }
      }
      return null;
    },

    // Resolve pricing for resource
    pricing: async (parent: any, _: any, context: GraphQLContext) => {
      try {
        const result = await context.catalogService.getResourceDetails(parent.id);
        return result.pricing || [];
      } catch (error) {
        return [];
      }
    },

    // Resolve linked services
    linkedServices: async (parent: any, _: any, context: GraphQLContext) => {
      try {
        const result = await context.catalogService.getResourceDetails(parent.id);
        return result.linked_services || [];
      } catch (error) {
        return [];
      }
    }
  }
};

// =================================================================
// EXPORT COMBINED RESOLVERS
// =================================================================

export const catalogResolvers = {
  Query: catalogQueries,
  Mutation: catalogMutations,
  ...catalogFieldResolvers
};