# Phase notes (defaults chosen and items not verified)

Running log for the final AUDIT_REPORT.md. Every phase: `npm run build` and `npm run test:db` pass.
Browser checks against a real database are blocked until the staging Supabase project is connected
(the app currently shows "Database connection not configured").

## Phase 1: Setup Wizard
- Custom field values are stored in a `custom_fields` jsonb column on each entity, validated by a trigger, instead of a separate field_values table.
- On an existing install the Super Admin can choose "Continue to app" from the wizard. Other users are blocked only when no organization exists.
- Recurring expense generation comes in Phase 8. Custom fields render in entity forms from Phase 3. Approval rules still use legacy required_roles until Phase 9.
- The opening-balance CSV skips already-posted rows only within the current screen session.
- The language setting affects documents only.

## Phase 2: Offices and isolation
- Clients and suppliers belong to a home office (`office_id`) and are shared in one of three modes: office only, selected offices, or all offices.
- Existing parties were backfilled as shared with all offices. Their home office is the office of their first invoice (or expense), otherwise the first office.
- A server-side insert with no office goes to the first office (by created_at, then name) with organization-wide sharing.
- An app user who can create parties in exactly one office gets that office. Otherwise the office is required.
- Office moves happen only through `transfer_to_office()`. A transfer needs edit rights in the current office and create rights in the destination, plus a reason and an effective date. Every transfer is logged in `office_transfers` and audited.
- What moves with a vehicle:
  - Mounted tyres move; scrapped or replaced tyres stay.
  - Drivers in the old office are unassigned.
  - The fixed asset moves at book value. Balanced journals in both offices go through 1600 Inter-Office Current Account, which nets to zero across the organization.
  - Open work orders block the transfer.
  - The vehicle's history (fuel, expenses, invoices) stays in the old office.
- Party balances (v_party_summary) are organization-wide, not split per office.
- Audit log rows without an office (users, roles, settings, clients and suppliers) show under every office filter.
- Not verified in a browser: the party office/sharing fields, the Sharing and Transfer buttons, the transfer history, and the office-filtered pickers on invoices, expenses and work orders.

## Phase 3: Custom fields
- Forms render the fields that apply to the record's office (and the vehicle's type) for offices, vehicles, clients, suppliers, employees and expenses. The database validates the same rules, so a direct API insert cannot skip a required field.
- On updates, values are re-checked only when they change or when a vehicle's type changes. A field made required later does not block edits to other columns of older records.
- File values must be a `storage://documents/<office id>/…` reference uploaded for that office.
- Definitions that hold data:
  - The key and record type of a field never change.
  - The type cannot change and dropdown options in use cannot be removed.
  - The field cannot be deleted; deactivate it instead.
  - The Field Builder shows how many records use each field and offers Delete only when none do.
- Fields marked "show in list" become sortable table columns, included in CSV/PDF export. Search covers all custom values. The filter control supports dropdown and yes/no values (equality), number and date ranges, and text contains. The offices page shows the values on each card. Search and filter run in the browser over loaded rows.
- Fix: changing a vehicle's type by name was silently reverted (Phase 1 trigger). Fixed, and vehicle forms now use the vehicle-type master instead of a hard-coded list that included types the database rejects.
- The office form no longer offers a currency list. Offices use the organization base currency unless currency is overridable.
- Not verified in a browser: every custom field form and list column (needs the staging DB).
- Still hard-coded: "OMR" in a few quick-add labels and toasts; to fix in Phase 7.

## Phase 4: Client and supplier registration
- Approval of new registrations is optional, set per organization (Settings → Universal settings → "New clients and suppliers need approval"; off by default). When it is on, a party created by someone without approve rights in its home office starts as Pending. Pending and Rejected parties cannot be used on invoices, bills, payments, expenses or contracts in any office. The database enforces this, not only the pickers.
- Approve or reject happens on the party page or under Approvals → Registrations. `review_party()` needs approve rights in the home office and blocks approving your own submission (super admins excepted). Rejecting requires a reason. The submitter is notified. Editing a rejected registration sends it back to Pending.
- Duplicates are blocked in the database per party type, across the whole organization: VAT number and CR number (case-, space- and punctuation-insensitive) and email (case-insensitive). Rejected registrations do not block. The error names the existing record's code.
- Opening balances are no longer typed on the party form; that field was only a memo that skewed balances. Use "Post opening balance" on the party page, which posts a real opening invoice or bill. App users cannot write `opening_balance` directly.
- The party detail page (`#customer-detail?id=…`, `#supplier-detail?id=…`) replaces the old pop-up modals. It shows KPIs, invoices or bills, payments, contracts and change history. Global search finds clients and suppliers by name, code, VAT, CR or email and opens this page.
- Contracts: numbered CON-…, in the office's currency, status Draft, Active, Suspended or Terminated. "Expired" is shown for an Active contract past its end date. Only Draft contracts can be deleted. The signed copy is stored under the office's documents folder. Rate cards have lines per vehicle type and unit. `contract_rate()` returns the active contract rate, otherwise the default fee schedule; invoice forms will use it from Phase 7.
- CSV: "Export all fields" writes every column, custom fields as `cf_<key>`, and home office by code. The import template uses the same columns. Import checks each row before sending: required name, type, email, numbers, office code and rights, duplicates against existing records and within the file, and custom-field rules. Valid rows are saved one by one through the normal service, so the database rules still apply, and each row shows its result. Limits: 2 MB and 1000 rows. File-type custom fields and bank details are not imported. "Selected offices" sharing is set after import.
- Export file names no longer carry the old "FleetX_" prefix.
- Not verified in a browser (needs the staging DB): the registration flow, the detail page, contracts and rate cards, and CSV import/export.

## Phase 5: Fleet (bus-first)
- Vehicle types (name, category, bus flag, seat capacity, licence class, service interval in km or months) were already admin-editable (Settings → Vehicle types, Phase 1), and type-specific custom fields come from Phase 3. When seats are left empty, a vehicle takes its type's seat capacity (the database fills it in).
- New vehicle fields: route, client contract, route permit number and expiry, last and next inspection dates. Registration (ROP/RTA) and insurance expiry already existed. The database rejects a next inspection dated before the last one.
- Drivers (Fleet → Drivers) are employees with a licence number (unique), class, issue and expiry dates, and a status. A driver's office and name always follow the employee, so a driver cannot be moved on its own; an employee transfer takes the driver along and drops them from a vehicle in the old office. Terminating the employee deactivates the driver. Suspending or deactivating a driver removes them from their vehicle.
- Assigning a driver happens on the vehicle form, and the database enforces it: one vehicle per driver, same office, active driver, licence not expired. The old free-text "Assigned driver" is now filled in from the driver record. A vehicle transfer leaves the old office's driver and contract behind.
- A vehicle can serve one client contract of its own office, Draft or Active. A contract that is later suspended or terminated stays on the vehicle until someone changes it.
- Expiry alerts come from `refresh_expiry_notifications()` (pg_cron daily at 03:00 UTC if the extension is on; otherwise admins use "Refresh alerts" on Notifications). It covers registration, insurance, route permit, inspection, driving licence, documents and service due, plus overdue invoices as before. Service due comes from the last maintenance record's next-service date or mileage, otherwise from the vehicle type interval; it fires within 500 km of the due mileage. The window is the new organization setting "Expiry alert window (days)", default 30. Alerts are not repeated; a renewal or an escalation to overdue creates a new one.
- The dashboard shows an "Expiries and inspections" panel from `v_fleet_expiries`, which follows the base tables' RLS and the office switcher. Vehicles, maintenance, work orders, oil, tyres, accidents and profitability gained an "All vehicle types" filter; office filtering was already in place.
- Registering a driver means choosing an employee, so the user needs HR view rights to see employees. Without them the picker explains why it is empty.
- Not verified in a browser (needs the staging DB): the Drivers page, the vehicle form operations section, the dashboard expiry panel and the vehicle type filters.

## Phase 6: HR
- The sidebar has a Human Resources group: Employees, Drivers, Attendance, Leave, Payroll and HR setup. Each page has its own permission module: `hr` (employees and HR setup), `drivers`, `attendance`, `leave` and `payroll`. Existing roles keep their old rights, because the Phase 1 migration copied payroll rights to hr, attendance and leave. The employees table now uses `hr`. Payroll users can still view employees.
- Employee profile:
  - Fields: department and designation (from lists in HR setup), reporting manager (circular reporting lines are blocked), sponsor, date of birth, civil ID, passport, visa and labour card numbers with expiry dates, bank details and custom fields.
  - A leaving date of today or earlier sets the status to Terminated.
  - Unknown department or designation names are rejected in the app. Server-side imports create them.
  - Paper expiries raise "employee document expiring" alerts in the same daily job and alert window as the fleet.
- Attendance:
  - One record per employee per day: status, check-in/out and overtime hours (0–16).
  - The day sheet can mark everyone not yet marked as Present or Holiday. CSV import takes `employee_code,date,status,check_in,check_out,overtime_hours,notes` (2 MB, 3000 rows). Each row is checked first, and an existing day is replaced.
  - Work statuses cannot be recorded for future dates or outside the employment dates.
  - "On Leave" days are only created by approving leave.
  - Once a month's payroll is approved, that month's attendance is locked.
- Leave:
  - Default types: Annual 30 days, Sick 21 (a document is needed over 2 days), Emergency 6, Maternity 98, Hajj 15, Unpaid (no limit). All are editable in HR setup.
  - Days are counted as calendar days. A request cannot cross the year end; split it in two.
  - Entitlement is pro-rated in the joining and leaving years. Balance = entitlement + adjustments − approved − pending.
  - A request beyond the balance, or overlapping another request, is rejected by the database.
  - Approval needs leave approve rights, and the approver must not be the person who submitted the request (super admins excepted). Rejecting needs a reason. The requester is notified.
  - Approval writes "On Leave" attendance; cancelling removes it. Cancelling is blocked once that month's payroll is approved.
  - Certificates are stored under `<office>/leave/…` with the leave module's storage rights.
  - Adjustments, such as carry forward or corrections, need a reason.
- Payroll workflow:
  1. Prepare a draft for an office and month.
  2. Edit overtime hours, bonus, loan recovery and notes, and recalculate as needed. Manual edits are kept on recalculation.
  3. Submit for approval.
  4. Approve, which posts the journal.
  5. Pay from a bank account, which posts Dr 2050 / Cr bank.
  - Approval needs payroll approve rights within the role's payroll approval limit, and the submitter cannot approve. Payment needs payments create rights. Drafts and submitted runs can be deleted.
  - The old one-step `process_payroll` now needs approve rights. The UI no longer uses it.
- Payroll calculation (defaults are organization settings under HR setup → Payroll rules):
  - Basic pay and fixed allowances are pro-rated by calendar days worked in the month (joining or leaving mid-month).
  - Unpaid leave deducts basic ÷ 30 per day.
  - Overtime = hours × basic ÷ (30 × 8 h) × 1.25.
  - Recurring allowances and deductions are set per employee, with start and end dates; deductions credit their GL account (default 2060).
  - PASI is unchanged from the earlier payroll.
  - Gratuity for a leaver in the month = basic ÷ 30 × (15 days per year for the first 3 years + 30 days per year after that), pro-rated by days of service. It is posted to 5080 and paid only once (the employee is marked).
  - These defaults follow common Oman practice. They are settings, not legal advice; confirm with the client's HR or legal team.
- Approval journal: Dr 5070 salaries, Dr 5080 gratuity, Dr 5075 employer PASI; Cr 2040 PASI payable, Cr 1250 staff loans, Cr deduction accounts, Cr 2050 salaries payable. Missing system accounts are created in the office's chart of accounts.
- Payslips list every allowance and deduction line, overtime hours and unpaid days.
- HR documents: a document can be linked to an employee, who must be in the same office. The upload form has HR categories (passport, civil ID, visa, labour card, driving licence, contract, medical certificate), and an HR category requires an employee. The Documents page has an "HR documents" filter and shows the linked employee.
- Pending leave appears as a badge on the Leave menu item. It is not yet in the Approvals queue.
- Not verified in a browser (needs the staging DB): every HR page, payroll approval and payment, attendance import, leave requests with document upload, and HR document upload. Database behaviour is covered by `supabase/tests/20261112000700_hr.test.mjs`.

## Phase 7 — Finance

Migration `20261112000800_finance.sql`, tests `supabase/tests/20261112000800_finance.test.mjs`.

- Correction to Phase 6: gratuity was posted to 5080, which is the depreciation expense account. It now posts to a new account, 5085 "End of service gratuity". The payroll functions were redefined in the new migration; the Phase 6 migration was not edited. Existing payroll item lines were moved to 5085. Journals already posted are not rewritten.
- Default approval limits: Accountant gets payment and journal limits of 5,000 (base currency). Finance Manager and Super Admin are unlimited. Change them in the role approval limits.
- Period close (Finance → Period Close):
  - Per office and month.
  - A closed month rejects every journal dated in it, so invoices, payments, payroll, depreciation, disposals and manual journals are all blocked.
  - Closing needs accounting approve rights. Only months that have ended can be closed, and the month's payroll must not be Draft or Under Review.
  - Reopening needs a reason. Both actions are audited.
- Manual journals:
  - Up to the user's journal limit, a journal is posted immediately.
  - Above the limit, a journal request (JR-YYYY-…) is created and every approver is notified. It appears under Approvals → Journals.
  - The approver must be someone else (super admins excepted) and within their own limit. Rejecting needs a reason. The journal is checked again (balance, accounts, closed period) when approved.
  - Direct API calls to `post_journal_entry` above the limit are refused.
  - Reversing a journal is not limit-checked.
- Payments above the user's payment limit are rejected with "ask a Finance Manager to record it". They are not queued.
- Debit notes:
  - An extra charge to the same party on a posted invoice or bill, in the same office and currency.
  - Created from the invoice view and sent through the normal invoice approval. It posts like an invoice once approved.
- Bank reconciliation (Finance → Bank Reconciliation):
  - A statement has a bank account, period, and opening and closing balances.
  - Lines are added by hand or imported as CSV `date,description,reference,amount` (positive = money in).
  - Auto-match pairs a line with a ledger movement on the same bank account for the same amount, within ±5 days, taking the closest date. Manual matching is available.
  - Completing needs reconciliation approve rights. Every line must be matched and opening + lines must equal closing. A reconciled statement is locked.
- Cash flow (Finance → Cash Flow):
  - Direct method, from posted journals on the office's bank-linked GL accounts.
  - The other side of each entry decides the section: fixed assets → investing; equity and long-term loans → financing; everything else → operating.
  - Transfers between the office's own bank accounts are left out.
- Budgets (Finance → Budgets):
  - Per office and year, with monthly amounts per income or expense account. Draft → Submitted → Approved or Rejected. An approved budget can be reopened.
  - Only one approved budget per office and year.
  - The approver cannot be the submitter and must be within the budget approval limit (on total expenses).
  - Budget vs actual compares against posted journals, year to date through a chosen month. Expense lines are flagged at 80% (amber) and 100% (red).
  - Phase 8 adds the budget alerts.
- Fixed asset disposal:
  - From the asset view, with fixed-assets approve rights.
  - Posts Dr accumulated depreciation, Dr bank (proceeds) and Cr cost, with the gain to 4030 other income or the loss to 5095 loss on disposal.
  - A disposed asset cannot be edited.
- Statements: trial balance, P&L and balance sheet are unchanged. They are computed in the browser from posted journals.
- Hard-coded "OMR" labels in the quick-action forms and the vehicle cost-per-km figures now use the organization currency. A new invoice takes the office currency.
- Deferred to Phase 8: GL posting for expenses and paid maintenance, which need expense status and payment fields first.
- Not verified in a browser (needs the staging DB): every new Finance page, the journal approval queue, debit notes and asset disposal. Database behaviour is covered by the finance test file.

## Phase 8 — Expenses

Migration `20261112000900_expenses.sql`, tests `supabase/tests/20261112000900_expenses.test.mjs`.

- Expense entry (quick action "Add expense"):
  - Fields: office, optional vehicle (required when the category says so), category from Setup → Expense categories, optional employee and supplier, quantity, price, VAT, payment method, "Paid from" bank or cash account, cost centre, receipt upload and custom fields.
  - The employee, vehicle and bank must belong to the expense's office.
- Workflow: Draft → submit → Approved (posted), or Pending Approval → Approved or Rejected.
  - Saving from the form submits at once.
  - Within the submitter's expense approval limit the expense is approved and posted immediately. The default limits are Accountant 500, Fleet Manager 500, Finance Manager unlimited.
  - Above the limit, every approver is notified and the expense appears under Approvals → Expenses.
  - The submitter cannot approve or reject their own expense (super admins excepted), and the approver must be within their own limit. Rejecting needs a reason, and the submitter is notified.
  - A rejected expense can be edited and resubmitted. A pending expense can be withdrawn to draft.
  - Submitted and approved expenses are locked. Only drafts and rejected expenses can be deleted.
  - Submitting into a closed accounting period is refused.
- Posting on approval:
  - Dr the category's GL account (net), plus Dr 1300 input VAT.
  - Credit side: the chosen bank or cash account (marked Paid), or 2010 payables when nothing was chosen (Unpaid).
  - "Pay" later posts Dr 2010 / Cr bank. It needs payments create rights and the payment limit.
  - A category account missing from the office chart is created. Expenses with no category account post to 5000.
- Existing expenses recorded before this phase are treated as approved and paid. They were never posted to the ledger, and the detail view says so. They were not back-posted, because doing that could double-count costs already entered as manual journals.
- Vehicle timeline entries and vehicle cost figures (profitability, dashboard, reports) now count approved expenses only. The timeline entry uses the office currency.
- Monthly expenses (Expenses → Monthly expenses):
  - Templates have an office, category, amount, VAT, supplier, vehicle, payment method, day of month (1–28), and start and end dates. They are also editable in Setup → Expense categories.
  - `generate_recurring_expenses()` creates one draft per template and month once its day has come. It is idempotent (unique template + month) and catches up on missed months.
  - Each new draft notifies the office. Drafts still not submitted a week after their date raise an "overdue" notification.
  - A failure, such as a vehicle that was later moved, raises a critical notification and is retried on the next run.
  - The panel shows drafts to submit (with an overdue flag), the next date for each template, and a "Create due drafts now" button for the user's offices.
- Daily job: `run_daily_finance_jobs()` (drafts plus budget alerts) is scheduled with pg_cron at 02:15 when the extension is enabled. Without pg_cron, enable it in the Supabase dashboard and re-run the migration's last block, or use the button above.
- Budget alerts:
  - At 80% (warning) and 100% (critical) of the approved annual budget, per expense account, once per account and threshold each year.
  - They are checked when an expense is posted and in the daily job, and link to Finance → Budgets.
  - Budgets are per GL account, and each category maps to an account, so a per-category budget is a budget on that category's account. Two categories sharing an account share its budget.
- Maintenance records are not posted on their own. Their cost reaches the ledger through the supplier bill linked to the record, which avoids double posting.
- Not verified in a browser (needs the staging DB): the expense form, detail actions, Approvals → Expenses, and the monthly panel. Not verified: the pg_cron schedule on a real project, since PGlite has no pg_cron.

## Phase 9 — Roles and permissions

Most of this was built in Phase 1 (migration `20261112000100_roles_permissions.sql`, because the Setup Wizard needed it):
- Roles are data. Roles can be created, cloned, renamed and deleted.
- Users & Roles has a module × action matrix backed by the database, plus approval limits per role and module.
- Per-office role assignment: a user can be Finance Manager in one office and Viewer in another.
- RLS and every RPC use the same `perm_company_ids` and `can_in` checks as the UI.

This phase (migration `20261112001000_roles.sql`, tests `supabase/tests/20261112001000_roles.test.mjs`) finishes it:
- Approval rules:
  - Roles are named by id, so custom roles can be approvers. Existing rules and requests were backfilled from the legacy role names.
  - Rules are edited in Settings → Approval rules, which needs super admin or settings edit rights. Each rule has a type (work orders or invoices), a threshold and the approving roles in order. With no roles, anyone whose signing limit covers the amount may decide.
  - Expenses, payments, journals, payroll and budgets use signing limits only, not rules.
- Financial statements are a separate permission (`financial-statements`):
  - Trial balance, P&L, balance sheet and cash flow open with it. Existing roles had it copied from `accounting` in Phase 1, so nothing changes for them.
  - A role that has it but not `accounting` (the Sponsor) gets account totals and per-day, per-account sums from `statement_accounts()` and `statement_daily_totals()`. It never gets journal descriptions, parties or entry numbers, and RLS still hides the ledger tables.
- Defaults:
  - **Admin**: everything except role definitions and Super Admin grants.
  - **Finance Manager**: all finance, with approve rights and unlimited limits for payments, payroll, budgets, journals and parties, and expense approval.
  - **HR Manager**: HR, drivers, attendance, leave, payroll preparation and HR documents, with unlimited leave approval and no payroll approval limit.
  - **Sponsor**: view, export and print of dashboards, reports and financial statements, plus office and notification view. It has no write rights.
  - Each of these holds only for the offices where the user has that role.
- Guards:
  - System roles cannot be deleted.
  - A role still assigned to a user or an office membership cannot be deleted.
  - The super admin and system flags of a role cannot change.
  - Roles, including system roles, can be renamed.
- Not verified in a browser: the approval rules editor, and a Sponsor login seeing statements and nothing else. The Sponsor dashboard comes in Phase 10.

## Phase 10 — Dashboards, reports and notifications

Dashboards (`src/pages/dashboard/RoleDashboards.tsx`; `DashboardPage` shows them as tabs):
- Each tab is shown only with its permission, and the first one the user may open is the default:
  - **Executive**: super admin, or statements, ledger and vehicles view.
  - **Finance**: accounting view.
  - **Fleet**: vehicles view. This is the earlier dashboard.
  - **HR**: hr view.
  - **Owner view**: statements view without ledger access (the Sponsor).
- Every figure is computed from loaded records: posted journals, invoices, bank balances, employees, payroll runs, leave requests and notifications. Offices are limited to the office selector and to the offices where the user holds the permission.
  - The Owner view uses the statement summaries from Phase 9, so it shows no journal detail.
  - The HR "monthly basic payroll" is the sum of basic salaries, not a payroll run.

Reports (`src/pages/reports/extraReports.tsx`, `reportKit.tsx`; `ReportsPage` has Office, From and To filters):
- New reports:
  - **Fleet utilization**: km comes from odometer readings in the period. Availability is calendar days less accident downtime. Trips are not recorded, so this is not a trip-based utilization.
  - **Expiry**: vehicle items, employee papers and documents.
  - **Client and supplier statements**: opening balance, then each document with a running balance.
  - **Payroll summary**.
  - **Expense by category**: approved expenses.
  - **Budget vs actual**: through the end month of the date range.
  - **P&L per office**.
  - **Consolidated P&L**.
- Existing reports now take the office and date filters. AR/AP aging and cost per vehicle are among them.
- Every report exports to CSV and PDF through the shared table.
- The report list is filtered by the permission module of each report.

Notifications (migration `20261112001100_notifications.sql`, tests `supabase/tests/20261112001100_notifications.test.mjs`):
- **New leave request**: notifies, by name, each active user who may approve leave in that office, apart from the requester. Leave decisions already notified the requester.
- **Overdue invoices**: the daily refresh already raised these. It now does so only for approved invoices; drafts and pending invoices were alerted before.
- Expiries, approvals, recurring expenses that are due or overdue, and budget alerts were already in place (Phases 5–8).

Not verified in a browser (needs the staging DB): every dashboard tab, the reports and their PDF output, and the leave alert in the bell.

## Phase 11 — Final verification

- Fresh install: `supabase/tests/20261112001200_e2e_fresh_install.test.mjs` runs on an empty database with every migration applied and no fixtures. It follows the wizard flow with two offices, adds the business records, checks the trial balance and each office's P&L, and runs the role and cross-office checks. 15 of 15 pass. `npm run test:db` passes 888 of 888 checks.
- The remote suite (`e2e/remote.e2e.mjs`) only accepted the production project. It now refuses production and requires `E2E_CONFIRM` to match the staging ref.
- `AUDIT_REPORT.md` has a new update section (I–L) covering what was fixed, what was verified and what is still open. `README.md` has setup instructions.
- Not verified: the browser pass (wizard, each role's login, 375 px mobile) and the remote suite. Both need the staging project connected.
