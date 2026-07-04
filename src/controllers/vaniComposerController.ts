// ============================================================================
// VaNi Composer Controller — Phase 1.2 (per-step pipeline)
// ============================================================================
// The VaNi Canvas drives five stateless steps; each card in the UI appears
// only when its endpoint has actually returned (no simulated progress):
//
//   POST /parse-intent   { text }                                   (LLM)
//   POST /resolve-buyer  { buyer_text }                             (fast)
//   POST /shortlist      { intent }                                 (fast)
//   POST /select-blocks  { intent, nomenclature?, candidates }      (LLM)
//   POST /assemble       { intent, buyer?, candidates, selections, gaps?, summary }
//   POST /feedback       { interaction_ids, was_accepted?, was_edited?, user_rating? }
//   GET  /health · GET /entitlement (ungated info)
//
// Context extraction follows contractEventController: tenant/env/JWT from
// headers, userId from req.user (authenticate middleware).
// ============================================================================

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError, internalError, ERROR_CODES } from '../utils/apiResponseHelpers';
import contractComposerService, {
  ComposerCallContext,
  ParsedIntent,
  CandidatePayload,
  NomenclatureItem,
} from '../services/contractComposerService';
// Template tier:
//   POST /match-template        { text, intent? }                    (fast)
//   POST /assemble-from-template{ template_id, intent, buyer?, ... } (fast)
import vaniLLMClient from '../services/vaniLLMClient';
import vaniEntitlementService from '../services/vaniEntitlementService';

class VaniComposerController {
  private getContext(req: AuthRequest): ComposerCallContext {
    return {
      tenantId: (req.headers['x-tenant-id'] as string) || '',
      userId: req.user?.id || '',
      userJWT: req.headers.authorization?.replace('Bearer ', '') || '',
      environment: (req.headers['x-environment'] as string) || 'live',
    };
  }

  /** Re-validate an intent object arriving from the client */
  private validIntent(raw: any): ParsedIntent | null {
    if (!raw || typeof raw !== 'object' || !raw.duration) return null;
    return contractComposerService.normalizeIntent(raw);
  }

  /** GET /health — reports whether the LLM endpoint is configured */
  health = async (_req: AuthRequest, res: Response): Promise<void> => {
    sendSuccess(res, {
      llm_enabled: vaniLLMClient.isEnabled(),
      model: vaniLLMClient.getModelVersion(),
    });
  };

  /** GET /entitlement — is VaNi visible/usable for this tenant? */
  entitlement = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const entitled = await vaniEntitlementService.isEntitled(tenantId);
      sendSuccess(res, {
        entitled,
        mode: vaniEntitlementService.getMode(),
        llm_enabled: vaniLLMClient.isEnabled(),
      });
    } catch (error: any) {
      internalError(res, error.message || 'Entitlement check failed');
    }
  };

  /** STEP 1 — POST /parse-intent (LLM) */
  parseIntent = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const text = String(req.body?.text || '').trim();
      if (text.length < 5 || text.length > 500) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'text must be 5–500 characters', 400);
        return;
      }
      const result = await contractComposerService.parseIntentOnly(text, this.getContext(req));
      sendSuccess(res, result);
    } catch (error: any) {
      console.error('❌ VaniComposer parse-intent failed:', error.message);
      internalError(res, error.message || 'Intent parsing failed');
    }
  };

  /** STEP 2 — POST /resolve-buyer (deterministic) */
  resolveBuyer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const buyerText = String(req.body?.buyer_text || '').trim();
      const result = await contractComposerService.resolveBuyer(buyerText, this.getContext(req));
      sendSuccess(res, result);
    } catch (error: any) {
      console.error('❌ VaniComposer resolve-buyer failed:', error.message);
      internalError(res, error.message || 'Buyer resolution failed');
    }
  };

  /** STEP 3 — POST /shortlist (deterministic catalog scan) */
  shortlist = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const intent = this.validIntent(req.body?.intent);
      if (!intent) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'intent (from parse-intent) is required', 400);
        return;
      }
      const result = await contractComposerService.buildShortlist(intent, this.getContext(req));
      sendSuccess(res, result);
    } catch (error: any) {
      console.error('❌ VaniComposer shortlist failed:', error.message);
      internalError(res, error.message || 'Shortlist failed');
    }
  };

  /** GET /suggestions?mode=contract|template — deterministic smart chips */
  suggestions = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const mode = req.query?.mode === 'template' ? 'template' : 'contract';
      const result = await contractComposerService.buildSuggestions(mode, this.getContext(req));
      sendSuccess(res, result);
    } catch (error: any) {
      console.error('❌ VaniComposer suggestions failed:', error.message);
      // Chips are cosmetic — never fail the canvas over them
      sendSuccess(res, { suggestions: [] });
    }
  };

  /** TEMPLATE TIER — POST /match-template (deterministic) */
  matchTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const text = String(req.body?.text || '').trim();
      if (text.length < 5 || text.length > 500) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'text must be 5–500 characters', 400);
        return;
      }
      // intent optional: when absent the server quick-parses the raw text
      const intent = req.body?.intent ? this.validIntent(req.body.intent) : null;
      const result = await contractComposerService.matchTemplate(text, intent, this.getContext(req));
      sendSuccess(res, result);
    } catch (error: any) {
      console.error('❌ VaniComposer match-template failed:', error.message);
      internalError(res, error.message || 'Template match failed');
    }
  };

  /** TEMPLATE TIER — POST /assemble-from-template (deterministic) */
  assembleFromTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const templateId = String(req.body?.template_id || '').trim();
      const intent = this.validIntent(req.body?.intent);
      if (!templateId) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'template_id is required', 400);
        return;
      }
      if (!intent) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'intent is required', 400);
        return;
      }

      const buyerId = String(req.body?.buyer_id || '');
      const buyerName = String(req.body?.buyer_name || '');
      const buyer = buyerId && buyerName ? { id: buyerId, name: buyerName } : null;
      const defaultCurrency = String(req.body?.default_currency || '').slice(0, 3);

      const result = await contractComposerService.assembleFromTemplate(
        templateId,
        intent,
        buyer,
        this.getContext(req),
        defaultCurrency || undefined
      );
      sendSuccess(res, result);
    } catch (error: any) {
      console.error('❌ VaniComposer assemble-from-template failed:', error.message);
      internalError(res, error.message || 'Template assembly failed');
    }
  };

  /** STEP 4 — POST /select-blocks (LLM) */
  selectBlocks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const intent = this.validIntent(req.body?.intent);
      const candidates = req.body?.candidates as CandidatePayload[] | undefined;
      const nomenclature = (req.body?.nomenclature || null) as NomenclatureItem | null;

      if (!intent) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'intent is required', 400);
        return;
      }
      if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > 40) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'candidates (1–40, from shortlist) are required', 400);
        return;
      }

      const result = await contractComposerService.selectBlocks(
        intent, nomenclature, candidates, this.getContext(req)
      );
      sendSuccess(res, result);
    } catch (error: any) {
      console.error('❌ VaniComposer select-blocks failed:', error.message);
      internalError(res, error.message || 'Block selection failed');
    }
  };

  /** STEP 5 — POST /assemble (deterministic) */
  assemble = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const intent = this.validIntent(req.body?.intent);
      const candidates = req.body?.candidates as CandidatePayload[] | undefined;
      const selections = req.body?.selections as Array<{ block_id: string; quantity: number; reason: string }> | undefined;

      if (!intent) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'intent is required', 400);
        return;
      }
      if (!Array.isArray(candidates) || candidates.length === 0) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'candidates are required', 400);
        return;
      }
      if (!Array.isArray(selections) || selections.length === 0) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'selections (from select-blocks) are required', 400);
        return;
      }

      const buyerId = String(req.body?.buyer_id || '');
      const buyerName = String(req.body?.buyer_name || '');
      const buyer = buyerId && buyerName ? { id: buyerId, name: buyerName } : null;

      const gaps = Array.isArray(req.body?.gaps) ? req.body.gaps : [];
      const summary = String(req.body?.summary || 'Draft composed from your catalog.').slice(0, 400);
      const defaultCurrency = String(req.body?.default_currency || '').slice(0, 3);

      const result = await contractComposerService.assembleDraft(
        intent,
        buyer,
        candidates,
        { selections, gaps, summary },
        this.getContext(req),
        defaultCurrency || undefined
      );
      sendSuccess(res, result);
    } catch (error: any) {
      console.error('❌ VaniComposer assemble failed:', error.message);
      internalError(res, error.message || 'Assembly failed');
    }
  };

  /** POST /feedback — fire-and-forget quality signals */
  feedback = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ids = Array.isArray(req.body?.interaction_ids)
        ? req.body.interaction_ids.map(String).slice(0, 10)
        : [];
      if (ids.length === 0) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'interaction_ids is required', 400);
        return;
      }

      contractComposerService.recordFeedback(ids, {
        wasAccepted: typeof req.body?.was_accepted === 'boolean' ? req.body.was_accepted : undefined,
        wasEdited: typeof req.body?.was_edited === 'boolean' ? req.body.was_edited : undefined,
        userRating: typeof req.body?.user_rating === 'number' ? req.body.user_rating : undefined,
      });
      sendSuccess(res, { recorded: ids.length });
    } catch (error: any) {
      internalError(res, error.message || 'Feedback recording failed');
    }
  };
}

export default new VaniComposerController();
