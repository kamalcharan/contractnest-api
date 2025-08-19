// src/controllers/productMasterdataController.ts
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import ProductMasterdataService from '../services/productMasterdataService';

class ProductMasterdataController {
  private productMasterdataService: ProductMasterdataService;

  constructor() {
    this.productMasterdataService = new ProductMasterdataService();
  }

  /**
   * GET /api/product-masterdata/global
   * Get global product master data for a specific category
   */
  getGlobalMasterData = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const { category_name, is_active = 'true' } = req.query;

      if (!category_name) {
        res.status(400).json({
          success: false,
          error: 'category_name parameter is required',
          code: 'MISSING_CATEGORY_NAME',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const isActive = is_active !== 'false';

      const result = await this.productMasterdataService.getGlobalMasterData(
        category_name as string,
        isActive,
        userJWT
      );

      const transformedResult = this.productMasterdataService.transformForFrontend(result);

      if (!result.success) {
        res.status(400).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getGlobalMasterData:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get global master data',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * GET /api/product-masterdata/tenant
   * Get tenant-specific master data for a category
   */
  getTenantMasterData = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const { category_name, is_active = 'true' } = req.query;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'x-tenant-id header is required',
          code: 'MISSING_TENANT_ID',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (!category_name) {
        res.status(400).json({
          success: false,
          error: 'category_name parameter is required',
          code: 'MISSING_CATEGORY_NAME',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const isActive = is_active !== 'false';

      const result = await this.productMasterdataService.getTenantMasterData(
        category_name as string,
        isActive,
        userJWT,
        tenantId
      );

      const transformedResult = this.productMasterdataService.transformForFrontend(result);

      if (!result.success) {
        res.status(400).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getTenantMasterData:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tenant master data',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * GET /api/product-masterdata/global/categories
   * Get all global categories
   */
  getAllGlobalCategories = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const { is_active = 'true' } = req.query;

      const isActive = is_active !== 'false';

      const result = await this.productMasterdataService.getAllGlobalCategories(
        isActive,
        userJWT
      );

      const transformedResult = this.productMasterdataService.transformForFrontend(result);

      if (!result.success) {
        res.status(400).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getAllGlobalCategories:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get all global categories',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * GET /api/product-masterdata/tenant/categories
   * Get all tenant categories
   */
  getAllTenantCategories = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const { is_active = 'true' } = req.query;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'x-tenant-id header is required',
          code: 'MISSING_TENANT_ID',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const isActive = is_active !== 'false';

      const result = await this.productMasterdataService.getAllTenantCategories(
        isActive,
        userJWT,
        tenantId
      );

      const transformedResult = this.productMasterdataService.transformForFrontend(result);

      if (!result.success) {
        res.status(400).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getAllTenantCategories:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get all tenant categories',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * GET /api/product-masterdata/health
   * Health check endpoint
   */
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.productMasterdataService.healthCheck();
      
      res.status(200).json({
        success: true,
        status: 'healthy',
        service: 'product-masterdata',
        edge_function_status: result.edge_function_healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error in healthCheck:', error);
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
   * GET /api/product-masterdata/constants
   * Get constants for master data forms
   */
  getConstants = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json({
        success: true,
        data: {
          endpoints: [
            'global',
            'tenant',
            'global/categories',
            'tenant/categories'
          ],
          query_parameters: [
            'category_name',
            'is_active'
          ],
          required_headers: {
            global: ['authorization'],
            tenant: ['authorization', 'x-tenant-id']
          },
          common_categories: [
            'pricing_type',
            'status_type',
            'priority_type',
            'classification_type',
            'document_type',
            'currency_type'
          ]
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error in getConstants:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get constants',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };
}

export default ProductMasterdataController;