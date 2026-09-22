// src/utils/firebaseStorageAdmin.ts
// ============================================================================
// Firebase Admin SDK — the ONLY way bytes reach or leave storage.
// ============================================================================
// Firebase is a dumb blob store. Security rules deny all direct client access,
// so every operation is brokered here with the Admin SDK and a short-TTL signed
// URL. The permission rule itself lives in Postgres beside the contract that
// defines it (contract_membership, migration evidence-storage/001) — this file
// only mints URLs for decisions already taken.
//
// Replaces the pattern this codebase used everywhere else: the Firebase CLIENT
// SDK with signInAnonymously(), plus getDownloadURL() whose token was written
// into the database. A stored download URL hard-codes the host into the row,
// cannot be re-signed per viewer, and cannot be revoked — three reasons the
// redesign forbids it.
//
// Credentials are the service account already used by firebaseController:
//   VITE_FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
//   VITE_FIREBASE_STORAGE_BUCKET

import * as admin from 'firebase-admin';
import { captureException } from './sentry';

// Signed URLs are minutes, not hours, and are never persisted anywhere.
export const UPLOAD_URL_TTL_MS = 10 * 60 * 1000;   // 10 minutes to finish an upload
export const READ_URL_TTL_MS   = 5 * 60 * 1000;    // 5 minutes to fetch a file

const APP_NAME = 'evidence-storage';

let app: admin.app.App | null = null;

/**
 * Its own named app instance so it cannot collide with the default app that
 * firebaseController initialises for diagnostics.
 */
function getApp(): admin.app.App {
  if (app) return app;

  const projectId   = process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const bucket      = process.env.VITE_FIREBASE_STORAGE_BUCKET;

  const missing = [
    !projectId   && 'VITE_FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKey  && 'FIREBASE_PRIVATE_KEY',
    !bucket      && 'VITE_FIREBASE_STORAGE_BUCKET'
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Evidence storage is not configured: missing ${missing.join(', ')}`);
  }

  const existing = admin.apps.find(a => a?.name === APP_NAME);
  app = existing
    ? (existing as admin.app.App)
    : admin.initializeApp(
        {
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
          storageBucket: bucket
        },
        APP_NAME
      );

  return app;
}

function file(objectPath: string) {
  return getApp().storage().bucket().file(objectPath);
}

/**
 * A short-lived URL the client PUTs the bytes to directly. The content type is
 * bound into the signature, so a client cannot upload something other than what
 * the slot was granted for.
 */
export async function signUploadUrl(objectPath: string, mimeType: string): Promise<string> {
  const [url] = await file(objectPath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + UPLOAD_URL_TTL_MS,
    contentType: mimeType
  });
  return url;
}

/** A short-lived read URL. Never stored — minted fresh for each viewer, each time. */
export async function signReadUrl(objectPath: string, fileName?: string): Promise<string> {
  const [url] = await file(objectPath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + READ_URL_TTL_MS,
    ...(fileName
      ? { responseDisposition: `inline; filename="${fileName.replace(/"/g, '')}"` }
      : {})
  });
  return url;
}

/**
 * Saves a buffer straight to storage with the Admin SDK.
 *
 * For uploads that already reached our server as multipart (the tenant logo and
 * the integration QR): there is no point handing the client a signed URL for
 * bytes we are holding. Same bucket, same paths, same registry — only the
 * transport differs.
 */
export async function saveBuffer(
  objectPath: string,
  buffer: Buffer,
  mimeType: string,
  metadata?: Record<string, string>
): Promise<number> {
  await file(objectPath).save(buffer, {
    contentType: mimeType,
    resumable: false,
    metadata: { contentType: mimeType, ...(metadata ? { metadata } : {}) }
  });
  return buffer.length;
}

/**
 * A DURABLE public URL for an identity asset.
 *
 * Contract evidence is deny-all + signed per viewer. Identity assets are not:
 * a tenant's logo is already on every invoice and on the public contract-review
 * page, and a payment QR is printed and stuck on a desk. They are public by
 * nature, they must survive in an emailed PDF long after any signature would
 * expire, and 85 call sites across the product store exactly this shape today.
 *
 * So `tenants/**` is public-read in the storage rules and this returns the
 * plain media URL. Nothing else in the bucket is readable without a signature.
 * Note this is rules-based rather than per-object ACLs, which uniform
 * bucket-level access would refuse.
 */
export function publicUrl(objectPath: string): string {
  const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET || '';
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

/**
 * The true size of what Firebase actually holds. The size a client declares at
 * slot request is a claim; this is the fact that gets metered.
 */
export async function statObject(
  objectPath: string
): Promise<{ exists: boolean; sizeBytes: number; md5?: string; contentType?: string }> {
  const f = file(objectPath);
  const [exists] = await f.exists();
  if (!exists) return { exists: false, sizeBytes: 0 };

  const [meta] = await f.getMetadata();
  return {
    exists: true,
    sizeBytes: Number(meta.size ?? 0),
    md5: typeof meta.md5Hash === 'string' ? meta.md5Hash : undefined,
    contentType: typeof meta.contentType === 'string' ? meta.contentType : undefined
  };
}

/**
 * Deletes one object. Only the StorageCleanup sweeper should call this — a
 * Firebase delete cannot participate in a Postgres transaction, so rows are
 * marked 'deleted' first and the bytes are reclaimed afterwards.
 * Missing is success: the goal is absence, not the act.
 */
export async function deleteObject(objectPath: string): Promise<boolean> {
  try {
    await file(objectPath).delete({ ignoreNotFound: true });
    return true;
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'evidence_storage', action: 'deleteObject' },
      extra: { objectPath }
    });
    return false;
  }
}

export interface StoredObject {
  path: string;
  sizeBytes: number;
  updated: string | null;
  contentType: string | null;
}

export interface PrefixListing {
  prefix: string;
  objects: StoredObject[];
  count: number;
  bytes: number;
  truncated: boolean;
}

/**
 * Everything under a prefix. GCS has no real folders — a "folder" is just a
 * shared path prefix — so this is the only way to know what a legacy tenant
 * folder actually contains.
 *
 * `limit` caps what is RETURNED, not what is counted: the listing walks every
 * page so count and bytes are the true totals even when only the first slice
 * is handed back. An admin screen that under-reported the size of what a
 * delete button is about to remove would be worse than useless.
 */
export async function listObjects(prefix: string, limit = 200): Promise<PrefixListing> {
  const bucket = getApp().storage().bucket();
  const objects: StoredObject[] = [];
  let count = 0;
  let bytes = 0;
  let pageToken: string | undefined;

  do {
    const [files, nextQuery]: any = await bucket.getFiles({
      prefix,
      maxResults: 1000,
      autoPaginate: false,
      pageToken
    });
    for (const f of files) {
      const size = Number(f.metadata?.size ?? 0);
      count += 1;
      bytes += Number.isFinite(size) ? size : 0;
      if (objects.length < limit) {
        objects.push({
          path: f.name,
          sizeBytes: Number.isFinite(size) ? size : 0,
          updated: f.metadata?.updated ?? null,
          contentType: f.metadata?.contentType ?? null
        });
      }
    }
    pageToken = nextQuery?.pageToken;
  } while (pageToken);

  return { prefix, objects, count, bytes, truncated: count > objects.length };
}

/** Top-level prefixes actually present in the bucket, with their totals. */
export async function listTopLevelPrefixes(): Promise<Array<{ prefix: string; count: number; bytes: number }>> {
  const bucket = getApp().storage().bucket();
  const totals = new Map<string, { count: number; bytes: number }>();
  let pageToken: string | undefined;

  do {
    const [files, nextQuery]: any = await bucket.getFiles({
      maxResults: 1000,
      autoPaginate: false,
      pageToken
    });
    for (const f of files) {
      // Objects sitting at the bucket root have no prefix of their own.
      const top = f.name.includes('/') ? f.name.slice(0, f.name.indexOf('/')) : '(root)';
      const size = Number(f.metadata?.size ?? 0);
      const entry = totals.get(top) ?? { count: 0, bytes: 0 };
      entry.count += 1;
      entry.bytes += Number.isFinite(size) ? size : 0;
      totals.set(top, entry);
    }
    pageToken = nextQuery?.pageToken;
  } while (pageToken);

  return [...totals.entries()]
    .map(([prefix, v]) => ({ prefix, ...v }))
    .sort((a, b) => b.bytes - a.bytes);
}

/**
 * Delete everything under a prefix.
 *
 * Deliberately NOT a bucket.deleteFiles({ prefix }) one-liner: that reports
 * nothing useful about what it removed, and this backs a button whose whole
 * job is to say exactly what it did. Each object is deleted individually and
 * counted, and a failure on one does not abandon the rest.
 *
 * This is the one operation here that destroys data a tenant uploaded, so the
 * CALLER is responsible for refusing prefixes that must never be swept
 * (contracts/, tenants/) — see storageAdminService.
 */
export async function deletePrefix(prefix: string): Promise<{ deleted: number; failed: number; bytes: number }> {
  const bucket = getApp().storage().bucket();
  let deleted = 0;
  let failed = 0;
  let bytes = 0;
  let pageToken: string | undefined;

  do {
    const [files, nextQuery]: any = await bucket.getFiles({
      prefix,
      maxResults: 1000,
      autoPaginate: false,
      pageToken
    });
    for (const f of files) {
      const size = Number(f.metadata?.size ?? 0);
      try {
        await f.delete({ ignoreNotFound: true });
        deleted += 1;
        bytes += Number.isFinite(size) ? size : 0;
      } catch (error) {
        failed += 1;
        captureException(error instanceof Error ? error : new Error(String(error)), {
          tags: { source: 'evidence_storage', action: 'deletePrefix' },
          extra: { objectPath: f.name }
        });
      }
    }
    pageToken = nextQuery?.pageToken;
  } while (pageToken);

  return { deleted, failed, bytes };
}

/** Surfaced by the health endpoint so a misconfiguration is visible before an upload fails. */
export function isConfigured(): boolean {
  try {
    getApp();
    return true;
  } catch {
    return false;
  }
}
