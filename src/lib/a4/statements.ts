// Financial statements and statements of account as letterhead tables (docs/A4_PDF_PROMPT.md
// stages 3 and 5). Pure functions: each takes the figures the page already computed and returns the
// rows for src/lib/a4/tableReport.ts, so paper always shows the screen's numbers. No jsPDF here.
import { printDate } from '../invoicePrint';
import { formatCurrency } from '../../utils/financial';
import type { profitLossFrom, balanceSheetFrom } from '../../services/accounting';
import type { CashFlowRow } from '../../services/ledger';
import type { GlAccountSummary } from '../../services/queries-system';
import type { GeneralLedgerLine } from '../../types/finance';
import type { ReportRow } from './tableReport';

type ProfitLoss = ReturnType<typeof profitLossFrom>;
type BalanceSheet = ReturnType<typeof balanceSheetFrom>;

/** The screen's figure without the currency prefix (the column heading names the currency):
 *  formatCurrency(-1234.5, 'OMR') = 'OMR -1,234.500' -> '-1,234.500'. Same rounding and decimals as the screen. */
export const figure = (n: number, currency: string) => formatCurrency(n, currency).slice(currency.length + 1);
type Fmt = (n: number) => string;
const fmts = (currency: string) => {
  const amount: Fmt = n => figure(n, currency);
  return { amount, cost: (n: number) => `(${amount(n)})`, bracketNegative: (n: number) => (n < 0 ? `(${amount(-n)})` : amount(n)) };
};

export const statementColumns = (currency: string) => ['Particulars', `Amount (${currency})`];
export const STATEMENT_SIGNATURES: [string, string] = ['Prepared by', 'Approved by'];

/** Profit & loss: revenue, direct costs, gross profit, operating expenses and depreciation, net profit. */
export function profitLossRows(p: ProfitLoss, currency: string): ReportRow[] {
  const { amount, cost } = fmts(currency);
  const rows: ReportRow[] = [{ group: '1. Revenue' }];
  if (!p.revenues.length) rows.push(['No revenue posted.', '']);
  p.revenues.forEach(r => rows.push([`${r.accountName} (${r.accountCode})`, amount(r.amount)]));
  rows.push({ strong: ['Total revenue', amount(p.totalRevenue)] });

  rows.push({ group: '2. Direct operating costs' });
  if (!p.directCosts.length) rows.push(['No direct costs posted.', '']);
  p.directCosts.forEach(c => rows.push([c.category, cost(c.amount)]));
  rows.push({ strong: ['Total direct operating costs', cost(p.totalDirectCosts)] });
  rows.push({ strong: ['GROSS PROFIT (Revenue - Direct Costs)', `${amount(p.grossProfit)} (${p.grossProfitMarginPercentage}%)`] });

  rows.push({ group: '3. Operating expenses & depreciation' });
  if (!p.operatingExpenses.length) rows.push(['No operating expenses posted.', '']);
  p.operatingExpenses.forEach(o => rows.push([`${o.accountName} (${o.accountCode})`, cost(o.amount)]));
  rows.push(['Depreciation (accounts in the Depreciation subcategory)', cost(p.depreciationExpense)]);
  rows.push({ strong: ['Total operating expenses & depreciation', cost(p.totalOperatingExpenses + p.depreciationExpense)] });

  rows.push({ strong: ['NET PROFIT FOR THE PERIOD', `${amount(p.netProfit)} (${p.netProfitMarginPercentage}%)`] });
  rows.push([`Finance costs are included in operating expenses; EBITDA ${formatCurrency(p.ebitda, currency)} is before depreciation only.`, '']);
  return rows;
}

/** Balance sheet: assets, then liabilities and equity, with every subtotal the screen shows. */
export function balanceSheetRows(bs: BalanceSheet, currency: string): ReportRow[] {
  const { amount, bracketNegative } = fmts(currency);
  const rows: ReportRow[] = [];
  // fixed assets show accumulated depreciation in brackets, as on the screen
  const section = (title: string, items: Array<{ name: string; amount: number }>, totalLabel: string, total: number, item: Fmt = amount) => {
    rows.push({ group: title });
    if (!items.length) rows.push(['None', '']);
    items.forEach(i => rows.push([i.name, item(i.amount)]));
    rows.push({ strong: [totalLabel, amount(total)] });
  };
  section('Current assets', bs.assets.currentAssets, 'Total current assets', bs.assets.totalCurrentAssets);
  section('Non-current (fixed) assets', bs.assets.fixedAssets, 'Total fixed assets', bs.assets.totalFixedAssets, bracketNegative);
  rows.push({ strong: ['TOTAL ASSETS', amount(bs.assets.totalAssets)] });
  section('Current liabilities', bs.liabilities.currentLiabilities, 'Total current liabilities', bs.liabilities.totalCurrentLiabilities);
  section('Long-term liabilities', bs.liabilities.longTermLiabilities, 'Total long-term liabilities', bs.liabilities.totalLongTermLiabilities);
  section("Shareholders' equity", bs.equity.items, "Total shareholders' equity", bs.equity.totalEquity);
  rows.push({ strong: ['TOTAL LIABILITIES & EQUITY', amount(bs.totalLiabilitiesAndEquity)] });
  const empty = bs.assets.totalAssets === 0 && bs.liabilities.totalLiabilities === 0 && bs.equity.totalEquity === 0;
  if (!empty && !bs.isBalanced) rows.push({ strong: ['OUT OF BALANCE by', amount(bs.assets.totalAssets - bs.totalLiabilitiesAndEquity)] });
  return rows;
}

const CF_SECTIONS = [['Operating', 'Operating activities'], ['Investing', 'Investing activities'], ['Financing', 'Financing activities']] as const;

/** Cash flow (direct method): cash at start, the three activities with their net, cash at end. */
export function cashFlowRows(rows: CashFlowRow[], currency: string): ReportRow[] {
  const { amount } = fmts(currency);
  const out: ReportRow[] = [];
  const opening = rows.find(r => r.section === 'Opening')?.amount ?? 0;
  const closing = rows.find(r => r.section === 'Closing')?.amount ?? 0;
  out.push({ strong: ['Cash at start of period', amount(opening)] });
  for (const [key, label] of CF_SECTIONS) {
    const lines = rows.filter(r => r.section === key);
    out.push({ group: label });
    if (!lines.length) out.push(['No movements', '']);
    lines.forEach(l => out.push([l.line, amount(l.amount)]));
    out.push({ strong: [`Net cash from ${label.toLowerCase()}`, amount(lines.reduce((t, r) => t + r.amount, 0))] });
  }
  out.push({ strong: ['Cash at end of period', amount(closing)] });
  out.push(["Cash means the GL accounts linked to this office's bank accounts. Transfers between those accounts are left out.", '']);
  return out;
}

export const GL_COLUMNS = (currency: string) => ['Date', 'JE number', 'Reference', 'Description', 'Vehicle', `Debit (${currency})`, `Credit (${currency})`, `Balance (${currency})`];
export const GL_NUMERIC = [5, 6, 7];

/** General ledger: per account a heading, the opening balance, every line, and the closing balance with the period totals. */
export function generalLedgerRows(accounts: Array<{ account: GlAccountSummary; lines: GeneralLedgerLine[] }>, currency: string): ReportRow[] {
  const { amount } = fmts(currency);
  const rows: ReportRow[] = [];
  for (const { account: a, lines } of accounts) {
    rows.push({ group: `${a.accountCode} · ${a.accountName} (${a.category})` });
    rows.push({ strong: ['', '', '', 'Opening balance', '', '', '', amount(a.openingBalance)] });
    if (!lines.length) rows.push(['', '', '', 'No movements in the period.', '', '', '', '']);
    lines.forEach(l => rows.push([printDate(l.date), l.entryNumber, l.reference || '-', l.description, l.vehiclePlate || '-',
      l.debit > 0 ? amount(l.debit) : '-', l.credit > 0 ? amount(l.credit) : '-', amount(l.runningBalance)]));
    rows.push({ strong: ['', '', '', 'Account activity totals / closing balance', '', amount(a.totalDebit), amount(a.totalCredit), amount(a.closingBalance)] });
  }
  return rows;
}

export interface AccountLine { date: string; ref: string; detail: string; charge: number; credit: number; balance: number }

export const STATEMENT_NUMERIC = [3, 4, 5];
export const statementOfAccountColumns = (kind: 'Customer' | 'Supplier', currency: string) =>
  ['Date', 'Reference', 'Detail', kind === 'Customer' ? `Charged (${currency})` : `Billed (${currency})`,
    kind === 'Customer' ? `Received / credited (${currency})` : `Paid / credited (${currency})`, `Balance (${currency})`];

/** Statement of account: opening balance, every movement with the running balance, closing balance with totals. */
export function statementOfAccountRows(opening: number, lines: AccountLine[], closing: number, currency: string, openingDate?: string): ReportRow[] {
  const { amount } = fmts(currency);
  const rows: ReportRow[] = [{ strong: [openingDate ? printDate(openingDate) : '', '', 'Opening balance', '', '', amount(opening)] }];
  if (!lines.length) rows.push(['', '', 'No movements in the period.', '', '', '']);
  lines.forEach(l => rows.push([printDate(l.date), l.ref, l.detail, l.charge ? amount(l.charge) : '-', l.credit ? amount(l.credit) : '-', amount(l.balance)]));
  const charged = lines.reduce((t, l) => t + (l.charge || 0), 0);
  const credited = lines.reduce((t, l) => t + (l.credit || 0), 0);
  rows.push({ strong: ['', '', 'Closing balance', amount(charged), amount(credited), amount(closing)] });
  return rows;
}

/** "Statement_<party>_<yyyy-mm-dd>.pdf" (docs/A4_PDF_PROMPT.md B3). */
export function statementFileName(party: string, date: string): string {
  const p = party.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Party';
  return `Statement_${p}_${date}.pdf`;
}
