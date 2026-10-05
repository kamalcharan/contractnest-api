// ============================================================================
// Catalog defaults — business currency + what a new catalog item would carry
// (migration catalog-studio/008). Mounted at /api/catalog-defaults.
//   GET  /             → { currency, tax: {display_mode, inclusion, taxes, total, source} }
//                        ?tax_rate_ids=a,b  previews a choice; absent = the default rate
//   PUT  /currency     { currency: 'INR' }  set_tenant_currency (Business Profile, onboarding)
// The tax master itself (rates, display mode) stays on /api/tax-settings.
// ============================================================================

import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../middleware/auth';
import { resolveCatalogTax, CatalogTaxError } from '../services/catalogPricingService';

const router = express.Router();
router.use(authenticate);
router.use((req: Request, res: Response, next: express.NextFunction) => {
  if (!req.headers['x-tenant-id']) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'x-tenant-id header is required' } });
    return;
  }
  next();
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/', async (req: Request, res: Response) => {
  const tenantId = req.headers['x-tenant-id'] as string;
  const raw = req.query.tax_rate_ids;
  let ids: string[] | undefined;
  if (raw !== undefined) {
    ids = String(raw).split(',').map((x) => x.trim()).filter(Boolean);
    if (ids.some((x) => !UUID_RE.test(x))) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'tax_rate_ids must be tax rate ids' } });
    }
  }
  try {
    const tax = await resolveCatalogTax(tenantId, ids, req.headers.authorization);
    return res.json({
      success: true,
      data: {
        currency: tax.currency,
        tax: { display_mode: tax.display_mode, inclusion: tax.inclusion, taxes: tax.taxes, total: tax.total, source: tax.source },
      },
    });
  } catch (err: any) {
    const status = err instanceof CatalogTaxError ? 422 : 500;
    return res.status(status).json({ success: false, error: { code: err?.code || 'UNEXPECTED', message: err?.message || 'Could not read catalog defaults' } });
  }
});

router.put('/currency', async (req: Request, res: Response) => {
  const tenantId = req.headers['x-tenant-id'] as string;
  const currency = String(req.body?.currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ success: false, error: { code: 'invalid_currency', message: 'Currency must be a 3-letter code' } });
  }
  try {
    // Always as the caller (anon key + their JWT): the RPC then checks the
    // caller belongs to the x-tenant-id tenant before writing.
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: req.headers.authorization || '' } },
    });
    const { data, error } = await sb.rpc('set_tenant_currency', { p_tenant: tenantId, p_currency: currency });
    if (error) return res.status(500).json({ success: false, error: { code: 'RPC_ERROR', message: error.message } });
    if (!data?.success) {
      const status = data?.reason === 'forbidden' ? 403 : 400;
      return res.status(status).json({ success: false, error: { code: data?.reason || 'REFUSED', message: data?.message || 'Could not save the currency' } });
    }
    return res.json({ success: true, data: { currency: data.currency } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'UNEXPECTED', message: err?.message || 'Could not save the currency' } });
  }
});

export default router;
