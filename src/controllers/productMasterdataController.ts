// src/controllers/productMasterdataController.ts
import { Request, Response } from 'express';
import ProductMasterdataService from '../services/productMasterdataService';
import ProductMasterdataValidators from '../validators/productMasterdataValidators';
import { MasterDataErrorCodes } from '../types/productMasterdata';

class ProductMasterdataController {
  private productMasterdataService: ProductMasterdataService;

  constructor() {
    this.productMasterdataService = new ProductMasterdataService();
  }

  // =================================================================
  // EXISTING CONTROLLER METHODS (Preserved for backward compatibility)
  // =================================================================

  /**
   * Health check endpoint
   */
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🏥 Product Master Data - Health check requested');

      const healthResult = await this.productMasterdataService.healthCheck();
      
      const response = {
        success: true,
        status: 'healthy',
        service: 'product-masterdata',
        edge_function_status: healthResult.edge_function_healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString()
      };

      console.log('✅ Product Master Data - Health check completed');
      res.status(200).json(response);
    } catch (error) {
      console.error('❌ Product Master Data - Health check failed:', error);
      
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        service: 'product-masterdata',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get constants and configuration
   */
  getConstants = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('📋 Product Master Data - Constants requested');

      const constants = {
        endpoints: [
          '/health',
          '/constants', 
          '/global',
          '/tenant',
          '/global/categories',
          '/tenant/categories',
          '/industries',
          '/categories/all',
          '/categories/by-industry'
        ],
        query_parameters: [
          'category_name',
          'is_active',
          'page',
          'limit', 
          'search',
          'industry_id',
          'is_primary'
        ],
        required_headers: {
          global: ['Authorization'],
          tenant: ['Authorization', 'x-tenant-id']
        },
        common_categories: [
          'pricing_type',
          'status_type',
          'priority_type',
          'classification_type',
          'document_type',
          'currency_type',
          'country_type',
          'payment_terms',
          'delivery_terms',
          'contact_type'
        ],
        max_category_name_length: 100,
        min_category_name_length: 2,
        allowed_category_name_pattern: '^[a-zA-Z0-9_-]+$',
        pagination_limits: {
          default_page_size: 50,
          max_page_size: 100,
          min_page_size: 1,
          max_page_number: 10000
        },
        search_constraints: {
          min_search_length: 3,
          max_search_length: 100
        }
      };

      res.status(200).json({
        success: true,
        data: constants,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Product Master Data - Constants error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to get constants',
        code: MasterDataErrorCodes.INTERNAL_ERROR,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get global product master data
   */
  getGlobalMasterData = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔍 Product Master Data - Global master data requested');

      // Validate request
      const validation = ProductMasterdataValidators.validateGlobalMasterDataRequest(req);
      if (!validation.valid) {
        console.log('❌ Product Master Data - Validation failed:', validation.error);
        res.status(400).json(
          ProductMasterdataValidators.createValidationErrorResponse(
            validation.error!,
            MasterDataErrorCodes.INVALID_CATEGORY_NAME
          )
        );
        return;
      }

      // Extract parameters
      const { category_name, is_active = 'true' } = req.query;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const isActive = ProductMasterdataValidators.parseBooleanParam(is_active as string, true);

      // Call service
      const result = await this.productMasterdataService.getGlobalMasterData(
        category_name as string,
        isActive,
        userJWT
      );

      // Transform response for frontend
      const transformedResult = this.productMasterdataService.transformForFrontend(result);

      console.log(`✅ Product Master Data - Global data retrieved for category: ${category_name}`);
      res.status(result.success ? 200 : 400).json(transformedResult);
    } catch (error) {
      console.error('❌ Product Master Data - Global master data error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to get global master data',
        code: MasterDataErrorCodes.INTERNAL_ERROR,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get tenant-specific master data
   */
  getTenantMasterData = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔍 Product Master Data - Tenant master data requested');

      // Validate request
      const validation = ProductMasterdataValidators.validateTenantMasterDataRequest(req);
      if (!validation.valid) {
        console.log('❌ Product Master Data - Validation failed:', validation.error);
        res.status(400).json(
          ProductMasterdataValidators.createValidationErrorResponse(
            validation.error!,
            MasterDataErrorCodes.MISSING_TENANT_ID
          )
        );
        return;
      }

      // Extract parameters
      const { category_name, is_active = 'true' } = req.query;
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const isActive = ProductMasterdataValidators.parseBooleanParam(is_active as string, true);

      // Call service
      const result = await this.productMasterdataService.getTenantMasterData(
        category_name as string,
        isActive,
        userJWT,
        tenantId
      );

      // Transform response for frontend
      const transformedResult = this.productMasterdataService.transformForFrontend(result);

      console.log(`✅ Product Master Data - Tenant data retrieved for category: ${category_name}, tenant: ${tenantId}`);
      res.status(result.success ? 200 : 400).json(transformedResult);
    } catch (error) {
      console.error('❌ Product Master Data - Tenant master data error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to get tenant master data',
        code: MasterDataErrorCodes.INTERNAL_ERROR,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get all global categories
   */
  getAllGlobalCategories = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔍 Product Master Data - All global categories requested');

      // Validate request
      const validation = ProductMasterdataValidators.validateCategoriesListRequest(req);
      if (!validation.valid) {
        console.log('❌ Product Master Data - Validation failed:', validation.error);
        res.status(400).json(
          ProductMasterdataValidators.createValidationErrorResponse(
            validation.error!,
            MasterDataErrorCodes.INVALID_CATEGORY_NAME
          )
        );
        return;
      }

      // Extract parameters
      const { is_active = 'true' } = req.query;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const isActive = ProductMasterdataValidators.parseBooleanParam(is_active as string, true);

      // Call service
      const result = await this.productMasterdataService.getAllGlobalCategories(
        isActive,
        userJWT
      );

      // Transform response for frontend (skip data transform for category list - it's not detail data)
      const transformedResult = this.productMasterdataService.transformForFrontend(result, true);

      console.log('✅ Product Master Data - All global categories retrieved');
      res.status(result.success ? 200 : 400).json(transformedResult);
    } catch (error) {
      console.error('❌ Product Master Data - All global categories error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to get all global categories',
        code: MasterDataErrorCodes.INTERNAL_ERROR,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get all tenant categories
   */
  getAllTenantCategories = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔍 Product Master Data - All tenant categories requested');

      // Validate request
      const validation = ProductMasterdataValidators.validateTenantCategoriesListRequest(req);
      if (!validation.valid) {
        console.log('❌ Product Master Data - Validation failed:', validation.error);
        res.status(400).json(
          ProductMasterdataValidators.createValidationErrorResponse(
            validation.error!,
            MasterDataErrorCodes.MISSING_TENANT_ID
          )
        );
        return;
      }

      // Extract parameters
      const { is_active = 'true' } = req.query;
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const isActive = ProductMasterdataValidators.parseBooleanParam(is_active as string, true);

      // Call service
      const result = await this.productMasterdataService.getAllTenantCategories(
        isActive,
        userJWT,
        tenantId
      );

      // Transform response for frontend (skip data transform for category list - it's not detail data)
      const transformedResult = this.productMasterdataService.transformForFrontend(result, true);

      console.log(`✅ Product Master Data - All tenant categories retrieved for tenant: ${tenantId}`);
      res.status(result.success ? 200 : 400).json(transformedResult);
    } catch (error) {
      console.error('❌ Product Master Data - All tenant categories error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to get all tenant categories',
        code: MasterDataErrorCodes.INTERNAL_ERROR,
        timestamp: new Date().toISOString()
      });
    }
  };

  // =================================================================
  // NEW CONTROLLER METHODS (Enhanced functionality)
  // =================================================================

  /**
   * Get industries with pagination and search
   */
  getIndustries = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔍 Product Master Data - Industries requested');

      // Validate request
      const validation = ProductMasterdataValidators.validateIndustriesRequest(req);
      if (!validation.valid) {
        console.log('❌ Product Master Data - Validation failed:', validation.error);
        res.status(400).json(
          ProductMasterdataValidators.createValidationErrorResponse(
            validation.error!,
            MasterDataErrorCodes.INVALID_PAGINATION_PARAMS
          )
        );
        return;
      }

      // Extract and parse parameters
      const { page, limit, search, is_active = 'true', level, parent_id } = req.query;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const { page: parsedPage, limit: parsedLimit } = ProductMasterdataValidators.parsePaginationParams(
        page as string,
        limit as string
      );
      const sanitizedSearch = ProductMasterdataValidators.sanitizeSearchInput(search as string);
      const isActive = ProductMasterdataValidators.parseBooleanParam(is_active as string, true);
      const parsedLevel = level !== undefined ? parseInt(level as string) : undefined;
      const parsedParentId = parent_id as string | undefined;

      console.log(`📊 Industries request params - Page: ${parsedPage}, Limit: ${parsedLimit}, Search: "${sanitizedSearch}", Active: ${isActive}, Level: ${parsedLevel}, ParentId: ${parsedParentId}`);

      // Call service
      const result = await this.productMasterdataService.getIndustries(
        parsedPage,
        parsedLimit,
        sanitizedSearch,
        isActive,
        userJWT,
        parsedLevel,
        parsedParentId
      );

      console.log(`✅ Product Master Data - Industries retrieved (${result.data?.length || 0} records)`);
      res.status(result.success ? 200 : 400).json({
        ...result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Product Master Data - Industries error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to get industries',
        code: MasterDataErrorCodes.INTERNAL_ERROR,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get all categories with pagination and search
   */
  getAllCategories = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔍 Product Master Data - All categories requested');

      // Validate request
      const validation = ProductMasterdataValidators.validateAllCategoriesRequest(req);
      if (!validation.valid) {
        console.log('❌ Product Master Data - Validation failed:', validation.error);
        res.status(400).json(
          ProductMasterdataValidators.createValidationErrorResponse(
            validation.error!,
            MasterDataErrorCodes.INVALID_PAGINATION_PARAMS
          )
        );
        return;
      }

      // Extract and parse parameters
      const { page, limit, search, is_active = 'true' } = req.query;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      
      const { page: parsedPage, limit: parsedLimit } = ProductMasterdataValidators.parsePaginationParams(
        page as string, 
        limit as string
      );
      const sanitizedSearch = ProductMasterdataValidators.sanitizeSearchInput(search as string);
      const isActive = ProductMasterdataValidators.parseBooleanParam(is_active as string, true);

      console.log(`📊 All categories request params - Page: ${parsedPage}, Limit: ${parsedLimit}, Search: "${sanitizedSearch}", Active: ${isActive}`);

      // Call service
      const result = await this.productMasterdataService.getAllCategories(
        parsedPage,
        parsedLimit,
        sanitizedSearch,
        isActive,
        userJWT
      );

      console.log(`✅ Product Master Data - All categories retrieved (${result.data?.length || 0} records)`);
      res.status(result.success ? 200 : 400).json({
        ...result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Product Master Data - All categories error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to get all categories',
        code: MasterDataErrorCodes.INTERNAL_ERROR,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get industry-specific categories with filtering
   */
  getIndustryCategoriesFiltered = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔍 Product Master Data - Industry categories requested');

      // Validate request
      const validation = ProductMasterdataValidators.validateIndustryCategoriesRequest(req);
      if (!validation.valid) {
        console.log('❌ Product Master Data - Validation failed:', validation.error);
        res.status(400).json(
          ProductMasterdataValidators.createValidationErrorResponse(
            validation.error!,
            MasterDataErrorCodes.INVALID_INDUSTRY_ID
          )
        );
        return;
      }

      // Extract and parse parameters
      const { industry_id, is_primary, page, limit, search, is_active = 'true' } = req.query;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      
      const { page: parsedPage, limit: parsedLimit } = ProductMasterdataValidators.parsePaginationParams(
        page as string, 
        limit as string
      );
      const sanitizedSearch = ProductMasterdataValidators.sanitizeSearchInput(search as string);
      const isActive = ProductMasterdataValidators.parseBooleanParam(is_active as string, true);
      const isPrimary = ProductMasterdataValidators.parseBooleanParam(is_primary as string, false);

      console.log(`📊 Industry categories request params - Industry: ${industry_id}, Primary: ${isPrimary}, Page: ${parsedPage}, Limit: ${parsedLimit}, Search: "${sanitizedSearch}", Active: ${isActive}`);

      // Call service
      const result = await this.productMasterdataService.getIndustryCategoriesFiltered(
        industry_id as string,
        isActive,
        isPrimary,
        parsedPage,
        parsedLimit,
        sanitizedSearch,
        userJWT
      );

      console.log(`✅ Product Master Data - Industry categories retrieved for industry ${industry_id} (${result.data?.length || 0} records)`);
      res.status(result.success ? 200 : 400).json({
        ...result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Product Master Data - Industry categories error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to get industry categories',
        code: MasterDataErrorCodes.INTERNAL_ERROR,
        timestamp: new Date().toISOString()
      });
    }
  };

  // =================================================================
  // UTILITY METHODS
  // =================================================================

  /**
   * Handle common error response formatting
   */
  private handleErrorResponse(
    res: Response, 
    error: any, 
    message: string, 
    code: string = MasterDataErrorCodes.INTERNAL_ERROR,
    statusCode: number = 500
  ): void {
    console.error(`❌ Product Master Data - ${message}:`, error);
    
    res.status(statusCode).json({
      success: false,
      error: message,
      code: code,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Extract and validate JWT token
   */
  private extractJWTToken(req: Request): string {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Invalid or missing authorization header');
    }
    return authHeader.replace('Bearer ', '');
  }

  /**
   * Log request details for debugging
   */
  private logRequest(req: Request, endpoint: string): void {
    console.log(`📨 Product Master Data - ${endpoint} request:`, {
      method: req.method,
      url: req.url,
      query: req.query,
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-tenant-id': req.headers['x-tenant-id'],
        'authorization': req.headers.authorization ? 'Bearer [REDACTED]' : 'None'
      },
      timestamp: new Date().toISOString()
    });
  }
}

export default ProductMasterdataController;