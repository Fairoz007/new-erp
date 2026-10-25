# Agent D report: System and cross-cutting modules

Scope: D1 Dashboard, D2 Approvals, D3 Notifications (page + drawer), D4 Audit Logs, D5 Reports, D6 Settings, plus GlobalSearchModal.
Verification: `npx tsc --noEmit` shows one error from my files (see "Expected tsc errors"); my DB tests 16/16 pass against all current migrations (000000-000600 slots present at run time). `npm run test:db` currently fails to start because `supabase/tests/schema.test.mjs` has a syntax error at line 142 (Agent E is editing it); not my file.

## Files changed / added

| File | Change |
|---|---|
| `src/services/system.ts` | new: mappers, fetchers, `processApproval`, `markNotificationAsRead`, `markAllNotificationsAsRead`, `refreshExpiryNotifications`, `fetchInvoiceAging`, `affects` |
| `supabase/migrations/20261026000400_system.sql` | new (additive, see below) |
| `supabase/tests/20261026000400_system.test.mjs` | new, 16 checks |
| `src/pages/{dashboard,approvals,notifications,audit-logs,reports,settings}/*` | rewritten / fixed |
| `src/components/common/NotificationDrawer.tsx` | async handlers, navigation priority, truthful empty state |
| `src/components/charts/DashboardCharts.tsx` | all charts now computed from data (props) |
| `src/components/dashboard/RightAnalyticsColumn.tsx` | removed fake shift timer, fixed cost allocation segment |
| `src/utils/export.ts` | CSV formula-injection fix (`csvSafeCell`, new export; existing exports unchanged) |
| `GlobalSearchModal.tsx` | audited, no change needed (searches only the already-loaded, RLS-filtered collections; no fabricated results) |

## Migration `20261026000400_system.sql` (additive)

- `notifications.dedupe_key` + unique partial index `(company_id, dedupe_key)`: idempotency key for generated alerts.
- Actor-name columns copied at write time by `BEFORE INSERT` triggers (profiles are only readable by users with `users-roles` view, so embedding would show blank names to approvers): `audit_logs.user_name`, `approval_requests.requested_by_name`, `approval_actions.approver_name`. No change to `trg_audit` / `decide_approval`.
- Trigger `approval_requests_notify` (SECURITY DEFINER): on INSERT or level advance, one notification per eligible approver (mirrors `decide_approval`: active, company member or Super Admin, `approval_limits` for the module and amount, `required_roles`); requester is not pinged about their own new request. On Pending to Approved/Rejected, notifies the requester (success / warning).
- `refresh_expiry_notifications(p_days default 30)` (SECURITY DEFINER, `search_path=public`, execute revoked from everyone; only the owner/pg_cron can run it): vehicle registration, vehicle insurance, document expiry, overdue invoices. Dedupe keys embed the expiry date and the expired/soon bucket, so repeated runs create nothing, a renewal creates a fresh alert, and an alert escalating from "soon" to "expired" is a new critical alert. Returns the number created.
- `run_expiry_notifications()`: client-callable wrapper, Super Admin or `settings:edit` only. Fallback when pg_cron is not enabled (Notifications page shows "Refresh expiry alerts" for Super Admin / Company Admin).
- `mark_all_notifications_read()` (SECURITY INVOKER): inserts `notification_reads` for every notification the caller can see, `ON CONFLICT DO NOTHING`, returns the count.
- pg_cron: the migration only contains a guarded block that schedules job `refresh-expiry-notifications` (`0 3 * * *`) if the extension is already installed; it does not enable anything. I did not run the read-only `pg_available_extensions` query (no remote access used). Coordinator: check `select * from pg_available_extensions where name='pg_cron'` with `npx supabase db query --linked`; if available, enable it in Dashboard > Database > Extensions and re-run the final `do $$ ... $$` block (or `select cron.schedule('refresh-expiry-notifications','0 3 * * *','select public.refresh_expiry_notifications(30)')`). Until then use the admin button.

## Service layer (`src/services/system.ts`)

- Fetchers: `notifications` (embeds own `notification_reads`, so `read` is per user), `approvalRules`, `approvalRequests` (embeds `approval_actions` mapped to `history`), `auditLogs` (latest 1000, `AUDIT_LOG_LIMIT`; action derived: CREATE/UPDATE/DELETE, APPROVE/REJECT from approval_requests status change, PAYMENT, RECONCILE; entityName from plate/number/name fields; details = changed fields "old -> new"; `ipAddress` left undefined).
- Mutations (same names/params as FleetContext, `Promise<void>`): `processApproval(requestId, action, comment?, approverUser?)` (client rejects empty comment, calls `decide_approval`; `approverUser` is ignored, signer is `auth.uid()`), `markNotificationAsRead(id)` (upsert into `notification_reads`, idempotent), `markAllNotificationsAsRead()` (RPC). New: `refreshExpiryNotifications()`.
- `affects`: `processApproval` -> approvalRequests, workOrders, invoices, expenses, notifications, auditLogs; `markNotificationAsRead`/`markAllNotificationsAsRead`/`refreshExpiryNotifications` -> notifications.
- `fetchInvoiceAging('Purchase'|'Sales')` reads `v_invoice_aging` (used directly by Reports; not a context collection).

## Module inventory

### D1 Dashboard (`/dashboard`, `DashboardPage`, `DashboardCharts`, `RightAnalyticsColumn`)

| Control | Behaviour | Backend | Status |
|---|---|---|---|
| Add Vehicle | opens add-vehicle quick modal | via QuickActionModals (coordinator) | ok |
| Reports & Export (was "Export Data") | navigates to Reports | none | relabelled, it never exported |
| Stat cards (fleet, workshop, revenue, AP) | navigate to module | derived from context | fixed (below) |
| Start Service Order | opens add-work-order modal | via modal | ok |
| Manage Vehicles (was "Assign Driver") | navigates to Vehicles; there is no assignment action here | none | relabelled |
| Vehicle / work-order rows, attention items | open detail / module / quick modal | none | ok |
| View All (attention) | goes to Notifications | none | ok |

Tables/RPCs: reads only, from context collections (vehicles, workOrders, invoices, expenses, maintenance, oil, tyres, accidents) plus `getCompanyProfitLoss` / `getCompanyBalanceSheet` (context, owned by C/coordinator). Roles: any user allowed on the page; data is RLS-filtered.
Dependencies: A (vehicles, work orders, oil, tyres, accidents, expenses), B (invoices), C (P&L / balance sheet / fixedAssets).

Dummy data found and action:
- "+14.2% Increased from last month" on Revenue YTD: replaced by real month-over-month sales change from sales invoices (credit notes deducted); when last month has no sales it shows this month's invoiced sales instead of a percentage.
- Reminders card ("Mandatory PM Service: Volvo FH16, 02.00 pm, Bay 3, plate 4421-AA, Duqm Main Depot"): replaced by the earliest open work order (or the soonest due oil service); empty state when none.
- "Team Collaboration" with invented "Operator Lead #0n" names and fake status mapping (Active shown as "Completed"): now "Driver Assignments", real `assignedDriver` ("No driver assigned" otherwise) and the real vehicle status badge.
- Fleet Cost Analytics weekly bars (hard-coded 420/780/620... OMR, "74%" badge): last 7 days of expenses + maintenance, empty state otherwise.
- Revenue vs Operating Cost and Maintenance by Category (hard-coded Jan-Aug figures): last 6 months from invoices / expenses / maintenance records; empty states.
- Shift & Odometer Tracker (fake running stopwatch starting at 01:24:08): removed.
- "Bills On Discuss": relabelled "Unpaid supplier bills"; AP total now sums open purchase-invoice outstanding for the selected office instead of `suppliers.currentBalance` (which ignored the office filter).
- Operating Cost Allocation: the last segment was `otherCost || insuranceCost` (mixed meanings); now "Other expenses" = derived remainder.
- Empty states added for vehicle table and work-order list; empty `photoUrl` no longer renders a broken image.
- `AssetDepreciationChart` (used by `DepreciationPage`, Agent C) had hard-coded 2021-2026 figures: now computed from `fixedAssets` (cost vs net book value by purchase year) and keeps its no-prop signature.

### D2 Approvals (`/approvals`, `ApprovalsPage`)

| Control | Behaviour | Backend | Auth | Status |
|---|---|---|---|---|
| Approve Signoff / Reject (+ comment modal) | records the decision, advances level or finalises, updates the work order | `decide_approval` RPC (via `processApproval`) | `can_approve(module, amount)` + company access + required role, checked in DB | fixed: awaited, error toast, button disabled while pending, success only after the await, comment required (UI + DB check) |
| "Requires ..." lock | shown when UI `canApprove` is false | UI hint only | DB is authoritative | ok |

Issues: P1 decision was applied locally with a hard-coded fallback approver ("Ahmed Al-Harthy") - fixed (signer is `auth.uid()`); P1 approval was UI-only - DB enforces. Added empty state. Removed hard-coded "OMR 100/500" copy. Known limitation (P2, for A/B/coordinator): `decide_approval` only updates work orders; invoice / expense approval requests change status but do not update the linked invoice/expense `approval_status` (the context did this for invoices locally). Needs an RPC change in B's slot (`post_invoice` already approves invoices) or extending `decide_approval`.
Tables: approval_requests, approval_actions, approval_rules, work_orders. Dependencies: A (creating requests with `requested_by = auth.uid()`), G (roles).

### D3 Notifications (`/notifications`, `NotificationsPage`, `NotificationDrawer`)

| Control | Behaviour | Backend | Status |
|---|---|---|---|
| Notification row / Inspect | navigates (approval -> Approvals, vehicle, invoice) then marks read | `notification_reads` upsert | fixed: navigation first (approval type no longer opens the vehicle), failure toast, no unhandled rejection |
| Mark All as Read (page, drawer) | marks everything visible as read for this user | `mark_all_notifications_read` | fixed: async, disabled when nothing unread / while busy |
| Filters All / Unread / Critical | client filter | none | ok |
| Refresh expiry alerts (Super/Company Admin only) | runs the expiry job now | `run_expiry_notifications` | new, needs `useFleet().refreshExpiryNotifications` |

Dummy/fabricated: notifications generated by `addWorkOrder` in FleetContext (and any other client-side generation, seeded notifications) must go; the DB now generates them (see migration). Empty states added.

### D4 Audit Logs (`/audit-logs`, `AuditLogsPage`)
Read-only list (DataTable search, action filter, CSV export). Removed the IP Address column (never captured; was always "N/A"), added REJECT filter and a "latest 1000 events" notice. Source `audit_logs` (RLS: `audit-logs:view` + company access). User name shown from the copied `user_name` column. Issue P2: for entities with no `AuditLog.entityType` member (Supplier, Customer, Reconciliation, Approval) the table name is mapped to a readable string and cast; widening the union in `src/types/system.ts` is requested. Issue P3: UPDATE rows list changed fields only; no pagination beyond 1000.

### D5 Reports (`/reports`, `ReportsPage`)
All 16 reports now exist and are computed from loaded data for the selected office; no placeholders. Rows are flat so CSV export equals what is displayed (raw numbers, not formatted text); Print uses browser print of the page.
- 14/15 AP/AR aging: real buckets from `v_invoice_aging` (not yet due, 1-30, 31-60, 61-90, 90+), party names from suppliers/customers, loading and error-with-retry states. Replaces the fabricated 40/30/20/10 split.
- 3 is now "Fixed Asset Depreciation Report" (per fixed asset from the register; no per-vehicle schedule exists in the data). 4 is "Cost Per KM" (fuel efficiency dropped: no litres data). 16 "VAT and Tax" no longer claims a 5% rate in its title; it sums `tax_total` by month (credit notes negative, cancelled/draft/rejected excluded).
- Empty reports show an explicit "No data for this report" card.
Issue P2: aging view groups by company and party; the page merges companies when the office filter is "all".

### D6 Settings (`/settings`, `SettingsPage`)

| Control | Behaviour | Status |
|---|---|---|
| Display currency select | context `setCurrency` (browser-local preference; no conversion) | kept, copy clarified |
| Approval rules list | read-only from `approval_rules`, empty state | ok (editing rules is not offered; admins edit in DB) |
| Export JSON | downloads a read-only snapshot of the collections the user can see (+ counts, exporter, timestamp) | replaces `exportAllDataJSON` |
| Import Backup | REMOVED: overwrote the browser cache with pasted JSON; a shared DB must not be bulk-overwritten from the UI. A one-time localStorage-to-Supabase migration, if wanted, should be a separate coordinator-owned tool |
| Reset to Default Data | REMOVED: re-seeded demo data; meaningless and dangerous for a shared DB |
| "5.0% VAT", "Decimal Safe Math: Enabled (IEEE-754...)" disabled fields | REMOVED (hard-coded, decorative); financial year now points to per-company setting |

Local preference kept in localStorage: display currency (via context).

### GlobalSearchModal
Client-side search over already loaded collections (vehicles, invoices, work orders, maintenance, suppliers, documents, accidents); RLS limits what is loaded. No fabricated results. No change.

## Issues summary

| ID | Sev | Issue | Status |
|---|---|---|---|
| D-1 | P1 | Approval decision applied locally, wrong/hard-coded approver, no server check | fixed (RPC) |
| D-2 | P1 | Reports AP aging fabricated percentages; 11 of 16 reports unimplemented | fixed |
| D-3 | P1 | Dashboard fake trend, reminder card, team card, charts, timer | fixed |
| D-4 | P1 | CSV formula injection in `exportToCSV` | fixed (`csvSafeCell`) |
| D-5 | P1 | Notifications generated client-side; clients cannot insert in DB | fixed in DB; client generation to be removed by coordinator |
| D-6 | P2 | `decide_approval` does not update invoice/expense approval status | open (B / coordinator) |
| D-7 | P2 | AuditLog entityType union too narrow | open (types owner) |
| D-8 | P2 | pg_cron availability unverified; scheduling not active | open (coordinator) |
| D-9 | P3 | Aging report mixes companies when office filter is "all" (intended consolidated view) | accepted |
| D-10 | P3 | Audit trail limited to latest 1000 rows | accepted, UI notice |

## Expected tsc errors
`src/pages/notifications/NotificationsPage.tsx`: `useFleet().refreshExpiryNotifications` does not exist yet (coordinator to add). Other tsc errors in the tree belong to other owners (DocumentUploadZone, CompaniesPage).

## Coordinator integration notes

1. Add to FleetContext: `refreshExpiryNotifications: () => Promise<number>` wrapping `system.refreshExpiryNotifications` and re-fetching `affects.refreshExpiryNotifications`. Change `processApproval` / `markNotificationAsRead` / `markAllNotificationsAsRead` to `Promise<void>`, wired to `system.ts` (same names and params), then refetch their `affects`. Import `fetchers` for `notifications`, `approvalRules`, `approvalRequests`, `auditLogs`.
2. Remove from FleetContext: the client-side `approval_required` notification push in `addWorkOrder`, `logAudit` (server triggers write audit_logs), seeded notifications / approval data, `resetToDefaultData`, `importDataJSON`, `exportAllDataJSON` (Settings no longer uses them; remove from the context type too).
3. Types: apply `20261026000400_system.sql`, then regen `src/types/database.ts` (new columns `notifications.dedupe_key`, `audit_logs.user_name`, `approval_requests.requested_by_name`, `approval_actions.approver_name`; new RPCs `run_expiry_notifications`, `mark_all_notifications_read`). My code uses loose row typing so it compiles before and after the regen.
4. Migration ordering: it references `approval_requests`, `approval_actions`, `documents`, `vehicles`, `invoices` from the core schema only; no dependency on other slots.
5. Dashboard still takes `getCompanyProfitLoss()` / `getCompanyBalanceSheet()` from the context (C). Revenue YTD card uses that value, the trend below it uses sales invoices.
6. Write path for approval requests: the client inserts `approval_requests` (policy requires `requested_by = auth.uid()`); `requested_by_name` is filled by trigger, and approver notifications fire from the insert. `notes`, `required_roles`, `total_levels` must come from the matching `approval_rules` row (A's `addWorkOrder` service).
7. After the migration push, run `select public.refresh_expiry_notifications(30)` once as owner (or press the admin button) to seed alerts.

## Requests to other agents
- Agent A: when creating work orders over a rule threshold, insert the `approval_requests` row with `company_id`, `reference_type='WorkOrder'`, `reference_id`, `reference_number`, `amount`, `required_roles`, `total_levels`; do not also push a client notification.
- Agent B: consider approval completion for `Invoice` / `Expense` requests (D-6); AP/AR aging view `v_invoice_aging` is consumed by Reports (do not rename columns).
- Agent C: `AssetDepreciationChart` now reads `fixedAssets` itself; no prop changes needed in `DepreciationPage`.
- Agent E: `schema.test.mjs` currently fails to parse (line 142); my test follows its auth stub and is standalone (`node supabase/tests/20261026000400_system.test.mjs supabase/migrations`).
- Types owner: widen `AuditLog['entityType']` (Supplier, Customer, Reconciliation, Approval).
