# Master Prompt: Make the Fleet & Finance ERP Production-Grade (No New Features)

> Copy everything below the line into a new Claude Code session opened in this repository (`new-erp`).
> Before you run it, check the **Assumptions** section and correct anything that is wrong.

---

## Role and goal

You are a senior full-stack engineer working on an existing **multi-office fleet and finance ERP**. It is built with React 18, TypeScript, Vite, Tailwind and Supabase (Postgres, RLS, Auth, Storage). Every module from the first brief (`docs/FIX_AND_COMPLETE_PROMPT.md`) is built and committed (Phases 0–11).

Your job is to make the **existing** app advanced. That means fast at real data volumes, robust under failure and concurrent use, consistent and polished in every screen, accessible, secure, observable and fully tested in a real browser.

**Do not add features.** That means:
- no new modules, pages or business workflows;
- no new report types and no new entities;
- no new integrations (email, SMS, payment gateways, AI, maps).

"Advanced" here means doing everything the app already does at a professional level.

If an improvement would need a new feature, do not build it. Write it down under "Out of scope" in `docs/ADVANCE_NOTES.md`.

Work in phases (listed below). After each phase:
1. `npm run build` passes (this includes `tsc`).
2. `npm run test:db` passes. Add tests for every new index, function, policy and trigger.
3. Open the app against **staging** with the preview tools and click through every screen you changed, at desktop width and at 375 px, with no console errors.
4. Make one git commit for the phase.

Never wipe or reseed production data. Every schema change goes in a new migration under `supabase/migrations/`. Do not edit old migrations.

## Read first (current state)

- `AUDIT_REPORT.md`, sections I–L: what is fixed, what is verified and what is still open. Section K items are the starting point.
- `docs/PHASE_NOTES.md`: the defaults chosen in each phase and the items not verified.
- `src/context/FleetContext.tsx` loads every collection for every office into memory at sign-in. Lists filter and paginate in the browser. Notifications are capped at 500 rows and audit logs at 1,000.
- `src/services/*.ts` are thin Supabase calls; the business rules live in the RPCs under `supabase/migrations/`.
- `src/components/ui/DataTable.tsx` is the shared table (search, sort, CSV and PDF export).
- `supabase/tests/harness.mjs` is the PGlite test harness. `e2e/remote.e2e.mjs` is the remote suite, which refuses production.

## Assumptions (edit these before running)

- The staging project is connected: `.env.local` points at it, and `supabase db push` to staging has been done by me. Do **not** `supabase link` or `db push` yourself. Never use production (`fpeniljpqigpeqtsgizr`) for tests.
- Target volumes to design for: 10 offices, 500 vehicles, 300 employees, 50,000 invoices, 500,000 journal lines and 100,000 audit log rows.
- Target browsers: the latest Chrome, Edge, Safari and Firefox, plus mobile Safari and Chrome.
- Language is English only, with the currency and dates of each office as today.

## Phase 0: Baseline on staging

- Do the browser pass that is still open (`AUDIT_REPORT.md`, K.1):
  - the Setup Wizard with two offices;
  - a login as each system role;
  - every page at desktop width and at 375 px.
- Run `npm run test:e2e` against staging.
- Record each defect you find in `docs/ADVANCE_NOTES.md`, with the page, the steps and the severity, and fix it in this phase. A defect fix is not a new feature.
- Measure and record a baseline: Lighthouse scores, bundle sizes, time to first usable screen after sign-in, and the slowest Supabase queries (from the staging dashboard). Generate a staging data set at the target volumes with a script under `scripts/`. Mark it clearly as staging-only, and never point it at production.

## Phase 1: Data layer and performance

- Replace "load everything at sign-in" with on-demand loading per page:
  - Lists use server-side pagination, sorting, filtering and search (`range()`, `order()`, filters, `count: 'exact'` or estimated).
  - DataTable gets a server mode. Behaviour seen by the user stays the same.
  - CSV and PDF export keep exporting the **full filtered** result, fetched in pages, not just the visible page.
- Dashboards and reports aggregate in the database (views or RPCs) instead of in the browser when the browser would need more than one page of rows. The P&L, balance sheet, trial balance, aging and statements must give the same numbers as today. Prove it with tests that compare the old and new results on the same data.
- Add or adjust indexes for every filter and sort the lists use (company_id, date, status, party, vehicle). Check the plans with `explain` in the tests where PGlite allows it.
- Cache per office and page, and invalidate after each write. Realtime (the existing channel) invalidates only what changed, without a full reload. Remove the 500/1,000 row caps by paginating.
- Front end:
  - Split the code further: PDF, charts and the wizard load only when used.
  - Memoise the heavy derived data.
  - Use virtual scrolling for any list that can show more than 200 rows on one screen.
- Targets at the assumed volumes:
  - the first screen is usable in under 2.5 s on a mid-range laptop;
  - a page change in a list takes under 500 ms;
  - no request returns more than 1,000 rows;
  - the main JS bundle is under 250 kB gzip.

## Phase 2: Correctness under concurrency and failure

- **Optimistic locking:** two users editing the same record must not overwrite each other silently. Use an `updated_at` or version check on update; the second save gets a clear "changed by someone else" message with a reload option.
- **Idempotency:** a double click, a retry or a slow network must never create two invoices, payments, expenses, payroll runs or journals. Disable buttons while busy, and add idempotency keys or unique guards in the RPCs where the database does not already prevent duplicates.
- **Session expiry and lost connection:** expired tokens refresh silently, or send the user to sign-in without losing an unsaved form. A visible banner shows when the app is offline or Supabase cannot be reached, and writes are blocked until the connection is back. This is not offline mode.
- **Errors:**
  - Every database error reaches the user as a plain message that names the field or rule, never a raw Postgres message.
  - Map the error codes and messages of the RPCs in one place.
  - Each page has its own error boundary, so one crashing panel does not blank the app.
- **Money and dates:**
  - Every amount is rounded to 3 decimals in one shared helper and shown in the office currency.
  - Every date is handled as a local date, with no UTC off-by-one errors.
  - Add unit tests for these helpers.

## Phase 3: Forms and validation

- One validation approach for every form. Each rule is checked in the browser **and** in the database (constraint, trigger or RPC), and the two give the same message.
- Inline field errors, the first invalid field focused on submit, required fields marked, and correct input types and `inputmode` on mobile (numbers, dates, email, phone).
- A guard on unsaved changes when a form is closed or the user navigates away.
- Consistent behaviour on every modal: Escape, Enter, focus trap and focus return.
- Pickers (vehicle, party, employee, account, bank) are searchable, office-filtered and paged for large lists. They show inactive or blocked items as unavailable instead of hiding them silently.

## Phase 4: Consistent, polished UI

- One design language across all pages:
  - the same spacing, typography, buttons, badges, status colours, empty states, loading skeletons and error states;
  - no page with its own copy of a shared component;
  - remove dead styles and duplicated components.
- Every list has the same toolbar layout: search, filters, office selector, export, primary action. Every detail view has the same header layout: title, status, actions with permission checks, audit trail link.
- Dark and light themes are both correct on every page, if the app supports both today.
- Numbers line up in tables (tabular figures, right-aligned). Long text truncates with a tooltip.
- Every button does something. Check the whole app for dead buttons and placeholders again.

## Phase 5: Accessibility and mobile

- Meet WCAG 2.1 AA:
  - every page can be used by keyboard alone, with focus that is always visible;
  - labels and `aria` attributes on all controls;
  - colour contrast of at least 4.5:1;
  - tables with proper headers;
  - charts with a text or table alternative.
- Run axe (for example `@axe-core/playwright`) on every page, with zero serious or critical issues.
- At 375 px:
  - no horizontal page scroll;
  - tables become cards, or scroll inside their own container;
  - the sidebar becomes a drawer;
  - touch targets are at least 44 px;
  - modals are full screen.
- Respect `prefers-reduced-motion`.

## Phase 6: Security hardening

- Re-audit every table, view, function and storage bucket:
  - RLS is on everywhere;
  - no security-definer function lacks `set search_path` or a permission check;
  - `anon` has no access beyond sign-in;
  - every function grant is the minimum needed.
- Add a test that lists every public function and fails on any that is executable by `authenticated` without a permission check (allow-list the known safe ones).
- **Storage:** file type and size limits are enforced on the server, paths are scoped to the office, and downloads use short-lived signed URLs.
- **Audit log:** every create, update, delete, approve, reject, post, reverse, close and reopen on business data is logged with user, office, time and before/after values. Add a test per module that a write produces an audit row.
- **Content Security Policy** and security headers for the hosting setup. Document them in the README.
- No secrets in the repository or the bundle. Check with a scan.
- Rate-limit or cap the expensive RPCs (imports, reports, bulk generation) by input size.

## Phase 7: Reports, PDFs and exports

- Every printable document and report uses one PDF layout:
  - organization and office branding, document title, filters used, generated by and on, page numbers;
  - repeated table headers and totals;
  - the office currency and number format.
- Invoices, credit and debit notes, payment receipts, payslips and statements look professional and match each other.
- CSV exports follow these rules:
  - UTF-8 with a BOM;
  - formula injection is neutralised (this is already done; keep it);
  - column names are stable;
  - amounts are raw numbers, not formatted strings.
- Large exports show progress and can be cancelled.

## Phase 8: Observability and operations

- Errors in the browser are captured with page, user id (no personal data), office and action. Use the hosting provider's logging or a table such as `client_errors`, with RLS that lets only Super Admins read it. Do not add an external service unless I approve it.
- Health checks on the Settings page for Super Admins:
  - migrations applied;
  - pg_cron jobs present, with their last run;
  - storage bucket limits;
  - the setup checklist.
- Runbooks in `docs/OPERATIONS.md`:
  - deploy to staging, then to production;
  - apply migrations safely;
  - back up and restore (Supabase PITR or dumps);
  - rotate keys;
  - add an office;
  - close a period;
  - roll back a bad release.

## Phase 9: Automated browser tests

- Add Playwright tests against staging (never production), with one signed-in context per role, for the critical flows:
  - Setup Wizard;
  - vehicle and work order;
  - invoice through approval, posting and payment;
  - expense through approval and payment;
  - payroll from generation to payment;
  - leave request and approval;
  - period close;
  - bank reconciliation;
  - every report opening and exporting;
  - cross-office isolation;
  - each role being blocked from what it may not do.
- Run them at desktop width and at 375 px. Add axe checks to the same run.
- Add unit tests (Vitest) for the shared helpers: money, dates, validation, error mapping and the report calculations.
- Add a CI workflow file that runs build, `test:db`, unit tests and lint on every push. The Playwright run is a manual job that needs staging secrets.

## Phase 10: Final verification

- Re-run the Phase 0 measurements at the target volumes, and record the before and after numbers in `AUDIT_REPORT.md`.
- Update `AUDIT_REPORT.md` with a new section: what was improved, what was verified in the browser (with the test that covers it), and anything still open, with a reason.
- Update `README.md` and `docs/OPERATIONS.md`.

## Rules

- **No new features.** Improve only what exists. Anything that would be new goes to "Out of scope" in `docs/ADVANCE_NOTES.md`.
- Behaviour and numbers must stay the same unless they were wrong. If a number changes, say why in the notes and prove it with a test.
- Do not mark an item done unless it is:
  - verified in the browser on staging;
  - covered by a test;
  - permission-checked in the UI and in RLS;
  - office-scoped.
- No fake data, no hard-coded numbers and no dead buttons. The staging data set lives on staging only.
- Never wipe, reseed or test against production (`fpeniljpqigpeqtsgizr`). Do not link or push to any Supabase project yourself.
- Be honest in the final report, and list anything not verified.
- Do not ask before starting the next phase. Ask me only when a decision truly changes the design. Otherwise choose a sensible default and write it down in `docs/ADVANCE_NOTES.md`.
- Each commit message ends with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
