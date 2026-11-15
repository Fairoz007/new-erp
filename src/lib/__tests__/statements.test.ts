import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
const s = await import('../a4/statements');
const { buildTableReportPdf, cellsOf, isGroup, isStrong } = await import('../a4/tableReport');
type Rows = ReturnType<typeof s.profitLossRows>;

/** Text drawn on each page, read back from the PDF content streams. */
function pageTexts(doc: { internal: { pages: unknown[] } }): string[] {
  return (doc.internal.pages.slice(1) as string[][]).map(p => p.join('\n').match(/\((?:\\.|[^\\)])*\)\s*Tj/g)?.map(t => t.slice(1, t.lastIndexOf(')')).replace(/\\([()\\])/g, '$1')).join(' ') ?? '');
}
const company = { legalName: 'Sample Transport LLC', vatNumber: 'OM1100000000', crNumber: '1000000', address: '', city: 'Muscat', country: 'Oman', phone: '', email: '' };
const pdf = (title: string, columns: string[], rows: Rows, extra = {}) => buildTableReportPdf({
  name: title.replace(/ /g, '_'), title, columns, rows, office: null, company, generatedBy: 'Sample User', now: new Date(2026, 10, 15, 9, 0), ...extra,
}, { letterhead: null, logo: null });
const strong = (rows: Rows, label: string) => rows.filter(isStrong).map(cellsOf).find(c => c.includes(label));

describe('figures', () => {
  it('match the screen: same decimals and minus sign, without the currency prefix', () => {
    expect(s.figure(1234.5, 'OMR')).toBe('1,234.500');
    expect(s.figure(-1234.5, 'OMR')).toBe('-1,234.500');
    expect(s.figure(1234.5, 'USD')).toBe('1,234.50');
    expect(s.figure(-0.0004, 'OMR')).toBe('0.000');
  });
});

describe('profit and loss', () => {
  const pnl = {
    revenues: [{ accountCode: '4000', accountName: 'Bus hire revenue', amount: 12000 }, { accountCode: '4100', accountName: 'Rental income', amount: 500.25 }],
    totalRevenue: 12500.25,
    directCosts: [{ category: 'Fuel', amount: 3000 }, { category: 'Driver salaries', amount: 2500 }],
    totalDirectCosts: 5500,
    grossProfit: 7000.25, grossProfitMarginPercentage: 56,
    operatingExpenses: [{ accountCode: '6100', accountName: 'Office rent', amount: 1200 }],
    totalOperatingExpenses: 1200, depreciationExpense: 800,
    netProfit: 5000.25, netProfitMarginPercentage: 40, ebitda: 5800.25,
  } as unknown as Parameters<typeof s.profitLossRows>[0];

  it('prints every line and the totals the page computed', () => {
    const rows = s.profitLossRows(pnl, 'OMR');
    expect(rows.filter(isGroup).map(r => r.group)).toEqual(['1. Revenue', '2. Direct operating costs', '3. Operating expenses & depreciation']);
    expect(strong(rows, 'Total revenue')).toEqual(['Total revenue', '12,500.250']);
    expect(strong(rows, 'Total direct operating costs')).toEqual(['Total direct operating costs', '(5,500.000)']);
    expect(strong(rows, 'GROSS PROFIT (Revenue - Direct Costs)')?.[1]).toBe('7,000.250 (56%)');
    expect(strong(rows, 'Total operating expenses & depreciation')?.[1]).toBe('(2,000.000)');
    expect(strong(rows, 'NET PROFIT FOR THE PERIOD')?.[1]).toBe('5,000.250 (40%)');
    const t = pageTexts(pdf('Statement of Profit or Loss', s.statementColumns('OMR'), rows, { period: { from: '2026-01-01', to: '2026-11-15' }, signatures: s.STATEMENT_SIGNATURES }).doc).join(' ');
    for (const v of ['Bus hire revenue (4000)', '12,500.250', '(5,500.000)', '5,000.250 (40%)', 'Amount (OMR)', 'Prepared by', 'Approved by', '01-Jan-2026 to 15-Nov-2026']) expect(t).toContain(v);
  });

  it('says so when a section is empty', () => {
    const rows = s.profitLossRows({ ...pnl, revenues: [], directCosts: [], operatingExpenses: [] }, 'OMR');
    const text = rows.map(cellsOf).flat();
    expect(text).toContain('No revenue posted.');
    expect(text).toContain('No direct costs posted.');
    expect(text).toContain('No operating expenses posted.');
  });
});

describe('balance sheet', () => {
  const bs = (equity: number) => ({
    assets: { currentAssets: [{ name: 'Bank', amount: 9000 }], totalCurrentAssets: 9000, fixedAssets: [{ name: 'Buses', amount: 20000 }, { name: 'Accumulated depreciation', amount: -4000 }], totalFixedAssets: 16000, totalAssets: 25000 },
    liabilities: { currentLiabilities: [{ name: 'Accounts payable', amount: 5000 }], totalCurrentLiabilities: 5000, longTermLiabilities: [], totalLongTermLiabilities: 0, totalLiabilities: 5000, accountsPayable: 5000 },
    equity: { items: [{ name: 'Share capital', amount: equity }], totalEquity: equity },
    totalLiabilitiesAndEquity: 5000 + equity, isBalanced: 5000 + equity === 25000,
  }) as unknown as Parameters<typeof s.balanceSheetRows>[0];

  it('prints the sections and totals; depreciation in brackets as on screen', () => {
    const rows = s.balanceSheetRows(bs(20000), 'OMR');
    expect(strong(rows, 'TOTAL ASSETS')?.[1]).toBe('25,000.000');
    expect(strong(rows, 'TOTAL LIABILITIES & EQUITY')?.[1]).toBe('25,000.000');
    expect(rows.map(cellsOf)).toContainEqual(['Accumulated depreciation', '(4,000.000)']);
    expect(rows.map(cellsOf)).toContainEqual(['None', '']);
    expect(strong(rows, 'OUT OF BALANCE by')).toBeUndefined();
  });

  it('says when it is out of balance, by how much', () => {
    expect(strong(s.balanceSheetRows(bs(19000), 'OMR'), 'OUT OF BALANCE by')?.[1]).toBe('1,000.000');
  });
});

describe('cash flow', () => {
  it('net per activity is the sum of its lines; opening and closing as given', () => {
    const rows = s.cashFlowRows([
      { section: 'Opening', line: 'Cash at start', amount: 1000, sort: 0 },
      { section: 'Operating', line: 'Receipts from clients', amount: 5000, sort: 1 },
      { section: 'Operating', line: 'Payments to suppliers', amount: -3250.5, sort: 2 },
      { section: 'Investing', line: 'Purchase of vehicles', amount: -1500, sort: 3 },
      { section: 'Closing', line: 'Cash at end', amount: 1249.5, sort: 9 },
    ] as Parameters<typeof s.cashFlowRows>[0], 'OMR');
    expect(strong(rows, 'Cash at start of period')?.[1]).toBe('1,000.000');
    expect(strong(rows, 'Net cash from operating activities')?.[1]).toBe('1,749.500');
    expect(strong(rows, 'Net cash from investing activities')?.[1]).toBe('-1,500.000');
    expect(strong(rows, 'Net cash from financing activities')?.[1]).toBe('0.000');
    expect(rows.map(cellsOf)).toContainEqual(['No movements', '']);
    expect(strong(rows, 'Cash at end of period')?.[1]).toBe('1,249.500');
  });
});

describe('general ledger', () => {
  it('a long ledger keeps its header on every page, with each account opening and closing', () => {
    const accounts = [1, 2, 3].map(n => ({
      account: { accountCode: `${1000 + n}`, accountName: `Sample account ${n}`, category: 'Asset', openingBalance: 100 * n, totalDebit: 60 * 10, totalCredit: 0, closingBalance: 100 * n + 600, lineCount: 60 },
      lines: Array.from({ length: 60 }, (_, i) => ({ id: `${n}-${i}`, date: '2026-03-01', entryNumber: `JE-${n}-${i}`, reference: '', description: 'Sample movement', vehiclePlate: '', debit: 10, credit: 0, runningBalance: 100 * n + 10 * (i + 1) })),
    })) as unknown as Parameters<typeof s.generalLedgerRows>[0];
    const rows = s.generalLedgerRows(accounts, 'OMR');
    expect(rows.filter(isGroup).map(r => r.group)).toEqual(['1001 · Sample account 1 (Asset)', '1002 · Sample account 2 (Asset)', '1003 · Sample account 3 (Asset)']);
    const closing = rows.filter(isStrong).map(cellsOf).filter(c => c[3].startsWith('Account activity totals'));
    expect(closing.map(c => c[7])).toEqual(['700.000', '800.000', '900.000']);
    expect(closing[0][5]).toBe('600.000');
    const { doc } = pdf('General Ledger', s.GL_COLUMNS('OMR'), rows, { rightAlign: s.GL_NUMERIC, period: { from: '2026-01-01', to: '2026-11-15' } });
    const pages = pageTexts(doc);
    expect(pages.length).toBeGreaterThanOrEqual(4);
    pages.forEach((t, i) => {
      expect(t).toContain('Balance (OMR)');
      expect(t).toContain('GENERAL LEDGER');
      expect(t).toContain(`General Ledger · Page ${i + 1} of ${pages.length}`);
    });
    expect(pages.join(' ')).toContain('JE-3-59');
  });
});

describe('statement of account', () => {
  it('opening, every movement, closing with the period totals', () => {
    const rows = s.statementOfAccountRows(250, [
      { date: '2026-02-01', ref: 'INV-1', detail: 'Invoice', charge: 1000, credit: 0, balance: 1250 },
      { date: '2026-02-10', ref: 'RV-1', detail: 'Receipt', charge: 0, credit: 400, balance: 850 },
    ], 850, 'OMR', '2026-01-01');
    expect(cellsOf(rows[0])).toEqual(['01-Jan-2026', '', 'Opening balance', '', '', '250.000']);
    expect(cellsOf(rows[2])).toEqual(['10-Feb-2026', 'RV-1', 'Receipt', '-', '400.000', '850.000']);
    expect(cellsOf(rows[rows.length - 1])).toEqual(['', '', 'Closing balance', '1,000.000', '400.000', '850.000']);
  });

  it('names the file Statement_<party>_<date>.pdf', () => {
    expect(s.statementFileName('Sample Client & Co. (LLC)', '2026-11-15')).toBe('Statement_Sample_Client_Co_LLC_2026-11-15.pdf');
    expect(s.statementFileName('', '2026-11-15')).toBe('Statement_Party_2026-11-15.pdf');
  });
});
