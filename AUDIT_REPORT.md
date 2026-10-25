# ERP Audit Report — 2026-10-25

## A. Inventory & architecture

| Item | Finding |
|---|---|
| Stack | React 18 + TypeScript + Vite + Tailwind, single-page app |
| Routing | `switch` on `UIContext.currentPage` (hash-synced) in `src/App.tsx` |
| Data layer | **No backend or database.** All 27 collections live in React state in `src/context/FleetContext.tsx`, seeded from `src/data/initialSeedData.ts`, persisted to browser `localStorage` |
| Auth | **No real authentication.** `AuthContext` starts as a Super Admin; a header role switcher selects any seeded user. RBAC is client-side only (`canAccessPage`, `hasPermission`, `canApprove`) |
| Tests / lint | None configured. Checks available: `tsc --noEmit`, `vite build` |

Modules discovered: **31 routed pages** (the app has 31, not 45–50). Every route in `App.tsx` matches a page file, and no orphaned pages were found. All 31 were inspected individually.

**Not applicable to this codebase:** Supabase/RLS, server APIs, migrations, server-side authorization, file storage, background jobs. Uploaded files are stored as data URLs in localStorage.

## B. Issue summary (actual counts)

| Severity | Found | Fixed | Verified in browser | Open (documented) |
|---|---:|---:|---:|---:|
| P0 | 3 | 3 | 1 (overpayment guard) | 0 |
| P1 | 22 | 19 | 2 (quick-action RBAC, payment numbering) | 3 |
| P2 | 33 | 25 | 0 | 8 |
| P3 | 10 | 5 | 0 | 5 |

"Fixed" means the change compiles, the build passes, and all 31 pages render. Only the three flows listed above were exercised end to end in the browser.

## C. Module-by-module

| Module | Status | Key issues fixed |
|---|---|---|
| Dashboard | Fixed | Office selector ignored by all KPIs; tyre severity; expired registrations flagged on sold/scrapped vehicles. Open: hard-coded "+14.2%" trend and reminder card |
| Companies | Fixed | **P1 data loss:** a mount effect silently called `resetToDefaultData()` (wiping all data) whenever the companies list didn't match the seed. Removed; the manual reset now asks for confirmation |
| Vehicles / Vehicle detail | Fixed | Status filter incomplete; stale id showed the wrong vehicle; dead Download button; hard-coded spare tyre; oil "next due" used an unsorted record |
| Maintenance / Work orders | Fixed | No permission checks on status buttons; Requested orders could be completed without approval; Waiting-for-Parts orders had no way back; category filter showed 6 of 26 |
| Oil / Tyres | Fixed | No office scoping; search couldn't find plates; tyre counts included scrapped tyres |
| Accidents | Fixed | KPIs unscoped; fabricated "+78% covered"; incomplete status filter |
| Profitability | Fixed | Search never matched (nested row data); office scoping missing. Open: fabricated `fuelCost` (unused) |
| Expenses / Invoices / Payments | Fixed | KPIs ignored company filter; placeholder bill scan on sales invoices |
| Accounting (journal) | Fixed | No permission check or validation; zero, negative and one-sided lines could be posted |
| Trial balance | Fixed | Filtered view showed totals for the whole ledger |
| Reconciliation | Fixed | **P1:** "received" amount was hard-coded to 294 for every 3-way match. Picker included credit notes |
| Depreciation / Fixed assets | Fixed | Company scoping; NaN % when cost was 0; **duplicate-period runs now blocked** |
| Payroll | Fixed | Company scoping; **duplicate month runs now blocked** |
| P&L / Balance sheet | Inspected, open | Display only. P&L reads global account balances (see D) |
| Suppliers / Customers | Inspected | Display-only lists; entities have no `companyId` |
| Documents | Fixed | Download only showed a toast. Deletion is now audit-logged |
| Approvals | Fixed | Required comment was not enforced |
| Audit logs | Fixed | Fabricated IP shown for records without one |
| Reports | Fixed | 11 of 16 reports silently showed the expense table (now flagged "not yet implemented"); vehicle exports had empty columns. Open: AP aging buckets are fabricated percentages |
| Notifications | Inspected | No issues |
| Users & roles | Inspected, open | Permission matrix is hard-coded and does not match `AuthContext` |
| Settings | Fixed (via context) | Backup import now validates every collection before writing any state |

## D. Data-layer report (`FleetContext.tsx`)

Fixed:
- **P0 ID collisions:** `Date.now()` IDs → `crypto.randomUUID()`. Document numbers came from `length + 1` and repeated after deletes; they now use `nextSeq` (highest existing number + 1). Verified: a new payment became PAY-2026-0090, not PAY-2026-0003.
- **P0 overpayment:** `addPayment` rejects amounts ≤ 0 or above the outstanding balance. Before, bank and party balances moved by the full amount while the invoice was clamped at 0. Verified in the browser.
- **P0 unbalanced journals:** `addJournalEntry` rejects entries where Dr ≠ Cr, or the total is 0.
- **P1 orphans:** `deleteVehicle` refuses when linked records exist.
- **P1 duplicate records:** `updateWorkOrderStatus` created maintenance records and audit logs inside a state updater. React StrictMode runs updaters twice, so this produced duplicates. Moved outside the updater.
- Import validation, document-delete audit logging, depreciation and payroll duplicate guards.

Open (P1/P2: these need product decisions about accounting design):
1. **P1:** payments, invoices and credit notes **do not post to the general ledger**, so the trial balance, P&L and balance sheet do not reflect AR/AP activity.
2. **P1:** the chart of accounts has no company dimension, so the P&L, balance sheet and trial balance closing balances are always consolidated. The trial balance mixes global closing balances with company-filtered movements.
3. **P2:** credit notes don't reduce the original invoice or party balance and can be duplicated. `addInvoice` trusts the caller's `grandTotal`. P&L direct costs match account names instead of codes. Payroll doesn't debit the bank account.
4. **P2:** `localStorage` quota errors are only logged, so large uploads can silently stop being saved. No upload size or type limit.

## E. Security report

- **Architectural (not fixable client-side):** there is no authentication, and all RBAC runs in the browser. Any user can switch to Super Admin or edit localStorage. Production use needs a backend with server-side auth and authorization.
- Fixed: quick-action modals (create vehicle, invoice, payment, payroll, etc.) skipped all permission checks. They now require page access plus `create` permission (`UIContext.openQuickModal`). **Verified:** the Viewer role gets "Permission denied".
- Fixed: the invoice viewer modal could be opened from global search by roles without finance access.
- Fixed: work-order status buttons and journal posting now check permissions.
- No secrets, `dangerouslySetInnerHTML` or `innerHTML` found. Open (P3): CSV export doesn't neutralize cells starting with `=`, `+`, `-` or `@` (formula injection).

## F. Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `vite build` | Pass (1.1 MB chunk warning, pre-existing) |
| All 31 routes render (scripted hash navigation) | Pass, 0 console errors |
| Viewer → Quick action "Add New Vehicle" | Blocked with "Permission denied" ✔ |
| Payment of 999 against a 294 invoice | Rejected with outstanding-amount message ✔ |
| Payment of exactly 294 | Accepted; numbered PAY-2026-0090 ✔ |
| Automated unit/E2E tests | **None exist.** No test framework is configured, and none was added |

Not exercised in the browser: journal-imbalance rejection, vehicle-delete guard (no UI calls `deleteVehicle`), payroll/depreciation duplicate guards, work-order completion dedupe, and the page-level KPI scoping fixes. These were verified by code review and type checking only.

## G. Files changed

`src/context/FleetContext.tsx`, `src/context/UIContext.tsx`, `src/components/common/QuickActionModals.tsx`, `src/components/ui/{Modal,DataTable}.tsx` (Escape closes modals; page index clamped after deletes; numeric-aware sort), `src/utils/{date,export}.ts` (dates shifted by a day in UTC-negative timezones; UTF-8 BOM so Excel reads CSVs correctly; object-URL leak), and 24 page files. No schema or infrastructure changes. `.claude/launch.json` was added for the dev preview.

## H. Release recommendation

**Not ready for release** as a production ERP. The blockers are architectural: no server-side authentication or authorization, browser-only persistence, and AR/AP not posted to the general ledger, so financial statements are incomplete. As a single-user demo or prototype it is conditionally ready: the verified critical data-integrity and data-loss defects are fixed, and the open P2/P3 items are listed above.
