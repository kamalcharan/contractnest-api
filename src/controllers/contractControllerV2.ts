// src/controllers/contractControllerV2.ts
// JTD Nucleus initiative — Milestone 1. New, versioned sibling of
// contractController.ts. That file is untouched. Create only, for now.

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import ContractServiceV2 from '../services/contractServiceV2';
import {
  sendSuccess,
  sendError,
  internalError,
  ERROR_CODES
} from '../utils/apiResponseHelpers';

class ContractControllerV2 {
  private contractServiceV2: ContractServiceV2;

  constructor() {
    this.contractServiceV2 = new ContractServiceV2();
  }

  /**
   * POST /api/v2/contracts
   * Create new contract via create_contract_transaction_v2.
   * Same request shape as POST /api/contracts — only the backing RPC differs.
   */
  createContract = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';
      const idempotencyKey = req.headers['x-idempotency-key'] as string;

      const result = await this.contractServiceV2.createContract(
        req.body,
        userJWT,
        tenantId,
        userId,
        environment,
        idempotencyKey
      );

      if (!result.success) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, result.error || 'Contract creation failed', 400, { details: result.code });
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('[ContractControllerV2] Error in createContract:', error);
      internalError(res, 'Failed to create contract');
    }
  };

  /**
   * PATCH /api/v2/contracts/:id/status
   * V2 status transition — on activation, jobs materialize from
   * computed_events inside the RPC before the untouched V1 engine runs.
   */
  updateContractStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';

      if (!req.body?.status) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'status is required', 400);
        return;
      }

      const result = await this.contractServiceV2.updateContractStatus(
        id, req.body, userJWT, tenantId, userId, environment
      );

      if (!result.success) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, result.error || 'Status update failed', 400, { details: result.code });
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ContractControllerV2] Error in updateContractStatus:', error);
      internalError(res, 'Failed to update contract status');
    }
  };

  /**
   * GET /api/v2/contracts/:id/details
   * JTD Nucleus Step 3 — single-call contract view aggregate: contract +
   * blocks + events (n_jtd jobs, legacy fallback for pre-nucleus
   * contracts) + CNAK + invoices. Replaces 4 separate round-trips.
   */
  getContractDetails = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      const result = await this.contractServiceV2.getContractDetails(
        id, userJWT, tenantId, environment
      );

      if (!result.success) {
        sendError(res, ERROR_CODES.NOT_FOUND, result.error || 'Contract not found', 404);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('[ContractControllerV2] Error in getContractDetails:', error);
      internalError(res, 'Failed to load contract details');
    }
  };

  /**
   * POST /api/v2/contracts/:id/record-payment
   * JTD Nucleus Step 4 — V2 payment path. Same request/response shape as
   * V1's POST /api/contracts/:id/invoices/record-payment; settlement lands
   * on n_jtd JOB rows instead of t_contract_events.
   */
  recordPayment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';

      if (!req.body?.invoice_id || req.body?.amount === undefined) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'invoice_id and amount are required', 400);
        return;
      }

      const result = await this.contractServiceV2.recordPayment(
        id, req.body, userJWT, tenantId, userId, environment
      );

      if (!result.success) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, result.error || 'Payment recording failed', 400, { details: result.code });
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('[ContractControllerV2] Error in recordPayment:', error);
      internalError(res, 'Failed to record payment');
    }
  };

  /**
   * POST /api/v2/contracts/bulk-create
   * V2 sibling of POST /api/contracts/bulk-create (that route is untouched).
   * Same request/response shape; two deliberate differences:
   *   · each item is created through create_contract_transaction_v2
   *     (explicit seller/buyer, unconditional CNAK grant, cadence-fit
   *     backstop) instead of the V1 create — bulk and single assignment
   *     now produce contracts through ONE engine;
   *   · duplicate protection is REAL IDEMPOTENCY, not a business rule.
   *
   * On that second point (owner decision 2026-08-17): V1 refused to create
   * for any buyer already holding an active/pending contract from the same
   * template. That was a permanent business rule wearing an idempotency
   * label — there is no rule that a contact may hold only one contract from
   * a template (a second site, a second unit, an early renewal are all
   * legitimate), and it silently dropped members from the batch. Removed.
   * Accidental double-submission is now handled where it belongs: the
   * client stamps ONE key per submission attempt and each item derives a
   * stable key from it, so a replayed request returns the stored response
   * (check_idempotency / store_idempotency inside the RPC) instead of
   * creating a second contract — while a DELIBERATE later assignment
   * carries a new key and correctly creates one.
   *
   * Per-item independence unchanged: one failed member never rolls back
   * the others; a failed activation leaves that contract as a draft.
   */
  bulkCreateContracts = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = req.body || {};
      // body.template_id is still accepted for request-shape compatibility but
      // is no longer read: it existed only to drive the removed already-assigned
      // lookup. Each item's own request already carries its template_id, which
      // is what actually lands on the contract row.
      const activate: boolean = body.activate !== false; // default true
      const items: Array<{ buyer_id?: string; request?: any }> = Array.isArray(body.items) ? body.items : [];

      if (items.length === 0) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'items is required and must be a non-empty array', 400);
        return;
      }
      if (items.length > 200) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'items exceeds the 200-per-request limit', 400);
        return;
      }
      if (items.some((i) => !i || typeof i.request !== 'object' || i.request === null)) {
        sendError(res, ERROR_CODES.VALIDATION_ERROR, 'each item must include a request object', 400);
        return;
      }

      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = (req.headers['x-environment'] as string) || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';

      // One key per submission attempt, sent by the client. Each item derives
      // a stable key from it so a replayed request (network retry, duplicate
      // delivery) returns the stored response instead of creating a second
      // contract. Absent key = no replay protection, which is the caller's
      // choice — never a reason to refuse the batch.
      const batchKey: string | undefined = body.idempotency_key;

      const results: Array<Record<string, any>> = [];
      // `skipped` is retained in the summary shape (always 0 now) so existing
      // callers reading summary.skipped keep working.
      let created = 0; const skipped = 0; let failed = 0;

      for (const item of items) {
        const buyerId = item.buyer_id || null;

        try {
          const itemKey = batchKey && buyerId ? `${batchKey}:${buyerId}` : undefined;
          const createRes = await this.contractServiceV2.createContract(
            item.request, userJWT, tenantId, userId, environment, itemKey
          );
          if (!createRes.success) {
            failed += 1;
            results.push({ buyer_id: buyerId, status: 'failed', error: createRes.error || 'Create failed' });
            continue;
          }

          const contract: any = createRes.data || {};
          let status: string = contract.status || 'created';
          let globalAccessId: string | undefined = contract.global_access_id;

          if (activate && contract.id && contract.status === 'draft') {
            // V2 status path (single engine): single-shot creates already
            // consumed computed_events at birth, so the materializer inside
            // no-ops — but every V2-router transition now goes one way.
            const st = await this.contractServiceV2.updateContractStatus(
              contract.id, { status: 'active' }, userJWT, tenantId, userId, environment
            );
            if (st.success) {
              status = 'active';
              if ((st.data as any)?.global_access_id) globalAccessId = (st.data as any).global_access_id;
            }
            // A failed activation is non-fatal: the contract exists as a draft
            // and can be activated later.
          }

          created += 1;
          results.push({
            buyer_id: buyerId,
            status,
            contract_id: contract.id,
            contract_number: contract.contract_number,
            ...(globalAccessId ? { global_access_id: globalAccessId } : {}),
          });
        } catch (err: any) {
          failed += 1;
          results.push({ buyer_id: buyerId, status: 'failed', error: err?.message || 'Create failed' });
        }
      }

      sendSuccess(res, {
        results,
        summary: { total: items.length, created, skipped, failed },
      });
    } catch (error) {
      console.error('[ContractControllerV2] Error in bulkCreateContracts:', error);
      internalError(res, 'Bulk contract creation failed');
    }
  };
}

export default ContractControllerV2;
