// The one A4 letterhead frame for every printed and downloaded document (docs/A4_PDF_PROMPT.md B1).
//
//   * the letterhead image behind every page (inside the safe area nothing overlaps its artwork);
//   * the title and the document number (or period) in the top-right corner of every page;
//   * "<label> · Page x of y" in the bottom corner of every page;
//   * page-1 helpers (seller line, text and label/value blocks);
//   * tables with the header repeated on every page and rows never split;
//   * closing blocks: totals with the amount in words, bank details, signature lines.
//
// Geometry and type sizes come from LAYOUT in src/lib/invoicePrint.ts, which the HTML print view
// (src/components/common/LetterheadDocument.tsx) also uses. jsPDF is imported here, so this module
// is only ever loaded on demand (dynamic import), keeping it out of the initial bundle.
import { jsPDF } from 'jspdf';
import autoTable, { type UserOptions } from 'jspdf-autotable';
import { brand, neutral, status } from '../tokens';
import { LAYOUT, PAGE, BODY_WIDTH, documentFileName, pageLabel } from '../invoicePrint';

export type Doc = jsPDF & { lastAutoTable?: { finalY: number } };
export type Rgb = [number, number, number];

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const INK: Rgb = hex(neutral.text);
export const MUTED: Rgb = hex(neutral.textMuted);
export const RULE: Rgb = hex(neutral.divider);
export const DANGER: Rgb = hex(status.danger[700]);
export const BRAND: Rgb = hex(brand[500]);
export const WHITE: Rgb = [255, 255, 255];

/** The body (safe area) in mm. */
export const BODY = LAYOUT.body;
export { BODY_WIDTH, LAYOUT, PAGE };
const PT = 0.3528; // mm per point

/** Height of one text line at `pt` points, in mm. */
export const lineH = (pt: number) => pt * PT * 1.35;

/** The letterhead JPEG as bytes, or null (the PDF is then drawn on plain white). */
export async function loadLetterheadBytes(): Promise<Uint8Array | null> {
  try {
    const { loadLetterheadUrl } = await import('../brandAssets');
    const res = await fetch(await loadLetterheadUrl());
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** A document being drawn: the jsPDF instance plus what the frame repeats on every page. */
export interface A4 {
  doc: Doc;
  /** Top-right title, e.g. "TAX INVOICE". */
  title: string;
  /** Under the title: the document number, or for reports the period. */
  corner: string;
  /** Bottom corner label before " · Page x of y". */
  footer: string;
  letterhead: Uint8Array | null;
}

export interface A4Options {
  title: string;
  corner: string;
  footer?: string;
  letterhead: Uint8Array | null;
  /** PDF document properties. */
  properties?: { title?: string; subject?: string; author?: string; creator?: string };
}

/** Draw the letterhead, title and corner text on the current page. */
export function drawFrame(a: A4) {
  const { doc } = a;
  if (a.letterhead) doc.addImage(a.letterhead, 'JPEG', 0, 0, PAGE.width, PAGE.height, 'letterhead', 'FAST');
  doc.setTextColor(...BRAND);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(LAYOUT.font.title);
  doc.text(a.title, LAYOUT.corner.right, LAYOUT.corner.titleY, { align: 'right' });
  doc.setTextColor(...INK);
  doc.setFontSize(LAYOUT.font.number);
  doc.text(a.corner, LAYOUT.corner.right, LAYOUT.corner.numberY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
}

/** A new A4 portrait document with the frame on page 1. */
export function startA4(o: A4Options): A4 {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }) as Doc;
  if (o.properties) doc.setProperties(o.properties);
  const a: A4 = { doc, title: o.title, corner: o.corner, footer: o.footer ?? o.corner, letterhead: o.letterhead };
  drawFrame(a);
  return a;
}

/** Add a page with the frame. */
export function addFramedPage(a: A4) {
  a.doc.addPage('a4', 'portrait');
  drawFrame(a);
}

/** Start a block of `height` mm at y; when it does not fit above the body bottom, continue on a new page. */
export function ensureSpace(a: A4, y: number, height: number): number {
  if (y + height <= BODY.bottom) return y;
  addFramedPage(a);
  return BODY.top;
}

/** Write "<footer> · Page x of y" on every page once the page count is known. Call last. */
export function stampPages(a: A4) {
  const { doc } = a;
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(LAYOUT.font.small);
    doc.setTextColor(...MUTED);
    doc.text(pageLabel(a.footer, i, n), LAYOUT.footer.right, LAYOUT.footer.baseline, { align: 'right' });
  }
}

// ---------------------------------------------------------------- text blocks

/** Lines of text wrapped to `width`; returns the y under the last line. */
export function textBlock(a: A4, lines: string[], x: number, y: number, width: number, size: number, style: 'normal' | 'bold' = 'normal', color: Rgb = INK): number {
  const { doc } = a;
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  let yy = y;
  for (const l of lines) {
    for (const part of doc.splitTextToSize(l, width) as string[]) { doc.text(part, x, yy); yy += lineH(size); }
  }
  return yy;
}

/** Label/value pairs (labels muted and bold, values wrapped); returns the y under the last pair. */
export function factsBlock(a: A4, facts: Array<[string, string]>, x: number, y: number, labelW: number, width: number): number {
  const { doc } = a;
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

export interface Seller { name: string; vat: string; cr: string }

/** "Name   ·   VATIN …   ·   CR …" with the empty parts left out. */
export const sellerLine = (s: Seller) =>
  [s.name, s.vat ? `VATIN ${s.vat}` : '', s.cr ? `CR ${s.cr}` : ''].filter(Boolean).join('   ·   ');

/** The seller line at the top of page 1; returns the y under it. */
export function sellerBlock(a: A4, s: Seller, y = BODY.top + 3): number {
  return textBlock(a, [sellerLine(s)], BODY.left, y, BODY_WIDTH, LAYOUT.font.small, 'bold', MUTED);
}

// ---------------------------------------------------------------- tables

export interface A4TableOptions extends UserOptions {
  /** Columns whose cells and heading are right-aligned (figures). */
  numeric?: number[];
}

/**
 * A table inside the safe area: header on every page, rows never split, the frame drawn on every
 * new page. Defaults can be overridden through the usual autotable options. Returns the y under it.
 */
export function a4Table(a: A4, o: A4TableOptions): number {
  const { numeric = [], columnStyles = {}, didParseCell, willDrawPage, styles, headStyles, ...rest } = o;
  const cols: Record<string, object> = { ...(columnStyles as Record<string, object>) };
  for (const i of numeric) cols[i] = { ...(cols[i] ?? {}), halign: 'right' };
  autoTable(a.doc, {
    margin: { left: BODY.left, right: PAGE.width - BODY.right, top: BODY.top, bottom: PAGE.height - BODY.bottom },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    ...rest,
    styles: { font: 'helvetica', fontSize: LAYOUT.font.body, textColor: INK, ...styles },
    headStyles: { fillColor: BRAND, textColor: WHITE, fontStyle: 'bold', fontSize: LAYOUT.font.head, ...headStyles },
    columnStyles: cols,
    // numeric headings line up with their figures
    didParseCell: cell => {
      if (cell.section === 'head' && numeric.includes(cell.column.index)) cell.cell.styles.halign = 'right';
      didParseCell?.(cell);
    },
    willDrawPage: data => {
      if (data.pageNumber > 1) drawFrame(a);
      willDrawPage?.(data);
    },
  });
  return a.doc.lastAutoTable?.finalY ?? (o.startY as number | undefined) ?? BODY.top;
}

// ---------------------------------------------------------------- closing blocks

export interface TotalLine { label: string; value: string; strong?: boolean }

/**
 * Totals on the right; on the left the amount in words (and optional notes/terms). Moves to a new
 * page when it does not fit. Returns the y under the block.
 */
export function totalsBlock(a: A4, y: number, o: { totals: TotalLine[]; words?: string; currency?: string; notes?: string; terms?: string }): number {
  const { doc } = a;
  const totalsH = o.totals.length * lineH(LAYOUT.font.totals) + 18;
  y = ensureSpace(a, y, totalsH);
  const tx = BODY.right - 70;
  let ty = y;
  for (const t of o.totals) {
    doc.setFont('helvetica', t.strong ? 'bold' : 'normal');
    doc.setFontSize(t.strong ? LAYOUT.font.totals + 1 : LAYOUT.font.totals);
    doc.setTextColor(...INK);
    if (t.strong) { ty += 1.5; doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(tx, ty - lineH(LAYOUT.font.totals) + 0.6, BODY.right, ty - lineH(LAYOUT.font.totals) + 0.6); }
    doc.text(t.label, tx, ty);
    doc.text(t.value, BODY.right, ty, { align: 'right' });
    ty += lineH(LAYOUT.font.totals) + (t.strong ? 1 : 0);
  }
  const w = tx - BODY.left - 8;
  let wy = y;
  if (o.words) {
    wy = textBlock(a, ['AMOUNT IN WORDS'], BODY.left, wy, w, LAYOUT.font.small, 'bold', MUTED);
    wy = textBlock(a, [o.currency ? `${o.currency} ${o.words}` : o.words], BODY.left, wy, w, LAYOUT.font.body, 'bold');
  }
  if (o.notes) wy = textBlock(a, [`Notes: ${o.notes}`], BODY.left, wy + 1.5, w, LAYOUT.font.small, 'normal', MUTED);
  if (o.terms) wy = textBlock(a, [`Terms: ${o.terms}`], BODY.left, wy + 1, w, LAYOUT.font.small, 'normal', MUTED);
  return Math.max(ty, wy) + 4;
}

/**
 * Bank details (when there are any) and two signature lines, kept together; moves to a new page
 * when they do not fit. Returns the y under the block.
 */
export function bankAndSignatures(a: A4, y: number, bank: Array<[string, string]>, labels: [string, string] = ['Prepared by', 'Authorised signature & stamp']): number {
  const { doc } = a;
  const bankH = bank.length ? bank.length * lineH(LAYOUT.font.body) + 6 : 0;
  y = ensureSpace(a, y, bankH + 24);
  if (bank.length) {
    y = textBlock(a, ['BANK DETAILS'], BODY.left, y, BODY_WIDTH, LAYOUT.font.small, 'bold', MUTED);
    y = factsBlock(a, bank, BODY.left, y, 26, BODY_WIDTH / 2) + 3;
  }
  const sy = y + 14;
  doc.setDrawColor(...INK); doc.setLineWidth(0.2);
  doc.line(BODY.left, sy, BODY.left + 60, sy);
  doc.line(BODY.right - 60, sy, BODY.right, sy);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(LAYOUT.font.small); doc.setTextColor(...INK);
  doc.text(labels[0], BODY.left, sy + 4);
  doc.text(labels[1], BODY.right, sy + 4, { align: 'right' });
  return sy + 4 + lineH(LAYOUT.font.small);
}

// ---------------------------------------------------------------- output

/** Save the PDF. `name` is a document number (saved as `<number>.pdf`) or a full file name ending in .pdf. */
export function savePdf(doc: jsPDF, name: string) {
  doc.save(/\.pdf$/i.test(name) ? name : documentFileName(name));
}

/**
 * Print exactly the PDF pages (so paper and file match): the PDF is loaded into a hidden frame and
 * the browser's print dialog opens for it. When the browser cannot print a PDF from a frame (some
 * mobile browsers, or a blocked frame), the file is downloaded instead and the caller is told.
 * Resolves to 'printed' or 'downloaded'.
 */
export function printPdf(doc: jsPDF, name: string): Promise<'printed' | 'downloaded'> {
  const fallback = (): 'downloaded' => { savePdf(doc, name); return 'downloaded'; };
  if (typeof document === 'undefined') return Promise.resolve(fallback());
  const url = URL.createObjectURL(doc.output('blob'));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.title = 'Print';
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  const cleanup = () => { frame.remove(); URL.revokeObjectURL(url); };
  return new Promise(resolve => {
    let done = false;
    const finish = (r: 'printed' | 'downloaded') => { if (!done) { done = true; resolve(r); } };
    // a frame that never loads (blocked) falls back to a download
    const timer = window.setTimeout(() => { cleanup(); finish(fallback()); }, 10_000);
    frame.onload = () => {
      window.clearTimeout(timer);
      try {
        const w = frame.contentWindow;
        if (!w) throw new Error('no frame window');
        w.focus();
        w.print();
        finish('printed');
        // keep the frame until the dialog has had time to read it
        window.setTimeout(cleanup, 60_000);
      } catch {
        cleanup();
        finish(fallback());
      }
    };
    frame.src = url;
    document.body.appendChild(frame);
  });
}
