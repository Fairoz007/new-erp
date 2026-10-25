# Audit coordination contract (read before editing anything)

Supabase project `fpeniljpqigpeqtsgizr` (dev: 0 auth users, 0 business rows at baseline, 2026-10-25).
Baseline: `tsc` pass, `vite build` pass, `npm run test:db` 26/26. Remote migrations 000000/000100/000200 applied.

## Goal of this pass
Move every module off `localStorage` (`FleetContext` + `initialSeedData`) onto Supabase:
real auth, RLS-enforced reads/writes, RPCs for multi-row/financial operations, Storage for files.

## File ownership (only the owner edits a file; ask the coordinator for anything else)

| Owner | Files |
|---|---|
| Coordinator | `src/context/FleetContext.tsx`, `src/components/common/QuickActionModals.tsx`, `src/services/core.ts`, `src/App.tsx` (except the auth gate, see G), `docs/audit/CONTRACTS.md`, remote `db push` |
| A Fleet ops | `src/services/fleet.ts`, pages: companies, vehicles (+detail), maintenance, work-orders, oil-management, tyre-management, accidents, expenses, profitability. Migration slot `20261026000100_fleet.sql` |
| B AR/AP | `src/services/finance.ts`, pages: suppliers, customers, invoices, payments, reconciliation; `PrintableInvoiceModal.tsx`. Migration slot `20261026000200_finance.sql` |
| C Accounting/HR | `src/services/accounting.ts`, `src/services/hr.ts`, pages: accounting (+FinanceOverview), trial-balance, general-ledger, profit-loss, balance-sheet, depreciation, fixed-assets (AssetModulePage), payroll; `PrintablePayslipModal.tsx`. Migration slot `20261026000300_accounting_hr.sql` |
| D System | `src/services/system.ts`, pages: dashboard, approvals, notifications, audit-logs, reports, settings; `NotificationDrawer.tsx`, `GlobalSearchModal.tsx`, `components/dashboard/*`, `components/charts/*`. Migration slot `20261026000400_system.sql` |
| E DB architect | `20261026000000_platform.sql` (numbering triggers, company bootstrap, security hardening), `supabase/tests/*`, `supabase/config.toml`, `src/types/database.ts` (regen) |
| F Storage | `src/services/storage.ts`, `src/services/documents.ts`, `DocumentsPage.tsx`, `DocumentUploadZone.tsx`, `DocumentViewerModal.tsx`. Migration slot `20261026000500_storage.sql` |
| G Auth/Security | `src/context/AuthContext.tsx`, `src/pages/auth/*` (new LoginPage), `src/pages/users-roles/*`, `components/layout/*` (Header/Sidebar/AppLayout), `src/main.tsx`, auth gate in `App.tsx` (coordinator applies it), `src/services/auth.ts`. Migration slot `20261026000600_auth.sql` |

Shared UI components in `src/components/ui/*` and `src/utils/*`: do not change existing exports; add new ones only if needed and say so in your report.

## Service-layer conventions (`src/services/core.ts`)
1. Every function is `async` and throws `ServiceError` on failure (`unwrap`, `unwrapOne`, `rpcAny`). Never return fake success, never turn an error into `[]`.
2. Map DB rows to the existing app types (`src/types/*`) with explicit `rowToX` / `xToRow` mappers. Keep copied display fields (e.g. `vehiclePlate`, `supplierName`) populated by PostgREST embedding, e.g. `select('*, vehicle:vehicles(plate_number)')`.
3. Use `num()` for every numeric column (PostgREST returns numerics as strings). Never compute stored money in JS when the DB computes it (generated columns, triggers, views).
4. For every FleetContext mutation you own, export a function **with the same name and the same parameters**, returning `Promise<SameReturnType>`. Example: `export async function addVehicle(data: Omit<Vehicle,'id'|'createdAt'|'updatedAt'>): Promise<Vehicle>`.
5. Export `fetchers: Fetchers` (one loader per collection you own) and `affects: Record<string, CollectionKey[]>` listing the collections each mutation changes (the coordinator re-fetches those after the call).
6. Pure derived calculations that FleetContext does today (trial balance, GL, P&L, vehicle financial summary, ...) move into your service file as pure functions taking the loaded collections as arguments, same return types.
7. Don't write `audit_logs` from the client: triggers do it. Don't invent IDs or document numbers on the client: the DB assigns them (see E's numbering triggers below).
8. Company scope: every company-owned insert must send `company_id`. RLS does the filtering on reads; the selected office filter in the UI stays client-side.

## Page conventions
- Treat every FleetContext mutation as async: `try { await addX(...); showToast(success) } catch (e) { showToast((e as Error).message, 'error') }`. Show success only after the await. Disable the submit button while pending (prevents double submits).
- Empty data shows a truthful empty state, never seeded/fabricated rows or numbers.
- Remove hard-coded business numbers (fake trends, fake percentages). If a metric can't be computed from real data, remove it or label it clearly.

## Database numbering contract (implemented by E in `20261026000000_platform.sql`)
BEFORE INSERT triggers fill these when the column is null or '' (clients send null):

| table.column | format |
|---|---|
| vehicles.vehicle_code | `VH-001` (per company) |
| work_orders.work_order_number | `WO-YYYY-001` |
| maintenance_records.record_number | `MNT-YYYY-001` |
| accidents.accident_number | `ACC-YYYY-001` |
| expenses.expense_number | `EXP-YYYY-0001` |
| invoices.invoice_number | Purchase `PINV-YYYY-0001`, Sales `INV-YYYY-0001`, credit note `CN-YYYY-0001` |
| reconciliations.reconciliation_number | `REC-YYYY-001` |
| fixed_assets.asset_code | `FA-001` |
| depreciation_runs.batch_number | `DEP-YYYY-01` |
| employees.employee_code | `EMP-001` |
| payroll_runs.payroll_number | `PR-YYYY-MM` |
| suppliers.supplier_code / customers.customer_code | `SUP-001` / `CUST-001` (global sequence) |

Also from E: inserting a company seeds its chart of accounts from a template and adds the creator to `company_members`.
`next_doc_number` stays callable but checks `has_company_access`.

## Migrations
- Only write SQL in your own slot file. Additive changes only (no drops of existing data/columns without coordinator approval).
- `CREATE OR REPLACE FUNCTION` for RPCs; every `SECURITY DEFINER` function sets `search_path = public` and re-checks `has_company_access(...)` + `has_perm(...)`; grant execute to `authenticated` only.
- Run `npm run test:db` (PGlite) after editing; add tests for your RPCs in `supabase/tests/` as a separate file `supabase/tests/<slot>.test.mjs` if E's runner supports it (E documents how).
- Never run `supabase db push`, `db reset --linked` or any write against the remote project. The coordinator pushes.

## Reporting
Write your findings to `docs/audit/agent-<letter>.md`: module inventory (route, components, actions table: control → expected behaviour → backend op → tables → auth → status), issues (severity P0–P3, status), dummy data found and what you did, and anything you need from another owner.
