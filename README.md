# Fleet & Finance ERP

A multi-office ERP for a bus and fleet operator: fleet, maintenance, clients and suppliers, invoices and payments, expenses, HR and payroll, a full general ledger with financial statements, role-based access, dashboards and reports.

Built with React 18, TypeScript, Vite and Tailwind. Data lives in Supabase (Postgres, Auth, Storage), and every rule is enforced in the database with row-level security and security-definer functions. The browser hides what a role may not use, but it is never the only check.

## Requirements

- Node.js 18 or later (22 recommended)
- A Supabase project for each environment (staging and production), plus the [Supabase CLI](https://supabase.com/docs/guides/cli)

## Local setup

1. Install the dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template, then fill in the project URL and the publishable (anon) key of your **staging** project:

   ```bash
   cp .env.example .env.local
   ```

3. Apply the migrations to the staging project. Link it once, then push:

   ```bash
   supabase link --project-ref <staging-ref>
   ```

   ```bash
   supabase db push
   ```

   Every schema change is a new file under `supabase/migrations/`. Old migrations are never edited.

4. Create your first user. Sign up in the app or in the Supabase dashboard, then make that user Super Admin in the SQL editor:

   ```sql
   update public.profiles set role = 'Super Admin' where email = 'you@example.com';
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

   Sign in. The Setup Wizard opens and walks through these steps:
   - The organization, with its base currency and financial year
   - The offices; each office gets its own chart of accounts
   - Tax rates, payment terms and document numbering
   - Banks
   - Roles and users
   - Opening balances

   The app opens fully once the wizard's checklist passes.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type check and production build |
| `npm run test:db` | Applies every migration to an in-memory Postgres (PGlite) and runs all database suites in `supabase/tests/`: schema, RLS, RPCs, triggers, the client–database contract, and a fresh-install end-to-end run. No network is used. |
| `npm run test:e2e` | Remote suite against a real Supabase **staging** project (Auth, PostgREST, Storage). It refuses to run against production. See `e2e/README.md`. |
| `npm run test:unit` | Vitest: money, dates, validation, error mapping, exports, ledger parity of the report calculations. |
| `npm run test:browser` | Playwright at desktop and 375 px with axe (WCAG 2.1 AA). Signed-out screens run anywhere; the per-role run needs a staging deploy. First run: `npx playwright install chromium`. See `e2e/README.md`. |
| `npm run lint` | Type check and secret scan of the tracked files. |
| `npm run scan:secrets` | Secret scan including `dist/` after a build. |
| `npm run bundle:check` | Bundle sizes; fails above the 250 kB gzip budget for the first page load. |

CI (`.github/workflows/ci.yml`) runs lint, build, bundle budget, secret scan, unit and database tests on every push; the browser suite is a manual job.

To run a single database suite:

```bash
node supabase/tests/20261112001200_e2e_fresh_install.test.mjs supabase/migrations
```

## Daily jobs

When `pg_cron` is enabled on the project, the migrations schedule these jobs (Settings → System health shows their last run):
- `refresh-expiry-notifications` (03:00): vehicle, employee and document expiries, and overdue invoices.
- `daily-finance-jobs` (02:15): monthly recurring expense drafts and budget alerts.
- `purge-client-errors` (02:30): browser error reports older than 90 days.
- `purge-request-keys` (02:45): idempotency keys older than 7 days.

Without `pg_cron`, run them by hand: the expiry refresh from Notifications (Super Admin), and the monthly drafts from Expenses → Monthly. You can also call `refresh_expiry_notifications(null)` and `run_daily_finance_jobs()` from any scheduler with the service role.

## Security headers

The production build puts a Content-Security-Policy `<meta>` tag in `index.html` (`vite.config.ts`):
scripts, styles and fonts from the app's own origin, network calls only to the configured Supabase
project, images from the app and Supabase Storage, no plugins, no framing of other sites. A meta tag
cannot set every header, so the host must also send:

| Header | Value |
|---|---|
| `Content-Security-Policy` | the policy from the built `index.html`, plus `frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

Storage buckets are private (signed URLs, office-scoped paths) with size and type limits that the
browser checks before upload. Details and the deploy steps: `docs/OPERATIONS.md`.

## Concepts

- **One company, shared data:** the app runs one company (one organization with its offices). Data
  is never stored per user. Vehicles, staff, clients, suppliers, invoices, expenses and the ledger
  belong to an office, and every user with access to that office sees the same records, whoever
  entered them. Users are invited by an administrator (the app has no sign-up screen) and get a role
  and either all offices or chosen offices. A deactivated user loses access; the records they
  entered stay. Only a user's own profile, notifications and error reports are personal.
  `supabase/tests/company_data_shared.test.mjs` checks this.
- **Offices:** every record belongs to one office, and each office has its own ledger. A user can hold a different role in each office. RLS scopes every query to the offices the user may see.
- **Roles:** roles are data. They hold a module × action matrix, approval limits, and approval rules for work orders and invoices. Roles can be created, cloned and edited in Users & Roles.
- **Ledger:** invoices, payments, expenses, payroll, depreciation and asset disposal post balanced journals in the database. Closed periods cannot be posted to.
- **Sponsors** (owners) see statement totals only, never journal detail.
- **Offices screen:** after sign-in, a user who can open more than one office lands on Offices: one
  card per office (logo or code badge, address with an Open in Maps link when an address exists, and
  the office figures their role already sees on the dashboard) plus an "All offices" card for users
  with all-office access. A card opens that office. A user with one office goes straight to it.
  Editors open an office in a side panel (Identity, Location, Contact, Registration & tax, Bank).
- **Office access:** each user has either **All offices** (only a Super Admin can give it) or
  **Chosen offices**, with a role per office. Users & Roles → Access overview shows users × offices.
- **Invoice numbers:** sales invoices are `{n}-FT-{yyyy}` (e.g. `447-FT-2026`) in one company-wide
  series with no gaps (a locked series row; a failed save gives its number back). The year comes from
  the invoice date and a new year starts at 1 (open point in `docs/UPGRADE_NOTES.md`). Credit notes,
  purchase bills and other documents keep their own `PREFIX-OFFICE-YEAR-NNNN` formats; opening
  balances use `OB-…`. Formats are in Settings → Universal settings → Document numbering.
- **Printing:** every printed and downloaded document is one formal A4 document on the company
  letterhead (full letterhead image; logo and a Settings footer line on landscape pages), built with
  jsPDF and loaded only when needed. **Print prints the same pages as Download PDF** (the PDF is
  printed from a hidden frame; where the browser cannot, it is downloaded and the app says so).
  - Every document: title and number (or report period, `As of <date>`) top right,
    `<number or report> · Page x of y` on every page, the table header repeated, rows never split.
  - Invoices, credit and debit notes, purchase bills: party and facts, lines, totals, amount in words
    in Rials and Baisa, bank details, signature and stamp. File `<number>.pdf`.
  - Lists and reports (every table's Export → PDF and Document view, Reports → Print Report): page 1
    names the office, period, filters and who generated it; portrait, smaller type for wide tables
    (not below 6.5 pt), landscape above 10 columns. File `<Report>_<office>_<from>_<to>.pdf`.
  - Profit & loss, balance sheet, cash flow, trial balance, general ledger: section rows, totals,
    "Prepared by" and "Approved by". The general ledger PDF fetches every line first.
  - Statement of account (Reports → Client / Supplier statement, General Ledger sub-ledgers):
    opening, movements with the running balance, closing. File `Statement_<party>_<date>.pdf`.
    Pending bills (PDF) gives the bill-wise open invoices.
  - Receipt / payment voucher from a payment (`<payment number>.pdf`) and payslip
    (`Payslip_<code>_<yyyy-mm>.pdf`, bank account shown as its last 4 characters only).
  - Company details come from Settings; nothing is typed into the code. CSV exports are unchanged.
  - Details and checks: `docs/A4_PDF_NOTES.md`.

## Documents

- `AUDIT_REPORT.md`: audit findings, what was fixed, what was verified and what is still open.
- `docs/PHASE_NOTES.md`: the defaults chosen in each phase and the items not verified.
- `docs/FIX_AND_COMPLETE_PROMPT.md`: the brief.
- `docs/UI_INSPECTION_PROMPT.md`: one-pass brief to inspect every screen and fix or remove controls that do nothing.
- `docs/A4_PDF_PROMPT.md` and `docs/A4_PDF_NOTES.md`: the A4 letterhead format brief for every printed and downloaded document, and per stage what changed and what was checked.
- `docs/UPGRADE_PROMPT.md` and `docs/UPGRADE_NOTES.md`: the UI, offices and invoice upgrade brief, and per stage what changed, what was decided and what is not verified.
- `docs/ADVANCE_PROMPT.md` and `docs/ADVANCE_NOTES.md`: the production-hardening brief, and per phase what changed, how it was tested, the defaults chosen and what is not verified.
- `docs/OPERATIONS.md`: deploy, migrations, backup and restore, key rotation, adding an office, closing a period, rollback, errors and health.
