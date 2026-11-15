import { describe, expect, it, vi } from 'vitest';
import type { Invoice } from '../../types/finance';

vi.mock('../supabase', () => ({ supabase: {} }));
const { invoicePrintData, documentFileName, pageLabel, planPages, statementPrintData, documentTitle } = await import('../invoicePrint');
const { buildInvoicePdf, buildStatementPdf } = await import('../letterheadPdf');

const line = (i: number) => ({
  id: `l${i}`, itemCode: '', description: `Staff bus hire, route ${i}`, quantity: 1, unit: 'Day', unitPrice: 42.5,
  discountPercentage: 0, discountAmount: 0, taxRatePercentage: 5, taxAmount: 2.125, lineTotal: 44.625,
});
const invoice = (n: number, extra: Partial<Invoice> = {}): Invoice => ({
  id: 'i1', invoiceNumber: '447-FT-2026', invoiceType: 'Sales', companyId: 'c1', companyName: 'Head Office',
  partyType: 'Customer', partyId: 'p1', partyName: 'Sample Customer', partyAddress: 'Muscat', partyVatNumber: 'OM0000000000',
  invoiceDate: '2026-11-15', dueDate: '2026-12-15', referenceNumber: 'REF-1', purchaseOrderNumber: 'LPO-9', currency: 'OMR', exchangeRate: 1,
  items: Array.from({ length: n }, (_, i) => line(i + 1)),
  subtotal: 42.5 * n, discountTotal: 0, taxTotal: 2.125 * n, otherCharges: 0, grandTotal: 44.625 * n, amountPaid: 0, outstandingAmount: 44.625 * n,
  paymentStatus: 'Unpaid', approvalStatus: 'Approved', paymentTermsDays: 30, createdAt: '', updatedAt: '', ...extra,
} as Invoice);
const office = { name: 'Head Office', vatNumber: '', registrationNumber: '', bankDetails: { bankName: '', accountNumber: '', iban: '', swiftCode: '', branch: '' } };
const org = { legalName: 'Al Hakim National LLC', tradeName: '', vatNumber: 'OM1100058123', crNumber: '1090254' };

/** Text drawn on each page, read back from the PDF content streams. */
function pageTexts(doc: { internal: { pages: unknown[] } }): string[] {
  return (doc.internal.pages.slice(1) as string[][]).map(p => p.join('\n').match(/\((?:\\.|[^\\)])*\)\s*Tj/g)?.map(s => s.slice(1, s.lastIndexOf(')'))).join(' ') ?? '');
}

describe('printed document helpers', () => {
  it('names the file after the number', () => {
    expect(documentFileName('447-FT-2026')).toBe('447-FT-2026.pdf');
    expect(documentFileName('CN/HO 2026:1')).toBe('CN-HO-2026-1.pdf');
    expect(documentFileName('')).toBe('document.pdf');
  });
  it('titles sales invoices, credit and debit notes', () => {
    expect(documentTitle({ invoiceType: 'Sales' })).toBe('TAX INVOICE');
    expect(documentTitle({ invoiceType: 'Sales', isCreditNote: true })).toBe('CREDIT NOTE');
    expect(documentTitle({ invoiceType: 'Sales', isDebitNote: true })).toBe('DEBIT NOTE');
    expect(pageLabel('447-FT-2026', 1, 2)).toBe('447-FT-2026 · Page 1 of 2');
  });
  it('puts totals, VAT 5% and the amount in words in the print data', () => {
    const d = invoicePrintData(invoice(3), office, org);
    expect(d.totals.map(t => t.label)).toEqual(['Subtotal', 'VAT 5%', 'Total (OMR)']);
    expect(d.totals[2].value).toBe('133.875');
    expect(d.words).toBe('One Hundred Thirty-Three Rials and Eight Hundred Seventy-Five Baisa');
    expect(d.seller).toEqual({ name: 'Al Hakim National LLC', vat: 'OM1100058123', cr: '1090254' });
    expect(d.bank).toEqual([]);          // no bank details on record: nothing invented
    expect(d.facts.map(f => f[0])).toEqual(['Invoice date', 'Due date', 'Office', 'Reference', 'LPO no.', 'Payment terms']);
  });
  it('plans pages without splitting rows and moves closing blocks to a new page when needed', () => {
    const p = planPages(Array(10).fill(10), { body: 50, firstExtra: 10, head: 5, blocks: [20, 20] });
    expect(p.map(x => x.rows)).toEqual([[0, 3], [3, 7], [7, 10], [10, 10]]);
    expect(p[3].blocks).toEqual([0, 1]);      // 35 used + 20 > 50: both blocks on a new page
    const q = planPages([10, 10], { body: 50, firstExtra: 0, head: 5, blocks: [20, 20] });
    expect(q).toEqual([{ rows: [0, 2], blocks: [0] }, { rows: [2, 2], blocks: [1] }]);
  });
});

describe('invoice PDF', () => {
  it('a 3-line invoice is one page with the number in both corners', () => {
    const doc = buildInvoicePdf(invoicePrintData(invoice(3), office, org), null);
    expect(doc.getNumberOfPages()).toBe(1);
    const [p1] = pageTexts(doc);
    expect(p1).toContain('TAX INVOICE');
    expect(p1).toContain('447-FT-2026 · Page 1 of 1');
  });
  it('a 60-line invoice runs over several pages with the title, number and page x of y on every page', () => {
    const doc = buildInvoicePdf(invoicePrintData(invoice(60), office, org), null);
    const n = doc.getNumberOfPages();
    expect(n).toBeGreaterThanOrEqual(2);
    const texts = pageTexts(doc);
    texts.forEach((t, i) => {
      expect(t).toContain('TAX INVOICE');
      expect(t).toContain(`447-FT-2026 · Page ${i + 1} of ${n}`);
      expect(t.indexOf('447-FT-2026')).toBeLessThan(t.indexOf('Page'));   // number top right, then the corner line
    });
    // the table header is repeated on every page that has rows (the last page may hold only the totals)
    texts.filter(t => /Staff bus hire/.test(t)).forEach(t => expect(t).toContain('Description'));
    const all = texts.join(' ').replace(/\s+/g, ' ');
    for (let i = 1; i <= 60; i++) expect(all).toContain(`Staff bus hire, route ${i} `);
    expect(all).toContain('Two Thousand Six Hundred Seventy-Seven Rials and Five Hundred Baisa');
  });
  it('a statement lists pending bills with Dr/Cr and the total', () => {
    const d = statementPrintData([
      { date: '2026-09-01', number: '400-FT-2026', dueDate: '2026-10-01', original: 210, pending: 210, isCredit: false },
      { date: '2026-10-05', number: 'CN-HO-2026-0001', dueDate: '', original: 10, pending: 10, isCredit: true },
    ], { name: 'Sample Customer', address: 'Muscat', vat: '' }, { name: 'Al Hakim National LLC', vat: 'OM1100058123', cr: '1090254' }, '2026-11-15');
    expect(d.rows[0]).toMatchObject({ opening: '210.000 Dr', pending: '210.000 Dr', overdue: '45 days' });
    expect(d.rows[1]).toMatchObject({ pending: '10.000 Cr', overdue: '' });
    expect(d.total).toBe('200.000 Dr');
    const doc = buildStatementPdf(d, null);
    expect(pageTexts(doc)[0]).toContain('Bill-wise Details');
  });
});
