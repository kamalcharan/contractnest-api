// src/services/evidenceStorageService.ts
// ============================================================================
// Evidence Storage Service — the broker.
// ============================================================================
// Every operation is: ask Postgres whether it is allowed, then mint a URL.
// Nothing here decides anything. The membership predicate, the cap and the
// registry all live in migration evidence-storage/001 + 002 and come back as
// { success:false, reason } which the controller maps to HTTP.
//
// The two-step upload matters: the size declared at slot request is a client
// claim, so confirm() reads the object back from Firebase and records what is
// actually there. An unconfirmed slot leaves an orphan the sweeper reclaims.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { signUploadUrl, signReadUrl, statObject, publicUrl, saveBuffer } from '../utils/firebaseStorageAdmin';
import { captureException } from '../utils/sentry';

export type EvidenceScope = 'contract' | 'tenant';
export type AssetKind = 'logo' | 'avatar' | 'block_icon' | 'integration_qr';

export interface SlotRequest {
  scope?: EvidenceScope;
  contractId?: string | null;
  eventId?: string | null;
  formSubmissionId?: string | null;
  assetKind?: AssetKind | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isCompressed?: boolean;
  originalSizeBytes?: number | null;
}

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  reason?: string;
  detail?: any;
}

class EvidenceStorageService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private async rpc<T = any>(fn: string, params: Record<string, any>): Promise<ToolResult<T>> {
    const supabase = this.client();
    if (!supabase) {
      return { success: false, reason: 'not_configured', detail: 'Supabase credentials missing' };
    }
    try {
      const { data, error } = await supabase.rpc(fn, params);
      if (error) {
        captureException(new Error(error.message), {
          tags: { source: 'evidence_storage', action: fn }
        });
        return { success: false, reason: 'database_error', detail: error.message };
      }
      if (data && data.success === false) {
        return { success: false, reason: data.reason || 'refused', detail: data };
      }
      return { success: true, data: data as T };
    } catch (err: any) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { source: 'evidence_storage', action: fn }
      });
      return { success: false, reason: 'database_error', detail: err?.message };
    }
  }

  /**
   * Step 1 of an upload. Checks membership, the mime allowlist and the cap
   * BEFORE the client does the work, then reserves a path and returns a
   * short-TTL signed URL to PUT the bytes to.
   */
  async requestSlot(
    tenantId: string,
    userId: string | null,
    isLive: boolean,
    req: SlotRequest
  ): Promise<ToolResult> {
    const gate = await this.rpc('evidence_request_slot', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_scope: req.scope || 'contract',
      p_contract_id: req.contractId || null,
      p_event_id: req.eventId || null,
      p_form_submission_id: req.formSubmissionId || null,
      p_asset_kind: req.assetKind || null,
      p_file_name: req.fileName,
      p_mime_type: req.mimeType,
      p_declared_size: req.sizeBytes,
      p_is_compressed: req.isCompressed ?? false,
      p_original_size: req.originalSizeBytes ?? null,
      p_is_live: isLive
    });
    if (!gate.success) return gate;

    const { evidence_id, object_path, metered, usage } = gate.data;

    try {
      const uploadUrl = await signUploadUrl(object_path, req.mimeType);
      return {
        success: true,
        data: {
          evidence_id,
          object_path,
          upload_url: uploadUrl,
          method: 'PUT',
          headers: { 'Content-Type': req.mimeType },
          expires_in_seconds: 600,
          metered,
          usage: usage ?? null
        }
      };
    } catch (err: any) {
      // The registry row stays pending and the sweeper reclaims it. Better a
      // harmless orphan row than a signed URL we failed to hand over.
      captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { source: 'evidence_storage', action: 'signUploadUrl' }
      });
      return { success: false, reason: 'sign_failed', detail: err?.message };
    }
  }

  /**
   * Step 2. The client says it finished; we verify the object is really there,
   * read its TRUE size, and only then does the row become active and metered.
   */
  async confirm(tenantId: string, evidenceId: string): Promise<ToolResult> {
    // A pending row is deliberately NOT readable through evidence_resolve_read,
    // so the path comes from the owner-only lookup instead.
    const row = await this.rpc('evidence_pending_path', {
      p_evidence_id: evidenceId,
      p_tenant_id: tenantId
    });
    if (!row.success) return row;

    const stat = await statObject(row.data.object_path);
    if (!stat.exists) {
      // The client never finished the PUT. The row stays pending and the
      // sweeper reclaims it; the tenant is not billed for bytes that never
      // arrived.
      return { success: false, reason: 'object_missing' };
    }

    const confirmed = await this.rpc('evidence_confirm', {
      p_evidence_id: evidenceId,
      p_tenant_id: tenantId,
      p_size_bytes: stat.sizeBytes,
      p_checksum: stat.md5 || null
    });
    if (!confirmed.success) return confirmed;

    // An identity asset gets a durable URL the caller stores in its own field
    // (logo_url, avatar, qr_image_url, a block's custom icon). Contract
    // evidence never does — it is signed per viewer, per request.
    const isIdentityAsset = row.data.object_path.startsWith('tenants/');
    return {
      success: true,
      data: {
        ...confirmed.data,
        object_path: row.data.object_path,
        ...(isIdentityAsset ? { public_url: publicUrl(row.data.object_path) } : {})
      }
    };
  }

  /**
   * A read URL for anyone the predicate allows: seller tenant, buyer tenant, or
   * a CNAK holder who is not a tenant at all. All three reach the SAME object —
   * nothing is copied and nothing is re-uploaded.
   */
  async readUrl(
    evidenceId: string,
    tenantId: string | null,
    cnak: string | null,
    secret: string | null
  ): Promise<ToolResult> {
    const allowed = await this.rpc('evidence_resolve_read', {
      p_evidence_id: evidenceId,
      p_tenant_id: tenantId,
      p_cnak: cnak,
      p_secret: secret
    });
    if (!allowed.success) return allowed;

    const { object_path, file_name, mime_type, size_bytes } = allowed.data;
    try {
      const url = await signReadUrl(object_path, file_name);
      return {
        success: true,
        data: {
          evidence_id: evidenceId,
          url,
          file_name,
          mime_type,
          size_bytes,
          expires_in_seconds: 300
        }
      };
    } catch (err: any) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { source: 'evidence_storage', action: 'signReadUrl' }
      });
      return { success: false, reason: 'sign_failed', detail: err?.message };
    }
  }

  /**
   * An identity asset whose bytes are already on our server (multipart upload).
   *
   * Used by the tenant-logo and integration-QR endpoints, which keep their own
   * routes and their own contracts — the QR one in particular also decodes the
   * image to recover org_id/mcc for UPI merchant payments, and that logic is
   * untouched. Only where the bytes land changed: Admin SDK instead of the
   * client SDK with anonymous auth, and a registry row instead of nothing.
   */
  async saveIdentityAsset(
    tenantId: string,
    userId: string | null,
    assetKind: AssetKind,
    fileName: string,
    mimeType: string,
    buffer: Buffer,
    isLive = true
  ): Promise<ToolResult<{ evidence_id: string; public_url: string; object_path: string }>> {
    const slot = await this.rpc('evidence_request_slot', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_scope: 'tenant',
      p_contract_id: null,
      p_event_id: null,
      p_form_submission_id: null,
      p_asset_kind: assetKind,
      p_file_name: fileName,
      p_mime_type: mimeType,
      p_declared_size: buffer.length,
      p_is_compressed: false,
      p_original_size: null,
      p_is_live: isLive
    });
    if (!slot.success) return slot as any;

    const { evidence_id, object_path } = slot.data;

    try {
      await saveBuffer(object_path, buffer, mimeType, { tenantId, assetKind });
    } catch (err: any) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { source: 'evidence_storage', action: 'saveIdentityAsset' }
      });
      // The pending row is left for the sweeper rather than deleted here: a
      // failed write must not also cost us the record that we tried.
      return { success: false, reason: 'upload_failed', detail: err?.message };
    }

    const confirmed = await this.rpc('evidence_confirm', {
      p_evidence_id: evidence_id,
      p_tenant_id: tenantId,
      p_size_bytes: buffer.length,
      p_checksum: null
    });
    if (!confirmed.success) return confirmed as any;

    return {
      success: true,
      data: { evidence_id, object_path, public_url: publicUrl(object_path) }
    };
  }

  /** Marks a row deleted. The bytes go when the sweeper runs — never inline. */
  async remove(tenantId: string, evidenceId: string): Promise<ToolResult> {
    return this.rpc('evidence_mark_deleted', {
      p_evidence_id: evidenceId,
      p_tenant_id: tenantId
    });
  }

  /** Derived usage — summed from the registry every time, never a counter. */
  async usage(tenantId: string): Promise<ToolResult> {
    return this.rpc('evidence_usage', { p_tenant_id: tenantId });
  }

  /** Everything registered against one contract, for the evidence list. */
  async listForContract(
    tenantId: string | null,
    contractId: string,
    cnak: string | null,
    secret: string | null,
    isLive: boolean
  ): Promise<ToolResult> {
    return this.rpc('evidence_list_for_contract', {
      p_contract_id: contractId,
      p_tenant_id: tenantId,
      p_cnak: cnak,
      p_secret: secret,
      p_is_live: isLive
    });
  }

  /** Turns a CNAK grant off. Creator only; enforced in the RPC. */
  async revokeAccess(tenantId: string, contractId: string, cnak: string | null): Promise<ToolResult> {
    return this.rpc('revoke_contract_access', {
      p_contract_id: contractId,
      p_tenant_id: tenantId,
      p_cnak: cnak
    });
  }
}

export default new EvidenceStorageService();
