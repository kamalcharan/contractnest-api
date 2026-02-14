// src/controllers/clientAssetRegistryController.ts
// Handles HTTP requests for client asset registry CRUD.

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { captureException } from '../utils/sentry';
import { clientAssetRegistryService } from '../services/clientAssetRegistryService';

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
  console.error(`Error in clientAssetRegistryController.${action}:`, error);

  if (error.response) {
    return res.status(error.response.status).json(error.response.data);
  }

  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'controller_client_asset_registry', action },
    tenantId
  });

  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}

// ── Endpoints ─────────────────────────────────────────────────────

export const listAssets = async (req: Request, res: Response) => {
  try {
    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const result = await clientAssetRegistryService.listAssets(ctx.authHeader, ctx.tenantId, {
      id: req.query.id as string,
      contact_id: req.query.contact_id as string,
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

export const createAsset = async (req: Request, res: Response) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const result = await clientAssetRegistryService.createAsset(ctx.authHeader, ctx.tenantId, req.body);
    return res.status(201).json(result);
  } catch (error: any) {
    return handleError(res, error, 'createAsset');
  }
};

export const updateAsset = async (req: Request, res: Response) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const assetId = req.query.id as string;
    const result = await clientAssetRegistryService.updateAsset(ctx.authHeader, ctx.tenantId, assetId, req.body);
    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'updateAsset');
  }
};

export const deleteAsset = async (req: Request, res: Response) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const assetId = req.query.id as string;
    const result = await clientAssetRegistryService.deleteAsset(ctx.authHeader, ctx.tenantId, assetId);
    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'deleteAsset');
  }
};

export const getChildren = async (req: Request, res: Response) => {
  try {
    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const parentAssetId = req.query.parent_asset_id as string;
    if (!parentAssetId) {
      return res.status(400).json({ error: 'parent_asset_id query parameter is required' });
    }

    const result = await clientAssetRegistryService.getChildren(ctx.authHeader, ctx.tenantId, parentAssetId);
    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'getChildren');
  }
};

export const getContractAssets = async (req: Request, res: Response) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const contractId = req.query.contract_id as string;
    const result = await clientAssetRegistryService.getContractAssets(ctx.authHeader, ctx.tenantId, contractId);
    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'getContractAssets');
  }
};

export const linkContractAssets = async (req: Request, res: Response) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const result = await clientAssetRegistryService.linkContractAssets(ctx.authHeader, ctx.tenantId, req.body);
    return res.status(201).json(result);
  } catch (error: any) {
    return handleError(res, error, 'linkContractAssets');
  }
};

export const unlinkContractAsset = async (req: Request, res: Response) => {
  try {
    const ctx = extractContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

    const contractId = req.query.contract_id as string;
    const assetId = req.query.asset_id as string;

    if (!contractId || !assetId) {
      return res.status(400).json({ error: 'contract_id and asset_id query parameters are required' });
    }

    const result = await clientAssetRegistryService.unlinkContractAsset(
      ctx.authHeader, ctx.tenantId, contractId, assetId
    );
    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'unlinkContractAsset');
  }
};
