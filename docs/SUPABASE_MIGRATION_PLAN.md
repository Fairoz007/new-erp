# Supabase Schema, RLS, Auth & Migration Plan

**Project:** `fpeniljpqigpeqtsgizr`. **Status:** the migrations are written and tested locally (`npm run test:db`, 26/26 pass). **Nothing has been applied to the remote database yet.**

| File | Contents |
|---|---|
| `supabase/migrations/20261025000000_erp_core_schema.sql` | Tables, constraints, auth helpers, document numbering |
| `supabase/migrations/20261025000100_erp_logic.sql` | Derived totals, double-entry enforcement, RPCs, reporting views, audit triggers |
| `supabase/migrations/20261025000200_erp_rls.sql` | RLS on every table, grants, permission-matrix seed, storage bucket |
| `supabase/tests/schema.test.mjs` | Runs all migrations in PGlite and checks integrity and RLS behaviour |

---

## 1. Schema design

### How the 27 localStorage collections map to tables

| FleetContext collection | Table(s) | Notes |
|---|---|---|
| companies | `companies` | |
| (AuthContext users) | `profiles` + `company_members` | One row per `auth.users`. Membership decides which offices a user sees. |
| vehicles | `vehicles` | purchase, depreciation and oil config are kept as `jsonb` |
| tyres, tyreEvents | `tyres`, `tyre_events` | |
| oilChanges | `oil_changes` | |
| workOrders | `work_orders` | A CHECK constraint stops a work order being Completed unless it was Approved |
| maintenanceRecords | `maintenance_records` | `work_order_id UNIQUE` allows at most one record per work order |
| accidents | `accidents` | `net_cost_to_company` is a generated column |
| expenses | `expenses` | |
| documents | `documents` + Storage bucket `documents` | Files move out of localStorage data URLs into Storage |
| timeline | `vehicle_timeline` | |
| suppliers, customers | `suppliers`, `customers` | Shared across the group (no `company_id`). Balances come from a view. |
| invoices | `invoices` + `invoice_lines` | Totals are computed from the lines. Line amounts are generated columns. |
| payments | `payments` | Written only through `record_payment()` |
| reconciliations | `reconciliations` | |
| bankAccounts | `bank_accounts` | Balance comes from `v_bank_balances` |
| chartOfAccounts | `accounts` | Now **per company**, keyed on (company, code) |
| journalEntries | `journal_entries` + `journal_lines` | Debits must equal credits (checked when the transaction commits). Posted entries cannot be changed. |
| fixedAssets | `fixed_assets` | Book value is generated. Depreciation can never take an asset below its salvage value. |
| depreciationRuns | `depreciation_runs` + `depreciation_run_items` | `UNIQUE(company, period)` |
| employees | `employees` | Gross salary is a generated column |
| payrollRuns | `payroll_runs` + `payroll_items` | `UNIQUE(company, year, month)`. Gross, deductions and net are generated. |
| approvalRules | `approval_rules` | |
| approvalRequests | `approval_requests` + `approval_actions` | History is normalised. A comment is required. |
| notifications | `notifications` + `notification_reads` | Read state is tracked per user |
| auditLogs | `audit_logs` | Append-only, written by triggers |
| (new) | `role_permissions`, `approval_limits`, `doc_sequences` | |

### Design rules
- **The database is the source of truth for every balance.** Invoice outstanding, bank, party (supplier/customer) and GL account balances are calculated in the database, either as generated columns, by triggers, or through `v_*` views. The client can no longer drift out of sync. In the current app, overpayments and the subledger had drifted.
- **Ledger writes are atomic RPCs.** These are `record_payment`, `post_invoice`, `post_journal_entry`, `complete_work_order` and `decide_approval`. Clients cannot insert into `payments`, `journal_*` or `approval_actions` directly.
- **This closes the audit's open P1 gaps.** Payments and invoices now post to the GL. The chart of accounts is per company. AP aging is real (`v_invoice_aging`). Approvals are checked on the server.
- **Document numbers** come from `next_doc_number(company, prefix)`, which locks a row, so two users can't get the same number.
- **`legacy_id`** on every imported table keeps the old string id, such as `veh-17…`, so the one-time import can remap foreign keys.

---

## 2. Auth design

1. **Supabase Auth with email and password. Turn off self-signup** in Dashboard → Authentication → Providers. Admins invite users instead.
2. Every new auth user gets a `profiles` row (trigger `on_auth_user_created`) with the role **Viewer**.
3. **Roles live in `profiles.role`, not in `user_metadata`.** Users can edit their own `user_metadata`, so it can't be trusted for roles. A trigger blocks role or status changes unless the caller has `users-roles:edit`, or is running server-side (SQL editor or service role).
4. **Office access comes from `company_members`.** A Super Admin sees every office.
5. **The permission matrix is the `role_permissions` table**, seeded as a direct port of `AuthContext.canAccessPage` and `hasPermission`. `approval_limits` mirrors `canApprove` (Fleet Manager up to 500 for maintenance, Accountant up to 500 for invoices).
   - The frontend should read these tables instead of keeping its own copy. That also fixes the Users & Roles page not matching the real rules.
6. **RLS helpers:** `has_company_access(cid)`, `has_perm(module, action)` and `can_approve(module, amount)`. They are `SECURITY DEFINER` and read `auth.uid()`.
7. **RLS on all tables.** The rule is: you can see a row if you belong to its company and your role allows `view` on its module, and the same pattern applies to create, edit and delete. `anon` has no access at all.
8. **Storage:** a private `documents` bucket that accepts PDF, PNG and JPEG up to 10 MB. File paths start with `<company_id>/`, and the RLS rules check that prefix.

**Bootstrap the first admin.** Invite yourself from the Dashboard, then run this in the SQL editor:
```sql
update profiles set role = 'Super Admin' where email = 'you@example.com';
```

---

## 3. Step-by-step migration from FleetContext/localStorage

Each phase ships on its own and can be rolled back. The localStorage path stays available behind a flag until phase 6.

### Phase 0: Apply the schema (needs your go-ahead; it changes the remote database)
```bash
npx supabase login
npx supabase link --project-ref fpeniljpqigpeqtsgizr
npx supabase db push
npx supabase gen types typescript --linked > src/types/database.ts
```
Then turn off self-signup and invite the first users.

### Phase 1: Add a data-access layer (no visible change)
- Create `src/data/repositories/*.ts`, one file per domain (fleet, finance, hr, system). Each exposes the same functions FleetContext has today, as `async` functions.
- Write two implementations: `localRepo` (wraps the current state and localStorage) and `supabaseRepo` (uses `supabase.from(...)` and `.rpc(...)`).
- Choose between them with `VITE_DATA_SOURCE=local|supabase`. FleetContext keeps its API but calls the repo. Pages don't change yet, apart from `await` and showing errors as toasts.

### Phase 2: Real login
- Add a `LoginPage`. `AuthContext` uses `supabase.auth.onAuthStateChange`, then loads the user's `profiles` row, `company_members` and `role_permissions`.
- `hasPermission` and `canAccessPage` read the loaded permission matrix. **Remove the header role switcher**, or limit it to Super Admin "view as".
- The client checks stay as UX only; RLS does the real enforcement.

### Phase 3: Import existing data (one time)
- Write a Node script, `scripts/import-localstorage.mjs`. It reads an export from Settings → Export JSON.
  - It uses the **service-role key from a local environment variable. That key must never go in `.env.local` or the client bundle.**
- It inserts rows in dependency order: companies → accounts and bank accounts → suppliers and customers → vehicles → operations → invoices and lines → journals → payments → payroll → documents. String ids map to UUIDs through `legacy_id`.
- Seed data such as `inv-1` gets UUIDs, and the import rebuilds the foreign keys.
- After the import, check:
  - row counts match, collection by collection
  - every journal balances
  - `v_party_balances` matches the old supplier and customer balances
- **Decision needed:** historic payments and invoices never had GL entries. You can either back-post them with `post_invoice` and opening journals, or start the GL from an opening-balance entry dated at go-live.

### Phase 4: Move modules over, lowest risk first
| Order | Modules | Notes |
|---|---|---|
| 4a | Companies, suppliers, customers, documents (+ Storage upload) | Simple CRUD. Proves the RLS and Storage paths work. |
| 4b | Vehicles, tyres, oil, accidents, expenses, timeline | Use PostgREST embedding (`select('*, vehicles(plate_number)')`) instead of the old copied plate/name fields |
| 4c | Work orders, maintenance, approvals | Use `complete_work_order` and `decide_approval` |
| 4d | Invoices, payments, reconciliation | Use `post_invoice` and `record_payment`. Read balances from the views. |
| 4e | Accounting, trial balance, GL, P&L, balance sheet | Rebuild the report functions on `v_account_balances`, filtered by company |
| 4f | Fixed assets, depreciation, payroll | Add `run_depreciation(company, period)` and `process_payroll(company, year, month)` RPCs, following the same pattern as `record_payment` |
| 4g | Notifications, audit logs, reports | Read audit logs from `audit_logs` and delete the client-side `logAudit` |

For each module: switch the repo → run `npm run test:db` → click through the module as at least Super Admin, an office-limited Fleet Manager and a Viewer → check the browser console and network tab.

### Phase 5: Realtime and freshness
- Subscribe to `postgres_changes` filtered by `company_id` for work orders, approvals and notifications.
- Elsewhere, reload data when the user switches office or the window regains focus.

### Phase 6: Remove localStorage
- Delete `localRepo`, `STORAGE_KEY` persistence, `importDataJSON` and `exportAllDataJSON`. Replace backups with Supabase PITR and backups.
- Keep `initialSeedData.ts` only as a seed for local development (`supabase/seed.sql`).

### Risks
- **Async everywhere.** Every mutation becomes a promise that can fail, so all ~60 call sites need loading states and error toasts. The repo layer contains this.
- **Copied fields.** Pages read `vehiclePlate`, `supplierName` and similar fields straight from records today. Use joins or views, or the pages will show blanks.
- **Rounding.** OMR uses 3 decimal places. Every amount is `numeric(14,3)`. Don't use JavaScript float sums for anything that gets stored.
- **Tests are local only.** The tests run against PGlite with a stubbed `auth` and `storage`. After `db push`, repeat the RLS checks against the real project with three test users.
