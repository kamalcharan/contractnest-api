// ============================================================================
// Leads Controller — /api/leads (authenticated, tenant-scoped)
// ============================================================================
//   GET   /?tab=reach|asked&stage=&q=&limit=&offset=   get_leads
//   POST  /capture  {name, company?, phone?, country_code?, email?, template_family?, note?}  lead_capture (kind manual)
//   PATCH /:interestId  {stage?, note?}                lead_set_stage
// Tenant from x-tenant-id, environment from x-environment (same as the
// collections controller); the actor is req.user.

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import leadsService from '../services/leadsService';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGES = new Set(['new', 'contacted', 'converted', 'lost']);

function status(code?: string): number {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'VALIDATION_ERROR': return 400;
    default: return 500;
  }
}

class LeadsController {
  private tenantId(req: AuthRequest): string { return String(req.headers['x-tenant-id'] || ''); }
  private isLive(req: AuthRequest): boolean { return ((req.headers['x-environment'] as string) || 'live') === 'live'; }
  private actorName(req: AuthRequest): string | null {
    const u: any = req.user || {};
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
    return name || u.email || null;
  }

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    const tab = req.query.tab === 'asked' ? 'asked' : 'reach';
    const stage = typeof req.query.stage === 'string' && STAGES.has(req.query.stage) ? req.query.stage : null;
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : null;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
    const result = await leadsService.list(this.tenantId(req), this.isLive(req), { tab, stage, q, limit, offset });
    res.status(result.success ? 200 : status(result.error?.code)).json(result.success ? result : { success: false, error: result.error });
  };

  capture = async (req: AuthRequest, res: Response): Promise<void> => {
    const b = req.body || {};
    const contact = {
      name: String(b.name ?? '').trim().slice(0, 160),
      company: String(b.company ?? '').trim().slice(0, 200),
      phone: String(b.phone ?? '').trim().slice(0, 24),
      country_code: /^[A-Za-z]{2}$/.test(String(b.country_code ?? '')) ? String(b.country_code).toUpperCase() : null,
      email: String(b.email ?? '').trim().slice(0, 200),
    };
    if (!contact.name && !contact.company) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A name is required' } }); return;
    }
    if (!contact.phone && !contact.email) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A mobile number or email is required' } }); return;
    }
    const interest = {
      kind: 'manual', channel: 'manual',
      template_family: typeof b.template_family === 'string' && UUID_RE.test(b.template_family) ? b.template_family : null,
      note: String(b.note ?? '').trim().slice(0, 1000) || null,
    };
    const u: any = req.user || {};
    const result = await leadsService.capture(this.tenantId(req), this.isLive(req), contact, interest, { id: u.id || null, name: this.actorName(req) });
    res.status(result.success ? 201 : status(result.error?.code)).json(result.success ? result : { success: false, error: result.error });
  };

  setStage = async (req: AuthRequest, res: Response): Promise<void> => {
    const interestId = req.params.interestId || '';
    if (!UUID_RE.test(interestId)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'interest id is required' } }); return;
    }
    const stage = typeof req.body?.stage === 'string' && STAGES.has(req.body.stage) ? req.body.stage : null;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) || null : null;
    if (!stage && !note) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Nothing to update' } }); return;
    }
    const result = await leadsService.setStage(this.tenantId(req), interestId, stage, note, this.actorName(req));
    res.status(result.success ? 200 : status(result.error?.code)).json(result.success ? result : { success: false, error: result.error });
  };
}

export default new LeadsController();
