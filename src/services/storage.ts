// Generic Supabase Storage helpers. All failures throw ServiceError (see core.ts).
//
// Buckets (see supabase/migrations/20261025000200_erp_rls.sql + 20261026000500_storage.sql):
//   documents  private, 10 MB, pdf/png/jpeg   - compliance docs and record attachments
//   media      private,  5 MB, png/jpeg/webp  - vehicle photos, company logos, user avatars
// Both are private: files are only ever reached through short-lived signed URLs.
//
// Object path convention (RLS depends on it):  <company_id>/<entity>/<uuid>-<sanitized file name>
//   documents bucket entities: documents | expenses | invoices | payments | maintenance | accidents | journal
//   media bucket entities:     vehicles | logos | avatars/<user_id>
import { ServiceError, supabase } from './core';

export type BucketId = 'documents' | 'media';

export type DocumentEntity = 'documents' | 'expenses' | 'invoices' | 'payments' | 'maintenance' | 'accidents' | 'journal';
export type MediaEntity = 'vehicles' | 'logos' | 'avatars';
export type StorageEntity = DocumentEntity | MediaEntity;

interface BucketConfig {
  id: BucketId;
  maxBytes: number;
  mimeTypes: readonly string[];
  entities: readonly StorageEntity[];
  label: string;
}

// Must mirror the storage.buckets rows in the migrations.
export const BUCKETS: Record<BucketId, BucketConfig> = {
  documents: {
    id: 'documents',
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
    entities: ['documents', 'expenses', 'invoices', 'payments', 'maintenance', 'accidents', 'journal'],
    label: 'PDF, PNG or JPEG',
  },
  media: {
    id: 'media',
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    entities: ['vehicles', 'logos', 'avatars'],
    label: 'PNG, JPEG or WebP',
  },
};

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};

export const DEFAULT_SIGNED_URL_TTL = 60; // seconds

export const formatFileSize = (bytes: number | null | undefined): string => {
  if (bytes == null || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// The browser may report '' for a file type (e.g. some Windows setups); fall back to the extension.
export const resolveMimeType = (file: Pick<File, 'name' | 'type'>): string => {
  if (file.type) return file.type.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? '';
};

// Storage keys: ASCII letters/digits, dot, dash, underscore only. No path separators, no leading dots.
export const sanitizeFileName = (name: string): string => {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot + 1) : '';
  const clean = (s: string) => s.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '').replace(/_+/g, '_');
  const s = clean(stem).slice(0, 80) || 'file';
  const e = clean(ext).toLowerCase().slice(0, 8);
  return e ? `${s}.${e}` : s;
};

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Check type and size against the bucket config. Throws ServiceError with a user-readable message. */
export function validateFile(file: File, bucket: BucketId = 'documents'): void {
  const cfg = BUCKETS[bucket];
  if (!file || !(file instanceof Blob)) throw new ServiceError('No file selected.');
  if (file.size === 0) throw new ServiceError(`"${file.name}" is empty.`);
  if (file.size > cfg.maxBytes) {
    throw new ServiceError(`"${file.name}" is ${formatFileSize(file.size)}; the limit is ${formatFileSize(cfg.maxBytes)}.`);
  }
  const mime = resolveMimeType(file);
  if (!cfg.mimeTypes.includes(mime)) {
    throw new ServiceError(`"${file.name}" is not an allowed file type. Allowed: ${cfg.label}.`);
  }
}

// Extra defence: the declared type is client-controlled, so compare it with the file's magic bytes.
async function sniffMatches(file: File, mime: string): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const startsWith = (...b: number[]) => b.every((v, i) => head[i] === v);
  switch (mime) {
    case 'application/pdf': return startsWith(0x25, 0x50, 0x44, 0x46); // %PDF
    case 'image/png': return startsWith(0x89, 0x50, 0x4e, 0x47);
    case 'image/jpeg': return startsWith(0xff, 0xd8, 0xff);
    case 'image/webp': return startsWith(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    default: return false;
  }
}

/** `<company_id>/<entity>/<uuid>-<sanitized name>`; for avatars pass subFolder = user id. */
export function buildStoragePath(
  companyId: string,
  entity: StorageEntity,
  fileName: string,
  subFolder?: string,
): string {
  if (!UUID_RE.test(companyId)) throw new ServiceError('A valid company is required to store a file.');
  if (subFolder && !UUID_RE.test(subFolder)) throw new ServiceError('Invalid storage folder.');
  const parts = [companyId, entity, ...(subFolder ? [subFolder] : []), `${uuid()}-${sanitizeFileName(fileName)}`];
  return parts.join('/');
}

export interface StoredFile {
  bucket: BucketId;
  path: string;
  name: string;     // original file name
  size: number;     // bytes
  mimeType: string;
}

export interface UploadOptions {
  bucket?: BucketId;     // default 'documents'
  subFolder?: string;    // avatars: the user id
}

/**
 * Validate and upload. Never overwrites (unique path per upload; no upsert, there is no UPDATE policy).
 * Returns the object path to save in the owning row (e.g. expenses.attachment_path).
 * If the follow-up row write fails, the caller must call removeFiles(bucket, [path]).
 */
export async function uploadFile(
  file: File,
  companyId: string,
  entity: StorageEntity,
  opts: UploadOptions = {},
): Promise<StoredFile> {
  const bucket = opts.bucket ?? (BUCKETS.documents.entities.includes(entity) ? 'documents' : 'media');
  if (!BUCKETS[bucket].entities.includes(entity)) {
    throw new ServiceError(`"${entity}" files cannot be stored in the ${bucket} bucket.`);
  }
  validateFile(file, bucket);
  const mimeType = resolveMimeType(file);
  if (!(await sniffMatches(file, mimeType))) {
    throw new ServiceError(`"${file.name}" does not look like a valid ${mimeType} file.`);
  }
  const path = buildStoragePath(companyId, entity, file.name, opts.subFolder);
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: mimeType,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw toStorageError(error, 'upload');
  return { bucket, path, name: file.name, size: file.size, mimeType };
}

export interface SignedUrlOptions {
  expiresIn?: number;                 // seconds, default 60
  download?: string | boolean;        // true = keep stored name, string = suggested file name
}

/** Short-lived URL for viewing (img/iframe) or, with `download`, forcing a file download. */
export async function createSignedUrl(bucket: BucketId, path: string, opts: SignedUrlOptions = {}): Promise<string> {
  if (!path) throw new ServiceError('This record has no stored file.');
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, opts.expiresIn ?? DEFAULT_SIGNED_URL_TTL, {
    download: opts.download,
  });
  if (error || !data?.signedUrl) throw toStorageError(error ?? { message: 'Could not create a link to the file.' }, 'sign');
  return data.signedUrl;
}

/** Batch variant (list thumbnails). Missing or inaccessible objects map to null instead of failing the batch. */
export async function createSignedUrls(
  bucket: BucketId,
  paths: string[],
  expiresIn = 300,
): Promise<Record<string, string | null>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresIn);
  if (error) throw toStorageError(error, 'sign');
  const out: Record<string, string | null> = {};
  for (const item of data ?? []) if (item.path) out[item.path] = item.error ? null : item.signedUrl;
  return out;
}

/** Remove objects. Missing objects are not an error (idempotent). */
export async function removeFiles(bucket: BucketId, paths: string[]): Promise<void> {
  const list = paths.filter(Boolean);
  if (list.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove(list);
  if (error) throw toStorageError(error, 'remove');
}

/** Download through a signed URL with Content-Disposition: attachment (a real file, not a new tab). */
export async function downloadFile(bucket: BucketId, path: string, fileName?: string): Promise<void> {
  const url = await createSignedUrl(bucket, path, { download: fileName || true, expiresIn: 60 });
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---- "storage://<bucket>/<path>" references -------------------------------------------------
// UIContext.openBillModal(url, ...) only carries a string. Pass a storage reference instead of a URL
// and DocumentViewerModal resolves it to a signed URL when opened.
export const toStorageRef = (bucket: BucketId, path: string): string => `storage://${bucket}/${path}`;

export function parseStorageRef(ref: string | undefined | null): { bucket: BucketId; path: string } | null {
  if (!ref || !ref.startsWith('storage://')) return null;
  const rest = ref.slice('storage://'.length);
  const slash = rest.indexOf('/');
  if (slash < 1) return null;
  const bucket = rest.slice(0, slash);
  if (bucket !== 'documents' && bucket !== 'media') return null;
  return { bucket, path: rest.slice(slash + 1) };
}

function toStorageError(err: { message: string; statusCode?: string | number; status?: number }, op: 'upload' | 'sign' | 'remove'): ServiceError {
  const status = Number((err as any).statusCode ?? (err as any).status ?? 0);
  const msg = err.message || '';
  let message: string;
  if (status === 403 || /row-level security|not authorized|unauthorized|permission/i.test(msg)) {
    message = op === 'upload' ? 'You do not have permission to upload this file.'
      : op === 'remove' ? 'You do not have permission to delete this file.'
      : 'You do not have permission to open this file.';
  } else if (status === 413 || /payload too large|exceeded the maximum/i.test(msg)) {
    message = 'The file is larger than the allowed size.';
  } else if (/mime type|not supported/i.test(msg)) {
    message = 'This file type is not allowed.';
  } else if (status === 404 || /not found|does not exist/i.test(msg)) {
    message = 'The stored file could not be found. It may have been removed.';
  } else if (/duplicate|already exists/i.test(msg)) {
    message = 'A file with this name already exists. Please retry.';
  } else {
    message = op === 'upload' ? `Upload failed: ${msg}` : op === 'remove' ? `Could not delete the file: ${msg}` : `Could not open the file: ${msg}`;
  }
  return new ServiceError(message, { code: status ? String(status) : undefined, details: msg });
}
