# ERP Audit Report — 2026-10-25

## A. Inventory & architecture

| Item | Finding |
|---|---|
| Stack | React 18 + TypeScript + Vite + Tailwind, single-page app |
| Routing | `switch` on `UIContext.currentPage` (hash-synced) in `src/App.tsx` |
| Data layer | **No backend or database.** All 27 collections live in React state in `src/context/FleetContext.tsx`, seeded from `src/data/initialSeedData.ts`, persisted to browser `localStorage` |
| Auth | **No real authentication.** `AuthContext` starts as a Super Admin; a header role switcher selects any seeded user. RBAC is client-side only (`canAccessPage`, `hasPermission`, `canApprove`) |
| Tests / lint | None configured. Checks available: `tsc --noEmit`, `vite build` |

Modules discovered: **31 routed pages** (the app has 31, not 45–50). Every route in `App.tsx` matches a page file, and no orphaned pages were found. All 31 were inspected individually.

**Not applicable to this codebase:** Supabase/RLS, server APIs, migrations, server-side authorization, file storage, background jobs. Uploaded files are stored as data URLs in localStorage.

## B. Issue summary (actual counts)

| Severity | Found | Fixed | Verified in browser | Open (documented) |
|---|---:|---:|---:|---:|
| P0 | 3 | 3 | 1 (overpayment guard) | 0 |
| P1 | 22 | 19 | 2 (quick-action RBAC, payment numbering) | 3 |
| P2 | 33 | 25 | 0 | 8 |
| P3 | 10 | 5 | 0 | 5 |

"Fixed" means the change compiles, the build passes, and all 31 pages render. Only the three flows listed above were exercised end to end in the browser.

## C. Module-by-module

| Module | Status | Key issues fixed |
|---|---|---|
| Dashboard | Fixed | Office selector ignored by all KPIs; tyre severity; expired registrations flagged on sold/scrapped vehicles. Open: hard-coded "+14.2%" trend and reminder card |
| Companies | Fixed | **P1 data loss:** a mount effect silently called `resetToDefaultData()` (wiping all data) whenever the companies list didn't match the seed. Removed; the manual reset now asks for confirmation |
| Vehicles / Vehicle detail | Fixed | Status filter incomplete; stale id showed the wrong vehicle; dead Download button; hard-coded spare tyre; oil "next due" used an unsorted record |
| Maintenance / Work orders | Fixed | No permission checks on status buttons; Requested orders could be completed without approval; Waiting-for-Parts orders had no way back; category filter showed 6 of 26 |
| Oil / Tyres | Fixed | No office scoping; search couldn't find plates; tyre counts included scrapped tyres |
| Accidents | Fixed | KPIs unscoped; fabricated "+78% covered"; incomplete status filter |
| Profitability | Fixed | Search never matched (nested row data); office scoping missing. Open: fabricated `fuelCost` (unused) |
| Expenses / Invoices / Payments | Fixed | KPIs ignored company filter; placeholder bill scan on sales invoices |
| Accounting (journal) | Fixed | No permission check or validation; zero, negative and one-sided lines could be posted |
| Trial balance | Fixed | Filtered view showed totals for the whole ledger |
| Reconciliation | Fixed | **P1:** "received" amount was hard-coded to 294 for every 3-way match. Picker included credit notes |
| Depreciation / Fixed assets | Fixed | Company scoping; NaN % when cost was 0; **duplicate-period runs now blocked** |
| Payroll | Fixed | Company scoping; **duplicate month runs now blocked** |
| P&L / Balance sheet | Inspected, open | Display only. P&L reads global account balances (see D) |
| Suppliers / Customers | Inspected | Display-only lists; entities have no `companyId` |
| Documents | Fixed | Download only showed a toast. Deletion is now audit-logged |
| Approvals | Fixed | Required comment was not enforced |
| Audit logs | Fixed | Fabricated IP shown for records without one |
| Reports | Fixed | 11 of 16 reports silently showed the expense table (now flagged "not yet implemented"); vehicle exports had empty columns. Open: AP aging buckets are fabricated percentages |
| Notifications | Inspected | No issues |
| Users & roles | Inspected, open | Permission matrix is hard-coded and does not match `AuthContext` |
| Settings | Fixed (via context) | Backup import now validates every collection before writing any state |

## D. Data-layer report (`FleetContext.tsx`)

Fixed:
- **P0 ID collisions:** `Date.now()` IDs → `crypto.randomUUID()`. Document numbers came from `length + 1` and repeated after deletes; they now use `nextSeq` (highest existing number + 1). Verified: a new payment became PAY-2026-0090, not PAY-2026-0003.
- **P0 overpayment:** `addPayment` rejects amounts ≤ 0 or above the outstanding balance. Before, bank and party balances moved by the full amount while the invoice was clamped at 0. Verified in the browser.
- **P0 unbalanced journals:** `addJournalEntry` rejects entries where Dr ≠ Cr, or the total is 0.
- **P1 orphans:** `deleteVehicle` refuses when linked records exist.
- **P1 duplicate records:** `updateWorkOrderStatus` created maintenance records and audit logs inside a state updater. React StrictMode runs updaters twice, so this produced duplicates. Moved outside the updater.
- Import validation, document-delete audit logging, depreciation and payroll duplicate guards.

Open (P1/P2: these need product decisions about accounting design):
1. **P1:** payments, invoices and credit notes **do not post to the general ledger**, so the trial balance, P&L and balance sheet do not reflect AR/AP activity.
2. **P1:** the chart of accounts has no company dimension, so the P&L, balance sheet and trial balance closing balances are always consolidated. The trial balance mixes global closing balances with company-filtered movements.
3. **P2:** credit notes don't reduce the original invoice or party balance and can be duplicated. `addInvoice` trusts the caller's `grandTotal`. P&L direct costs match account names instead of codes. Payroll doesn't debit the bank account.
4. **P2:** `localStorage` quota errors are only logged, so large uploads can silently stop being saved. No upload size or type limit.

## E. Security report

- **Architectural (not fixable client-side):** there is no authentication, and all RBAC runs in the browser. Any user can switch to Super Admin or edit localStorage. Production use needs a backend with server-side auth and authorization.
- Fixed: quick-action modals (create vehicle, invoice, payment, payroll, etc.) skipped all permission checks. They now require page access plus `create` permission (`UIContext.openQuickModal`). **Verified:** the Viewer role gets "Permission denied".
- Fixed: the invoice viewer modal could be opened from global search by roles without finance access.
- Fixed: work-order status buttons and journal posting now check permissions.
- No secrets, `dangerouslySetInnerHTML` or `innerHTML` found. Open (P3): CSV export doesn't neutralize cells starting with `=`, `+`, `-` or `@` (formula injection).

## F. Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `vite build` | Pass (1.1 MB chunk warning, pre-existing) |
| All 31 routes render (scripted hash navigation) | Pass, 0 console errors |
| Viewer → Quick action "Add New Vehicle" | Blocked with "Permission denied" ✔ |
| Payment of 999 against a 294 invoice | Rejected with outstanding-amount message ✔ |
| Payment of exactly 294 | Accepted; numbered PAY-2026-0090 ✔ |
| Automated unit/E2E tests | **None exist.** No test framework is configured, and none was added |

Not exercised in the browser: journal-imbalance rejection, vehicle-delete guard (no UI calls `deleteVehicle`), payroll/depreciation duplicate guards, work-order completion dedupe, and the page-level KPI scoping fixes. These were verified by code review and type checking only.

## G. Files changed

`src/context/FleetContext.tsx`, `src/context/UIContext.tsx`, `src/components/common/QuickActionModals.tsx`, `src/components/ui/{Modal,DataTable}.tsx` (Escape closes modals; page index clamped after deletes; numeric-aware sort), `src/utils/{date,export}.ts` (dates shifted by a day in UTC-negative timezones; UTF-8 BOM so Excel reads CSVs correctly; object-URL leak), and 24 page files. No schema or infrastructure changes. `.claude/launch.json` was added for the dev preview.

## H. Release recommendation

**Not ready for release** as a production ERP. The blockers are architectural: no server-side authentication or authorization, browser-only persistence, and AR/AP not posted to the general ledger, so financial statements are incomplete. As a single-user demo or prototype it is conditionally ready: the verified critical data-integrity and data-loss defects are fixed, and the open P2/P3 items are listed above.

---

# Update — 2026-11-12: Phases 0–11 complete

The brief in `docs/FIX_AND_COMPLETE_PROMPT.md` was carried out in 12 commits, one per phase (`773080a` … Phase 11). Defaults and unverified items for each phase are listed in `docs/PHASE_NOTES.md`. The 2026-10-25 findings above describe the earlier browser-only app.

## I. Fixed since the first audit

| First-audit finding | Now |
|---|---|
| No authentication; RBAC only in the browser (architectural) | Supabase Auth. Every table has RLS, and every write path is a table policy or a security-definer RPC that checks the same permission functions the UI uses (`can_in`, `perm_company_ids`, `can_approve_in`). |
| Browser-only persistence, `localStorage` quota | Every record is in Postgres. No business data is kept in the browser. |
| P1: invoices, payments and credit notes not posted to the GL | Posted in the database at approval. Expenses, payroll, depreciation, asset disposal, opening balances and debit notes are posted the same way. |
| P1: chart of accounts had no company dimension | Each office has its own chart of accounts and ledger; the consolidated P&L adds the offices up. |
| P2: client-trusted invoice totals; credit notes could be duplicated | Totals are computed in `create_invoice` and `replace_invoice_lines`. Credit notes reduce the parent invoice and are capped. |
| Hard-coded permission matrix | Roles are data, with a module × action matrix, limits and per-office roles (Phases 1 and 9). |
| Fabricated figures (dashboard trend, `fuelCost`, AP aging percentages, the reconciliation amount) | Removed. Every dashboard and report figure is computed from records (Phase 0 and Phase 10). |
| Reports that showed the expense table | Each report has its own data, office and date filters, and CSV and PDF export (Phase 10). |
| P3: CSV formula injection | Cells that start with `= + - @`, a tab or CR are neutralised (`src/utils/export.ts`). |

Added by the brief, by phase:
- **0:** Ledger stabilised; demo data removed.
- **1:** Setup Wizard.
- **2:** Office ownership and sharing.
- **3:** Custom fields.
- **4:** Party registration with approval and duplicate blocking.
- **5:** Bus operations, drivers and expiry alerts.
- **6:** HR, leave and payroll.
- **7:** Period close, journal approval, bank reconciliation, cash flow, budgets.
- **8:** Expense workflow and monthly recurring expenses.
- **9:** Approval rules by role, and statements-only access.
- **10:** Role dashboards, reports, leave and overdue notifications.
- **11:** Fresh-install end-to-end test; the remote E2E suite now refuses production.

## J. Verification

| Check | Result |
|---|---|
| `npm run build` (tsc + vite) | Pass |
| `npm run test:db` | Pass: 888 of 888 checks (schema, contract, 20 migration suites, fresh-install E2E) |
| Fresh install, end to end (`supabase/tests/20261112001200_e2e_fresh_install.test.mjs`) | Pass, 15/15 (details below) |
| Role and cross-office checks | Covered by the database suites (office scoping, roles, auth, every module suite) and by the fresh-install run |
| **Browser: Setup Wizard, every page, each role's login, 375 px mobile width** | **Not verified.** No staging database is connected to the dev preview, which shows "Database connection not configured". Nothing was run against production. |
| Remote suite `npm run test:e2e` (real Auth, PostgREST, Storage) | Not run. It needs a staging project and keys. |

What the fresh-install run covers, on an empty database with all migrations applied:
- The Super Admin creates the organization and two offices, and each office's chart of accounts is seeded.
- Banks, a tax rate and a payment term are added, and `complete_setup` passes.
- A bus, a client, a supplier and an employee are added.
- A monthly expense template generates its draft, which is submitted and posted.
- A sales invoice of 1,000 + 5% VAT is posted and 600 is received into the bank.
- Results:
  - The trial balance balances in both offices.
  - The Muscat P&L is 1,000 revenue less 200 rent; Sohar is empty.
  - The bank is at 1,600.
  - The Sohar fleet manager sees no Muscat data and cannot write to Muscat.
  - The viewer cannot write or pay.
  - The sponsor gets statement totals and no journal lines.
  - The Muscat finance manager cannot see the Sohar books.

## K. Still open, with reasons

1. **Browser and mobile verification.** Every UI flow added in Phases 1–10 has been type-checked and built, and the database behind it is tested, but none has been clicked through. This needs the staging project connected (`.env.local` and `supabase db push` to staging), then a pass of the wizard, each role's login and the 375 px layout. Until then, UI features are "built and wired", not "verified in the browser".
2. **The pg_cron schedules** for daily notifications and finance jobs are untested, because PGlite has no pg_cron. The functions themselves are tested.
3. **Fleet utilization is based on availability and odometer readings**, because trips are not recorded. A trip log would be needed for trip-based utilization.
4. **Design decisions recorded in `docs/PHASE_NOTES.md`:**
   - Maintenance records post through their linked bill, not on their own.
   - Expenses that existed before Phase 8 were not back-posted.
   - Approval rules cover work orders and invoices; other documents use signing limits.
   - The HR dashboard's payroll figure is the sum of basic salaries.
5. **Production** (`fpeniljpqigpeqtsgizr`) was not touched: it was not linked, pushed, reseeded or tested against. Apply the migrations there only after staging has been verified.

## L. Release recommendation (updated)

Ready for **staging acceptance**: the database layer, permissions and ledger are complete and tested. Treat the release as conditional on the browser and mobile pass in K.1 on staging. Push to production after that pass succeeds.

---

# Update — 2026-11-12: production hardening (docs/ADVANCE_PROMPT.md, Phases 0–10)

No new features. Each phase's changes, tests, defaults and unverified items are in
`docs/ADVANCE_NOTES.md`; commits `0381f71` (Phase 0) to the Phase 10 commit.

## M. Improved, and how it is verified

| Area | What improved | Verified by |
|---|---|---|
| Data layer | Lists, totals and reports are paged and aggregated in Postgres instead of loading every row at sign-in; tag-based query cache; lazy collections. Report numbers unchanged (parity tests), except where they were wrong (statement-only P&L, capped lists; see notes). | `20261113000x00_*.test.mjs`, `ledgerParity.test.ts`, volume timings (below) |
| First load | Initial JS 562.3 → 220.6 kB gzip (budget 250). | `npm run bundle:check` |
| Concurrency | Stale edits refused (PT409) on 12 tables; double-submitted payments, invoices, expenses and journals refused by request key; session expiry keeps open forms; writes blocked offline. | `20261113001000_concurrency.test.mjs`, `requestKey.test.ts` |
| Errors | One error mapping that names the field or rule; crash reports in `client_errors` (Super Admins only, rate-limited, purged after 90 days). | `errors.test.ts`, `20261113002000_observability.test.mjs` |
| Forms | One validation approach; the browser shows the database's own messages inline; first invalid field focused; required marks match the save; unsaved-changes guard; consistent dialogs; one record picker (inactive shown as unavailable, current value kept, search, office scope). | `validation_messages.test.mjs` (database and browser wording agree), `validation.test.ts` |
| UI | Shared page header, toolbar, detail titles, tabs; tabular right-aligned numbers; truncation with tooltips; no dead buttons found. | review, build |
| Accessibility | Theme contrast ≥ 4.5:1, labels, keyboard access to rows and cards, sortable headers, skip link, accessible phone drawer, announced toasts, scoped table headers, chart text alternatives, 44 px targets and one-column layouts on phones, reduced motion. Lighthouse accessibility on the sign-in screen 81 → 100. | `npm run test:browser` (axe, desktop and 375 px), Lighthouse |
| Security | RLS on every table, no anon grants, `search_path` on definer functions, a permission check in every callable definer function (two leaks fixed); private buckets with enforced limits; audit rows per module; page-size caps on RPCs; CSP and host headers documented; secret scan in CI, now also for password literals. **Hard-coded demo credentials removed from the sign-in page (D4-1).** | `security_audit.test.mjs`, `storage_limits.test.mjs`, `audit_coverage.test.mjs`, `rpc_caps.test.mjs`, `npm run lint` |
| Exports | One CSV standard (BOM, formula protection, stable columns, raw numbers) and one PDF layout (branding, filters, generated by / on, repeated headers, totals, page x of y); progress and cancel. | `export.test.ts` |
| Operations | Settings → System health (migrations vs build, cron jobs with last run, buckets, setup checklist, recent errors); `docs/OPERATIONS.md` runbooks. | `systemHealth.test.ts` |
| Tests and CI | `test:db` 1,069 checks (was 888), 43 unit tests, Playwright + axe suite, CI workflow (lint, build, budget, secret scan, unit, database; browser job manual). | CI file, local runs |

Defects found and fixed during this work: D1-1..D1-4 (Phase 1), D3-1..D3-9 (Phase 3: among them
tyre positions the database rejected, employee lists capped at 1,000, a wrong invoice message),
D4-1 (demo credentials). Details in the notes.

## N. Verification (this update)

| Check | Result |
|---|---|
| `npm run build` | Pass |
| `npm run test:db` | Pass, 1,069 / 1,069 |
| `npm run test:unit` | Pass, 43 / 43 |
| `npm run test:browser` | Pass, 4 / 4 (sign-in screen, desktop and 375 px, axe: no serious or critical issue) |
| `npm run lint`, `npm run scan:secrets` | Pass |
| `npm run bundle:check` | Pass, 220.6 kB initial JS |
| Target volume on PGlite (530,000 journal lines, 50,000 invoices) | Every list, total and report is one request of 1–613 ms (Phase 0: journals 601 requests, 814 s); unchanged since Phase 1 (`docs/perf/volume-pglite-final.json`) |
| Lighthouse, sign-in screen (mobile / desktop) | Performance 70 → 87 / 98 → 97, Accessibility 81 → 100 / 81 → 100, Best practices 100 / 100, SEO 91 / 91; mobile LCP 4.8 → 3.2 s |
| Signed-in pages in a browser, per role, 375 px | **Not verified** (no staging database connected) |
| `npm run test:e2e` and the per-role Playwright run | **Not run** (need staging) |

## O. Still open

1. **Staging pass** (K.1 still applies): connect staging, push the migrations there, run
   `npm run test:e2e` and `npm run test:browser` with the staging variables, and click through each
   role at desktop and 375 px. Everything in M that touches the UI is built, type-checked and
   unit-tested but not yet seen signed in.
2. **Rotate the demo password** (D4-1) on every project where `superadmin@`, `fleetmanager@` and
   `accounts@hakim.com` exist; it is in the git history and in earlier deployed bundles.
3. Not verified against the real API: the `x-request-key` header (CORS), signed-URL logo fetch for
   PDFs, pg_cron job runs.
4. DataTable PDF exports do not list the page's filters (the table does not know them); printed
   views keep their print layout. ESLint is not configured (`lint` = type-check + secret scan).
5. Production (`fpeniljpqigpeqtsgizr`) was not linked, pushed, seeded or tested against.

## P. Release recommendation

Unchanged in substance: ready for **staging acceptance**. Release to production after the staging
pass in O.1 and the password rotation in O.2.
