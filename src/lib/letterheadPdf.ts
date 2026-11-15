// Invoices, credit/debit notes, purchase bills and the pending-bills statement as PDFs on the
// company letterhead, drawn with the shared A4 frame (src/lib/a4/frame.ts): vector text, the
// letterhead behind every page, title and number top right, "<number> · Page x of y" at the bottom.
// Same geometry and blocks as the HTML print view (src/lib/invoicePrint.ts).
// Loaded on demand (dynamic import) so jsPDF stays out of the initial bundle.
import {
  BODY, BODY_WIDTH, DANGER, INK, LAYOUT, MUTED, RULE, a4Table, bankAndSignatures, factsBlock, sellerBlock, startA4,
  stampPages, textBlock, totalsBlock, type Doc, type Rgb,
} from './a4/frame';
import type { InvoicePrintData, StatementPrintData } from './invoicePrint';

export { loadLetterheadBytes, printPdf, savePdf } from './a4/frame';

export function buildInvoicePdf(d: InvoicePrintData, letterhead: Uint8Array | null): Doc {
  const a = startA4({
    title: d.title, corner: d.number, letterhead,
    properties: { title: `${d.title} ${d.number}`, subject: d.title, author: d.seller.name, creator: d.seller.name },
  });

  // ---- page 1 block
  let y = sellerBlock(a, d.seller);
  if (!d.posted) y = textBlock(a, [`${d.status.toUpperCase()}: NOT POSTED TO THE LEDGER`], BODY.left, y + 1, BODY_WIDTH, LAYOUT.font.body, 'bold', DANGER);
  y += 2;
  const colW = BODY_WIDTH / 2 - 4;
  let left = textBlock(a, [d.party.label.toUpperCase()], BODY.left, y, colW, LAYOUT.font.small, 'bold', MUTED);
  left = textBlock(a, [d.party.name], BODY.left, left, colW, LAYOUT.font.body + 1, 'bold');
  const partyLines = [d.party.address, d.party.vat ? `VATIN ${d.party.vat}` : '', d.party.phone ? `Phone ${d.party.phone}` : ''].filter(Boolean);
  left = textBlock(a, partyLines, BODY.left, left, colW, LAYOUT.font.body);
  const right = factsBlock(a, d.facts, BODY.left + BODY_WIDTH / 2 + 4, y, 30, colW);
  y = Math.max(left, right) + 3;

  // ---- lines
  const head = ['#', 'Description', 'Qty', 'Unit price', ...(d.showDiscount ? ['Discount'] : []), 'VAT %', 'VAT', `Amount (${d.currency})`];
  const body = d.lines.map(l => [String(l.no), l.detail ? `${l.description}\n${l.detail}` : l.description, l.quantity, l.unitPrice,
    ...(d.showDiscount ? [l.discount] : []), l.vatRate, l.vat, l.amount]);
  const none = false as unknown as Rgb;
  y = a4Table(a, {
    head: [head],
    body: body.length ? body : [[{ content: 'No lines', colSpan: head.length, styles: { halign: 'center', textColor: MUTED } }]],
    startY: y,
    theme: 'grid',
    styles: { cellPadding: 1.6, lineColor: RULE, lineWidth: 0.15, valign: 'top', fillColor: none },
    alternateRowStyles: { fillColor: none },
    numeric: head.map((_, i) => i).filter(i => i >= 2),
    columnStyles: d.showDiscount
      ? { 0: { cellWidth: 8 }, 2: { cellWidth: 16 }, 3: { cellWidth: 21 }, 4: { cellWidth: 18 }, 5: { cellWidth: 13 }, 6: { cellWidth: 19 }, 7: { cellWidth: 25 } }
      : { 0: { cellWidth: 8 }, 2: { cellWidth: 18 }, 3: { cellWidth: 23 }, 4: { cellWidth: 14 }, 5: { cellWidth: 21 }, 6: { cellWidth: 27 } },
  }) + 5;

  // ---- totals with the amount in words, then bank details and signatures
  y = totalsBlock(a, y, { totals: d.totals, words: d.words, currency: d.currency, notes: d.notes, terms: d.terms });
  bankAndSignatures(a, y, d.bank);

  stampPages(a);
  return a.doc;
}

export function buildStatementPdf(d: StatementPrintData, letterhead: Uint8Array | null): Doc {
  const a = startA4({
    title: 'STATEMENT', corner: d.asOf, footer: d.number, letterhead,
    properties: { title: `${d.party.name} statement ${d.asOf}`, author: d.seller.name },
  });
  let y = sellerBlock(a, d.seller) + 1;
  y = textBlock(a, [d.party.name], BODY.left, y, BODY_WIDTH, LAYOUT.font.body + 2, 'bold');
  y = textBlock(a, [d.party.address, d.party.vat ? `VATIN ${d.party.vat}` : ''].filter(Boolean), BODY.left, y, BODY_WIDTH, LAYOUT.font.body);
  y = textBlock(a, ['Bill-wise Details', `Pending Bills as of ${d.asOf}`], BODY.left, y + 2, BODY_WIDTH, LAYOUT.font.body, 'bold') + 1;
  a4Table(a, {
    head: [['Date', 'Ref. No.', `Opening Amount (${d.currency})`, `Pending Amount (${d.currency})`, 'Due on', 'Overdue by days']],
    body: d.rows.length
      ? d.rows.flatMap(r => [[r.date, r.ref, r.opening, r.pending, r.due, r.overdue],
        [{ content: r.sub, colSpan: 6, styles: { fontStyle: 'italic', textColor: MUTED, fontSize: LAYOUT.font.small, cellPadding: { top: 0, bottom: 1.4, left: 1.6, right: 1.6 } } }]])
      : [[{ content: 'No pending bills.', colSpan: 6, styles: { halign: 'center', textColor: MUTED } }]],
    foot: [[{ content: 'Total', colSpan: 3, styles: { halign: 'right' } }, { content: d.total, styles: { halign: 'right' } }, '', '']],
    startY: y,
    showFoot: 'lastPage', theme: 'plain',
    styles: { cellPadding: 1.4 },
    footStyles: { fontStyle: 'bold', textColor: INK, lineWidth: { top: 0.3 }, lineColor: INK },
    numeric: [2, 3, 5],
  });
  stampPages(a);
  return a.doc;
}
