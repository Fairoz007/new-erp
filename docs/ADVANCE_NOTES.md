# Advance notes (docs/ADVANCE_PROMPT.md)

Running log of the "make it advanced, no new features" brief: defects found, defaults chosen,
measurements, what is verified and what is not. One section per phase. Feeds the final section
of `AUDIT_REPORT.md`.

## Environment for this run

- **No staging project is connected.** `.env.local` does not exist and no project ref is linked
  (checked 2026-11-12). The user chose to proceed locally. Consequences, for every phase:
  - Browser checks can only reach the screens that render without a database (the
    "Database connection not configured" screen, and the sign-in screen when a placeholder URL
    is built in). Signed-in pages, the Setup Wizard and per-role logins are **not verified in a
    browser** until staging is connected.
  - `npm run test:e2e` (remote suite) and the Playwright suite cannot run; both refuse to start
    without staging credentials, by design.
  - Database behaviour is verified with PGlite (`npm run test:db`), which runs every migration.
  - Performance at the target volumes is measured on PGlite with
    `scripts/staging-volume-seed.mjs --pglite` (same SQL, same data set as staging). PGlite is a
    single-threaded WebAssembly Postgres, so absolute times are pessimistic; the relative change
    (before/after) and the row counts per request are what matter.
- Production (`fpeniljpqigpeqtsgizr`) was not linked, pushed, seeded or queried.

## Out of scope (would be new features)

Items noticed during the work that would need a new feature. Not built.

| Item | Why it is out of scope |
|---|---|
| Trip log for trip-based fleet utilization (AUDIT_REPORT K.3) | New entity and workflow |

---

## Phase 0: Baseline

### What could be run

| Check | Result |
|---|---|
| `npm run build` | Pass |
| `npm run test:db` | Pass (888 checks before this brief) |
| `npm run test:e2e` | **Not run.** Exits with "SUPABASE_URL is not set …"; needs staging keys. `--dry-run` passes. |
| Setup Wizard with two offices, login per role, every page at desktop and 375 px (K.1) | **Not run in a browser** (no staging). The database side of the same flow is covered by `20261112001200_e2e_fresh_install.test.mjs`. |
| Local preview, desktop and 375 px | Only the "Database connection not configured" screen renders. No horizontal scroll at 375 px; one console warning (the missing env vars), no errors. |

### Measurements (baseline, before any Phase 1 change)

**Bundle** (`node scripts/bundle-report.mjs` after `npm run build`). "Initial JS" is the entry
script plus every `modulepreload` Vite put in `index.html`, i.e. what must download before the
first screen.

| Chunk | gzip |
|---|---|
| vendor-pdf (jsPDF, autotable, html2canvas) | 170.4 kB |
| vendor-misc | 121.0 kB |
| index (app entry, includes the dashboard) | 103.7 kB |
| vendor-charts (recharts) | 56.7 kB |
| vendor-supabase | 56.0 kB |
| vendor-react | 54.4 kB |
| **Initial JS total** | **562.3 kB** (target < 250 kB) |
| All JS | 759.4 kB |

The PDF and chart libraries are preloaded on every visit although they are used only by
exports and dashboards: the `manualChunks` rule groups them into vendor chunks that the entry
chunk imports.

**Lighthouse 12.8.2** (`scripts/lighthouse.sh`, production build served by `vite preview`, sign-in
screen only, since nothing behind sign-in renders without staging):

| Preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT |
|---|---|---|---|---|---|---|---|
| Mobile (simulated slow 4G, 4× CPU) | 70 | 81 | 100 | 91 | 4.8 s | 4.8 s | 0 ms |
| Desktop | 98 | 81 | 100 | 91 | 0.8 s | 1.0 s | 0 ms |

Accessibility failures on the sign-in screen: inputs without associated labels, and secondary
text (`text-slate-400`, #7B8581 on white, 3.9:1) below 4.5:1.

**Time to first usable screen after sign-in:** not measurable without staging. By construction,
the Phase 0 app fetches 4 collections before showing any page and then the other 23 in the
background (every row of every collection the user can see, in pages of 400). At the target
volume that is ~1,250 requests for journal lines alone (see below).

**Slowest queries:** the staging dashboard is not available. The same queries were timed on
PGlite with the target data set — see "Database at target volume" below.

### Database at target volume (PGlite, scale 1)

The before/after timings of the same queries are in the Phase 1 section ("Database at target
volume: before and after"), measured in one run so both sides use the same data.

### Staging data set

- `scripts/staging/volume-seed.sql` — the data set at the target volumes (10 offices, 500 vehicles,
  300 employees, 50,000 invoices, ≥ 500,000 journal lines, ≥ 100,000 audit rows). Invoices go
  through `post_invoice` and `record_payment`, so balances and the audit trail are real.
  Everything it creates is marked (`VOL01…` offices, `VOL-…` numbers, "Staging volume" names).
  It refuses to run unless the guard `app.volume_seed_ok = 'staging'` is set, and refuses a
  second run.
- `scripts/staging-volume-seed.mjs` — the only way to run it. `--pglite` loads it into a local
  in-memory database and times the app's queries. `--print --project-ref <ref>` writes the SQL
  (guard included) for the staging SQL editor. Both refuse the production ref. The script never
  connects to a Supabase project itself.

### Defects found and fixed in this phase

| # | Page / area | Steps | Severity | Fix |
|---|---|---|---|---|
| D0-1 | 18 files: every form that defaults a date to "today" (expenses, invoices, payments, journals, reversals, maintenance, accidents, depreciation, contracts, transfers, documents), the P&L and balance-sheet "as of" defaults, the 7- and 30-day windows on the dashboard and monthly expenses, export file names | Open any of these forms in Oman between 00:00 and 04:00 local time | High: documents dated the previous day; due dates and alert windows shifted by a day | `new Date().toISOString().slice(0, 10)` is the UTC date. Replaced with local-date helpers `todayYmd`, `addDaysYmd`, `currentMonthYm`, `toYmd` in `src/utils/date.ts` (unit tests in Phase 2). |
| D0-2 | Every form using the shared `Input`, `Select`, `Textarea` (all pages) | Use a screen reader, or click a field label | Medium (accessibility, WCAG 1.3.1 / 4.1.2) | Labels were not associated with their control and errors were not announced. The shared components now set `id`/`htmlFor`, `aria-invalid`, `aria-describedby` (error or hint) and `aria-required`; unlabeled inputs use their placeholder as `aria-label`. |
| D0-3 | Every page: secondary text colour | — | Medium (WCAG 1.4.3) | Recorded here, fixed with the palette review in Phase 5. |

---

## Phase 1: Data layer and performance

### What changed

- **No whole-table loads.** `FleetContext` no longer loads invoices, payments, expenses, journal
  entries, audit logs or notifications. Pages read them through `src/services/queries*.ts`:
  lists are paged, sorted, filtered and searched in Postgres (DataTable `server` mode), and every
  figure (KPIs, ageing, dashboards, statements) comes from an aggregate function. No request asks
  for more than 1,000 rows (`PAGE_MAX`, and every page function refuses a larger page).
- **Smaller collections load on demand.** The remaining collections (vehicles, employees, parties,
  chart of accounts, …) are fetched the first time a page reads them, not all at sign-in.
- **Cache and invalidation** (`src/lib/queryCache.ts`): results are cached per user in memory,
  tagged by the tables they read. A write invalidates its tables; realtime events are coalesced
  (400 ms) and invalidate the same way; a tab that becomes visible refreshes stale results.
  Nothing business-related is stored in the browser.
- **Database** (migrations `20261113000000` … `0400`): list indexes; `ledger_movements`,
  `general_ledger_page`, `general_ledger_summary`; list views (`v_invoice_list`, `v_payment_list`,
  `v_journal_list`, `v_expense_list`, `v_notification_list`, `v_audit_log_list`, all
  `security_invoker`); `invoice_page`, `invoice_summary`, `expense_page`, `expense_summary`,
  `expense_page_figures`, `expense_totals`, `payment_totals`, `dashboard_series`,
  `dashboard_open_invoices`, `party_statement`, `vehicle_financial_totals`, `invoice_tax_by_month`,
  `reconcilable_invoice_page`, `notification_counts`, `unread_notification_count`,
  `office_record_counts`. List and figure functions run as the caller (RLS decides the offices);
  the two ledger functions that must run as owner check `accounting:view` /
  `financial-statements:view` per office.
- **One statement engine.** The trial balance, P&L, balance sheet and general ledger still use the
  TS functions in `accounting.ts`; they now take movements (Σ debit / Σ credit per account) from
  `ledger_movements` instead of summing every journal line in the browser.
- **Code splitting.** `manualChunks` was removed (it forced the PDF and chart libraries into chunks
  preloaded on every visit) and the dashboard became a lazy page like the others.
- **Virtual scrolling** (`src/components/ui/useVirtualRows.ts`) for tables that can show more than
  200 rows at once without paging: the attendance day sheet and month summary. Every other long
  list is paged.

### Parity (numbers did not change)

| What | Test |
|---|---|
| Trial balance, P&L, balance sheet, for all offices and each office | `src/services/__tests__/ledgerParity.test.ts`: old path (all entries in the browser) and new path (`ledger_movements`) give identical statements on the same database |
| General ledger running balance and brought-forward balance | same file, and `20261113000000_advance_data_layer.test.mjs` |
| General ledger account totals | `20261113000400_advance_ledger_system.test.mjs` |
| Invoice page figures (AP/AR, totals, ageing buckets, top parties, view counts) | `20261113000000_advance_data_layer.test.mjs` |
| Dashboard and finance figures | `20261113000100_advance_dashboards.test.mjs` |
| Party statements (both styles), vehicle financials, VAT by month | `20261113000200_advance_reports.test.mjs` (compared with ports of the old TS functions) |
| Expense and payment figures | `20261113000300_advance_expenses_payments.test.mjs` |
| Office record counts, notification counts, audit list | `20261113000400_advance_ledger_system.test.mjs` |

### Numbers or behaviour that changed, and why

| Change | Why | Proof |
|---|---|---|
| P&L per office and consolidated P&L for users with "financial statements: view" but not "accounting: view" now show figures instead of zeros | The old report summed journal lines the user could not load; `ledger_movements` answers for both permissions, as the statement pages already did | `20261113000200_advance_reports.test.mjs` |
| Unread notifications count no longer stops at 500; audit log no longer stops at the newest 1,000 | Counted / paged in the database | `20261113000100…`, `0400` tests |
| Statement-only users' JSON export no longer contains the synthetic "Summary" daily-total journals | They were never real journals | — |
| Ties in "oldest due first" lists are ordered by invoice date, then number | The order used to depend on load order | `20261113000100` test |
| Statement report lines on the same day are ordered by Postgres text order of the reference | Ordering moved to the database; balances are unaffected | `20261113000200` test |
| Payment method filter options are sorted alphabetically | Built from the database | — |
| Global search lists at most 8 invoices, with the true total in the heading | It used to list every match from a fully loaded table | — |
| Loading and error states instead of zeros while figures load | Figures now arrive separately from the page | — |

### Search fields

Searching moved to a `search_text` column per list view; every word must match.

| List | Now searches | Difference |
|---|---|---|
| Invoices | number, reference, PO, party, plate, office, notes | also office and notes; no longer status or amount |
| Payments | number, invoice, party, transaction reference, cheque, method, bank account, bank | also bank fields |
| Expenses | number, plate, category, description, supplier, cost centre, invoice and receipt numbers, employee, custom field values | also invoice/receipt numbers and employee; no longer status, amount or date |
| Journals | number, reference, description, source | same fields |
| Audit log | user, action, entity, changed fields with old and new values | wider than the four shortened values shown |

### Defaults chosen

- Page size 25 by default (DataTable), maximum 1,000 per request; exports fetch 1,000-row pages
  with progress and cancel. Notifications page 40 per step, drawer 50, general ledger 50 lines
  per account then 200 per "Show more".
- Cached results are fresh for 30 s; older ones are shown at once and refreshed in the background.
- `p_today` (the browser's local date) is passed to every "overdue" calculation, so overdue never
  depends on the server's time zone.
- The dashboard series is capped at 400 days per call.

### Measurements after Phase 1

| | Before | After | Target |
|---|---|---|---|
| Initial JS (gzip) | 562.3 kB | 205.7 kB | < 250 kB |
| Largest request | every row of every table (530,000 journal lines in 400-row pages ≈ 1,325 requests at the target volume) | ≤ 1,000 rows | ≤ 1,000 |

"Database at target volume: before and after" is below.

### Not verified

- No page was opened signed in, in a browser, against a real Supabase project (no staging). The
  PostgREST side (embedded `journal_lines` through `v_journal_list`, count-only `head` queries,
  `or=` filters on `v_payment_list`) is covered only by SQL tests of the same queries.
- First screen < 2.5 s and page change < 500 ms are not measured (need staging).

---

## Work from later phases done alongside Phase 1

These parts were independent of the page conversions and were done while those ran. Each is
listed again in its own phase.

| Phase | Item | Test |
|---|---|---|
| 2 | One money helper (`src/utils/money.ts`): rounding half away from zero like Postgres `round()`, no `-0.000` | `src/utils/__tests__/money.test.ts` |
| 2 | Local-date helper tests in Asia/Muscat | `src/utils/__tests__/date.test.ts` |
| 2 | Error mapping in one place (`friendlyMessage` in `src/services/core.ts`) | `src/services/__tests__/errors.test.ts` |
| 2 | Offline banner; everything refreshes on reconnect. "Your session has ended" on the sign-in screen when a session expires without the user signing out | not verified in a browser |
| 6 | Content-Security-Policy meta tag in production builds (`vite.config.ts`); host headers in `docs/OPERATIONS.md` | checked in the browser on the production build: policy present, no violations |
| 6 | Secret scan (`npm run scan:secrets`) | passes: nothing found |
| 6 | Schema-wide security audit (`supabase/tests/security_audit.test.mjs`) | passes |
| 8 | `client_errors` table, error reporter, `app_health`, `system_health`, `docs/OPERATIONS.md` | `20261113002000_observability.test.mjs` |

### Defects found by these checks

| # | Area | Severity | Fix |
|---|---|---|---|
| D1-1 | `budget_total(uuid)` ran as owner: any signed-in user could read another office's budget total by id | Medium | Now runs as the caller (`20261113003000_security_hardening.sql`) |
| D1-2 | `preview_doc_number` showed the next document number of any office | Low | Only for offices the caller can access |
| D1-3 | Negative amounts ending in exactly half a fil rounded toward zero in the browser (`-1.0005` → `-1.000`) but away from zero in the database (`-1.001`) | Low | One helper with the database's rule; `money.test.ts` |
| D1-4 | A tiny negative amount showed as `OMR -0.000` | Low | Rounded before formatting |

### Database at target volume: before and after

One run on PGlite (`node --max-old-space-size=8192 scripts/staging-volume-seed.mjs --pglite --scale 1
--split 20261113000000 --json docs/perf/volume-pglite.json`): the data set is loaded and timed
with the Phase 0 migrations, then the Phase 1+ migrations are applied to the same data and the new
queries are timed. Data: 10 offices, 500 vehicles, 300 employees, 50,000 invoices, 240,000 journal
entries with 530,000 lines, 436,743 audit rows. PGlite is single-threaded WebAssembly, so the times
are pessimistic; requests and rows per request are what the browser would see.

| Before (what sign-in loaded) | ms | requests | rows |
|---|---|---|---|
| Journal entries with lines, every page | 813,918 | 601 | 240,000 entries |
| Invoices with lines, every page | 29,490 | 126 | 50,000 |
| Payments, every page | 295 | 38 | 15,000 |
| Audit log, newest 1,000 (cap) | 17 | 1 | 1,000 |
| Account balances | 516 | 1 | 560 |

| After (what a page asks for) | ms | requests | rows |
|---|---|---|---|
| Invoices, first page of 25 | 127 | 1 | 25 |
| Invoices, page 200 sorted by amount | 245 | 1 | 25 |
| Invoices, search | 101 | 1 | 25 |
| Invoice figures, all offices / one office | 488 / 56 | 1 | 1 |
| Trial balance / balance sheet movements, all offices | 605 | 1 | 90 |
| P&L movements, this year | 296 | 1 | 90 |
| General ledger, one account, 100 lines | 99 | 1 | 100 |
| Journal list, 25 with lines | 2 | 1 | 25 |
| Payments list, 25 | 4 | 1 | 25 |
| Dashboard series, 6 months | 7 | 1 | 184 |
| Audit log, 25 | 1 | 1 | 25 |

The expense list returned 0 rows because the volume data set has no expenses (it seeds invoices,
payments and manual journals); `expense_page` is covered by its tests instead.

---

## Phase 2: Concurrency and failure handling

| Item | How | Test |
|---|---|---|
| Optimistic locking | Edits send back the `updated_at` they loaded (`withVersion` in the services; vehicles, offices, suppliers, customers, employees, tyres, accidents, fixed assets). Trigger `a0_version_check` refuses a save from an older copy with SQLSTATE `PT409` (HTTP 409) and the message "This record was changed by someone else since you opened it. Reload it…". After any failed save the page's data is reloaded (FleetContext mutation wrapper), so a retry shows the latest version. Employees, tyres and accidents got an `updated_at` column for this. | `20261113001000_concurrency.test.mjs` |
| Idempotent saves | Payment, invoice, expense and journal forms keep one request key per opened form (`src/lib/requestKey.ts`), sent as `x-request-key` on their writes. Trigger `a0_request_key` claims the key on the first insert; a second save with the same key is refused ("This was already saved…"), so a double click or a retry after a timeout never creates a second document. Inserts of the same transaction share the claim (a payment and its journal). Keys are kept 7 days (`purge_request_keys`). Payroll runs were already unique per office and month. Save buttons were already disabled while busy. | same file; `src/lib/__tests__/requestKey.test.ts` |
| Session expiry | Tokens refresh silently (supabase-js). If the session still ends without the user signing out, the app stays mounted behind a sign-in prompt, so open forms keep their input; the same user continues where they were, anyone else gets a clean reload. | not verified in a browser |
| Lost connection | Offline banner; writes are refused while offline ("you are offline, so nothing was saved"); on reconnect every cached query is refreshed. | `requestKey.test.ts` (writes refused); banner not verified in a browser |
| Errors | `friendlyMessage` in `src/services/core.ts` is the one place mapping Postgres / PostgREST / network errors; it names the column for missing values and the rule for check violations, keeps the messages our functions raise, and never shows a raw Postgres message for the mapped codes. Every page already had its own error boundary; crashes are now also reported (Phase 8). | `src/services/__tests__/errors.test.ts` |
| Money and dates | See "Work from later phases done alongside Phase 1". | `money.test.ts`, `date.test.ts` |

### Defaults chosen

- The version check fires only when the client sends `updated_at` and it is older than the stored
  one; server functions that set `updated_at = now()` are never refused.
- Request keys are per opened form, renewed when the form closes or the journal is posted.

### Not verified

- The `x-request-key` header against the real Supabase API (CORS allows custom headers per
  Supabase's documentation for `request.headers`; not tried, no staging).
- The session-expired prompt, offline banner and conflict message in a browser.

---

## Phase 3: Forms and validation

| Item | How | Test |
|---|---|---|
| One validation approach | `src/lib/validation.ts`: check helpers, `validate(values, schema)` → one message per field, `RULES` with the database's own wording. Forms keep an errors map, show it under the field (`error` on Input / Select / Textarea, which sets `aria-invalid` and `aria-describedby`), clear a field's error when it changes, and use `noValidate` so the browser's own popups do not pre-empt the inline messages. | `src/lib/__tests__/validation.test.ts` |
| Same message in browser and database | Every `RULES` message must appear in a current database function, and the payment, invoice, journal and credit-note rules are triggered for real and compared. A server rejection whose message is one of `RULES` is also shown on its field (finance forms). | `supabase/tests/validation_messages.test.mjs` |
| Forms converted | Quick forms: vehicle, maintenance, work order, oil change, expense, accident, invoice, payment, supplier, customer, tyre, fixed asset, depreciation run. Credit and debit notes (`PrintableInvoiceModal`), manual journal and journal reversal (`AccountingPage`). The rules each checks are the rules the save already enforced. | type-check, build; not clicked through |
| Required marks | `*` only on what the save or the database actually requires; removed where it was not (e.g. maintenance description, accident location, cheque number), added where it was (invoice quantity and unit price). | review |
| First invalid field focused | `useDialog` (every Modal and Drawer) focuses the first `[aria-invalid="true"]` field after a submit; `focusFirstInvalid()` after a server rejection. | not verified in a browser |
| Input types | `Input` sets `inputMode` (decimal / numeric / tel / email / url) and `autoComplete` from the type; 44 px controls below 640 px. | review |
| Unsaved changes | `src/lib/unsaved.ts`: a dialog with an edited form asks before closing (Escape, ✕, backdrop) and page navigation asks while any form is dirty; leaving the site uses `beforeunload`. | `validation.test.ts` (guard); dialogs not verified in a browser |
| Modal behaviour | `useDialog`: stacked Escape (top dialog only), focus trap, focus returned to the opener, scroll lock, `role="dialog"`, `aria-modal`, labelled by the title; full screen below 640 px; motion only when the user allows it. | not verified in a browser |
| Pickers | `src/components/ui/RecordSelect.tsx`: blank first option, inactive records listed as "(inactive)" / "(sold)" and not selectable, the current value always kept, a search box above lists longer than 12 options. Used for vehicle pickers in the quick forms (office in view; sold and scrapped cannot be picked), the invoice vehicle (invoice office), document upload vehicle and employee (document office), "Reports to", office manager and asset-disposal bank. `MasterEditor` selects keep a stored value that is no longer offered. | type-check; not verified in a browser |

### Defects found and fixed

| # | Defect | Fix |
|---|---|---|
| D3-1 | Quick "Add tyre" offered positions such as "Front Left (Steer)" and "Rear Left Outer"; the table only accepts Front Left, Front Right, Rear Left, Rear Right, Spare, so every save except Spare failed. | Options are now the five accepted positions (same list as the tyre edit form). |
| D3-2 | `post_invoice` refused a zero total with "Invoice has no lines" even when the invoice had lines. | Migration `20261113003500_validation_messages.sql` changes only the message to "Invoice total must be greater than zero", as every other invoice function says. |
| D3-3 | Employee lists were one request, so above the API row cap (1000) the rest were silently missing from every employee picker and page. | `fetchEmployees` pages like the other collections. |
| D3-4 | Pickers looked chosen when nothing was: required vehicle and supplier selects had no blank option, and the quick forms preselected the first vehicle of the whole list. | Blank first option; only the vehicle in view is preselected. |
| D3-5 | Choosing another vehicle in maintenance, work order, accident and tyre forms kept the first vehicle's office, so the supplier list was for the wrong office. Changing the invoice office kept the party and vehicle of the old office. | The office follows the chosen vehicle; changing the invoice (and vehicle) office clears the dependent picks. |
| D3-6 | "Reports to", office manager and recurring-expense category dropped a current value that had become inactive (the select showed another option while the old id stayed in state). | Inactive values are listed and kept. |
| D3-7 | Payments page bank filter listed every office's banks while the rest of the page was office-scoped. | Uses the office-scoped list. |
| D3-8 | The leave-balance employee picker kept an employee of the previous office after the office changed. | Resets to the first employee of the new office. |
| D3-9 | The journal "Post" button was disabled until the entry balanced, so the date, description and line errors could not be shown. | Enabled; the submit check reports every problem inline. |

### Defaults chosen

- Report pickers (party statements, GL account) keep inactive records selectable: a statement of
  an inactive supplier is still valid. Only pickers that create new records exclude them.
- Pickers that are not record pickers (status, method, year) and the remaining small record
  pickers (offices, banks in single-office forms) keep the plain `Select`.
- With `noValidate`, an amount with more than three decimals is no longer refused by the browser;
  the database rounds money to the currency's decimals as before.
- Initial JS: 216.2 kB gzip at the Phase 2 commit (the sign-in overlay is part of the shell),
  219.9 kB after Phase 3; budget 250 kB.

### Not verified

- No form was submitted in a browser (no staging database). Inline errors, focus, the unsaved
  guard and the pickers are checked by type-check, build and unit tests only.
- The expense pay / reject actions in `ExpenseDetailModal` disable their button instead of
  showing field errors; not converted.
- The custom-fields "check the additional information fields" toast remains (file and yes/no
  fields do not mark themselves invalid).

---

## Phase 6 work done during Phase 3 (database only)

| Item | Test |
|---|---|
| Bucket limits applied to existing buckets too (`20261113004000_storage_limits.sql`), private; browser limits equal the bucket limits. | `supabase/tests/storage_limits.test.mjs` |
| Audit trail: one write per module (vehicles, expenses, invoices, suppliers) leaves an audit row with the user, office and action; users cannot delete audit rows. Tables with `company_id` and no audit trigger: `audit_logs`, `doc_sequences`, `journal_lines` (the journal header is audited), `notifications`, `tyre_events`, `vehicle_timeline` (both are themselves history logs). | `supabase/tests/audit_coverage.test.mjs` |
| Every callable function with a page size refuses more than 1000 rows; `dashboard_series` is bounded to 400 days. | `supabase/tests/rpc_caps.test.mjs` |

---

## Commit layout from here on

Phases 4, 5, 7, 8 and 9 were worked on in parallel (one worker on page layout, one on exports,
health, tests and accessibility) and touch the same files (pages carry both the new header and the
new export call). They are committed together, and each phase below lists what it covers.

## Phase 4: Consistent UI

| Item | How |
|---|---|
| Page header | `src/components/ui/PageHeader.tsx` (title, description, actions right, wraps under the title on phones; optional back link and identifier / badge row). Used on 41 list, finance and HR pages and party detail. Primary action last. |
| List toolbar | Search left, filters, then Columns / Export right. `src/components/ui/FilterControls.tsx` (`FilterSelect`, `FilterInput`) replaces about 40 hand-written toolbar controls with five different class strings. The payments filters moved from their own card into the table toolbar. |
| Detail header | `src/components/ui/DetailTitle.tsx` for payment, work order, asset, employee and expense modals (icon, title, status badges, identifier). Vehicle detail keeps its own header with the photo and valuation panel; the order (back, title, plate, status, actions) matches. |
| Tabs | `Tabs` everywhere a page had hand-made tabs (work orders, notifications, general ledger, assets, invoice views, approval queues); `role="tablist"` / `role="tab"` / `aria-selected`. |
| Numbers | Right-aligned columns use tabular figures in DataTable and in hand-written tables (`index.css`). Tread depth, leave days, odometer and quantities that were centred are right-aligned. |
| Truncation | DataTable column option `truncate`: ellipsis plus the full text on hover; applied to 23 long text columns. Cards that cut text show the full text on hover; work-order cards wrap long descriptions. |
| Dead buttons | Searched: buttons without a handler, empty handlers, `href="#"`, TODO / "coming soon", always-disabled buttons, clickable-looking elements without `onClick`. None found. |
| Labels | Same action, same words: "Add Vehicle", "Create Work Order", "Record Oil Service", "Add Expense", "Create Invoice", "Record Maintenance", "Transfer to office". |

Left as is: title case vs sentence case between modules (different actions), modal titles that
describe the form, the red "Report Accident" button.

### Defect found (security)

| # | Defect | Fix |
|---|---|---|
| D4-1 | The sign-in page had a "Quick Demo Login" panel with three account emails (one a Super Admin) and their shared password written into the code, so the password was in every visitor's JavaScript and in the repository history since `a39a21c`. The secret scan did not look for passwords. | Panel, emails and password removed. The secret scan now fails on a password literal in code (`…PASSWORD… = '…'`); checked against the old file. **The password must be changed on every project where those accounts exist; removing it from the code does not remove it from git history or from deployed bundles.** |

## Phase 5: Accessibility (part 1)

| Item | How | Test |
|---|---|---|
| Contrast | Theme greys `slate-400` (secondary text) `#7B8581` → `#626B67` and `slate-500` (muted) `#9CA3AF` → `#666F6B`: at least 4.57:1 on every surface colour of the theme (white, `#F7F8F7`, `#F0F2F1`, `#EFF2F0`, `#E7EBE8`, `#F1F3F2`), was 2.5–3.8:1. Chart axis text likewise. | `e2e/browser/signed-out.spec.ts` (axe found the old values, passes now) |
| Touch targets | `Button` is at least 44×44 px below 640 px (desktop keeps the compact sizes); sidebar links 44 px on phones; "Forgot password?" 44 px. | same spec at 375 px |
| Charts | Each dashboard chart is a labelled `figure`; the drawing is hidden from screen readers and the same numbers are in a screen-reader table. | review |
| Tabs, dialogs, fields | see Phase 3 (dialogs, field labels and errors) and Phase 4 (tabs). | |

## Phase 7: PDF and CSV

| Item | How | Test |
|---|---|---|
| CSV | `src/utils/export.ts`: `toCsv` / `downloadCsv` for every export: UTF-8 BOM, CRLF, every cell quoted, formula injection neutralised, the same header with or without rows, raw values (numbers as numbers). The trial balance, general ledger, attendance and cash-flow exports, which built CSV by hand without BOM or injection protection, now use it. | `src/utils/__tests__/export.test.ts` |
| PDF | One layout in `exportToPDF`: organisation name and logo (when set), title, the filters used, "Generated by <user> on <date>", table header repeated on every page, totals row once at the end, "Page x of y" and the title in the footer. The trial balance passes its filters and totals. | `export.test.ts` (header lines); PDF not opened |
| Progress and cancel | DataTable server exports already fetch page by page with a progress line and Cancel; the general ledger export likewise. | existing |

Changed behaviour: an export with no rows now produces a file with the header (CSV) or a "No rows"
table (PDF) instead of a browser alert. Import templates (attendance, bank statement, opening
balances) are unchanged so re-importing them is unaffected.

Not done: DataTable exports do not yet pass the page's filters to the PDF header (DataTable does
not know them); printed views (`window.print()` on P&L, balance sheet, reports, invoices) keep
their print layout.

## Phase 8: Observability (part 2)

| Item | How | Test |
|---|---|---|
| Settings → System health | Super Admins only (tab hidden for others; `system_health()` refuses others). Shows the newest migration applied next to the newest one in this build (`__LATEST_MIGRATION__`, from the file names at build time) with "up to date / this app expects … / database is newer", pg_cron jobs with schedule, state, last run and result and any expected job that is not scheduled, bucket privacy, size limit and types, the setup checklist, and the 20 newest browser error reports. | `src/services/__tests__/systemHealth.test.ts`; panel not opened (no database) |

## Phase 9: Tests and CI (part 1)

| Item | How |
|---|---|
| Playwright | `@playwright/test` and `@axe-core/playwright` added. `npm run test:browser`: desktop and 375 px projects. `signed-out.spec.ts` runs anywhere (builds against an unreachable placeholder database): axe WCAG 2.1 AA with no serious / critical issue, no horizontal scroll, Tab order, 44 px targets, reduced motion. `roles.spec.ts` signs in once per role on staging and checks every page in the sidebar; skipped without `E2E_BASE_URL`, `E2E_CONFIRM`, `E2E_USERS`; stops if the app calls any project but the confirmed one, refuses production. See `e2e/README.md`. |
| CI | `.github/workflows/ci.yml`: lint, build, bundle budget, secret scan of the build, unit tests, database tests on every push / PR; the browser job only when started by hand. |
| Lint | No ESLint configuration exists in the project; `npm run lint` is the type-check plus the secret scan. Adding ESLint rules would change many files without changing behaviour; not done. |

Result here: `test:browser` 4/4 (signed-out screens only); the per-role run needs staging.

## Phase 5: Accessibility (part 2)

Found with a static scan of all `.tsx` files (TypeScript parser: clickable non-buttons, unnamed
controls, icon-only buttons, images, `th` without scope, tables without a scroll container,
outline removal, wide fixed widths, unprefixed grids), then fixed:

| Area | Fix |
|---|---|
| Skip link and main | "Skip to main content" link; `<main id="main-content" tabIndex={-1}>`. |
| Sidebar on phones | A real drawer: `useDialog` (focus moves in and is trapped, Escape, focus back to the menu button, scroll lock), `role="dialog"` / `aria-modal` while open, not reachable by Tab when closed, close button, at most 85 % of the screen. Nav badges have text for screen readers. |
| Header | 44 px icon buttons on phones; the bell says how many are unread; `aria-expanded` on menus; menus fit the screen; the search hint shows the real shortcut (⌘K, it said ⌘F). |
| Toasts | The live region is always mounted, so toasts are announced; type spoken ("Error: …"); named 44 px dismiss button. |
| DataTable | Sorting is a button with `aria-sort`; clickable rows are reachable and open with Enter / Space; search, rows-per-page and pagination named; 44 px menu items on phones; Escape closes the export menu. |
| Global search | A proper dialog (`useDialog`): focus trap and return, labelled input. |
| Clickable cards and rows | StatCard, KPIGroup, notification drawer, analytics column, document zone and row clicks on 14 pages: button role or Tab + Enter / Space. |
| Tables | `scope="col"` on 193 header cells in 27 files; "Actions" for screen readers on empty action headers; header rows for 5 role-dashboard tables; the printable invoice table scrolls on phones. |
| Names | Filter selects and date inputs (21 places), icon-only buttons in documents and contracts. |
| Phone layout | Grids one column below 640 px (offices, vehicle detail); fixed widths full width on phones (general ledger, bank reconciliation, leave, budgets, reports); banners wrap. Focus outline for links and focusable elements; checkboxes 24 px with 44 px labels on phones. |
| Colour only | Unread dots labelled. |

Already fine: every image has `alt`; no outline removal without a replacement; every wrapped
field has a label; every table scrolls inside its container; one `<main>`; one `h1` per page;
badges carry text; the reduced-motion rule in `index.css` covers transitions and skeletons.

Tests: `npm run test:browser` (sign-in page at desktop and 375 px, axe with no serious or
critical issue) 4/4. **Not verified:** any signed-in page in a browser (no database here); the
per-role axe run (`roles.spec.ts`) needs staging.

---

## Phase 10: Final measurements

| Measurement | Phase 0 | Final |
|---|---|---|
| Initial JS (gzip) | 562.3 kB | 220.6 kB (Phase 1: 206.0; the sign-in overlay of Phase 2, validation, dialogs and the shared header add the rest; budget 250) |
| Lighthouse mobile, sign-in screen (perf / a11y / best practices / SEO) | 70 / 81 / 100 / 91, LCP 4.8 s | 87 / 100 / 100 / 91, LCP 3.2 s |
| Lighthouse desktop | 98 / 81 / 100 / 91, LCP 1.0 s | 97 / 100 / 100 / 91, LCP 1.0 s |
| `test:db` checks | 888 | 1,069 |
| Unit tests | 0 | 43 |
| Browser (axe) | not run | 4 / 4 signed-out |

Database at target volume, final run with every migration (`docs/perf/volume-pglite-final.json`,
same data set and command as Phase 1 without `--split`):

| Query (1 request each) | Phase 1 ms | Final ms |
|---|---|---|
| Invoices, first page of 25 | 127 | 132 |
| Invoices, page 200 sorted by amount | 245 | 248 |
| Invoices, search | 101 | 103 |
| Invoice figures, all offices / one office | 488 / 56 | 492 / 57 |
| Trial balance / balance sheet movements | 605 | 613 |
| P&L movements, this year | 296 | 295 |
| General ledger, one account, 100 lines | 99 | 129 |
| Journal list / payments list / audit log, 25 | 2 / 4 / 1 | 2 / 4 / 1 |
| Dashboard series, 6 months | 7 | 7 |

The locking and request-key triggers (Phase 2) and later migrations did not slow the reads; the
general-ledger difference is within run-to-run variation of single-threaded PGlite.

Not measured: time to first usable screen after sign-in and the slowest queries on staging (no
staging database).

## Production push (2026-11-12, on the owner's instruction)

The owner asked to use `fpeniljpqigpeqtsgizr` (the only project in the organization) and to push the
migrations there. The brief's rule against production was lifted for the migration push only. No
seed, no volume data, no `test:e2e` and no write tests were run against it.

What was there: migrations up to `20261026001100` (15 of 37), 2 offices, 9 users, 1 vehicle,
2 work orders, 1 customer, 1 supplier, 768 `role_permissions` rows, 8 approval limits. No backups
listed and point-in-time recovery off.

Steps:

1. **Duplicate migration version fixed.** `20261113003000_security_hardening.sql` (Phase 1) and
   `20261113003000_validation_messages.sql` (Phase 3) had the same version, which `db push` keys on.
   The Phase 3 file had never been applied anywhere, so it was renamed to
   `20261113003500_validation_messages.sql` (contents unchanged, same order).
2. **Backup point.** `supabase db dump` needs Docker, which this machine does not have.
   `scripts/release/export-data.mjs` exported every non-empty table, `auth.users` (id, email,
   metadata), the column list and function hashes to `backups/prod-20261112-pre-push/` (git-ignored).
3. **Drift check.** The schema built from the 15 applied migrations matched the project: every
   column the same, all 80 function bodies the same once Windows line endings (`\r\n`, from an
   earlier push) are ignored.
4. **Rehearsal** (`scripts/release/rehearse-push.mjs`): the real rows loaded into PGlite, then the
   22 pending migrations applied one by one. All applied. Business rows unchanged (companies 2,
   profiles 9, members 11, vehicles 1, work orders 2, customers 1, suppliers 1); every profile got a
   role; the old approval limits carried over (Accountant invoice 500, Fleet Manager maintenance
   500, Company Admin → Admin unlimited); each of the 9 users still sees their own offices.
   `audit_logs` grows 7 → 156 because the migrations' backfill updates are audited.
5. **Push.** `supabase db push` applied the 22 migrations; counts on the project then matched the
   rehearsal exactly (`role_grants` 1,098, `role_approval_limits` 23, `audit_logs` 156), the
   `documents` and `media` buckets have their limits.
6. **Advisors** after the push: no errors. Fixed in `20261113005000_advisor_fixes.sql` (pushed, with
   two new checks in `security_audit.test.mjs` that fail without it): four functions without a fixed
   `search_path`, and the `client_errors` insert policy calling `auth.uid()` per row. Left as they
   are: 97 "security definer function executable by authenticated" (the app's RPC API; each checks
   permissions, covered by `security_audit.test.mjs`), 6 "multiple permissive policies" on small
   settings tables from the earlier feature phases (a speed hint only), and leaked-password
   protection (an Auth setting for the owner in the dashboard).
7. **App against the project** (local dev server, signed out): sign-in screen loads, Auth health
   200, the `x-request-key` header passes CORS, a signed-out read of `companies` is refused (42501).

8. **Edge Function** `invite-user` deployed with `supabase functions deploy invite-user --use-api`
   (no Docker needed; it uses only the keys Supabase provides). Without a session it answers 401.

Found, not changed:

- **pg_cron is not enabled** on the project, so the four daily jobs were skipped by their guards and
  nothing is scheduled (expiry notifications, recurring expenses, purges). Enable it under
  Database → Extensions, then schedule the jobs (out of scope here: needs a follow-up migration
  that re-runs the guarded `cron.schedule` calls).
- **No backups** on the project. Turn on PITR or a paid plan with daily backups before real use.

Not verified on the project: any signed-in page (needs a real account; passwords for live accounts
are not typed by the assistant), `test:e2e`, the per-role Playwright run, PDF logo fetch.
