# Agent C: Accounting, Fixed Assets, HR/Payroll

Scope: C1 Accounting/Journal, C2 Trial Balance, C3 General Ledger, C4 P&L, C5 Balance Sheet, C6 Depreciation, C7 Fixed Assets, C8 Payroll.

Deliverables:
- `src/services/accounting.ts` and `src/services/hr.ts`
- Migration `supabase/migrations/20261026000300_accounting_hr.sql`
- Test `supabase/tests/20261026000300_accounting_hr.test.mjs` (31/31 passing; `npm run test:db` is green across all suites)
- Pages and `PrintablePayslipModal.tsx`
- `src/types/hr.ts`: two optional fields added (see the requests section)

`npx tsc --noEmit` reports no errors in my files. The 6 remaining errors are in other agents' files (CompaniesPage, NotificationsPage, DocumentUploadZone).

No remote writes. No dev server was run.

## Migration 20261026000300 (additive)

| Object | Purpose |
|---|---|
| `payroll_items.pasi_employer_contribution` | Stores the employer PASI share. Before this, it was never stored or posted. |
| `ensure_system_account(...)` (internal, no grants) | Upserts default system accounts (5070/5075/5080/1520/2040/2050) when a company chart is older than E's template. |
| `run_depreciation(p_company, p_period, p_notes, p_post_gl)` | SECURITY DEFINER, `search_path=public`. Checks `has_company_access` + `has_perm('fixed-assets','create')`, plus `accounting:create` when posting. In one transaction it creates the run, its items, updates `accumulated_depreciation` and status, and posts the journal through `post_journal_entry`. Returns the run id. |
| `process_payroll(p_company, p_year, p_month, p_payment_date, p_bank_account, p_post_gl)` | Same security pattern with `payroll:create`. Creates the run and payslip lines, then posts a balanced journal. Returns the run id. |
| `trg_fixed_asset_guard` | A direct client UPDATE of `accumulated_depreciation` is rejected. Only the RPC may change it. |
| `trg_payroll_run_guard` | Clients may only insert or edit **Draft** headers. Approved/Paid/posted runs cannot be deleted or altered. Approved→Paid is still allowed. |
| `revoke insert/update/delete on payroll_items, depreciation_runs from authenticated` | These rows are written by the RPCs only. |

Both RPCs have execute revoked from public/anon and granted to `authenticated`.

### Tests (supabase/tests/20261026000300_accounting_hr.test.mjs)

**Depreciation**
- Denied for Viewer, Management (view-only) and a Finance Manager from another office.
- A future period is rejected.
- January run: SL 200 + RB 200 + DDB 200 + a salvage-capped 5 = 605. The journal balances (5080 = 605, 1520 = −605).
- An asset that reaches salvage becomes 'Fully Depreciated' at book value = salvage.
- Assets bought after the period, and disposed assets, are untouched.
- A duplicate period is rejected.
- February uses written-down value (RB 196, DDB 193.333).
- A run with `p_post_gl=false` creates no journal.
- A missing per-asset GL account rolls back the whole run.
- Client attempts to change accumulated depreciation or insert runs are blocked.

**Payroll**
- Denied for Viewer, Accountant (payroll is view-only for that role) and another office.
- A bank account from another office is rejected.
- January: 2 eligible employees (Active + Probation; Terminated and future joiners excluded). Gross 970, PASI employee 56, employer 92, net 914. The journal balances and the bank GL account is credited 914.
- A duplicate month is rejected.
- With no bank account, the run is 'Approved' and 914 is credited to 2050.
- A month with no eligible employees is rejected.
- Management cannot delete payslip lines.
- A processed run cannot be deleted, and a 'Paid' run cannot be inserted directly.
- Viewers and other offices cannot read employees.
- The HO ledger balances after all runs.
- anon cannot execute the RPCs.

## Financial-logic findings (before → after)

| # | Area | Before | After |
|---|---|---|---|
| F1 P1 | Straight-line | `(cost−salvage)·rate%/12`. Useful life was ignored, so a rate that disagreed with the life gave wrong charges. | `(cost−salvage)/(life·12)`. The rate is now informational for SL. |
| F2 P1 | Double Declining | Treated as reducing balance at the entered rate. | `BV·(2/life)/12` |
| F3 P2 | Reducing balance with rate 0 | Silently used a fabricated 25%. | Falls back to `100/life`. |
| F4 P1 | Eligibility | Every 'Active' asset in **all** companies; assets bought after the period were depreciated; 'Under Maintenance' assets were skipped. | One company only. `purchase_date ≤ period end`. Active + Under Maintenance. |
| F5 P1 | Salvage floor | Capped in JS only. | Capped in the RPC, plus the existing DB CHECK. Status becomes Fully Depreciated when BV ≤ salvage + 0.0005. |
| F6 P1 | Depreciation GL | Hard-coded Dr 5080 / Cr 1520, posted to the selected company or `'comp-1'` even when assets belonged elsewhere. | Grouped by each asset's own `gl_expense_account` / `gl_accum_dep_account`, in the asset's company. Dated on the last day of the period. Missing accounts raise an error. |
| F7 P1 | Duplicate run | Checked by label string in JS. | Explicit check plus `unique(company_id, period)`. |
| F8 P0 | Payroll GL (audit D) | Dr 5070 gross / Cr **1020 hard-coded** net / Cr 2030 PASI. The selected bank account was ignored. Employer PASI (11.5%) was never booked. | Dr 5070 gross, Dr 5075 employer PASI / Cr 2040 PASI (employee + employer), Cr **the selected bank's `gl_account_code`** (or 2050 Salaries Payable when no bank is chosen). It balances by construction: gross + er = (ee + er) + net. |
| F9 P1 | Payroll scope | All active employees of all companies were paid; status was 'Paid' and the approver was fabricated as "Ahmed Al-Harthy"; the bank fell back to 'ba-1'. | One company. Active + Probation, joined ≤ period end. Status is Paid (with a bank) or Approved (accrued). `approved_by = auth.uid()`. |
| F10 P0 | CoA had no company dimension (audit D) | One global chart, so statements mixed companies. | Accounts are per company (`LedgerAccount.companyId`). 'all' sums by account code across the user's companies. |
| F11 P1 | P&L by name (audit D) | Direct costs found via `name.includes('Fuel'…)`, so the first match only, and renamed accounts dropped out. | Classified by category/subcategory: Revenue; subcategory `/direct/` = direct; `/depreciation/` or 5080 = depreciation; other expenses = opex. Each account is listed by code. The amount is posted movement in the period. |
| F12 P1 | Trial balance mixing (audit D) | Closing = global `account.balance`; opening derived by reversing company-filtered journals, so the result was inconsistent for one company and for back-dated as-of dates. | Opening = `opening_balance`; period = posted lines ≤ as-of; closing = opening + period. Accounts and lines use the same company filter. |
| F13 P1 | Balance sheet | Only exact subcategories 'Current Assets'/'Fixed Assets'/... (other subcategories silently dropped). Equity used `3030 ‖ netIncome` (a plug). | Every Asset/Liability account is included (fixed = subcategory fixed/non-current or code 15xx; long-term = subcategory long/non-current or code 25xx). Equity = equity accounts + "profit not yet closed" (Σrev − Σexp to date). `isBalanced` is reported truthfully. An as-of date is supported. |
| F14 P2 | GL opening | `account.balance − movements after end − range movement` mixed global balance with filtered lines. | `opening_balance + movements before start` |
| F15 P2 | Empty ledger | Showed "Books balanced / Perfect balance". | "No ledger activity yet". The close check is not marked as passed. |

Business rules to confirm (not changed):
- PASI is computed on **basic** salary, as the old code did.
- 'On Leave' employees are excluded from payroll.
- Finance cost sits inside opex, so EBIT = net profit.

## Module inventory

Roles, from the `role_permissions` seed:
- **accounting:** view for every role that can open the page (Finance Manager, Accountant, Management, admins). Create/edit/delete for Finance Manager, Accountant and admins.
- **fixed-assets:** the same as accounting (it maps to the auth module `accounting`).
- **payroll:** view for Finance Manager, Accountant, Management and admins. Create/edit/delete for Finance Manager and admins only.

### C1 Accounting / Journal: route `accounting` (AccountingPage + FinanceOverview)

| Control | Expected | Backend | Tables | Auth | Status |
|---|---|---|---|---|---|
| Tabs Overview/Accounts/Journals | show data | fetchers.chartOfAccounts, journalEntries | accounts, v_account_balances, journal_entries/lines | RLS accounting:view | Fixed: the CoA is consolidated per code; empty states added |
| Post Journal Entry (button) | open form | — | — | hasPermission create | OK |
| Company select (new) | the journal belongs to one company | — | — | — | Added. It was `'comp-1'` when "all" was selected. |
| Account selects | that company's chart only | — | accounts | — | Fixed. Defaults were 5000/2010, which may not exist. |
| Post to Ledger | balanced journal, success only after the await, disabled while pending | `addJournalEntry` → RPC `post_journal_entry` | journal_entries, journal_lines | has_company_access + accounting:create | Fixed |
| Overview KPIs | from real ledger/invoices/banks | service `getTrialBalance/getCompanyProfitLoss/getCompanyBalanceSheet` (YTD) | — | — | Fixed |

### C2 Trial Balance: route `trial-balance`

- **Controls:** as-of date, category filter, export CSV, print.
- **Data:** `getTrialBalance(chartOfAccounts, journalEntries, asOf, selectedCompanyId)`.
- **Fixed:**
  - "Audited" wording removed.
  - Fake "100% Parity" trend removed.
  - Empty state added.
  - Methodology caption added.

### C3 General Ledger: route `general-ledger`

- **Controls:** account, start/end date, export, print. The party SOA tab belongs to B (`getPartyLedger`).
- **Fixed:**
  - Default start date is the start of the current year (was hard-coded 2026-01-01).
  - The `'sup-1'` fallback was removed.
  - Account list is deduplicated.
  - Fake "Records" trend removed.
  - Empty state added.
  - The vehicle plate comes from the line embed.

### C4 Profit & Loss: route `profit-loss`

- **Controls:** start/end date (new, defaults to YTD), print.
- **Data:** `getCompanyProfitLoss(accounts, journals, company, range)`.
- **Removed:**
  - The hard-coded "For Period Ending 22 August 2026".
  - Fake trends.
  - The "Motor Vehicles Fleet Depreciation (5080)" label.
- **Added:** empty sections.

### C5 Balance Sheet: route `balance-sheet`

- **Controls:** as-of date (new), print.
- **Fixed:**
  - Fixed-asset and long-term liability sections now list actual accounts. They used hard-coded rows (1510/1520/1530/2510) that did not add up to the totals.
  - "NO DATA" state added.
  - The difference is shown instead of "100% Parity".

### C6 Depreciation: route `depreciation` (DepreciationPage)

- A vehicle-based **estimate** from vehicle purchase settings (`calculateCurrentBookValue`). It is not ledger data.
- Relabelled as an estimate, pointing to Fixed Assets for posted depreciation. Empty message added.

### C7 Fixed Assets: route `fixed-assets` (AssetModulePage)

| Control | Backend | Status |
|---|---|---|
| Run Auto-Depreciation (quick modal) | `runAutoDepreciation` → RPC `run_depreciation` | Gated by fixed-assets:create. The modal call site is the coordinator's (see below). |
| Add Fixed Asset (quick modal) | `addFixedAsset` → insert fixed_assets (asset_code from E's trigger) | Gated |
| **Edit** (new) | `updateFixedAsset` → update (accumulated depreciation guarded) | Added, gated by edit, async with pending state |
| **Delete** (new) | `deleteFixedAsset` → delete (an FK blocks assets with runs, with a friendly message) | Added, gated by delete |
| Category filter | — | Fixed: options did not match the type ('Machinery', 'IT & Office') |
| Runs tab / breakdown | fetchers.depreciationRuns (with items) | Scoped to the company. The `'JE-POSTED'` fallback was replaced with "Not posted to GL". |

### C8 Payroll: route `payroll` (PayrollPage + PrintablePayslipModal)

| Control | Backend | Status |
|---|---|---|
| Disburse Payroll (quick modal) | `processPayrollRun` → RPC `process_payroll` | Gated by payroll:create |
| Enroll Employee (quick modal) | `addEmployee` → insert employees | Gated |
| **Edit / Delete employee** (new) | `updateEmployee` / `deleteEmployee` (FK blocks employees with payslips; the message suggests Terminated) | Added, gated |
| Payslip (row) | latest processed payslip line | Fixed. It showed a fabricated "August 2026 / Paid / 2026-08-28" payslip for every employee. Now disabled until a run exists. |
| KPIs | projections from current salaries of Active + Probation staff | Relabelled. Fake "100% Settled" and the fixed "7%" removed. |
| Run details | items + employer PASI + bank/accrual description | Fixed. Empty state added. |
| Payslip modal | — | Removed the fabricated company ("Al Hakim National LLC", "AHN", CR 1384920), the fallback bank ("Bank Muscat") and the IBAN. The company is the employee's own company. Bonus and other deductions are now shown. Paid/not-paid wording is truthful. |

### Employee sensitive data (task 3)

RLS on `employees` is `payroll` view, scoped to the company. Readers are admins, Finance Manager, Accountant and Management. Viewer, Fleet and other offices are blocked (tested).

This is acceptable for an MVP, but Management and Accountant can read civil_id, passport and IBAN.

**Recommendation (P2, for G/E):** column-level restriction, for example:
- `revoke select (civil_id, passport_number, iban, bank_account_number, social_security_number) on employees from authenticated`, and
- expose those columns through a SECURITY DEFINER view or RPC gated on `payroll:edit`.

Also found and fixed: the `payroll_items_all` FOR ALL policy let any payroll **viewer** DELETE payslip lines, because DELETE only applies USING. Fixed via the grant revoke (P1).

## Issues

| ID | Sev | Issue | Status |
|---|---|---|---|
| C-1 | P0 | Payroll never credited the selected bank / employer PASI unbooked | Fixed (F8) |
| C-2 | P0 | CoA without company dimension | Fixed (F10) |
| C-3 | P1 | P&L matched account names | Fixed (F11) |
| C-4 | P1 | TB mixing | Fixed (F12) |
| C-5 | P1 | Depreciation math and scope defects | Fixed (F1–F7) |
| C-6 | P1 | Payslip lines deletable by viewers | Fixed |
| C-7 | P1 | Client could rewrite accumulated depreciation, insert or delete runs | Fixed (guards) |
| C-8 | P1 | Fabricated payslips, company, bank, IBAN, approver | Fixed |
| C-9 | P2 | Missing edit/delete UI for assets and employees | Fixed |
| C-10 | P2 | Balance-sheet hard-coded rows | Fixed |
| C-11 | P2 | `v_bank_balances` ignores payroll (and manual journals) on bank GL accounts | **Open → B** |
| C-12 | P2 | Sensitive employee columns visible to Management/Accountant | **Open → G/E** |
| C-13 | P3 | Payslip bank details are the employee's current details, not a snapshot | Open (would need columns on payroll_items) |
| C-14 | P3 | Journal `p_source` is client-supplied (a manual journal could be labelled 'Payroll') | Open: suggest post_journal_entry forces 'Manual' for direct client calls |

## Coordinator integration notes

Spread `fetchers` and `affects` from both services:
- **accounting:** chartOfAccounts, journalEntries, fixedAssets, depreciationRuns
- **hr:** employees, payrollRuns

Mutation signatures (same names; now async):

```ts
addJournalEntry(entry: Omit<JournalEntry,'id'|'entryNumber'|'createdAt'>): Promise<JournalEntry>   // companyId must be a real uuid
addFixedAsset(asset: Omit<FixedAsset,'id'|'assetCode'|'createdAt'|'updatedAt'>): Promise<FixedAsset>
updateFixedAsset(id: string, asset: Partial<FixedAsset>): Promise<void>
deleteFixedAsset(id: string): Promise<void>
runAutoDepreciation(params?: { periodLabel?; runDate?; notes?; processedBy?; autoPostGL?; companyId?: string; period?: string /*YYYY-MM*/ }): Promise<DepreciationRun>
addEmployee(emp: Omit<Employee,'id'|'employeeCode'|'createdAt'>): Promise<Employee>
updateEmployee(id: string, emp: Partial<Employee>): Promise<void>
deleteEmployee(id: string): Promise<void>
processPayrollRun(params: { month; year; paymentDate?; bankAccountId?; autoPostGL?; companyId?: string }): Promise<PayrollRun>
```

`companyId` is required at runtime by `runAutoDepreciation` and `processPayrollRun`; a ServiceError is thrown otherwise.

Pure functions in `services/accounting.ts`. Context wrappers should pass the loaded collections:

```ts
getTrialBalance: (asOf?, cid?) => acc.getTrialBalance(chartOfAccounts, journalEntries, asOf, cid ?? selectedCompanyId)
getGeneralLedger: (code?, s?, e?, cid?) => acc.getGeneralLedger(chartOfAccounts, journalEntries, code, s, e, cid ?? selectedCompanyId, currency)
getCompanyProfitLoss: (cid?) => acc.getCompanyProfitLoss(chartOfAccounts, journalEntries, cid ?? selectedCompanyId)        // optional 4th arg {startDate,endDate}
getCompanyBalanceSheet: (cid?) => acc.getCompanyBalanceSheet(chartOfAccounts, journalEntries, cid ?? selectedCompanyId)    // optional 4th arg asOfDate
```

Also exported:
- `consolidateAccounts(accounts, cid)`: one row per code, for pages and selects.
- `accountBalances`
- `parsePeriod`
- `requireCompany`
- the mappers

My pages call the pure functions directly, so they do not depend on these wrappers. Other pages (Dashboard, Reports) should use them too, rather than `chartOfAccounts` directly, because `chartOfAccounts` now contains one row per company per code.

QuickActionModals call-site changes (coordinator):
- **run-depreciation:**
  - Pass `companyId` (selected company, or a company select when 'all') and `period` (a month input, `YYYY-MM`). A free-text "Period Label" is only accepted if it parses as "Month YYYY".
  - Use `await` + try/catch and disable while pending.
  - Change the text "Dr 5080 / Cr 1520" to "per-asset GL accounts".
  - The "Active Assets in Scope" count should filter by company and include Under Maintenance.
- **run-payroll:**
  - Pass `companyId`.
  - The bank select should list only that company's active bank accounts, and offer a "No bank – accrue to Salaries Payable" option.
  - The text should read "Dr 5070 + 5075 / Cr 2040 PASI / Cr bank or 2050".
  - The estimate should be net (gross − PASI) of Active + Probation staff of that company.
  - Use `await`.
- **add-fixed-asset:**
  - The GL code `'1500'` should be `'1510'` (vehicles); `'1550'` does not exist in the template, so use 1530 or add the account.
  - `companyId || 'comp-1'` should require a real company.
  - Use `await`.
- **add-employee:**
  - `companyId: 'comp-1'` should use the selected or chosen company.
  - Remove the fabricated `nationalId: NID-xxxxxx` fallback.
  - `assignedVehiclePlate` (free text) is not stored; send `assignedVehicleId` from a vehicle select instead.
  - Add an employer PASI % field (default 11.5).
  - Do not send `totalGrossSalary` (the DB generates it; it is ignored).
  - Use `await`.
- **addJournalEntry:** already async in AccountingPage. QuickActionModals imports it, so check for any other call site.

## Requests to other agents

- **E:**
  - The CoA template already contains 1100/1520/2040/2050/5070/5075/5080, which matches my RPCs. No new codes are needed.
  - Optionally add the C-12 column restriction.
  - My test is standalone (own stub). It could be ported to `harness.mjs`.
- **B:** `v_bank_balances` derives bank balances from payments only. Payroll net pay credited to a bank GL account, and manual journals, are not reflected (C-11). Suggest deriving the bank balance from `v_account_balances` on `bank_accounts.gl_account_code`, or including journal lines.
- **G:** C-12 (sensitive employee columns).
- **D:** Dashboard/Reports must not read `chartOfAccounts.balance` per code without consolidating by company. Use `consolidateAccounts` or the statement functions.
- **Shared types:** `src/types/hr.ts` gained optional `PayrollLineItem.pasiEmployerContribution` and `PayrollRun.totalEmployerPasi` (additive).
