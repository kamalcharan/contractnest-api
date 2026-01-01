/**
 * Catalog Studio Controller
 * Handles HTTP requests for blocks and templates
 */

import { Request, Response } from 'express';
import { CatBlocksService } from './catBlocksService';
import { CatTemplatesService } from './catTemplatesService';
import {
  RequestContext,
  CreateBlockRequest,
  UpdateBlockRequest,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CopyTemplateRequest,
  BlockQueryParams,
  TemplateQueryParams,
} from './catalogStudioTypes';

// Extended Request with auth context
interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
}

class CatalogStudioController {
  private catBlocksService: CatBlocksService;
  private catTemplatesService: CatTemplatesService;

  constructor() {
    this.catBlocksService = new CatBlocksService();
    this.catTemplatesService = new CatTemplatesService();
  }

  /**
   * Extract request context from headers
   */
  private getContext(req: AuthRequest): RequestContext | null {
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.headers['x-user-id'] as string || req.user?.id;
    const product = (req.headers['x-product'] as string) || 'contractnest';
    const isAdmin = req.headers['x-is-admin'] === 'true';
    const environment = (req.headers['x-environment'] as 'live' | 'test') || 'test';
    const authHeader = req.headers.authorization;

    if (!tenantId || !authHeader) {
      return null;
    }

    const accessToken = authHeader.replace('Bearer ', '');

    return {
      tenantId,
      userId: userId || '',
      product,
      isAdmin,
      environment,
      accessToken,
    };
  }

  /**
   * Parse query params for blocks
   */
  private parseBlockQueryParams(req: Request): BlockQueryParams {
    return {
      block_type_id: req.query.block_type_id as string,
      pricing_mode_id: req.query.pricing_mode_id as string,
      is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };
  }

  /**
   * Parse query params for templates
   */
  private parseTemplateQueryParams(req: Request): TemplateQueryParams {
    return {
      status_id: req.query.status_id as string,
      is_public: req.query.is_public === 'true' ? true : req.query.is_public === 'false' ? false : undefined,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };
  }

  // ============================================
  // Block Endpoints
  // ============================================

  /**
   * GET /blocks - List all blocks
   */
  getBlocks = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    const params = this.parseBlockQueryParams(req);
    const result = await this.catBlocksService.listBlocks(context, params);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  /**
   * GET /blocks/:id - Get single block
   */
  getBlockById = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    const { id } = req.params;
    if (!this.isValidUUID(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'Invalid block ID format' },
      });
      return;
    }

    const result = await this.catBlocksService.getBlock(context, id);

    if (!result.success) {
      res.status(404).json(result);
      return;
    }

    res.json(result);
  };

  /**
   * POST /blocks - Create new block (admin only)
   */
  createBlock = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    if (!context.isAdmin) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
      return;
    }

    const data: CreateBlockRequest = req.body;

    // Validate required fields
    if (!data.name || !data.block_type_id || !data.pricing_mode_id) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name, block_type_id, and pricing_mode_id are required' },
      });
      return;
    }

    const result = await this.catBlocksService.createBlock(context, data);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json(result);
  };

  /**
   * PATCH /blocks/:id - Update block (admin only)
   */
  updateBlock = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    if (!context.isAdmin) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
      return;
    }

    const { id } = req.params;
    if (!this.isValidUUID(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'Invalid block ID format' },
      });
      return;
    }

    const data: UpdateBlockRequest = req.body;
    const result = await this.catBlocksService.updateBlock(context, id, data);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  /**
   * DELETE /blocks/:id - Delete block (admin only)
   */
  deleteBlock = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    if (!context.isAdmin) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
      return;
    }

    const { id } = req.params;
    if (!this.isValidUUID(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'Invalid block ID format' },
      });
      return;
    }

    const result = await this.catBlocksService.deleteBlock(context, id);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  // ============================================
  // Template Endpoints
  // ============================================

  /**
   * GET /templates - List tenant templates
   */
  getTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    const params = this.parseTemplateQueryParams(req);
    const result = await this.catTemplatesService.listTemplates(context, params);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  /**
   * GET /templates/system - List system templates
   */
  getSystemTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    const params = this.parseTemplateQueryParams(req);
    const result = await this.catTemplatesService.listSystemTemplates(context, params);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  /**
   * GET /templates/public - List public templates
   */
  getPublicTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    const params = this.parseTemplateQueryParams(req);
    const result = await this.catTemplatesService.listPublicTemplates(context, params);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  /**
   * GET /templates/:id - Get single template
   */
  getTemplateById = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    const { id } = req.params;
    if (!this.isValidUUID(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'Invalid template ID format' },
      });
      return;
    }

    const result = await this.catTemplatesService.getTemplate(context, id);

    if (!result.success) {
      res.status(404).json(result);
      return;
    }

    res.json(result);
  };

  /**
   * POST /templates - Create new template
   */
  createTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    const data: CreateTemplateRequest = req.body;

    // Validate required fields
    if (!data.name || !data.blocks) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name and blocks are required' },
      });
      return;
    }

    const result = await this.catTemplatesService.createTemplate(context, data);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json(result);
  };

  /**
   * POST /templates/:id/copy - Copy system template to tenant
   */
  copyTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    const { id } = req.params;
    if (!this.isValidUUID(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'Invalid template ID format' },
      });
      return;
    }

    const data: CopyTemplateRequest = req.body;
    const result = await this.catTemplatesService.copyTemplate(context, id, data);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json(result);
  };

  /**
   * PATCH /templates/:id - Update template
   */
  updateTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    const { id } = req.params;
    if (!this.isValidUUID(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'Invalid template ID format' },
      });
      return;
    }

    const data: UpdateTemplateRequest = req.body;
    const result = await this.catTemplatesService.updateTemplate(context, id, data);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  /**
   * DELETE /templates/:id - Delete template
   */
  deleteTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    const { id } = req.params;
    if (!this.isValidUUID(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'Invalid template ID format' },
      });
      return;
    }

    const result = await this.catTemplatesService.deleteTemplate(context, id);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Validate UUID format
   */
  private isValidUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }
}

// Export singleton instance
export const catalogStudioController = new CatalogStudioController();
export default catalogStudioController;
