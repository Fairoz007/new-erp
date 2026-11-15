// PDF on the company letterhead (jsPDF + autotable): vector text, A4, the letterhead image behind
// every page, the title and number top right on every page, "<number> · Page x of y" in the bottom
// corner. Same geometry and blocks as the HTML print view (src/lib/invoicePrint.ts).
// Loaded on demand (dynamic import) so jsPDF stays out of the initial bundle.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { brand, neutral, status } from './tokens';
import { LAYOUT, PAGE, BODY_WIDTH, documentFileName, pageLabel, type InvoicePrintData, type StatementPrintData } from './invoicePrint';

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };
type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const INK: Rgb = hex(neutral.text);
const MUTED: Rgb = hex(neutral.textMuted);
const RULE: Rgb = hex(neutral.divider);
const DANGER: Rgb = hex(status.danger[700]);
const BRAND: Rgb = hex(brand[500]);
const B = LAYOUT.body;
const PT = 0.3528; // mm per point

/** The letterhead JPEG as bytes, or null (the PDF is then drawn on plain white). */
export async function loadLetterheadBytes(): Promise<Uint8Array | null> {
  try {
    const { loadLetterheadUrl } = await import('./brandAssets');
    const res = await fetch(await loadLetterheadUrl());
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function frame(doc: Doc, title: string, number: string, letterhead: Uint8Array | null) {
  if (letterhead) doc.addImage(letterhead, 'JPEG', 0, 0, PAGE.width, PAGE.height, 'letterhead', 'FAST');
  doc.setTextColor(...BRAND);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(LAYOUT.font.title);
  doc.text(title, LAYOUT.corner.right, LAYOUT.corner.titleY, { align: 'right' });
  doc.setTextColor(...INK);
  doc.setFontSize(LAYOUT.font.number);
  doc.text(number, LAYOUT.corner.right, LAYOUT.corner.numberY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
}

/** Write "<number> · Page x of y" on every page once the page count is known. */
function stampPages(doc: Doc, number: string) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(LAYOUT.font.small);
    doc.setTextColor(...MUTED);
    doc.text(pageLabel(number, i, n), LAYOUT.footer.right, LAYOUT.footer.baseline, { align: 'right' });
  }
}

/** Start a block at y; if it does not fit above the body bottom, continue on a new page. */
function ensure(doc: Doc, y: number, height: number, title: string, number: string, lh: Uint8Array | null): number {
  if (y + height <= B.bottom) return y;
  doc.addPage('a4', 'portrait');
  frame(doc, title, number, lh);
  return B.top;
}

const lineH = (pt: number) => pt * PT * 1.35;

function textBlock(doc: Doc, lines: string[], x: number, y: number, width: number, size: number, style: 'normal' | 'bold' = 'normal', color: Rgb = INK): number {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  let yy = y;
  for (const l of lines) {
    for (const part of doc.splitTextToSize(l, width) as string[]) { doc.text(part, x, yy); yy += lineH(size); }
  }
  return yy;
}

function factsBlock(doc: Doc, facts: Array<[string, string]>, x: number, y: number, labelW: number, width: number): number {
  let yy = y;
  for (const [k, v] of facts) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(LAYOUT.font.body); doc.setTextColor(...MUTED);
    doc.text(k, x, yy);
    const parts = doc.splitTextToSize(v, width - labelW) as string[];
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
    parts.forEach((p, i) => doc.text(p, x + labelW, yy + i * lineH(LAYOUT.font.body)));
    yy += parts.length * lineH(LAYOUT.font.body);
  }
  return yy;
}

export function buildInvoicePdf(d: InvoicePrintData, letterhead: Uint8Array | null): Doc {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }) as Doc;
  doc.setProperties({ title: `${d.title} ${d.number}`, subject: d.title, author: d.seller.name, creator: d.seller.name });
  frame(doc, d.title, d.number, letterhead);

  // ---- page 1 block
  let y = B.top + 3;
  const seller = [d.seller.name, d.seller.vat ? `VATIN ${d.seller.vat}` : '', d.seller.cr ? `CR ${d.seller.cr}` : ''].filter(Boolean).join('   ·   ');
  y = textBlock(doc, [seller], B.left, y, BODY_WIDTH, LAYOUT.font.small, 'bold', MUTED);
  if (!d.posted) y = textBlock(doc, [`${d.status.toUpperCase()}: NOT POSTED TO THE LEDGER`], B.left, y + 1, BODY_WIDTH, LAYOUT.font.body, 'bold', DANGER);
  y += 2;
  const colW = BODY_WIDTH / 2 - 4;
  let left = textBlock(doc, [d.party.label.toUpperCase()], B.left, y, colW, LAYOUT.font.small, 'bold', MUTED);
  left = textBlock(doc, [d.party.name], B.left, left, colW, LAYOUT.font.body + 1, 'bold');
  const partyLines = [d.party.address, d.party.vat ? `VATIN ${d.party.vat}` : '', d.party.phone ? `Phone ${d.party.phone}` : ''].filter(Boolean);
  left = textBlock(doc, partyLines, B.left, left, colW, LAYOUT.font.body);
  const right = factsBlock(doc, d.facts, B.left + BODY_WIDTH / 2 + 4, y, 30, colW);
  y = Math.max(left, right) + 3;

  // ---- lines: header repeated on every page, rows never split
  const head = ['#', 'Description', 'Qty', 'Unit price', ...(d.showDiscount ? ['Discount'] : []), 'VAT %', 'VAT', `Amount (${d.currency})`];
  const body = d.lines.map(l => [String(l.no), l.detail ? `${l.description}\n${l.detail}` : l.description, l.quantity, l.unitPrice,
    ...(d.showDiscount ? [l.discount] : []), l.vatRate, l.vat, l.amount]);
  const num = { halign: 'right' as const };
  autoTable(doc, {
    head: [head],
    body: body.length ? body : [[{ content: 'No lines', colSpan: head.length, styles: { halign: 'center', textColor: MUTED } }]],
    startY: y,
    margin: { left: B.left, right: PAGE.width - B.right, top: B.top, bottom: PAGE.height - B.bottom },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: LAYOUT.font.body, cellPadding: 1.6, textColor: INK, lineColor: RULE, lineWidth: 0.15, valign: 'top', fillColor: false as unknown as Rgb },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: LAYOUT.font.head },
    alternateRowStyles: { fillColor: false as unknown as Rgb },
    columnStyles: d.showDiscount
      ? { 0: { cellWidth: 8 }, 2: { cellWidth: 16, ...num }, 3: { cellWidth: 21, ...num }, 4: { cellWidth: 18, ...num }, 5: { cellWidth: 13, ...num }, 6: { cellWidth: 19, ...num }, 7: { cellWidth: 25, ...num } }
      : { 0: { cellWidth: 8 }, 2: { cellWidth: 18, ...num }, 3: { cellWidth: 23, ...num }, 4: { cellWidth: 14, ...num }, 5: { cellWidth: 21, ...num }, 6: { cellWidth: 27, ...num } },
    // numeric headings line up with their figures
    didParseCell: cell => { if (cell.section === 'head' && cell.column.index >= 2) cell.cell.styles.halign = 'right'; },
    willDrawPage: data => { if (data.pageNumber > 1) frame(doc, d.title, d.number, letterhead); },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 5;

  // ---- totals with the amount in words
  const totalsH = d.totals.length * lineH(LAYOUT.font.totals) + 18;
  y = ensure(doc, y, totalsH, d.title, d.number, letterhead);
  const tx = B.right - 70;
  let ty = y;
  for (const t of d.totals) {
    doc.setFont('helvetica', t.strong ? 'bold' : 'normal');
    doc.setFontSize(t.strong ? LAYOUT.font.totals + 1 : LAYOUT.font.totals);
    doc.setTextColor(...INK);
    if (t.strong) { ty += 1.5; doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(tx, ty - lineH(LAYOUT.font.totals) + 0.6, B.right, ty - lineH(LAYOUT.font.totals) + 0.6); }
    doc.text(t.label, tx, ty);
    doc.text(t.value, B.right, ty, { align: 'right' });
    ty += lineH(LAYOUT.font.totals) + (t.strong ? 1 : 0);
  }
  let wy = textBlock(doc, ['AMOUNT IN WORDS'], B.left, y, tx - B.left - 8, LAYOUT.font.small, 'bold', MUTED);
  wy = textBlock(doc, [`${d.currency} ${d.words}`], B.left, wy, tx - B.left - 8, LAYOUT.font.body, 'bold');
  if (d.notes) wy = textBlock(doc, [`Notes: ${d.notes}`], B.left, wy + 1.5, tx - B.left - 8, LAYOUT.font.small, 'normal', MUTED);
  if (d.terms) wy = textBlock(doc, [`Terms: ${d.terms}`], B.left, wy + 1, tx - B.left - 8, LAYOUT.font.small, 'normal', MUTED);
  y = Math.max(ty, wy) + 4;

  // ---- bank details and signatures
  const bankH = d.bank.length ? d.bank.length * lineH(LAYOUT.font.body) + 6 : 0;
  const signH = 24;
  y = ensure(doc, y, bankH + signH, d.title, d.number, letterhead);
  if (d.bank.length) {
    y = textBlock(doc, ['BANK DETAILS'], B.left, y, BODY_WIDTH, LAYOUT.font.small, 'bold', MUTED);
    y = factsBlock(doc, d.bank, B.left, y, 26, BODY_WIDTH / 2) + 3;
  }
  const sy = y + 14;
  doc.setDrawColor(...INK); doc.setLineWidth(0.2);
  doc.line(B.left, sy, B.left + 60, sy);
  doc.line(B.right - 60, sy, B.right, sy);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(LAYOUT.font.small); doc.setTextColor(...INK);
  doc.text('Prepared by', B.left, sy + 4);
  doc.text('Authorised signature & stamp', B.right, sy + 4, { align: 'right' });

  stampPages(doc, d.number);
  return doc;
}

export function buildStatementPdf(d: StatementPrintData, letterhead: Uint8Array | null): Doc {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }) as Doc;
  doc.setProperties({ title: `${d.party.name} statement ${d.asOf}`, author: d.seller.name });
  frame(doc, 'STATEMENT', d.asOf, letterhead);
  let y = B.top + 3;
  const seller = [d.seller.name, d.seller.vat ? `VATIN ${d.seller.vat}` : '', d.seller.cr ? `CR ${d.seller.cr}` : ''].filter(Boolean).join('   ·   ');
  y = textBlock(doc, [seller], B.left, y, BODY_WIDTH, LAYOUT.font.small, 'bold', MUTED) + 1;
  y = textBlock(doc, [d.party.name], B.left, y, BODY_WIDTH, LAYOUT.font.body + 2, 'bold');
  y = textBlock(doc, [d.party.address, d.party.vat ? `VATIN ${d.party.vat}` : ''].filter(Boolean), B.left, y, BODY_WIDTH, LAYOUT.font.body);
  y = textBlock(doc, ['Bill-wise Details', `Pending Bills as of ${d.asOf}`], B.left, y + 2, BODY_WIDTH, LAYOUT.font.body, 'bold') + 1;
  autoTable(doc, {
    head: [['Date', 'Ref. No.', `Opening Amount (${d.currency})`, `Pending Amount (${d.currency})`, 'Due on', 'Overdue by days']],
    body: d.rows.length
      ? d.rows.flatMap(r => [[r.date, r.ref, r.opening, r.pending, r.due, r.overdue],
        [{ content: r.sub, colSpan: 6, styles: { fontStyle: 'italic', textColor: MUTED, fontSize: LAYOUT.font.small, cellPadding: { top: 0, bottom: 1.4, left: 1.6, right: 1.6 } } }]])
      : [[{ content: 'No pending bills.', colSpan: 6, styles: { halign: 'center', textColor: MUTED } }]],
    foot: [[{ content: 'Total', colSpan: 3, styles: { halign: 'right' } }, { content: d.total, styles: { halign: 'right' } }, '', '']],
    startY: y,
    margin: { left: B.left, right: PAGE.width - B.right, top: B.top, bottom: PAGE.height - B.bottom },
    showHead: 'everyPage', showFoot: 'lastPage', rowPageBreak: 'avoid', theme: 'plain',
    styles: { font: 'helvetica', fontSize: LAYOUT.font.body, cellPadding: 1.4, textColor: INK },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: LAYOUT.font.head },
    footStyles: { fontStyle: 'bold', textColor: INK, lineWidth: { top: 0.3 }, lineColor: INK },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'right' } },
    didParseCell: cell => { if (cell.section === 'head' && [2, 3, 5].includes(cell.column.index)) cell.cell.styles.halign = 'right'; },
    willDrawPage: data => { if (data.pageNumber > 1) frame(doc, 'STATEMENT', d.asOf, letterhead); },
  });
  stampPages(doc, d.number);
  return doc;
}

/** Save the PDF as `<number>.pdf`. */
export function savePdf(doc: jsPDF, number: string) {
  doc.save(documentFileName(number));
}
