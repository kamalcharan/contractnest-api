// src/controllers/assetRegistryController.ts
// Handles HTTP requests for asset registry CRUD.
// Validates headers, delegates to service, returns response.

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { captureException } from '../utils/sentry';
import { assetRegistryService } from '../services/assetRegistryService';

// ── Helper ────────────────────────────────────────────────────────

function extractContext(req: Request): { authHeader: string; tenantId: string } | null {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'] as string;
  if (!authHeader || !tenantId) return null;
  return { authHeader, tenantId };
}

function handleValidationErrors(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fields: errors.array().reduce((acc: Record<string, string>, e: any) => {
        acc[e.path || e.param] = e.msg;
        return acc;
      }, {})
    });
    return true;
  }
  return false;
}

function handleError(res: Response, error: any, action: string, tenantId?: string) {
  console.error(`Error in assetRegistryController.${action}:`, error);

  if (error.response) {
    return res.status(error.response.status).json(error.response.data);
  }

  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'controller_asset_registry', action },
    tenantId
  });

  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}

// ── Endpoints ─────────────────────────────────────────────────────

/**
 * @route GET /api/asset-registry
 * @query id, resource_type_id, status, is_live, limit, offset
 */
export const listAssets = async (req: Request, res: Response) => {
  try {
    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const result = await assetRegistryService.listAssets(ctx.authHeader, ctx.tenantId, {
      id: req.query.id as string,
      resource_type_id: req.query.resource_type_id as string,
      status: req.query.status as string,
      is_live: req.query.is_live === 'false' ? false : true,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined
    });

    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'listAssets');
  }
};

/**
 * @route POST /api/asset-registry
 * @body CreateAssetRequest
 */
export const createAsset = async (req: Request, res: Response) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const result = await assetRegistryService.createAsset(ctx.authHeader, ctx.tenantId, req.body);
    return res.status(201).json(result);
  } catch (error: any) {
    return handleError(res, error, 'createAsset');
  }
};

/**
 * @route PATCH /api/asset-registry?id=...
 * @body UpdateAssetRequest
 */
export const updateAsset = async (req: Request, res: Response) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const assetId = req.query.id as string;
    const result = await assetRegistryService.updateAsset(ctx.authHeader, ctx.tenantId, assetId, req.body);
    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'updateAsset');
  }
};

/**
 * @route DELETE /api/asset-registry?id=...
 */
export const deleteAsset = async (req: Request, res: Response) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const assetId = req.query.id as string;
    const result = await assetRegistryService.deleteAsset(ctx.authHeader, ctx.tenantId, assetId);
    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'deleteAsset');
  }
};

/**
 * @route GET /api/asset-registry/children?parent_asset_id=...
 */
export const getChildren = async (req: Request, res: Response) => {
  try {
    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const parentAssetId = req.query.parent_asset_id as string;
    if (!parentAssetId) {
      return res.status(400).json({ error: 'parent_asset_id query parameter is required' });
    }

    const result = await assetRegistryService.getChildren(ctx.authHeader, ctx.tenantId, parentAssetId);
    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'getChildren');
  }
};

/**
 * @route GET /api/asset-registry/contract-assets?contract_id=...
 */
export const getContractAssets = async (req: Request, res: Response) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const contractId = req.query.contract_id as string;
    const result = await assetRegistryService.getContractAssets(ctx.authHeader, ctx.tenantId, contractId);
    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'getContractAssets');
  }
};

/**
 * @route POST /api/asset-registry/contract-assets
 * @body LinkContractAssetsRequest
 */
export const linkContractAssets = async (req: Request, res: Response) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const result = await assetRegistryService.linkContractAssets(ctx.authHeader, ctx.tenantId, req.body);
    return res.status(201).json(result);
  } catch (error: any) {
    return handleError(res, error, 'linkContractAssets');
  }
};

/**
 * @route DELETE /api/asset-registry/contract-assets?contract_id=...&asset_id=...
 */
export const unlinkContractAsset = async (req: Request, res: Response) => {
  try {
    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const contractId = req.query.contract_id as string;
    const assetId = req.query.asset_id as string;

    if (!contractId || !assetId) {
      return res.status(400).json({ error: 'contract_id and asset_id query parameters are required' });
    }

    const result = await assetRegistryService.unlinkContractAsset(
      ctx.authHeader, ctx.tenantId, contractId, assetId
    );
    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'unlinkContractAsset');
  }
};
