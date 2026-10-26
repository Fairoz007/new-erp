# Agent E: Supabase platform (numbering, bootstrap, security hardening)

Files owned and changed:
- `supabase/migrations/20261026000000_platform.sql` (new)
- `supabase/tests/harness.mjs` (new, shared test harness)
- `supabase/tests/schema.test.mjs` (now uses the harness and runs every other `*.test.mjs`)
- `supabase/tests/20261026000000_platform.test.mjs` (new, 39 checks)
- `supabase/config.toml` (auth settings)
- `src/types/database.ts` (hand-patched; regenerate after the push, see section 8)

## 0. Deployment note (P0 for the coordinator)

The linked project already has `20261026000100` to `000600` applied, and `20261026000000_platform.sql` sorts **before** them. A plain `supabase db push` refuses out-of-order versions. Push with:

```
npx supabase db push --linked --include-all
```

The migration runs in a different order on each kind of database:
- **Remote:** it runs last.
- **Fresh databases** (tests, branches, `db reset`): it runs first.

It works in both orders:
- It never revokes `authenticated` EXECUTE from functions it does not name. The exception is trigger functions, which clients never need.
- It only drops and recreates policies that no other slot recreates.
- It uses `if exists` / `create or replace` throughout.

`20261026000000_platform.test.mjs` replays the remote order: 000000–000200, then 000100–000600, then platform last. It checks that other slots' RPC grants survive (`create_invoice`, `run_depreciation`, `set_user_companies`, ...) and that numbering works.

## 1. Document numbering

All numbers are assigned by `BEFORE INSERT` triggers (`<table>_doc_number` → `trg_assign_doc_number()`, SECURITY DEFINER). The trigger fills the number when the client sends `null`, sends `''`, or omits the column.

| table.column | format | year source | sequence key |
|---|---|---|---|
| vehicles.vehicle_code | VH-001 | – | (company, `VH`) |
| work_orders.work_order_number | WO-YYYY-001 | reported_date | (company, `WO-YYYY`) |
| maintenance_records.record_number | MNT-YYYY-001 | maintenance_date | (company, `MNT-YYYY`); the same key `complete_work_order` uses |
| accidents.accident_number | ACC-YYYY-001 | accident_date | (company, `ACC-YYYY`) |
| expenses.expense_number | EXP-YYYY-0001 | date | (company, `EXP-YYYY`) |
| invoices.invoice_number | PINV / INV / CN-YYYY-0001 | invoice_date | (company, `PINV-YYYY` / `INV-YYYY` / `CN-YYYY`); CN when `is_credit_note` |
| reconciliations.reconciliation_number | REC-YYYY-001 | reconciled_date, else current_date | (company, `REC-YYYY`) |
| fixed_assets.asset_code | FA-001 | – | (company, `FA`) |
| depreciation_runs.batch_number | DEP-YYYY-01 | period | (company, `DEP-YYYY`); same key `run_depreciation` uses |
| employees.employee_code | EMP-001 | – | (company, `EMP`) |
| payroll_runs.payroll_number | PR-YYYY-MM | year / month columns | none (deterministic; unique per company/month) |
| suppliers.supplier_code / customers.customer_code | SUP-001 / CUST-001 | – | `global_doc_sequences` (`SUP`, `CUST`) |

Design details:
- **Concurrency.** Each sequence is a row in `doc_sequences(company_id, prefix)` or `global_doc_sequences(prefix)`. It is incremented with `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`.
  - The row lock serialises concurrent transactions until commit.
  - In READ COMMITTED, the second transaction re-reads the committed value. A racing first insert of a new key waits on the speculative insertion and then updates.
  - Numbers are gap-free except when a transaction rolls back after drawing a number. In that case the rollback also undoes the increment, so there is no gap either.
  - Postgres sequences were rejected because they leave gaps and need `setval` for imports.
  - PGlite is single-connection, so the tests cover sequential, multi-row (5 rows in one statement) and per-company independence. They cannot test two live sessions.
- **Explicit numbers are kept.** If an explicit number matches `<prefix>-<digits>`, the sequence is bumped past it. This covers the legacy import and RPCs that pre-allocate with `next_doc_number`, so automatic numbers never collide later. Example: `VH-040` imported → next is `VH-041`.
- **NOT NULL columns still accept a client-sent null.** BEFORE triggers run before the NOT NULL check (tested).
  - Columns now default to `''`, so regenerated TS `Insert` types make them optional.
  - A `<table>_<col>_not_blank` CHECK prevents `''` or whitespace from ever being stored.
- **`next_doc_number` fixes:**
  - It now raises `Permission denied` (42501) when `auth.uid()` is set and `has_company_access(p_company)` is false. Server-side callers (`auth.uid()` null: service role, cron, SQL editor) are trusted. Calls from SECURITY DEFINER RPCs still see the end user's `auth.uid()`, so those are checked too, correctly.
  - It no longer truncates: `lpad('1000', 3)` = `'100'` made VH-1000 collide with VH-100, and PAY-10000 with PAY-1000.

## 2. Company bootstrap

**Template table.** `account_templates(code pk, name, category, subcategory, description, is_system, active, sort_order)` is a table rather than an immutable function, so settings admins can extend it without a migration.
- RLS: SELECT for every authenticated user; INSERT/UPDATE/DELETE need `has_perm('settings','edit')`; anon has nothing.
- It holds 35 rows:
  - The 28 `INITIAL_CHART_OF_ACCOUNTS` codes (names, categories and subcategories ported; demo balances **not** ported).
  - The codes the posting code needs: 1100 AR control, 1300 input VAT, 2100 output VAT, 4000 default revenue (post_invoice / record_payment); 2040, 2050, 5075 (process_payroll); 5080/1520 (depreciation); 2010, 5000, 1010.

**On company insert.**
- `companies_bootstrap` is an AFTER INSERT trigger. It is SECURITY DEFINER with search_path set, so it bypasses 000600's membership policy. It:
  - seeds the CoA with `_seed_chart_of_accounts` (idempotent, adds missing codes only);
  - inserts `(auth.uid(), new.id)` into `company_members` when a JWT user with a profile exists. G's `guard_company_member` passes because the target is the creator.
- **New column `companies.created_by`** (default `auth.uid()`, immutable via `trg_company_created_by`). `INSERT ... RETURNING` checks the SELECT policy *before* AFTER triggers run, so without it the creator could not read back the office they just created. `companies_select` is now `has_company_access(id) or created_by = auth.uid()`.
- **`seed_chart_of_accounts(p_company)` RPC.** Adds missing template accounts to an existing office (e.g. after the template grows). Needs company access and `accounting:create`.
- Existing offices (0 on remote) are seeded when the migration runs.

**Tested after all migrations:**
- A Company Admin creates an office: RETURNING works, all 35 accounts are present including every required code, the creator is a member and can read the CoA.
- A server-created office gets the CoA but no membership.
- A Viewer cannot create an office.

## 3. Security hardening

| Finding (advisor or review) | Fix |
|---|---|
| `function_search_path_mutable`: trg_touch, storage_company | `alter function ... set search_path = public` |
| `authenticated_security_definer_function_executable` for internal functions | Revoked from public/anon/authenticated: `recalc_invoice_totals`, `recalc_invoice_settlement`, `handle_new_user`, `guard_profile_update`, all my `_` helpers, and **every function returning `trigger`** in public (any slot; EXECUTE is checked at CREATE TRIGGER, not when the trigger fires) |
| anon could execute everything (PUBLIC default) | `revoke execute on all functions in schema public from public, anon` (safe in both orders: no slot grants to anon or relies on PUBLIC) |
| Future objects auto-exposed | `alter default privileges for role postgres`: functions get no EXECUTE for PUBLIC/anon/authenticated, so each later migration must grant explicitly (CONTRACTS already requires it); tables and sequences get nothing for anon; no TRUNCATE/REFERENCES/TRIGGER for authenticated |
| Supabase default grants on tables | anon: all privileges revoked on every table and view. authenticated: TRUNCATE (bypasses RLS), REFERENCES and TRIGGER revoked everywhere; INSERT/UPDATE/DELETE revoked on RPC-only tables (journal_entries, journal_lines, payments, approval_actions, audit_logs, doc_sequences, global_doc_sequences, depreciation_run_items, notifications) |
| `auth_rls_initplan` | approval_requests_insert, profiles_select, profiles_update, members_select, notifications_select, notification_reads_own recreated with `(select auth.uid())` |
| `multiple_permissive_policies` | companies, company_members, approval_rules: FOR ALL split into insert/update/delete. **role_permissions / approval_limits left alone**: 000600_auth recreates `*_write` as FOR ALL (Super Admin only), and adding split policies here would OR-widen G's restriction. G should split theirs to clear the advisor |
| **P1: companies FOR ALL policy was not tenant-scoped.** Every role with companies:edit (Company Admin, Finance Manager, **Fleet Manager**) could SELECT, UPDATE and DELETE every office, including bank_details | update/delete need `has_company_access(id)`; select is access or creator; insert needs companies:create |
| **P1: invoice_lines FOR ALL used the `view` predicate as USING**, so anyone with invoices:view could DELETE lines (USING governs DELETE) | Split: select = view; insert = create or edit on an unposted invoice; update/delete = edit on an unposted invoice. B's `fin_invoice_lines_guard` adds the draft-status rule on top |
| P2: profiles_select's colleague clause joined company_members **under the caller's RLS**, which only shows the caller's own rows, so colleagues were never visible | New DEFINER helper `shares_company_with(uuid)` (granted, used in the policy) |
| P3: identity and permission changes were not audited | `trg_audit` added on profiles, company_members, role_permissions, approval_limits, approval_rules, accounts, account_templates; `entity_id` falls back to user_id/role/module for tables without `id` |

Remaining advisor warnings, accepted and documented: `authenticated_security_definer_function_executable` for the RLS helpers (`app_role`, `is_super_admin`, `has_company_access`, `has_perm`, `can_approve`, `shares_company_with`) and for the RPCs. Policies run as the caller, so the helpers must stay executable. Each RPC re-checks company and permission.

## 4. Function inventory (all migrations applied, PGlite)

"auth" means EXECUTE is granted to `authenticated`. anon has EXECUTE on nothing. Every function has `search_path` set except two in F's slot.

| function | mode | search_path | executable by | verdict |
|---|---|---|---|---|
| app_role, is_super_admin, has_company_access, has_perm, can_approve | DEFINER | set | auth | OK: RLS helpers |
| shares_company_with (E) | DEFINER | set | auth | OK: RLS helper |
| storage_company | invoker | set (fixed) | auth | OK |
| storage_entity, storage_module (F) | invoker | **not set** | auth | **F: add `set search_path = public`** (advisor will flag) |
| media_can_write (F) | DEFINER | set | auth | OK |
| next_doc_number | DEFINER | set | auth | Fixed (access check, no truncation) |
| seed_chart_of_accounts (E) | DEFINER | set | auth | OK |
| post_journal_entry, record_payment, post_invoice, decide_approval, complete_work_order | DEFINER | set | auth | See review (section 5) |
| create_invoice, submit_invoice, replace_invoice_lines, duplicate_invoice, create_credit_note, set_payment_attachment (B) | DEFINER | set | auth | B's |
| run_depreciation, process_payroll (C) | DEFINER | set | auth | C's |
| run_expiry_notifications, storage_orphans (D/F) | DEFINER | set | auth | D/F's |
| mark_all_notifications_read, set_user_companies | invoker | set | auth | OK |
| recalc_invoice_totals, recalc_invoice_settlement, ensure_system_account, fin_insert_lines, fin_submit_invoice, approvers_for_request, refresh_expiry_notifications, _assign_doc_number, _assign_global_doc_number, _seed_chart_of_accounts, _doc_year, _fmt_doc_number | DEFINER/invoker | set | none | OK: internal |
| all 33 trigger functions (trg_*, fin_*_guard, guard_*, handle_new_user, ...) | mixed | set | none | OK |

## 5. Review of existing RPCs (000000–000200)

| # | Sev | Function | Defect | Status / owner |
|---|---|---|---|---|
| 1 | P1 | next_doc_number | No tenancy check: any user could burn any office's numbers | **Fixed (E)** |
| 2 | P1 | next_doc_number | `lpad` truncates past the pad width, causing duplicate numbers at 1000 / 10000 | **Fixed (E)** |
| 3 | P1 | record_payment | Accepted payments on unposted invoices, driving AP/AR negative | Fixed by B (`fin_payments_guard`) |
| 4 | P2 | post_invoice | `other_charges` is in `grand_total` (subledger) but never posted: control is credited `grand_total - other_charges`, so a full payment overdraws AP/AR by other_charges | **Open, B**: post other_charges to an expense/revenue line and credit the control with grand_total |
| 5 | P3 | post_invoice | Does not check approval_status (Cancelled/Rejected invoices can be posted by an approver) | Open, B (mitigated by B's flow) |
| 6 | P3 | record_payment / post_invoice | `select ... for update` runs before the permission check, so any user can row-lock another office's invoice by id | Open, B (minor) |
| 7 | P2 | recalc_invoice_settlement | Counts Draft (unposted) credit notes as credited | Mitigated: B forbids client credit notes; create_credit_note posts immediately |
| 8 | P2 | decide_approval | `required_roles` matched at any level, not per level; requester may approve own request; trusts `approval_requests.amount`, which the client can insert via `approval_requests_insert` | **Open, D**. Downstream re-checks mitigate it (A's `trg_wo_guard` re-checks can_approve on the WO estimate; post_invoice re-checks grand_total). D should drop the client INSERT policy (A and B now raise requests in DEFINER code) or derive amount and roles server-side |
| 9 | P2 | complete_work_order | `p_final_cost` is unbounded against the approved estimate; `next_service_mileage = +10000` hard-coded | Open, A/D |
| 10 | P3 | post_journal_entry | Any accounting:create user can set `p_source` to Payment/Depreciation/... (forged system provenance); balance trigger does not fire on a Draft→Posted status change | Open, C |
| 11 | P3 | trg_journal_immutable | Allows Posted→Void, which silently removes the entry from balances (contradicts "reverse, don't delete") | Open, C |
| 12 | – | payroll_items_all | Same FOR ALL / view-as-USING pattern as invoice_lines | Mitigated: C revoked client writes |

## 6. Gap report: code vs migrations vs remote

- **Remote vs local migrations.** Versions 000000–000200 and 000100–000600 are applied remotely; 20261026000000 is not (see section 0). Remote functions matched the local files at audit time.
- **Services.** All tables and RPCs referenced by the services exist in the migrations: accidents, accounts, approval_*, audit_logs, companies, company_members, customers, depreciation_runs, documents, employees, expenses, fixed_assets, invoices, journal_entries, maintenance_records, notification_reads, notifications, oil_changes, payments, payroll_runs, profiles, reconciliations, role_permissions, suppliers, tyre_events, tyres, vehicles, work_orders, the v_account_balances / v_invoice_aging views, and every RPC called. Services send `null` for every numbered column, consistent with section 1.
- **Not written by any service:**
  - `bank_accounts`: there is no create path, so on an empty DB no payment or payroll can be recorded until someone inserts a bank account. **Coordinator/B.**
  - `vehicle_timeline`: trigger-maintained (A), so this is fine.
- **Empty `approval_rules` on a fresh DB.** No work order or invoice ever requires approval until rules are configured. The localStorage seed had 3 rules (maintenance ≥100 / ≥500, invoice ≥200). **D/coordinator** should decide whether to seed them.
- **CoA semantics:**
  - Bank GL: `bank_accounts.gl_account_code` defaults to `1010` ("Cash on Hand & Petty Cash") while payroll in the old app used `1020` (bank).
  - Duplicate accounts from the seed: AR exists as `1030` (seed) and `1100` (RPCs); VAT as `2020` (seed) and `2100` / `1300` (RPCs).
  - Template descriptions mark the legacy codes. **C/B** should converge on one set (recommend 1100 / 1300 / 2100) and possibly deactivate 1030 / 2020 in the template.
- **Permission matrix** (`role_permissions` seed, ported from AuthContext). Fleet Manager and Finance Manager hold `companies:create/edit/delete`, so they can create offices; now only within their own offices for edit/delete. **G** should decide whether office creation should be Super Admin only.
- **`members_select`.** Kept identical: users-roles viewers and editors see memberships of all offices. P3, **G**: consider scoping to `has_company_access(company_id)`.
- **Performance (P3, optional).** The generic policies call `has_perm(...)` per row. Wrapping as `(select public.has_perm(...))` would make it an initplan. Not done for the 18 generic tables to keep the diff small.

## 7. config.toml (local only) and the matching Dashboard settings

`config.toml` only affects the local stack. Set the same values in Dashboard → Authentication for project `fpeniljpqigpeqtsgizr`:

| Setting | config.toml | Dashboard location |
|---|---|---|
| Disable self sign-up | `[auth] enable_signup = false`, `[auth.email] enable_signup = false` | Authentication → Sign In / Providers → "Allow new users to sign up" **off** (users are invited or created by admins / service role) |
| Anonymous sign-ins | `enable_anonymous_sign_ins = false` (unchanged) | Same page → "Allow anonymous sign-ins" off |
| Minimum password length | `minimum_password_length = 8` | Authentication → Providers → Email → Minimum password length 8 |
| Password requirements | `password_requirements = "lower_upper_letters_digits"` | Email provider → Password requirements |
| Secure password change | `secure_password_change = true` | Email provider → Secure password change on |
| Site URL | `site_url = "http://localhost:5173"` | Authentication → URL Configuration → Site URL (production URL when deployed) |
| Redirect URLs | `additional_redirect_urls = ["http://localhost:5173", "http://127.0.0.1:5173"]` | URL Configuration → Redirect URLs |

Also recommended in the Dashboard:
- Leave email confirmations on for invites.
- Enable leaked-password protection (Pro plan).
- Rate limits stay at their defaults.

## 8. Types (`src/types/database.ts`)

Not regenerated from remote, because the remote does not have this migration yet. Hand-patched to match it:
- The 13 numbered columns are optional in `Insert`.
- `account_templates` table added.
- `companies.created_by` added.
- `seed_chart_of_accounts` and `shares_company_with` added.
- `recalc_*` removed from Functions.

After the coordinator pushes, regenerate:

```
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

`tsc` errors currently present are in other owners' in-progress files (CompaniesPage, NotificationsPage, DocumentUploadZone), not in this file.

## 9. Tests

`npm run test:db` runs `schema.test.mjs`, then spawns every other `supabase/tests/*.test.mjs` as a child process (fresh in-memory DB each, same migrations dir), prints a summary, and exits 1 if any file fails.
- Filter with `TEST_ONLY=platform,finance npm run test:db`.
- New test files can `import { setup, seedFixtures, IDS } from './harness.mjs'`. Standalone files keep working.
- The harness stub now mirrors Supabase's default privileges (anon/authenticated get table and function grants by default), so missing revokes and grants show up in tests.

Results:

| file | result |
|---|---|
| schema.test.mjs | 26/26 |
| 20261026000000_platform.test.mjs | 39/39 |
| 20261026000100_fleet.test.mjs | 17/17 |
| 20261026000200_finance.test.mjs | 80/80 |
| 20261026000300_accounting_hr.test.mjs | 31/31 |
| 20261026000400_system.test.mjs | 16/16 |
| 20261026000500_storage.test.mjs | 29/29 |
| 20261026000600_auth.test.mjs | 29/29 |

Total: 267/267.

Two `schema.test.mjs` expectations were adjusted, and both reflect real Supabase behaviour:
- **"posted journal cannot be deleted" (client).** With default privileges, the attempt is now refused with "permission denied" because I revoked DELETE. Before that, it was a silent 0-row delete.
- **"audit log scoped by company".** The Duqm user now legitimately sees Duqm's own CoA-bootstrap audit rows; the test asserts they see none of Head Office's.

## 10. Rollback

The migration is additive except for the policy replacements. To revert, run as `postgres`. Remote business data is empty, so there is no data risk.

```sql
-- numbering
do $$ declare r record; begin
  for r in select * from (values ('vehicles','vehicle_code'),('work_orders','work_order_number'),('maintenance_records','record_number'),
    ('accidents','accident_number'),('expenses','expense_number'),('invoices','invoice_number'),('reconciliations','reconciliation_number'),
    ('fixed_assets','asset_code'),('depreciation_runs','batch_number'),('employees','employee_code'),('payroll_runs','payroll_number'),
    ('suppliers','supplier_code'),('customers','customer_code')) m(t,c) loop
    execute format('drop trigger if exists %I on public.%I', r.t||'_doc_number', r.t);
    execute format('alter table public.%I alter column %I drop default', r.t, r.c);
    execute format('alter table public.%I drop constraint if exists %I', r.t, r.t||'_'||r.c||'_not_blank');
  end loop; end $$;
-- bootstrap
drop trigger if exists companies_bootstrap on public.companies;
drop trigger if exists companies_created_by on public.companies;
-- policies: re-run the policy sections of 20261025000200_erp_rls.sql for companies, company_members,
-- approval_rules, profiles, approval_requests_insert, notifications, notification_reads, invoice_lines
-- (drop the *_insert/_update/_delete/_select variants created here first), then re-run 20261026000600_auth.sql section 2.
-- grants: grant execute on the revoked functions to authenticated only if required (not recommended).
```

Keep `next_doc_number` (the fixed version is backward compatible), `account_templates`, `global_doc_sequences`, `companies.created_by` and the audit triggers; dropping them is unnecessary. Rolling back the policy changes reopens the companies and invoice_lines holes in section 3.
