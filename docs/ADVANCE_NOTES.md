# Advance notes (docs/ADVANCE_PROMPT.md)

Running log of the "make it advanced, no new features" brief: defects found, defaults chosen,
measurements, what is verified and what is not. One section per phase. Feeds the final section
of `AUDIT_REPORT.md`.

## Environment for this run

- **No staging project is connected.** `.env.local` does not exist and no project ref is linked
  (checked 2026-11-12). The user chose to proceed locally. Consequences, for every phase:
  - Browser checks can only reach the screens that render without a database (the
    "Database connection not configured" screen, and the sign-in screen when a placeholder URL
    is built in). Signed-in pages, the Setup Wizard and per-role logins are **not verified in a
    browser** until staging is connected.
  - `npm run test:e2e` (remote suite) and the Playwright suite cannot run; both refuse to start
    without staging credentials, by design.
  - Database behaviour is verified with PGlite (`npm run test:db`), which runs every migration.
  - Performance at the target volumes is measured on PGlite with
    `scripts/staging-volume-seed.mjs --pglite` (same SQL, same data set as staging). PGlite is a
    single-threaded WebAssembly Postgres, so absolute times are pessimistic; the relative change
    (before/after) and the row counts per request are what matter.
- Production (`fpeniljpqigpeqtsgizr`) was not linked, pushed, seeded or queried.

## Out of scope (would be new features)

Items noticed during the work that would need a new feature. Not built.

| Item | Why it is out of scope |
|---|---|
| Trip log for trip-based fleet utilization (AUDIT_REPORT K.3) | New entity and workflow |

---

## Phase 0: Baseline

### What could be run

| Check | Result |
|---|---|
| `npm run build` | Pass |
| `npm run test:db` | Pass (888 checks before this brief) |
| `npm run test:e2e` | **Not run.** Exits with "SUPABASE_URL is not set …"; needs staging keys. `--dry-run` passes. |
| Setup Wizard with two offices, login per role, every page at desktop and 375 px (K.1) | **Not run in a browser** (no staging). The database side of the same flow is covered by `20261112001200_e2e_fresh_install.test.mjs`. |
| Local preview, desktop and 375 px | Only the "Database connection not configured" screen renders. No horizontal scroll at 375 px; one console warning (the missing env vars), no errors. |

### Measurements (baseline, before any Phase 1 change)

**Bundle** (`node scripts/bundle-report.mjs` after `npm run build`). "Initial JS" is the entry
script plus every `modulepreload` Vite put in `index.html`, i.e. what must download before the
first screen.

| Chunk | gzip |
|---|---|
| vendor-pdf (jsPDF, autotable, html2canvas) | 170.4 kB |
| vendor-misc | 121.0 kB |
| index (app entry, includes the dashboard) | 103.7 kB |
| vendor-charts (recharts) | 56.7 kB |
| vendor-supabase | 56.0 kB |
| vendor-react | 54.4 kB |
| **Initial JS total** | **562.3 kB** (target < 250 kB) |
| All JS | 759.4 kB |

The PDF and chart libraries are preloaded on every visit although they are used only by
exports and dashboards: the `manualChunks` rule groups them into vendor chunks that the entry
chunk imports.

**Lighthouse 12.8.2** (`scripts/lighthouse.sh`, production build served by `vite preview`, sign-in
screen only, since nothing behind sign-in renders without staging):

| Preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT |
|---|---|---|---|---|---|---|---|
| Mobile (simulated slow 4G, 4× CPU) | 70 | 81 | 100 | 91 | 4.8 s | 4.8 s | 0 ms |
| Desktop | 98 | 81 | 100 | 91 | 0.8 s | 1.0 s | 0 ms |

Accessibility failures on the sign-in screen: inputs without associated labels, and secondary
text (`text-slate-400`, #7B8581 on white, 3.9:1) below 4.5:1.

**Time to first usable screen after sign-in:** not measurable without staging. By construction,
the Phase 0 app fetches 4 collections before showing any page and then the other 23 in the
background (every row of every collection the user can see, in pages of 400). At the target
volume that is ~1,250 requests for journal lines alone (see below).

**Slowest queries:** the staging dashboard is not available. The same queries were timed on
PGlite with the target data set — see "Database at target volume" below.

### Database at target volume (PGlite, scale 1)

The before/after timings of the same queries are in the Phase 1 section ("Database at target
volume: before and after"), measured in one run so both sides use the same data.

### Staging data set

- `scripts/staging/volume-seed.sql` — the data set at the target volumes (10 offices, 500 vehicles,
  300 employees, 50,000 invoices, ≥ 500,000 journal lines, ≥ 100,000 audit rows). Invoices go
  through `post_invoice` and `record_payment`, so balances and the audit trail are real.
  Everything it creates is marked (`VOL01…` offices, `VOL-…` numbers, "Staging volume" names).
  It refuses to run unless the guard `app.volume_seed_ok = 'staging'` is set, and refuses a
  second run.
- `scripts/staging-volume-seed.mjs` — the only way to run it. `--pglite` loads it into a local
  in-memory database and times the app's queries. `--print --project-ref <ref>` writes the SQL
  (guard included) for the staging SQL editor. Both refuse the production ref. The script never
  connects to a Supabase project itself.

### Defects found and fixed in this phase

| # | Page / area | Steps | Severity | Fix |
|---|---|---|---|---|
| D0-1 | 18 files: every form that defaults a date to "today" (expenses, invoices, payments, journals, reversals, maintenance, accidents, depreciation, contracts, transfers, documents), the P&L and balance-sheet "as of" defaults, the 7- and 30-day windows on the dashboard and monthly expenses, export file names | Open any of these forms in Oman between 00:00 and 04:00 local time | High: documents dated the previous day; due dates and alert windows shifted by a day | `new Date().toISOString().slice(0, 10)` is the UTC date. Replaced with local-date helpers `todayYmd`, `addDaysYmd`, `currentMonthYm`, `toYmd` in `src/utils/date.ts` (unit tests in Phase 2). |
| D0-2 | Every form using the shared `Input`, `Select`, `Textarea` (all pages) | Use a screen reader, or click a field label | Medium (accessibility, WCAG 1.3.1 / 4.1.2) | Labels were not associated with their control and errors were not announced. The shared components now set `id`/`htmlFor`, `aria-invalid`, `aria-describedby` (error or hint) and `aria-required`; unlabeled inputs use their placeholder as `aria-label`. |
| D0-3 | Every page: secondary text colour | — | Medium (WCAG 1.4.3) | Recorded here, fixed with the palette review in Phase 5. |
