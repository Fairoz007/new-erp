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

"Code" means the page was reviewed by reading the code and fixed. "Pass (browser)" means it also
passed the signed-in browser pass, run after the owner signed in. Every page was checked at 375, 768
and 1280 px: no sideways scroll, nothing sticking out past the right edge, no console errors, and
on a phone no control under 32 px. On every page each tab was clicked, and each Add / New / Create /
Record / Upload / Edit dialog was opened, submitted empty, and cancelled. The 18 Add dialogs were
also opened at 375 px; all fit the screen with the save button reachable. On a phone the sidebar
drawer opens over a backdrop and closes when you pick a page, and the office switcher lists every
office on screen.

Found and fixed in the browser pass:
- **Depreciation** (and any page with a chart): a 400 px screen-reader `<table class="sr-only">` in
  `DashboardCharts.tsx` widened the phone viewport to 441 px, because tables ignore the 1 px width.
  It is now wrapped in an `sr-only` div.
- **Oil, Record oil change**: the quantity field passed `NaN` as its value, which logged a React
  warning. It now shows blank, the same as before, without the warning.
- **Attendance**: the date and row inputs were 28 px tall on a phone; now at least 40 px.

| Page | Fixed (code review) | Removed | Result |
|---|---|---|---|
| Sign-in, reset password | Fits at 375/768/1280; empty-form validation; Back works; console clean | 0 | **Pass** (browser, signed out) |
| Set password (invite/recovery link) | Fits at 375 by code; only reachable from an emailed link | 0 | Fixed (code) · Not verified |
| Shell: header, sidebar, office switcher, quick add, notifications drawer | Office and Add Entry menus fit the screen on a phone with their own scroll. Quick add is hidden when the role can create nothing. "Offices" menu item is gated by page access. Drawer filters are 40 px tall and long text wraps. AuthGate Sign out shows busy and error | 0 | Fixed · Pass (browser) |
| Shared: Modal, DataTable, FilterControls, Tabs, PageHeader, Printable invoice/payslip, QuickActionModals (13 forms), DocumentUploadZone, Transfer/Sharing modals | Footers wrap and stay reachable. Cancel is disabled while saving. Export and filter menus stay inside the screen. Long titles wrap. Upload shows busy | 0 | Fixed · Pass (browser) |
| Dashboard (and role dashboards) | Alert actions open the right vehicle tab and check permission per office. Stat cards link only to pages the role can open. Fake "trend" badges replaced with real sub-values. Leave widget shows a load error with Retry. Expiry rows are disabled when they can't open anything | 0 | Fixed · Pass (browser) |
| Vehicles, vehicle detail | Header actions wrap; tab content and buttons fit a phone | 0 | Fixed · Pass (browser) |
| Drivers | No change needed | 0 | Pass (browser) |
| Maintenance / work orders | Approve is disabled, with a title, above the user's approval limit for that office. Permission is checked per office. Each status button shows its own spinner. Kanban columns scroll inside their box. "Final Approved Cost", "Fleet Supervisor" and "Corporate" placeholders replaced with real values or "—" | 0 | Fixed · Pass (browser) |
| Tyres, oil, accidents | Layout fixes. Accidents: made-up sub-values ("Bodyshop estimates", "Settled by underwriters") removed. Edit is gated correctly | 0 | Fixed · Pass (browser) |
| Documents | Download shows a spinner. View and Download explain in a title when no file is attached | 0 | Fixed · Pass (browser) |
| Expenses | Delete shows busy | 0 | Fixed · Pass (browser) |
| Invoices | Header actions wrap; tab ids marked deliberate | 0 | Fixed · Pass (browser) |
| Payments | Detail footer wraps. "General Account" fallback replaced with "—" | 0 | Fixed · Pass (browser) |
| Parties, customers, suppliers | Contracts: delete busy. Total tiles fit on a phone. "Export all fields" is disabled, with a title, when the list is empty. Made-up "Tax Reg OK" option text removed | 0 | Fixed · Pass (browser) |
| Finance: bank reconciliation, cash flow, budgets, period close, reconciliation | Import, delete-statement, delete-line and delete-budget show busy. CSV says why it is disabled. Rows wrap | 0 | Fixed · Pass (browser) |
| Accounting: chart, journals, GL, trial balance | Post to Ledger shows a spinner. Retry links are 44 px tall on phones. Fake "∑(Debits) === ∑(Credits)" sub-value removed | 0 | Fixed · Pass (browser) |
| P&L, balance sheet | Long account names wrap; amounts stay on one line; Retry is tappable | 0 | Fixed · Pass (browser) |
| Depreciation / fixed assets | Save and Delete show a spinner | 0 | Fixed · Pass (browser) |
| Profitability, reports (every report) | Layout fixes; Print and PDF errors show inline | 0 | Fixed · Pass (browser) |
| Approvals | Journals tab count follows the office switcher. Confirm shows busy and says why it is disabled. The dialog can't be closed mid-save | 0 | Fixed · Pass (browser) |
| HR: employees, attendance, leave, HR setup | Long employee names truncate with a title. Leave dates stack on a phone. Retry and Document buttons are tappable | 0 | Fixed · Pass (browser) |
| Payroll | Layout fixes (earlier pass) | 0 | Fixed · Pass (browser) |
| Notifications | Retry is tappable; layout fixes | 0 | Fixed · Pass (browser) |
| Offices, companies | Edit is gated per office. Consolidated view has `aria-pressed`. Retry is tappable | 0 | Fixed · Pass (browser) |
| Users & roles, audit logs | No change needed | 0 | Pass (browser) |
| Settings, setup wizard / field builder | Retry is tappable; form layout fixes | 0 | Fixed · Pass (browser) |

Totals: 93 files changed under `src/` (this pass plus an earlier unfinished pass of the same
brief, which was kept and reviewed). Controls removed: 0. The `add-journal-entry` quick-modal type
was removed: nothing used it, so no screen lost a control.

## Open

None. No control needed a missing feature, so nothing was removed or disabled for that reason.

The two inconsistencies left open earlier are now fixed:
- Quick-add forms: Cancel now asks before discarding typed input, like X and Escape. `Modal`
  shares its guarded close through `useModalRequestClose()`, and the 13 quick-add Cancel buttons use it.
- Report preview: the spinner now shows on the button that was clicked, "Download PDF" or "Print".

## Follow-up pass: exports, row actions, pagination, a Sample record

Exports and printing were clicked on every page. The page caught each file before it was saved, so
nothing was written to disk, and the print frame was stubbed so no print dialog opened. Every
register's Export menu works: "View as document" opens the document view, Print goes to the print
frame, Download PDF gives a real PDF (about 280 KB on the letterhead), and Download CSV gives a CSV.
The statements (trial balance, GL, P&L, balance sheet, cash flow), Reports and "Export all fields"
on customers and suppliers also produce their files.

**Found and fixed: Settings → Data export → Export JSON always failed** with "more than one
relationship was found for 'v_journal_list' and 'journal_lines'". The view exposes `id` and
`reversed_by_id`, and both match `journal_lines.entry_id` through the same foreign key, so PostgREST
cannot embed the lines and a hint cannot pick one. The journal export and the journal register
(`journalSource`) now read the view without the embed. A new `withJournalLines()` helper then loads
the lines by `entry_id`, paged. The export now gives 15 entries with 34 lines, matching the database,
all balanced. No database change.

Row actions: the first row's View / Open / Edit / Details / Sharing / Update / Profile / Dossier /
Voucher buttons were clicked on every page. Each opens its dialog, side panel or detail page.
Users & Roles "Edit" opens the Access panel under the table. Pagination: the audit log has more than
one page and Next moves to it. Every other list fits on one page, so its Next is disabled. Attendance's
day arrows move the date.

Sample record: a Draft budget, "Sample UI check budget", was created, given one account line and
saved, then deleted with the Delete button after the "Delete this budget?" prompt. The database has
no budget or lines left.

## Not verified, and why

- **Approve, Reject, Post, Reverse, Pay and Close period** on real records: not clicked, because they
  change posted or real data and can't simply be undone. Checked in code only (busy state, error
  handling, permission, confirmation). The Sample budget covered the delete path.
- **The printed page itself**: the print frame was stubbed, so the browser print dialog was not opened.
- **Set password screen**: only reachable from an emailed invite or recovery link.

### Writes made by the browser pass, and how they were undone

The "submit empty" step treated pre-filled forms as empty, so it saved some of them:
- **Edit office (Duqm, Head, Nisfa):** saved several times with their existing values. The first
  save changed only `bank_details`, from `{}` to the same five fields with empty strings. That was
  set back to `{}` on all three offices. The later saves changed nothing (checked in `audit_logs`).
- **New budget 2026:** created a Draft budget, "Operating budget 2026", for Duqm Office with no
  lines. It was deleted by id.

The `audit_logs` rows for these saves remain, because that table is append-only. The database is
the development project (fpeniljpqigpeqtsgizr).

## Checks

`npm run lint`, `npm run test:unit` (100 passed), `npm run test:db`, `npm run build`,
`npm run bundle:check` (227.1 kB initial, under the 250 kB budget), `npm run scan:secrets` and
`npm run scan:controls` all pass.
