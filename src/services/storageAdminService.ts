// src/services/storageAdminService.ts
// ============================================================================
// Storage admin — what is actually in the bucket, and what may be deleted.
// ============================================================================
// GCS has no folders. A "folder" is a shared path prefix, so the only way to
// know what exists is to list objects and group them. Three namespaces:
//
//   contracts/**   contract evidence     METERED, governed by the registry
//   tenants/**     identity assets       unmetered (logos, avatars, icons, QRs)
//   tenant_*       LEGACY provisioned folders from the per-tenant model
//   anything else  unaccounted for
//
// Only the last two may be deleted here. contracts/ and tenants/ are refused
// outright: those are the live model, and retiring one of their objects is the
// registry's job (evidence_mark_deleted) so the sweep can reclaim it properly.
//
// ⚠️ LEGACY FOLDERS ARE NOT ALWAYS ONE PER TENANT. Four live tenants share
// 'tenant_c0000000_demo'. Deleting a prefix therefore deletes every tenant
// that points at it, which is why every row carries the full tenant list and
// the UI must show it before anyone presses delete.
//
// ⚠️ AND PREFIX SHAPE DOES NOT DECIDE DELETABILITY. Two shared asset folders
// match /^tenant_/ but are live:
//     tenant_logos               stw and vikuna tenant logos
//     tenant_integration_assets  BBB's live payment QR
// Two per-tenant folders are also still referenced (a user avatar, six stored
// files) — four of six, so shape alone is wrong more often than it is right.
// A prefix is deletable only when NOTHING in the database points into it, which
// storage_prefix_references() (migration evidence-storage/007) answers. The
// check is enforced in remove(), not merely reflected in the UI flag.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  listObjects,
  listTopLevelPrefixes,
  deletePrefix,
  signReadUrl,
  isConfigured,
  type PrefixListing,
} from '../utils/firebaseStorageAdmin';
import { captureException } from '../utils/sentry';

/** The two namespaces the live model owns. Never deletable from this screen. */
const PROTECTED_PREFIXES = ['contracts', 'tenants'];

export type PrefixKind = 'evidence' | 'identity' | 'legacy' | 'unknown';

/**
 * How confidently a prefix was traced back to a tenant.
 *   linked    - a tenant's storage_path points here
 *   id_prefix - no storage_path, but the legacy folder name embeds the first 8
 *               characters of a tenant's UUID (tenant_<id8>_<epoch>)
 *   orphaned  - the name embeds an id that matches NO tenant. The tenant was
 *               deleted and these files outlived it.
 *   unknown   - not a per-tenant folder at all
 */
export type OwnerTrace = 'linked' | 'id_prefix' | 'orphaned' | 'unknown';

export interface TenantRef {
  id: string;
  name: string | null;
  /** t_tenants.is_test — 7 of the 10 live tenants are test workspaces. */
  isTest: boolean;
  /** t_tenants.status. All rows read 'active' today; a DELETED tenant has no row at all. */
  status: string | null;
}

export interface PrefixRow {
  prefix: string;
  kind: PrefixKind;
  count: number;
  bytes: number;
  deletable: boolean;
  /** Tenants whose storage_path points here. More than one is a real hazard. */
  tenants: TenantRef[];
  /** Set when a legacy folder is recorded on a tenant but absent from the bucket. */
  missingFromBucket?: boolean;
  /**
   * Live rows still pointing into this prefix. Non-empty means NOT deletable —
   * deleting would break a logo, an avatar, a payment QR or a stored file.
   */
  references: Array<{ kind: string; label: string | null }>;
  /** How the tenants below were established. See OwnerTrace. */
  ownerTrace: OwnerTrace;
  /** The id fragment in the folder name, when it has one. Shown when orphaned. */
  tenantIdFragment?: string;
}

export interface StorageOverview {
  success: boolean;
  reason?: string;
  firebase_configured: boolean;
  prefixes: PrefixRow[];
  totals: { count: number; bytes: number };
  /** Registry totals, for comparison with what the bucket actually holds. */
  registry: { active: number; pending: number; deleted: number; active_bytes: number };
}

class StorageAdminService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  private classify(prefix: string): PrefixKind {
    if (prefix === 'contracts') return 'evidence';
    if (prefix === 'tenants') return 'identity';
    if (/^tenant_/.test(prefix)) return 'legacy';
    return 'unknown';
  }

  /**
   * A prefix may be deleted only when it is outside the live namespaces AND
   * nothing in the database points into it. Checked here for the UI flag and
   * AGAIN in remove() against a freshly read reference map — the flag is a
   * hint, never the thing that enforces it.
   */
  private isDeletable(prefix: string, referenceCount: number): boolean {
    const top = prefix.includes('/') ? prefix.slice(0, prefix.indexOf('/')) : prefix;
    if (PROTECTED_PREFIXES.includes(top)) return false;
    if (top === '(root)') return false;
    if (referenceCount > 0) return false;
    return top.length > 0;
  }

  /** Everything in the bucket, grouped, with the tenants attached to each prefix. */
  async overview(): Promise<StorageOverview> {
    const empty: StorageOverview = {
      success: false,
      firebase_configured: isConfigured(),
      prefixes: [],
      totals: { count: 0, bytes: 0 },
      registry: { active: 0, pending: 0, deleted: 0, active_bytes: 0 },
    };
    if (!isConfigured()) return { ...empty, reason: 'not_configured' };

    try {
      const [buckets, owners, registry, references, byIdPrefix] = await Promise.all([
        listTopLevelPrefixes(),
        this.legacyOwners(),
        this.registryTotals(),
        this.references(),
        this.tenantsByIdPrefix(),
      ]);

      const rows: PrefixRow[] = buckets.map(b => {
        const refs = references[b.prefix] ?? [];
        const owned = this.traceOwner(b.prefix, owners, byIdPrefix);
        return {
          prefix: b.prefix,
          kind: this.classify(b.prefix),
          count: b.count,
          bytes: b.bytes,
          deletable: this.isDeletable(b.prefix, refs.length),
          tenants: owned.tenants,
          references: refs,
          ownerTrace: owned.trace,
          tenantIdFragment: owned.fragment,
        };
      });

      // A folder recorded on a tenant but absent from the bucket is worth
      // showing: it means the objects are already gone and only the
      // storage_path reference is left behind.
      const seen = new Set(buckets.map(b => b.prefix));
      for (const [prefix, tenants] of owners.entries()) {
        if (seen.has(prefix)) continue;
        rows.push({
          prefix, kind: 'legacy', count: 0, bytes: 0,
          deletable: false, tenants, missingFromBucket: true,
          references: references[prefix] ?? [], ownerTrace: 'linked',
        });
      }

      return {
        success: true,
        firebase_configured: true,
        prefixes: rows,
        totals: {
          count: buckets.reduce((n, b) => n + b.count, 0),
          bytes: buckets.reduce((n, b) => n + b.bytes, 0),
        },
        registry,
      };
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_admin', action: 'overview' },
      });
      return { ...empty, reason: 'listing_failed' };
    }
  }

  /** What is actually inside a prefix, so nobody deletes blind. */
  async browse(prefix: string, limit = 200): Promise<{ success: boolean; reason?: string; data?: PrefixListing }> {
    if (!isConfigured()) return { success: false, reason: 'not_configured' };
    if (!prefix || prefix.includes('..')) return { success: false, reason: 'invalid_prefix' };
    try {
      return { success: true, data: await listObjects(prefix, limit) };
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_admin', action: 'browse' }, extra: { prefix },
      });
      return { success: false, reason: 'listing_failed' };
    }
  }

  /**
   * Delete a legacy or unaccounted-for prefix. Refuses the live namespaces
   * whatever the caller claims, and clears storage_path on any tenant that
   * pointed at it so the old model stops believing it has a folder.
   */
  async remove(prefix: string): Promise<{ success: boolean; reason?: string; deleted?: number; failed?: number; bytes?: number; tenantsCleared?: number; references?: Array<{ kind: string; label: string | null }> }> {
    if (!isConfigured()) return { success: false, reason: 'not_configured' };
    if (!prefix || prefix.includes('..')) return { success: false, reason: 'invalid_prefix' };
    if (!this.isDeletable(prefix, 0)) return { success: false, reason: 'protected_prefix' };

    // Re-read references at delete time. The overview may be minutes old, and
    // in that window someone can have uploaded a logo or a payment QR into
    // this prefix. Never delete something the database is still pointing at.
    const references = await this.references();
    const stillUsed = references[prefix] ?? [];
    if (stillUsed.length > 0) {
      return { success: false, reason: 'prefix_in_use', references: stillUsed };
    }

    try {
      const result = await deletePrefix(prefix.endsWith('/') ? prefix : `${prefix}/`);

      // Clear the reference too, otherwise the legacy pages keep pointing at a
      // folder that no longer exists — which is exactly how that surface
      // starts throwing.
      let tenantsCleared = 0;
      const supabase = this.client();
      if (supabase) {
        const { data, error } = await supabase
          .from('t_tenants')
          .update({ storage_path: null, storage_setup_complete: false })
          .eq('storage_path', prefix)
          .select('id');
        if (error) {
          captureException(new Error(error.message), {
            tags: { source: 'storage_admin', action: 'clear_storage_path' }, extra: { prefix },
          });
        } else {
          tenantsCleared = data?.length ?? 0;
        }
      }

      return { success: true, ...result, tenantsCleared };
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_admin', action: 'remove' }, extra: { prefix },
      });
      return { success: false, reason: 'delete_failed' };
    }
  }

  /**
   * Work out whose folder this is. A long opaque prefix is useless to an admin
   * deciding whether to delete 4.9 MB, and storage_path alone does not answer
   * it: folders outlive the tenant rows that named them.
   */
  private traceOwner(
    prefix: string,
    owners: Map<string, TenantRef[]>,
    byIdPrefix: Map<string, TenantRef>
  ): { tenants: TenantRef[]; trace: OwnerTrace; fragment?: string } {
    const linked = owners.get(prefix);
    if (linked?.length) return { tenants: linked, trace: 'linked' };

    // Legacy folders are named tenant_<first 8 of uuid>_<epoch>.
    const match = /^tenant_([0-9a-f]{8})_/.exec(prefix);
    if (!match) return { tenants: [], trace: 'unknown' };

    const fragment = match[1];
    const hit = byIdPrefix.get(fragment);
    if (hit) return { tenants: [hit], trace: 'id_prefix', fragment };

    // Nothing matches. Tenants are HARD deleted - there is no status='deleted'
    // row to find - so an unmatched id means the workspace is gone entirely.
    return { tenants: [], trace: 'orphaned', fragment };
  }

  /** first 8 characters of each tenant id -> that tenant. */
  private async tenantsByIdPrefix(): Promise<Map<string, TenantRef>> {
    const map = new Map<string, TenantRef>();
    const supabase = this.client();
    if (!supabase) return map;
    const { data, error } = await supabase.from('t_tenants').select('id, name, is_test, status');
    if (error || !data) return map;
    for (const row of data as any[]) {
      map.set(String(row.id).slice(0, 8), {
        id: row.id, name: row.name ?? null,
        isTest: row.is_test === true, status: row.status ?? null,
      });
    }
    return map;
  }

  /**
   * A short-lived link to look at one object before deciding its fate.
   * Deliberately NOT restricted to the live namespaces: the whole point is to
   * inspect legacy and orphaned files, which no other surface can open.
   */
  async viewUrl(objectPath: string): Promise<{ success: boolean; reason?: string; url?: string }> {
    if (!isConfigured()) return { success: false, reason: 'not_configured' };
    if (!objectPath || objectPath.includes('..')) return { success: false, reason: 'invalid_path' };
    try {
      return { success: true, url: await signReadUrl(objectPath) };
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_admin', action: 'viewUrl' }, extra: { objectPath },
      });
      return { success: false, reason: 'sign_failed' };
    }
  }

  /** prefix -> the tenants whose storage_path points at it. */
  private async legacyOwners(): Promise<Map<string, TenantRef[]>> {
    const map = new Map<string, TenantRef[]>();
    const supabase = this.client();
    if (!supabase) return map;
    const { data, error } = await supabase
      .from('t_tenants')
      .select('id, name, is_test, status, storage_path')
      .not('storage_path', 'is', null);
    if (error || !data) return map;
    for (const row of data as any[]) {
      const list = map.get(row.storage_path) ?? [];
      list.push({
        id: row.id, name: row.name ?? null,
        isTest: row.is_test === true, status: row.status ?? null,
      });
      map.set(row.storage_path, list);
    }
    return map;
  }

  /**
   * prefix -> the live rows pointing into it (migration evidence-storage/007).
   * A failure here returns {} which would make everything look deletable, so
   * it is treated as fatal by the caller rather than silently ignored.
   */
  private async references(): Promise<Record<string, Array<{ kind: string; label: string | null }>>> {
    const supabase = this.client();
    if (!supabase) throw new Error('no database client for reference check');
    const { data, error } = await supabase.rpc('storage_prefix_references');
    if (error) throw new Error(`reference check failed: ${error.message}`);
    return (data ?? {}) as Record<string, Array<{ kind: string; label: string | null }>>;
  }

  private async registryTotals(): Promise<{ active: number; pending: number; deleted: number; active_bytes: number }> {
    const zero = { active: 0, pending: 0, deleted: 0, active_bytes: 0 };
    const supabase = this.client();
    if (!supabase) return zero;
    const { data, error } = await supabase
      .from('t_contract_evidence')
      .select('status, size_bytes');
    if (error || !data) return zero;
    const totals = { ...zero };
    for (const row of data as any[]) {
      if (row.status === 'active') {
        totals.active += 1;
        totals.active_bytes += Number(row.size_bytes ?? 0);
      } else if (row.status === 'pending') totals.pending += 1;
      else if (row.status === 'deleted') totals.deleted += 1;
    }
    return totals;
  }
}

export const storageAdminService = new StorageAdminService();
export default storageAdminService;
