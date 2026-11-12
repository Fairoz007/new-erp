// Parity: the statements computed from database aggregates (ledger_movements, general_ledger_page)
// equal the statements the app computed before Phase 1 from every loaded journal entry.
// Both sides run the same TS statement code (accounting.ts); only the source of movements differs.
import { describe, it, expect, beforeAll } from 'vitest';
import { setup, seedFixtures, IDS, type Harness } from '../../../supabase/tests/harness.mjs';
import {
  rowToJournalEntry, getTrialBalance, trialBalanceFrom, getCompanyProfitLoss, profitLossFrom,
  getCompanyBalanceSheet, balanceSheetFrom, getGeneralLedger, movementsFromRows, type LedgerAccount,
} from '../accounting';
import type { JournalEntry } from '../../types/finance';

const { ADMIN, HO, DQ } = IDS;
const SUP = '33333333-3333-3333-3333-333333333333';
const BANK = '44444444-4444-4444-4444-444444444444';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (o: number) => { const d = new Date(); d.setDate(d.getDate() + o); return ymd(d); };

let t: Harness;
let accounts: LedgerAccount[];
let entries: JournalEntry[];

const ledgerRows = async (from: string | null, to: string | null) =>
  (await t.as(ADMIN, `select * from ledger_movements(null, ${from ? `'${from}'` : 'null'}, ${to ? `'${to}'` : 'null'})`)).rows;

beforeAll(async () => {
  t = await setup('supabase/migrations', { quiet: true });
  await seedFixtures(t.db);
  await t.asServer(`update accounts set opening_balance = 500 where company_id = '${HO}' and code = '1010';
                    update accounts set opening_balance = 500 where company_id = '${HO}' and code = '2010'`);
  let i = 0;
  for (const [company, date, price, pay] of [[HO, day(-60), 100, 50], [HO, day(-20), 250, 0], [DQ, day(-10), 80, 0], [HO, day(-2), 40, 40]] as const) {
    const id = `66666666-6666-6666-6666-${String(++i).padStart(12, '0')}`;
    await t.tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, reference_number)
        values ('${id}','${company}','PAR-${i}','Purchase','Supplier','${SUP}','${date}','${date}','PR-${i}');
      insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
        values ('${id}', 1, 'Parts', 1, ${price}, 5, '5000')`);
    await t.tx(ADMIN, `select post_invoice('${id}')`);
    if (pay && company === HO) await t.tx(ADMIN, `select record_payment('${id}', ${pay}, '${date}', 'Bank Transfer', '${BANK}')`);
  }
  await t.tx(ADMIN, `select post_journal_entry('${HO}', '${day(-30)}', 'Fuel', '[{"account_code":"5000","debit":12.345},{"account_code":"1010","credit":12.345}]')`);
  // one draft journal that must not count anywhere
  await t.asServer(`insert into journal_entries (company_id, entry_number, date, description, status) values ('${HO}', 'JE-DRAFT', '${day(-1)}', 'draft', 'Draft')`).catch(() => undefined);

  const acc = (await t.as(ADMIN, `select * from accounts order by company_id, code`)).rows;
  accounts = acc.map(a => ({
    code: a.code, name: a.name, category: a.category, subcategory: a.subcategory, balance: 0, currency: a.currency ?? 'OMR',
    isSystem: !!a.is_system, companyId: a.company_id, openingBalance: Number(a.opening_balance), totalDebit: 0, totalCredit: 0,
  }) as LedgerAccount);
  const je = (await t.as(ADMIN, `select e.*, coalesce((select json_agg(l order by l.id) from journal_lines l where l.entry_id = e.id), '[]') lines
      from journal_entries e order by date desc, entry_number desc`)).rows;
  entries = je.map(r => rowToJournalEntry({ ...r, date: ymd(new Date(r.date)) }));
}, 240_000);

describe('ledger parity (old: all entries in the browser, new: ledger_movements)', () => {
  for (const company of [undefined, HO, DQ]) {
    it(`trial balance, office ${company ?? 'all'}`, async () => {
      const asOf = day(0);
      const oldTb = getTrialBalance(accounts, entries, asOf, company);
      const newTb = trialBalanceFrom(accounts, movementsFromRows(await ledgerRows(null, asOf), company), company);
      expect(newTb).toEqual(oldTb);
      expect(newTb.isBalanced).toBe(true);
    });
    it(`profit and loss for a range, office ${company ?? 'all'}`, async () => {
      const range = { startDate: day(-45), endDate: day(-1) };
      const oldPl = getCompanyProfitLoss(accounts, entries, company, range);
      const newPl = profitLossFrom(accounts, movementsFromRows(await ledgerRows(range.startDate, range.endDate), company), company, range);
      expect(newPl).toEqual(oldPl);
    });
    it(`balance sheet, office ${company ?? 'all'}`, async () => {
      const asOf = day(-15);
      const oldBs = getCompanyBalanceSheet(accounts, entries, company, asOf);
      const newBs = balanceSheetFrom(accounts, movementsFromRows(await ledgerRows(null, asOf), company), company, asOf);
      expect(newBs).toEqual(oldBs);
    });
  }

  it('general ledger page: opening, lines and running balance match getGeneralLedger', async () => {
    const from = day(-45), to = day(0);
    const [oldGl] = getGeneralLedger(accounts, entries, '5000', from, to, HO);
    const rows = (await t.as(ADMIN, `select * from general_ledger_page('${HO}', '5000', '${from}', '${to}', 100, 0)`)).rows;
    expect(rows.map(r => Number(r.running_balance))).toEqual(oldGl.lines.map(l => l.runningBalance));
    expect(rows.map(r => [Number(r.debit), Number(r.credit)])).toEqual(oldGl.lines.map(l => [l.debit, l.credit]));
    expect(rows.length ? Number(rows[rows.length - 1].running_balance) : oldGl.openingBalance).toBe(oldGl.closingBalance);
  });
});
