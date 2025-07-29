// src/graphql/catalog/resolvers/index.ts
// Main catalog resolver exports and field resolvers
// Combines query and mutation resolvers with field-level resolvers

import { GraphQLContext } from '../../shared/types/catalogContext';
import catalogQueryResolvers from './catalogQueries';
import catalogMutationResolvers from './catalogMutations';

// =================================================================
// FIELD RESOLVERS
// =================================================================

/**
 * CatalogItem field resolvers
 * Resolve relationships and computed fields for CatalogItem type
 */
const catalogItemFieldResolvers = {
  /**
   * Resolve industry relationship
   */
  async industry(parent: any, args: any, context: GraphQLContext) {
    if (!parent.industry_id) return null;

    // Return cached industry if already loaded
    if (parent.industry) return parent.industry;

    try {
      const { data, error } = await context.supabase
        .from('t_catalog_industries')
        .select('*')
        .eq('id', parent.industry_id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .single();

      if (error || !data) return null;
      return data;
    } catch (error) {
      console.error('Error resolving industry:', error);
      return null;
    }
  },

  /**
   * Resolve category relationship
   */
  async category(parent: any, args: any, context: GraphQLContext) {
    if (!parent.category_id) return null;

    // Return cached category if already loaded
    if (parent.category) return parent.category;

    try {
      const { data, error } = await context.supabase
        .from('v_catalog_categories_with_industry')
        .select('*')
        .eq('id', parent.category_id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .single();

      if (error || !data) return null;
      return data;
    } catch (error) {
      console.error('Error resolving category:', error);
      return null;
    }
  },

  /**
   * Resolve service parent relationship
   */
  async service_parent(parent: any, args: any, context: GraphQLContext) {
    if (!parent.service_parent_id) return null;

    // Return cached parent if already loaded
    if (parent.service_parent) return parent.service_parent;

    try {
      const { data, error } = await context.supabase
        .from('v_catalog_items_current')
        .select('*')
        .eq('id', parent.service_parent_id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .eq('is_current_version', true)
        .single();

      if (error || !data) return null;
      return data;
    } catch (error) {
      console.error('Error resolving service parent:', error);
      return null;
    }
  },

  /**
   * Resolve service variants
   */
  async variants(parent: any, args: any, context: GraphQLContext) {
    // Return cached variants if already loaded
    if (parent.variants) return parent.variants;

    try {
      const { data, error } = await context.supabase
        .from('v_catalog_items_current')
        .select('*')
        .eq('service_parent_id', parent.id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .eq('is_current_version', true)
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error resolving variants:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error resolving variants:', error);
      return [];
    }
  },

  /**
   * Resolve variant count
   */
  async variant_count(parent: any, args: any, context: GraphQLContext) {
    // Return cached count if already computed
    if (parent.variant_count !== undefined) return parent.variant_count;

    try {
      const { count, error } = await context.supabase
        .from('t_catalog_items')
        .select('*', { count: 'exact', head: true })
        .eq('service_parent_id', parent.id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .eq('is_current_version', true)
        .eq('is_active', true);

      if (error) {
        console.error('Error resolving variant count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error resolving variant count:', error);
      return 0;
    }
  },

  /**
   * Resolve original item ID
   */
  original_id(parent: any) {
    return parent.original_item_id || parent.id;
  },

  /**
   * Resolve total versions count
   */
  async total_versions(parent: any, args: any, context: GraphQLContext) {
    // Return cached count if already computed
    if (parent.total_versions !== undefined) return parent.total_versions;

    try {
      const originalId = parent.original_item_id || parent.id;
      
      const { count, error } = await context.supabase
        .from('t_catalog_items')
        .select('*', { count: 'exact', head: true })
        .or(`id.eq.${originalId},original_item_id.eq.${originalId}`)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment());

      if (error) {
        console.error('Error resolving total versions:', error);
        return 1;
      }

      return count || 1;
    } catch (error) {
      console.error('Error resolving total versions:', error);
      return 1;
    }
  },

  /**
   * Extract pricing type from price_attributes
   */
  pricing_type(parent: any) {
    return parent.price_attributes?.type || parent.pricing_type;
  },

  /**
   * Extract base amount from price_attributes
   */
  base_amount(parent: any) {
    return parent.price_attributes?.base_amount || parent.base_amount || 0;
  },

  /**
   * Extract currency from price_attributes
   */
  currency(parent: any) {
    return parent.price_attributes?.currency || parent.currency || 'INR';
  },

  /**
   * Extract billing mode from price_attributes
   */
  billing_mode(parent: any) {
    return parent.price_attributes?.billing_mode || parent.billing_mode || 'MANUAL';
  },

  /**
   * Extract tax default flag from tax_config
   */
  use_tenant_default_tax(parent: any) {
    return parent.tax_config?.use_tenant_default ?? parent.use_tenant_default_tax ?? true;
  },

  /**
   * Extract tax display mode from tax_config
   */
  tax_display_mode(parent: any) {
    return parent.tax_config?.display_mode || parent.tax_display_mode;
  },

  /**
   * Count specific tax rates from tax_config
   */
  specific_tax_count(parent: any) {
    return parent.tax_config?.specific_tax_rates?.length || parent.specific_tax_count || 0;
  },

  /**
   * Get environment label
   */
  environment_label(parent: any) {
    return parent.is_live ? 'Live' : 'Test';
  }
};

/**
 * CatalogCategory field resolvers
 */
const catalogCategoryFieldResolvers = {
  /**
   * Resolve industry relationship for category
   */
  async industry(parent: any, args: any, context: GraphQLContext) {
    if (!parent.industry_id) return null;

    // Return cached industry if already loaded
    if (parent.industry) return parent.industry;

    try {
      const { data, error } = await context.supabase
        .from('t_catalog_industries')
        .select('*')
        .eq('id', parent.industry_id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .single();

      if (error || !data) return null;
      return data;
    } catch (error) {
      console.error('Error resolving category industry:', error);
      return null;
    }
  },

  /**
   * Resolve items in this category
   */
  async items(parent: any, args: any, context: GraphQLContext) {
    try {
      const { data, error } = await context.supabase
        .from('v_catalog_items_current')
        .select('*')
        .eq('category_id', parent.id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .eq('is_current_version', true)
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error resolving category items:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error resolving category items:', error);
      return [];
    }
  },

  /**
   * Count items in this category
   */
  async item_count(parent: any, args: any, context: GraphQLContext) {
    try {
      const { count, error } = await context.supabase
        .from('t_catalog_items')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', parent.id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .eq('is_current_version', true)
        .eq('is_active', true);

      if (error) {
        console.error('Error resolving category item count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error resolving category item count:', error);
      return 0;
    }
  }
};

/**
 * CatalogIndustry field resolvers
 */
const catalogIndustryFieldResolvers = {
  /**
   * Resolve categories in this industry
   */
  async categories(parent: any, args: any, context: GraphQLContext) {
    try {
      const { data, error } = await context.supabase
        .from('t_catalog_categories')
        .select('*')
        .eq('industry_id', parent.id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .eq('is_active', true)
        .order('sort_order');

      if (error) {
        console.error('Error resolving industry categories:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error resolving industry categories:', error);
      return [];
    }
  },

  /**
   * Count items in this industry
   */
  async item_count(parent: any, args: any, context: GraphQLContext) {
    try {
      const { count, error } = await context.supabase
        .from('t_catalog_items')
        .select('*', { count: 'exact', head: true })
        .eq('industry_id', parent.id)
        .eq('tenant_id', context.tenant.id)
        .eq('is_live', context.isLiveEnvironment())
        .eq('is_current_version', true)
        .eq('is_active', true);

      if (error) {
        console.error('Error resolving industry item count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error resolving industry item count:', error);
      return 0;
    }
  }
};

// =================================================================
// SUBSCRIPTION RESOLVERS
// =================================================================

/**
 * Catalog subscription resolvers
 */
const catalogSubscriptionResolvers = {
  /**
   * Subscribe to catalog item updates
   */
  catalogItemUpdated: {
    subscribe: async (parent: any, args: any, context: GraphQLContext) => {
      const { tenant_id, is_live = true } = args;
      
      // Verify user has access to this tenant
      if (tenant_id !== context.tenant.id) {
        throw new Error('Cannot subscribe to other tenant events');
      }

      // Return async iterator for real-time updates
      // This would typically use Redis pub/sub or similar
      return context.supabase
        .channel(`catalog_items_${tenant_id}_${is_live}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 't_catalog_items',
          filter: `tenant_id=eq.${tenant_id} and is_live=eq.${is_live}`
        }, (payload) => {
          return payload.new;
        })
        .subscribe();
    }
  },

  /**
   * Subscribe to catalog item creation
   */
  catalogItemCreated: {
    subscribe: async (parent: any, args: any, context: GraphQLContext) => {
      const { tenant_id, is_live = true } = args;
      
      if (tenant_id !== context.tenant.id) {
        throw new Error('Cannot subscribe to other tenant events');
      }

      return context.supabase
        .channel(`catalog_items_created_${tenant_id}_${is_live}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 't_catalog_items',
          filter: `tenant_id=eq.${tenant_id} and is_live=eq.${is_live}`
        }, (payload) => {
          return payload.new;
        })
        .subscribe();
    }
  },

  /**
   * Subscribe to catalog item deletion
   */
  catalogItemDeleted: {
    subscribe: async (parent: any, args: any, context: GraphQLContext) => {
      const { tenant_id, is_live = true } = args;
      
      if (tenant_id !== context.tenant.id) {
        throw new Error('Cannot subscribe to other tenant events');
      }

      return context.supabase
        .channel(`catalog_items_deleted_${tenant_id}_${is_live}`)
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 't_catalog_items',
          filter: `tenant_id=eq.${tenant_id} and is_live=eq.${is_live}`
        }, (payload) => {
          return payload.old.id;
        })
        .subscribe();
    }
  },

  /**
   * Subscribe to bulk operation progress
   */
  bulkOperationProgress: {
    subscribe: async (parent: any, args: any, context: GraphQLContext) => {
      const { operation_id } = args;
      
      // This would typically use Redis or similar for progress tracking
      // For now, return a simple async iterator
      return {
        [Symbol.asyncIterator]: async function* () {
          yield {
            operation_id,
            progress: 100,
            status: 'completed',
            message: 'Bulk operation completed'
          };
        }
      };
    }
  },

  /**
   * Subscribe to environment sync progress
   */
  environmentSyncProgress: {
    subscribe: async (parent: any, args: any, context: GraphQLContext) => {
      const { tenant_id } = args;
      
      if (tenant_id !== context.tenant.id) {
        throw new Error('Cannot subscribe to other tenant events');
      }

      return {
        [Symbol.asyncIterator]: async function* () {
          yield {
            tenant_id,
            progress: 100,
            status: 'completed',
            message: 'Environment sync completed'
          };
        }
      };
    }
  },

  /**
   * Subscribe to catalog statistics updates
   */
  catalogStatisticsUpdated: {
    subscribe: async (parent: any, args: any, context: GraphQLContext) => {
      const { tenant_id } = args;
      
      if (tenant_id !== context.tenant.id) {
        throw new Error('Cannot subscribe to other tenant events');
      }

      // This would be triggered when statistics are recalculated
      return {
        [Symbol.asyncIterator]: async function* () {
          // Yield updated statistics periodically or on changes
          const stats = await catalogQueryResolvers.catalogStatistics(
            parent, 
            { is_live: true }, 
            context
          );
          yield stats;
        }
      };
    }
  }
};

// =================================================================
// COMBINED RESOLVERS
// =================================================================

/**
 * Complete catalog resolver map
 */
export const catalogResolvers = {
  Query: catalogQueryResolvers,
  Mutation: catalogMutationResolvers,
  Subscription: catalogSubscriptionResolvers,
  
  // Field resolvers
  CatalogItem: catalogItemFieldResolvers,
  CatalogCategory: catalogCategoryFieldResolvers,
  CatalogIndustry: catalogIndustryFieldResolvers,
};

// =================================================================
// INDIVIDUAL EXPORTS
// =================================================================

export { catalogQueryResolvers };
export { catalogMutationResolvers };
export { catalogSubscriptionResolvers };
export { 
  catalogItemFieldResolvers,
  catalogCategoryFieldResolvers,
  catalogIndustryFieldResolvers
};

export default catalogResolvers;