// src/controllers/serviceCatalogController.ts
// Service Catalog API Controller - Production Grade

import { Request, Response } from 'express';
import { ServiceCatalogValidator } from '../validators/serviceCatalogValidator';
import serviceCatalogService from '../services/serviceCatalogService';
import {
  CreateServiceRequest,
  UpdateServiceRequest,
  GetServicesQuery,
  ServiceCatalogHttpStatus,
  ApiResponse,
  ErrorResponse,
  ServiceCatalogServiceConfig
} from '../types/serviceCatalogTypes';

/**
 * Extract actual data from edge function response
 * Handles both wrapped and direct responses
 */
function extractEdgeData(edgeResponse: any): any {
  console.log('Extracting edge data from:', edgeResponse);
  
  // Handle edge function format: { success: true, data: [...] }
  if (edgeResponse?.success && edgeResponse?.data !== undefined) {
    console.log('Extracted edge data:', edgeResponse.data);
    return edgeResponse.data;
  }
  
  // Handle direct array/object
  if (Array.isArray(edgeResponse) || (typeof edgeResponse === 'object' && edgeResponse !== null)) {
    console.log('Using direct data:', edgeResponse);
    return edgeResponse;
  }
  
  // Handle primitive values
  if (typeof edgeResponse === 'number' || typeof edgeResponse === 'string') {
    console.log('Using primitive data:', edgeResponse);
    return edgeResponse;
  }
  
  console.log('Unknown data format, returning empty array');
  return [];
}

/**
 * Extract user ID from JWT token for audit trail
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
    console.error('Error extracting user ID from token:', error);
    return null;
  }
}

/**
 * Extract tenant ID from JWT token
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
    console.error('Error extracting tenant ID from token:', error);
    return null;
  }
}

/**
 * Service Catalog Controller - Handles HTTP requests, validation, and response formatting
 */
export class ServiceCatalogController {
  /**
   * Create validator with auth context per request
   */
  private createValidator(authHeader: string, tenantId: string): ServiceCatalogValidator {
    return new ServiceCatalogValidator(
      {
        getMasterData: async () => {
          const edgeResponse = await serviceCatalogService.getMasterDataForValidator(authHeader, tenantId);
          return extractEdgeData(edgeResponse);
        },
        checkServiceNameExists: async (name: string, categoryId: string, excludeServiceId?: string) => {
          const edgeResponse = await serviceCatalogService.checkServiceNameExists(authHeader, tenantId, name, categoryId, excludeServiceId);
          return extractEdgeData(edgeResponse);
        },
        getServiceById: async (serviceId: string) => {
          const edgeResponse = await serviceCatalogService.getServiceById(authHeader, tenantId, serviceId);
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
   * Get services (all, filtered, or single)
   */
  async getServices(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const { 
        search_term, 
        category_id, 
        industry_id, 
        is_active, 
        price_min, 
        price_max, 
        currency, 
        has_resources,
        sort_by, 
        sort_direction, 
        limit, 
        offset 
      } = req.query;

      console.log('API getServices called:', {
        tenantIdHeader,
        hasFilters: !!(search_term || category_id || industry_id),
        hasAuth: !!authHeader,
      });

      // Enhanced header validation
      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { userId, tenantId } = securityValidation;

      // Build filters object with proper type conversion
      const filters: GetServicesQuery = {
        search_term: typeof search_term === 'string' ? search_term : undefined,
        category_id: typeof category_id === 'string' ? category_id : undefined,
        industry_id: typeof industry_id === 'string' ? industry_id : undefined,
        is_active: typeof is_active === 'string' ? (is_active === 'true' ? true : is_active === 'false' ? false : undefined) : undefined,
        price_min: typeof price_min === 'string' ? parseFloat(price_min) : undefined,
        price_max: typeof price_max === 'string' ? parseFloat(price_max) : undefined,
        currency: typeof currency === 'string' ? currency : undefined,
        has_resources: typeof has_resources === 'string' ? (has_resources === 'true' ? true : has_resources === 'false' ? false : undefined) : undefined,
        sort_by: typeof sort_by === 'string' ? sort_by as any : undefined,
        sort_direction: typeof sort_direction === 'string' ? sort_direction as 'asc' | 'desc' : undefined,
        limit: typeof limit === 'string' ? parseInt(limit) : 50,
        offset: typeof offset === 'string' ? parseInt(offset) : 0
      };

      const edgeResponse = await serviceCatalogService.getServices(authHeader!, tenantId!, filters);
      const data = extractEdgeData(edgeResponse);

      console.log(`Successfully retrieved services for tenant ${tenantId}: ${data?.items?.length || 0} items`);
      return this.sendSuccessResponse(res, data, 'Services retrieved successfully', ServiceCatalogHttpStatus.OK);

    } catch (error: any) {
      console.error('Error in getServices controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Get single service by ID
   */
  async getService(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const serviceId = req.params.id;

      console.log('API getService called:', {
        serviceId,
        tenantIdHeader,
        hasAuth: !!authHeader,
      });

      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { tenantId } = securityValidation;

      if (!serviceId) {
        return this.sendErrorResponse(res, 'Service ID is required', ServiceCatalogHttpStatus.BAD_REQUEST);
      }

      const edgeResponse = await serviceCatalogService.getServiceById(authHeader!, tenantId!, serviceId);
      
      // Fix the type checking here
      if (!edgeResponse) {
        return this.sendErrorResponse(res, 'Service not found', ServiceCatalogHttpStatus.NOT_FOUND);
      }

      const data = extractEdgeData(edgeResponse);

      console.log(`Successfully retrieved service ${serviceId} for tenant ${tenantId}`);
      return this.sendSuccessResponse(res, data, 'Service retrieved successfully', ServiceCatalogHttpStatus.OK);

    } catch (error: any) {
      console.error('Error in getService controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Get service resources
   */
  async getServiceResources(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const serviceId = req.params.id;

      console.log('API getServiceResources called:', {
        serviceId,
        tenantIdHeader,
        hasAuth: !!authHeader,
      });

      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { tenantId } = securityValidation;

      if (!serviceId) {
        return this.sendErrorResponse(res, 'Service ID is required', ServiceCatalogHttpStatus.BAD_REQUEST);
      }

      const edgeResponse = await serviceCatalogService.getServiceResources(authHeader!, tenantId!, serviceId);
      const data = extractEdgeData(edgeResponse);

      console.log(`Successfully retrieved resources for service ${serviceId}`);
      return this.sendSuccessResponse(res, data, 'Service resources retrieved successfully', ServiceCatalogHttpStatus.OK);

    } catch (error: any) {
      console.error('Error in getServiceResources controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Get master data (categories, industries, currencies)
   */
  async getMasterData(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;

      console.log('API getMasterData called:', {
        tenantIdHeader,
        hasAuth: !!authHeader,
      });

      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { tenantId } = securityValidation;

      const edgeResponse = await serviceCatalogService.getMasterData(authHeader!, tenantId!);
      const data = extractEdgeData(edgeResponse);

      console.log(`Successfully retrieved master data for tenant ${tenantId}`);
      return this.sendSuccessResponse(res, data, 'Master data retrieved successfully', ServiceCatalogHttpStatus.OK);

    } catch (error: any) {
      console.error('Error in getMasterData controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Create new service
   */
  async createService(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const requestData: CreateServiceRequest = req.body;

      console.log('API createService called:', {
        tenantIdHeader,
        serviceName: requestData.service_name,
        hasAuth: !!authHeader,
        hasIdempotencyKey: !!idempotencyKey,
      });

      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { userId, tenantId } = securityValidation;

      // Validate request data
      const validator = this.createValidator(authHeader!, tenantId!);
      const validationResult = await validator.validateCreateRequest(requestData);
      if (!validationResult.isValid) {
        console.log('Validation failed:', validationResult.errors);
        return this.sendValidationErrorResponse(res, validationResult.errors);
      }

      // Add security context
      const secureRequestData = {
        ...requestData,
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId
      };

      const edgeResponse = await serviceCatalogService.createService(
        authHeader!, 
        tenantId!, 
        secureRequestData, 
        idempotencyKey
      );

      const service = extractEdgeData(edgeResponse);

      console.log(`Successfully created service: ${service?.service_name || 'unknown'} by user ${userId} for tenant ${tenantId}`);

      return this.sendSuccessResponse(
        res, 
        service, 
        'Service created successfully', 
        ServiceCatalogHttpStatus.CREATED
      );

    } catch (error: any) {
      console.error('Error in createService controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Update existing service
   */
  async updateService(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const serviceId = req.params.id;
      const requestData: UpdateServiceRequest = req.body;

      console.log('API updateService called:', {
        serviceId,
        tenantIdHeader,
        hasAuth: !!authHeader,
        hasIdempotencyKey: !!idempotencyKey,
      });

      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { userId, tenantId } = securityValidation;

      if (!serviceId) {
        return this.sendErrorResponse(res, 'Service ID is required', ServiceCatalogHttpStatus.BAD_REQUEST);
      }

      // Validate request data
      const validator = this.createValidator(authHeader!, tenantId!);
      const validationResult = await validator.validateUpdateRequest(serviceId, requestData);
      if (!validationResult.isValid) {
        console.log('Validation failed:', validationResult.errors);
        return this.sendValidationErrorResponse(res, validationResult.errors);
      }

      // Add security context
      const secureRequestData = {
        id: serviceId,
        ...requestData,
        updated_by: userId
      };

      const edgeResponse = await serviceCatalogService.updateService(
        authHeader!, 
        tenantId!, 
        serviceId, 
        secureRequestData, 
        idempotencyKey
      );

      const service = extractEdgeData(edgeResponse);

      console.log(`Successfully updated service: ${service?.service_name || 'unknown'} by user ${userId} for tenant ${tenantId}`);

      return this.sendSuccessResponse(
        res, 
        service, 
        'Service updated successfully', 
        ServiceCatalogHttpStatus.OK
      );

    } catch (error: any) {
      console.error('Error in updateService controller:', error);
      return this.handleServiceError(res, error);
    }
  }

  /**
   * Delete service
   */
  async deleteService(req: Request, res: Response): Promise<Response> {
    try {
      const authHeader = req.headers.authorization;
      const tenantIdHeader = req.headers['x-tenant-id'] as string;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const serviceId = req.params.id;

      console.log('API deleteService called:', {
        serviceId,
        tenantIdHeader,
        hasAuth: !!authHeader,
        hasIdempotencyKey: !!idempotencyKey,
      });

      const securityValidation = this.validateSecurityHeaders(authHeader, tenantIdHeader);
      if (!securityValidation.valid) {
        return this.sendErrorResponse(res, securityValidation.error!, securityValidation.status!);
      }

      const { userId, tenantId } = securityValidation;

      if (!serviceId) {
        return this.sendErrorResponse(res, 'Service ID is required', ServiceCatalogHttpStatus.BAD_REQUEST);
      }

      // Validate delete request
      const validator = this.createValidator(authHeader!, tenantId!);
      const validationResult = await validator.validateDeleteRequest(serviceId);
      if (!validationResult.isValid) {
        console.log('Delete validation failed:', validationResult.errors);
        return this.sendValidationErrorResponse(res, validationResult.errors);
      }

      const edgeResponse = await serviceCatalogService.deleteService(
        authHeader!, 
        tenantId!, 
        serviceId, 
        idempotencyKey
      );

      const result = extractEdgeData(edgeResponse);

      console.log(`Successfully deleted service: ${serviceId} by user ${userId} for tenant ${tenantId}`);

      return this.sendSuccessResponse(
        res, 
        result, 
        'Service deleted successfully', 
        ServiceCatalogHttpStatus.OK
      );

    } catch (error: any) {
      console.error('Error in deleteService controller:', error);
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
        return this.sendErrorResponse(res, 'Authorization header is required', ServiceCatalogHttpStatus.UNAUTHORIZED);
      }

      const userId = extractUserIdFromAuth(authHeader);

      const edgeResponse = await serviceCatalogService.healthCheck(authHeader, tenantIdHeader);
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
        ServiceCatalogHttpStatus.OK
      );

    } catch (error: any) {
      console.error('Health check failed:', error);
      return this.sendErrorResponse(
        res, 
        'Health check failed', 
        ServiceCatalogHttpStatus.INTERNAL_ERROR,
        error.message
      );
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Enhanced header validation with user extraction
   */
  private validateSecurityHeaders(
    authHeader: string | undefined, 
    tenantIdHeader: string | undefined
  ): {
    valid: boolean;
    error?: string;
    status?: ServiceCatalogHttpStatus;
    userId?: string;
    tenantId?: string;
  } {
    // Check auth header
    if (!authHeader) {
      return {
        valid: false,
        error: 'Authorization header is required',
        status: ServiceCatalogHttpStatus.UNAUTHORIZED
      };
    }

    // Extract user ID
    const userId = extractUserIdFromAuth(authHeader);
    if (!userId) {
      return {
        valid: false,
        error: 'Invalid authentication token',
        status: ServiceCatalogHttpStatus.UNAUTHORIZED
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
        status: ServiceCatalogHttpStatus.BAD_REQUEST
      };
    }

    // Verify tenant ID consistency between JWT and header
    const jwtTenantId = extractTenantIdFromAuth(authHeader);
    if (jwtTenantId && tenantIdHeader && jwtTenantId !== tenantIdHeader) {
      console.error('Tenant ID mismatch:', { jwt: jwtTenantId, header: tenantIdHeader });
      return {
        valid: false,
        error: 'Tenant ID mismatch between token and header',
        status: ServiceCatalogHttpStatus.FORBIDDEN
      };
    }

    console.log('Security validation passed:', { userId, tenantId });

    return { 
      valid: true, 
      userId, 
      tenantId 
    };
  }

  /**
   * Send success response with standard API format
   */
  private sendSuccessResponse<T>(
    res: Response,
    data: T,
    message: string,
    status: ServiceCatalogHttpStatus = ServiceCatalogHttpStatus.OK
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
    status: ServiceCatalogHttpStatus,
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

    return res.status(ServiceCatalogHttpStatus.BAD_REQUEST).json(response);
  }

  /**
   * Handle service layer errors
   */
  private handleServiceError(res: Response, error: any): Response {
    // Map error types to HTTP status codes
    const statusMap: Record<string, ServiceCatalogHttpStatus> = {
      validation_error: ServiceCatalogHttpStatus.BAD_REQUEST,
      not_found: ServiceCatalogHttpStatus.NOT_FOUND,
      conflict: ServiceCatalogHttpStatus.CONFLICT,
      unauthorized: ServiceCatalogHttpStatus.UNAUTHORIZED,
      forbidden: ServiceCatalogHttpStatus.FORBIDDEN,
      rate_limited: ServiceCatalogHttpStatus.RATE_LIMITED,
      service_unavailable: ServiceCatalogHttpStatus.SERVICE_UNAVAILABLE,
      internal_error: ServiceCatalogHttpStatus.INTERNAL_ERROR
    };

    if (error.type) {
      const status = statusMap[error.type] || ServiceCatalogHttpStatus.INTERNAL_ERROR;
      const details = error.details?.map((d: any) => d.message).join(', ');
      return this.sendErrorResponse(res, error.message, status, details);
    }

    // Generic error handling
    console.error('Unhandled service error:', error);
    return this.sendErrorResponse(
      res, 
      'Internal server error', 
      ServiceCatalogHttpStatus.INTERNAL_ERROR,
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
const controller = new ServiceCatalogController();

export const getServices = controller.getServices.bind(controller);
export const getService = controller.getService.bind(controller);
export const getServiceResources = controller.getServiceResources.bind(controller);
export const getMasterData = controller.getMasterData.bind(controller);
export const createService = controller.createService.bind(controller);
export const updateService = controller.updateService.bind(controller);
export const deleteService = controller.deleteService.bind(controller);
export const healthCheck = controller.healthCheck.bind(controller);

export default controller;