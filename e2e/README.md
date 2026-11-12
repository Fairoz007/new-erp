# Remote end-to-end suite

`e2e/remote.e2e.mjs` exercises the **real** Supabase stack (Auth, PostgREST, RLS, Storage) with
one signed-in client per role. The PGlite tests (`npm run test:db`) cover SQL logic; this suite
covers what PGlite cannot: JWT/Auth, PostgREST grants, the Storage API and bucket limits.

Run it only after the remote database has been brought in sync with `supabase/migrations/*.sql`
(including `20261026000000_platform.sql`, see `docs/audit/agent-E.md` section 0). On an
out-of-sync project the numbering and bootstrap tests fail, which is the point.

## Prerequisites
- Node 18+ (global `fetch`), `npm install` done (uses `@supabase/supabase-js`).
- Remote migrations applied. Self sign-up may stay disabled: users are created with the admin API.

## Environment variables (all required, environment only)
| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://<staging-ref>.supabase.co` (the script refuses the production project) |
| `SUPABASE_ANON_KEY` | publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role (secret) key, used only for setup, teardown and re-reading the truth |
| `E2E_CONFIRM` | must be exactly the staging project ref |

Getting the service-role key without committing it: Dashboard, Project Settings, API Keys,
the `service_role` secret key, Reveal and copy. Set it in your shell only:

```bash
export SUPABASE_URL=https://<staging-ref>.supabase.co
export SUPABASE_ANON_KEY=...            # publishable key
export SUPABASE_SERVICE_ROLE_KEY=...    # secret key
export E2E_CONFIRM=<staging-ref>
```
PowerShell: `$env:SUPABASE_SERVICE_ROLE_KEY = '...'`.

Never put the key in `.env`, `.env.local`, a `VITE_`/`NEXT_PUBLIC_` variable (those ship to the
browser) or any tracked file. `.gitignore` ignores `.env` and `.env.*` (except `.env.example`).
The script never reads dotenv files and never prints keys or the generated passwords (all output
is redacted). Rotate the service-role key if it ever leaks.

## Safety guard
The script refuses to run (exit 2) against the production project (`fpeniljpqigpeqtsgizr`), and unless
`E2E_CONFIRM` equals the project ref in `SUPABASE_URL`. It also refuses identical anon and service keys.

## Running
```bash
node e2e/remote.e2e.mjs --help
node e2e/remote.e2e.mjs --dry-run   # validates config + prints the plan; NO network calls
npm run test:e2e                    # real run
```
Exit codes: 0 pass (skips allowed), 1 any failure, 2 configuration error.

## What it creates
Everything is tagged with the run id `e2e-<timestamp>`:
- Offices `E2E e2e-<ts> Office A/B` (and `Office C`, created by the Super Admin bootstrap test).
- Users `e2e+<runid>-{sa,cadmin,fm,acc,view,b}@example.test` with random passwords (memory only).
- A supplier, a bank account, a temporary maintenance approval rule (threshold 7777, Super Admin),
  vehicles, an expense, a work order and its maintenance record, an invoice, a payment, a credit
  note, an employee, a payroll run, a fixed asset, a depreciation run, notifications, a documents
  row, and storage objects under `<officeId>/...` in `documents` and `media`.

## Teardown and what is left behind
Teardown always runs (`finally`). It removes storage objects, then tries to delete tagged rows in
dependency order, the temporary rule, the supplier, the offices and the auth users. Posted journals,
payments, invoices and audit logs are **immutable by design** (triggers / revoked privileges), so
those rows, the offices that own them, and possibly users referenced by them, usually remain. The
summary lists every step that could not be undone; leftovers are identifiable by the
`E2E e2e-<ts>` names and `e2e+...@example.test` emails and disappear when the dev database is reset.

The approval rule exists only for the duration of the run, but while it exists it affects any
maintenance work order of 7777 OMR or more created by someone else. Run on a quiet dev project.

---

# Browser suite (Playwright + axe)

`npm run test:browser` runs `e2e/browser/*.spec.ts` at desktop (1280 px) and phone (375 px) width.

| Spec | Runs | Checks |
|---|---|---|
| `signed-out.spec.ts` | always (locally it builds the app against an unreachable placeholder database) | sign-in page: axe WCAG 2.1 AA with no serious or critical issues, no horizontal scroll, Tab order, 44 px touch targets at 375 px, no endless animation with reduced motion |
| `roles.spec.ts` | only with the staging variables below | signs in once per role and opens every page in that role's sidebar: axe, no horizontal scroll, 44 px touch targets at 375 px, no uncaught errors |

Staging variables (environment or CI secrets only, never in a file):

| Variable | Value |
|---|---|
| `E2E_BASE_URL` | URL of the staging deploy of this app |
| `E2E_CONFIRM` | the staging project ref; the run stops if the app calls any other Supabase project, and it refuses `fpeniljpqigpeqtsgizr` |
| `E2E_USERS` | `{"Super Admin": {"email": "…", "password": "…"}, "Accountant": {…}, …}` one test user per role |

First run on a machine: `npx playwright install chromium`. In CI the suite is the manual
`browser` job of `.github/workflows/ci.yml` (Actions → CI → Run workflow).
