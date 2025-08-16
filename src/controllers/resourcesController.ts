// src/controllers/resourcesController.ts

import { Request, Response } from 'express';
import { ResourceValidator } from '../validators/resourceValidator';
import resourcesService from '../services/resourcesService';
import {
  CreateResourceRequest,
  UpdateResourceRequest,
  GetResourcesQuery,
  ResourceError,
  ResourcesHttpStatus,
  ApiResponse,
  ErrorResponse,
  ResourceServiceConfig
} from '../types/resourcesTypes';

/**
 * Resources Controller - Handles HTTP requests, validation, and response formatting
 * Uses hybrid approach: Service returns data, controller handles HTTP concerns
 */
export class ResourcesController {
  /**
   * Create validator with auth context per request
   */
  private createValidator(authHeader: string, tenantId: string): ResourceValidator {
    return new ResourceValidator(
      {
        getResourceTypes: () => resourcesService.getResourceTypesForValidator(authHeader, tenantId),
        checkResourceNameExists: (name: string, resourceTypeId: string, excludeResourceId?: string) => 
          resourcesService.checkResourceNameExists(authHeader, tenantId, name, resourceTypeId, excludeResourceId),
        getResourceById: (resourceId: string) => 
          resourcesService.getResourceById(authHeader, tenantId, resourceId)
      },
      {
        tenant_id: tenantId,
        is_live: true,
        timeout: 30000
      }
    );
  }

  // ============================================================================
  // MAIN CRUD ENDPOINTS
  // ============================================================================

  /**
   * Get resources (all, by type, single, or next sequence)
   */
  async getResources(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const { resourceTypeId, nextSequence, resourceId } = req.query as GetResourcesQuery;

      console.log('📋 API getResources called:', {
        tenantId,
        resourceTypeId,
        nextSequence,
        resourceId,
        hasAuth: !!authHeader,
      });

      // Validate required headers
      const headerValidation = this.validateHeaders(authHeader, tenantId);
      if (!headerValidation.valid) {
        return this.sendErrorResponse(res, headerValidation.error!, headerValidation.status!);
      }

      let data: any;
      let message: string;

      // Handle next sequence request
      if (nextSequence === 'true' && resourceTypeId) {
        data = { nextSequence: await resourcesService.getNextSequenceNumber(authHeader!, tenantId, resourceTypeId) };
        message = 'Next sequence number retrieved successfully';
      }
      // Handle single resource request
      else if (resourceId) {
        const resource = await resourcesService.getResourceById(authHeader!, tenantId, resourceId);
        if (!resource) {
          return this.sendErrorResponse(res, 'Resource not found', ResourcesHttpStatus.NOT_FOUND);
        }
        data = resource;
        message = 'Resource retrieved successfully';
      }
      // Handle resources by type
      else if (resourceTypeId) {
        data = await resourcesService.getResourcesByType(authHeader!, tenantId, resourceTypeId);
        message = `Resources retrieved successfully for type ${resourceTypeId}`;
      }
      // Handle all resources
      else {
        data = await resourcesService.getAllResources(authHeader!, tenantId);
        message = 'All resources retrieved successfully';
      }

      console.log(`✅ Successfully retrieved resources: ${Array.isArray(data) ? data.length : 1} items`);

      return this.sendSuccessResponse(res, data, message, ResourcesHttpStatus.OK);

    } catch (error: any) {
      console.error('❌ Error in getResources controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Get all resource types
   */
  async getResourceTypes(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;

      console.log('📋 API getResourceTypes called:', {
        tenantId,
        hasAuth: !!authHeader,
      });

      // Validate required headers
      const headerValidation = this.validateHeaders(authHeader, tenantId);
      if (!headerValidation.valid) {
        return this.sendErrorResponse(res, headerValidation.error!, headerValidation.status!);
      }

      const resourceTypes = await resourcesService.getResourceTypes(authHeader!, tenantId);

      console.log(`✅ Successfully retrieved ${resourceTypes.length} resource types`);

      return this.sendSuccessResponse(
        res, 
        resourceTypes, 
        'Resource types retrieved successfully', 
        ResourcesHttpStatus.OK
      );

    } catch (error: any) {
      console.error('❌ Error in getResourceTypes controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Create new resource
   */
  async createResource(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const requestData: CreateResourceRequest = req.body;

      console.log('➕ API createResource called:', {
        tenantId,
        resourceData: {
          resource_type_id: requestData.resource_type_id,
          name: requestData.name,
          display_name: requestData.display_name,
        },
        hasAuth: !!authHeader,
        hasIdempotencyKey: !!idempotencyKey,
      });

      // Validate required headers
      const headerValidation = this.validateHeaders(authHeader, tenantId);
      if (!headerValidation.valid) {
        return this.sendErrorResponse(res, headerValidation.error!, headerValidation.status!);
      }

      // Validate request data
      const validator = this.createValidator(authHeader!, tenantId);
      const validationResult = await validator.validateCreateRequest(requestData);
      if (!validationResult.isValid) {
        console.log('❌ Validation failed:', validationResult.errors);
        return this.sendValidationErrorResponse(res, validationResult.errors);
      }

      // Create resource via service
      const resource = await resourcesService.createResource(
        authHeader!, 
        tenantId, 
        requestData, 
        idempotencyKey
      );

      console.log(`✅ Successfully created resource: ${resource.name}`);

      return this.sendSuccessResponse(
        res, 
        resource, 
        'Resource created successfully', 
        ResourcesHttpStatus.CREATED
      );

    } catch (error: any) {
      console.error('❌ Error in createResource controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Update existing resource
   */
  async updateResource(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const resourceId = req.params.id;
      const requestData: UpdateResourceRequest = req.body;

      console.log('✏️ API updateResource called:', {
        resourceId,
        tenantId,
        hasAuth: !!authHeader,
        hasIdempotencyKey: !!idempotencyKey,
      });

      // Validate required headers
      const headerValidation = this.validateHeaders(authHeader, tenantId);
      if (!headerValidation.valid) {
        return this.sendErrorResponse(res, headerValidation.error!, headerValidation.status!);
      }

      if (!resourceId) {
        return this.sendErrorResponse(res, 'Resource ID is required', ResourcesHttpStatus.BAD_REQUEST);
      }

      // Validate request data
      const validator = this.createValidator(authHeader!, tenantId);
      const validationResult = await validator.validateUpdateRequest(resourceId, requestData);
      if (!validationResult.isValid) {
        console.log('❌ Validation failed:', validationResult.errors);
        return this.sendValidationErrorResponse(res, validationResult.errors);
      }

      // Update resource via service
      const resource = await resourcesService.updateResource(
        authHeader!, 
        tenantId, 
        resourceId, 
        requestData, 
        idempotencyKey
      );

      console.log(`✅ Successfully updated resource: ${resource.name}`);

      return this.sendSuccessResponse(
        res, 
        resource, 
        'Resource updated successfully', 
        ResourcesHttpStatus.OK
      );

    } catch (error: any) {
      console.error('❌ Error in updateResource controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Delete resource
   */
  async deleteResource(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const resourceId = req.params.id;

      console.log('🗑️ API deleteResource called:', {
        resourceId,
        tenantId,
        hasAuth: !!authHeader,
        hasIdempotencyKey: !!idempotencyKey,
      });

      // Validate required headers
      const headerValidation = this.validateHeaders(authHeader, tenantId);
      if (!headerValidation.valid) {
        return this.sendErrorResponse(res, headerValidation.error!, headerValidation.status!);
      }

      if (!resourceId) {
        return this.sendErrorResponse(res, 'Resource ID is required', ResourcesHttpStatus.BAD_REQUEST);
      }

      // Validate delete request
      const validator = this.createValidator(authHeader!, tenantId);
      const validationResult = await validator.validateDeleteRequest(resourceId);
      if (!validationResult.isValid) {
        console.log('❌ Delete validation failed:', validationResult.errors);
        return this.sendValidationErrorResponse(res, validationResult.errors);
      }

      // Delete resource via service
      const result = await resourcesService.deleteResource(
        authHeader!, 
        tenantId, 
        resourceId, 
        idempotencyKey
      );

      console.log(`✅ Successfully deleted resource: ${resourceId}`);

      return this.sendSuccessResponse(
        res, 
        result, 
        'Resource deleted successfully', 
        ResourcesHttpStatus.OK
      );

    } catch (error: any) {
      console.error('❌ Error in deleteResource controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  // ============================================================================
  // UTILITY ENDPOINTS
  // ============================================================================

  /**
   * Health check endpoint
   */
  async healthCheck(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string || 'system';

      if (!authHeader) {
        return this.sendErrorResponse(res, 'Authorization header is required', ResourcesHttpStatus.UNAUTHORIZED);
      }

      const healthData = await resourcesService.healthCheck(authHeader, tenantId);

      return this.sendSuccessResponse(
        res,
        healthData,
        'Health check successful',
        ResourcesHttpStatus.OK
      );

    } catch (error: any) {
      console.error('❌ Health check failed:', error);
      return this.sendErrorResponse(
        res, 
        'Health check failed', 
        ResourcesHttpStatus.INTERNAL_ERROR,
        error.message
      );
    }
  }

  /**
   * Get signing status (debug endpoint)
   */
  async getSigningStatus(req: Request, res: Response): Promise<Response> {
    const serviceConfig = resourcesService.getServiceConfig();

    return this.sendSuccessResponse(
      res,
      {
        signing: {
          hasSigningSecret: serviceConfig.hasSigningSecret,
          environment: serviceConfig.environment,
        },
        service: {
          baseUrl: serviceConfig.baseUrl,
          timeout: serviceConfig.timeout,
        },
        controller: 'healthy',
      },
      'Signing status retrieved successfully',
      ResourcesHttpStatus.OK
    );
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Validate required headers
   */
  private validateHeaders(authHeader: string | undefined, tenantId: string | undefined): {
    valid: boolean;
    error?: string;
    status?: ResourcesHttpStatus;
  } {
    if (!authHeader) {
      return {
        valid: false,
        error: 'Authorization header is required',
        status: ResourcesHttpStatus.UNAUTHORIZED
      };
    }

    if (!tenantId) {
      return {
        valid: false,
        error: 'x-tenant-id header is required',
        status: ResourcesHttpStatus.BAD_REQUEST
      };
    }

    return { valid: true };
  }

  /**
   * Send success response with standard API format
   */
  private sendSuccessResponse<T>(
    res: Response,
    data: T,
    message: string,
    status: ResourcesHttpStatus = ResourcesHttpStatus.OK
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    };

    return res.status(status).json(response);
  }

  /**
   * Send error response with standard format
   */
  private sendErrorResponse(
    res: Response,
    error: string,
    status: ResourcesHttpStatus,
    details?: string
  ): Response {
    const response: ErrorResponse = {
      error,
      details,
      timestamp: new Date().toISOString(),
      requestId: this.generateRequestId()
    };

    return res.status(status).json(response);
  }

  /**
   * Send validation error response
   */
  private sendValidationErrorResponse(res: Response, errors: any[]): Response {
    const response: ErrorResponse = {
      error: 'Validation failed',
      details: errors.map(e => e.message).join(', '),
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
      requestId: this.generateRequestId()
    };

    return res.status(ResourcesHttpStatus.BAD_REQUEST).json(response);
  }

  /**
   * Handle service layer errors and convert to HTTP responses
   */
  private handleServiceError(res: Response, error: ResourceError | any): Response {
    // If it's our structured ResourceError
    if (error.type) {
      const resourceError = error as ResourceError;
      
      // Map error types to HTTP status codes
      const statusMap: Record<string, ResourcesHttpStatus> = {
        validation_error: ResourcesHttpStatus.BAD_REQUEST,
        not_found: ResourcesHttpStatus.NOT_FOUND,
        conflict: ResourcesHttpStatus.CONFLICT,
        unauthorized: ResourcesHttpStatus.UNAUTHORIZED,
        forbidden: ResourcesHttpStatus.FORBIDDEN,
        rate_limited: ResourcesHttpStatus.RATE_LIMITED,
        service_unavailable: ResourcesHttpStatus.SERVICE_UNAVAILABLE,
        internal_error: ResourcesHttpStatus.INTERNAL_ERROR
      };

      const status = statusMap[resourceError.type] || ResourcesHttpStatus.INTERNAL_ERROR;
      const details = resourceError.details?.map(d => d.message).join(', ');

      return this.sendErrorResponse(res, resourceError.message, status, details);
    }

    // Generic error handling
    console.error('Unhandled service error:', error);
    return this.sendErrorResponse(
      res, 
      'Internal server error', 
      ResourcesHttpStatus.INTERNAL_ERROR,
      error.message
    );
  }

  /**
   * Generate unique request ID for tracing
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export controller methods for routes
const controller = new ResourcesController();

export const getResources = controller.getResources.bind(controller);
export const getResourceTypes = controller.getResourceTypes.bind(controller);
export const createResource = controller.createResource.bind(controller);
export const updateResource = controller.updateResource.bind(controller);
export const deleteResource = controller.deleteResource.bind(controller);
export const healthCheck = controller.healthCheck.bind(controller);
export const getSigningStatus = controller.getSigningStatus.bind(controller);

export default controller;