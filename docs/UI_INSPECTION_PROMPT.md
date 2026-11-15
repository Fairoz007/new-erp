# UI inspection, dead-button and responsiveness fix: one prompt, one pass

Inspect every screen of the app, make every button, link, menu item and tab do what its label
says, and make every screen work at phone (375 px), tablet (768 px) and desktop (1280 px) widths. Work in one pass, in the order below, and do not stop to ask between steps. Keep context
small: use scripts and `grep` to find things, read only the lines you change, never dump whole
files or pages. Finish with one commit and push.

## Rules

- **Fix, don't add.** A control either works or goes. No new features, screens or settings. If a
  control needs a missing feature, remove it (or disable it with a `title` that says why) and list
  it under "Open" in the notes.
- **A working control** has a real action (handler, `type="submit"`, link or route), shows busy
  while it works, shows an error when it fails, respects the user's permission (hidden or
  disabled, never a click that fails), and changes what its label says. Empty handlers, `alert()`,
  `console.log`, "coming soon", `#` links, buttons that close nothing, or a toast with no action are
  dead.
- **No fake data on screen** (made-up names, numbers, initials badges, sample charts).
- Security, office scoping and the database are not changed. No migration unless a button is dead
  because a database function is missing; then add the migration and push it
  (`supabase db push --linked --yes`, project `fpeniljpqigpeqtsgizr` is development).
- Never create accounts, type passwords or send invitations. Signed-in checks happen only after
  the owner signs in to the in-app browser; until then, record them as not verified.
- Sample records are named "Sample…" and removed afterwards, or made in a rolled-back transaction.
- Never commit `.env`, `backups/`, `.claude/` or `logs example pdf etc /`.

- **Responsive** means, at 375, 768 and 1280 px: the page never scrolls sideways (wide tables
  scroll inside their own box); header actions and filters wrap instead of overflowing; dialogs and
  side panels fit the screen with their own scroll and a reachable footer; form fields stack on a
  phone; touch targets are at least 40 px high on a phone; text is not cut off (long names wrap or
  truncate with a `title`); the sidebar is a drawer on a phone and the office switcher is reachable.

## Split into subagents

Step 1 runs first (one shared work list). Then one subagent per area does steps 3 (by reading the
code) and 4 for its own files only, in parallel; files are never shared between subagents, and
subagents do not commit. Areas:
1. Shell and shared components: `src/App.tsx`, `src/components/**`, `src/context/**`, `src/hooks/**`.
2. Fleet: dashboard, vehicles, drivers, maintenance, tyre-management, oil-management, accidents, documents.
3. Money in and out: invoices, payments, expenses, finance, reconciliation, parties, customers, suppliers, approvals.
4. Accounting and reports: accounting, profit-loss, balance-sheet, depreciation, profitability, reports.
5. People and admin: hr, payroll, users-roles, settings, offices, companies, notifications, audit-logs, setup, auth.
A subagent that finds a problem in a shared component reports it instead of editing it. The main
session then fixes shared issues, runs step 2 and the browser checks, reviews every change, and
does step 5.

## Steps

**1. Static scan (all screens at once).** Add `scripts/dead-controls.mjs` (TypeScript AST over
`src/**/*.tsx`, tests excluded) that lists, as `file:line reason`:
- `<Button>`/`<button>` with no `onClick`, `type="submit"`, `form` or props spread;
- handlers that are empty, only `console.log`/`alert`, or only `preventDefault`;
- `href="#"`, `href=""`, `to="#"`, links to routes that do not exist in the router;
- text "coming soon", "TODO", "not implemented", "lorem";
- `<Tabs>`/menu items whose id has no matching panel or case;
- `disabled` hard-coded `true` with no `title`.
Add `npm run scan:controls`. Run it; this list is the work list.

**2. Signed-out browser pass.** Start the dev server (`preview_start` "vite"). On sign-in, sign-up,
reset password and every public route: click each control, check the console for errors and
`read_page` for the result, at 375, 768 and 1280 px (`resize_window`); check `scrollWidth` equals
the window width. Fix what fails.

**3. Signed-in browser pass (when the owner has signed in).** For each sidebar page in order: open
it, click every header action, tab, filter, row menu item, export (CSV, PDF, Print), Add / Edit /
Delete / Approve dialog (open, validate empty, cancel; save only with "Sample…" data, then delete
it), pagination and the office switcher. Check the console after each page, and repeat at 375 and 768 px. One line per page in
the notes table. Pages: dashboard, vehicles, drivers, maintenance, tyres, oil, accidents,
expenses, invoices, payments, parties (customers, suppliers), finance (bank, cash flow,
reconciliation, budgets), accounting (chart, journals, GL, trial balance, P&L, balance sheet,
depreciation), payroll and HR, documents, approvals, notifications, reports (every report),
offices, users & roles, audit logs, settings.

**Page sweep (fast, read-only).** Pages open by URL hash (`#vehicles`, `#invoices`, …; the list is
the `case` ids in `src/App.tsx`). With `javascript_tool`, at each width set `location.hash`, wait
about 2 s, and record per page: `document.documentElement.scrollWidth` against `innerWidth`, the
first element inside `main` that sticks out past the right edge without a scrolling parent, buttons
under 32 px high, and `console.error` calls. That gives one table of every page at 375, 768 and
1280 px in a few calls; fix the pages it flags, then run it again.

**4. Fix.** Group fixes by file. For each: the smallest change that makes the control work, or
remove it. Re-run `npm run scan:controls` until it prints nothing (or only lines listed as
deliberate in the notes, with the reason).

**5. Finish.** Run `npm run lint`, `npm run test:unit`, `npm run test:db`, `npm run build`,
`npm run bundle:check`, `npm run scan:secrets`. Write `docs/UI_INSPECTION_NOTES.md`:
- the scan result before and after (counts);
- a table: page, controls checked, fixed, removed, result (Pass / Fixed / Not verified);
- "Open": controls removed or disabled because a feature is missing;
- what was not verified and why.
Add a short section to `AUDIT_REPORT.md`. One commit ending with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, push, and check `main` matches
`origin/main`. Final report: counts fixed / removed / not verified, and the open list.
