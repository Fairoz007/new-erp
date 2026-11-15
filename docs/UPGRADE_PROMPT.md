# Upgrade Prompt: Al Hakim National ERP (UI, Offices, Access, Images and Invoices)

This is one prompt for the whole upgrade. It combines the earlier UI upgrade prompt and the invoice print prompt.

| Part | What it is | Who uses it |
|---|---|---|
| **Part A** | The company: what was found on the website and in the owner's folder | read before running |
| **Part B** | The specification: how the upgraded app must look and behave | read, then edit if needed |
| **Part C** | Decisions, confirmed or suggested | edit before running |
| **Part D** | The prompt, split into stages and subtasks | copy into a new Claude Code session in this repository |

The folder `logs example pdf etc /` is in `.gitignore`. It holds real customer balances, so it must never go to GitHub.

---

# Part A: The company

## A1. Al Hakim National LLC (from alhakimnational.com)

Al Hakim National LLC was established in 2010. It is a 100% Omani-owned transportation and fleet services company that works across Oman for industrial, construction, oil & gas and commercial clients. Its drivers work to OPAL, PDO and HSE standards.

**Services** (these are the things invoices are raised for):

| # | Service | What it is |
|---|---|---|
| 1 | Staff & Bus Transportation | staff and passenger buses with drivers |
| 2 | Tanker Services (Water & Sewage) | water supply and sewage tankers for sites |
| 3 | Heavy Equipment & Vehicle Rental | equipment and vehicle hire for projects |
| 4 | Goods & Material Transportation | moving goods and materials between sites and commercial locations |
| 5 | Fleet Management & Maintenance Services | servicing, inspection and maintenance of fleets |
| 6 | Drivers & Operators Supply | trained drivers and equipment operators (manpower supply) |

**Contact details:**
- Head office: P.O. Box 659, P.C. 117, Ghala, Muscat, Sultanate of Oman.
- Opening hours: Saturday to Thursday, 8:00 AM to 5:00 PM; Friday closed.

## A2. The folder `logs example pdf etc /`

| File | What it is | Use |
|---|---|---|
| `al hakim national letter head.pdf` | The official A4 letterhead | The background and frame of every printed and downloaded invoice, note and statement |
| `Al Hakim PDF.pdf` | The logo as vector artwork: AHN mark, "WE ARE YOUR BEST CHOICE", Arabic and English name | The source for a sharp logo, exported to PNG |
| `Al Hakim JPG.jpg` | The same logo at high resolution | Fallback logo |
| `PHOTO-2026-11-09-19-35-23.jpg` | The same logo as a small photo | Do not use; too low in quality |
| `BAIT AL SAHIL TRADING LLC.pdf`, `Prime Trading Ledger Outstandings.pdf` | Real "Bill-wise Details / Pending Bills" customer statements from the current accounts system | A model for the statement layout and the invoice number format only. They hold real customer balances, so never commit them, seed them or show them |

**Letterhead layout** (A4 portrait):
- **Top centre:** the AHN logo, with the name in Arabic (الحكيم الوطنية ش.م.م.) and in English (Al Hakim National LLC).
- **Background:** a large, very light red, green and blue swoosh watermark across the page.
- **Bottom band:**
  - On the left: "Public Transportation النقليات العامة", then the CR, P.O. box, P.C. and phone numbers in Arabic and English.
  - In the middle: the OPAL logo.
  - On the right: the client and certification logos (OXY, bp, JSRS, Riyada and others), "WE ARE YOUR BEST CHOICE", and the email.

**Brand colours** from the logo: red, light blue and green, with black type.

**Real details** from the letterhead and statements:

| Item | Value |
|---|---|
| Legal name | Al Hakim National LLC / الحكيم الوطنية ش.م.م. |
| CR | 1090254 |
| VAT number (VATIN) | OM1100058123 |
| Address | Al Jami Al Akbar Street, Ghala, Muscat. P.O. Box 659, P.C. 117, Sultanate of Oman |
| Phones | 9226 2277, 9693 6065, 2450 5595 |
| Email for invoices | info@alhakimnational.com (confirmed by the owner) |
| Activity line | Public Transportation / النقليات العامة |

**Invoice numbers in use today:** a running number, then `FT`, then the year, for example `446-FT-2026`. The last invoice in the old system is **446-FT-2026** (confirmed by the owner).

## A3. What the app does today (checked in the code and on the live project)

- **Offices and access:**
  - The offices are Head Office (HO), Duqm (DQM) and Nisfa.
  - Users have `all_offices` or per-office memberships (`AuthContext`, `UsersStep`).
  - The header has an office switcher with "All offices".
  - There is no office overview screen; sign-in goes straight to a dashboard.
- **Office form** (`CompanyFormModal`):
  - It has all the fields, as a single long modal.
  - The office `logo` field exists, but there is no upload for it.
- **Images:**
  - The organization logo is uploaded to the `media` bucket.
  - Vehicles have a photo (`VehiclePhoto`).
  - Receipts and documents are stored in the `documents` bucket.
  - There is no shared upload or viewer component.
- **Invoice print** (`PrintableInvoiceModal.tsx`):
  - It prints with `window.print()`, so there is no real "Download PDF" with a file name.
  - The header is the logo plus text. There is no letterhead artwork, watermark or bottom band.
  - The invoice number is printed once and there are no page numbers.
- **Company record:**
  - The legal name is set, but **CR and VAT are empty**.
  - The VAT number `OM1100482910` in `docs/ADVANCE_NOTES.md` was only a sample value entered during testing. It is not the real number; the real one is OM1100058123.
  - The Head Office address has no street or area.
  - Duqm and Nisfa have no address.
- **Invoice numbers** are `INV-HO-2026-0001` (`document_formats`, `doc_prefix`). This does not match `NNN-FT-YYYY`.
- PDF libraries already in the project: `jspdf` and `jspdf-autotable`.

---

# Part B: Specification (how it should be)

## B1. The first screen: the three offices

When someone signs in, the app opens on an **Offices** home screen.

- It shows one card per office the user may open: **Head Office (Muscat)**, **Duqm** and **Nisfa**.
- Each card shows:
  - the office logo (or its code in a coloured badge when no logo is set), name and code;
  - the location: address, city, governorate, country, and phone and email;
  - an **Open in Maps** link built from the address. This is a plain link, with no embedded map and no maps API;
  - live figures that already exist in the app:
    - vehicles (active and off road);
    - open work orders;
    - documents that are expiring;
    - receivables due;
    - cash and bank balance;
    - this month's expenses.
  - the office status.
- Clicking a card opens that office. It sets the office selector and goes to the role dashboard, so every number there belongs to that office only.
- Users with organization-wide access also see an **All offices** card with the combined figures.
- A user with access to only one office skips this screen. A link back to the Offices screen stays in the header.
- On a phone the cards stack in one column, with no sideways scrolling.

## B2. Office location and edit mode

- An **Edit** button on each office card and on the office page. Only users with the `companies:update` permission see it.
- Edit mode opens a side panel (a full screen on a phone) with the existing fields grouped as follows:
  1. **Identity:** office name, code, logo, status.
  2. **Location:** address, city, governorate, country, postal code. A preview of the location card updates as the user types, and the **Open in Maps** link can be tested.
  3. **Contact:** phone, email, website, contacts.
  4. **Registration and tax:** CR, VAT, tax card, fiscal period, currency.
  5. **Bank details.**
- **The office name is editable.** After saving, the new name shows straight away everywhere: the header, the Offices screen, lists, printed invoices and statements, and exports. The audit log records the old and new values and who made the change.
- Empty fields are hidden in view mode and shown in edit mode.
- Saving keeps the existing checks: a unique code, the concurrent-edit check (`updatedAt`) and the permission check. Cancelling with unsaved changes asks for confirmation.

## B3. Who can see which office

The access model already exists. This upgrade makes it clear in the screens.

- **Super Admin** always sees every office.
- **Organization-wide users** (`all_offices = true`) see every office, including offices added later. More than one user can have this, for example the admin plus a finance manager.
- **Every other user** sees only the existing offices assigned to them, with a role per office. New offices are not added to them automatically.
- In the Setup Wizard (Users step) and in Users & Roles, the invite and edit forms show a clear choice:
  - **All offices** (current and future): only a Super Admin can give this;
  - **Chosen offices:** the office cards as checkboxes, each with a role picker.
- Users & Roles gains a read-only **access overview**: users down the side, offices across the top, and the role in each cell.
- RLS does not change unless a defect is found.

## B4. Image manager

One consistent way to add, replace, preview and remove the images the app **already stores**. It does not add a new gallery. The image places are:

- the organization logo, using the real logo from `Al Hakim PDF.pdf`;
- office logos (the `logo` field, which needs its upload);
- vehicle photos;
- receipt, bill and document images (preview only, where they exist today).

The behaviour should be:

- Drag and drop or click to choose a file, with a preview before saving.
- For logos, a square crop and a "Remove" button.
- Images are resized and compressed in the browser before upload. The type and size are checked against the bucket limits:
  - the `media` bucket takes PNG, JPEG or WebP up to 5 MB (no SVG);
  - the `documents` bucket takes PDF, PNG or JPEG up to 10 MB.
- Thumbnails in lists, and a full-size viewer with zoom, download and close (Esc).
- When an image is replaced, the old file is removed. Images are always shown through signed URLs.
- Upload progress, readable errors, and a retry.

## B5. Invoices on the real letterhead

- **Company details on every document** come from the organization and office records, which are filled with the real values from A2:
  - CR 1090254;
  - VAT OM1100058123;
  - Ghala address;
  - phones;
  - info@alhakimnational.com.
- **Invoice number:** `{n}-FT-{yyyy}`, one company-wide series set through `document_formats`. The first invoice from the app is **447-FT-2026**. Numbers stay gap-free and safe under two people saving at once.
- **Every page** of an invoice, credit note, debit note and client statement sits on the official letterhead, which is used as one fixed image, client logos included. The content stays inside a safe area that never touches the logo or the bottom band.
- **Top right corner, every page:** "TAX INVOICE" (or "CREDIT NOTE" / "DEBIT NOTE") and the number, for example `447-FT-2026`.
- **Bottom corner, every page,** just above the band: `447-FT-2026 · Page 1 of 2`.
- **Page 1 block:** invoice date, due date, office (branch), customer name, address and VAT number, and reference / LPO if the invoice has one.
- **Lines table:** description, quantity, rate, amount and VAT, with the header repeated on each page and no row cut in half.
- **Totals:** subtotal, VAT 5%, total, and the amount in words in Omani Rials and Baisa, all to 3 decimals.
- Then the company bank details, and a signature and stamp area.
- **Print** (A4, `@page`, zero browser margins) and a new **Download PDF** button. The download is a `jspdf` file with vector text named `<number>.pdf`, for example `447-FT-2026.pdf`. Both outputs use the same layout.
- **The client statement** follows the "Bill-wise Details / Pending Bills" layout: title, period, columns, and Dr/Cr totals. It uses the app's own data.

## B6. UI upgrade (look and feel)

- **One design system:**
  - the app's green as the primary colour;
  - the logo's red, light blue and green as accents (badges, charts, office cards);
  - spacing, radius, shadow and type scale defined once in Tailwind;
  - one icon set (lucide).
- The real logo in the sidebar, sign-in page and favicon.
- **The same page frame on every page:** a title, a short description, the main action on the right and the filters underneath.
- **Cards and KPI tiles:** one style, with figures to 3 decimals for OMR.
- **Tables (`DataTable`):**
  - a sticky header;
  - row hover;
  - an empty state with the existing Add button;
  - skeleton rows while loading;
  - numbers right-aligned;
  - card rows on a phone.
- **Forms:**
  - fields grouped into sections;
  - required fields marked;
  - errors under the field;
  - a busy save button;
  - a success toast;
  - confirmation before delete, reverse or close.
- **Sidebar:**
  - grouped as Fleet, Finance, HR, Reports and Settings;
  - the active page highlighted;
  - collapsible on desktop and a drawer on a phone.
- **Header:** the office switcher shows the logo or code, name and code. Search, notifications and the user menu stay.
- **Motion:** short and subtle only, respecting `prefers-reduced-motion`.
- **Accessibility:** visible focus, keyboard use for every menu and dialog, contrast AA, and labels on every control.
- **Out of scope:** dark mode and new languages.

## B7. Function quality (no new functions)

- Every button does what its label says, or is removed. There are no dead buttons.
- Every Add and Edit form saves, shows the record without a reload, and keeps the current office.
- Every number on a card matches the report it comes from.
- Office scoping is the same on every page.

---

# Part C: Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Invoice format `{n}-FT-{yyyy}`, one company-wide series, the first invoice from the app is 447-FT-2026 | **Confirmed** (last old invoice: 446-FT-2026) |
| 2 | Invoice email: info@alhakimnational.com. The letterhead artwork keeps its own printed email | **Confirmed** |
| 3 | The official letterhead is used as one fixed image, client logos included | Suggested |
| 4 | The invoice number in the top right and bottom corners of every page, with "Page x of y" | Suggested |
| 5 | A user with one office skips the Offices screen | Suggested |
| 6 | "All offices" is set per user, with no fixed count; only a Super Admin can give it | Suggested |
| 7 | Money figures on office cards only for roles that already see them on their dashboard | Suggested |
| 8 | Only logos are cropped; photos are only resized | Suggested |
| 9 | The Duqm and Nisfa addresses stay empty until the owner gives them (never invented) | Suggested |

---

# Part D: The prompt (copy everything below this line)

---

## Role and goal

You are a senior full-stack engineer and UI designer working on the existing **multi-office fleet and finance ERP** in this repository (React 18, TypeScript, Vite, Tailwind, Supabase: Postgres, RLS, Auth, Storage). The company is **Al Hakim National LLC**. The earlier briefs are done:

- `docs/FIX_AND_COMPLETE_PROMPT.md`;
- `docs/ADVANCE_PROMPT.md`;
- the module inspection (`docs/ADVANCE_NOTES.md`, `AUDIT_REPORT.md` sections R and S).

Bring the app to a high level in its UI and in how its functions behave, and make its invoices match the company's own documents. **`docs/UPGRADE_PROMPT.md` Parts A, B and C are the specification.** Read them first.

Work through the stages in order. Do not stop to ask questions; record decisions and open points in `docs/UPGRADE_NOTES.md`. Push to GitHub at the end.

## Rules

- **No new features beyond Part B.** The only new screens and controls allowed are:
  - the Offices home screen;
  - office edit mode;
  - the access overview;
  - the image manager (for images the app already stores);
  - the Download PDF button.
  Anything else goes under "Out of scope" in `docs/UPGRADE_NOTES.md`.
- Every schema change goes in a new migration under `supabase/migrations/`. Do not edit old migrations. Add a PGlite test (`supabase/tests/`) for every new or changed function, policy, trigger or column.
- No fake data, no hard-coded numbers and no dead buttons.
  - Company details, office names, addresses and figures come from the database.
  - Invoice numbers come from `document_formats`.
  - The letterhead and logo images are fixed brand assets and may live in the app.
- Behaviour and numbers must stay the same unless they were wrong. If a number changes, say why in the notes and prove it with a test.
- Security stays as it is or gets stricter. Office scoping and RLS are never loosened.
- **Owner's folder** (`logs example pdf etc /`, git-ignored):
  - Copy only the letterhead and logo artwork, into `src/assets/brand/` or the `media` bucket.
  - Never copy, commit, seed or show the two customer statements.
- **Project rules:**
  - The Supabase project `fpeniljpqigpeqtsgizr` is in development. You may push migrations (`supabase db push --linked --yes`).
  - Local, GitHub and Supabase must stay version-aligned.
  - Never create accounts or type passwords, and never send invitations.
  - Never run `storage rm -r` on a bucket root.
  - `backups/`, `.env` and `.claude/launch.json` are never committed.
  - Sample records are named "Sample…" and are cancelled, credited or removed at the end.
- After each stage:
  - `npm run build` and `npm run test:db` pass;
  - check every changed screen in the browser at desktop width and at 375 px, with no console errors;
  - make one git commit.
- Each commit message ends with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Be honest in the final report, and list anything not verified.

## Read first

- **Offices and access:**
  - `src/context/AuthContext.tsx`, `src/context/FleetContext.tsx`;
  - `src/components/layout/Header.tsx`, `Sidebar.tsx`;
  - `src/pages/companies/`;
  - `src/pages/setup/steps/UsersStep.tsx`;
  - `src/pages/users-roles/`.
- **Dashboards:** `src/pages/dashboard/` and `src/components/dashboard/`.
- **Images:**
  - `src/services/storage.ts`, `src/services/org.ts`;
  - `src/pages/vehicles/VehiclePhoto.tsx`;
  - `src/lib/branding.ts`;
  - migration `20261113010000_storage_buckets.sql`.
- **Invoices:**
  - `src/components/common/PrintableInvoiceModal.tsx`, `src/utils/export.ts`;
  - the invoice services;
  - `doc_prefix`, `doc_pad`, `next_doc_number` and `document_formats` in the migrations.
- **Shared UI:** `src/components/ui/` and `src/index.css`.

---

## Stage 1: Inspection (read and record only, no code changes)

**1.1 Company website.** Open https://alhakimnational.com and its service, about and contact pages. Confirm Part A1: the six services, address, phones, email and hours.

**1.2 Owner's folder.**
- From the letterhead, record the exact layout: logo position, watermark, bottom band, and the page size and safe-area margins in mm.
- From the two statements, record **only** the invoice number pattern and the statement layout. Do not record any customer names or amounts.

**1.3 App screens.**
- Take screenshots of every page at desktop width and at 375 px, and keep them in the scratchpad, not the repository.
- List each page with its main actions and office scoping.

**1.4 App data.** On the live project, read the organization and office records and the current sales invoice format. Print one existing invoice and save it as a PDF in the scratchpad.

**1.5 Baseline checks.** Run `npm run lint`, `npm run test:unit`, `npm run test:db`, `npm run build` and `npm run bundle:check`, and record the results.

Write everything under "Inspection" in `docs/UPGRADE_NOTES.md`.

## Stage 2: Review (compare and plan, no code changes)

**2.1 UI gap list.** For each page, compare it with B1, B2, B3, B4, B6 and B7. Record the missing page frame, table, form, empty-state and phone issues, and any dead or broken buttons.

**2.2 Invoice gap table** (item, today, target, how). Compare the app's invoice with the letterhead and B5:
- letterhead and watermark;
- logo quality;
- names in Arabic and English;
- CR, VAT, address, phones and email;
- the "Tax Invoice" title;
- the number format and next number;
- the corner numbers and page numbers;
- the multi-page table;
- totals, VAT and amount in words;
- bank details;
- the branch;
- the customer's VAT number;
- the file name;
- credit and debit notes;
- the statement layout.

**2.3 Data gap list.** List the company and office fields that are empty or wrong. Correct the line in `docs/ADVANCE_NOTES.md` that shows the test VAT value `OM1100482910`.

Mark each gap as data, UI, function or numbering, and the stage that fixes it. Commit the notes.

## Stage 3: Company data and brand assets

**3.1** Through the app's own Settings → Organization and Offices screens (not SQL), set the real details from A2:
- legal name in English and Arabic;
- CR `1090254`;
- VAT `OM1100058123`;
- the Head Office address with Al Jami Al Akbar Street and Ghala;
- phones;
- info@alhakimnational.com.

Leave the Duqm and Nisfa addresses empty and list them as open points.

**3.2** Export the logo from `Al Hakim PDF.pdf` to a transparent, tightly cropped PNG. Use it:
- as the organization logo (uploaded to `media`);
- in `src/assets/brand/` for the sidebar, sign-in page and favicon.

**3.3** Convert `al hakim national letter head.pdf` to a print-quality A4 image (200–300 dpi) in `src/assets/brand/`. Load it only when printing or downloading, and keep the bundle within `bundle:check`.

Commit.

## Stage 4: Design system, layout, sidebar and header (B6)

**4.1 Tokens.** Define the tokens once in `tailwind.config` and `src/index.css`:
- the primary green;
- the logo's red, blue and green accents;
- neutrals, success, warning and danger;
- the type scale, spacing, radius and shadow.

Replace one-off hex values such as `#DCEFE5`, `#06452F` and `#086343`.

**4.2 Shared components:**
- `Button`, `Input`, `Select`, `Textarea`;
- `Modal` and a new `SidePanel`;
- `Card`, `KpiTile`, `Badge`, `Tabs`;
- `EmptyState`, `Skeleton`, `Toast`;
- `DataTable`, upgraded;
- a new `PageHeader`.

**4.3 Sidebar** (grouped, with the real logo, collapsible, a drawer on a phone) and **header office switcher** (logo or code, name, code, All offices, a link to the Offices screen). Keep every menu item and permission check.

**4.4** Check contrast AA, focus rings, keyboard use and `prefers-reduced-motion`.

Commit.

## Stage 5: Offices home screen (B1)

**5.1** Build the Offices screen as the landing page, following B1 and decisions 5 and 7.

**5.2** Office figures:
- Take the figures from existing queries or views, scoped per office.
- If needed, add one read-only RPC or view (in a migration) that returns all the figures for all of the user's offices in one call, respecting RLS and `has_company_access`.
- PGlite test: a user never gets figures for an office they cannot access.

**5.3** Card click sets `selectedCompanyId` and opens the role dashboard. Check that every tile on every role dashboard uses only the chosen office and that **All offices** sums correctly. Write a test where a figure is computed.

**5.4** **Open in Maps** is a link to `https://www.google.com/maps/search/?api=1&query=<encoded address>`, opening in a new tab with `rel="noopener noreferrer"`. It is hidden when there is no address.

Commit.

## Stage 6: Office edit mode and names (B2)

**6.1** Replace `CompanyFormModal` with the side panel described in B2: grouped sections, the live location preview, a logo upload through the image manager, and a confirmation on cancel with unsaved changes.

**6.2** Keep the code uniqueness, `updatedAt` and `companies:update` checks. Make sure an office name change shows everywhere without a reload, including on printed invoices, and that the audit log records the old and new values. Add the test if it is missing.

**6.3** Make sure the office `logo` field is saved and read through the service. If the column is missing, add it in a migration.

Commit.

## Stage 7: Office access screens (B3)

**7.1** In the Setup Wizard Users step and in Users & Roles, show the **All offices** / **Chosen offices** choice with office cards and a role per office. Only a Super Admin can give All offices.

**7.2** Add the read-only access overview (users × offices, with the role in each cell).

**7.3** PGlite tests:
- an all-offices user sees offices created later;
- a chosen-offices user sees only their offices;
- a non-Super Admin cannot grant All offices.

Do not send invitations.

Commit.

## Stage 8: Image manager (B4)

**8.1** Build one `ImageUpload` / `ImageViewer` pair and use it for the organization logo, office logos and vehicle photos. Use the viewer for existing receipt, bill and document images.

**8.2** Resize and compress in the browser (canvas, no heavy library), square-crop logos, check the type and size against the bucket limits, remove the old file on replace, use signed URLs only, and show progress, errors and retry.

**8.3** Tests:
- unit tests for the resize and validation helpers;
- a PGlite test that the storage policies still refuse writes into another office's path.

Commit.

## Stage 9: Invoice numbering (B5, decision 1)

**9.1** Set the sales invoice format to `{n}-FT-{yyyy}`, one company-wide series, so the next invoice is **447-FT-2026**.
- If `doc_prefix` / `next_doc_number` cannot put the number first, extend the format in a new migration, for example with a `pattern` column.
- Other document types keep working as today, and numbers already issued do not change.

**9.2** PGlite tests:
- after 446 the next number is `447-FT-2026`;
- the year changes the suffix;
- two concurrent saves get different numbers;
- other document types are unchanged.

Commit.

## Stage 10: Letterhead print and Download PDF (B5)

**10.1** Rebuild the invoice print view as A4 pages on top of the letterhead image:
- the safe area measured in Stage 1;
- the top right corner title and number on every page;
- the bottom corner number and "Page x of y" on every page;
- the page 1 block, the lines table with a repeated header, totals with VAT 5% and the amount in words, bank details, and the signature and stamp area.

**10.2** Print (`@page` A4, zero margins) and **Download PDF** (`jspdf` and `jspdf-autotable`, vector text, file `<number>.pdf`) use the same layout.

**10.3** Credit notes, debit notes and the printed client statement use the same frame. The statement follows the "Bill-wise Details / Pending Bills" layout with the app's own data.

**10.4** Unit tests:
- amount in words (2,677.500 gives "Two Thousand Six Hundred Seventy-Seven Rials and Five Hundred Baisa");
- the file name;
- a 60-line invoice has the right page count and the number on every page.

Commit.

## Stage 11: Every page, every button (B6, B7)

**11.1** Apply `PageHeader`, the new tables, forms, empty states and skeletons to **every** page in `src/pages/`.

**11.2** On every page, use every button and form with sample data on the project:
1. add;
2. edit;
3. delete, reverse or cancel;
4. approve;
5. post;
6. export CSV and PDF;
7. print;
8. switch office.

Fix what does not work, or remove dead controls. Confirm that new records appear without a reload and stay in the current office.

**11.3** Check every page at 375 px: no sideways scroll, and dialogs and side panels fit.

**11.4** Record each page's result in `docs/UPGRADE_NOTES.md`.

Commit.

## Stage 12: Verify end to end

**12.1** Create one sample invoice with 3 lines and one with 60 lines, for "Sample Customer". Then:
1. download both PDFs;
2. print both;
3. check them against the letterhead.

**Checklist:**
- The logo is sharp.
- The letterhead is exact.
- Nothing overlaps.
- The number is in the top right and bottom corners of every page.
- "Page x of y" is right.
- The totals and VAT match the screen.
- The CR, VAT and email are the real ones.
- The file name is the invoice number.

Check in Chrome, and in Safari if available.

**12.2** Sign in flow: the Offices screen shows the three offices with the right figures. A card opens the office. Edit an office name, check that it shows everywhere, then set it back.

**12.3** Cancel or credit the sample invoices and remove the other sample records. Delete files inside a bucket only, never the bucket.

## Stage 13: Final checks, notes and push

**13.1** Run `npm run lint`, `npm run test:unit`, `npm run test:db`, `npm run build`, `npm run bundle:check` and `npm run scan:secrets`. All must pass. `supabase migration list --linked` shows no mismatch.

**13.2** Update:
- `README.md` (the Offices screen, the access rules, invoice numbering and printing);
- `docs/UPGRADE_NOTES.md`;
- `AUDIT_REPORT.md` (a new section).

**13.3** Commit and push to GitHub, and check that `main` matches `origin/main`. Confirm that `git ls-files` lists nothing from `logs example pdf etc /`.

**13.4 Final report:**
- what changed, by stage and page;
- the migrations and tests added;
- before and after screenshots of the Offices screen, office edit mode, one list page, and page 1 and the last page of the 60-line invoice;
- the sample records and how they were removed;
- open points, for example the Duqm and Nisfa addresses;
- what was not verified, for example invitations and other roles' sign-ins.
