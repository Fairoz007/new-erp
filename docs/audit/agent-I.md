# Agent I: remote end-to-end suite

Deliverables: `e2e/remote.e2e.mjs`, `e2e/README.md`, npm script `test:e2e`.
**Nothing was run against the remote.** Verified offline only: `node --check`, `--help`, `--dry-run`
with fake env (no network), and the refusal paths (missing env, wrong host, wrong `E2E_CONFIRM` -> exit 2).

## Design
- Env only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_CONFIRM=fpeniljpqigpeqtsgizr`; the host must be `fpeniljpqigpeqtsgizr.supabase.co`. All output is redacted of keys and passwords.
- Setup (service role): offices A/B, 6 users (Super Admin, Company Admin, Fleet Manager A, Accountant A, Viewer A, Fleet Manager B), roles and memberships; each user then signs in with its own client. Also a supplier and a bank account (no client create path exists) and a temporary maintenance approval rule at 7777 OMR (above the Fleet Manager limit of 500).
- Every write is re-read with another client or the service role. "Denied" accepts an error or an RLS-empty result and then proves no change by re-reading.
- Call shapes replicate `src/services`: fleet.ts (addVehicle, addWorkOrder, updateWorkOrderStatus), finance.ts (invoiceToHeader + create_invoice, record_payment, create_credit_note), hr.ts (processPayrollRun), accounting.ts (runDepreciation), system.ts (decideApproval, markRead), storage.ts (upload, createSignedUrl, remove), documents.ts, auth.ts.

## Test inventory (44 tests; list with `--dry-run`)
| Group | Proves |
|---|---|
| Auth (7) | sign-in; profile/role via RLS; matrix readable; Viewer / Fleet Manager / Company Admin cannot self-promote or promote others to Super Admin (G2); Company Admin cannot edit an other-office user (G4); own phone edit works |
| Company bootstrap (3) | Super Admin office insert -> CoA (>=28 accounts, required posting codes) + creator membership (E); Viewer cannot create an office; office B cannot see office A |
| Vehicles (6) | FM create/update persist; VH-001/VH-002 numbering; Viewer denied; cross-office read/write denied both ways |
| Numbering (2) | EXP-YYYY-0001 with DB-computed total (client total ignored); SUP-nnn. WO-, MNT-, PINV-, CN-, EMP-, FA-, DEP-, PR- are asserted inside their flows |
| Work orders (4) | rule -> Pending + approval request; FM/Viewer cannot decide or advance; approver decides; complete_work_order -> exactly one MNT record, second completion rejected; office B blind |
| Invoices / Payments / Credit notes (6) | create_invoice posted with balanced journal; Viewer/office B denied; partial payment -> outstanding 110, over-payment rejected with no change; direct payment insert and FM/Viewer payments denied; credit-note limit and effect; office B sees no finance rows |
| Payroll (2) | EMP numbering, PR-2026-09, balanced journal, duplicate month rejected; FM/Viewer denied, office B blind |
| Depreciation (2) | FA numbering, DEP batch, balanced journal, accumulated updated, duplicate period rejected without change; FM/B denied |
| Notifications (1) | scoped visibility; mark one / mark all persist per user; no leakage |
| Audit logs (1) | trigger rows exist, scoped to office, not forgeable or deletable |
| Storage (8) | FM PDF+PNG upload with byte-identical signed URL; Viewer upload/delete denied; cross-office path denied; B cannot sign/download; wrong MIME and oversize rejected in both buckets; vehicle photo (media) incl. link, B denied; avatars own folder only; row + object delete lifecycle |
| Anonymous (3) | 27 tables return no rows; writes/RPCs denied; storage list/sign denied |

## Not covered
Reports and dashboards, reconciliation, tyres/oil/accidents CRUD, customers and sales invoices, invoice draft/edit/duplicate flows, rejected and multi-level approvals, concurrency (two live sessions), invite and reset emails, the logos path, `set_user_companies`, the browser UI/AuthGate, rate limits, Realtime. The size-limit tests upload about 10 MB and 5 MB.

## Caveats
- The approval rule is global and temporary (threshold 7777); it could affect other users' large work orders during the run.
- Immutable data (journals, payments, audit) blocks deletion of offices/users; leftovers are listed in the run summary and tagged `E2E e2e-<ts>`.
- Assumptions to confirm on the first real run: error texts `exceeds outstanding`, `already run`, `already processed`, `already completed` (taken from the migrations); `payment_status` 'Partially Paid'; `audit_logs.entity_id` equals the vehicle id; `notification_reads` upsert allowed for members.
