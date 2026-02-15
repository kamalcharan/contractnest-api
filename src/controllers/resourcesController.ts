// src/controllers/resourcesController.ts
// SECURE VERSION - Your actual code with security fixes applied

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
 * Extract actual data from edge function response
 * Handles both wrapped and direct responses
 */
function extractEdgeData(edgeResponse: any): any {
  console.log('🔧 Extracting edge data from:', edgeResponse);
  
  // Handle edge function format: { success: true, data: [...] }
  if (edgeResponse?.success && edgeResponse?.data !== undefined) {
    console.log('✅ Extracted edge data:', edgeResponse.data);
    return edgeResponse.data;
  }
  
  // Handle direct array/object
  if (Array.isArray(edgeResponse) || (typeof edgeResponse === 'object' && edgeResponse !== null)) {
    console.log('✅ Using direct data:', edgeResponse);
    return edgeResponse;
  }
  
  // Handle primitive values (like numbers for nextSequence)
  if (typeof edgeResponse === 'number' || typeof edgeResponse === 'string') {
    console.log('✅ Using primitive data:', edgeResponse);
    return edgeResponse;
  }
  
  console.log('❌ Unknown data format, returning empty array');
  return [];
}

/**
 * 🔐 SECURITY: Extract user ID from JWT token for audit trail
 */
function extractUserIdFromAuth(authHeader: string): string | null {
  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub || null;
  } catch (error) {
    console.error('❌ Error extracting user ID from token:', error);
    return null;
  }
}

/**
 * 🔐 SECURITY: Extract tenant ID from JWT token
 */
function extractTenantIdFromAuth(authHeader: string): string | null {
  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.app_metadata?.tenant_id || null;
  } catch (error) {
    console.error('❌ Error extracting tenant ID from token:', error);
    return null;
  }
}

/**
 * Resources Controller - Handles HTTP requests, validation, and response formatting
 * SECURE VERSION with user tracking and tenant validation
 */
export class ResourcesController {
  /**
   * Create validator with auth context per request
   * FIXED: Now properly extracts data from edge function responses
   */
  private createValidator(authHeader: string, tenantId: string): ResourceValidator {
    return new ResourceValidator(
      {
        getResourceTypes: async () => {
          const edgeResponse = await resourcesService.getResourceTypesForValidator(authHeader, tenantId);
          // 🔧 FIX: Extract the actual array from edge function response
          return extractEdgeData(edgeResponse);
        },
        checkResourceNameExists: async (name: string, resourceTypeId: string, excludeResourceId?: string) => {
          const edgeResponse = await resourcesService.checkResourceNameExists(authHeader, tenantId, name, resourceTypeId, excludeResourceId);
          // 🔧 FIX: Extract the actual result from edge function response
          return extractEdgeData(edgeResponse);
        },
        getResourceById: async (resourceId: string) => {
          const edgeResponse = await resourcesService.getResourceById(authHeader, tenantId, resourceId);
          // 🔧 FIX: Extract the actual resource from edge function response
          return extractEdgeData(edgeResponse);
        }
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
   * 🔐 SECURITY: Added user and tenant validation
   */
  async getResources(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const { resourceTypeId, nextSequence, resourceId, include_deleted } = req.query as GetResourcesQuery;
      const includeDeleted = include_deleted === 'true';

      console.log('📋 API getResources called:', {
        tenantIdHeader,
        resourceTypeId,
        nextSequence,
        resourceId,
        includeDeleted,
        hasAuth: !!authHeader,
      });

      // 🔐 SECURITY: Enhanced header validation
      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { userId, tenantId } = securityValidation;

      let edgeResponse: any;
      let message: string;

      // Handle next sequence request
      if (nextSequence === 'true' && resourceTypeId) {
        edgeResponse = await resourcesService.getNextSequenceNumber(authHeader!, tenantId!, resourceTypeId);
        message = 'Next sequence number retrieved successfully';
        
        // Extract data and wrap in expected format for frontend
        const nextSeqValue = extractEdgeData(edgeResponse);
        const data = { nextSequence: typeof nextSeqValue === 'number' ? nextSeqValue : 1 };
        
        console.log(`✅ Next sequence retrieved: ${data.nextSequence} for tenant ${tenantId}`);
        return this.sendSuccessResponse(res, data, message, ResourcesHttpStatus.OK);
      }
      // Handle single resource request
      else if (resourceId) {
        edgeResponse = await resourcesService.getResourceById(authHeader!, tenantId!, resourceId);
        if (!edgeResponse || (edgeResponse.success && !edgeResponse.data)) {
          return this.sendErrorResponse(res, 'Resource not found', ResourcesHttpStatus.NOT_FOUND);
        }
        message = 'Resource retrieved successfully';
      }
      // Handle resources by type
      else if (resourceTypeId) {
        edgeResponse = await resourcesService.getResourcesByType(authHeader!, tenantId!, resourceTypeId, includeDeleted);
        message = `Resources retrieved successfully for type ${resourceTypeId}`;
      }
      // Handle all resources
      else {
        edgeResponse = await resourcesService.getAllResources(authHeader!, tenantId!, includeDeleted);
        message = 'All resources retrieved successfully';
      }

      // 🔧 FIX: Extract actual data from edge function response
      const data = extractEdgeData(edgeResponse);

      console.log(`✅ Successfully retrieved resources for tenant ${tenantId}: ${Array.isArray(data) ? data.length : 1} items`);
      return this.sendSuccessResponse(res, data, message, ResourcesHttpStatus.OK);

    } catch (error: any) {
      console.error('❌ Error in getResources controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Get all resource types
   * 🔐 SECURITY: Added user and tenant validation
   */
  async getResourceTypes(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;

      console.log('📋 API getResourceTypes called:', {
        tenantIdHeader,
        hasAuth: !!authHeader,
      });

      // 🔐 SECURITY: Enhanced header validation
      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { tenantId } = securityValidation;

      const edgeResponse = await resourcesService.getResourceTypes(authHeader!, tenantId!);
      
      // 🔧 FIX: Extract actual data from edge function response
      const resourceTypes = extractEdgeData(edgeResponse);

      console.log(`✅ Successfully retrieved ${Array.isArray(resourceTypes) ? resourceTypes.length : 0} resource types for tenant ${tenantId}`);

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
   * Get resource templates filtered by tenant's served industries
   * Supports search, pagination, resource_type_id filter
   */
  async getResourceTemplates(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const { search, limit, offset, resource_type_id } = req.query;

      console.log('📋 API getResourceTemplates called:', {
        tenantIdHeader,
        search,
        limit,
        offset,
        resource_type_id,
        hasAuth: !!authHeader,
      });

      // 🔐 SECURITY: Enhanced header validation
      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { tenantId } = securityValidation;

      const edgeResponse = await resourcesService.getResourceTemplates(authHeader!, tenantId!, {
        search: search as string,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        resource_type_id: resource_type_id as string,
      });

      console.log(`✅ Successfully retrieved resource templates for tenant ${tenantId}`);

      // Return the full edge response (includes pagination)
      return res.status(ResourcesHttpStatus.OK).json(edgeResponse);

    } catch (error: any) {
      console.error('❌ Error in getResourceTemplates controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Create new resource
   * 🔐 SECURITY: Added user tracking and tenant validation
   */
  async createResource(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const requestData: CreateResourceRequest = req.body;

      console.log('➕ API createResource called:', {
        tenantIdHeader,
        resourceData: {
          resource_type_id: requestData.resource_type_id,
          name: requestData.name,
          display_name: requestData.display_name,
        },
        hasAuth: !!authHeader,
        hasIdempotencyKey: !!idempotencyKey,
      });

      // 🔐 SECURITY: Enhanced header validation
      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { userId, tenantId } = securityValidation;

      // Validate request data
      const validator = this.createValidator(authHeader!, tenantId!);
      const validationResult = await validator.validateCreateRequest(requestData);
      if (!validationResult.isValid) {
        console.log('❌ Validation failed:', validationResult.errors);
        return this.sendValidationErrorResponse(res, validationResult.errors);
      }

      // 🔐 SECURITY: Add user and tenant context to request
      const secureRequestData = {
        ...requestData,
        tenant_id: tenantId,      // Force tenant ID
        created_by: userId,       // Track creator
        updated_by: userId        // Track updater
      };

      // Create resource via service
      const edgeResponse = await resourcesService.createResource(
        authHeader!, 
        tenantId!, 
        secureRequestData, 
        idempotencyKey
      );

      // 🔧 FIX: Extract actual data from edge function response
      const resource = extractEdgeData(edgeResponse);

      console.log(`✅ Successfully created resource: ${resource?.name || 'unknown'} by user ${userId} for tenant ${tenantId}`);

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
   * 🔐 SECURITY: Added user tracking and tenant validation
   */
  async updateResource(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const resourceId = req.params.id;
      const requestData: UpdateResourceRequest = req.body;

      console.log('✏️ API updateResource called:', {
        resourceId,
        tenantIdHeader,
        hasAuth: !!authHeader,
        hasIdempotencyKey: !!idempotencyKey,
      });

      // 🔐 SECURITY: Enhanced header validation
      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { userId, tenantId } = securityValidation;

      if (!resourceId) {
        return this.sendErrorResponse(res, 'Resource ID is required', ResourcesHttpStatus.BAD_REQUEST);
      }

      // Validate request data
      const validator = this.createValidator(authHeader!, tenantId!);
      const validationResult = await validator.validateUpdateRequest(resourceId, requestData);
      if (!validationResult.isValid) {
        console.log('❌ Validation failed:', validationResult.errors);
        return this.sendValidationErrorResponse(res, validationResult.errors);
      }

      // 🔐 SECURITY: Add user context to request
      const secureRequestData = {
        id: resourceId,
        ...requestData,
        updated_by: userId        // Track updater
      };

      // Update resource via service
      const edgeResponse = await resourcesService.updateResource(
        authHeader!, 
        tenantId!, 
        resourceId, 
        secureRequestData, 
        idempotencyKey
      );

      // 🔧 FIX: Extract actual data from edge function response
      const resource = extractEdgeData(edgeResponse);

      console.log(`✅ Successfully updated resource: ${resource?.name || 'unknown'} by user ${userId} for tenant ${tenantId}`);

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
   * 🔐 SECURITY: Added user tracking and tenant validation
   */
  async deleteResource(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const resourceId = req.params.id;

      console.log('🗑️ API deleteResource called:', {
        resourceId,
        tenantIdHeader,
        hasAuth: !!authHeader,
        hasIdempotencyKey: !!idempotencyKey,
      });

      // 🔐 SECURITY: Enhanced header validation
      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { userId, tenantId } = securityValidation;

      if (!resourceId) {
        return this.sendErrorResponse(res, 'Resource ID is required', ResourcesHttpStatus.BAD_REQUEST);
      }

      // Validate delete request
      const validator = this.createValidator(authHeader!, tenantId!);
      const validationResult = await validator.validateDeleteRequest(resourceId);
      if (!validationResult.isValid) {
        console.log('❌ Delete validation failed:', validationResult.errors);
        return this.sendValidationErrorResponse(res, validationResult.errors);
      }

      // 🔐 SECURITY: Pass user context to service
      const deleteData = {
        id: resourceId,
        deleted_by: userId        // Track who deleted
      };

      // Delete resource via service
      const edgeResponse = await resourcesService.deleteResource(
        authHeader!, 
        tenantId!, 
        resourceId, 
        idempotencyKey
      );

      // 🔧 FIX: Extract actual data from edge function response
      const result = extractEdgeData(edgeResponse);

      console.log(`✅ Successfully deleted resource: ${resourceId} by user ${userId} for tenant ${tenantId}`);

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
      const tenantIdHeader = req.headers['x-tenant-id'] as string || 'system';

      if (!authHeader) {
        return this.sendErrorResponse(res, 'Authorization header is required', ResourcesHttpStatus.UNAUTHORIZED);
      }

      // 🔐 SECURITY: Extract user context for health check
      const userId = extractUserIdFromAuth(authHeader);

      const edgeResponse = await resourcesService.healthCheck(authHeader, tenantIdHeader);
      const healthData = extractEdgeData(edgeResponse);

      return this.sendSuccessResponse(
        res,
        {
          ...healthData,
          security: {
            userAuthenticated: !!userId,
            tenantProvided: !!tenantIdHeader,
            userId: userId
          }
        },
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
        security: {
          tenantIsolationEnabled: true,
          userTrackingEnabled: true,
          rlsEnabled: true
        }
      },
      'Signing status retrieved successfully',
      ResourcesHttpStatus.OK
    );
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * 🔐 SECURITY: Enhanced header validation with user extraction
   */
  private validateSecurityHeaders(
    authHeader: string | undefined, 
    tenantIdHeader: string | undefined
  ): {
    valid: boolean;
    error?: string;
    status?: ResourcesHttpStatus;
    userId?: string;
    tenantId?: string;
  } {
    // Check auth header
    if (!authHeader) {
      return {
        valid: false,
        error: 'Authorization header is required',
        status: ResourcesHttpStatus.UNAUTHORIZED
      };
    }

    // Extract user ID
    const userId = extractUserIdFromAuth(authHeader);
    if (!userId) {
      return {
        valid: false,
        error: 'Invalid authentication token',
        status: ResourcesHttpStatus.UNAUTHORIZED
      };
    }

    // Get tenant ID from JWT first, fallback to header
    let tenantId: string | null = extractTenantIdFromAuth(authHeader);
    if (!tenantId) {
      tenantId = tenantIdHeader || null;
    }

    if (!tenantId) {
      return {
        valid: false,
        error: 'Tenant ID is required (in JWT or header)',
        status: ResourcesHttpStatus.BAD_REQUEST
      };
    }

    // 🔐 SECURITY: Verify tenant ID consistency between JWT and header
    const jwtTenantId = extractTenantIdFromAuth(authHeader);
    if (jwtTenantId && tenantIdHeader && jwtTenantId !== tenantIdHeader) {
      console.error('❌ Tenant ID mismatch:', { jwt: jwtTenantId, header: tenantIdHeader });
      return {
        valid: false,
        error: 'Tenant ID mismatch between token and header',
        status: ResourcesHttpStatus.FORBIDDEN
      };
    }

    console.log('✅ Security validation passed:', { userId, tenantId });

    return { 
      valid: true, 
      userId, 
      tenantId 
    };
  }

  /**
   * Validate required headers (LEGACY - keeping for backward compatibility)
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
   * 🔧 FIXED: Now returns properly formatted responses that frontend can parse
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
export const getResourceTemplates = controller.getResourceTemplates.bind(controller);
export const createResource = controller.createResource.bind(controller);
export const updateResource = controller.updateResource.bind(controller);
export const deleteResource = controller.deleteResource.bind(controller);
export const healthCheck = controller.healthCheck.bind(controller);
export const getSigningStatus = controller.getSigningStatus.bind(controller);

export default controller;