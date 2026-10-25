# Agent F - Storage & File Management

Files: `src/services/storage.ts`, `src/services/documents.ts`, `src/pages/documents/DocumentsPage.tsx`,
`src/components/common/DocumentUploadZone.tsx`, `src/components/common/DocumentViewerModal.tsx`,
`supabase/migrations/20261026000500_storage.sql`, `supabase/tests/20261026000500_storage.test.mjs`.
Nothing written to the remote DB. `schema.test.mjs` still 26/26; my test 29/29.

## 1. Storage configuration

| | `documents` (exists, 000200) | `media` (new, 000500) |
|---|---|---|
| Visibility | private | private |
| MIME | application/pdf, image/png, image/jpeg | image/png, image/jpeg, image/webp |
| Size limit | 10 MB | 5 MB |
| Holds | compliance docs + attachments of expenses, invoices, payments, maintenance, accidents, journal entries | vehicle photos, company logos, user avatars |
| Path | `<company_id>/<entity>/<uuid>-<sanitized name>` entity = documents, expenses, invoices, payments, maintenance, accidents, journal | `<company_id>/vehicles/...`, `<company_id>/logos/...`, `<company_id>/avatars/<user_id>/...` |
| Read | company access + `has_perm(<entity module>,'view')` | company access (any member) |
| Insert | company access + `create` (or `edit`, except entity `documents`) on the entity's module | vehicles -> `vehicles:edit`; logos -> `companies:edit`; avatars -> own folder only |
| Delete | company access + `delete` (or `edit`, except entity `documents`) | same rule as insert |
| UPDATE | none (deliberate) | none |

Entity -> module map: documents->documents, expenses->expenses, invoices->invoices, payments->payments, maintenance->maintenance, accidents->accidents, journal->accounting. Unknown entity folder or a path without an entity folder is denied.

Why the policy change (P1 found): the 000200 policies required `documents:create` for every object. By the permission seed an Accountant has only `documents:view`, a Maintenance Manager the same, so they could not attach a bill to an invoice or maintenance record. The migration replaces the three `documents_*` policies (policies only, no data) with entity-aware ones. Verified in tests: Accountant can attach to `invoices/`, cannot upload to `documents/`; Fleet Manager cannot touch `invoices/`; Viewer reads only what its role can view.

Why a `media` bucket (and only that one): vehicle photos, logos and avatars are images shown in lists, need WebP, a smaller limit and a different permission model (any company member may see a vehicle photo; editing needs `vehicles:edit`), and shouldn't need the `documents` module. I kept it private (tenant data) and use signed URLs (`createSignedUrls` batches a list in one call) rather than a public bucket. No other buckets: CSV / print / JSON-backup exports are generated in the browser and never persisted.

Metadata <-> object: `documents.storage_path` (+`file_size`, `mime_type`); `expenses/invoices/payments/journal_entries.attachment_path`; `maintenance_records/accidents.attachments` jsonb `[{name,type,storage_path}]`; `vehicles.photo_url`, `companies.logo`, `profiles.avatar` hold a media-bucket **path** (not a URL).

Integrity added in 000500: CHECK (NOT VALID, so legacy rows are not rescanned) that `storage_path` / `attachment_path` begins with the row's own `company_id/` on documents, expenses, invoices, payments, journal_entries; UNIQUE index on `documents.storage_path` (two rows can never share an object, so deleting one can't strand another).

Cleanup behaviour
- Add: upload -> insert row -> if insert fails, remove the object (failure of the removal is logged with the path).
- Delete: delete row -> remove object. If removal fails the row stays deleted, error is logged, and `deleteDocument` returns `{ fileCleanupFailed: true }` (page shows a warning toast).
- Leftovers (crash between upload and insert, failed cleanup): `select * from storage_orphans('documents' | 'media')` (needs `settings:edit`; lists objects no row references; remove with `storage.remove`). We do not delete `storage.objects` rows via SQL (it would not delete the file in Supabase).
- Replace = upload new path, update row, then remove old object. Never upsert, hence no UPDATE policy.

Client-side checks (before the request, mirror the bucket config): size, MIME allow-list (falls back to extension when the browser reports no type), empty file, and a magic-byte sniff (%PDF / PNG / JPEG / WebP) so a renamed file is rejected. Bucket limits remain the server-side enforcement.

## 2. File-workflow inventory

| # | Workflow | Today | Should be | Status |
|---|---|---|---|---|
| 1 | Upload document (`QuickActionModals.handleUploadDocument`) | No file input at all; saves hard-coded unsplash URL as `documentUrl` | Real file -> `documents` bucket + row | Rebuilt as `UploadDocumentForm`; **coordinator must wire it (section 4)** |
| 2 | DocumentsPage "Download" | `window.open(fakeUrl)` | Signed URL, real download | Fixed (View + Download via signed URL) |
| 3 | DocumentsPage delete | confirm + local state removal | permission check, confirm, row + object removal | Fixed |
| 4 | DocumentUploadZone | `URL.createObjectURL` kept in state (lost on reload); no validation; 3 fake "sample bills" with simulated OCR (fabricated amounts, unsplash URLs) | Validate, keep real `File`, upload at submit | Fixed; samples/OCR removed (prop `onOcrExtract` kept but never called, deprecated) |
| 5 | Expense receipt (QuickActionModals 1145, ExpensesPage 82-127) | blob URL stored as `attachmentUrl`; page falls back to a fake unsplash receipt for Fuel/Insurance/Registration | upload to `documents/expenses`, store `attachment_path`, view via signed URL; no fabricated receipt | **Open: Agent A + coordinator** |
| 6 | Invoice bill scan (QuickActionModals 1247, InvoicesPage 80-143) | same; fake fallback scan for every Purchase invoice | `documents/invoices` | **Open: Agent B + coordinator** |
| 7 | DocumentViewerModal | `<img>` only; PDFs never rendered; fake "Verified / Cryptographically sealed" panel with random SHA digest; `window.print()` printed the whole app; blob URLs showed placeholder | Render real file (img/iframe), signed URL, download, open in new tab | Fixed |
| 8 | Vehicle photo (`vehicles.photo_url`, QuickActionModals 73, VehiclesPage, VehicleDetailPage, Dashboard, GlobalSearch) | hard-coded unsplash URL, no upload control | `media/vehicles`; store path; show via `createSignedUrls` | **Open: Agent A (vehicle form/pages), helpers ready** |
| 9 | User avatar (Header, Sidebar, UsersRolesPage) | URL string, no upload | `media/avatars/<uid>`; or initials | **Open: Agent G** (bucket + policy ready) |
| 10 | Company logo | column exists, no UI | `media/logos` when a settings UI is added | Not used today |
| 11 | maintenance/accident `attachments` jsonb | typed, no UI | `documents/maintenance|accidents`, `{name,type,storage_path}` | No UI exists; helpers ready |
| 12 | payments / journal `attachment_path` | no UI | `documents/payments|journal` | No UI exists |
| 13 | CSV exports (DataTable, GL, Trial Balance), `window.print()` reports/invoice/payslip | client-generated | none | OK, no storage |
| 14 | FleetContext "backup JSON" download (`FleetContext` ~2185) and import | dumps/restores localStorage state incl. any data-URL files | obsolete with Supabase; restore would bypass RLS | **Coordinator: remove or replace** |

## 3. Issues

| Sev | Issue | Status |
|---|---|---|
| P0 | Uploads never reached a server: documents carried a hard-coded image URL; attachments were blob URLs (die on reload) | Fixed for documents; expenses/invoices open (5, 6) |
| P1 | Storage policies demanded `documents:create` for every attachment, blocking Accountant/Maintenance roles | Fixed in 000500 |
| P1 | Fabricated content: sample scanned bills + simulated OCR amounts, fake "verified/sealed/SHA256" panel, fake receipt fallbacks in ExpensesPage/InvoicesPage | Removed in my files; page fallbacks open (A/B) |
| P1 | Delete had no permission gate beyond route access; no real deletion of file | Fixed (`hasPermission('delete','documents')` + RLS) |
| P2 | No file validation (type/size) anywhere | Fixed (client + bucket) |
| P2 | Row could point at another tenant's object path; two rows could share an object | Fixed (CHECK + UNIQUE) |
| P2 | Possible orphans after partial failure | Compensating cleanup + `storage_orphans()` |
| P3 | `window.print()` in viewer printed the app shell | Replaced by "Open in new tab" |
| P3 | Download filename lacked extension for free-text titles | `downloadName()` appends it |
| P3 | Viewer cannot print PDFs inline (cross-origin) | accepted, use new tab |
| Note | `documents_read` for Viewer etc. follows the seeded matrix; Viewer cannot open `invoices/` attachments because the role has no invoices page access | by design |
| Note | Signed URLs are bearer links valid for 60 s (download/new tab) or 300 s (viewer); do not persist them in state/DB | by design |

## 4. Integration

### Storage API (`src/services/storage.ts`, all throw `ServiceError`)
```ts
BUCKETS                       // limits + MIME, mirrors DB
validateFile(file, bucket='documents'): void
sanitizeFileName(name): string
buildStoragePath(companyId, entity, fileName, subFolder?): string   // <company>/<entity>/<uuid>-<name>
uploadFile(file, companyId, entity, { bucket?, subFolder? }): Promise<StoredFile>  // {bucket,path,name,size,mimeType}
createSignedUrl(bucket, path, { expiresIn=60, download?: true|filename }): Promise<string>
createSignedUrls(bucket, paths, expiresIn=300): Promise<Record<path, url|null>>  // lists / thumbnails
removeFiles(bucket, paths): Promise<void>            // idempotent
downloadFile(bucket, path, fileName?): Promise<void> // real browser download
toStorageRef(bucket, path): string                   // "storage://documents/<path>"
parseStorageRef(ref): {bucket,path} | null
formatFileSize(bytes), resolveMimeType(file)
```
Entities: `documents|expenses|invoices|payments|maintenance|accidents|journal` (bucket documents), `vehicles|logos|avatars` (bucket media; avatars need `subFolder = user id`).

**Attachment pattern for A/B/C (create/edit of a record with a file):**
1. Form: `<DocumentUploadZone value={meta} onChange={setMeta} />`. `meta.file` is the real `File` (already validated).
2. Submit (async, button disabled while pending): `const stored = await uploadFile(meta.file, companyId, 'expenses')`, then insert the row with `attachment_path: stored.path` (jsonb entities: `[{name, type: stored.mimeType, storage_path: stored.path}]`). If the insert throws: `await removeFiles('documents', [stored.path]).catch(console.error)` and rethrow.
3. Replacing: upload new, update row, then remove the old path (best effort). Deleting the record: delete row, then `removeFiles` (log on failure).
4. Viewing: `openBillModal(toStorageRef('documents', path), name, mimeType, sizeText)`. `DocumentViewerModal` resolves the signed URL itself. Do not store URLs in state or DB. Map `attachment_path` into the existing `attachmentUrl` field as the storage ref string if the type must stay unchanged (and `attachmentName/Size/Type` from your own columns), and drop the unsplash fallbacks: show "No attachment" when absent.
5. Vehicle photos: store `media` path in `vehicles.photo_url`; in list/detail load `createSignedUrls('media', paths)` once per render batch; show a placeholder when null.

### `src/services/documents.ts`
```ts
fetchers.documents                    // select('*, vehicle:vehicles(plate_number), uploader:profiles!documents_uploaded_by_fkey(name)')
affects = { addDocument: ['documents'], deleteDocument: ['documents'] }
addDocument(doc: NewDocumentInput): Promise<DocumentItem>
   // NewDocumentInput = Omit<DocumentItem,'id'|'uploadedAt'|'uploadedBy'|'vehiclePlate'|'fileSize'|'fileType'|'url'|'documentUrl'|'isExpired'|'isExpiringSoon'> & { file: File }
deleteDocument(id): Promise<{ fileCleanupFailed: boolean }>
getDocumentUrl(doc, { download?, expiresIn? }): Promise<string>   // signed
downloadDocument(doc): Promise<void>
rowToDocument(row), downloadName(doc)
```
Mapping: `DocumentItem.documentUrl` = `storage://documents/<path>` (a reference, not a URL); `fileSize` formatted string; `fileType` = mime; `isExpired/isExpiringSoon` (<= 30 days) computed client-side from `expiry_date`; `uploadedBy` = profile name. `id`, `uploadedAt`, `uploaded_by` are DB-assigned.

### Coordinator tasks
1. **FleetContext**: replace `addDocument`/`deleteDocument` with the service functions. Types: `addDocument: (doc: NewDocumentInput) => Promise<DocumentItem>` and `deleteDocument: (id: string) => Promise<{ fileCleanupFailed: boolean }>` (pass the result through so the page can warn). Import `NewDocumentInput`/`DeleteDocumentResult` from `services/documents`. Load `documents` with `fetchers.documents` and refetch per `affects`.
2. **QuickActionModals.tsx** `upload-document` modal: delete `docForm`, `handleUploadDocument`, and the whole `<form>`; render
   `<UploadDocumentForm defaultVehicleId={defaultVehicle?.id} onDone={closeQuickModal} />` (import from `./DocumentUploadZone`). The form owns file selection, validation errors, async submit with disabled button, success toast only after the await, error toast + inline error on failure. Remove the unsplash `documentUrl` on line ~818 with it.
3. Expense/invoice modals (same file): keep `DocumentUploadZone` but submit `attachment.file` through `uploadFile` as described (pattern above) instead of passing `attachment.url` (a blob URL). Remove the now-dead `onOcrExtract` props (lines ~1150, ~1252: they never fire and the fabricated sample data is gone).
4. Remove the localStorage backup export/import in FleetContext (workflow 14).
5. Push `20261026000500_storage.sql` after E's platform migration (no dependency on it besides tables existing; sorts after 000000-000400).

### Test runner
`supabase/tests/20261026000500_storage.test.mjs` is standalone: it boots its own PGlite with the same `auth`/`storage` stubs (plus `grant select, insert, delete on storage.objects`), loads every `*.sql` in the migrations dir, and runs 29 checks (bucket config, per-entity policies by role and company, media rules incl. avatar folder, path CHECK, UNIQUE, orphans). Run: `node supabase/tests/20261026000500_storage.test.mjs supabase/migrations`. To fold into E's runner, reuse the stub block at its top and `import` the checks. Not added to `npm run test:db` (package.json not mine).

### tsc
`npx tsc --noEmit`: my files clean except the one error caused by the API change:
- `DocumentUploadZone.tsx(238)`: `addDocument({... file})` does not match FleetContext's old `Omit<DocumentItem,'id'|'uploadedAt'>` signature. Disappears once the coordinator applies task 1.
Other errors present (`setCurrentUserId` in Header.tsx / UsersRolesPage.tsx) belong to Agent G's in-progress AuthContext work.

### Not covered / follow-ups
- Nothing in the repo yet creates vehicle/avatar/logo upload UIs; helpers and policies are in place (A, G).
- Large-file chunked upload not needed at 10 MB.
- No antivirus scanning; only type/size/magic-byte checks.
