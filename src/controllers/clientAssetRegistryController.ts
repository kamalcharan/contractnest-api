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
    const fields = errors.array().reduce((acc: Record<string, string>, e: any) => {
      acc[e.path || e.param] = e.msg;
      return acc;
    }, {});
    console.error(`[ClientAssetRegistry] Validation failed for ${req.method} ${req.originalUrl}:`, JSON.stringify(fields));
    console.error(`[ClientAssetRegistry] Request body keys:`, Object.keys(req.body || {}));
    console.error(`[ClientAssetRegistry] Null-valued body fields:`, Object.entries(req.body || {}).filter(([, v]) => v === null).map(([k]) => k));
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fields
    });
    return true;
  }
  return false;
}

function handleError(res: Response, error: any, action: string, tenantId?: string) {
  // Log the full error details for diagnosis
  console.error(`Error in clientAssetRegistryController.${action}:`, {
    status: error.response?.status,
    data: error.response?.data,
    message: error.message,
    url: error.config?.url,
  });

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
  const ctx = extractContext(req);
  if (!ctx) return res.status(401).json({ error: 'Authorization and x-tenant-id headers required' });

  try {
    // Build clean params — only include defined values to avoid sending undefined/NaN to edge function
    const params: Record<string, any> = {};
    if (req.query.id) params.id = req.query.id;
    if (req.query.contact_id) params.contact_id = req.query.contact_id;
    if (req.query.resource_type_id) params.resource_type_id = req.query.resource_type_id;
    if (req.query.status) params.status = req.query.status;
    if (req.query.ownership_type) params.ownership_type = req.query.ownership_type;
    if (req.query.is_live === 'false') params.is_live = false;
    // Note: is_live defaults to true in the edge function, no need to send it explicitly
    if (req.query.limit) params.limit = Number(req.query.limit);
    if (req.query.offset && Number(req.query.offset) > 0) params.offset = Number(req.query.offset);

    const result = await clientAssetRegistryService.listAssets(ctx.authHeader, ctx.tenantId, params);

    return res.status(200).json(result);
  } catch (error: any) {
    return handleError(res, error, 'listAssets', ctx.tenantId);
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
