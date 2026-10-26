// Accounting service: chart of accounts, journals, fixed assets, depreciation and the
// derived statements (trial balance, general ledger, P&L, balance sheet).
// Conventions: docs/audit/CONTRACTS.md. Every async function throws ServiceError on failure.
//
// Ledger model (DB): accounts are per company (company_id, code). Posted journal lines are the
// only source of movements; a balance is   opening_balance + Σ posted movements   in the
// account's normal direction (Asset/Expense: Dr − Cr, others: Cr − Dr). All statements below are
// derived from that one rule, for one company or summed by account code across the user's
// companies when companyId is 'all' / undefined.
import { ServiceError, num, nul, rpcAny, supabase, unwrap, unwrapOne, ymd } from './core';
import type { CollectionKey, Fetchers } from './core';
import type {
  Account, AccountCategory, BalanceSheetStatement, DepreciationRun, FixedAsset, FixedAssetCategory,
  GeneralLedgerAccountSummary, GeneralLedgerLine, JournalEntry, JournalLine, ProfitLossStatement, TrialBalanceRow,
} from '../types/finance';

const r3 = (v: number) => Math.round((v + Number.EPSILON) * 1000) / 1000;
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const PAGE = 1000; // PostgREST max-rows default

// Load every row of a (possibly large) ordered query in pages so ledgers are never silently truncated.
async function fetchAll(build: (from: number, to: number) => PromiseLike<any>): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await unwrap<any[]>(build(from, from + PAGE - 1));
    out.push(...(rows ?? []));
    if (!rows || rows.length < PAGE) return out;
  }
}

const isUuid = (v?: string) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const requireCompany = (companyId?: string): string => {
  if (!isUuid(companyId)) throw new ServiceError('Select a specific company (office) before running this action.');
  return companyId as string;
};

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------
/** Account row as loaded from the DB: the app Account plus its company and opening balance. */
export interface LedgerAccount extends Account {
  companyId: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
}
/** Journal line as loaded from the DB (adds the vehicle plate for the GL). */
export interface LedgerJournalLine extends JournalLine { vehiclePlate?: string }

type AnyAccount = Account & Partial<Pick<LedgerAccount, 'companyId' | 'openingBalance'>>;
type DateRange = { startDate?: string; endDate?: string };

const isDebitNormal = (c: AccountCategory) => c === 'Asset' || c === 'Expense';
const inCompany = (companyId: string | undefined, rowCompany: string | undefined) =>
  !companyId || companyId === 'all' || !rowCompany || rowCompany === companyId;

// ---------------------------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------------------------
export const rowToJournalLine = (l: any): LedgerJournalLine => ({
  id: l.id,
  accountCode: l.account_code,
  accountName: l.account?.name ?? l.account_code,
  debit: num(l.debit),
  credit: num(l.credit),
  description: l.description ?? undefined,
  vehicleId: l.vehicle_id ?? undefined,
  vehiclePlate: l.vehicle?.plate_number ?? undefined,
  costCentre: l.cost_centre ?? undefined,
});

export const rowToJournalEntry = (r: any): JournalEntry => {
  const lines: LedgerJournalLine[] = (r.lines ?? []).map(rowToJournalLine);
  return {
    id: r.id,
    entryNumber: r.entry_number,
    companyId: r.company_id,
    date: ymd(r.date),
    reference: r.reference ?? undefined,
    description: r.description,
    lines,
    totalDebit: r3(lines.reduce((s, l) => s + l.debit, 0)),
    totalCredit: r3(lines.reduce((s, l) => s + l.credit, 0)),
    postedBy: r.poster?.name ?? '',
    status: r.status,
    sourceModule: r.source_module ?? 'Manual',
    attachmentUrl: r.attachment_path ?? undefined,
    createdAt: r.created_at,
  };
};

export const rowToFixedAsset = (r: any): FixedAsset => ({
  id: r.id,
  assetCode: r.asset_code,
  companyId: r.company_id,
  name: r.name,
  category: r.category as FixedAssetCategory,
  serialNumber: r.serial_number ?? undefined,
  serialOrPlateNumber: r.vehicle?.plate_number ?? r.serial_number ?? undefined,
  assignedVehiclePlate: r.vehicle?.plate_number ?? undefined,
  location: r.location ?? '',
  department: r.department ?? '',
  purchaseDate: ymd(r.purchase_date),
  purchaseCost: num(r.purchase_cost),
  salvageValue: num(r.salvage_value),
  usefulLifeYears: num(r.useful_life_years),
  annualRatePercentage: num(r.annual_rate_percentage),
  depreciationMethod: r.depreciation_method,
  accumulatedDepreciation: num(r.accumulated_depreciation),
  currentBookValue: num(r.current_book_value),            // generated column in the DB
  currentMarketValue: r.current_market_value == null ? undefined : num(r.current_market_value),
  glAssetAccount: r.gl_asset_account,
  glDepreciationExpenseAccount: r.gl_expense_account,
  glAccumulatedDepreciationAccount: r.gl_accum_dep_account,
  status: r.status,
  vehicleId: r.vehicle_id ?? undefined,
  supplierName: r.supplier?.name ?? undefined,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// App -> DB. Only keys present in `a` are written (so it serves inserts and partial updates).
// current_book_value is generated and asset_code is assigned by the DB numbering trigger.
export const fixedAssetToRow = (a: Partial<FixedAsset>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => { if (v !== undefined) row[k] = v; };
  set('company_id', a.companyId);
  set('name', a.name);
  set('category', a.category);
  set('serial_number', a.serialNumber !== undefined ? nul(a.serialNumber) : a.serialOrPlateNumber !== undefined ? nul(a.serialOrPlateNumber) : undefined);
  set('vehicle_id', a.vehicleId !== undefined ? nul(a.vehicleId) : undefined);
  set('location', a.location !== undefined ? nul(a.location) : undefined);
  set('department', a.department !== undefined ? nul(a.department) : undefined);
  set('purchase_date', a.purchaseDate);
  set('purchase_cost', a.purchaseCost);
  set('salvage_value', a.salvageValue);
  set('useful_life_years', a.usefulLifeYears);
  set('annual_rate_percentage', a.annualRatePercentage);
  set('depreciation_method', a.depreciationMethod);
  set('accumulated_depreciation', a.accumulatedDepreciation);   // insert: opening value; update: DB guard rejects changes
  set('current_market_value', a.currentMarketValue);
  set('gl_asset_account', a.glAssetAccount);
  set('gl_expense_account', a.glDepreciationExpenseAccount);
  set('gl_accum_dep_account', a.glAccumulatedDepreciationAccount);
  set('status', a.status);
  set('notes', a.notes !== undefined ? nul(a.notes) : undefined);
  return row;
};

export const rowToDepreciationRun = (r: any): DepreciationRun => ({
  id: r.id,
  batchNumber: r.batch_number,
  companyId: r.company_id,
  periodLabel: r.period_label,
  runDate: ymd(r.run_date),
  totalAssetsProcessed: num(r.total_assets),
  totalDepreciationAmount: num(r.total_amount),
  currency: r.currency ?? 'OMR',
  journalEntryId: r.journal_entry_id ?? undefined,
  journalEntryNumber: r.journal?.entry_number ?? undefined,
  status: r.status,
  processedBy: r.processor?.name ?? '',
  notes: r.notes ?? undefined,
  breakdown: (r.items ?? []).map((i: any) => ({
    assetId: i.asset_id,
    assetCode: i.asset?.asset_code ?? '',
    assetName: i.asset?.name ?? '',
    category: (i.asset?.category ?? 'Other Fixed Asset') as FixedAssetCategory,
    previousBookValue: num(i.previous_book_value),
    depreciationAmount: num(i.depreciation_amount),
    newBookValue: num(i.new_book_value),
  })),
  createdAt: r.created_at,
});

const JE_SELECT = '*, poster:profiles!journal_entries_posted_by_fkey(name), ' +
  'lines:journal_lines(*, account:accounts!journal_lines_company_id_account_code_fkey(name), vehicle:vehicles(plate_number))';
const FA_SELECT = '*, vehicle:vehicles(plate_number), supplier:suppliers(name)';
const DEP_SELECT = '*, journal:journal_entries!depreciation_runs_journal_entry_id_fkey(entry_number), ' +
  'processor:profiles!depreciation_runs_processed_by_fkey(name), ' +
  'items:depreciation_run_items(*, asset:fixed_assets(asset_code, name, category))';

// ---------------------------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------------------------
export async function fetchChartOfAccounts(): Promise<LedgerAccount[]> {
  const [accounts, balances] = await Promise.all([
    fetchAll((f, t) => supabase.from('accounts').select('*').order('company_id').order('code').range(f, t)),
    fetchAll((f, t) => supabase.from('v_account_balances').select('*').order('company_id').order('code').range(f, t)),
  ]);
  const byKey = new Map<string, any>(balances.map(b => [`${b.company_id}|${b.code}`, b]));
  return accounts.map(a => {
    const b = byKey.get(`${a.company_id}|${a.code}`);
    return {
      code: a.code,
      name: a.name,
      category: a.category,
      subcategory: a.subcategory,
      balance: b ? num(b.balance) : num(a.opening_balance),
      currency: a.currency ?? 'OMR',
      description: a.description ?? undefined,
      isSystem: !!a.is_system,
      companyId: a.company_id,
      openingBalance: num(a.opening_balance),
      totalDebit: b ? num(b.total_debit) : 0,
      totalCredit: b ? num(b.total_credit) : 0,
    };
  });
}

export async function fetchJournalEntries(): Promise<JournalEntry[]> {
  const rows = await fetchAll((f, t) => supabase.from('journal_entries').select(JE_SELECT)
    .order('date', { ascending: false }).order('entry_number', { ascending: false }).range(f, t));
  return rows.map(rowToJournalEntry);
}

export async function fetchFixedAssets(): Promise<FixedAsset[]> {
  const rows = await fetchAll((f, t) => supabase.from('fixed_assets').select(FA_SELECT).order('asset_code').range(f, t));
  return rows.map(rowToFixedAsset);
}

export async function fetchDepreciationRuns(): Promise<DepreciationRun[]> {
  const rows = await fetchAll((f, t) => supabase.from('depreciation_runs').select(DEP_SELECT)
    .order('period', { ascending: false }).range(f, t));
  return rows.map(rowToDepreciationRun);
}

export const fetchers: Fetchers = {
  chartOfAccounts: fetchChartOfAccounts,
  journalEntries: fetchJournalEntries,
  fixedAssets: fetchFixedAssets,
  depreciationRuns: fetchDepreciationRuns,
};

// ---------------------------------------------------------------------------------------------
// Mutations (same names/params as FleetContext, async)
// ---------------------------------------------------------------------------------------------
async function getJournalEntry(id: string): Promise<JournalEntry> {
  return rowToJournalEntry(await unwrapOne(supabase.from('journal_entries').select(JE_SELECT).eq('id', id).maybeSingle() as any));
}

/**
 * Posts a balanced journal through the `post_journal_entry` RPC (company + 'accounting:create' checked
 * server-side; balance enforced by a deferred constraint trigger). Entry number, posted_by and
 * created_at come from the DB; client-sent totals/names are ignored.
 */
export async function addJournalEntry(entry: Omit<JournalEntry, 'id' | 'entryNumber' | 'createdAt'>): Promise<JournalEntry> {
  const companyId = requireCompany(entry.companyId);
  if (entry.status && entry.status !== 'Posted') throw new ServiceError('Only posted journal entries are supported; drafts are not stored.');
  const lines = entry.lines.filter(l => (l.debit || 0) > 0 || (l.credit || 0) > 0);
  if (lines.some(l => (l.debit || 0) < 0 || (l.credit || 0) < 0 || ((l.debit || 0) > 0 && (l.credit || 0) > 0))) {
    throw new ServiceError('Each journal line must have either a positive debit or a positive credit.');
  }
  const dr = r3(lines.reduce((s, l) => s + (l.debit || 0), 0));
  const cr = r3(lines.reduce((s, l) => s + (l.credit || 0), 0));
  if (dr !== cr || dr === 0) throw new ServiceError(`Unbalanced journal entry: Dr ${dr.toFixed(3)} / Cr ${cr.toFixed(3)}`);

  const id = await rpcAny<string>('post_journal_entry', {
    p_company: companyId,
    p_date: entry.date,
    p_description: entry.description,
    p_lines: lines.map(l => ({
      account_code: l.accountCode,
      debit: r3(l.debit || 0),
      credit: r3(l.credit || 0),
      description: l.description || null,
      vehicle_id: l.vehicleId || null,
      cost_centre: l.costCentre || null,
    })),
    p_reference: entry.reference || null,
    p_source: entry.sourceModule ?? 'Manual',
  });
  return getJournalEntry(id);
}

export async function addFixedAsset(asset: Omit<FixedAsset, 'id' | 'assetCode' | 'createdAt' | 'updatedAt'>): Promise<FixedAsset> {
  requireCompany(asset.companyId);
  if (!(asset.purchaseCost >= 0) || !(asset.salvageValue >= 0) || asset.salvageValue > asset.purchaseCost) {
    throw new ServiceError('Salvage value must be between 0 and the purchase cost.');
  }
  if (!(asset.usefulLifeYears > 0)) throw new ServiceError('Useful life must be greater than zero.');
  const row = { ...fixedAssetToRow(asset), asset_code: null };   // DB numbering trigger assigns FA-###
  const created = await unwrapOne(supabase.from('fixed_assets').insert(row as any).select(FA_SELECT).single() as any);
  return rowToFixedAsset(created);
}

export async function updateFixedAsset(id: string, asset: Partial<FixedAsset>): Promise<void> {
  const row = fixedAssetToRow(asset);
  delete row.company_id;            // moving an asset between offices would orphan its posted depreciation
  if (Object.keys(row).length === 0) return;
  const updated = await unwrap<any[]>(supabase.from('fixed_assets').update(row as any).eq('id', id).select('id') as any);
  if (!updated?.length) throw new ServiceError('Fixed asset not found or you do not have permission to edit it.');
}

export async function deleteFixedAsset(id: string): Promise<void> {
  const deleted = await unwrap<any[]>(supabase.from('fixed_assets').delete().eq('id', id).select('id') as any);
  if (!deleted?.length) throw new ServiceError('Fixed asset not found or you do not have permission to delete it.');
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** 'YYYY-MM', 'YYYY-MM-DD' or 'August 2026' -> 'YYYY-MM-01'; undefined if not recognised. */
export const parsePeriod = (v?: string): string | undefined => {
  if (!v) return undefined;
  const iso = v.trim().match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-01`;
  const lbl = v.trim().toLowerCase().match(/^([a-z]+)\s+(\d{4})$/);
  if (lbl) {
    const m = MONTHS.findIndex(name => name.startsWith(lbl[1].slice(0, 3)));
    if (m >= 0) return `${lbl[2]}-${String(m + 1).padStart(2, '0')}-01`;
  }
  return undefined;
};

/**
 * Runs monthly depreciation for ONE company through the `run_depreciation` RPC (atomic: run + items +
 * asset accumulated depreciation + GL journal). Params are the FleetContext ones plus:
 *   companyId (required, the office to depreciate) and period ('YYYY-MM'; else parsed from
 *   periodLabel, else the month of runDate, else the current month).
 * `processedBy` is ignored: the DB records the signed-in user.
 */
export async function runAutoDepreciation(params?: {
  periodLabel?: string; runDate?: string; notes?: string; processedBy?: string; autoPostGL?: boolean;
  companyId?: string; period?: string;
}): Promise<DepreciationRun> {
  const companyId = requireCompany(params?.companyId);
  const period = parsePeriod(params?.period) ?? parsePeriod(params?.periodLabel) ?? parsePeriod(params?.runDate)
    ?? `${new Date().toISOString().slice(0, 7)}-01`;
  if (params?.periodLabel && !parsePeriod(params.periodLabel) && !params.period) {
    throw new ServiceError(`Period "${params.periodLabel}" is not a month. Use e.g. "August 2026" or 2026-08.`);
  }
  const id = await rpcAny<string>('run_depreciation', {
    p_company: companyId, p_period: period, p_notes: params?.notes || null, p_post_gl: params?.autoPostGL ?? true,
  });
  return rowToDepreciationRun(await unwrapOne(supabase.from('depreciation_runs').select(DEP_SELECT).eq('id', id).maybeSingle() as any));
}

export const affects: Record<string, CollectionKey[]> = {
  addJournalEntry: ['journalEntries', 'chartOfAccounts'],
  addFixedAsset: ['fixedAssets'],
  updateFixedAsset: ['fixedAssets'],
  deleteFixedAsset: ['fixedAssets'],
  runAutoDepreciation: ['depreciationRuns', 'fixedAssets', 'journalEntries', 'chartOfAccounts'],
};

// ---------------------------------------------------------------------------------------------
// Pure ledger calculations (inputs: the loaded collections)
// ---------------------------------------------------------------------------------------------
interface ScopedAccount { code: string; name: string; category: AccountCategory; subcategory: string; currency: string; opening: number }

/** Accounts of one company, or summed by code across companies ('all'). Opening balances in normal direction. */
export function scopeAccounts(accounts: AnyAccount[], companyId?: string): ScopedAccount[] {
  const map = new Map<string, ScopedAccount>();
  for (const a of accounts) {
    if (!inCompany(companyId, a.companyId)) continue;
    const opening = a.openingBalance ?? 0;
    const cur = map.get(a.code);
    if (cur) cur.opening += opening;
    else map.set(a.code, { code: a.code, name: a.name, category: a.category, subcategory: a.subcategory, currency: a.currency || 'OMR', opening });
  }
  return [...map.values()].sort((x, y) => x.code.localeCompare(y.code));
}

/** Chart of accounts for display: one row per code, balance summed across companies when 'all'. */
export function consolidateAccounts(accounts: AnyAccount[], companyId?: string): Account[] {
  const map = new Map<string, Account>();
  for (const a of accounts) {
    if (!inCompany(companyId, a.companyId)) continue;
    const cur = map.get(a.code);
    if (cur) cur.balance = r3(cur.balance + a.balance);
    else map.set(a.code, { code: a.code, name: a.name, category: a.category, subcategory: a.subcategory, balance: a.balance, currency: a.currency, description: a.description, isSystem: a.isSystem });
  }
  return [...map.values()].sort((x, y) => x.code.localeCompare(y.code));
}

const postedLines = (entries: JournalEntry[], companyId?: string, range: DateRange = {}) => {
  const out: { entry: JournalEntry; line: LedgerJournalLine }[] = [];
  for (const e of entries) {
    if (e.status !== 'Posted' || !inCompany(companyId, e.companyId)) continue;
    if (range.startDate && e.date < range.startDate) continue;
    if (range.endDate && e.date > range.endDate) continue;
    for (const line of e.lines) out.push({ entry: e, line });
  }
  return out;
};

/** Σ debit / Σ credit per account code over posted lines in range. */
const movements = (entries: JournalEntry[], companyId?: string, range: DateRange = {}) => {
  const m = new Map<string, { dr: number; cr: number }>();
  for (const { line } of postedLines(entries, companyId, range)) {
    const cur = m.get(line.accountCode) ?? { dr: 0, cr: 0 };
    cur.dr += line.debit; cur.cr += line.credit;
    m.set(line.accountCode, cur);
  }
  return m;
};

const dayBefore = (d: string) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };

/** Normal-direction balance per code: opening (optional) + posted movements in range. */
export function accountBalances(accounts: AnyAccount[], entries: JournalEntry[], companyId?: string,
  range: DateRange = {}, includeOpening = true): { account: ScopedAccount; balance: number }[] {
  const mv = movements(entries, companyId, range);
  return scopeAccounts(accounts, companyId).map(account => {
    const m = mv.get(account.code) ?? { dr: 0, cr: 0 };
    const move = isDebitNormal(account.category) ? m.dr - m.cr : m.cr - m.dr;
    return { account, balance: r3((includeOpening ? account.opening : 0) + move) };
  });
}

/**
 * Trial balance as of a date: opening = accounts.opening_balance, period = posted lines dated ≤ asOfDate,
 * closing = opening + period. One consistent company filter for accounts and lines (audit fix: the
 * old version mixed all-company balances with company-filtered journals).
 */
export function getTrialBalance(accounts: AnyAccount[], entries: JournalEntry[], asOfDate?: string, companyId?: string) {
  const mv = movements(entries, companyId, { endDate: asOfDate });
  const rows: TrialBalanceRow[] = scopeAccounts(accounts, companyId).map(a => {
    const m = mv.get(a.code) ?? { dr: 0, cr: 0 };
    const openingSigned = isDebitNormal(a.category) ? a.opening : -a.opening;   // debit-positive
    const closingSigned = openingSigned + m.dr - m.cr;
    return {
      accountCode: a.code, accountName: a.name, category: a.category, subcategory: a.subcategory,
      openingDebit: r3(Math.max(openingSigned, 0)), openingCredit: r3(Math.max(-openingSigned, 0)),
      periodDebit: r3(m.dr), periodCredit: r3(m.cr),
      closingDebit: r3(Math.max(closingSigned, 0)), closingCredit: r3(Math.max(-closingSigned, 0)),
      netBalance: r3(closingSigned),
    };
  });
  const sum = (k: keyof TrialBalanceRow) => r3(rows.reduce((s, r) => s + (r[k] as number), 0));
  const totalClosingDebit = sum('closingDebit'), totalClosingCredit = sum('closingCredit');
  const difference = r3(Math.abs(totalClosingDebit - totalClosingCredit));
  return {
    rows,
    totalOpeningDebit: sum('openingDebit'), totalOpeningCredit: sum('openingCredit'),
    totalPeriodDebit: sum('periodDebit'), totalPeriodCredit: sum('periodCredit'),
    totalClosingDebit, totalClosingCredit,
    isBalanced: difference < 0.0005,
    difference,
  };
}

/**
 * General ledger: opening = opening_balance + posted movements before startDate; lines in
 * [startDate, endDate] with running balance in the account's normal direction.
 */
export function getGeneralLedger(accounts: AnyAccount[], entries: JournalEntry[], targetAccountCode?: string,
  startDate?: string, endDate?: string, companyId?: string, currency = 'OMR'): GeneralLedgerAccountSummary[] {
  const before = startDate ? movements(entries, companyId, { endDate: dayBefore(startDate) }) : new Map();
  const inRange = postedLines(entries, companyId, { startDate, endDate })
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.entry.entryNumber.localeCompare(b.entry.entryNumber, undefined, { numeric: true }));
  return scopeAccounts(accounts, companyId)
    .filter(a => !targetAccountCode || targetAccountCode === 'all' || a.code === targetAccountCode)
    .map(a => {
      const debitNormal = isDebitNormal(a.category);
      const normal = (dr: number, cr: number) => (debitNormal ? dr - cr : cr - dr);
      const b = before.get(a.code) ?? { dr: 0, cr: 0 };
      const openingBalance = r3(a.opening + normal(b.dr, b.cr));
      let running = openingBalance, totalDebit = 0, totalCredit = 0;
      const lines: GeneralLedgerLine[] = inRange.filter(x => x.line.accountCode === a.code).map(({ entry, line }) => {
        totalDebit += line.debit; totalCredit += line.credit;
        running = r3(running + normal(line.debit, line.credit));
        return {
          id: line.id, entryNumber: entry.entryNumber, date: entry.date, reference: entry.reference,
          description: line.description || entry.description, sourceModule: entry.sourceModule || 'Manual',
          vehiclePlate: line.vehiclePlate, costCentre: line.costCentre,
          debit: line.debit, credit: line.credit, runningBalance: running,
        };
      });
      return {
        accountCode: a.code, accountName: a.name, category: a.category, subcategory: a.subcategory,
        currency: a.currency || currency, openingBalance, totalDebit: r3(totalDebit), totalCredit: r3(totalCredit),
        closingBalance: running, lines,
      };
    });
}

// Classification by account category + subcategory (+ code for the depreciation default),
// never by matching words in the account NAME (audit fix).
const isDepreciation = (a: ScopedAccount) => a.category === 'Expense' && (/depreciation|amorti[sz]ation/i.test(a.subcategory) || a.code === '5080');
const isDirect = (a: ScopedAccount) => a.category === 'Expense' && !isDepreciation(a) && /direct|cost of (sales|revenue)/i.test(a.subcategory);
const isFixedAsset = (a: ScopedAccount) => a.category === 'Asset' && (/fixed|non[- ]?current|property|plant/i.test(a.subcategory) || /^1[5-9]/.test(a.code));
const isLongTerm = (a: ScopedAccount) => a.category === 'Liability' && (/long|non[- ]?current/i.test(a.subcategory) || /^2[5-9]/.test(a.code));

const periodText = (range: DateRange) => {
  if (range.startDate && range.endDate) return `${range.startDate} to ${range.endDate}`;
  if (range.endDate) return `All posted periods to ${range.endDate}`;
  if (range.startDate) return `From ${range.startDate}`;
  return 'All posted periods';
};

/**
 * P&L from posted ledger movements in the range (opening balances of P&L accounts are included only
 * when no startDate is given). Revenue = category Revenue; direct costs = Expense accounts whose
 * subcategory is "Direct…"; depreciation = Expense subcategory "Depreciation"; everything else is opex.
 * Finance costs are part of operating expenses (the statement type has no separate line), so
 * EBIT = net profit and EBITDA is before depreciation only.
 */
export function getCompanyProfitLoss(accounts: AnyAccount[], entries: JournalEntry[], companyId?: string,
  range: DateRange = {}): ProfitLossStatement {
  const bal = accountBalances(accounts, entries, companyId, range, !range.startDate).filter(b => b.balance !== 0);
  const revenues = bal.filter(b => b.account.category === 'Revenue')
    .map(b => ({ accountCode: b.account.code, accountName: b.account.name, amount: b.balance }));
  const directCosts = bal.filter(b => isDirect(b.account))
    .map(b => ({ category: `${b.account.name} (${b.account.code})`, amount: b.balance }));
  const operatingExpenses = bal.filter(b => b.account.category === 'Expense' && !isDirect(b.account) && !isDepreciation(b.account))
    .map(b => ({ accountCode: b.account.code, accountName: b.account.name, amount: b.balance }));
  const depreciationExpense = r3(bal.filter(b => isDepreciation(b.account)).reduce((s, b) => s + b.balance, 0));

  const totalRevenue = r3(revenues.reduce((s, r) => s + r.amount, 0));
  const totalDirectCosts = r3(directCosts.reduce((s, c) => s + c.amount, 0));
  const totalOperatingExpenses = r3(operatingExpenses.reduce((s, o) => s + o.amount, 0));
  const grossProfit = r3(totalRevenue - totalDirectCosts);
  const ebitda = r3(grossProfit - totalOperatingExpenses);
  const ebit = r3(ebitda - depreciationExpense);
  return {
    companyId: companyId || 'all',
    period: periodText(range),
    currency: accounts[0]?.currency || 'OMR',
    revenues, totalRevenue,
    directCosts, totalDirectCosts,
    grossProfit, grossProfitMarginPercentage: totalRevenue > 0 ? r2((grossProfit / totalRevenue) * 100) : 0,
    operatingExpenses, totalOperatingExpenses,
    depreciationExpense, ebitda, ebit,
    netProfit: ebit,
    netProfitMarginPercentage: totalRevenue > 0 ? r2((ebit / totalRevenue) * 100) : 0,
  };
}

/**
 * Balance sheet as of a date from opening balances + posted lines ≤ asOfDate. Unclosed earnings
 * (all revenue − all expense to date) are shown as one equity line, so A = L + E holds whenever the
 * books balance; no plug figures. isBalanced is reported truthfully.
 */
export function getCompanyBalanceSheet(accounts: AnyAccount[], entries: JournalEntry[], companyId?: string,
  asOfDate?: string): BalanceSheetStatement {
  const asOf = asOfDate || new Date().toISOString().slice(0, 10);
  const bal = accountBalances(accounts, entries, companyId, { endDate: asOf });
  const item = (b: { account: ScopedAccount; balance: number }) => ({ name: `${b.account.name} (${b.account.code})`, amount: b.balance });
  const byCode = (code: string) => bal.find(b => b.account.code === code)?.balance ?? 0;
  const total = (xs: { amount: number }[]) => r3(xs.reduce((s, x) => s + x.amount, 0));

  const assets = bal.filter(b => b.account.category === 'Asset' && b.balance !== 0);
  const currentAssets = assets.filter(b => !isFixedAsset(b.account)).map(item);
  const fixedAssets = assets.filter(b => isFixedAsset(b.account)).map(item);
  const liabilities = bal.filter(b => b.account.category === 'Liability' && b.balance !== 0);
  const currentLiabilities = liabilities.filter(b => !isLongTerm(b.account)).map(item);
  const longTermLiabilities = liabilities.filter(b => isLongTerm(b.account)).map(item);

  const unclosedEarnings = r3(
    bal.filter(b => b.account.category === 'Revenue').reduce((s, b) => s + b.balance, 0)
    - bal.filter(b => b.account.category === 'Expense').reduce((s, b) => s + b.balance, 0));
  const equityItems = bal.filter(b => b.account.category === 'Equity' && b.balance !== 0).map(item);
  if (unclosedEarnings !== 0) equityItems.push({ name: 'Profit / (loss) not yet closed to equity', amount: unclosedEarnings });

  const totalCurrentAssets = total(currentAssets), totalFixedAssets = total(fixedAssets);
  const totalAssets = r3(totalCurrentAssets + totalFixedAssets);
  const totalCurrentLiabilities = total(currentLiabilities), totalLongTermLiabilities = total(longTermLiabilities);
  const totalLiabilities = r3(totalCurrentLiabilities + totalLongTermLiabilities);
  const totalEquity = total(equityItems);
  const totalLiabilitiesAndEquity = r3(totalLiabilities + totalEquity);

  return {
    companyId: companyId || 'all',
    asOfDate: asOf,
    currency: accounts[0]?.currency || 'OMR',
    assets: {
      currentAssets, totalCurrentAssets, fixedAssets,
      vehiclesCost: r3(byCode('1510')),
      accumulatedDepreciation: r3(Math.abs(byCode('1520'))),
      netVehiclesValue: r3(byCode('1510') + byCode('1520')),
      workshopEquipmentCost: r3(byCode('1530')),
      totalFixedAssets, totalAssets,
    },
    liabilities: {
      currentLiabilities, accountsPayable: r3(byCode('2010')), totalCurrentLiabilities,
      longTermLiabilities, vehicleLoans: r3(byCode('2510')), totalLongTermLiabilities, totalLiabilities,
    },
    equity: {
      items: equityItems,
      shareCapital: r3(byCode('3010')),
      retainedEarnings: r3(byCode('3020')),
      currentPeriodProfit: r3(byCode('3030') + unclosedEarnings),
      totalEquity,
    },
    totalLiabilitiesAndEquity,
    isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.0005,
  };
}
