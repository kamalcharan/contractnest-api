// src/services/storageCleanupService.ts
// ============================================================================
// StorageCleanup — the sweep that actually reclaims bytes.
// ============================================================================
// The database half (migration evidence-storage/004 + 006) decides WHAT may be
// reclaimed; this decides WHEN and does the one thing Postgres cannot — delete
// the object from Firebase.
//
//   storage_cleanup_due()     is a run worth doing at all?
//   storage_cleanup_claim()   rows to reclaim, with their object paths
//   deleteObject()            the only place bytes actually go
//   storage_cleanup_settle()  drop the settled rows, keep the failed ones
//   storage_cleanup_record()  one n_jtd row per tenant per environment
//
// Why the API and not the jtd-worker: the edge runtime holds no Firebase
// service account, so the worker could only ask the API to delete — a hop that
// buys nothing for a daily idempotent sweep. Why setInterval and not pg_cron:
// the sweep needs Firebase credentials, and putting an API URL and a shared
// secret in the database to poke it would be a new secret for no gain.
//
// SAFETY: claim() never returns an 'active' row and settle() refuses to remove
// one. The sweeper can only finish what something else already decided was
// dead. A failed delete KEEPS its row and is retried next run — dropping the
// row would strand the bytes with nothing left pointing at them.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { deleteObject, isConfigured } from '../utils/firebaseStorageAdmin';
import { captureException } from '../utils/sentry';

/** How often the timer wakes. due() decides whether it actually sweeps. */
const TICK_MS = 60 * 60 * 1000;          // hourly
/** A first tick soon after boot, but not during it. */
const FIRST_TICK_MS = 5 * 60 * 1000;     // 5 minutes
/** Hours since the last recorded run before another is worth doing. */
const MIN_HOURS_BETWEEN_RUNS = 20;       // ~daily, without drifting later each day
/** Objects per run. Deliberately bounded — the remainder waits for the next. */
const BATCH_LIMIT = 200;
/** An unconfirmed upload is an orphan once it is this old. */
const ORPHAN_HOURS = 24;

interface ClaimItem {
  evidence_id: string;
  tenant_id: string | null;
  object_path: string;
  size_bytes: number | null;
  is_live: boolean | null;
  reason: 'retired' | 'orphan';
}

export interface SweepSummary {
  ran: boolean;
  skipped?: 'not_configured' | 'no_database' | 'already_running' | 'not_due';
  claimed: number;
  deleted: number;
  failed: number;
  bytes: number;
  runs: number;          // n_jtd history rows written
  detail?: string;
}

// Single-process overlap guard. Cross-process needs no lock: every step is
// idempotent, so two sweepers racing duplicate work and change nothing else.
// (An advisory lock was tried in 004 and removed — it is session-scoped and
// re-entrant, so a pooled connection can leak it and block every future run.)
let running = false;
let timer: NodeJS.Timeout | null = null;

class StorageCleanupService {
  private client(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  /**
   * One sweep. `force` skips the due() check — used by the admin endpoint so a
   * run can be triggered on demand without waiting for the timer.
   */
  async runSweep(options: { force?: boolean; limit?: number } = {}): Promise<SweepSummary> {
    const empty: SweepSummary = { ran: false, claimed: 0, deleted: 0, failed: 0, bytes: 0, runs: 0 };

    if (!isConfigured()) return { ...empty, skipped: 'not_configured' };
    const supabase = this.client();
    if (!supabase) return { ...empty, skipped: 'no_database' };
    if (running) return { ...empty, skipped: 'already_running' };

    running = true;
    try {
      if (!options.force) {
        const { data: due, error } = await supabase.rpc('storage_cleanup_due', {
          p_min_hours: MIN_HOURS_BETWEEN_RUNS,
        });
        if (error) throw new Error(error.message);
        if (!due?.due) return { ...empty, skipped: 'not_due' };
      }

      const { data: claim, error: claimError } = await supabase.rpc('storage_cleanup_claim', {
        p_limit: options.limit ?? BATCH_LIMIT,
        p_orphan_hours: ORPHAN_HOURS,
      });
      if (claimError) throw new Error(claimError.message);

      const items: ClaimItem[] = claim?.items ?? [];
      if (items.length === 0) return { ...empty, ran: true };

      const done: string[] = [];
      const failed: string[] = [];
      let bytes = 0;

      // Sequential on purpose: a bounded batch against a rate-limited API, and
      // a slow sweep costs nothing since nothing waits on it.
      for (const item of items) {
        const ok = await deleteObject(item.object_path);
        if (ok) {
          done.push(item.evidence_id);
          bytes += item.size_bytes ?? 0;
        } else {
          failed.push(item.evidence_id);
        }
      }

      const { error: settleError } = await supabase.rpc('storage_cleanup_settle', {
        p_done: done,
        p_failed: failed,
      });
      if (settleError) throw new Error(settleError.message);

      // One history row per tenant per environment, so a run reads back the
      // way it happened rather than as one undifferentiated total.
      const buckets = new Map<string, { tenant: string; isLive: boolean; deleted: number; failed: number; bytes: number }>();
      for (const item of items) {
        if (!item.tenant_id) continue;
        const isLive = item.is_live !== false;
        const key = `${item.tenant_id}|${isLive}`;
        const bucket = buckets.get(key) ?? { tenant: item.tenant_id, isLive, deleted: 0, failed: 0, bytes: 0 };
        if (done.includes(item.evidence_id)) {
          bucket.deleted += 1;
          bucket.bytes += item.size_bytes ?? 0;
        } else {
          bucket.failed += 1;
        }
        buckets.set(key, bucket);
      }

      let runs = 0;
      for (const bucket of buckets.values()) {
        const { error } = await supabase.rpc('storage_cleanup_record', {
          p_tenant_id: bucket.tenant,
          p_counts: { deleted: bucket.deleted, failed: bucket.failed, bytes: bucket.bytes },
          p_is_live: bucket.isLive,
        });
        // A missing history row must not lose a completed reclaim — the bytes
        // are already gone and the registry rows are already settled.
        if (error) {
          captureException(new Error(error.message), {
            tags: { source: 'storage_cleanup', action: 'record' },
            extra: { tenantId: bucket.tenant, isLive: bucket.isLive },
          });
        } else {
          runs += 1;
        }
      }

      return { ran: true, claimed: items.length, deleted: done.length, failed: failed.length, bytes, runs };
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_cleanup', action: 'runSweep' },
      });
      return { ...empty, detail: error instanceof Error ? error.message : String(error) };
    } finally {
      running = false;
    }
  }

  /** What a sweep would find, without touching anything. Feeds the admin screen. */
  async status(): Promise<any> {
    const supabase = this.client();
    if (!supabase) return { success: false, reason: 'no_database' };
    const { data, error } = await supabase.rpc('storage_cleanup_due', {
      p_min_hours: MIN_HOURS_BETWEEN_RUNS,
    });
    if (error) return { success: false, reason: 'database_error', detail: error.message };
    return { success: true, firebase_configured: isConfigured(), running, ...data };
  }
}

export const storageCleanupService = new StorageCleanupService();

/**
 * Started once from index.ts after the server is listening. Safe to call when
 * Firebase is not configured — the sweep skips and says so rather than
 * throwing on every tick.
 */
export function startStorageCleanupTimer(): void {
  if (timer) return;
  const tick = () => {
    storageCleanupService.runSweep().catch(error => {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_cleanup', action: 'tick' },
      });
    });
  };
  setTimeout(tick, FIRST_TICK_MS);
  timer = setInterval(tick, TICK_MS);
  // Never hold the process open for a sweep.
  if (typeof timer.unref === 'function') timer.unref();
}

export default storageCleanupService;
