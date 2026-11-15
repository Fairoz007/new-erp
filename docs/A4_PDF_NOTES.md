# A4 PDF notes (docs/A4_PDF_PROMPT.md)

Running log of the A4 letterhead format work: what changed, what was decided, what is verified and
what is not. One section per stage.

## Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Every printed and downloaded document on the full letterhead, reports and lists included | Requested by the owner |
| 2 | Portrait always; wide tables shrink (not below 6.5 pt) and wrap; landscape only above 10 columns | Suggested, not yet applied (stage 2) |
| 3 | Print gives the same pages as Download PDF | Requested by the owner |
| 4 | CSV exports unchanged | Suggested |
| 5 | Payslip bank account shows the last 4 digits only | Suggested, stage 4 |
| 6 | Corner shows the document number; reports show the period | Suggested |

## Open points

- None yet.

---

## Stage 1: One letterhead frame

- **New `src/lib/a4/frame.ts`**, the frame every document will use:
  - `startA4` (A4 portrait document with the frame on page 1), `drawFrame`, `addFramedPage`,
    `ensureSpace` (move a block to a new framed page when it does not fit) and `stampPages`
    (`<label> · Page x of y` on every page, drawn last);
  - page-1 helpers `sellerLine`/`sellerBlock`, `textBlock` and `factsBlock`;
  - `a4Table`: the safe-area margins, header on every page, rows never split, the frame on every
    new page, and `numeric` columns right-aligned with their headings;
  - closing blocks `totalsBlock` (totals plus amount in words, notes, terms) and
    `bankAndSignatures` (bank details when there are any, "Prepared by" and "Authorised signature &
    stamp");
  - output: `savePdf` (a number becomes `<number>.pdf`, a full `.pdf` name is kept), `printPdf`
    and `loadLetterheadBytes`.
- **`printPdf`** prints the generated PDF itself from a hidden frame, so paper matches the file. If
  the browser cannot print from the frame (it throws, or the frame does not load within 10 s, as on
  some phones), the file is downloaded instead. It resolves to `printed` or `downloaded` so the
  caller can say which happened. Not yet wired to any button; stages 2 to 5 use it.
- **`src/lib/letterheadPdf.ts`** (invoice, credit/debit note, purchase bill, pending-bills
  statement) now draws through the frame. Its exports are unchanged (`buildInvoicePdf`,
  `buildStatementPdf`, `loadLetterheadBytes`, `savePdf`, plus `printPdf`), so no caller changed.
- **No visible change, checked pixel for pixel.** Before the change, six PDFs were generated with
  the real letterhead: the live-database sample invoices 447 and 448-FT-2026 (3 and 60 lines); the same
  two as unposted credit notes with discounts, notes, terms and bank details; a 45-row statement; and
  an empty statement. They were generated again after the change. All 12 pages, rendered at 100 dpi,
  are byte-identical.
- **Tests:** `src/lib/__tests__/a4Frame.test.ts` (7). A 120-row list has the frame, period, table
  header and correct `Page x of y` on every page; `ensureSpace` opens a framed page; empty seller
  parts are left out; file names; `printPdf` prints from the frame, downloads when printing throws,
  and downloads outside a browser. The existing `letterheadPdf.test.ts` (7) passes unchanged.
- **Checks:** `npm run lint`, `npm run test:unit` (16 files, 80 tests), `npm run build`,
  `npm run test:db` pass. `npm run bundle:check`: initial JS still 225.2 kB gzip; jsPDF, autotable
  and the frame are only in lazy chunks.
- **Not verified in the browser:** the invoice dialog and the Pending bills (PDF) button need a
  signed-in user. Nothing on screen changed in this stage (same PDFs, no button changed).
