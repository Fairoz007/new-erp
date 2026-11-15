// Payment receipts/vouchers and payslips on the letterhead (docs/A4_PDF_PROMPT.md stage 4).
// The *Data functions are pure (what goes on the paper, from what the dialog shows); the build*
// functions draw it with the shared frame. Loaded on demand with the rest of the PDF code.
import { amountInWords } from '../amountInWords';
import { printDate } from '../invoicePrint';
import type { Payment, Invoice } from '../../types/finance';
import type { PayslipModalData } from '../../types/hr';
import type { DocumentCompany, DocumentOffice } from '../branding';
import { figure } from './statements';
import {
  INK, LAYOUT, MUTED, RULE, a4Table, bankAndSignatures, bodyWidth, factsBlock, sellerBlock, startA4, stampPages, textBlock, totalsBlock,
  type Doc, type Rgb, type Seller, type TotalLine,
} from './frame';

/** Seller line: the office's VAT/CR when it has its own, else the organization's (as on invoices). */
export function sellerOf(office: Pick<DocumentOffice, 'name' | 'vatNumber' | 'registrationNumber'> | null | undefined, company: Pick<DocumentCompany, 'legalName' | 'vatNumber' | 'crNumber'>): Seller {
  return {
    name: company.legalName || office?.name || '',
    vat: office?.vatNumber || company.vatNumber || '',
    cr: office?.registrationNumber || company.crNumber || '',
  };
}

/** Words only for Omani Rials: the wording (Rials and Baisa) is OMR's. */
const wordsFor = (n: number, currency: string) => (currency.toUpperCase() === 'OMR' ? amountInWords(Math.abs(n)) : undefined);

// ---------------------------------------------------------------------------------------------
// Payment receipt (money in) / payment voucher (money out)
// ---------------------------------------------------------------------------------------------

export interface VoucherData {
  title: 'RECEIPT VOUCHER' | 'PAYMENT VOUCHER';
  number: string;
  seller: Seller;
  party: { label: string; name: string; kind: string };
  facts: Array<[string, string]>;
  lines: string[][];
  totals: TotalLine[];
  currency: string;
  words?: string;
  notes: string;
  signatures: [string, string];
  fileName: string;
}

export function voucherData(
  p: Payment,
  o: { office: DocumentOffice | null; company: DocumentCompany; bankAccountNumber?: string; invoice?: Pick<Invoice, 'grandTotal' | 'amountPaid' | 'outstandingAmount' | 'currency' | 'invoiceDate'> | null; currency: string },
): VoucherData {
  const incoming = p.partyType === 'Customer';
  const cur = p.currency || o.currency;
  const facts: Array<[string, string]> = [];
  const add = (k: string, v?: string | null) => { if (v && String(v).trim()) facts.push([k, String(v).trim()]); };
  add('Date', printDate(p.paymentDate));
  add('Office', o.office?.name);
  add('Method', p.paymentMethod);
  add(incoming ? 'Deposited to' : 'Paid from', [p.bankAccountName, o.bankAccountNumber ? `Acc ${o.bankAccountNumber}` : ''].filter(Boolean).join(' · '));
  add('Reference', p.transactionReference);
  add('Cheque no.', p.chequeNumber);
  const inv = o.invoice;
  const particulars = `${incoming ? 'Received against' : 'Paid against'} ${p.invoiceType === 'Purchase' ? 'bill' : 'invoice'} ${p.invoiceNumber}`;
  // invoice date and total only when the linked invoice could be read
  const lines: string[][] = [inv
    ? [particulars, printDate(inv.invoiceDate), figure(inv.grandTotal, inv.currency || cur), figure(p.amount, cur)]
    : [particulars, figure(p.amount, cur)]];
  const totals: TotalLine[] = [{ label: `${incoming ? 'Amount received' : 'Amount paid'} (${cur})`, value: figure(p.amount, cur), strong: true }];
  if (inv) totals.push({ label: 'Invoice balance due', value: figure(inv.outstandingAmount, inv.currency || cur) });
  return {
    title: incoming ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER',
    number: p.paymentNumber,
    seller: sellerOf(o.office, o.company),
    party: { label: incoming ? 'Received from' : 'Paid to', name: p.partyName, kind: p.partyType },
    facts,
    lines,
    totals,
    currency: cur,
    words: wordsFor(p.amount, cur),
    notes: p.notes?.trim() ?? '',
    signatures: incoming ? ['Received by', 'Authorised signature & stamp'] : ['Prepared by', 'Receiver signature & date'],
    fileName: `${p.paymentNumber}.pdf`,
  };
}

const NONE = false as unknown as Rgb;

/** Party on the left, facts on the right, as on invoices; returns the y under the taller side. */
function partyAndFacts(a: ReturnType<typeof startA4>, y: number, label: string, name: string, sub: string[], facts: Array<[string, string]>): number {
  const half = bodyWidth(a) / 2;
  const colW = half - 4;
  let left = textBlock(a, [label.toUpperCase()], a.g.body.left, y, colW, LAYOUT.font.small, 'bold', MUTED);
  left = textBlock(a, [name], a.g.body.left, left, colW, LAYOUT.font.body + 1, 'bold');
  left = textBlock(a, sub.filter(Boolean), a.g.body.left, left, colW, LAYOUT.font.body);
  const right = factsBlock(a, facts, a.g.body.left + half + 4, y, 30, colW);
  return Math.max(left, right) + 3;
}

export function buildVoucherPdf(d: VoucherData, letterhead: Uint8Array | null): Doc {
  const a = startA4({ title: d.title, corner: d.number, letterhead, properties: { title: `${d.title} ${d.number}`, subject: d.title, author: d.seller.name } });
  let y = sellerBlock(a, d.seller) + 2;
  y = partyAndFacts(a, y, d.party.label, d.party.name, [d.party.kind], d.facts);
  y = a4Table(a, {
    head: [d.lines[0].length === 4 ? ['Particulars', 'Invoice date', `Invoice total (${d.currency})`, `Amount (${d.currency})`] : ['Particulars', `Amount (${d.currency})`]],
    body: d.lines,
    startY: y,
    theme: 'grid',
    styles: { cellPadding: 1.6, lineColor: RULE, lineWidth: 0.15, fillColor: NONE },
    alternateRowStyles: { fillColor: NONE },
    numeric: d.lines[0].length === 4 ? [2, 3] : [1],
    columnStyles: d.lines[0].length === 4 ? { 1: { cellWidth: 24 }, 2: { cellWidth: 32 }, 3: { cellWidth: 32 } } : { 1: { cellWidth: 32 } },
  }) + 5;
  y = totalsBlock(a, y, { totals: d.totals, words: d.words, currency: d.words ? d.currency : undefined, notes: d.notes });
  bankAndSignatures(a, y, [], d.signatures);
  stampPages(a);
  return a.doc;
}

// ---------------------------------------------------------------------------------------------
// Payslip
// ---------------------------------------------------------------------------------------------

/** Bank account with only its last 4 characters (decision 5): "**** 4821". */
export function maskAccount(acc?: string | null): string {
  const s = (acc ?? '').replace(/\s+/g, '');
  if (!s) return '';
  return s.length <= 4 ? `**** ${s}` : `**** ${s.slice(-4)}`;
}

export interface PayslipData {
  number: string;
  period: string;
  seller: Seller;
  employee: { name: string; code: string };
  facts: Array<[string, string]>;
  earnings: Array<[string, string]>;
  deductions: Array<[string, string]>;
  gross: string;
  totalDeductions: string;
  net: string;
  currency: string;
  words?: string;
  notes: string;
  fileName: string;
}

/** The payslip as the dialog shows it: the same lines, in the same order, with the same totals. */
export function payslipData(p: PayslipModalData, o: { office: DocumentOffice | null; company: DocumentCompany; currency: string }): PayslipData {
  const cur = o.currency;
  const f = (n: number) => figure(n, cur);
  const earnings: Array<[string, string]> = [['Basic Salary', f(p.basicSalary)], ['Housing Allowance', f(p.housingAllowance)], ['Transport Allowance', f(p.transportAllowance)]];
  const itemised = (p.lines ?? []).filter(l => l.kind !== 'Deduction');
  const rest = Math.round((p.otherAllowances - itemised.reduce((t, l) => t + l.amount, 0)) * 1000) / 1000;
  if (rest > 0) earnings.push(['Other Allowances', f(rest)]);
  itemised.forEach(l => earnings.push([l.description, f(l.amount)]));
  if (p.overtimeAmount > 0) earnings.push([`Overtime${p.overtimeHours ? ` (${p.overtimeHours} h)` : ''}`, f(p.overtimeAmount)]);
  if (p.bonusAmount > 0) earnings.push(['Bonus', f(p.bonusAmount)]);

  const deductions: Array<[string, string]> = [['PASI Social Insurance (employee share)', f(p.pasiEmployeeDeduction)]];
  if (p.unpaidLeaveDeduction > 0) deductions.push([`Unpaid Leave${p.unpaidLeaveDays ? ` (${p.unpaidLeaveDays} days)` : ''}`, f(p.unpaidLeaveDeduction)]);
  const itemisedDed = (p.lines ?? []).filter(l => l.kind === 'Deduction');
  if (itemisedDed.length) itemisedDed.forEach(l => deductions.push([l.description, f(l.amount)]));
  else if (p.otherDeductions > 0) deductions.push(['Other Deductions', f(p.otherDeductions)]);
  if (p.loanAdvanceDeduction > 0) deductions.push(['Salary Advance / Loan', f(p.loanAdvanceDeduction)]);

  const paid = p.status === 'Paid';
  const facts: Array<[string, string]> = [];
  const add = (k: string, v?: string | number | null) => { if (v !== undefined && v !== null && String(v).trim()) facts.push([k, String(v).trim()]); };
  add('Period', p.periodLabel);
  add(paid ? 'Payment date' : 'Pay date (scheduled)', printDate(p.paymentDate));
  add('Status', p.status);
  add('Bank', p.bankName);
  add('Account', maskAccount(p.iban));
  add('Days worked', p.daysWorked ?? undefined);
  const ym = `${p.year}-${String(p.month).padStart(2, '0')}`;
  return {
    number: `${p.employeeCode} · ${ym}`,
    period: p.periodLabel,
    seller: sellerOf(o.office, o.company),
    employee: { name: p.employeeName, code: p.employeeCode },
    facts,
    earnings, deductions,
    gross: f(p.grossPay), totalDeductions: f(p.totalDeductions), net: f(p.netPay),
    currency: cur,
    words: wordsFor(p.netPay, cur),
    notes: p.notes?.trim() ?? '',
    fileName: `Payslip_${(p.employeeCode || 'employee').replace(/[^A-Za-z0-9_-]+/g, '_')}_${ym}.pdf`,
  };
}

export function buildPayslipPdf(d: PayslipData, employeeLines: string[], letterhead: Uint8Array | null): Doc {
  const a = startA4({ title: 'PAYSLIP', corner: d.period, footer: `Payslip ${d.number}`, letterhead, properties: { title: `Payslip ${d.number}`, subject: 'Payslip', author: d.seller.name } });
  let y = sellerBlock(a, d.seller) + 2;
  y = partyAndFacts(a, y, 'Employee', d.employee.name, [`Employee ID ${d.employee.code}`, ...employeeLines], d.facts);
  // earnings and deductions side by side, padded to the same length
  const n = Math.max(d.earnings.length, d.deductions.length);
  const body = Array.from({ length: n }, (_, i) => [...(d.earnings[i] ?? ['', '']), ...(d.deductions[i] ?? ['', ''])]);
  y = a4Table(a, {
    head: [['Earnings', `Amount (${d.currency})`, 'Deductions', `Amount (${d.currency})`]],
    body,
    foot: [['Total gross earnings', { content: d.gross, styles: { halign: 'right' } }, 'Total deductions', { content: d.totalDeductions, styles: { halign: 'right' } }]],
    showFoot: 'lastPage',
    startY: y,
    theme: 'grid',
    styles: { cellPadding: 1.6, lineColor: RULE, lineWidth: 0.15, fillColor: NONE },
    alternateRowStyles: { fillColor: NONE },
    footStyles: { fontStyle: 'bold', textColor: INK, fillColor: NONE, lineColor: INK, lineWidth: { top: 0.3 } },
    numeric: [1, 3],
    columnStyles: { 1: { cellWidth: 28 }, 3: { cellWidth: 28 } },
  }) + 5;
  y = totalsBlock(a, y, { totals: [{ label: `Net pay (${d.currency})`, value: d.net, strong: true }], words: d.words, currency: d.words ? d.currency : undefined, notes: d.notes });
  y = textBlock(a, ['This is a computer-generated payslip.'], a.g.body.left, y + 2, bodyWidth(a), LAYOUT.font.small, 'normal', MUTED);
  bankAndSignatures(a, y, [], ['Prepared by (HR & Payroll)', 'Employee signature & date']);
  stampPages(a);
  return a.doc;
}
