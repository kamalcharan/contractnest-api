// backend/src/controllers/catalogStudioController.ts

import { Request, Response } from 'express';
import { catBlocksService } from '../services/catBlocksService';      // ✅ Import singleton
import { catTemplatesService } from '../services/catTemplatesService'; // ✅ Import singleton
import {
  RequestContext,
  CreateBlockRequest,
  UpdateBlockRequest,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CopyTemplateRequest,
  BlockQueryParams,
  TemplateQueryParams,
} from '../types/catalogStudioTypes';

// Extended Request with auth context
interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
}

class CatalogStudioController {
  // ✅ Remove constructor - use imported singletons directly

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
    const result = await catBlocksService.listBlocks(context, params);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

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

    const result = await catBlocksService.getBlock(context, id);  // ✅ Use singleton

    if (!result.success) {
      res.status(404).json(result);
      return;
    }

    res.json(result);
  };

  createBlock = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    // REMOVED: isAdmin check - anyone can create blocks for their tenant
    // Permission checks are now in the Edge Function

    const data: CreateBlockRequest = req.body;

    if (!data.name) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name is required' },
      });
      return;
    }

    const result = await catBlocksService.createBlock(context, data);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json(result);
  };

  updateBlock = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    // REMOVED: isAdmin check - anyone can update their tenant's blocks
    // Permission checks are now in the Edge Function

    const { id } = req.params;
    if (!this.isValidUUID(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'Invalid block ID format' },
      });
      return;
    }

    const data: UpdateBlockRequest = req.body;
    const result = await catBlocksService.updateBlock(context, id, data);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  deleteBlock = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing required headers' },
      });
      return;
    }

    // REMOVED: isAdmin check - anyone can delete their tenant's blocks
    // Permission checks are now in the Edge Function

    const { id } = req.params;
    if (!this.isValidUUID(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'Invalid block ID format' },
      });
      return;
    }

    const result = await catBlocksService.deleteBlock(context, id);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  // ============================================
  // Template Endpoints
  // ============================================

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
    const result = await catTemplatesService.listTemplates(context, params);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

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
    const result = await catTemplatesService.listSystemTemplates(context, params);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

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
    const result = await catTemplatesService.listPublicTemplates(context, params);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

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

    const result = await catTemplatesService.getTemplate(context, id);  // ✅ Use singleton

    if (!result.success) {
      res.status(404).json(result);
      return;
    }

    res.json(result);
  };

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

    if (!data.name || !data.blocks) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name and blocks are required' },
      });
      return;
    }

    const result = await catTemplatesService.createTemplate(context, data);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json(result);
  };

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
    const result = await catTemplatesService.copyTemplate(context, id, data);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json(result);
  };

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
    const result = await catTemplatesService.updateTemplate(context, id, data);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

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

    const result = await catTemplatesService.deleteTemplate(context, id);  // ✅ Use singleton

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  };

  // ============================================
  // Utility Methods
  // ============================================

  private isValidUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }
}

// Export singleton instance
export const catalogStudioController = new CatalogStudioController();
export default catalogStudioController;
