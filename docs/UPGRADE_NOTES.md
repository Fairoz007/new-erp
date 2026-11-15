# Upgrade notes (docs/UPGRADE_PROMPT.md)

Running log of the UI, offices and invoice upgrade: what was found, what was decided, what changed,
what is verified and what is not. One section per stage. Parts A, B and C of
`docs/UPGRADE_PROMPT.md` are the specification.

## Environment for this run

- Project `fpeniljpqigpeqtsgizr` (development, on the owner's instruction in the brief). Migrations are
  pushed with `supabase db push --linked --yes`; data is read with `supabase db query --linked`.
- The app runs on the local dev server against that project. The assistant does not type passwords,
  so signed-in screens are checked only while the owner has signed in in the browser pane.
- The owner's folder `logs example pdf etc /` is git-ignored. Only the letterhead and the logo
  artwork are copied out of it (to `src/assets/brand/` and the `media` bucket). The two customer
  statements are read for their layout only; no names or amounts from them are recorded anywhere.
- Tools: macOS has no PDF tools installed (no poppler, ImageMagick or Ghostscript). PDFs are
  rendered with a small Swift/CoreGraphics script kept in the session scratchpad (not in the repo).

## Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Sales invoice number `{n}-FT-{yyyy}`, one company-wide series; the first number from the app is 447-FT-2026 | Confirmed by the owner (last old invoice 446-FT-2026) |
| 2 | Invoice email info@alhakimnational.com; the letterhead artwork keeps its printed email (alhakimn@omantel.net.om) | Confirmed by the owner |
| 3 | The letterhead is one fixed image, client logos included | Applied |
| 4 | Number in the top-right and bottom corners of every page, with "Page x of y" | Applied |
| 5 | A user with one office skips the Offices screen | Applied |
| 6 | "All offices" is per user, no fixed count; only a Super Admin can give it | Applied (already enforced by the database; now clear in the screens) |
| 7 | Money figures on office cards only for roles that already see them on their dashboard | Applied |
| 8 | Only logos are cropped (square); photos are only resized | Applied |
| 9 | Duqm and Nisfa addresses stay empty until the owner gives them | Applied (open point) |

## Open points

- Duqm and Nisfa offices: no street address, phone or email on record. Not invented.
- The website shows two more numbers (+968 9321 8505 in a call link, +968 7835 0097 on WhatsApp) that
  are not on the letterhead; only the letterhead numbers are used.
- The website says "Available 24/7" in places and "Saturday to Thursday, 8:00 AM to 5:00 PM" on the
  contact page. Opening hours are not printed on any document, so nothing depends on it.

## Out of scope (would be new features)

| Item | Why it is out of scope |
|---|---|

---

## Stage 1: Inspection

### 1.1 Company website (alhakimnational.com, read 2026-11-15)

| Part A1 item | Website | Match |
|---|---|---|
| Six services | Staff & Bus Transportation; Tanker Services (Water & Sewage); Heavy Equipment & Vehicle Rental; Goods & Material Transportation; Fleet Management & Maintenance Services; Drivers & Operators Supply | Yes |
| Established 2010, 100% Omani-owned | About page: founded 2010, "100% Omani-owned" | Yes |
| Standards | About page names PDO, Non-PDO and HSE. OPAL is on the letterhead, not on the site | Partly |
| Head office | Contact page: P.O. Box 659, P.C. 117, Muscat. "Ghala" and "Al Jami Al Akbar Street" are on the letterhead and the statements, not on the site | Yes, with the letterhead |
| Phone | +968 2450 5595 shown; see open points for two others | Yes |
| Email | info@alhakimnational.com and alhakimn@omantel.net.om (support) | Yes |
| Hours | Saturday to Thursday 8:00 to 17:00, Friday closed (contact page) | Yes |

### 1.2 Owner's folder

**Letterhead** (`al hakim national letter head.pdf`): one page, A4 portrait, 595.28 × 841.89 pt
(210.0 × 297.0 mm), vector. Measured on a 200 dpi render (pixels darker than the pale watermark):

| Element | Position (mm from the top-left corner) |
|---|---|
| Logo block (AHN mark, Arabic and English name) | x 53.8 to 156.0, y 8.9 to 30.0, centred |
| Watermark | red, light blue and green swooshes over the whole page, very light (every channel above 200 of 255); text over it stays readable |
| Bottom band | y 275.8 to 290.6, x 11.9 to 199.5. Left: "Public Transportation النقليات العامة" with a grey rule, then CR, P.O. box, P.C. and phones in Arabic and English. Middle: OPAL logo. Right: client and certification logos, "WE ARE YOUR BEST CHOICE", e-mail alhakimn@omantel.net.om |

Safe area chosen for printed content (never touches the logo or the band):

| Area | mm |
|---|---|
| Body (page 1 and later pages) | x 14 to 196, y 36 to 266 |
| Top-right corner block (title and number) | x 160 to 196, y 11 to 29: to the right of the logo, which ends at x 156 |
| Bottom corner line (number · Page x of y) | right-aligned at x 196, baseline y 271.5: between the body and the band |

**Logo** (`Al Hakim PDF.pdf`): one page, 1050 × 500 mm artboard, vector, white background with the
artwork in the middle. Exported to a transparent PNG cropped to the artwork (Stage 3).
`Al Hakim JPG.jpg` is 2379 × 1193 px (fallback, not needed). The small photo is not used.

**Statements** (two "Bill-wise Details" PDFs, US Letter): layout only.

- Invoice numbers: `<running number>-FT-<year>`, e.g. the pattern `NNN-FT-2026`, no padding.
- Layout: company name, address lines, e-mail and `VATIN : …` centred at the top; then the party
  name in bold; "Bill-wise Details"; the period ("1-Jan-26 to 31-Oct-26"); "Pending Bills" in bold.
  "Page 1" at the top right. Columns: Date, Ref. No., Opening Amount, Pending Amount, Due on,
  Overdue by days. Each bill has a second, smaller italic line (bill date, "Sales", number, amount).
  Amounts to 3 decimals with "Dr"/"Cr" after them; a closing total line under the amount columns.

### 1.3 App screens

The browser pane was signed out at the start of the run, and passwords are not typed by the
assistant, so the signed-in pages could not be photographed before the changes started. To still
have true "before" pictures, the untouched commit `fb7b092` is kept as a separate working copy in the
session scratchpad and is served on its own port for the before screenshots once the owner signs in.

Pages (from `App.tsx` and the sidebar; 41 pages). Every list page already uses `PageHeader`, and the
lists use `DataTable` except the reports-style pages. Office scoping: every page reads
`selectedCompanyId` from `FleetContext` (or the office of the record), and the database applies RLS.

| Group | Pages | Main actions |
|---|---|---|
| Overview | Dashboard (fleet, executive, finance, HR, sponsor tabs), Offices & Branches, Fleet Profitability | switch office, open records |
| Fleet | Vehicles (+ detail with 10 tabs), Maintenance, Work Orders, Oil, Tyres, Accidents, Expenses, Documents | add, edit, delete, approve, upload, export |
| Finance | Invoices & Bills, 3-Way Reconciliation, Payments, Bank Reconciliation, Trial Balance, General Ledger, Finance Control, P&L, Balance Sheet, Cash Flow, Budgets, Period Close, Fixed Assets & Depreciation | create, approve & post, pay, credit/debit note, print, export CSV/PDF |
| HR | Employees, Drivers, Attendance, Leave, Payroll, HR Setup | add, approve, run payroll, payslip |
| Directories | Suppliers, Customers (+ party detail with statement and contracts) | add, edit, statement |
| General | Approvals, Notifications, Reports (26), Audit Trail, Users & Roles, Settings (+ Setup Wizard) | approve, export, invite, edit access |

### 1.4 App data (live project, read 2026-11-15)

Organization: legal name "Al Hakim National LLC", trade name "Al Hakim National", address
"P.O. Box 659, P.C. 117", Muscat, Oman, +968 2450 5595, info@alhakimnational.com, website set,
**CR empty**, **VAT `OM1100482910` (a sample value from testing, wrong)**, tax card empty, no logo, no
Arabic name (there is no column for it), letterhead settings empty.

Offices: Head Office (HO, Muscat), Duqm Office (DQM, Duqm), Nisfa Office (NSF, Nisfa). HO has the
P.O. box as its address, the phone and the email; no street or area. DQM and NSF have only city and
country. No office has CR, VAT, logo or bank details.

Numbering: `sales_invoice` = prefix `INV`, office code, year, 4 digits, office scope →
`INV-HO-2026-0001` (one issued, a sample from the module inspection). Credit notes `CN-HO-2026-…`,
purchase bills `PINV-…`. Debit notes have no format of their own and take the sales or purchase
invoice number of their type.

Existing invoice printed: the print view is the browser's print of the modal (`window.print()`), so
there is no file name and no repeating header or page numbers. It could not be saved as a PDF here
before the changes (signed out); the before/after comparison is in Stage 12.

### 1.5 Baseline checks (before any change)

| Check | Result |
|---|---|
| `npm run lint` | Pass (tsc, secret scan: 329 files, nothing found) |
| `npm run test:unit` | Pass, 11 files, 50 tests |
| `npm run test:db` | Pass, 1,130 checks, 0 failures |
| `npm run build` | Pass |
| `npm run bundle:check` | Pass: initial JS 221.3 kB gzip (budget 250 kB), initial CSS 11.6 kB, all JS 796.7 kB |

---

## Stage 2: Review

Each gap is marked **data**, **UI**, **function** or **numbering**, with the stage that fixes it.

### 2.1 UI gap list

| # | Where | Gap | Kind | Stage |
|---|---|---|---|---|
| U1 | Sign-in | Generic shield icon and product name; no company logo; favicon generic | UI | 4 |
| U2 | Sidebar | Placeholder shield instead of the logo; groups are MENU / FLEET & WORKSHOP / FINANCE & ACCOUNTS / HUMAN RESOURCES / DIRECTORIES / GENERAL & SETTINGS, not Fleet, Finance, HR, Reports, Settings | UI | 4 |
| U3 | Sidebar footer | "Enterprise v2.4" and "● Active GCC" are invented labels (no version or region exists) | UI (fake text) | 4 |
| U4 | Header | The office switcher is hidden below 768 px, so a phone user cannot change office | UI / function | 4 |
| U5 | Header | Office switcher shows emoji (🏢, 📍) instead of the office logo or code badge; no link to an Offices screen | UI | 4 |
| U6 | Header | "Messages" (mail icon) opens the Notifications page, which the bell already covers: a second control for the same thing, labelled as something that does not exist | function (misleading button) | 4 |
| U7 | Design tokens | 142 `#086343`, 32 `#DCEFE5`, 26 `#06452F` and other one-off hex values in 60 files; the `slate` scale is inverted (slate-50 is black, slate-900 is white), kept for compatibility | UI | 4 |
| U8 | Landing | Sign-in opens the dashboard of "All offices"; there is no offices overview | UI | 5 |
| U9 | Offices page | Cards have no logo, no location link, no live figures; "Filter by this office" wording; all fields shown with "—" when empty | UI | 5, 6 |
| U10 | Office form | One long modal; no sections; no logo upload (the `logo` column exists); contacts not editable; cancel with edits closes without asking | UI / function | 6 |
| U11 | Users | "Organization-wide access" is a toggle; the choice between all and chosen offices is not explicit; no overview of who can open which office | UI | 7 |
| U12 | Images | Organization logo has its own upload code with a 2 MB limit (bucket allows 5 MB), no crop, no resize; vehicle photos upload the original file (up to 5 MB) with no resize; no shared viewer with zoom | UI / function | 8 |
| U13 | Lists (`DataTable`) | Header not sticky; empty state does not offer the Add action; on a phone the table scrolls sideways instead of showing cards | UI | 4, 11 |
| U14 | Access-denied page | Button says "Return to Executive Dashboard" for every role | UI (wording) | 11 |

### 2.2 Invoice gap table

| Item | Today | Target | How (stage) |
|---|---|---|---|
| Letterhead and watermark | None; plain white with a ruled header | The official letterhead behind every page | Letterhead image as the page background (10) |
| Logo quality | Organization logo if uploaded (none), else the office code in a box | The artwork from the letterhead (vector-sharp at 200 dpi) | Part of the letterhead image (3, 10) |
| Names in Arabic and English | English legal name only | Both, as on the letterhead | In the letterhead artwork; Arabic legal name also stored on the organization (3) |
| CR, VAT, address, phones, email | Read from the organization/office, but CR empty, VAT wrong | CR 1090254, VAT OM1100058123, Ghala address, phones, info@ | Data through Settings (3); printed in the page 1 block (10) |
| "Tax Invoice" title | "SALES INVOICE" | "TAX INVOICE" (or CREDIT NOTE / DEBIT NOTE) top right on every page | (10) |
| Number format, next number | INV-HO-2026-0001, per office | 447-FT-2026, one series | `document_formats.pattern` (9) |
| Corner numbers, page numbers | Number once, no page numbers | Top right and bottom corner on every page, "Page x of y" | Pagination in the print layout and the PDF (10) |
| Multi-page table | Browser decides; header not repeated; rows can split | Header repeated, no row cut | `thead` repeat and row break rules; autotable in the PDF (10) |
| Totals, VAT, words | Subtotal, VAT, total; no amount in words | Subtotal, VAT 5%, total, amount in words in Rials and Baisa, 3 decimals | `amountInWords` (10) |
| Bank details | Bank and IBAN only if the office has them, inside the terms box | Company bank details block | (10); no bank details on record yet (data) |
| Branch | Office name under the legal name | Office (branch) in the page 1 block | (10) |
| Customer VAT number | Shown when on the party snapshot | Shown | kept (10) |
| File name | None (print dialog) | `<number>.pdf`, e.g. 447-FT-2026.pdf | Download PDF with jsPDF (10) |
| Credit and debit notes | Same view, title changes | Same frame with their own title | (10) |
| Statement layout | Party statement page has its own print | "Bill-wise Details / Pending Bills" on the letterhead | (10) |

### 2.3 Data gap list

| Record | Field | Today | Should be | Stage |
|---|---|---|---|---|
| Organization | VAT number | OM1100482910 (sample from testing) | OM1100058123 | 3 |
| Organization | CR number | empty | 1090254 | 3 |
| Organization | Arabic legal name | no field | الحكيم الوطنية ش.م.م. | 3 (new column) |
| Organization | Address | P.O. Box 659, P.C. 117 | Al Jami Al Akbar Street, Ghala, P.O. Box 659, P.C. 117 | 3 |
| Organization | Phone | +968 2450 5595 | +968 2450 5595 / 9226 2277 / 9693 6065 | 3 |
| Organization | Logo | none | the AHN logo | 3 |
| Head Office | Address | P.O. Box 659, P.C. 117 | Al Jami Al Akbar Street, Ghala, P.O. Box 659 / city Muscat / governorate Muscat / P.C. 117 | 3 |
| Head Office | CR, VAT | empty | empty is right: the office prints the organization's (fallback); filled only if the office has its own | — |
| Duqm, Nisfa | Address, phone, email | empty | unknown; left empty (open point) | — |
| `docs/ADVANCE_NOTES.md` | VAT shown in a "seen live" cell | OM1100482910 | marked as a test value | 2 (done) |
| `sales_invoice` format | prefix | INV-HO-2026-0001 | 447-FT-2026 | 9 |

---

## Stage 3: Company data and brand assets

### Brand assets

| File | From | What |
|---|---|---|
| `src/assets/brand/ahn-logo.png` | `Al Hakim PDF.pdf` rendered at 200 dpi with a transparent background, cropped to the artwork, 640 × 321 px, 96 kB | Sign-in page |
| `src/assets/brand/ahn-mark.png` | same, top part only (AHN mark and tagline), 256 × 162 px, 33 kB | Sidebar, header, office cards |
| `public/favicon.png`, `public/apple-touch-icon.png` | the mark without the tagline, square, 64 and 192 px | Browser tab and home-screen icon |
| `src/assets/brand/letterhead-a4.jpg` | `al hakim national letter head.pdf` at 250 dpi (2067 × 2923 px), JPEG quality 0.9, 274 kB | Background of printed and downloaded invoices, notes and statements; loaded only when printing or downloading (`loadLetterheadUrl`), never in the initial bundle |

The organization logo in the `media` bucket is the same artwork at 1200 × 603 px (208 kB), uploaded
through Settings → Organization (so the app's own upload path and checks are used).

### Schema

`20261115000000_org_arabic_name.sql`: `organizations.legal_name_ar` (optional, at most 200
characters), shown in Settings → Organization as "Legal name in Arabic". Test:
`upgrade_org_arabic_name.test.mjs` (3 checks).
