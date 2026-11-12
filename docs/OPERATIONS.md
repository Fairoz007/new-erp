# Operations runbooks

How to deploy, change the database, back up, rotate keys and recover. Every step that touches a
Supabase project is run by a person with access to that project; nothing in this repository
connects to a project on its own.

| Environment | Supabase project | Used for |
|---|---|---|
| Staging | your staging ref | every change is applied and tested here first; the volume data set (`scripts/staging/volume-seed.sql`) lives here only |
| Production | `fpeniljpqigpeqtsgizr` | in development until go-live: data cleared on 2026-11-12 at the owner's request (accounts kept). After go-live: never seeded, wiped or used for tests |

---

## 1. Deploy (staging first, then production)

1. On a clean checkout of the release commit run the checks. All must pass:

   ```bash
   npm ci
   ```

   ```bash
   npm run build
   ```

   ```bash
   npm run test:db
   ```

   ```bash
   npm run test:unit
   ```

   ```bash
   npm run scan:secrets
   ```

   ```bash
   npm run bundle:check
   ```

2. Apply the new migrations to **staging** (section 2), then build with the staging URL and key in
   `.env.local` and deploy `dist/` to the staging host.
3. On staging: run `npm run test:e2e` and the Playwright suite (`npm run test:browser`, needs the
   staging secrets in `e2e/.env`), sign in once per role, and open Settings → System health.
4. Apply the same migrations to **production** (section 2).
5. Build with the production URL and publishable key and deploy `dist/` to the production host.
   Set `VITE_APP_VERSION` to the commit hash so error reports show the release.
6. Open the app, sign in as a Super Admin and check Settings → System health (latest migration,
   jobs, buckets, no new client errors).

### Hosting headers

The build puts a Content-Security-Policy `<meta>` tag in `index.html` (see `vite.config.ts`):
scripts only from the app's own origin, network calls only to the configured Supabase project.
A `<meta>` tag cannot set everything, so configure these response headers on the host as well:

| Header | Value |
|---|---|
| `Content-Security-Policy` | the same policy as the meta tag, plus `frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Cache-Control` | `no-cache` for `index.html`; `public, max-age=31536000, immutable` for `/assets/*` |

Serve `index.html` for unknown paths only if the host needs it (the app does not use URL routes).

## 2. Apply migrations safely

1. Read every new file in `supabase/migrations/` since the last release. Old migrations are never
   edited; each change is a new file.
2. Take a backup point (section 3) of the target project.
3. Link the CLI to the target project and apply. Check the ref twice before pushing:

   ```bash
   supabase link --project-ref <ref>
   ```

   ```bash
   supabase db push
   ```

   Without Docker (`db dump` needs it), take the backup point with
   `node scripts/release/export-data.mjs backups/<name>` and rehearse the push on a copy of the
   data first: `node scripts/release/rehearse-push.mjs backups/<name> <latest applied version>`
   (applies the pending migrations to the real rows in PGlite and prints what changed).

4. Check in the SQL editor:

   ```sql
   select version from supabase_migrations.schema_migrations order by version desc limit 5;
   ```

5. Index migrations use `create index if not exists`. On a large production table, if a lock
   would block users for too long, run the index statement by hand first with
   `create index concurrently` (outside a transaction), then push; the migration then skips it.
6. If a migration fails half way, `db push` stops at that file. Fix forward with a new migration;
   do not edit the failed file once it has run anywhere.

## 3. Back up and restore

- **Point-in-time recovery (PITR):** enable it on production (Project settings → Add-ons). A
  restore creates the project state at a chosen second; use it for "a bad migration or bulk
  change happened at 14:32".
- **Daily backups** are kept by Supabase on paid plans (Database → Backups).
- **Logical dump** before risky changes, kept outside Supabase:

  ```bash
  supabase db dump --project-ref <ref> -f backup-$(date +%Y%m%d).sql
  ```

  ```bash
  supabase db dump --project-ref <ref> --data-only -f data-$(date +%Y%m%d).sql
  ```

- **Storage files** (receipts, bills, documents) are not in the database dump. Copy the
  `documents` bucket with the Storage API or the dashboard before a restore that must include them.
- **Restore test:** at least once a quarter restore the latest dump into staging (never into
  production), sign in and compare the trial balance of one office with production.

## 4. Rotate keys

1. Supabase dashboard → Project settings → API keys: create a new publishable key (or roll the
   anon JWT secret, which signs users out).
2. Update `VITE_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` on the host, rebuild
   and deploy.
3. Rotate the secret / service-role key used by Edge Functions (`supabase/functions/invite-user`)
   and any scheduler: `supabase secrets set …`, then redeploy the function.
4. Revoke the old keys once the new build is live. Run `npm run scan:secrets` to confirm no key
   was committed.

## 5. Add an office

1. Sign in as a Super Admin (or a role with `companies:create`).
2. Offices → Add office. The database seeds the new office's chart of accounts
   (`companies_bootstrap`), numbering and defaults.
3. Add a bank account for the office, then give users access in Users & Roles (a role per office).
4. Enter opening balances, if the office has history, with a manual journal dated the day before
   go-live.
5. Check the office in the trial balance (it must balance) and in the office selector.

## 6. Close a period

1. Finance → Period close, choose the office, year and month.
2. Clear the checklist the page shows: unposted drafts, pending approvals, unreconciled bank lines,
   depreciation run for the month, payroll posted.
3. Close. Postings dated in a closed period are refused by the database (`close_period`).
4. To correct a closed month, a user with the reopen permission reopens it with a reason
   (`reopen_period`); the reason and user are in the audit log. Close it again afterwards.

## 7. Roll back a bad release

- **Front end only:** redeploy the previous `dist/` build (keep the last three builds on the host,
  or rebuild the previous commit). The database is backward compatible within a release, because
  migrations only add.
- **Migration problem:** do not edit the migration. Write a new migration that reverses the change
  (drop the new function or view, restore the old definition from the previous migration file),
  apply it to staging, test, then production.
- **Data damaged:** restore with PITR to just before the change into a **new** project, export
  the affected rows, and import them into production with a reviewed SQL script.
- Record what happened and the fix in `AUDIT_REPORT.md`.

## 8. Errors and health

- Browser crashes and unhandled errors are stored in `public.client_errors` (page, message, stack,
  browser, release; no form contents). Only Super Admins can read them:

  ```sql
  select occurred_at, page, kind, message, app_version from public.client_errors order by occurred_at desc limit 50;
  ```

- Reports older than 90 days are purged by the `purge-client-errors` job (pg_cron), or by calling
  `select public.purge_client_errors(90);`.
- `public.app_health()` (signed-in users) answers `{"ok": true, …}` when the database is reachable.
  Signed-out callers get nothing beyond sign-in, so an uptime monitor should check the host URL and
  the Supabase status page instead.
- `public.system_health()` (Super Admin) lists migrations applied, pg_cron jobs with their last run,
  storage bucket limits and error counts. Settings → System health shows it.

## 9. Daily jobs

| Job | Schedule | What it does |
|---|---|---|
| `refresh-expiry-notifications` | 03:00 | vehicle, employee and document expiries; overdue invoices |
| `daily-finance-jobs` | 02:15 | monthly recurring expense drafts; budget alerts |
| `purge-client-errors` | 02:30 | deletes error reports older than 90 days |
| `purge-request-keys` | 02:45 | deletes idempotency keys older than 7 days |

Without pg_cron, call the functions from any scheduler with the service role.
