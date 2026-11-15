// Printed documents on the company letterhead: geometry, the data a page shows, page planning and
// file names. Shared by the HTML print view (LetterheadDocument) and the PDF (letterheadPdf.ts), so
// both put the same things in the same places. Pure functions, unit tested.
//
// Geometry: measured on the letterhead artwork in Stage 1 (docs/UPGRADE_NOTES.md 1.2), in mm from the
// top-left corner of an A4 page (210 x 297). The logo block ends at y 30 and x 156; the bottom band
// starts at y 275.8.
import type { Invoice } from '../types/finance';
import type { Company } from '../types/system';
import type { Organization } from '../services/org';
import { amountInWords } from './amountInWords';

export const PAGE = { width: 210, height: 297 } as const;
export const LAYOUT = {
  body: { left: 14, right: 196, top: 36, bottom: 266 },
  corner: { left: 160, right: 196, titleY: 17, numberY: 23.5 },
  footer: { right: 196, baseline: 271.5 },
  font: { body: 8.5, small: 7.5, title: 13, number: 10, head: 8, totals: 9 },   // pt
} as const;
export const BODY_WIDTH = LAYOUT.body.right - LAYOUT.body.left;     // 182 mm
export const BODY_HEIGHT = LAYOUT.body.bottom - LAYOUT.body.top;    // 230 mm

export type DocumentKind = 'TAX INVOICE' | 'CREDIT NOTE' | 'DEBIT NOTE' | 'PURCHASE BILL' | 'STATEMENT';

export const documentTitle = (inv: Pick<Invoice, 'isCreditNote' | 'isDebitNote' | 'invoiceType'>): DocumentKind =>
  inv.isCreditNote ? 'CREDIT NOTE' : inv.isDebitNote ? 'DEBIT NOTE' : inv.invoiceType === 'Sales' ? 'TAX INVOICE' : 'PURCHASE BILL';

/** `447-FT-2026` -> `447-FT-2026.pdf`; characters a file name cannot hold become `-`. */
export function documentFileName(number: string, fallback = 'document'): string {
  const base = (number || fallback).trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
  return `${base}.pdf`;
}

/** Bottom corner text: `447-FT-2026 · Page 1 of 2`. */
export const pageLabel = (number: string, page: number, pages: number) => `${number} · Page ${page} of ${pages}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-11-15' -> '15-Nov-2026' (no time zone involved). */
export function printDate(ymd?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : '';
}

/** 3 decimals with thousands separators: 2677.5 -> '2,677.500'. */
export const money3 = (n: number) =>
  (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export interface PrintLine {
  no: number;
  description: string;
  detail: string;            // item code / vehicle, second line in small type
  quantity: string;          // '4 Hrs'
  unitPrice: string;
  discount: string;          // '' when none
  vatRate: string;           // '5%'
  vat: string;
  amount: string;
}

export interface InvoicePrintData {
  title: DocumentKind;
  number: string;
  posted: boolean;
  status: string;            // shown when not posted: 'Draft', 'Pending Approval', 'Cancelled'
  seller: { name: string; vat: string; cr: string };
  office: string;            // issuing office (branch)
  party: { label: string; name: string; address: string; vat: string; phone: string };
  facts: Array<[string, string]>;   // label/value pairs of the page 1 block (dates, reference, LPO, ...)
  currency: string;
  lines: PrintLine[];
  showDiscount: boolean;
  totals: Array<{ label: string; value: string; strong?: boolean }>;
  words: string;
  bank: Array<[string, string]>;    // empty when the office has no bank details on record
  notes: string;
  terms: string;
}

interface Party { name?: string; address?: string; vatNumber?: string; phone?: string }

/**
 * Everything a printed invoice, credit note or debit note shows, from the app's own records:
 * the invoice (with its party snapshot), its office and the organization. Nothing is invented: a
 * field with no data is left out.
 */
export function invoicePrintData(
  invoice: Invoice,
  office: Pick<Company, 'name' | 'bankDetails' | 'vatNumber' | 'registrationNumber'> | undefined,
  org: Pick<Organization, 'legalName' | 'tradeName' | 'vatNumber' | 'crNumber'> | null,
  extra: { parentNumber?: string; party?: Party } = {},
): InvoicePrintData {
  const title = documentTitle(invoice);
  const isNote = !!(invoice.isCreditNote || invoice.isDebitNote);
  const sales = invoice.invoiceType === 'Sales';
  const cur = invoice.currency || 'OMR';
  const items = invoice.items ?? [];
  const showDiscount = items.some(i => (i.discountAmount ?? 0) > 0);
  const rates = Array.from(new Set(items.map(i => i.taxRatePercentage)));
  const facts: Array<[string, string]> = [];
  const add = (label: string, value?: string | null) => { if (value && String(value).trim()) facts.push([label, String(value).trim()]); };
  add(isNote ? 'Date' : 'Invoice date', printDate(invoice.invoiceDate));
  if (!isNote) add('Due date', printDate(invoice.dueDate));
  add('Office', office?.name || invoice.companyName);
  if (isNote) add('Against invoice', extra.parentNumber || invoice.referenceNumber);
  else add(sales ? 'Reference' : 'Supplier invoice no.', invoice.referenceNumber);
  add('LPO no.', invoice.purchaseOrderNumber);
  add('Work order', invoice.workOrderNumber);
  add('Vehicle', invoice.vehiclePlate);
  if (!isNote && invoice.paymentTermsDays) add('Payment terms', `${invoice.paymentTermsDays} days`);

  const abs = (n: number) => Math.abs(Number(n) || 0);
  const totals: InvoicePrintData['totals'] = [{ label: 'Subtotal', value: money3(abs(invoice.subtotal)) }];
  if (abs(invoice.discountTotal) > 0) totals.push({ label: 'Discount', value: `-${money3(abs(invoice.discountTotal))}` });
  totals.push({ label: rates.length === 1 ? `VAT ${rates[0]}%` : 'VAT', value: money3(abs(invoice.taxTotal)) });
  if ((invoice.otherCharges ?? 0) > 0) totals.push({ label: 'Other charges', value: money3(invoice.otherCharges) });
  totals.push({ label: `Total (${cur})`, value: money3(abs(invoice.grandTotal)), strong: true });

  const b = office?.bankDetails;
  const bank: Array<[string, string]> = [];
  if (sales && b && (b.bankName || b.iban || b.accountNumber)) {
    const name = org?.legalName || org?.tradeName || '';
    if (name) bank.push(['Account name', name]);
    if (b.bankName) bank.push(['Bank', [b.bankName, b.branch].filter(Boolean).join(', ')]);
    if (b.accountNumber) bank.push(['Account no.', b.accountNumber]);
    if (b.iban) bank.push(['IBAN', b.iban]);
    if (b.swiftCode) bank.push(['SWIFT', b.swiftCode]);
  }

  const p = extra.party ?? {};
  return {
    title,
    number: invoice.invoiceNumber,
    posted: invoice.approvalStatus === 'Approved',
    status: invoice.paymentStatus === 'Cancelled' ? 'Cancelled' : invoice.approvalStatus,
    seller: {
      name: org?.legalName || org?.tradeName || office?.name || '',
      vat: office?.vatNumber || org?.vatNumber || '',
      cr: office?.registrationNumber || org?.crNumber || '',
    },
    office: office?.name || invoice.companyName,
    party: {
      label: sales ? 'Bill to' : 'Supplier',
      name: invoice.partyName || p.name || '',
      address: invoice.partyAddress || p.address || '',
      vat: invoice.partyVatNumber || p.vatNumber || '',
      phone: invoice.partyPhone || p.phone || '',
    },
    facts,
    currency: cur,
    lines: items.map((i, idx) => ({
      no: idx + 1,
      description: i.description,
      detail: [i.itemCode ? `Code ${i.itemCode}` : '', i.vehiclePlate ? `Vehicle ${i.vehiclePlate}` : ''].filter(Boolean).join(' · '),
      quantity: `${Number(i.quantity).toLocaleString('en-US', { maximumFractionDigits: 3 })}${i.unit ? ` ${i.unit}` : ''}`,
      unitPrice: money3(i.unitPrice),
      discount: i.discountAmount > 0 ? `-${money3(i.discountAmount)}` : '',
      vatRate: `${i.taxRatePercentage}%`,
      vat: money3(abs(i.taxAmount)),
      amount: money3(abs(i.lineTotal)),
    })),
    showDiscount,
    totals,
    words: amountInWords(abs(invoice.grandTotal)),
    bank,
    notes: invoice.notes?.trim() ?? '',
    terms: invoice.termsAndConditions?.trim() ?? '',
  };
}

// ---------------------------------------------------------------------------------------------
// Pending bills ("Bill-wise Details") statement for one party
// ---------------------------------------------------------------------------------------------
export interface PendingBill {
  date: string; number: string; dueDate: string; original: number; pending: number; isCredit: boolean;
}
export interface StatementPrintData {
  title: 'STATEMENT';
  number: string;            // shown in the corners: 'Statement 15-Nov-2026'
  seller: { name: string; vat: string; cr: string };
  party: { name: string; address: string; vat: string };
  asOf: string;
  rows: Array<{ date: string; ref: string; opening: string; pending: string; due: string; overdue: string; sub: string }>;
  total: string;
  currency: string;
}

const drcr = (n: number) => `${money3(Math.abs(n))} ${n < 0 ? 'Cr' : 'Dr'}`;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86400000);

/** Open bills of a client as of `asOf` (YYYY-MM-DD): opening and pending amounts, due date, days overdue. */
export function statementPrintData(
  bills: PendingBill[],
  party: StatementPrintData['party'],
  seller: StatementPrintData['seller'],
  asOf: string,
  currency = 'OMR',
): StatementPrintData {
  const sorted = [...bills].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  let total = 0;
  const rows = sorted.map(b => {
    const sign = b.isCredit ? -1 : 1;
    total += sign * b.pending;
    const overdue = !b.isCredit && b.dueDate && b.dueDate < asOf ? daysBetween(b.dueDate, asOf) : 0;
    return {
      date: printDate(b.date), ref: b.number,
      opening: drcr(sign * b.original), pending: drcr(sign * b.pending),
      due: printDate(b.dueDate), overdue: overdue > 0 ? `${overdue} days` : '',
      sub: `${printDate(b.date)}  ${b.isCredit ? 'Credit Note' : 'Sales'}  ${b.number}  ${money3(b.original)}`,
    };
  });
  return { title: 'STATEMENT', number: `Statement ${printDate(asOf)}`, seller, party, asOf: printDate(asOf), rows, total: drcr(total), currency };
}

// ---------------------------------------------------------------------------------------------
// Page planning for the HTML print view: rows are never split; the table header repeats.
// ---------------------------------------------------------------------------------------------
export interface PagePlan { rows: [number, number]; blocks: number[] }

/**
 * Split measured row heights into pages. `firstExtra` is the page 1 block above the table, `head`
 * the repeated table header, `blocks` the closing blocks (totals, bank, signatures) in order; each
 * block goes on the page after the last row if it fits, else on a new page. All in the same unit.
 */
export function planPages(rowHeights: number[], o: { body: number; firstExtra: number; head: number; blocks: number[] }): PagePlan[] {
  const pages: PagePlan[] = [];
  let start = 0, used = o.firstExtra + o.head;
  for (let i = 0; i < rowHeights.length; i++) {
    if (used + rowHeights[i] > o.body && i > start) {
      pages.push({ rows: [start, i], blocks: [] });
      start = i;
      used = o.head;
    }
    used += rowHeights[i];
  }
  pages.push({ rows: [start, rowHeights.length], blocks: [] });
  o.blocks.forEach((h, b) => {
    if (used + h > o.body && used > 0) { pages.push({ rows: [rowHeights.length, rowHeights.length], blocks: [] }); used = 0; }
    pages[pages.length - 1].blocks.push(b);
    used += h;
  });
  return pages;
}
