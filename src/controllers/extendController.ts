// ============================================================================
// Extend Controller — customer touchpoints (Website / WhatsApp / Email)
// ============================================================================
// Public endpoints (storefront key in the URL, no auth) drive the hosted
// checkout page /buy/:key; management endpoints (Authorization + x-tenant-id)
// drive the /extend page. Thin — the RPCs own the logic.
// ============================================================================

import { Request, Response } from 'express';
import extendService from '../services/extendService';

const STOREFRONT_KEY_RE = /^sf-[0-9a-f]{32}$/;
const TOUCHPOINT_TYPES = new Set(['website', 'whatsapp', 'email']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refusalStatus(code?: string): number {
  switch (code) {
    case 'NOT_FOUND':
    case 'TEMPLATE_GONE':
      return 404;
    case 'VALIDATION_ERROR':
      return 400;
    case 'TOUCHPOINT_NOT_ENTITLED':
      return 403;
    case 'TEMPLATE_NOT_PUBLISHABLE':
      return 422;
    default:
      return 500;
  }
}

class ExtendController {
  // ── public (storefront-key-gated) ──

  resolveStorefront = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!STOREFRONT_KEY_RE.test(key)) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'This link is not available' } });
      return;
    }
    const result = await extendService.resolveStorefront(key);
    if (!result.success) {
      res.status(refusalStatus(result.error?.code)).json(result);
      return;
    }
    res.json(result);
  };

  purchase = async (req: Request, res: Response): Promise<void> => {
    const key = req.params.key || '';
    if (!STOREFRONT_KEY_RE.test(key)) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'This link is not available' } });
      return;
    }
    const name = String(req.body?.name ?? '').trim().slice(0, 160);
    const company = String(req.body?.company ?? '').trim().slice(0, 200);
    const email = String(req.body?.email ?? '').trim().slice(0, 200);
    const phone = String(req.body?.phone ?? '').trim().slice(0, 24);
    if (!name || (!email && !phone)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name and an email or phone number are required' },
      });
      return;
    }
    const result = await extendService.purchaseFromStorefront(key, { name, company, email, phone });
    if (!result.success) {
      res.status(refusalStatus(result.error?.code)).json(result);
      return;
    }
    res.status(201).json(result);
  };

  // ── authenticated (tenant-scoped) ──

  private tenantOf(req: Request): string | null {
    const tenantId = req.headers['x-tenant-id'];
    return typeof tenantId === 'string' && UUID_RE.test(tenantId) ? tenantId : null;
  }

  listTouchpoints = async (req: Request, res: Response): Promise<void> => {
    const tenantId = this.tenantOf(req);
    if (!tenantId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'x-tenant-id is required' } });
      return;
    }
    const result = await extendService.listTouchpoints(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  };

  createTouchpoint = async (req: Request, res: Response): Promise<void> => {
    const tenantId = this.tenantOf(req);
    if (!tenantId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'x-tenant-id is required' } });
      return;
    }
    const templateId = String(req.body?.template_id ?? '');
    const type = String(req.body?.touchpoint_type ?? '');
    if (!UUID_RE.test(templateId) || !TOUCHPOINT_TYPES.has(type)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'template_id and a valid touchpoint_type are required' },
      });
      return;
    }
    const userId = typeof req.headers['x-user-id'] === 'string' && UUID_RE.test(req.headers['x-user-id'] as string)
      ? (req.headers['x-user-id'] as string)
      : null;
    const result = await extendService.createTouchpoint(tenantId, templateId, type, userId);
    if (!result.success) {
      res.status(refusalStatus(result.error?.code)).json(result);
      return;
    }
    res.status(201).json(result);
  };

  setTouchpointActive = async (req: Request, res: Response): Promise<void> => {
    const tenantId = this.tenantOf(req);
    if (!tenantId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'x-tenant-id is required' } });
      return;
    }
    const touchpointId = req.params.id || '';
    const active = req.body?.is_active;
    if (!UUID_RE.test(touchpointId) || typeof active !== 'boolean') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'touchpoint id and boolean is_active are required' },
      });
      return;
    }
    const result = await extendService.setTouchpointActive(tenantId, touchpointId, active);
    if (!result.success) {
      res.status(result.error?.code === 'NOT_FOUND' ? 404 : 500).json(result);
      return;
    }
    res.json(result);
  };
}

export default new ExtendController();
