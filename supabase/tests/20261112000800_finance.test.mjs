// Finance controls: journal limits and approval, period lock, payment limit, debit notes, bank
// reconciliation, cash flow, budgets, asset disposal. Migration 20261112000800_finance.sql
// Standalone: node supabase/tests/20261112000800_finance.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, OTHER, HO, DQ } = IDS;
const FM = '00000000-0000-0000-0000-0000000000f1';    // Finance Manager in HO
const FM2 = '00000000-0000-0000-0000-0000000000f2';   // Finance Manager in HO
const ACC = '00000000-0000-0000-0000-0000000000f3';   // Accountant in HO (journal and payment limit 5000)
const CUS = '66666666-6666-6666-6666-666666666666';
const BANK = '44444444-4444-4444-4444-444444444444';
const BANK2 = '44444444-4444-4444-4444-444444444445';
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const role = (name) => `(select id from public.roles where name = '${name}')`;
const LAST = new Date().getFullYear() - 1;
const today = new Date().toISOString().slice(0, 10);
const lines = (amt, dr = '5000', cr = '1010') => JSON.stringify([{ account_code: dr, debit: amt }, { account_code: cr, credit: amt }]);

await asServer(`
  insert into auth.users (id, email) values ('${FM}','fm@x.com'), ('${FM2}','fm2@x.com'), ('${ACC}','acc@x.com');
  update profiles set role_id = ${role('Finance Manager')} where id in ('${FM}','${FM2}');
  update profiles set role_id = ${role('Accountant')} where id = '${ACC}';
  insert into company_members (user_id, company_id) values ('${FM}','${HO}'), ('${FM2}','${HO}'), ('${ACC}','${HO}');
  insert into customers (id, customer_code, name, customer_type) values ('${CUS}','CUST-F1','PDO','Corporate');
  insert into bank_accounts (id, company_id, bank_name, account_name, account_number, account_type)
    values ('${BANK2}','${DQ}','BM','Duqm','002','Current');
`);

// ---------------------------------------------------------------- manual journals
await check('Finance Manager posts a manual journal directly', async () => {
  const id = (await as(FM, `select post_journal_entry('${HO}', '${today}', 'Fuel float', '${lines(100)}') id`)).rows[0].id;
  assert(id, 'no id'); return 'posted';
});
await check('accountant cannot post a journal above the journal limit directly', () =>
  tx(ACC, `select post_journal_entry('${HO}', '${today}', 'Big', '${lines(6000)}')`), 'above your journal approval limit');
await check('accountant submits a small journal: posted at once', async () => {
  const r = (await as(ACC, `select submit_manual_journal('${HO}', '${today}', 'Small', '${lines(50)}') r`)).rows[0].r;
  assert(r.status === 'Posted' && r.journal_entry_id, JSON.stringify(r)); return r.status;
});
await check('an unbalanced journal is rejected before it is queued', () =>
  tx(ACC, `select submit_manual_journal('${HO}', '${today}', 'Bad', '[{"account_code":"5000","debit":10},{"account_code":"1010","credit":9}]')`), 'not balanced');
let JR;
await check('a large journal waits for approval and notifies approvers', async () => {
  const r = (await as(ACC, `select submit_manual_journal('${HO}', '${today}', 'Truck repair accrual', '${lines(6000)}', 'REF-9') r`)).rows[0].r;
  JR = r.id;
  const n = await val(`select count(*)::int from notifications where reference_id = '${JR}' and type = 'approval_required'`);
  const je = await val(`select count(*)::int from journal_entries where description = 'Truck repair accrual'`);
  assert(r.status === 'Pending' && n === 1 && je === 0, JSON.stringify({ r, n, je })); return r.request_number;
});
await check('the requester cannot approve their own journal', () => tx(ACC, `select review_manual_journal('${JR}', 'Approved')`), 'cannot approve a journal you submitted');
await check('rejecting needs a reason', () => tx(FM, `select review_manual_journal('${JR}', 'Rejected', '')`), 'reason is required');
await check('viewer cannot see journal requests', async () => {
  const n = (await as(VIEWER, `select count(*)::int n from journal_requests`)).rows[0].n;
  assert(n === 0, n); return 'hidden';
});
await check('Finance Manager approves: the journal is posted and the requester notified', async () => {
  await as(FM, `select review_manual_journal('${JR}', 'Approved', 'ok')`);
  const r = (await asServer(`select r.status, r.journal_entry_id je, e.reference, e.source_module src from journal_requests r join journal_entries e on e.id = r.journal_entry_id where r.id = '${JR}'`)).rows[0];
  const n = await val(`select count(*)::int from notifications where reference_id = '${JR}' and user_id = '${ACC}'`);
  assert(r.status === 'Approved' && r.reference === 'REF-9' && r.src === 'Manual' && n === 1, JSON.stringify({ r, n })); return r.status;
});
await check('a decided request cannot be decided again', () => tx(FM, `select review_manual_journal('${JR}', 'Rejected', 'no')`), 'already been decided');

// ---------------------------------------------------------------- period lock
await check('viewer cannot close a period', () => tx(VIEWER, `select close_period('${HO}', ${LAST}, 3)`), 'Permission denied');
await check('the current month cannot be closed before it ends', () => {
  const d = new Date();
  return tx(FM, `select close_period('${HO}', ${d.getFullYear()}, ${d.getMonth() + 1})`);
}, 'only after it has ended');
await check('a closed month rejects postings from every source', async () => {
  await as(FM, `select close_period('${HO}', ${LAST}, 3, 'March closed')`);
  return tx(FM, `select post_journal_entry('${HO}', '${LAST}-03-15', 'Late entry', '${lines(10)}')`);
}, 'is closed for this office');
await check('a closed month does not block other offices', async () => {
  await asServer(`insert into accounts (company_id, code, name, category, subcategory) values ('${DQ}','5000','M','Expense','Direct'), ('${DQ}','1010','B','Asset','Cash') on conflict do nothing`);
  const id = (await as(ADMIN, `select post_journal_entry('${DQ}', '${LAST}-03-15', 'Duqm entry', '${lines(10)}') id`)).rows[0].id;
  assert(id, 'no id'); return 'posted in DQ';
});
await check('a queued journal for a closed month is rejected', () =>
  tx(ACC, `select submit_manual_journal('${HO}', '${LAST}-03-10', 'Late', '${lines(6000)}')`), 'is closed for this office');
await check('reopening needs a reason; then posting works', async () => {
  let err = '';
  try { await tx(FM, `select reopen_period('${HO}', ${LAST}, 3, '')`); } catch (e) { err = e.message; }
  assert(err.includes('reason is required'), err);
  await as(FM, `select reopen_period('${HO}', ${LAST}, 3, 'Audit adjustment')`);
  const id = (await as(FM, `select post_journal_entry('${HO}', '${LAST}-03-15', 'Audit adj', '${lines(10)}') id`)).rows[0].id;
  assert(id, 'no id'); return 'reopened';
});
await check('periods cannot be written directly', () => tx(FM, `insert into accounting_periods (company_id, year, month) values ('${HO}', ${LAST}, 4)`), 'row-level security');

// ---------------------------------------------------------------- payments and debit notes
const createSql = (header, ls, submit = true) =>
  `select public.create_invoice('${JSON.stringify(header)}'::jsonb, '${JSON.stringify(ls)}'::jsonb, ${submit}) id`;
let S1;
await check('Finance Manager raises and posts a sales invoice of 6300', async () => {
  S1 = (await as(FM, createSql({ company_id: HO, invoice_type: 'Sales', customer_id: CUS, invoice_date: today },
    [{ description: 'Charter', quantity: 1, unit_price: 6000, tax_rate_percentage: 5, gl_account_code: '4000' }]))).rows[0].id;
  const r = (await asServer(`select approval_status s, grand_total g from invoices where id = '${S1}'`)).rows[0];
  assert(r.s === 'Approved' && Number(r.g) === 6300, JSON.stringify(r)); return `${r.g}`;
});
await check('accountant cannot record a payment above the payment limit', () =>
  tx(ACC, `select record_payment('${S1}', 5500, '${today}', 'Bank Transfer', '${BANK}')`), 'above your payment approval limit');
let PAY_LINE;
await check('accountant records a payment within the limit', async () => {
  await as(ACC, `select record_payment('${S1}', 4000, '${today}', 'Bank Transfer', '${BANK}', 'TRX-77')`);
  PAY_LINE = await val(`select jl.id from journal_lines jl join payments p on p.journal_entry_id = jl.entry_id where p.invoice_id = '${S1}' and jl.bank_account_id = '${BANK}'`);
  assert(PAY_LINE, 'no bank line'); return 'paid 4000';
});
await check('clients cannot flag an invoice as a debit note', () =>
  tx(FM, `insert into invoices (company_id, invoice_type, party_type, customer_id, invoice_date, due_date, currency, is_debit_note)
          values ('${HO}','Sales','Customer','${CUS}','${today}','${today}','OMR', true)`), 'create_debit_note');
let DN;
await check('a debit note adds a charge on a posted invoice and is posted on its own', async () => {
  DN = (await as(FM, `select create_debit_note('${S1}', 'Extra hours', '${JSON.stringify([{ description: 'Overtime hours', quantity: 2, unit_price: 50, tax_rate_percentage: 5, gl_account_code: '4000' }])}'::jsonb) id`)).rows[0].id;
  const r = (await asServer(`select is_debit_note d, parent_invoice_id p, grand_total g, approval_status s, journal_entry_id je from invoices where id = '${DN}'`)).rows[0];
  const parent = await val(`select outstanding_amount from invoices where id = '${S1}'`);
  assert(r.d && r.p === S1 && Number(r.g) === 105 && r.s === 'Approved' && r.je && Number(parent) === 2300, JSON.stringify({ r, parent }));
  return `DN ${r.g}`;
});
await check('a debit note needs a reason', () => tx(FM, `select create_debit_note('${S1}', ' ', '[{"description":"x","quantity":1,"unit_price":1}]'::jsonb)`), 'reason is required');
await check('no debit note on a debit note', () => tx(FM, `select create_debit_note('${DN}', 'x', '[{"description":"x","quantity":1,"unit_price":1}]'::jsonb)`), 'only be raised against');

// ---------------------------------------------------------------- bank reconciliation
let ST, L1, L2;
await check('accountant enters a statement; lines take the office from it', async () => {
  const open = await val(`select coalesce(sum(jl.debit - jl.credit), 0) from journal_lines jl join journal_entries je on je.id = jl.entry_id where jl.bank_account_id = '${BANK}' and je.date < '${today}'`);
  ST = (await as(ACC, `insert into bank_statements (company_id, bank_account_id, period_start, period_end, opening_balance, closing_balance)
                       values ('${HO}','${BANK}','${today}','${today}', ${open}, ${Number(open) + 4000 - 2.5}) returning id`)).rows[0].id;
  L1 = (await as(ACC, `insert into bank_statement_lines (statement_id, company_id, txn_date, description, amount) values ('${ST}','${HO}','${today}','PDO transfer', 4000) returning id`)).rows[0].id;
  L2 = (await as(ACC, `insert into bank_statement_lines (statement_id, company_id, txn_date, description, amount) values ('${ST}','${HO}','${today}','Bank charge', -2.5) returning id`)).rows[0].id;
  return 'two lines';
});
await check('another office cannot add a statement for this bank', () =>
  tx(OTHER, `insert into bank_statements (company_id, bank_account_id, period_start, period_end, opening_balance, closing_balance) values ('${DQ}','${BANK}','${today}','${today}',0,0)`), 'row-level security');
await check('a line outside the statement period is rejected', () =>
  tx(ACC, `insert into bank_statement_lines (statement_id, company_id, txn_date, description, amount) values ('${ST}','${HO}','2000-01-01','Old', 1)`), 'outside the statement period');
await check('auto-match pairs the receipt with the ledger line', async () => {
  const n = (await as(ACC, `select auto_match_statement('${ST}') n`)).rows[0].n;
  const m = await val(`select journal_line_id from bank_statement_lines where id = '${L1}'`);
  assert(n === 1 && m === PAY_LINE, JSON.stringify({ n, m })); return `${n} matched`;
});
await check('matching to a ledger line of a different amount is rejected', () =>
  tx(ACC, `update bank_statement_lines set journal_line_id = '${PAY_LINE}' where id = '${L2}'`), 'Amounts differ');
await check('cannot complete with unmatched lines', () => tx(FM, `select complete_bank_reconciliation('${ST}')`), 'not matched');
await check('after booking the bank charge, the statement reconciles and locks', async () => {
  await as(FM, `select post_journal_entry('${HO}', '${today}', 'Bank charge', '[{"account_code":"5000","debit":2.5},{"account_code":"1010","credit":2.5,"bank_account_id":"${BANK}"}]')`);
  await as(ACC, `select auto_match_statement('${ST}')`);
  await as(FM, `select complete_bank_reconciliation('${ST}')`);
  const s = await val(`select status from bank_statements where id = '${ST}'`);
  assert(s === 'Reconciled', s); return s;
});
await check('a reconciled statement is locked', () => tx(ACC, `update bank_statement_lines set description = 'x' where id = '${L1}'`), 'reconciled');
await check('book lines show what is matched', async () => {
  const r = (await as(ACC, `select count(*) filter (where statement_line_id is not null)::int m, count(*)::int n from bank_book_lines('${BANK}', '${today}', '${today}')`)).rows[0];
  assert(r.m === 2 && r.n >= 2, JSON.stringify(r)); return `${r.m}/${r.n}`;
});

// ---------------------------------------------------------------- cash flow
await check('cash flow: receipts, payments and closing cash add up', async () => {
  const rows = (await as(FM, `select section, line, amount from cash_flow_statement('${HO}', '${today}', '${today}')`)).rows;
  const get = (l) => Number(rows.find(r => r.line === l)?.amount ?? 0);
  const flows = rows.filter(r => !['Opening', 'Closing'].includes(r.section)).reduce((s, r) => s + Number(r.amount), 0);
  const ok = get('Receipts from customers') === 4000 && Math.abs(get('Cash at start of period') + flows - get('Cash at end of period')) < 0.001;
  assert(ok, JSON.stringify(rows)); return `${rows.length} lines`;
});
await check('cash flow needs accounting view rights', () => tx(OTHER, `select * from cash_flow_statement('${HO}', '${today}', '${today}')`), 'Permission denied');

// ---------------------------------------------------------------- budgets
let B;
await check('Finance Manager drafts a budget with monthly lines', async () => {
  B = (await as(FM, `insert into budgets (company_id, year, name) values ('${HO}', ${new Date().getFullYear()}, 'Operating') returning id`)).rows[0].id;
  const m = new Date().getMonth() + 1;
  await as(FM, `insert into budget_lines (budget_id, company_id, account_code, month, amount) values ('${B}','${HO}','5000',${m},120), ('${B}','${HO}','4000',${m},5000)`);
  return 'drafted';
});
await check('budget lines must use income or expense accounts', () =>
  tx(FM, `insert into budget_lines (budget_id, company_id, account_code, month, amount) values ('${B}','${HO}','1010',1,10)`), 'income or expense account');
await check('a budget cannot be approved by its submitter', async () => {
  await as(FM, `select submit_budget('${B}')`);
  return tx(FM, `select review_budget('${B}', 'Approved')`);
}, 'cannot approve a budget you submitted');
await check('a submitted budget is locked', () => tx(FM, `update budget_lines set amount = 1 where budget_id = '${B}'`), 'Draft or Rejected');
await check('another Finance Manager approves; budget vs actual reads the ledger', async () => {
  await as(FM2, `select review_budget('${B}', 'Approved', 'ok')`);
  const m = new Date().getMonth() + 1;
  const r = (await as(FM, `select budget, actual from budget_vs_actual('${HO}', ${new Date().getFullYear()}) where account_code = '5000' and month = ${m}`)).rows[0];
  const exp = await val(`select sum(jl.debit - jl.credit) from journal_lines jl join journal_entries je on je.id = jl.entry_id where jl.company_id = '${HO}' and jl.account_code = '5000' and extract(year from je.date) = ${new Date().getFullYear()} and extract(month from je.date) = ${m}`);
  assert(Number(r.budget) === 120 && Number(r.actual) === Number(exp), JSON.stringify({ r, exp })); return `budget ${r.budget} actual ${r.actual}`;
});
await check('only one approved budget per office and year', async () => {
  const b2 = (await as(FM, `insert into budgets (company_id, year, name) values ('${HO}', ${new Date().getFullYear()}, 'Second') returning id`)).rows[0].id;
  await as(FM, `insert into budget_lines (budget_id, company_id, account_code, month, amount) values ('${b2}','${HO}','5000',1,1)`);
  await as(FM2, `select submit_budget('${b2}')`);
  return tx(FM, `select review_budget('${b2}', 'Approved')`);
}, 'duplicate key');

// ---------------------------------------------------------------- fixed asset disposal
let FA;
await check('an asset cannot be marked disposed directly', async () => {
  FA = (await as(ADMIN, `insert into fixed_assets (company_id, asset_code, name, category, purchase_date, purchase_cost, useful_life_years,
      annual_rate_percentage, depreciation_method, accumulated_depreciation, gl_asset_account, gl_expense_account, gl_accum_dep_account)
      values ('${HO}','FA-1','Coaster bus','Vehicle','${LAST}-01-01',1000,5,20,'Straight-Line',400,'1510','5080','1520') returning id`)).rows[0].id;
  return tx(ADMIN, `update fixed_assets set status = 'Disposed' where id = '${FA}'`);
}, 'dispose_fixed_asset');
await check('disposal posts cost, depreciation, proceeds and the gain', async () => {
  const je = (await as(FM, `select dispose_fixed_asset('${FA}', '${today}', 700, '${BANK}', 'Sold to dealer') je`)).rows[0].je;
  const l = (await asServer(`select account_code c, debit d, credit k from journal_lines where entry_id = '${je}' order by account_code`)).rows
    .map(x => `${x.c}:${Number(x.d) || -Number(x.k)}`).join(' ');
  const s = await val(`select status from fixed_assets where id = '${FA}'`);
  assert(l === '1010:700 1510:-1000 1520:400 4030:-100' && s === 'Disposed', `${l} ${s}`); return l;
});
await check('a disposed asset cannot change', () => tx(ADMIN, `update fixed_assets set name = 'x' where id = '${FA}'`), 'cannot be changed');

// ---------------------------------------------------------------- payroll account fix
await check('payroll gratuity posts to 5085, not depreciation 5080', async () => {
  const def = await val(`select pg_get_functiondef('public.payroll_approve(uuid,text)'::regprocedure)`);
  assert(def.includes("'5085'") && !def.includes("'5080'"), 'still 5080'); return '5085';
});

t.report();
