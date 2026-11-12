// Expenses: workflow guards, approval limits, GL posting, payment, recurring drafts, budget alerts.
// Migration 20261112000900_expenses.sql
// Standalone: node supabase/tests/20261112000900_expenses.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET, OTHER, HO, DQ } = IDS;
const FM = '00000000-0000-0000-0000-0000000000e1';    // Finance Manager in HO (unlimited)
const VEH = '55555555-5555-5555-5555-555555555555';
const SUP = '33333333-3333-3333-3333-333333333333';
const BANK = '44444444-4444-4444-4444-444444444444';
const EMP_DQ = '77777777-7777-7777-7777-777777777771';
const EMP_HO = '77777777-7777-7777-7777-777777777772';
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const role = (name) => `(select id from public.roles where name = '${name}')`;
const today = new Date().toISOString().slice(0, 10);
const YEAR = new Date().getFullYear();

await asServer(`
  insert into auth.users (id, email) values ('${FM}','fm@x.com');
  update profiles set role_id = ${role('Finance Manager')} where id = '${FM}';
  insert into company_members (user_id, company_id) values ('${FM}','${HO}');
  insert into employees (id, company_id, employee_code, name, designation, department, joining_date, basic_salary) values
    ('${EMP_DQ}','${DQ}','E-D1','Ali','Driver','Operations','2024-01-01',300),
    ('${EMP_HO}','${HO}','E-H1','Sara','Clerk','Admin','2024-01-01',400);
`);
const newExpense = async (uid, amount, extra = {}) => {
  const cols = { company_id: `'${HO}'`, vehicle_id: `'${VEH}'`, date: `'${today}'`, category: `'Fuel'`, description: `'Diesel'`,
    quantity: 1, unit_price: amount, tax: 0, total: amount, payment_method: `'Cash'`, ...extra };
  return (await as(uid, `insert into expenses (${Object.keys(cols).join(',')}) values (${Object.values(cols).join(',')}) returning id, status`)).rows[0];
};

// ---------------------------------------------------------------- guards
let E1;
await check('a new expense starts as a draft whatever the client sends', async () => {
  const r = await newExpense(FLEET, 100, { status: `'Approved'`, payment_status: `'Paid'` });
  E1 = r.id;
  assert(r.status === 'Draft', r.status);
  const ps = await val(`select payment_status from expenses where id = '${E1}'`);
  assert(ps === 'Unpaid', ps); return 'Draft';
});
await check('clients cannot set the status directly', () => tx(FLEET, `update expenses set status = 'Approved' where id = '${E1}'`), 'submit_expense');
await check('an employee from another office is rejected', () => newExpense(FLEET, 10, { employee_id: `'${EMP_DQ}'` }), 'another office');
await check('an employee in the same office is accepted', async () => {
  const r = await newExpense(FLEET, 10, { employee_id: `'${EMP_HO}'` }); assert(r.id); return 'ok';
});
await check('a bank account from another office is rejected', async () => {
  await asServer(`insert into bank_accounts (id, company_id, bank_name, account_name, account_number, account_type) values ('44444444-4444-4444-4444-444444444449','${DQ}','BM','D','009','Current')`);
  return newExpense(FLEET, 10, { bank_account_id: `'44444444-4444-4444-4444-444444444449'` });
}, 'another office');
await check('viewer cannot submit an expense', () => tx(VIEWER, `select submit_expense('${E1}')`), 'Permission denied');
await check('a user in another office cannot see the expense', async () => {
  const n = (await as(OTHER, `select count(*)::int n from expenses where id = '${E1}'`)).rows[0].n;
  assert(n === 0, n); return 'hidden';
});

// ---------------------------------------------------------------- within the limit: approved and posted
await check('within the expense limit an expense is approved and posted to payables at once', async () => {
  const s = (await as(FLEET, `select submit_expense('${E1}') s`)).rows[0].s;
  const r = (await asServer(`select e.status, e.payment_status ps, j.source_module src,
      (select jsonb_agg(jsonb_build_object('a', account_code, 'd', debit, 'c', credit) order by account_code) from journal_lines where entry_id = j.id) l
      from expenses e join journal_entries j on j.id = e.journal_entry_id where e.id = '${E1}'`)).rows[0];
  const codes = r.l.map(x => `${x.a}:${Number(x.d)}:${Number(x.c)}`).join(',');
  assert(s === 'Approved' && r.status === 'Approved' && r.ps === 'Unpaid' && r.src === 'Expense', JSON.stringify(r));
  assert(codes === '2010:0:100,5010:100:0', codes); return codes;
});
await check('the category account is created in the office chart when missing', async () => {
  const n = await val(`select count(*)::int from accounts where company_id = '${HO}' and code = '5010'`);
  assert(n === 1, n); return '5010';
});
await check('an approved expense is locked', () => tx(FLEET, `update expenses set description = 'x' where id = '${E1}'`), 'cannot be changed');
await check('an approved expense cannot be deleted', () => tx(ADMIN, `delete from expenses where id = '${E1}'`), 'Only draft or rejected');
await check('the vehicle timeline gets the expense once approved', async () => {
  const n = await val(`select count(*)::int from vehicle_timeline where reference_id = '${E1}'`);
  assert(n === 1, n); return n;
});

// ---------------------------------------------------------------- paying later
await check('fleet manager cannot record the payment without payment rights', () => tx(FLEET, `select pay_expense('${E1}', '${BANK}', '${today}')`), 'Permission denied');
await check('Finance Manager pays: Dr payables, Cr bank', async () => {
  await as(FM, `select pay_expense('${E1}', '${BANK}', '${today}')`);
  const r = (await asServer(`select e.payment_status ps, (select string_agg(account_code || ':' || debit::numeric(12,0) || ':' || credit::numeric(12,0), ',' order by account_code)
      from journal_lines where entry_id = e.payment_journal_entry_id) l from expenses e where id = '${E1}'`)).rows[0];
  assert(r.ps === 'Paid' && r.l === '1010:0:100,2010:100:0', JSON.stringify(r)); return r.l;
});
await check('a paid expense cannot be paid again', () => tx(FM, `select pay_expense('${E1}', '${BANK}', '${today}')`), 'already paid');

// ---------------------------------------------------------------- above the limit: approval
let E2;
await check('above the limit the expense waits for approval and approvers are notified', async () => {
  E2 = (await newExpense(FLEET, 800, { tax: 40, bank_account_id: `'${BANK}'` })).id;
  const s = (await as(FLEET, `select submit_expense('${E2}') s`)).rows[0].s;
  const n = await val(`select count(*)::int from notifications where reference_id = '${E2}' and type = 'approval_required'`);
  const je = await val(`select journal_entry_id from expenses where id = '${E2}'`);
  assert(s === 'Pending Approval' && n === 1 && !je, JSON.stringify({ s, n, je })); return s;
});
await check('a pending expense cannot be edited', () => tx(FLEET, `update expenses set notes = 'x' where id = '${E2}'`), 'cannot be changed');
await check('the submitter cannot approve their own expense', () => tx(FLEET, `select review_expense('${E2}', 'Approved')`), 'your own expense');
await check('rejecting needs a reason', () => tx(FM, `select review_expense('${E2}', 'Rejected', ' ')`), 'reason is required');
await check('rejected: the submitter is told why and can fix and resubmit', async () => {
  await as(FM, `select review_expense('${E2}', 'Rejected', 'Attach the receipt')`);
  const r = (await asServer(`select status, review_note from expenses where id = '${E2}'`)).rows[0];
  const n = await val(`select count(*)::int from notifications where reference_id = '${E2}' and user_id = '${FLEET}' and type = 'expense_rejected'`);
  await as(FLEET, `update expenses set receipt_number = 'R-1' where id = '${E2}'`);
  const s = (await as(FLEET, `select submit_expense('${E2}') s`)).rows[0].s;
  assert(r.status === 'Rejected' && r.review_note === 'Attach the receipt' && n === 1 && s === 'Pending Approval', JSON.stringify({ r, n, s }));
  return s;
});
await check('an accountant without expense approval rights cannot approve it', async () => {
  await asServer(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e2','acc@x.com');
    update profiles set role_id = ${role('Accountant')} where id = '00000000-0000-0000-0000-0000000000e2';
    insert into company_members (user_id, company_id) values ('00000000-0000-0000-0000-0000000000e2','${HO}');`);
  return tx('00000000-0000-0000-0000-0000000000e2', `select review_expense('${E2}', 'Approved')`);
}, 'Permission denied');
await check('an approver above their limit cannot approve it', async () => {
  await asServer(`update role_approval_limits set max_amount = 100 where module = 'expense' and role_id = ${role('Finance Manager')}`);
  try { await tx(FM, `select review_expense('${E2}', 'Approved')`); } finally {
    await asServer(`update role_approval_limits set max_amount = null where module = 'expense' and role_id = ${role('Finance Manager')}`);
  }
}, 'above your expense approval limit');
await check('Finance Manager approves: posted with VAT and paid from the bank', async () => {
  await as(FM, `select review_expense('${E2}', 'Approved', 'ok')`);
  const r = (await asServer(`select e.status, e.payment_status ps, e.approved_by, (select string_agg(account_code || ':' || debit::numeric(12,0) || ':' || credit::numeric(12,0), ',' order by account_code)
      from journal_lines where entry_id = e.journal_entry_id) l from expenses e where id = '${E2}'`)).rows[0];
  assert(r.status === 'Approved' && r.ps === 'Paid' && r.approved_by === FM && r.l === '1010:0:840,1300:40:0,5010:800:0', JSON.stringify(r));
  return r.l;
});
await check('the submitter can withdraw a pending expense back to draft', async () => {
  const id = (await newExpense(FLEET, 900)).id;
  await as(FLEET, `select submit_expense('${id}')`);
  const s = (await as(FLEET, `select review_expense('${id}', 'Withdrawn') s`)).rows[0].s;
  assert(s === 'Draft', s); return s;
});
await check('a closed period rejects submitting an expense dated in it', async () => {
  const last = YEAR - 1;
  await as(FM, `select close_period('${HO}', ${last}, 2)`);
  const id = (await newExpense(FLEET, 50, { date: `'${last}-02-10'` })).id;
  return tx(FLEET, `select submit_expense('${id}')`);
}, 'is closed for this office');

// ---------------------------------------------------------------- recurring
let REC;
await check('a recurring template needs a vehicle when its category does', async () => {
  await asServer(`update expense_categories set requires_vehicle = true where name = 'Tyres'`);
  return tx(ADMIN, `insert into recurring_expenses (company_id, category_id, description, amount, day_of_month, start_date)
    values ('${HO}', (select id from expense_categories where name = 'Tyres'), 'Tyre lease', 50, 5, '${YEAR}-01-01')`);
}, 'requires a vehicle');
await check('monthly drafts are created once per month up to today', async () => {
  REC = (await as(ADMIN, `insert into recurring_expenses (company_id, category_id, description, amount, tax, day_of_month, start_date, supplier_id)
    values ('${HO}', (select id from expense_categories where name = 'Rent'), 'Office rent', 200, 10, 1, '${YEAR}-01-01', '${SUP}') returning id`)).rows[0].id;
  const n1 = (await as(ADMIN, `select generate_recurring_expenses('${YEAR}-03-15') n`)).rows[0].n;
  const n2 = (await as(ADMIN, `select generate_recurring_expenses('${YEAR}-03-15') n`)).rows[0].n;
  const rows = (await asServer(`select status, date, total, category, gl_account_code gl from expenses where recurring_expense_id = '${REC}' order by date`)).rows;
  assert(n1 === 3 && n2 === 0 && rows.length === 3, JSON.stringify({ n1, n2, rows }));
  assert(rows.every(r => r.status === 'Draft' && Number(r.total) === 210 && r.category === 'Rent' && r.gl === '5100'), JSON.stringify(rows));
  return `${n1} drafts`;
});
await check('a draft is not created before its day of the month', async () => {
  const id = (await as(ADMIN, `insert into recurring_expenses (company_id, category_id, description, amount, day_of_month, start_date)
    values ('${HO}', (select id from expense_categories where name = 'Utilities'), 'Power', 30, 20, '${YEAR}-03-01') returning id`)).rows[0].id;
  await as(ADMIN, `select generate_recurring_expenses('${YEAR}-03-15')`);
  const n = await val(`select count(*)::int from expenses where recurring_expense_id = '${id}'`);
  assert(n === 0, n); return 'not yet due';
});
await check('due drafts notify the office; week-old drafts are flagged overdue', async () => {
  const due = await val(`select count(*)::int from notifications where type = 'recurring_expense_due' and company_id = '${HO}'`);
  const over = await val(`select count(*)::int from notifications where type = 'recurring_expense_overdue' and company_id = '${HO}'`);
  assert(due >= 3 && over === 3, JSON.stringify({ due, over })); return { due, over };
});
await check('an ended template stops generating', async () => {
  await asServer(`update recurring_expenses set end_date = '${YEAR}-03-31' where id = '${REC}'`);
  await as(ADMIN, `select generate_recurring_expenses('${YEAR}-06-15')`);
  const n = await val(`select count(*)::int from expenses where recurring_expense_id = '${REC}'`);
  assert(n === 3, n); return n;
});
await check('a user only generates drafts for offices where they may create expenses', async () => {
  const id = (await asServer(`insert into recurring_expenses (company_id, category_id, description, amount, day_of_month, start_date)
    values ('${DQ}', (select id from expense_categories where name = 'Rent'), 'Duqm rent', 100, 1, '${YEAR}-01-01') returning id`)).rows[0].id;
  await as(FLEET, `select generate_recurring_expenses('${YEAR}-02-15')`);
  const n = await val(`select count(*)::int from expenses where recurring_expense_id = '${id}'`);
  await asServer(`select generate_recurring_expenses('${YEAR}-02-15')`);
  const m = await val(`select count(*)::int from expenses where recurring_expense_id = '${id}'`);
  assert(n === 0 && m === 2, JSON.stringify({ n, m })); return 'scoped; cron covers all';
});
await check('clients cannot forge the recurring link on a new expense', async () => {
  const r = await newExpense(FLEET, 5, { recurring_expense_id: `'${REC}'`, recurring_period: `'${YEAR}-09-01'` });
  const v = await val(`select recurring_expense_id from expenses where id = '${r.id}'`);
  assert(!v, v); return 'cleared';
});
await check('a generated draft is submitted like any other expense', async () => {
  const id = await val(`select id from expenses where recurring_expense_id = '${REC}' order by date limit 1`);
  const s = (await as(FM, `select submit_expense('${id}') s`)).rows[0].s;
  assert(s === 'Approved', s); return s;
});

// ---------------------------------------------------------------- budget alerts
await check('budget alerts fire at 80% and 100% of the annual budget, once each', async () => {
  await asServer(`insert into accounts (company_id, code, name, category, subcategory) values ('${HO}','5110','Utilities','Expense','Operating') on conflict do nothing`);
  const b = (await as(FM, `insert into budgets (company_id, year, name) values ('${HO}', ${YEAR}, 'Ops') returning id`)).rows[0].id;
  await as(FM, `insert into budget_lines (budget_id, company_id, account_code, month, amount) values ('${b}','${HO}','5110',1,100)`);
  await as(FM, `select submit_budget('${b}')`);
  await as(ADMIN, `select review_budget('${b}', 'Approved', 'ok')`);
  const mk = async (amt) => { const id = (await newExpense(FM, amt, { category: `'Utilities'`, vehicle_id: 'null' })).id; await as(FM, `select submit_expense('${id}')`); };
  await mk(50);
  const a0 = await val(`select count(*)::int from notifications where type = 'budget_threshold' and company_id = '${HO}'`);
  await mk(35);
  const a1 = await val(`select count(*)::int from notifications where type = 'budget_threshold' and company_id = '${HO}'`);
  await mk(5);
  const a2 = await val(`select count(*)::int from notifications where type = 'budget_threshold' and company_id = '${HO}'`);
  await mk(20);
  const sev = await val(`select string_agg(severity, ',' order by severity) from notifications where type = 'budget_threshold' and company_id = '${HO}'`);
  assert(a0 === 0 && a1 === 1 && a2 === 1 && sev === 'critical,warning', JSON.stringify({ a0, a1, a2, sev })); return sev;
});
await check('the daily job runs the generator and the budget alerts together', async () => {
  const r = (await asServer(`select run_daily_finance_jobs() r`)).rows[0].r;
  assert(typeof r.recurring_drafts === 'number' && typeof r.budget_alerts === 'number', JSON.stringify(r)); return r;
});
await check('clients cannot run the daily job', () => tx(ADMIN, `select run_daily_finance_jobs()`), 'permission denied');

// ---------------------------------------------------------------- legacy rows and deletes
await check('a draft can be deleted by someone with delete rights', async () => {
  const id = (await newExpense(FLEET, 7)).id;
  await as(ADMIN, `delete from expenses where id = '${id}'`);
  const n = await val(`select count(*)::int from expenses where id = '${id}'`);
  assert(n === 0, n); return 'deleted';
});

t.report();
