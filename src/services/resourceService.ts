// src/services/resourceService.ts
// ✅ PRODUCTION: Resource service with environment segregation

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import {
  Resource,
  ResourceDetailed,
  CreateResourceRequest,
  UpdateResourceRequest,
  ResourceQuery,
  ServiceResponse,
  ResourceServiceConfig,
  ResourceError,
  ResourceNotFoundError,
  ResourceValidationError
} from '../types/resource';

export class ResourceService {
  private supabase: any;
  private config: ResourceServiceConfig;
  private auditLogger: any;

  constructor(config: ResourceServiceConfig) {
    this.config = config;
    
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration in Resource service');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    
    // Initialize audit logger
    this.auditLogger = {
      logDataChange: async (tenantId: string, userId: string, entityType: string, entityId: string, action: string, oldData: any, newData: any) => {
        console.log(`[Audit] ${action} ${entityType} ${entityId} by ${userId} in tenant ${tenantId}`);
      }
    };
  }

  // ===================================================================
  // CRUD OPERATIONS
  // ===================================================================

  /**
   * Create resource item
   */
  async createResource(data: CreateResourceRequest): Promise<ServiceResponse<ResourceDetailed>> {
    const resourceId = randomUUID();
    const now = new Date().toISOString();

    try {
      const resourceData = {
        id: resourceId,
        tenant_id: this.config.tenant_id,
        is_live: this.config.is_live, // ✅ CRITICAL: Environment segregation
        resource_type_id: data.resource_type_id,
        name: data.name.trim(),
        display_name: data.display_name.trim(),
        description: data.description?.trim() || null,
        hexcolor: data.hexcolor || '#40E0D0',
        icon_name: data.icon_name || null,
        sequence_no: data.sequence_no || await this.getNextSequenceNumber(data.resource_type_id),
        contact_id: data.contact_id || null,
        tags: data.tags || null,
        form_settings: data.form_settings || null,
        status: data.status || 'active',
        is_active: data.is_active !== false,
        is_deletable: data.is_deletable !== false,
        created_at: now,
        updated_at: now,
        created_by: this.config.user_id,
        updated_by: this.config.user_id
      };

      // For team_staff, validate contact exists and has correct classification
      if (data.resource_type_id === 'team_staff' && data.contact_id) {
        await this.validateTeamMemberContact(data.contact_id);
      }

      const { data: item, error } = await this.supabase
        .from('t_catalog_resources')
        .insert([resourceData])
        .select(`
          *,
          contact:t_contacts(id, first_name, last_name, email, contact_classification)
        `)
        .single();

      if (error) {
        console.error('Error creating resource:', error);
        
        if (error.code === '23505') { // Unique constraint violation
          throw new ResourceValidationError('Resource with this name already exists for this type');
        }
        
        throw new ResourceError(`Failed to create resource: ${error.message}`, 'CREATE_ERROR');
      }

      // Audit logging
      await this.auditLogger.logDataChange(
        this.config.tenant_id,
        this.config.user_id,
        'RESOURCE',
        resourceId,
        'CREATE',
        null,
        item
      );

      return {
        success: true,
        data: {
          ...item,
          environment_label: item.is_live ? 'Production' : 'Test'
        },
        message: 'Resource created successfully'
      };

    } catch (error: any) {
      if (error instanceof ResourceError) {
        throw error;
      }
      
      throw new ResourceError(
        `Failed to create resource: ${error.message}`,
        'TRANSACTION_FAILED'
      );
    }
  }

  /**
   * Get resource by ID
   */
  async getResourceById(id: string): Promise<ServiceResponse<ResourceDetailed>> {
    try {
      const { data: item, error } = await this.supabase
        .from('t_catalog_resources')
        .select(`
          *,
          contact:t_contacts(id, first_name, last_name, email, contact_classification)
        `)
        .eq('id', id)
        .eq('tenant_id', this.config.tenant_id)
        .eq('is_live', this.config.is_live) // ✅ CRITICAL: Environment filtering
        .single();

      if (error || !item) {
        throw new ResourceNotFoundError(id);
      }

      return {
        success: true,
        data: {
          ...item,
          environment_label: item.is_live ? 'Production' : 'Test'
        },
        message: 'Resource retrieved successfully'
      };

    } catch (error: any) {
      if (error instanceof ResourceError) {
        throw error;
      }
      
      throw new ResourceError(
        `Failed to get resource: ${error.message}`,
        'GET_ERROR'
      );
    }
  }

  /**
   * Query resources with filtering
   */
  async queryResources(query: ResourceQuery): Promise<ServiceResponse<ResourceDetailed[]>> {
    try {
      let supabaseQuery = this.supabase
        .from('t_catalog_resources')
        .select(`
          *,
          contact:t_contacts(id, first_name, last_name, email, contact_classification)
        `)
        .eq('tenant_id', this.config.tenant_id)
        .eq('is_live', this.config.is_live); // ✅ CRITICAL: Environment filtering

      // Apply filters
      if (query.filters) {
        if (query.filters.is_active !== undefined) {
          supabaseQuery = supabaseQuery.eq('is_active', query.filters.is_active);
        }

        if (query.filters.resource_type_id) {
          const types = Array.isArray(query.filters.resource_type_id) 
            ? query.filters.resource_type_id 
            : [query.filters.resource_type_id];
          supabaseQuery = supabaseQuery.in('resource_type_id', types);
        }

        if (query.filters.status) {
          const statuses = Array.isArray(query.filters.status) 
            ? query.filters.status 
            : [query.filters.status];
          supabaseQuery = supabaseQuery.in('status', statuses);
        }

        if (query.filters.search_query) {
          supabaseQuery = supabaseQuery.or(`name.ilike.%${query.filters.search_query}%,display_name.ilike.%${query.filters.search_query}%,description.ilike.%${query.filters.search_query}%`);
        }

        if (query.filters.contact_id) {
          supabaseQuery = supabaseQuery.eq('contact_id', query.filters.contact_id);
        }

        if (query.filters.has_contact !== undefined) {
          if (query.filters.has_contact) {
            supabaseQuery = supabaseQuery.not('contact_id', 'is', null);
          } else {
            supabaseQuery = supabaseQuery.is('contact_id', null);
          }
        }

        if (query.filters.created_after) {
          supabaseQuery = supabaseQuery.gte('created_at', query.filters.created_after);
        }

        if (query.filters.created_before) {
          supabaseQuery = supabaseQuery.lte('created_at', query.filters.created_before);
        }
      }

      // Apply sorting
      if (query.sort && query.sort.length > 0) {
        query.sort.forEach(sortItem => {
          supabaseQuery = supabaseQuery.order(sortItem.field, { ascending: sortItem.direction === 'asc' });
        });
      } else {
        // Default sorting
        supabaseQuery = supabaseQuery.order('sequence_no', { ascending: true, nullsLast: true });
      }

      // Apply pagination
      if (query.pagination) {
        const offset = (query.pagination.page - 1) * query.pagination.limit;
        supabaseQuery = supabaseQuery.range(offset, offset + query.pagination.limit - 1);
      }

      const { data, error } = await supabaseQuery;

      if (error) {
        console.error('Error querying resources:', error);
        throw error;
      }

      // Transform data
      const transformedData = data.map((item: any) => ({
        ...item,
        environment_label: item.is_live ? 'Production' : 'Test'
      }));

      return {
        success: true,
        data: transformedData,
        message: `Found ${transformedData.length} resources`
      };

    } catch (error: any) {
      if (error instanceof ResourceError) {
        throw error;
      }
      
      throw new ResourceError(
        `Failed to query resources: ${error.message}`,
        'QUERY_ERROR'
      );
    }
  }

  /**
   * Update resource
   */
  async updateResource(id: string, updateData: UpdateResourceRequest): Promise<ServiceResponse<ResourceDetailed>> {
    try {
      const currentResult = await this.getResourceById(id);
      if (!currentResult.success || !currentResult.data) {
        throw new ResourceNotFoundError(id);
      }

      const updateFields: any = {
        updated_at: new Date().toISOString(),
        updated_by: this.config.user_id
      };

      // Add fields that are being updated
      if (updateData.name !== undefined) updateFields.name = updateData.name.trim();
      if (updateData.display_name !== undefined) updateFields.display_name = updateData.display_name.trim();
      if (updateData.description !== undefined) updateFields.description = updateData.description?.trim() || null;
      if (updateData.hexcolor !== undefined) updateFields.hexcolor = updateData.hexcolor;
      if (updateData.icon_name !== undefined) updateFields.icon_name = updateData.icon_name;
      if (updateData.sequence_no !== undefined) updateFields.sequence_no = updateData.sequence_no;
      if (updateData.tags !== undefined) updateFields.tags = updateData.tags;
      if (updateData.form_settings !== undefined) updateFields.form_settings = updateData.form_settings;
      if (updateData.status !== undefined) updateFields.status = updateData.status;
      if (updateData.is_active !== undefined) updateFields.is_active = updateData.is_active;
      if (updateData.is_deletable !== undefined) updateFields.is_deletable = updateData.is_deletable;

      const { data: updatedItem, error } = await this.supabase
        .from('t_catalog_resources')
        .update(updateFields)
        .eq('id', id)
        .eq('tenant_id', this.config.tenant_id)
        .eq('is_live', this.config.is_live) // ✅ CRITICAL: Environment filtering
        .select(`
          *,
          contact:t_contacts(id, first_name, last_name, email, contact_classification)
        `)
        .single();

      if (error) {
        console.error('Error updating resource:', error);
        
        if (error.code === '23505') { // Unique constraint violation
          throw new ResourceValidationError('Resource with this name already exists');
        }
        
        throw new ResourceError(`Failed to update resource: ${error.message}`, 'UPDATE_ERROR');
      }

      // Audit logging
      await this.auditLogger.logDataChange(
        this.config.tenant_id,
        this.config.user_id,
        'RESOURCE',
        id,
        'UPDATE',
        currentResult.data,
        updatedItem
      );

      return {
        success: true,
        data: {
          ...updatedItem,
          environment_label: updatedItem.is_live ? 'Production' : 'Test'
        },
        message: 'Resource updated successfully'
      };

    } catch (error: any) {
      if (error instanceof ResourceError) {
        throw error;
      }
      
      throw new ResourceError(
        `Failed to update resource: ${error.message}`,
        'UPDATE_FAILED'
      );
    }
  }

  /**
   * Delete resource (soft delete)
   */
  async deleteResource(id: string): Promise<ServiceResponse<void>> {
    try {
      const { data: item, error: fetchError } = await this.supabase
        .from('t_catalog_resources')
        .select('id, name, is_deletable')
        .eq('id', id)
        .eq('tenant_id', this.config.tenant_id)
        .eq('is_live', this.config.is_live) // ✅ CRITICAL: Environment filtering
        .single();

      if (fetchError || !item) {
        throw new ResourceNotFoundError(id);
      }

      if (!item.is_deletable) {
        throw new ResourceValidationError('Resource cannot be deleted');
      }

      const { error: deleteError } = await this.supabase
        .from('t_catalog_resources')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
          updated_by: this.config.user_id
        })
        .eq('id', id)
        .eq('tenant_id', this.config.tenant_id)
        .eq('is_live', this.config.is_live); // ✅ CRITICAL: Environment filtering

      if (deleteError) {
        throw new ResourceError(`Failed to delete resource: ${deleteError.message}`, 'DELETE_ERROR');
      }

      // Audit logging
      await this.auditLogger.logDataChange(
        this.config.tenant_id,
        this.config.user_id,
        'RESOURCE',
        id,
        'DELETE',
        item,
        null
      );

      return {
        success: true,
        message: 'Resource deleted successfully'
      };

    } catch (error: any) {
      if (error instanceof ResourceError) {
        throw error;
      }
      
      throw new ResourceError(
        `Failed to delete resource: ${error.message}`,
        'DELETE_FAILED'
      );
    }
  }

  // ===================================================================
  // HELPER METHODS
  // ===================================================================

  private async validateTeamMemberContact(contactId: string): Promise<void> {
    const { data: contact, error } = await this.supabase
      .from('t_contacts')
      .select('contact_classification')
      .eq('id', contactId)
      .eq('tenant_id', this.config.tenant_id)
      .eq('is_live', this.config.is_live) // ✅ CRITICAL: Environment filtering
      .eq('is_active', true)
      .single();

    if (error || !contact) {
      throw new ResourceValidationError('Contact not found');
    }

    if (contact.contact_classification !== 'team_member') {
      throw new ResourceValidationError('Contact must have team_member classification');
    }
  }

  private async getNextSequenceNumber(resourceTypeId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('t_catalog_resources')
      .select('sequence_no')
      .eq('resource_type_id', resourceTypeId)
      .eq('tenant_id', this.config.tenant_id)
      .eq('is_live', this.config.is_live) // ✅ CRITICAL: Environment filtering
      .eq('is_active', true)
      .order('sequence_no', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return 1;
    }

    return (data[0].sequence_no || 0) + 1;
  }

  /**
   * Get available resource types
   */
  async getResourceTypes(): Promise<ServiceResponse<any[]>> {
    try {
      const { data, error } = await this.supabase
        .from('m_catalog_resource_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (error) {
        throw new ResourceError(`Failed to fetch resource types: ${error.message}`, 'FETCH_TYPES_ERROR');
      }

      return {
        success: true,
        data: data || [],
        message: 'Resource types retrieved successfully'
      };

    } catch (error: any) {
      throw new ResourceError(
        `Failed to get resource types: ${error.message}`,
        'GET_TYPES_ERROR'
      );
    }
  }
}