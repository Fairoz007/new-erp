// Documents repository (table `documents` + objects in bucket `documents`, entity folder `documents`).
// Conventions: docs/audit/CONTRACTS.md. Every function is async and throws ServiceError.
import { ServiceError, supabase, unwrap, unwrapOne, nul, ymd } from './core';
import type { CollectionKey, Fetchers } from './core';
import type { DocumentCategory, DocumentItem } from '../types/operations';
import {
  createSignedUrl, downloadFile, formatFileSize, parseStorageRef, removeFiles, toStorageRef, uploadFile,
} from './storage';

const SELECT = '*, vehicle:vehicles(plate_number), uploader:profiles!documents_uploaded_by_fkey(name)';
const EXPIRY_WARNING_DAYS = 30;

type DocRow = {
  id: string; company_id: string; document_name: string; document_number: string | null; category: string;
  vehicle_id: string | null; issue_date: string | null; expiry_date: string | null; storage_path: string | null;
  file_size: number | null; mime_type: string | null; uploaded_by: string | null; uploaded_at: string;
  notes: string | null; vehicle?: { plate_number: string } | null; uploader?: { name: string } | null;
};

const expiryFlags = (expiry: string | null): { isExpired: boolean; isExpiringSoon: boolean } => {
  if (!expiry) return { isExpired: false, isExpiringSoon: false };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((new Date(expiry + 'T00:00:00').getTime() - today.getTime()) / 86_400_000);
  return { isExpired: days < 0, isExpiringSoon: days >= 0 && days <= EXPIRY_WARNING_DAYS };
};

/**
 * Row -> DocumentItem. `documentUrl` holds a storage reference ("storage://documents/<path>"), NOT a
 * browsable URL: pass it to getDocumentUrl() / openBillModal() which turn it into a signed URL.
 */
export const rowToDocument = (r: DocRow): DocumentItem => ({
  id: r.id,
  documentName: r.document_name,
  documentNumber: r.document_number ?? undefined,
  category: r.category as DocumentCategory,
  vehicleId: r.vehicle_id ?? undefined,
  vehiclePlate: r.vehicle?.plate_number ?? undefined,
  companyId: r.company_id,
  issueDate: r.issue_date ? ymd(r.issue_date) : undefined,
  expiryDate: r.expiry_date ? ymd(r.expiry_date) : undefined,
  fileSize: r.file_size != null ? formatFileSize(Number(r.file_size)) : undefined,
  fileType: r.mime_type ?? undefined,
  documentUrl: r.storage_path ? toStorageRef('documents', r.storage_path) : undefined,
  uploadedBy: r.uploader?.name ?? r.uploaded_by ?? undefined,
  uploadedAt: r.uploaded_at,
  notes: r.notes ?? undefined,
  ...expiryFlags(r.expiry_date),
});

export const fetchers: Fetchers = {
  documents: async () => {
    const rows = await unwrap(
      supabase.from('documents').select(SELECT).order('uploaded_at', { ascending: false }) as any,
    );
    return (rows as DocRow[]).map(rowToDocument);
  },
};

export const affects: Record<string, CollectionKey[]> = {
  addDocument: ['documents'],
  deleteDocument: ['documents'],
};

/** What the UI supplies. The file is uploaded to Storage; size/type/path are derived from it. */
export type NewDocumentInput = Omit<
  DocumentItem,
  'id' | 'uploadedAt' | 'uploadedBy' | 'vehiclePlate' | 'fileSize' | 'fileType' | 'url' | 'documentUrl' | 'isExpired' | 'isExpiringSoon'
> & { file: File };

/**
 * Upload first -> insert row -> if the insert fails, remove the uploaded object (no orphan file).
 * Replaces FleetContext.addDocument(doc: Omit<DocumentItem,'id'|'uploadedAt'>): DocumentItem.
 */
export async function addDocument(doc: NewDocumentInput): Promise<DocumentItem> {
  const { file } = doc;
  if (!doc.companyId) throw new ServiceError('Select a company for this document.');
  if (!doc.documentName?.trim()) throw new ServiceError('Document name is required.');
  if (doc.issueDate && doc.expiryDate && doc.expiryDate < doc.issueDate) {
    throw new ServiceError('Expiry date cannot be before the issue date.');
  }

  const stored = await uploadFile(file, doc.companyId, 'documents'); // validates type + size + magic bytes

  try {
    const row = await unwrapOne(
      supabase.from('documents').insert({
        company_id: doc.companyId,
        document_name: doc.documentName.trim(),
        document_number: nul(doc.documentNumber?.trim()),
        category: doc.category,
        vehicle_id: nul(doc.vehicleId),
        issue_date: nul(doc.issueDate),
        expiry_date: nul(doc.expiryDate),
        notes: nul(doc.notes?.trim()),
        storage_path: stored.path,
        file_size: stored.size,
        mime_type: stored.mimeType,
      }).select(SELECT).single() as any,
    );
    return rowToDocument(row as DocRow);
  } catch (e) {
    // Compensate: the metadata row was not created, so the object must not stay behind.
    try { await removeFiles('documents', [stored.path]); }
    catch (cleanupErr) {
      console.error('[documents] orphaned object after failed insert (see storage_orphans()):', stored.path, cleanupErr);
    }
    throw e;
  }
}

export interface DeleteDocumentResult {
  /** true when the row was deleted but the file could not be removed (reported by storage_orphans()). */
  fileCleanupFailed: boolean;
}

/**
 * Delete the metadata row first, then the object. If the object removal fails the row stays deleted
 * (never resurrected): the failure is logged and returned so the UI can warn, and storage_orphans()
 * lists the leftover file for an admin.
 */
export async function deleteDocument(id: string): Promise<DeleteDocumentResult> {
  const row = await unwrap(supabase.from('documents').select('id, storage_path').eq('id', id).maybeSingle() as any) as
    { id: string; storage_path: string | null } | null;
  if (!row) throw new ServiceError('Document not found or you do not have access to it.');

  // .select() so an RLS-filtered delete (0 rows) is detected instead of looking like success
  const deleted = await unwrap(supabase.from('documents').delete().eq('id', id).select('id') as any) as { id: string }[];
  if (!deleted.length) throw new ServiceError('Permission denied: you cannot delete this document.');

  if (!row.storage_path) return { fileCleanupFailed: false };
  try {
    await removeFiles('documents', [row.storage_path]);
    return { fileCleanupFailed: false };
  } catch (e) {
    console.error('[documents] row deleted but file removal failed:', row.storage_path, e);
    return { fileCleanupFailed: true };
  }
}

const MIME_EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };
// Titles are free text ("Mulkiya 2026"); make sure the saved file gets a usable extension.
export const downloadName = (doc: Pick<DocumentItem, 'documentName' | 'fileType'>): string => {
  const ext = doc.fileType ? MIME_EXT[doc.fileType] : undefined;
  const lower = doc.documentName.toLowerCase();
  return ext && !lower.endsWith('.' + ext) && !lower.endsWith('.jpeg') ? `${doc.documentName}.${ext}` : doc.documentName;
};

/** Signed URL (60 s by default) for viewing; pass { download: true } for Content-Disposition: attachment. */
export async function getDocumentUrl(
  doc: Pick<DocumentItem, 'documentUrl' | 'documentName' | 'fileType'>,
  opts: { download?: boolean; expiresIn?: number } = {},
): Promise<string> {
  const ref = parseStorageRef(doc.documentUrl);
  if (!ref) throw new ServiceError(`"${doc.documentName}" has no stored file.`);
  return createSignedUrl(ref.bucket, ref.path, {
    expiresIn: opts.expiresIn,
    download: opts.download ? downloadName(doc) : undefined,
  });
}

/** Download the real file (browser save dialog / Downloads folder). */
export async function downloadDocument(doc: Pick<DocumentItem, 'documentUrl' | 'documentName' | 'fileType'>): Promise<void> {
  const ref = parseStorageRef(doc.documentUrl);
  if (!ref) throw new ServiceError(`"${doc.documentName}" has no stored file.`);
  await downloadFile(ref.bucket, ref.path, downloadName(doc));
}
