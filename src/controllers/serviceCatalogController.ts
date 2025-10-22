// Backend-src/controllers/serviceCatalogController.ts
// Service Catalog Controller - Express API Layer
// ✅ FIXED: No Supabase client needed - matches ContactController pattern
// ✅ UPDATED: Boolean status + variant support + new endpoints

import { Request, Response } from 'express';
import { ServiceCatalogService } from '../services/serviceCatalogService';
import { GetServicesQuery } from '../types/serviceCatalogTypes';

// ============================================================================
// TYPE GUARDS & VALIDATORS
// ============================================================================

/**
 * Valid sort_by options
 */
const VALID_SORT_BY = ['name', 'price', 'created_at', 'sort_order'] as const;
type ValidSortBy = typeof VALID_SORT_BY[number];

/**
 * Valid sort_direction options
 */
const VALID_SORT_DIRECTION = ['asc', 'desc'] as const;
type ValidSortDirection = typeof VALID_SORT_DIRECTION[number];

/**
 * Type guard for sort_by
 */
function isValidSortBy(value: any): value is ValidSortBy {
  return VALID_SORT_BY.includes(value);
}

/**
 * Type guard for sort_direction
 */
function isValidSortDirection(value: any): value is ValidSortDirection {
  return VALID_SORT_DIRECTION.includes(value);
}

/**
 * Parse and validate sort_by parameter
 */
function parseSortBy(value: any): ValidSortBy {
  if (isValidSortBy(value)) {
    return value;
  }
  return 'created_at'; // Default
}

/**
 * Parse and validate sort_direction parameter
 */
function parseSortDirection(value: any): ValidSortDirection {
  if (isValidSortDirection(value)) {
    return value;
  }
  return 'desc'; // Default
}

/**
 * Parse boolean query parameter
 */
function parseBoolean(value: any): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * Parse number with validation
 */
function parseNumber(value: any, defaultValue?: number): number | undefined {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ============================================================================
// SERVICE CATALOG CONTROLLER CLASS
// ============================================================================

class ServiceCatalogController {
  private serviceCatalogService: ServiceCatalogService;

  constructor() {
    // ✅ Simple initialization - no Supabase client needed
    this.serviceCatalogService = new ServiceCatalogService();
    console.log('✅ Service Catalog Controller: Initialized successfully');
  }

  // ==========================================================================
  // MASTER DATA ENDPOINTS
  // ==========================================================================

  /**
   * Get master data (categories, industries, currencies, tax rates)
   * GET /api/service-catalog/master-data
   */
  getMasterData = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Getting master data', {
        requestId,
        tenantId,
        environment
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      const masterData = await this.serviceCatalogService.getMasterData(
        accessToken,
        tenantId,
        environment
      );

      res.status(200).json({
        success: true,
        data: masterData,
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to get master data', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'MASTER_DATA_ERROR',
          message: 'Failed to fetch master data',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  // ==========================================================================
  // SERVICE QUERY ENDPOINTS
  // ==========================================================================

  /**
   * Query service catalog items with filters
   * GET /api/service-catalog/services
   */
  getServices = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Querying services', {
        requestId,
        tenantId,
        query: req.query
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      // Parse filters with proper type safety
      const filters: GetServicesQuery = {
        search_term: req.query.search_term as string | undefined,
        category_id: req.query.category_id as string | undefined,
        industry_id: req.query.industry_id as string | undefined,
        
        // Parse boolean with validation
        is_active: parseBoolean(req.query.is_active),
        has_resources: parseBoolean(req.query.has_resources),
        
        // Parse numbers with validation
        price_min: parseNumber(req.query.price_min),
        price_max: parseNumber(req.query.price_max),
        
        // String parameters
        currency: req.query.currency as string | undefined,
        
        // Parse sort parameters with type guards
        sort_by: parseSortBy(req.query.sort_by),
        sort_direction: parseSortDirection(req.query.sort_direction),
        
        // Parse pagination with defaults
        limit: parseNumber(req.query.limit, 50),
        offset: parseNumber(req.query.offset, 0)
      };

      console.log('Parsed filters', {
        requestId,
        filters: {
          hasSearch: !!filters.search_term,
          hasCategory: !!filters.category_id,
          hasIndustry: !!filters.industry_id,
          isActive: filters.is_active,
          sortBy: filters.sort_by,
          sortDirection: filters.sort_direction,
          limit: filters.limit,
          offset: filters.offset
        }
      });

      const result = await this.serviceCatalogService.queryServices(
        filters,
        accessToken,
        tenantId,
        environment
      );

      res.status(200).json({
        success: true,
        data: result,
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to query services', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'QUERY_ERROR',
          message: 'Failed to query services',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Get a single service by ID
   * GET /api/service-catalog/services/:id
   */
  getService = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const serviceId = req.params.id;
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Getting service by ID', {
        requestId,
        serviceId,
        tenantId
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      const service = await this.serviceCatalogService.getServiceById(
        serviceId,
        accessToken,
        tenantId,
        environment
      );

      res.status(200).json({
        success: true,
        data: service,
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to get service', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      const statusCode = error.message.includes('not found') ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: {
          code: statusCode === 404 ? 'NOT_FOUND' : 'FETCH_ERROR',
          message: statusCode === 404 ? 'Service not found' : 'Failed to fetch service',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Get service resources
   * GET /api/service-catalog/services/:id/resources
   */
  getServiceResources = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const serviceId = req.params.id;
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Getting service resources', {
        requestId,
        serviceId,
        tenantId
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      const resources = await this.serviceCatalogService.getServiceResources(
        serviceId,
        accessToken,
        tenantId,
        environment
      );

      res.status(200).json({
        success: true,
        data: resources,
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to get service resources', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'RESOURCES_ERROR',
          message: 'Failed to fetch service resources',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  // ==========================================================================
  // SERVICE CRUD ENDPOINTS
  // ==========================================================================

  /**
   * Create a new service catalog item
   * POST /api/service-catalog/services
   */
  createService = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Creating service', {
        requestId,
        tenantId,
        serviceName: req.body.service_name,
        serviceType: req.body.service_type,
        isVariant: req.body.is_variant,
        hasParentId: !!req.body.parent_id
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      // Validate service data
      const validation = this.serviceCatalogService.validateServiceData(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Service data validation failed',
            details: validation.errors
          },
          metadata: {
            request_id: requestId,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const service = await this.serviceCatalogService.createService(
        req.body,
        accessToken,
        tenantId,
        environment
      );

      console.log('Service created successfully', {
        requestId,
        serviceId: service.id,
        serviceName: service.service_name,
        status: service.status,
        isVariant: service.is_variant,
        parentId: service.parent_id
      });

      res.status(201).json({
        success: true,
        data: service,
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to create service', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      const statusCode = error.message.includes('already exists') ? 409 : 500;

      res.status(statusCode).json({
        success: false,
        error: {
          code: statusCode === 409 ? 'DUPLICATE_SKU' : 'CREATE_ERROR',
          message: statusCode === 409 ? 'Service with this SKU already exists' : 'Failed to create service',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Update a service catalog item
   * PUT /api/service-catalog/services/:id
   * Creates new version with parent_id
   */
  updateService = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const serviceId = req.params.id;
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Updating service (creating new version)', {
        requestId,
        serviceId,
        tenantId,
        serviceName: req.body.service_name
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      // Validate service data
      const validation = this.serviceCatalogService.validateServiceData(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Service data validation failed',
            details: validation.errors
          },
          metadata: {
            request_id: requestId,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      const service = await this.serviceCatalogService.updateService(
        serviceId,
        req.body,
        accessToken,
        tenantId,
        environment
      );

      console.log('Service updated successfully (new version created)', {
        requestId,
        oldServiceId: serviceId,
        newServiceId: service.id,
        serviceName: service.service_name,
        status: service.status,
        parentId: service.parent_id
      });

      res.status(200).json({
        success: true,
        data: service,
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to update service', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      const statusCode = error.message.includes('not found') ? 404 :
                         error.message.includes('already exists') ? 409 : 500;

      res.status(statusCode).json({
        success: false,
        error: {
          code: statusCode === 404 ? 'NOT_FOUND' : 
                statusCode === 409 ? 'DUPLICATE_SKU' : 'UPDATE_ERROR',
          message: statusCode === 404 ? 'Service not found' :
                   statusCode === 409 ? 'Service with this SKU already exists' :
                   'Failed to update service',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Delete (deactivate) a service
   * DELETE /api/service-catalog/services/:id
   * Sets status to false (soft delete)
   */
  deleteService = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const serviceId = req.params.id;
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Deactivating service (soft delete)', {
        requestId,
        serviceId,
        tenantId
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      const result = await this.serviceCatalogService.deleteService(
        serviceId,
        accessToken,
        tenantId,
        environment
      );

      console.log('Service deactivated successfully', {
        requestId,
        serviceId: result.service.id,
        serviceName: result.service.name,
        newStatus: result.service.status
      });

      res.status(200).json({
        success: true,
        data: result,
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to deactivate service', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      const statusCode = error.message.includes('not found') || 
                         error.message.includes('already inactive') ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: {
          code: statusCode === 404 ? 'NOT_FOUND' : 'DELETE_ERROR',
          message: statusCode === 404 ? 'Service not found or already inactive' : 'Failed to deactivate service',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  // ==========================================================================
  // SERVICE STATUS MANAGEMENT ENDPOINTS
  // ==========================================================================

  /**
   * Toggle service status (activate/deactivate)
   * PATCH /api/service-catalog/services/:id/status
   */
  toggleServiceStatus = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const serviceId = req.params.id;
      const newStatus = req.body.status;
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Toggling service status', {
        requestId,
        serviceId,
        tenantId,
        newStatus,
        statusType: typeof newStatus
      });

      if (typeof newStatus !== 'boolean') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: 'Status must be a boolean (true or false)',
            details: `Received: ${typeof newStatus} with value: ${newStatus}`
          },
          metadata: {
            request_id: requestId,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      const service = await this.serviceCatalogService.toggleServiceStatus(
        serviceId,
        newStatus,
        accessToken,
        tenantId,
        environment
      );

      console.log('Service status toggled successfully', {
        requestId,
        serviceId: service.id,
        serviceName: service.service_name,
        newStatus: service.status
      });

      res.status(200).json({
        success: true,
        data: {
          message: `Service ${newStatus ? 'activated' : 'deactivated'} successfully`,
          service
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to toggle service status', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      const statusCode = error.message.includes('not found') ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: {
          code: statusCode === 404 ? 'NOT_FOUND' : 'TOGGLE_STATUS_ERROR',
          message: statusCode === 404 ? 'Service not found' : 'Failed to toggle service status',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Activate (restore) a service
   * POST /api/service-catalog/services/:id/activate
   * Sets status to true
   */
  activateService = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const serviceId = req.params.id;
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Activating service', {
        requestId,
        serviceId,
        tenantId
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      const service = await this.serviceCatalogService.activateService(
        serviceId,
        accessToken,
        tenantId,
        environment
      );

      console.log('Service activated successfully', {
        requestId,
        serviceId: service.id,
        serviceName: service.service_name,
        newStatus: service.status
      });

      res.status(200).json({
        success: true,
        data: {
          message: 'Service activated successfully',
          service
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to activate service', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      const statusCode = error.message.includes('not found') || 
                         error.message.includes('already active') ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: {
          code: statusCode === 404 ? 'NOT_FOUND' : 'ACTIVATE_ERROR',
          message: statusCode === 404 ? 'Service not found or already active' : 'Failed to activate service',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  // ==========================================================================
  // SERVICE STATISTICS & VERSION HISTORY
  // ==========================================================================

  /**
   * Get service statistics
   * GET /api/service-catalog/services/statistics
   */
  getServiceStatistics = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Getting service statistics', {
        requestId,
        tenantId
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      const statistics = await this.serviceCatalogService.getServiceStatistics(
        accessToken,
        tenantId,
        environment
      );

      res.status(200).json({
        success: true,
        data: statistics,
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to get service statistics', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'STATISTICS_ERROR',
          message: 'Failed to fetch service statistics',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Get service version history
   * GET /api/service-catalog/services/:id/versions
   */
  getServiceVersionHistory = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const serviceId = req.params.id;
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';

      console.log('Getting service version history', {
        requestId,
        serviceId,
        tenantId
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      const versions = await this.serviceCatalogService.getServiceVersionHistory(
        serviceId,
        accessToken,
        tenantId,
        environment
      );

      res.status(200).json({
        success: true,
        data: {
          service_id: serviceId,
          versions: versions,
          total_versions: versions.length
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Failed to get service version history', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'VERSION_HISTORY_ERROR',
          message: 'Failed to fetch service version history',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  // ==========================================================================
  // HEALTH CHECK
  // ==========================================================================

  /**
   * Health check with edge function verification
   * GET /api/service-catalog/health
   * 
   * NOTE: This method is NOT used by default in routes.
   * The routes file uses a simple lightweight health check instead.
   * This method is available if you need authenticated health checks
   * that verify edge function connectivity.
   */
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    const requestId = `req_${Date.now()}`;
    
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;

      console.log('Health check requested', {
        requestId,
        tenantId
      });

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is required'
          }
        });
        return;
      }

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'x-tenant-id header is required'
          }
        });
        return;
      }

      // Extract token from Bearer header
      const accessToken = authHeader.replace('Bearer ', '');

      const health = await this.serviceCatalogService.healthCheck(
        accessToken,
        tenantId
      );

      res.status(200).json({
        success: true,
        data: health,
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Health check failed', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      res.status(503).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Service health check failed',
          details: error.message
        },
        metadata: {
          request_id: requestId,
          timestamp: new Date().toISOString()
        }
      });
    }
  };
}

// ============================================================================
// EXPORT CONTROLLER INSTANCE
// ============================================================================

export default new ServiceCatalogController();