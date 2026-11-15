import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
const v = await import('../a4/vouchers');

/** Text drawn on each page, read back from the PDF content streams. */
function pageTexts(doc: { internal: { pages: unknown[] } }): string[] {
  return (doc.internal.pages.slice(1) as string[][]).map(p => p.join('\n').match(/\((?:\\.|[^\\)])*\)\s*Tj/g)?.map(t => t.slice(1, t.lastIndexOf(')')).replace(/\\([()\\])/g, '$1')).join(' ') ?? '');
}
const company = { legalName: 'Sample Transport LLC', vatNumber: 'OM1100000000', crNumber: '1000000', address: '', city: '', country: 'Oman', phone: '', email: '' };
const office = { code: 'HO', name: 'Head Office', vatNumber: '', registrationNumber: '' };
const payment = {
  id: 'p1', paymentNumber: 'RV-2026-0012', companyId: 'c1', invoiceId: 'i1', invoiceNumber: '447-FT-2026', invoiceType: 'Sales', partyType: 'Customer',
  partyId: 'x', partyName: 'Sample Client LLC', paymentDate: '2026-11-10', amount: 2677.5, currency: 'OMR', paymentMethod: 'Bank Transfer',
  bankAccountId: 'b1', bankAccountName: 'Sample Bank current', transactionReference: 'TRX-1', chequeNumber: '', notes: 'Part payment', createdAt: '',
} as unknown as Parameters<typeof v.voucherData>[0];

describe('payment receipt and voucher', () => {
  it('a customer payment is a receipt voucher with the amount, words and invoice balance', () => {
    const d = v.voucherData(payment, { office, company, currency: 'OMR', bankAccountNumber: '0123456789',
      invoice: { grandTotal: 5000, amountPaid: 2677.5, outstandingAmount: 2322.5, currency: 'OMR', invoiceDate: '2026-10-01' } });
    expect(d.title).toBe('RECEIPT VOUCHER');
    expect(d.party).toEqual({ label: 'Received from', name: 'Sample Client LLC', kind: 'Customer' });
    expect(d.facts).toContainEqual(['Deposited to', 'Sample Bank current · Acc 0123456789']);
    expect(d.facts.map(f => f[0])).not.toContain('Cheque no.');
    expect(d.lines).toEqual([['Received against invoice 447-FT-2026', '01-Oct-2026', '5,000.000', '2,677.500']]);
    expect(d.totals[0]).toEqual({ label: 'Amount received (OMR)', value: '2,677.500', strong: true });
    expect(d.totals[1].value).toBe('2,322.500');
    expect(d.words).toBe('Two Thousand Six Hundred Seventy-Seven Rials and Five Hundred Baisa');
    expect(d.fileName).toBe('RV-2026-0012.pdf');
    const t = pageTexts(v.buildVoucherPdf(d, null)).join(' ');
    for (const s of ['RECEIPT VOUCHER', 'RV-2026-0012', 'Sample Client LLC', 'VATIN OM1100000000', 'AMOUNT IN WORDS', 'Received by', 'RV-2026-0012 · Page 1 of 1', 'Part payment']) expect(t).toContain(s);
  });

  it('a supplier payment is a payment voucher; no words for other currencies', () => {
    const d = v.voucherData({ ...payment, partyType: 'Supplier', invoiceType: 'Purchase', currency: 'USD', amount: 99.5 }, { office: null, company, currency: 'OMR' });
    expect(d.title).toBe('PAYMENT VOUCHER');
    expect(d.party.label).toBe('Paid to');
    expect(d.lines[0]).toEqual(['Paid against bill 447-FT-2026', '99.50']);
    expect(d.totals).toHaveLength(1);
    expect(d.words).toBeUndefined();
    expect(d.signatures).toEqual(['Prepared by', 'Receiver signature & date']);
  });
});

describe('payslip', () => {
  const slip = {
    employeeId: 'e1', employeeCode: 'EMP-007', employeeName: 'Sample Driver', designation: 'Driver', department: 'Operations', month: 10, year: 2026,
    periodLabel: 'October 2026', paymentDate: '2026-10-31', basicSalary: 400, housingAllowance: 100, transportAllowance: 50, otherAllowances: 30,
    overtimeAmount: 25.5, bonusAmount: 0, grossPay: 605.5, pasiEmployeeDeduction: 28, unpaidLeaveDeduction: 0, loanAdvanceDeduction: 50,
    otherDeductions: 10, totalDeductions: 88, netPay: 517.5, bankName: 'Sample Bank', iban: 'OM12 0000 0000 0000 4821', status: 'Paid', overtimeHours: 6,
    lines: [{ kind: 'Allowance', description: 'Phone allowance', amount: 20 }, { kind: 'Deduction', description: 'Uniform', amount: 10 }],
  } as unknown as Parameters<typeof v.payslipData>[0];

  it('shows the same lines and totals as the dialog, with the account masked', () => {
    const d = v.payslipData(slip, { office, company, currency: 'OMR' });
    expect(d.earnings).toEqual([['Basic Salary', '400.000'], ['Housing Allowance', '100.000'], ['Transport Allowance', '50.000'], ['Other Allowances', '10.000'], ['Phone allowance', '20.000'], ['Overtime (6 h)', '25.500']]);
    expect(d.deductions).toEqual([['PASI Social Insurance (employee share)', '28.000'], ['Uniform', '10.000'], ['Salary Advance / Loan', '50.000']]);
    expect([d.gross, d.totalDeductions, d.net]).toEqual(['605.500', '88.000', '517.500']);
    expect(d.facts).toContainEqual(['Account', '**** 4821']);
    expect(JSON.stringify(d)).not.toContain('0000 4821');
    expect(d.fileName).toBe('Payslip_EMP-007_2026-10.pdf');
    const t = pageTexts(v.buildPayslipPdf(d, ['Driver', 'Operations'], null)).join(' ');
    for (const s of ['PAYSLIP', 'October 2026', 'Sample Driver', 'Employee ID EMP-007', 'Total gross earnings', '605.500', 'Net pay (OMR)', '517.500',
      'Five Hundred Seventeen Rials and Five Hundred Baisa', 'computer-generated', 'Employee signature & date', 'Payslip EMP-007 · 2026-10 · Page 1 of 1']) expect(t).toContain(s);
    expect(t).not.toContain('OM12');
  });

  it('masks short and empty accounts', () => {
    expect(v.maskAccount('')).toBe('');
    expect(v.maskAccount('123')).toBe('**** 123');
    expect(v.maskAccount(' OM12 3456 ')).toBe('**** 3456');
  });
});
