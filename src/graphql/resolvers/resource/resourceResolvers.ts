// src/graphql/resolvers/resource/resourceResolvers.ts
// ✅ PRODUCTION: Complete GraphQL resolvers for [resource]

import {
  ResourceServiceConfig,
  CreateResourceRequest,
  UpdateResourceRequest,
  ResourceQuery,
  ResourceError,
  ResourceNotFoundError,
  ResourceValidationError,
  ResourceType,
  ResourceStatus
} from '../../../types/resource';
import { ResourceService } from '../../../services/resourceService';
import { ResourceValidator } from '../../../validators/resourceValidator';

interface GraphQLContext {
  tenantId: string;
  userId: string;
  userJWT: string;
  isLive: boolean;
  environmentLabel: string;
  resourceService: ResourceService;
  resourceValidator: ResourceValidator;
  req: any;
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

function convertGraphQLEnumsToString(input: any): any {
  if (typeof input === 'object' && input !== null) {
    const converted = { ...input };
    
    // Convert enum values to lowercase strings
    if (converted.resourceTypeId) {
      converted.resource_type_id = converted.resourceTypeId.toLowerCase();
      delete converted.resourceTypeId;
    }
    
    if (converted.status) {
      converted.status = converted.status.toLowerCase();
    }
    
    // Convert field names
    if (converted.displayName) {
      converted.display_name = converted.displayName;
      delete converted.displayName;
    }
    
    if (converted.hexcolor !== undefined) {
      converted.hexcolor = converted.hexcolor;
    }
    
    if (converted.iconName !== undefined) {
      converted.icon_name = converted.iconName;
      delete converted.iconName;
    }
    
    if (converted.sequenceNo !== undefined) {
      converted.sequence_no = converted.sequenceNo;
      delete converted.sequenceNo;
    }
    
    if (converted.contactId !== undefined) {
      converted.contact_id = converted.contactId;
      delete converted.contactId;
    }
    
    if (converted.formSettings !== undefined) {
      converted.form_settings = converted.formSettings;
      delete converted.formSettings;
    }
    
    if (converted.isActive !== undefined) {
      converted.is_active = converted.isActive;
      delete converted.isActive;
    }
    
    if (converted.isDeletable !== undefined) {
      converted.is_deletable = converted.isDeletable;
      delete converted.isDeletable;
    }
    
    return converted;
  }
  return input;
}

function convertGraphQLEnumsArray(array: any[]): any[] {
  return array.map(item => {
    if (typeof item === 'string') {
      return item.toLowerCase();
    }
    return convertGraphQLEnumsToString(item);
  });
}

function createServiceConfig(context: GraphQLContext): ResourceServiceConfig {
  return {
    tenant_id: context.tenantId,
    user_id: context.userId,
    is_live: context.isLive // ✅ CRITICAL: Environment segregation
  };
}

// ===================================================================
// GRAPHQL RESOLVERS
// ===================================================================

export const resourceResolvers = {
  Query: {
    catalogResource: async (parent: any, args: { id: string }, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        
        const result = await resourceService.getResourceById(args.id);
        return result;
      } catch (error: any) {
        if (error instanceof ResourceNotFoundError) {
          return {
            success: false,
            data: null,
            errors: [{ field: 'id', message: error.message }]
          };
        }
        
        console.error('Error in catalogResource query:', error);
        throw new ResourceError(`Failed to get resource: ${error.message}`, 'GET_ERROR');
      }
    },

    catalogResources: async (parent: any, args: { query?: ResourceQuery }, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        
        // Convert GraphQL enums and field names
        let processedQuery: ResourceQuery = {};
        
        if (args.query) {
          processedQuery = { ...args.query };
          
          if (processedQuery.filters) {
            const filters = { ...processedQuery.filters };
            
            // ✅ FIXED: Convert GraphQL field names to database field names
            if ((filters as any).resourceTypeId) {
              const resourceTypeIds = Array.isArray((filters as any).resourceTypeId) 
                ? (filters as any).resourceTypeId
                : [(filters as any).resourceTypeId];
              
              filters.resource_type_id = resourceTypeIds.map((type: string) => 
                type.toLowerCase() as ResourceType
              );
              delete (filters as any).resourceTypeId;
            }
            
            if (filters.status) {
              filters.status = Array.isArray(filters.status)
                ? filters.status.map((status: string) => status.toLowerCase() as ResourceStatus)
                : [filters.status.toLowerCase() as ResourceStatus];
            }
            
            // Convert other GraphQL field names
            if ((filters as any).searchQuery !== undefined) {
              filters.search_query = (filters as any).searchQuery;
              delete (filters as any).searchQuery;
            }
            
            if ((filters as any).contactId !== undefined) {
              filters.contact_id = (filters as any).contactId;
              delete (filters as any).contactId;
            }
            
            if ((filters as any).hasContact !== undefined) {
              filters.has_contact = (filters as any).hasContact;
              delete (filters as any).hasContact;
            }
            
            if ((filters as any).createdAfter !== undefined) {
              filters.created_after = (filters as any).createdAfter;
              delete (filters as any).createdAfter;
            }
            
            if ((filters as any).createdBefore !== undefined) {
              filters.created_before = (filters as any).createdBefore;
              delete (filters as any).createdBefore;
            }
            
            if ((filters as any).isActive !== undefined) {
              filters.is_active = (filters as any).isActive;
              delete (filters as any).isActive;
            }
            
            if ((filters as any).isLive !== undefined) {
              filters.is_live = (filters as any).isLive;
              delete (filters as any).isLive;
            }
            
            processedQuery.filters = filters;
          }
          
          // ✅ FIXED: Convert sort field names from GraphQL to database format
          if (processedQuery.sort) {
            processedQuery.sort = processedQuery.sort.map(sortItem => {
              let field: string;
              
              // Convert GraphQL enum field to string for comparison
              const fieldStr = String(sortItem.field);
              
              // Map GraphQL field names to database field names
              switch (fieldStr) {
                case 'NAME':
                  field = 'name';
                  break;
                case 'DISPLAY_NAME':
                  field = 'display_name';
                  break;
                case 'CREATED_AT':
                  field = 'created_at';
                  break;
                case 'UPDATED_AT':
                  field = 'updated_at';
                  break;
                case 'SEQUENCE_NO':
                  field = 'sequence_no';
                  break;
                case 'STATUS':
                  field = 'status';
                  break;
                default:
                  // Fallback: convert to snake_case
                  field = fieldStr.toLowerCase().replace(/([A-Z])/g, '_$1').replace(/^_/, '');
              }
              
              return {
                field: field as "name" | "display_name" | "created_at" | "updated_at" | "sequence_no" | "status",
                direction: sortItem.direction
              };
            });
          }
        }
        
        const result = await resourceService.queryResources(processedQuery);
        return result;
      } catch (error: any) {
        console.error('Error in catalogResources query:', error);
        throw new ResourceError(`Failed to query resources: ${error.message}`, 'QUERY_ERROR');
      }
    },

    catalogResourcesByType: async (parent: any, args: { resourceType: string }, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        
        // ✅ FIXED: Convert enum to lowercase for database
        const resourceType = args.resourceType.toLowerCase() as ResourceType;
        
        const query: ResourceQuery = {
          filters: {
            resource_type_id: [resourceType]
          },
          sort: [{ field: 'sequence_no', direction: 'asc' }]
        };
        
        const result = await resourceService.queryResources(query);
        return result;
      } catch (error: any) {
        console.error('Error in catalogResourcesByType query:', error);
        throw new ResourceError(`Failed to get resources by type: ${error.message}`, 'QUERY_ERROR');
      }
    },

    catalogResourceTypes: async (parent: any, args: any, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        
        const result = await resourceService.getResourceTypes();
        return result;
      } catch (error: any) {
        console.error('Error in catalogResourceTypes query:', error);
        throw new ResourceError(`Failed to get resource types: ${error.message}`, 'QUERY_ERROR');
      }
    },

    nextCatalogResourceSequence: async (parent: any, args: { resourceType: string }, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        
        // ✅ FIXED: Convert enum to lowercase
        const resourceType = args.resourceType.toLowerCase() as ResourceType;
        
        // Call private method through a public interface or implement separately
        const nextSeq = await (resourceService as any).getNextSequenceNumber(resourceType);
        return nextSeq;
      } catch (error: any) {
        console.error('Error getting next sequence:', error);
        return 1; // Default fallback
      }
    }
  },

  Mutation: {
    createCatalogResource: async (parent: any, args: { input: CreateResourceRequest }, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        const resourceValidator = new ResourceValidator(resourceService, config);
        
        // Convert GraphQL input
        const processedInput = convertGraphQLEnumsToString(args.input) as CreateResourceRequest;
        
        // Validate input
        const validation = await resourceValidator.validateCreateRequest(processedInput);
        if (!validation.isValid) {
          return {
            success: false,
            data: null,
            errors: validation.errors,
            warnings: validation.warnings
          };
        }
        
        // Create resource
        const result = await resourceService.createResource(processedInput);
        
        // Add warnings if any
        if (validation.warnings && validation.warnings.length > 0) {
          return {
            ...result,
            warnings: validation.warnings
          };
        }
        
        return result;
      } catch (error: any) {
        if (error instanceof ResourceValidationError) {
          return {
            success: false,
            data: null,
            errors: [{ field: error.field || 'general', message: error.message }]
          };
        }
        
        console.error('Error in createCatalogResource mutation:', error);
        throw new ResourceError(`Failed to create resource: ${error.message}`, 'CREATE_ERROR');
      }
    },

    updateCatalogResource: async (parent: any, args: { id: string; input: UpdateResourceRequest }, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        const resourceValidator = new ResourceValidator(resourceService, config);
        
        // Get current resource
        const currentResult = await resourceService.getResourceById(args.id);
        if (!currentResult.success || !currentResult.data) {
          return {
            success: false,
            data: null,
            errors: [{ field: 'id', message: 'Resource not found' }]
          };
        }
        
        // Convert GraphQL input
        const processedInput = convertGraphQLEnumsToString(args.input) as UpdateResourceRequest;
        
        // Validate input
        const validation = await resourceValidator.validateUpdateRequest(args.id, processedInput);
        if (!validation.isValid) {
          return {
            success: false,
            data: null,
            errors: validation.errors,
            warnings: validation.warnings
          };
        }
        
        // Update resource
        const result = await resourceService.updateResource(args.id, processedInput);
        
        // Add warnings if any
        if (validation.warnings && validation.warnings.length > 0) {
          return {
            ...result,
            warnings: validation.warnings
          };
        }
        
        return result;
      } catch (error: any) {
        if (error instanceof ResourceValidationError) {
          return {
            success: false,
            data: null,
            errors: [{ field: error.field || 'general', message: error.message }]
          };
        }
        
        console.error('Error in updateCatalogResource mutation:', error);
        throw new ResourceError(`Failed to update resource: ${error.message}`, 'UPDATE_ERROR');
      }
    },

    deleteCatalogResource: async (parent: any, args: { id: string }, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        
        const result = await resourceService.deleteResource(args.id);
        return result;
      } catch (error: any) {
        if (error instanceof ResourceNotFoundError) {
          return {
            success: false,
            data: null,
            errors: [{ field: 'id', message: error.message }]
          };
        }
        
        if (error instanceof ResourceValidationError) {
          return {
            success: false,
            data: null,
            errors: [{ field: error.field || 'general', message: error.message }]
          };
        }
        
        console.error('Error in deleteCatalogResource mutation:', error);
        throw new ResourceError(`Failed to delete resource: ${error.message}`, 'DELETE_ERROR');
      }
    },

    bulkCreateCatalogResources: async (parent: any, args: { input: CreateResourceRequest[] }, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        const resourceValidator = new ResourceValidator(resourceService, config);
        
        // Convert GraphQL inputs
        const processedInputs = args.input.map(input => convertGraphQLEnumsToString(input)) as CreateResourceRequest[];
        
        // Validate all inputs individually
        const validationResults = await Promise.all(
          processedInputs.map(async (input, index) => {
            const validation = await resourceValidator.validateCreateRequest(input);
            return { validation, index };
          })
        );
        
        const failedValidations = validationResults.filter(result => !result.validation.isValid);
        if (failedValidations.length > 0) {
          const allErrors = failedValidations
            .flatMap(result => result.validation.errors.map((error: any) => ({
              field: `[${result.index}].${error.field}`,
              message: error.message
            })));
            
          return {
            success: false,
            data: null,
            errors: allErrors
          };
        }
        
        // Create all resources
        const results = [];
        const errors = [];
        
        for (let i = 0; i < processedInputs.length; i++) {
          try {
            const result = await resourceService.createResource(processedInputs[i]);
            if (result.success && result.data) {
              results.push(result.data);
            } else {
              errors.push({ field: `[${i}]`, message: result.message || 'Failed to create resource' });
            }
          } catch (error: any) {
            errors.push({ field: `[${i}]`, message: error.message });
          }
        }
        
        return {
          success: errors.length === 0,
          data: results,
          errors: errors.length > 0 ? errors : undefined,
          message: `Created ${results.length} resources${errors.length > 0 ? `, ${errors.length} failed` : ''}`
        };
      } catch (error: any) {
        console.error('Error in bulkCreateCatalogResources mutation:', error);
        throw new ResourceError(`Failed to bulk create resources: ${error.message}`, 'BULK_CREATE_ERROR');
      }
    },

    bulkUpdateCatalogResources: async (parent: any, args: { updates: Array<{ id: string; input: UpdateResourceRequest }> }, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        
        const results = [];
        const errors = [];
        
        for (let i = 0; i < args.updates.length; i++) {
          try {
            const update = args.updates[i];
            const processedInput = convertGraphQLEnumsToString(update.input) as UpdateResourceRequest;
            
            const result = await resourceService.updateResource(update.id, processedInput);
            if (result.success && result.data) {
              results.push(result.data);
            } else {
              errors.push({ field: `[${i}]`, message: result.message || 'Failed to update resource' });
            }
          } catch (error: any) {
            errors.push({ field: `[${i}]`, message: error.message });
          }
        }
        
        return {
          success: errors.length === 0,
          data: results,
          errors: errors.length > 0 ? errors : undefined,
          message: `Updated ${results.length} resources${errors.length > 0 ? `, ${errors.length} failed` : ''}`
        };
      } catch (error: any) {
        console.error('Error in bulkUpdateCatalogResources mutation:', error);
        throw new ResourceError(`Failed to bulk update resources: ${error.message}`, 'BULK_UPDATE_ERROR');
      }
    },

    bulkDeleteCatalogResources: async (parent: any, args: { ids: string[] }, context: GraphQLContext) => {
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        
        let successCount = 0;
        const errors = [];
        
        for (let i = 0; i < args.ids.length; i++) {
          try {
            const result = await resourceService.deleteResource(args.ids[i]);
            if (result.success) {
              successCount++;
            } else {
              errors.push({ field: `[${i}]`, message: result.message || 'Failed to delete resource' });
            }
          } catch (error: any) {
            errors.push({ field: `[${i}]`, message: error.message });
          }
        }
        
        return {
          success: errors.length === 0,
          data: null,
          errors: errors.length > 0 ? errors : undefined,
          message: `Deleted ${successCount} resources${errors.length > 0 ? `, ${errors.length} failed` : ''}`
        };
      } catch (error: any) {
        console.error('Error in bulkDeleteCatalogResources mutation:', error);
        throw new ResourceError(`Failed to bulk delete resources: ${error.message}`, 'BULK_DELETE_ERROR');
      }
    }
  },

  // Field resolvers
  CatalogResource: {
    contact: async (parent: any, args: any, context: GraphQLContext) => {
      // Contact data should already be loaded via join in the service layer
      return parent.contact || null;
    },
    
    resourceType: async (parent: any, args: any, context: GraphQLContext) => {
      // This could be loaded via join or fetched separately if needed
      if (parent.resource_type) {
        return parent.resource_type;
      }
      
      // Fallback: fetch resource type separately
      try {
        const config = createServiceConfig(context);
        const resourceService = new ResourceService(config);
        const typesResult = await resourceService.getResourceTypes();
        
        if (typesResult.success && typesResult.data) {
          return typesResult.data.find(type => type.id === parent.resource_type_id) || null;
        }
      } catch (error) {
        console.error('Error loading resource type:', error);
      }
      
      return null;
    }
  }
};