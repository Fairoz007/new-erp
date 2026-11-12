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
