# Master Prompt: Fix and Complete the Fleet & Finance ERP

> Copy everything below the line into a new Claude Code session opened in this repository (`new-erp`).
> Before you run it, check the **Assumptions** section and correct anything that is wrong.

---

## Role and goal

You are a senior full-stack engineer working on an existing **multi-office fleet and finance ERP** built with React 18, TypeScript, Vite, Tailwind and Supabase (Postgres, RLS, Auth, Storage). Your job is to **fix every existing defect and finish every missing module** so that a new company can install the app, go through a guided **Setup Wizard**, and run its whole operation: offices, fleet (mainly buses), clients, suppliers, HR, finance, expenses, approvals and reports. Nothing may be missing or left as a placeholder.

Work in phases (listed below). After each phase:
1. `npm run build` passes (this includes `tsc`).
2. `npm run test:db` passes. Add tests for every new table, function and RLS policy.
3. You open the app with the preview tools and click through every changed screen without errors.
4. You make one git commit for the phase.

Never wipe or reseed production data. Every schema change goes in a new migration under `supabase/migrations/`. Do not edit old migrations.

## Read first (current state)

- `AUDIT_REPORT.md` lists open issues. Every item marked **Open** must end up fixed.
- `docs/SUPABASE_MIGRATION_PLAN.md` and `supabase/migrations/*.sql` describe the schema. `companies` already acts as "offices". Most tables are scoped by `company_id`. `suppliers` and `customers` are **global**, with no office scope.
- `src/App.tsx` uses a hash-based `switch` router. `src/components/layout/Sidebar.tsx` defines the navigation.
- `src/context/FleetContext.tsx` holds data state. `src/services/*.ts` are the Supabase services.
- `src/context/AuthContext.tsx` handles roles and permissions. `src/pages/users-roles/UsersRolesPage.tsx` currently shows a **hard-coded** permission matrix that does not match `AuthContext` or the `role_permissions` table.
- Roles today are a fixed TypeScript union (`src/types/system.ts`). Vehicle types are not modeled; only fuel and transmission types are.

## Assumptions (edit these before running)

1. **"Company / office" structure:** one *Organization* (the tenant) owns many *Offices* (branches). Users, vehicles, staff, clients, suppliers, expenses and ledgers belong to an office. Organization-level users can see all offices.
2. **"Fields" means configurable fields.** Admins can add custom fields (text, number, date, dropdown, file, yes/no) to each entity (Office, Vehicle, Client, Supplier, Employee, Expense). Fields can be **global** (all offices) or **office-specific**, and can be shown, required or hidden per office.
3. **"Universal fees and details"** means organization-wide master settings that every office inherits: currency, VAT/tax rates, fee schedules and price lists, document number formats, financial year, and company letterhead/logo. An office may override them only where the admin allows it.
4. **Fleet focus:** buses come first. Default vehicle types are *Bus, Mini-bus, Coaster, Car, Pickup, Truck*. Admins can **add more types**, each with its own seat capacity and type-specific fields.
5. **"Sponsor"** has two possible meanings. Implement both unless told otherwise:
   (a) a customizable **Sponsor** role with limited, owner-style read access to the offices they sponsor;
   (b) a **Sponsor** field on employees (visa/residency sponsor) for HR compliance.

## Phase 0: Stabilize what exists

- Fix every **Open** item in `AUDIT_REPORT.md`:
  - AR/AP, payments, credit notes and payroll must post to the general ledger.
  - The chart of accounts must be scoped per office, so the P&L, balance sheet and trial balance are correct per office and also consolidated.
  - Credit notes must reduce the original invoice and the party balance, and must not be duplicated.
  - Invoice totals must be computed on the server.
  - Remove the hard-coded dashboard trends ("+14.2%").
  - Remove the fabricated `fuelCost` and AP-aging percentages.
  - Implement the 11 reports currently flagged "not yet implemented".
  - Neutralize CSV formula injection.
  - Add upload size and type limits.
- Remove every remaining `localStorage` use for business data. Supabase is the only source of truth; `localStorage` may hold only UI preferences.
- Search for and remove placeholder or demo code: `TODO`, `mock`, `dummy`, `Math.random` used for data, hard-coded IDs or amounts, dead buttons that only show a toast.
- Every list page needs empty, loading and error states. Every form needs validation messages.

## Phase 1: Setup Wizard (first-run sequence)

The wizard appears when the organization has no completed setup, and only Super Admin can run it. It runs as **ordered steps with saved progress**, so the user can leave and resume. Each step validates before **Next**. There is a final review screen and then **Finish**.

1. **Organization profile:** legal name, trade/CR number, VAT/tax number, address, logo, base currency, financial-year start, time zone, language.
2. **Universal settings:** tax rates, fee schedule and price list, document number formats (invoice, payment, PO, work order, employee code), payment terms, units.
3. **Offices:** create one or more offices (name, code, address, contacts, manager, bank account). Copy the default chart of accounts into each office.
4. **Roles and permissions:** start from the default roles (Super Admin, Admin, Finance Manager, Accountant, Fleet Manager, HR Manager, Maintenance Manager, Procurement, Sponsor, Viewer). The user can rename, clone or create roles and edit a module × action matrix (view, create, edit, delete, approve, export, print).
5. **Users:** invite users by email, assign a role, and assign one or more offices. Invites use the existing Supabase auth and set-password flow.
6. **Vehicle types and custom fields:** confirm the default vehicle types, add more, and define custom fields per entity.
7. **Expense categories and recurring expenses:** set up categories (fuel, salaries, rent, utilities, insurance, permits, maintenance, tolls) and monthly recurring templates.
8. **Opening balances (optional):** bank accounts, party balances, fixed assets. Import from CSV with a downloadable template.
9. **Review and finish:** show a summary of everything, then mark setup complete and land on the dashboard.

Afterwards, every step must stay editable from **Settings**. Settings may never be the only place a step can be configured.

## Phase 2: Offices and multi-office scoping

- Add an `organizations` table and add `organization_id` to `companies` (offices). Keep `companies` as the office table, or rename it via a view, without breaking existing foreign keys.
- Add an **office switcher** in the header with an "All offices" option for organization-level roles. Every page, KPI, report and export must respect it.
- Add an `office_id` scope to `customers` and `suppliers`, with an option to share a party across offices.
- RLS: a user sees only the offices in `company_members`. Organization admins see all offices. Add tests for cross-office leakage.
- Allow transfers of vehicles and employees between offices. Each transfer must be audit-logged.

## Phase 3: Custom fields engine

- Tables:
  - `field_definitions`: entity, key, label, type, options, required, `office_id` (null means global), sort order, active.
  - Field values: either a `custom_fields jsonb` column on each entity, or a `field_values` table. Pick one and justify the choice.
- Add a field-builder UI in **Settings → Custom Fields**, with drag to reorder and preview.
- Forms render custom fields automatically. Lists can show them as optional columns. Search, filters and CSV export include them. Required fields are enforced on the server.

## Phase 4: Client and supplier registration

- Full registration forms: type (individual or company), CR/ID number, VAT number, contacts (multiple), addresses, bank details, credit limit, payment terms, documents (CR copy, contract), status (pending, approved, blocked), and custom fields.
- New registrations go through the **Approvals** queue before they can be invoiced or paid.
- Detail pages show the statement of account, invoices, payments, aging, documents and an activity timeline.
- Block duplicates by VAT, CR and email. Allow CSV import and export.
- Clients: contracts and route agreements (for bus hire), with rate cards that come from the universal fee schedule.

## Phase 5: Fleet (bus-first)

- Add a `vehicle_types` table that admins can extend: name, seat capacity, licence class, default service interval, and type-specific custom fields. Vehicles reference it.
- Bus-specific features: seat capacity, route or contract assignment, driver assignment, permit and RTA/ROP registration expiry, insurance expiry, inspection dates.
- Keep the existing maintenance, work orders, oil, tyres, accidents, documents and profitability modules. Make them work per vehicle type and per office.
- Expiry alerts (registration, insurance, permit, driver licence) go to notifications and the dashboard.

## Phase 6: HR section

Today HR is only payroll. Build a full **HR** sidebar group:
- **Employees:** profile, office, department, designation, manager, sponsor, civil ID, passport, visa and labour-card numbers and expiry dates, bank, documents, custom fields.
- **Drivers:** link a driver to an employee, with licence number, class, expiry and assigned vehicles.
- **Attendance:** daily records with manual entry and CSV import.
- **Leave:** leave types, balances, requests, and an approval workflow.
- **Payroll:** keep the existing feature, but add allowances, deductions, overtime, end-of-service gratuity, payslips and GL posting. Pay from a bank account.
- **HR documents and expiry alerts.**
- **Departments and designations** as master data.

## Phase 7: Finance section

Group everything under **Finance**: Chart of Accounts (per office), Journals, General Ledger, Trial Balance, P&L, Balance Sheet, Cash Flow, Bank Accounts and Reconciliation, Invoices and Bills, Payments and Receipts, Credit and Debit Notes, Fixed Assets and Depreciation, Budgets, and Period Close/Lock.
- Every operational transaction (invoice, bill, payment, expense, payroll, depreciation) posts a balanced journal entry automatically, on the server.
- Locked periods reject any posting.
- **Finance Manager** approves above set limits. **Accountant** prepares entries.

## Phase 8: Expenses, including monthly expenses

- Expense entry: office, category, vehicle (optional), employee (optional), supplier, amount, tax, receipt upload, payment method, and custom fields.
- **Recurring/monthly expenses:** a template (amount, category, day of month, start and end dates, office) automatically creates a draft expense each month through a Supabase scheduled function or cron job. Show upcoming and overdue items.
- Budgets per category and office, with budget vs. actual and alerts at 80% and 100%.
- Approvals above thresholds.

## Phase 9: Roles and permission customization

- Replace the fixed `UserRole` union with data from `roles` and `role_permissions` tables. Roles are created, cloned, renamed and deleted in the UI. System roles cannot be deleted.
- The permission matrix in **Users & Roles** reads from and writes to the database. RLS uses the same `has_perm` function, and the UI and server must agree.
- Office-level role assignment: a user may be Finance Manager in Office A and Viewer in Office B.
- Define the **Admin**, **Finance Manager**, **HR Manager** and **Sponsor** defaults clearly. Sponsor has read-only dashboards, reports and financial statements for the offices they sponsor.

## Phase 10: Dashboards, reports, notifications

- A dashboard per role: executive, finance, fleet, HR, sponsor. All of it real data, with no fabricated numbers.
- Reports, each filterable by office and date with PDF and CSV export: fleet utilization, cost per vehicle and per km, expiry report, AR/AP aging, client and supplier statements, payroll summary, expense by category, budget vs. actual, P&L per office, consolidated P&L.
- Notifications for expiries, approvals, overdue invoices, due recurring expenses and leave requests.

## Phase 11: Final verification

- Run a fresh install on a clean Supabase database: `supabase db reset`, with no seed data except the default roles, vehicle types and account templates. Complete the Setup Wizard end to end with two offices. Then add a bus, a client, a supplier, an employee, a monthly expense, an invoice and a payment. Confirm that the trial balance balances and that the P&L for each office is correct.
- Log in as each role and confirm what it can and cannot see and do, including cross-office isolation.
- Mobile width (375px): every page is usable.
- Update `AUDIT_REPORT.md` with a new section that lists what was fixed, what was verified in the browser, and anything still open, with a reason.
- Update `README.md` with setup instructions.

## Rules

- Do not mark a feature done unless it is wired to Supabase, permission-checked (UI and RLS), office-scoped, validated, and visible in the browser.
- No fake data, no hard-coded numbers, no dead buttons.
- Be honest in the final report. List anything not verified.
- Ask me only when a decision truly changes the design. Otherwise choose a sensible default and write it down in the report.
