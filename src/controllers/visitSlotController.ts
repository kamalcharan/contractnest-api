// ============================================================================
// Visit Slot Controller — public /slot/:token page (Ops on JTD, Appointments)
// ============================================================================
// Thin: validates the token shape and the action, the RPCs decide everything
// else and answer {ok:false, reason} which maps to HTTP here. A refusal is a
// normal answer for the page (it renders the reason), never a 500.
// ============================================================================

import { Request, Response } from 'express';
import visitSlotService from '../services/visitSlotService';
import { sendSuccess, sendError, ERROR_CODES } from '../utils/apiResponseHelpers';

const REASON_STATUS: Record<string, number> = {
  invalid_token: 404,
  visit_closed: 410,
  visit_in_progress: 409,
  slot_in_past: 400,
  no_slot: 409,
  bad_action: 400,
  downstream_refused: 409,
};

class VisitSlotController {
  /** GET /api/visit-slot/:token */
  resolve = async (req: Request, res: Response): Promise<void> => {
    const token = req.params.token;
    if (!visitSlotService.isToken(token)) { sendError(res, ERROR_CODES.NOT_FOUND, 'This link is not valid', 404); return; }
    const result = await visitSlotService.resolve(token);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Could not open this link', 500); return; }
    if (!result.data?.ok) {
      sendError(res, ERROR_CODES.NOT_FOUND, 'This link is not valid', REASON_STATUS[result.data?.reason] || 404);
      return;
    }
    sendSuccess(res, result.data);
  };

  /** POST /api/visit-slot/:token/respond  body: { action: accept|propose|decline, proposed_at?, note? } */
  respond = async (req: Request, res: Response): Promise<void> => {
    const token = req.params.token;
    if (!visitSlotService.isToken(token)) { sendError(res, ERROR_CODES.NOT_FOUND, 'This link is not valid', 404); return; }
    const action = String(req.body?.action || '');
    if (!['accept', 'propose', 'decline'].includes(action)) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'action must be accept, propose or decline', 400); return; }
    let proposedAt: string | null = null;
    if (action === 'propose') {
      const raw = String(req.body?.proposed_at || '').trim();
      // A local date-time from the page (YYYY-MM-DDTHH:mm) is IST; a full ISO passes through.
      if (!raw) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'proposed_at is required to suggest a time', 400); return; }
      proposedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00+05:30` : raw;
      if (isNaN(new Date(proposedAt).getTime())) { sendError(res, ERROR_CODES.VALIDATION_ERROR, 'proposed_at is not a valid date-time', 400); return; }
    }
    const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 500) : null;

    const result = await visitSlotService.respond(token, action as 'accept' | 'propose' | 'decline', proposedAt, note);
    if (!result.success) { sendError(res, ERROR_CODES.INTERNAL_ERROR, result.error?.message || 'Could not record your answer', 500); return; }
    if (!result.data?.ok) {
      const reason = result.data?.reason || 'refused';
      const copy: Record<string, string> = {
        invalid_token: 'This link is not valid',
        visit_closed: 'This visit is already closed',
        visit_in_progress: 'This visit is already under way',
        slot_in_past: 'Please pick a time that is still ahead',
        no_slot: 'There is no slot to confirm yet',
        downstream_refused: result.data?.detail || 'Could not record your answer',
      };
      sendError(res, ERROR_CODES.VALIDATION_ERROR, copy[reason] || 'Could not record your answer', REASON_STATUS[reason] || 409);
      return;
    }
    sendSuccess(res, result.data);
  };
}

export default VisitSlotController;
