// src/controllers/blockController.ts
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import BlockService from '../services/blockService';

class BlockController {
  private blockService: BlockService;

  constructor() {
    this.blockService = new BlockService();
  }

  /**
   * GET /api/service-contracts/blocks/categories
   * List all block categories
   */
  getCategories = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const environment = req.headers['x-environment'] as string || 'test';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const result = await this.blockService.getCategories(userJWT, tenantId, environment);
      const transformedResult = this.blockService.transformForFrontend(result);

      if (!result.success) {
        res.status(400).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getCategories:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get block categories',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/service-contracts/blocks/masters
   * List block masters with optional category filter
   */
  getMasters = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const environment = req.headers['x-environment'] as string || 'test';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      // Extract query parameters
      const { categoryId } = req.query;

      // Build filters object
      const filters = {
        categoryId: categoryId as string
      };

      const result = await this.blockService.getMasters(filters, userJWT, tenantId, environment);
      const transformedResult = this.blockService.transformForFrontend(result);

      if (!result.success) {
        res.status(400).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getMasters:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get block masters',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/service-contracts/blocks/masters/:masterId/variants
   * List variants for a specific block master
   */
  getVariants = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { masterId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const environment = req.headers['x-environment'] as string || 'test';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      if (!masterId) {
        res.status(400).json({
          success: false,
          error: 'Master ID is required',
          code: 'MISSING_MASTER_ID'
        });
        return;
      }

      const result = await this.blockService.getVariants(masterId, userJWT, tenantId, environment);
      const transformedResult = this.blockService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
        res.status(statusCode).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getVariants:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get block variants',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/service-contracts/blocks/hierarchy
   * Get complete block hierarchy (categories -> masters -> variants)
   */
  getHierarchy = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const environment = req.headers['x-environment'] as string || 'test';

      console.log(`Getting block hierarchy - Tenant: ${tenantId}, Environment: ${environment}`);

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const result = await this.blockService.getHierarchy(userJWT, tenantId, environment);
      const transformedResult = this.blockService.transformForFrontend(result);

      if (!result.success) {
        res.status(400).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getHierarchy:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get block hierarchy',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/service-contracts/blocks/variant/:variantId
   * Get specific block variant details
   */
  getVariantById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { variantId } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const environment = req.headers['x-environment'] as string || 'test';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      if (!variantId) {
        res.status(400).json({
          success: false,
          error: 'Variant ID is required',
          code: 'MISSING_VARIANT_ID'
        });
        return;
      }

      const result = await this.blockService.getVariantById(variantId, userJWT, tenantId, environment);
      const transformedResult = this.blockService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
        res.status(statusCode).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getVariantById:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get block variant',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/service-contracts/blocks/template-builder
   * Get blocks optimized for template builder UI
   */
  getBlocksForTemplateBuilder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const environment = req.headers['x-environment'] as string || 'test';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const result = await this.blockService.getBlocksForTemplateBuilder(userJWT, tenantId, environment);
      const transformedResult = this.blockService.transformForFrontend(result);

      if (!result.success) {
        res.status(400).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getBlocksForTemplateBuilder:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get blocks for template builder',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/service-contracts/blocks/search
   * Search blocks by name, description, or category
   */
  searchBlocks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const environment = req.headers['x-environment'] as string || 'test';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const { q: searchQuery, category, nodeType } = req.query;

      if (!searchQuery || typeof searchQuery !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Search query is required',
          code: 'MISSING_SEARCH_QUERY'
        });
        return;
      }

      // Get all blocks and filter client-side for now
      // In a real implementation, you might want to add search to the Edge Function
      const hierarchyResult = await this.blockService.getHierarchy(userJWT, tenantId, environment);
      
      if (!hierarchyResult.success) {
        const transformedResult = this.blockService.transformForFrontend(hierarchyResult);
        res.status(400).json(transformedResult);
        return;
      }

      // Filter blocks based on search criteria
      const filteredBlocks = this.filterBlocks(
        hierarchyResult.data || [],
        searchQuery.toLowerCase(),
        category as string,
        nodeType as string
      );

      res.status(200).json({
        success: true,
        data: filteredBlocks,
        count: filteredBlocks.length,
        query: searchQuery,
        filters: { category, nodeType }
      });
    } catch (error) {
      console.error('Error in searchBlocks:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search blocks',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * Helper method to filter blocks based on search criteria
   */
  private filterBlocks(
    hierarchyData: any[],
    searchQuery: string,
    categoryFilter?: string,
    nodeTypeFilter?: string
  ): any[] {
    const results: any[] = [];

    hierarchyData.forEach(category => {
      // Apply category filter
      if (categoryFilter && category.name?.toLowerCase() !== categoryFilter.toLowerCase()) {
        return;
      }

      category.masters?.forEach((master: any) => {
        master.variants?.forEach((variant: any) => {
          // Apply node type filter
          if (nodeTypeFilter && variant.node_type !== nodeTypeFilter) {
            return;
          }

          // Apply search query filter
          const searchText = [
            category.name,
            master.name,
            variant.name,
            variant.description,
            master.description
          ].filter(Boolean).join(' ').toLowerCase();

          if (searchText.includes(searchQuery)) {
            results.push({
              ...variant,
              category: {
                id: category.id,
                name: category.name,
                icon: category.icon
              },
              master: {
                id: master.id,
                name: master.name,
                icon: master.icon,
                node_type: master.node_type
              },
              displayPath: `${category.name} > ${master.name} > ${variant.name}`
            });
          }
        });
      });
    });

    return results;
  }

  /**
   * GET /api/service-contracts/blocks/stats
   * Get block system statistics
   */
  getBlockStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const environment = req.headers['x-environment'] as string || 'test';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const hierarchyResult = await this.blockService.getHierarchy(userJWT, tenantId, environment);
      
      if (!hierarchyResult.success) {
        const transformedResult = this.blockService.transformForFrontend(hierarchyResult);
        res.status(400).json(transformedResult);
        return;
      }

      // Calculate statistics
      const stats = this.calculateBlockStats(hierarchyResult.data || []);

      res.status(200).json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error in getBlockStats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get block statistics',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * Helper method to calculate block statistics
   */
  private calculateBlockStats(hierarchyData: any[]): any {
    let totalMasters = 0;
    let totalVariants = 0;
    const categoryStats: any[] = [];
    const nodeTypeStats: Record<string, number> = {};

    hierarchyData.forEach(category => {
      const categoryMasters = category.masters?.length || 0;
      let categoryVariants = 0;

      category.masters?.forEach((master: any) => {
        const masterVariants = master.variants?.length || 0;
        categoryVariants += masterVariants;

        // Count by node type
        master.variants?.forEach((variant: any) => {
          if (variant.node_type) {
            nodeTypeStats[variant.node_type] = (nodeTypeStats[variant.node_type] || 0) + 1;
          }
        });
      });

      totalMasters += categoryMasters;
      totalVariants += categoryVariants;

      categoryStats.push({
        id: category.id,
        name: category.name,
        masters: categoryMasters,
        variants: categoryVariants
      });
    });

    return {
      total: {
        categories: hierarchyData.length,
        masters: totalMasters,
        variants: totalVariants
      },
      byCategory: categoryStats,
      byNodeType: nodeTypeStats,
      health: {
        activeCategories: hierarchyData.filter(c => c.active !== false).length,
        averageVariantsPerMaster: totalMasters > 0 ? Math.round((totalVariants / totalMasters) * 10) / 10 : 0
      }
    };
  }
}

export default BlockController;