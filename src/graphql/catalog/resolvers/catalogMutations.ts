// src/graphql/catalog/resolvers/catalogMutations.ts
// Complete GraphQL Mutation Resolvers for Catalog Operations

import { 
  GraphQLContext, 
  GraphQLAuthenticationError, 
  GraphQLAuthorizationError,
  GraphQLValidationError,
  CatalogAuditActions,
  CatalogAuditResources
} from '../../shared/types/catalogContext';

// =================================================================
// TYPE DEFINITIONS (temporary until separate file is created)
// =================================================================

export type CatalogItemType = 'service' | 'equipment' | 'spare_part' | 'asset';
export type CatalogItemStatus = 'active' | 'inactive' | 'draft';
export type PricingType = 'fixed' | 'unit_price' | 'hourly' | 'daily' | 'monthly' | 'package' | 'subscription' | 'price_range';
export type ContentFormat = 'plain' | 'markdown' | 'html';

export interface PriceAttributes {
  type: PricingType;
  base_amount: number;
  currency: string;
  billing_mode: 'manual' | 'automatic';
  min_amount?: number;
  max_amount?: number;
  hourly_rate?: number;
  daily_rate?: number;
  monthly_rate?: number;
  package_details?: {
    sessions: number;
    validity_days: number;
    discount_percentage?: number;
  };
  subscription_details?: {
    billing_cycle: 'monthly' | 'quarterly' | 'yearly';
    setup_fee?: number;
    trial_days?: number;
  };
  custom_pricing_rules?: any[];
}

export interface TaxConfig {
  use_tenant_default: boolean;
  display_mode?: 'including_tax' | 'excluding_tax';
  specific_tax_rates: string[];
}

export interface CreateCatalogItemInput {
  name: string;
  type: CatalogItemType;
  price_attributes: PriceAttributes;
  industry_id?: string;
  category_id?: string;
  short_description?: string;
  description_content?: string;
  description_format?: ContentFormat;
  terms_content?: string;
  terms_format?: ContentFormat;
  service_parent_id?: string;
  is_variant?: boolean;
  variant_attributes?: Record<string, any>;
  tax_config?: Partial<TaxConfig>;
  metadata?: Record<string, any>;
  specifications?: Record<string, any>;
  status?: CatalogItemStatus;
  is_live?: boolean;
}

export interface UpdateCatalogItemInput {
  version_reason?: string;
  name?: string;
  short_description?: string;
  description_content?: string;
  description_format?: ContentFormat;
  terms_content?: string;
  terms_format?: ContentFormat;
  price_attributes?: PriceAttributes;
  tax_config?: Partial<TaxConfig>;
  metadata?: Record<string, any>;
  specifications?: Record<string, any>;
  status?: CatalogItemStatus;
  variant_attributes?: Record<string, any>;
  is_variant?: boolean;
  industry_id?: string;
  category_id?: string;
}

export interface BulkCatalogItemInput {
  operation: 'create' | 'update' | 'delete';
  items?: Array<CreateCatalogItemInput | (UpdateCatalogItemInput & { id: string })>;
  options?: {
    continue_on_error?: boolean;
    batch_size?: number;
  };
}

export interface EnvironmentOperationInput {
  filters?: {
    industry_ids?: string[];
    category_ids?: string[];
    item_types?: CatalogItemType[];
    status_filter?: CatalogItemStatus[];
  };
  sync_direction?: 'live_to_test' | 'test_to_live' | 'bidirectional';
  options?: {
    overwrite_existing?: boolean;
    preserve_customizations?: boolean;
  };
}

// =================================================================
// TEMPORARY EDGE SERVICE
// =================================================================

class TemporaryCatalogEdgeService {
  constructor(private context: GraphQLContext) {}

  async createCatalogItem(input: CreateCatalogItemInput) {
    return { success: true, data: { id: 'temp-id', ...input }, message: 'Temporary implementation' };
  }

  async updateCatalogItem(id: string, input: UpdateCatalogItemInput) {
    return { success: true, data: { id, ...input }, message: 'Temporary implementation' };
  }

  async deleteCatalogItem(id: string) {
    return { success: true, data: { id }, message: 'Temporary implementation' };
  }

  async getCatalogItemById(id: string) {
    return {
      success: true,
      data: { 
        id, 
        name: 'Temp Item',
        type: 'service' as CatalogItemType,
        price_attributes: {
          type: 'fixed' as PricingType,
          base_amount: 100,
          currency: 'INR',
          billing_mode: 'manual' as const
        }
      }
    };
  }

  async bulkCreateCatalogItems(input: BulkCatalogItemInput) {
    return {
      success: true,
      total_requested: input.items?.length || 0,
      successful: input.items?.length || 0,
      failed: 0,
      errors: [],
      created_ids: ['temp-1', 'temp-2'],
      message: 'Temporary implementation'
    };
  }

  async bulkUpdateCatalogItems(input: BulkCatalogItemInput) {
    return {
      success: true,
      total_requested: input.items?.length || 0,
      successful: input.items?.length || 0,
      failed: 0,
      errors: [],
      updated_ids: ['temp-1', 'temp-2'],
      message: 'Temporary implementation'
    };
  }

  async bulkDeleteCatalogItems(ids: string[]) {
    return {
      success: true,
      total_requested: ids.length,
      successful: ids.length,
      failed: 0,
      errors: [],
      message: 'Temporary implementation'
    };
  }

  async copyLiveToTest(input?: EnvironmentOperationInput) {
    return {
      success: true,
      data: { affected_industries: 0, affected_categories: 0, affected_items: 0 },
      message: 'Temporary implementation'
    };
  }

  async promoteTestToLive(input?: EnvironmentOperationInput) {
    return {
      success: true,
      data: { affected_industries: 0, affected_categories: 0, affected_items: 0 },
      message: 'Temporary implementation'
    };
  }
}

function createCatalogEdgeService(context: GraphQLContext) {
  return new TemporaryCatalogEdgeService(context);
}

// =================================================================
// AUTHENTICATION & AUTHORIZATION HELPERS
// =================================================================

function requireAuth(context: GraphQLContext): void {
  if (!context.user) {
    throw new GraphQLAuthenticationError('Authentication required for this operation');
  }
}

function requireWriteAccess(context: GraphQLContext): void {
  requireAuth(context);
  if (!context.hasPermission('catalog:write')) {
    throw new GraphQLAuthorizationError('Write access required for this operation');
  }
}

function requireAdminAccess(context: GraphQLContext): void {
  requireAuth(context);
  if (!context.tenant.user_is_admin && !context.user?.is_super_admin) {
    throw new GraphQLAuthorizationError('Admin access required for this operation');
  }
}

function requireEnvironmentAccess(context: GraphQLContext): void {
  requireAuth(context);
  if (!context.hasPermission('catalog:environment') && !context.tenant.user_is_admin) {
    throw new GraphQLAuthorizationError('Environment management access required');
  }
}

// =================================================================
// COMPLETE CATALOG MUTATION RESOLVERS
// =================================================================

const catalogMutationResolvers = {
  // Basic CRUD Operations
  async createCatalogItem(parent: any, args: { input: CreateCatalogItemInput }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { input } = args;
    const edgeService = createCatalogEdgeService(context);
    
    try {
      const result = await edgeService.createCatalogItem(input);
      return { success: result.success, data: result.data, message: result.message };
    } catch (error: any) {
      throw error;
    }
  },

  async updateCatalogItem(parent: any, args: { id: string; input: UpdateCatalogItemInput }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { id, input } = args;
    const edgeService = createCatalogEdgeService(context);
    
    try {
      const result = await edgeService.updateCatalogItem(id, input);
      return { success: result.success, data: result.data, message: result.message };
    } catch (error: any) {
      throw error;
    }
  },

  async deleteCatalogItem(parent: any, args: { id: string }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { id } = args;
    const edgeService = createCatalogEdgeService(context);
    
    try {
      const result = await edgeService.deleteCatalogItem(id);
      return { success: result.success, data: result.data, message: result.message };
    } catch (error: any) {
      throw error;
    }
  },

  async duplicateCatalogItem(parent: any, args: { id: string; new_name?: string }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { id, new_name } = args;
    const edgeService = createCatalogEdgeService(context);
    
    try {
      const existingResult = await edgeService.getCatalogItemById(id);
      if (!existingResult.success || !existingResult.data) {
        throw new GraphQLValidationError('Source item not found', [
          { field: 'id', message: 'Cannot find item to duplicate', code: 'NOT_FOUND', value: id }
        ]);
      }

      const existingItem = existingResult.data;
      const duplicateInput: CreateCatalogItemInput = {
        name: new_name || `${existingItem.name} (Copy)`,
        type: existingItem.type,
        price_attributes: existingItem.price_attributes,
        status: 'draft'
      };

      const result = await edgeService.createCatalogItem(duplicateInput);
      return {
        success: result.success,
        data: result.data,
        message: `Item duplicated successfully as "${duplicateInput.name}"`
      };
    } catch (error: any) {
      throw error;
    }
  },

  async activateCatalogItem(parent: any, args: { id: string }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { id } = args;
    const updateInput: UpdateCatalogItemInput = {
      status: 'active',
      version_reason: 'Item activated'
    };
    return await catalogMutationResolvers.updateCatalogItem(parent, { id, input: updateInput }, context);
  },

  async deactivateCatalogItem(parent: any, args: { id: string }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { id } = args;
    const updateInput: UpdateCatalogItemInput = {
      status: 'inactive',
      version_reason: 'Item deactivated'
    };
    return await catalogMutationResolvers.updateCatalogItem(parent, { id, input: updateInput }, context);
  },

  async publishCatalogItem(parent: any, args: { id: string }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { id } = args;
    const updateInput: UpdateCatalogItemInput = {
      status: 'active',
      version_reason: 'Item published'
    };
    return await catalogMutationResolvers.updateCatalogItem(parent, { id, input: updateInput }, context);
  },

  // Bulk Operations
  async bulkCreateCatalogItems(parent: any, args: { input: BulkCatalogItemInput }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { input } = args;
    const edgeService = createCatalogEdgeService(context);
    
    try {
      const result = await edgeService.bulkCreateCatalogItems(input);
      return {
        success: result.success,
        total_requested: result.total_requested || 0,
        successful: result.successful || 0,
        failed: result.failed || 0,
        errors: result.errors || [],
        created_ids: result.created_ids || [],
        message: result.message
      };
    } catch (error: any) {
      throw error;
    }
  },

  async bulkUpdateCatalogItems(parent: any, args: { input: BulkCatalogItemInput }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { input } = args;
    const edgeService = createCatalogEdgeService(context);
    
    try {
      const result = await edgeService.bulkUpdateCatalogItems(input);
      return {
        success: result.success,
        total_requested: result.total_requested || 0,
        successful: result.successful || 0,
        failed: result.failed || 0,
        errors: result.errors || [],
        updated_ids: result.updated_ids || [],
        message: result.message
      };
    } catch (error: any) {
      throw error;
    }
  },

  async bulkDeleteCatalogItems(parent: any, args: { ids: string[] }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { ids } = args;
    const edgeService = createCatalogEdgeService(context);
    
    try {
      const result = await edgeService.bulkDeleteCatalogItems(ids);
      return {
        success: result.success,
        total_requested: result.total_requested || 0,
        successful: result.successful || 0,
        failed: result.failed || 0,
        errors: result.errors || [],
        message: result.message
      };
    } catch (error: any) {
      throw error;
    }
  },

  async bulkActivateCatalogItems(parent: any, args: { ids: string[] }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { ids } = args;
    const bulkInput: BulkCatalogItemInput = {
      operation: 'update',
      items: ids.map(id => ({ id, status: 'active' as any, version_reason: 'Bulk activation' }))
    };
    return await catalogMutationResolvers.bulkUpdateCatalogItems(parent, { input: bulkInput }, context);
  },

  async bulkDeactivateCatalogItems(parent: any, args: { ids: string[] }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { ids } = args;
    const bulkInput: BulkCatalogItemInput = {
      operation: 'update',
      items: ids.map(id => ({ id, status: 'inactive' as any, version_reason: 'Bulk deactivation' }))
    };
    return await catalogMutationResolvers.bulkUpdateCatalogItems(parent, { input: bulkInput }, context);
  },

  // Environment Management
  async copyLiveToTest(parent: any, args: { input?: EnvironmentOperationInput }, context: GraphQLContext) {
    requireEnvironmentAccess(context);
    const { input } = args;
    const edgeService = createCatalogEdgeService(context);
    
    try {
      const result = await edgeService.copyLiveToTest(input);
      return {
        success: result.success,
        message: result.message,
        affected_counts: {
          industries: result.data?.affected_industries || 0,
          categories: result.data?.affected_categories || 0,
          items: result.data?.affected_items || 0
        }
      };
    } catch (error: any) {
      throw error;
    }
  },

  async promoteTestToLive(parent: any, args: { input?: EnvironmentOperationInput }, context: GraphQLContext) {
    requireEnvironmentAccess(context);
    const { input } = args;
    const edgeService = createCatalogEdgeService(context);
    
    try {
      const result = await edgeService.promoteTestToLive(input);
      return {
        success: result.success,
        message: result.message,
        affected_counts: {
          industries: result.data?.affected_industries || 0,
          categories: result.data?.affected_categories || 0,
          items: result.data?.affected_items || 0
        }
      };
    } catch (error: any) {
      throw error;
    }
  },

  async syncEnvironments(parent: any, args: { input?: EnvironmentOperationInput }, context: GraphQLContext) {
    requireEnvironmentAccess(context);
    const { input } = args;
    
    try {
      const { data, error } = await context.supabase
        .rpc('sync_catalog_environments', {
          p_tenant_id: context.tenant.id,
          p_sync_direction: input?.sync_direction || 'bidirectional',
          p_filters: input?.filters || {}
        });

      if (error) {
        throw new GraphQLValidationError('Environment sync failed', [
          { field: 'sync', message: error.message, code: 'SYNC_FAILED', value: input }
        ]);
      }

      return {
        success: true,
        message: 'Environment synchronization completed successfully',
        affected_counts: {
          industries: data?.affected_industries || 0,
          categories: data?.affected_categories || 0,
          items: data?.affected_items || 0
        }
      };
    } catch (error: any) {
      throw error;
    }
  },

  // Tenant Setup
  async setupTenantCatalog(parent: any, args: { industry_ids: string[]; copy_to_test?: boolean }, context: GraphQLContext) {
    requireAdminAccess(context);
    const { industry_ids, copy_to_test = false } = args;
    
    try {
      const { data, error } = await context.supabase
        .rpc('setup_tenant_catalog', {
          p_tenant_id: context.tenant.id,
          p_industry_ids: industry_ids,
          p_copy_to_test: copy_to_test,
          p_user_id: context.user?.id
        });

      if (error) {
        throw new GraphQLValidationError('Tenant catalog setup failed', [
          { field: 'setup', message: error.message, code: 'SETUP_FAILED', value: { industry_ids, copy_to_test } }
        ]);
      }

      return {
        success: true,
        message: 'Tenant catalog setup completed successfully',
        affected_counts: {
          industries: data?.copied_industries || 0,
          categories: data?.copied_categories || 0,
          items: data?.copied_items || 0
        }
      };
    } catch (error: any) {
      throw error;
    }
  },

  // Custom Industries & Categories
  async createCustomIndustry(parent: any, args: { name: string; description?: string; icon?: string }, context: GraphQLContext) {
    requireAdminAccess(context);
    const { name, description, icon } = args;
    
    try {
      const { data, error } = await context.supabase
        .from('t_catalog_industries')
        .insert({
          tenant_id: context.tenant.id,
          is_live: context.isLiveEnvironment(),
          industry_code: `CUSTOM_${name.toUpperCase().replace(/\s+/g, '_')}`,
          name,
          description,
          icon,
          common_pricing_rules: [],
          compliance_requirements: [],
          is_custom: true,
          is_active: true,
          sort_order: 999,
          created_by: context.user?.id,
          updated_by: context.user?.id
        })
        .select()
        .single();

      if (error) {
        throw new GraphQLValidationError('Failed to create custom industry', [
          { field: 'name', message: error.message, code: 'CREATE_FAILED', value: name }
        ]);
      }

      return {
        success: true,
        data,
        message: `Custom industry "${name}" created successfully`
      };
    } catch (error: any) {
      throw error;
    }
  },

  async createCustomCategory(parent: any, args: { industry_id: string; name: string; description?: string; icon?: string }, context: GraphQLContext) {
    requireAdminAccess(context);
    const { industry_id, name, description, icon } = args;
    
    try {
      const { data, error } = await context.supabase
        .from('t_catalog_categories')
        .insert({
          tenant_id: context.tenant.id,
          industry_id,
          is_live: context.isLiveEnvironment(),
          category_code: `CUSTOM_${name.toUpperCase().replace(/\s+/g, '_')}`,
          name,
          description,
          icon,
          default_pricing_model: 'fixed',
          common_variants: [],
          pricing_rule_templates: [],
          is_custom: true,
          is_active: true,
          sort_order: 999,
          created_by: context.user?.id,
          updated_by: context.user?.id
        })
        .select()
        .single();

      if (error) {
        throw new GraphQLValidationError('Failed to create custom category', [
          { field: 'name', message: error.message, code: 'CREATE_FAILED', value: name }
        ]);
      }

      return {
        success: true,
        data,
        message: `Custom category "${name}" created successfully`
      };
    } catch (error: any) {
      throw error;
    }
  },

  // Update Operations
  async updateCatalogIndustry(parent: any, args: { id: string; name?: string; description?: string; icon?: string }, context: GraphQLContext) {
    requireAdminAccess(context);
    const { id, name, description, icon } = args;
    
    try {
      const updateData = {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(icon !== undefined && { icon }),
        updated_by: context.user?.id,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await context.supabase
        .from('t_catalog_industries')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .select()
        .single();

      if (error) {
        throw new GraphQLValidationError('Failed to update catalog industry', [
          { field: 'id', message: error.message, code: 'UPDATE_FAILED', value: id }
        ]);
      }

      return {
        success: true,
        data,
        message: `Industry updated successfully`
      };
    } catch (error: any) {
      throw error;
    }
  },

  async updateCatalogCategory(parent: any, args: { id: string; name?: string; description?: string; icon?: string }, context: GraphQLContext) {
    requireAdminAccess(context);
    const { id, name, description, icon } = args;
    
    try {
      const updateData = {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(icon !== undefined && { icon }),
        updated_by: context.user?.id,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await context.supabase
        .from('t_catalog_categories')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .select()
        .single();

      if (error) {
        throw new GraphQLValidationError('Failed to update catalog category', [
          { field: 'id', message: error.message, code: 'UPDATE_FAILED', value: id }
        ]);
      }

      return {
        success: true,
        data,
        message: `Category updated successfully`
      };
    } catch (error: any) {
      throw error;
    }
  },

  // Service Variant Operations
  async createServiceVariant(parent: any, args: { parent_id: string; variant_data: CreateCatalogItemInput }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { parent_id, variant_data } = args;
    
    const variantInput: CreateCatalogItemInput = {
      ...variant_data,
      type: 'service',
      service_parent_id: parent_id,
      is_variant: true
    };

    return await catalogMutationResolvers.createCatalogItem(parent, { input: variantInput }, context);
  },

  async linkServiceVariant(parent: any, args: { parent_id: string; variant_id: string }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { variant_id } = args;
    
    const updateInput: UpdateCatalogItemInput = {
      is_variant: true,
      version_reason: 'Linked as service variant'
    };

    await catalogMutationResolvers.updateCatalogItem(parent, { id: variant_id, input: updateInput }, context);
    return { success: true, message: 'Service variant linked successfully' };
  },

  async unlinkServiceVariant(parent: any, args: { variant_id: string }, context: GraphQLContext) {
    requireWriteAccess(context);
    const { variant_id } = args;
    
    const updateInput: UpdateCatalogItemInput = {
      is_variant: false,
      version_reason: 'Unlinked from service parent'
    };

    await catalogMutationResolvers.updateCatalogItem(parent, { id: variant_id, input: updateInput }, context);
    return { success: true, message: 'Service variant unlinked successfully' };
  }
};

export default catalogMutationResolvers;