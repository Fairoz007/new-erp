# UI inspection notes (2026-11-15)

Brief: `docs/UI_INSPECTION_PROMPT.md`. One pass: static scan, five area reviews by reading the code
(run in parallel, one set of files each), a signed-out browser pass, then checks.

## Static scan (`npm run scan:controls`, `scripts/dead-controls.mjs`)

| Rule | Before (HEAD 63a533c) | After |
|---|---|---|
| `<Button>`/`<button>` with no action, empty / log-only / alert / preventDefault-only handlers | 0 | 0 |
| `href="#"`, `href=""`, `to="#"`, links to routes that do not exist | 0 | 0 |
| "coming soon", "TODO", "not implemented", "lorem" text, `alert()` | 0 | 0 |
| `disabled` hard-coded true with no `title` | 0 | 0 |
| Navigation to a page id with no `case` in `src/App.tsx` (new rule) | 0 | 0 |
| `<Tabs>` id with no matching panel or case (new rule) | 4 | 0 (4 deliberate) |

The four tab hits are deliberate and marked `// controls-ok:` on the line:
- `InvoicesPage.tsx` "draft" and "paid": the view id goes to the server as the list filter (`useInvoiceList({ view })`).
- `LeavePage.tsx` "balances" and `AttendancePage.tsx` "month": each is the else-branch of a two-way ternary.

The earlier fix passes had already cleared the dead-control patterns. So this pass mostly fixed
controls that work but break a rule: missing busy states, actions that fail on click instead of
being disabled by permission, made-up fallback text, and responsive layout.

## Pages

"Code" means the page was reviewed by reading the code and fixed. "Browser" is the signed-in click
and width check, which needs the owner signed in to the in-app browser. That never happened in this
session, so every signed-in page is **Not verified** in the browser.

| Page | Fixed (code review) | Removed | Result |
|---|---|---|---|
| Sign-in, reset password | Fits at 375/768/1280; empty-form validation; Back works; console clean | 0 | **Pass** (browser, signed out) |
| Set password (invite/recovery link) | Fits at 375 by code; only reachable from an emailed link | 0 | Fixed (code) · Not verified |
| Shell: header, sidebar, office switcher, quick add, notifications drawer | Office and Add Entry menus fit the screen on a phone with their own scroll. Quick add is hidden when the role can create nothing. "Offices" menu item is gated by page access. Drawer filters are 40 px tall and long text wraps. AuthGate Sign out shows busy and error | 0 | Fixed · Not verified |
| Shared: Modal, DataTable, FilterControls, Tabs, PageHeader, Printable invoice/payslip, QuickActionModals (13 forms), DocumentUploadZone, Transfer/Sharing modals | Footers wrap and stay reachable. Cancel is disabled while saving. Export and filter menus stay inside the screen. Long titles wrap. Upload shows busy | 0 | Fixed · Not verified |
| Dashboard (and role dashboards) | Alert actions open the right vehicle tab and check permission per office. Stat cards link only to pages the role can open. Fake "trend" badges replaced with real sub-values. Leave widget shows a load error with Retry. Expiry rows are disabled when they can't open anything | 0 | Fixed · Not verified |
| Vehicles, vehicle detail | Header actions wrap; tab content and buttons fit a phone | 0 | Fixed · Not verified |
| Drivers | No change needed | 0 | Not verified |
| Maintenance / work orders | Approve is disabled, with a title, above the user's approval limit for that office. Permission is checked per office. Each status button shows its own spinner. Kanban columns scroll inside their box. "Final Approved Cost", "Fleet Supervisor" and "Corporate" placeholders replaced with real values or "—" | 0 | Fixed · Not verified |
| Tyres, oil, accidents | Layout fixes. Accidents: made-up sub-values ("Bodyshop estimates", "Settled by underwriters") removed. Edit is gated correctly | 0 | Fixed · Not verified |
| Documents | Download shows a spinner. View and Download explain in a title when no file is attached | 0 | Fixed · Not verified |
| Expenses | Delete shows busy | 0 | Fixed · Not verified |
| Invoices | Header actions wrap; tab ids marked deliberate | 0 | Fixed · Not verified |
| Payments | Detail footer wraps. "General Account" fallback replaced with "—" | 0 | Fixed · Not verified |
| Parties, customers, suppliers | Contracts: delete busy. Total tiles fit on a phone. "Export all fields" is disabled, with a title, when the list is empty. Made-up "Tax Reg OK" option text removed | 0 | Fixed · Not verified |
| Finance: bank reconciliation, cash flow, budgets, period close, reconciliation | Import, delete-statement, delete-line and delete-budget show busy. CSV says why it is disabled. Rows wrap | 0 | Fixed · Not verified |
| Accounting: chart, journals, GL, trial balance | Post to Ledger shows a spinner. Retry links are 44 px tall on phones. Fake "∑(Debits) === ∑(Credits)" sub-value removed | 0 | Fixed · Not verified |
| P&L, balance sheet | Long account names wrap; amounts stay on one line; Retry is tappable | 0 | Fixed · Not verified |
| Depreciation / fixed assets | Save and Delete show a spinner | 0 | Fixed · Not verified |
| Profitability, reports (every report) | Layout fixes; Print and PDF errors show inline | 0 | Fixed · Not verified |
| Approvals | Journals tab count follows the office switcher. Confirm shows busy and says why it is disabled. The dialog can't be closed mid-save | 0 | Fixed · Not verified |
| HR: employees, attendance, leave, HR setup | Long employee names truncate with a title. Leave dates stack on a phone. Retry and Document buttons are tappable | 0 | Fixed · Not verified |
| Payroll | Layout fixes (earlier pass) | 0 | Fixed · Not verified |
| Notifications | Retry is tappable; layout fixes | 0 | Fixed · Not verified |
| Offices, companies | Edit is gated per office. Consolidated view has `aria-pressed`. Retry is tappable | 0 | Fixed · Not verified |
| Users & roles, audit logs | No change needed | 0 | Not verified |
| Settings, setup wizard / field builder | Retry is tappable; form layout fixes | 0 | Fixed · Not verified |

Totals: 93 files changed under `src/` (this pass plus an earlier unfinished pass of the same
brief, which was kept and reviewed). Controls removed: 0. The `add-journal-entry` quick-modal type
was removed: nothing used it, so no screen lost a control.

## Open

None. No control needed a missing feature, so nothing was removed or disabled for that reason.

Left as they are, by choice:
- Quick-add forms: Cancel closes at once, while X and Escape ask first if something was typed. Cancel still works.
- Report preview: "Download PDF" is greyed out while a PDF is being made, but only "Print" shows the spinner.

## Not verified, and why

- **Every signed-in page in a browser** (clicks, dialogs, exports, pagination, office switcher,
  and the hash-based width sweep at 375/768/1280). The owner did not sign in to the in-app browser
  during this session. The brief forbids typing passwords or creating accounts, so these checks were
  done by reading the code only.
- **Set password screen**: only reachable from an emailed invite or recovery link.
- No sample records were created and no database changes were made.

## Checks

`npm run lint`, `npm run test:unit` (100 passed), `npm run test:db`, `npm run build`,
`npm run bundle:check` (227.1 kB initial, under the 250 kB budget), `npm run scan:secrets` and
`npm run scan:controls` all pass.
