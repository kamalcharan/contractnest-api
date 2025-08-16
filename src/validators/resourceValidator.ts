// src/validators/resourceValidator.ts

import {
  CreateResourceRequest,
  UpdateResourceRequest,
  ValidationResult,
  ValidationError,
  ResourceValidationRules,
  ResourceServiceConfig,
  Resource,
  ResourceType
} from '../types/resourcesTypes';

/**
 * Resource Validator - Validates manual resource entries only
 * Delegates all data access to the service layer
 */
export class ResourceValidator {
  private serviceLayer: any; // Will be injected
  private config: ResourceServiceConfig;

  constructor(serviceLayer: any, config: ResourceServiceConfig) {
    this.serviceLayer = serviceLayer;
    this.config = config;
  }

  /**
   * Validate create resource request
   */
  async validateCreateRequest(data: CreateResourceRequest): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    try {
      // 1. Validate resource type exists and behavior
      const resourceTypeValidation = await this.validateResourceType(data.resource_type_id);
      if (!resourceTypeValidation.isValid) {
        errors.push(...resourceTypeValidation.errors);
        // Return early if resource type is invalid
        return { isValid: false, errors };
      }

      // 2. Check if this resource type supports manual entry
      const resourceType = resourceTypeValidation.resourceType;
      if (resourceType?.requires_human_assignment) {
        errors.push({
          field: 'resource_type_id',
          message: 'This resource type does not support manual entry. Resources are managed through contacts.',
          code: 'REQUIRES_HUMAN_ASSIGNMENT'
        });
        return { isValid: false, errors };
      }

      // 3. Validate required fields
      this.validateRequiredFields(data, errors);

      // 4. Validate field formats and constraints
      this.validateFieldFormats(data, errors);

      // 5. Check for duplicate names (only if basic validation passes)
      if (errors.length === 0) {
        const duplicateValidation = await this.validateUniqueResourceName(
          data.name,
          data.resource_type_id
        );
        if (!duplicateValidation.isValid) {
          errors.push(...duplicateValidation.errors);
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };

    } catch (error: any) {
      console.error('Error in validateCreateRequest:', error);
      return {
        isValid: false,
        errors: [{
          field: 'system',
          message: 'Validation system error',
          code: 'VALIDATION_SYSTEM_ERROR'
        }]
      };
    }
  }

  /**
   * Validate update resource request
   */
  async validateUpdateRequest(
    resourceId: string,
    data: UpdateResourceRequest
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    try {
      // 1. Get current resource
      const currentResource = await this.getCurrentResource(resourceId);
      if (!currentResource) {
        return {
          isValid: false,
          errors: [{
            field: 'resourceId',
            message: 'Resource not found',
            code: 'RESOURCE_NOT_FOUND'
          }]
        };
      }

      // 2. Validate resource type behavior (if we have the type info)
      if (currentResource.resource_type?.requires_human_assignment) {
        return {
          isValid: false,
          errors: [{
            field: 'resource_type_id',
            message: 'This resource cannot be updated as it is managed through contacts.',
            code: 'REQUIRES_HUMAN_ASSIGNMENT'
          }]
        };
      }

      // 3. Validate fields being updated
      this.validateUpdateFields(data, errors);

      // 4. Check for duplicate names if name is changing
      if (data.name && data.name !== currentResource.name) {
        const duplicateValidation = await this.validateUniqueResourceName(
          data.name,
          currentResource.resource_type_id,
          resourceId
        );
        if (!duplicateValidation.isValid) {
          errors.push(...duplicateValidation.errors);
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };

    } catch (error: any) {
      console.error('Error in validateUpdateRequest:', error);
      return {
        isValid: false,
        errors: [{
          field: 'system',
          message: 'Validation system error',
          code: 'VALIDATION_SYSTEM_ERROR'
        }]
      };
    }
  }

  // ============================================================================
  // PRIVATE VALIDATION METHODS
  // ============================================================================

  /**
   * Validate resource type exists and get behavior flags
   */
  private async validateResourceType(resourceTypeId: string): Promise<{
    isValid: boolean;
    errors: ValidationError[];
    resourceType?: ResourceType;
  }> {
    if (!resourceTypeId) {
      return {
        isValid: false,
        errors: [{
          field: 'resource_type_id',
          message: 'Resource type ID is required',
          code: 'REQUIRED_FIELD'
        }]
      };
    }

    try {
      // Call service layer to get resource types
      const resourceTypes = await this.serviceLayer.getResourceTypes();
      const resourceType = resourceTypes.find((rt: ResourceType) => rt.id === resourceTypeId);

      if (!resourceType) {
        return {
          isValid: false,
          errors: [{
            field: 'resource_type_id',
            message: 'Invalid resource type',
            code: 'INVALID_RESOURCE_TYPE'
          }]
        };
      }

      if (!resourceType.is_active) {
        return {
          isValid: false,
          errors: [{
            field: 'resource_type_id',
            message: 'Resource type is not active',
            code: 'INACTIVE_RESOURCE_TYPE'
          }]
        };
      }

      return {
        isValid: true,
        errors: [],
        resourceType
      };

    } catch (error) {
      console.error('Error validating resource type:', error);
      return {
        isValid: false,
        errors: [{
          field: 'resource_type_id',
          message: 'Unable to validate resource type',
          code: 'RESOURCE_TYPE_VALIDATION_ERROR'
        }]
      };
    }
  }

  /**
   * Validate required fields for create request
   */
  private validateRequiredFields(data: CreateResourceRequest, errors: ValidationError[]): void {
    if (!data.name || data.name.trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Name is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (!data.display_name || data.display_name.trim().length === 0) {
      errors.push({
        field: 'display_name',
        message: 'Display name is required',
        code: 'REQUIRED_FIELD'
      });
    }
  }

  /**
   * Validate field formats and constraints
   */
  private validateFieldFormats(data: CreateResourceRequest | UpdateResourceRequest, errors: ValidationError[]): void {
    // Validate name
    if (data.name !== undefined) {
      if (data.name && data.name.length > ResourceValidationRules.name.maxLength) {
        errors.push({
          field: 'name',
          message: `Name must be ${ResourceValidationRules.name.maxLength} characters or less`,
          code: 'FIELD_TOO_LONG'
        });
      }

      if (data.name && !ResourceValidationRules.name.pattern.test(data.name)) {
        errors.push({
          field: 'name',
          message: 'Name contains invalid characters. Only letters, numbers, spaces, and common punctuation are allowed.',
          code: 'INVALID_FORMAT'
        });
      }
    }

    // Validate display_name
    if (data.display_name !== undefined) {
      if (data.display_name && data.display_name.length > ResourceValidationRules.display_name.maxLength) {
        errors.push({
          field: 'display_name',
          message: `Display name must be ${ResourceValidationRules.display_name.maxLength} characters or less`,
          code: 'FIELD_TOO_LONG'
        });
      }
    }

    // Validate description
    if (data.description !== undefined && data.description) {
      if (data.description.length > ResourceValidationRules.description.maxLength) {
        errors.push({
          field: 'description',
          message: `Description must be ${ResourceValidationRules.description.maxLength} characters or less`,
          code: 'FIELD_TOO_LONG'
        });
      }
    }

    // Validate code
    if (data.code !== undefined && data.code) {
      if (data.code.length > ResourceValidationRules.code.maxLength) {
        errors.push({
          field: 'code',
          message: `Code must be ${ResourceValidationRules.code.maxLength} characters or less`,
          code: 'FIELD_TOO_LONG'
        });
      }

      if (!ResourceValidationRules.code.pattern.test(data.code)) {
        errors.push({
          field: 'code',
          message: 'Code can only contain letters, numbers, hyphens, and underscores',
          code: 'INVALID_FORMAT'
        });
      }
    }

    // Validate hexcolor
    if (data.hexcolor !== undefined && data.hexcolor) {
      if (!ResourceValidationRules.hexcolor.pattern.test(data.hexcolor)) {
        errors.push({
          field: 'hexcolor',
          message: 'Invalid hex color format. Expected format: #RRGGBB',
          code: 'INVALID_FORMAT'
        });
      }
    }

    // Validate sequence_no
    if (data.sequence_no !== undefined && data.sequence_no !== null) {
      if (!Number.isInteger(data.sequence_no) || 
          data.sequence_no < ResourceValidationRules.sequence_no.min || 
          data.sequence_no > ResourceValidationRules.sequence_no.max) {
        errors.push({
          field: 'sequence_no',
          message: `Sequence number must be an integer between ${ResourceValidationRules.sequence_no.min} and ${ResourceValidationRules.sequence_no.max}`,
          code: 'INVALID_RANGE'
        });
      }
    }

    // Validate status for updates
    if ('status' in data && data.status !== undefined) {
      const validStatuses = ['active', 'inactive', 'maintenance', 'retired'];
      if (!validStatuses.includes(data.status)) {
        errors.push({
          field: 'status',
          message: 'Invalid status. Must be one of: active, inactive, maintenance, retired',
          code: 'INVALID_ENUM_VALUE'
        });
      }
    }
  }

  /**
   * Validate fields being updated
   */
  private validateUpdateFields(data: UpdateResourceRequest, errors: ValidationError[]): void {
    // Check that we're not trying to update read-only fields
    const readOnlyFields = ['resource_type_id', 'tenant_id', 'created_at', 'created_by'];
    for (const field of readOnlyFields) {
      if (field in data) {
        errors.push({
          field,
          message: `Field '${field}' cannot be updated`,
          code: 'READ_ONLY_FIELD'
        });
      }
    }

    // Validate that required fields are not being set to empty
    if (data.name !== undefined && (!data.name || data.name.trim().length === 0)) {
      errors.push({
        field: 'name',
        message: 'Name cannot be empty',
        code: 'REQUIRED_FIELD'
      });
    }

    if (data.display_name !== undefined && (!data.display_name || data.display_name.trim().length === 0)) {
      errors.push({
        field: 'display_name',
        message: 'Display name cannot be empty',
        code: 'REQUIRED_FIELD'
      });
    }

    // Apply format validation
    this.validateFieldFormats(data, errors);
  }

  /**
   * Check for duplicate resource names within the same resource type
   */
  private async validateUniqueResourceName(
    name: string,
    resourceTypeId: string,
    excludeResourceId?: string
  ): Promise<ValidationResult> {
    try {
      // Call service layer to check for duplicates
      const isDuplicate = await this.serviceLayer.checkResourceNameExists(
        name.trim(),
        resourceTypeId,
        excludeResourceId
      );

      if (isDuplicate) {
        return {
          isValid: false,
          errors: [{
            field: 'name',
            message: 'A resource with this name already exists for this resource type',
            code: 'DUPLICATE_NAME'
          }]
        };
      }

      return {
        isValid: true,
        errors: []
      };

    } catch (error) {
      console.error('Error checking resource name uniqueness:', error);
      return {
        isValid: false,
        errors: [{
          field: 'name',
          message: 'Unable to verify name uniqueness',
          code: 'NAME_CHECK_ERROR'
        }]
      };
    }
  }

  /**
   * Get current resource from service layer
   */
  private async getCurrentResource(resourceId: string): Promise<Resource | null> {
    try {
      return await this.serviceLayer.getResourceById(resourceId);
    } catch (error) {
      console.error('Error getting current resource:', error);
      return null;
    }
  }

  // ============================================================================
  // PUBLIC UTILITY METHODS
  // ============================================================================

  /**
   * Validate that a resource can be deleted
   */
  async validateDeleteRequest(resourceId: string): Promise<ValidationResult> {
    try {
      const currentResource = await this.getCurrentResource(resourceId);
      
      if (!currentResource) {
        return {
          isValid: false,
          errors: [{
            field: 'resourceId',
            message: 'Resource not found',
            code: 'RESOURCE_NOT_FOUND'
          }]
        };
      }

      if (currentResource.resource_type?.requires_human_assignment) {
        return {
          isValid: false,
          errors: [{
            field: 'resource_type_id',
            message: 'This resource cannot be deleted as it is managed through contacts.',
            code: 'REQUIRES_HUMAN_ASSIGNMENT'
          }]
        };
      }

      if (!currentResource.is_deletable) {
        return {
          isValid: false,
          errors: [{
            field: 'is_deletable',
            message: 'This resource is marked as non-deletable',
            code: 'NOT_DELETABLE'
          }]
        };
      }

      if (currentResource.status !== 'active') {
        return {
          isValid: false,
          errors: [{
            field: 'status',
            message: 'Resource is already inactive',
            code: 'ALREADY_INACTIVE'
          }]
        };
      }

      return {
        isValid: true,
        errors: []
      };

    } catch (error: any) {
      console.error('Error in validateDeleteRequest:', error);
      return {
        isValid: false,
        errors: [{
          field: 'system',
          message: 'Validation system error',
          code: 'VALIDATION_SYSTEM_ERROR'
        }]
      };
    }
  }

  /**
   * Quick validation for basic field format (without DB calls)
   */
  validateFieldsOnly(data: CreateResourceRequest | UpdateResourceRequest): ValidationResult {
    const errors: ValidationError[] = [];

    // For create requests, validate required fields
    if ('resource_type_id' in data) {
      this.validateRequiredFields(data as CreateResourceRequest, errors);
    }

    // For update requests, validate update constraints
    if (!('resource_type_id' in data)) {
      this.validateUpdateFields(data as UpdateResourceRequest, errors);
    } else {
      // Apply format validation
      this.validateFieldFormats(data, errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}