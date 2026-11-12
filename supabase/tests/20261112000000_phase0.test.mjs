// Phase 0 (ledger stabilisation) tests: migration 20261112000000_phase0_stabilize.sql
// Standalone: node supabase/tests/20261112000000_phase0.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET, HO } = IDS;
const BANK = '44444444-4444-4444-4444-444444444444', SUP = '33333333-3333-3333-3333-333333333333';
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
// the fixture chart is minimal: give HO the full template chart
await asServer(`select public._seed_chart_of_accounts('${HO}')`);

await check('template has opening-balance equity and other-charges accounts', async () => {
  const n = await val(`select count(*)::int from account_templates where code in ('3900','5900','4900','2060','1000')`);
  assert(n === 5, 'n=' + n); return 'ok';
});

await check('bank opening balance posts a balanced opening journal (Dr bank / Cr 3900)', async () => {
  await tx(ADMIN, `insert into bank_accounts (id, company_id, bank_name, account_name, account_number, account_type, gl_account_code, opening_balance)
    values ('44444444-4444-4444-4444-4444444444aa','${HO}','NBO','Main','777','Current','1020', 1500)`);
  const bal = await val(`select current_balance from v_bank_balances where id='44444444-4444-4444-4444-4444444444aa'`);
  const eq = await val(`select balance from v_account_balances where company_id='${HO}' and code='3900'`);
  assert(Number(bal) === 1500, 'bank ' + bal);
  assert(Math.abs(Number(eq)) === 1500, '3900 ' + eq);
  return `bank ${bal}, 3900 ${eq}`;
});
await check('bank opening balance cannot be edited directly', () =>
  tx(ADMIN, `update bank_accounts set opening_balance = 10 where id='44444444-4444-4444-4444-4444444444aa'`), 'adjust_bank_opening_balance');
await check('adjust_bank_opening_balance posts only the difference', async () => {
  await tx(ADMIN, `select adjust_bank_opening_balance('44444444-4444-4444-4444-4444444444aa', 1200)`);
  const bal = await val(`select current_balance from v_bank_balances where id='44444444-4444-4444-4444-4444444444aa'`);
  assert(Number(bal) === 1200, 'bank ' + bal); return 'bank ' + bal;
});

await check('client journal: source forced to Manual (cannot forge Payroll provenance)', async () => {
  await tx(ADMIN, `select post_journal_entry('${HO}', current_date, 'forged', '[{"account_code":"5000","debit":5},{"account_code":"1010","credit":5}]', null, 'Payroll', '${BANK}')`);
  const r = (await asServer(`select source_module, source_id from journal_entries where description='forged'`)).rows[0];
  assert(r.source_module === 'Manual' && r.source_id === null, JSON.stringify(r)); return 'Manual';
});
await check('journal with an account outside the office chart rejected', () =>
  tx(ADMIN, `select post_journal_entry('${HO}', current_date, 'bad', '[{"account_code":"9999","debit":5},{"account_code":"1010","credit":5}]')`), 'Unknown account');
await check('journal line with both debit and credit rejected', () =>
  tx(ADMIN, `select post_journal_entry('${HO}', current_date, 'bad', '[{"account_code":"5000","debit":5,"credit":5},{"account_code":"1010","credit":0.001}]')`), 'either a positive debit');
await check('Viewer cannot post journals', () =>
  tx(VIEWER, `select post_journal_entry('${HO}', current_date, 'v', '[{"account_code":"5000","debit":5},{"account_code":"1010","credit":5}]')`), 'Permission denied');

await check('posted journal cannot be voided in place', () =>
  asServer(`update journal_entries set status='Void' where description='forged'`), 'immutable');
await check('reverse_journal_entry mirrors the lines and nets to zero', async () => {
  const id = await val(`select id from journal_entries where description='forged'`);
  await tx(ADMIN, `select reverse_journal_entry('${id}', current_date, 'posted in error')`);
  const n = await val(`select coalesce(sum(debit - credit), 0) from journal_lines jl join journal_entries je on je.id = jl.entry_id
                       where jl.account_code='5000' and (je.id='${id}' or je.reverses_entry_id='${id}')`);
  assert(Number(n) === 0, 'net ' + n); return 'net 0';
});
await check('a journal can only be reversed once', async () => {
  const id = await val(`select id from journal_entries where description='forged'`);
  return tx(ADMIN, `select reverse_journal_entry('${id}', current_date, 'again')`);
}, 'already been reversed');
await check('reversal needs a reason', async () => {
  await tx(ADMIN, `select post_journal_entry('${HO}', current_date, 'r2', '[{"account_code":"5000","debit":1},{"account_code":"1010","credit":1}]')`);
  const id = await val(`select id from journal_entries where description='r2'`);
  return tx(ADMIN, `select reverse_journal_entry('${id}', current_date, ' ')`);
}, 'reason is required');

// --- invoices: other charges are posted, control credited with the full grand total
const INV = '66666666-0000-0000-0000-000000000001';
await check('purchase invoice with other charges posts a balanced entry crediting AP with grand_total', async () => {
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, other_charges)
     values ('${INV}','${HO}','PINV-OC-1','Purchase','Supplier','${SUP}', current_date, current_date + 30, 0);
     insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
     values ('${INV}', 1, 'Filter', 1, 100, 5, '5000')`);
  await asServer(`alter table invoices disable trigger user; update invoices set other_charges = 20 where id='${INV}'; alter table invoices enable trigger user; select recalc_invoice_totals('${INV}');`);
  await tx(ADMIN, `select post_invoice('${INV}')`);
  const r = (await asServer(`select
      (select sum(credit) from journal_lines jl join invoices i on i.journal_entry_id = jl.entry_id where i.id='${INV}' and jl.account_code='2010') ap,
      (select sum(debit) from journal_lines jl join invoices i on i.journal_entry_id = jl.entry_id where i.id='${INV}' and jl.account_code='5900') oc,
      (select grand_total from invoices where id='${INV}') gt`)).rows[0];
  assert(Number(r.ap) === Number(r.gt) && Number(r.oc) === 20, JSON.stringify(r));
  return JSON.stringify(r);
});
await check('cancelled invoice cannot be posted', async () => {
  const id = '66666666-0000-0000-0000-000000000002';
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date)
     values ('${id}','${HO}','PINV-C-1','Purchase','Supplier','${SUP}', current_date, current_date + 30);
     insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, gl_account_code) values ('${id}', 1, 'x', 1, 10, '5000')`);
  await asServer(`alter table invoices disable trigger user; update invoices set approval_status='Cancelled' where id='${id}'; alter table invoices enable trigger user;`);
  return tx(ADMIN, `select post_invoice('${id}')`);
}, 'cannot be posted');

await check('payment tags the bank line: bank balance = GL movement', async () => {
  const before = Number(await val(`select current_balance from v_bank_balances where id='${BANK}'`));
  await tx(ADMIN, `select record_payment('${INV}', 50, current_date, 'Bank Transfer', '${BANK}')`);
  const after = Number(await val(`select current_balance from v_bank_balances where id='${BANK}'`));
  const tagged = await val(`select count(*)::int from journal_lines where bank_account_id='${BANK}'`);
  assert(after === before - 50 && tagged === 1, `before ${before} after ${after} tagged ${tagged}`);
  return `bank ${before} -> ${after}`;
});

await check('payroll paid from a bank reduces the bank balance', async () => {
  await asServer(`insert into employees (company_id, employee_code, name, designation, department, joining_date, status, basic_salary)
                  values ('${HO}','EMP-1','Ali','Driver','Ops','2025-01-01','Active', 300)`);
  const before = Number(await val(`select current_balance from v_bank_balances where id='${BANK}'`));
  await tx(ADMIN, `select process_payroll('${HO}', 2026, 1, '2026-01-31', '${BANK}', true)`);
  const after = Number(await val(`select current_balance from v_bank_balances where id='${BANK}'`));
  assert(after < before, `before ${before} after ${after}`);
  return `bank ${before} -> ${after}`;
});

await check('trial balance still balances for the office', async () => {
  const r = (await asServer(`select sum(debit) dr, sum(credit) cr from journal_lines where company_id='${HO}'`)).rows[0];
  assert(Number(r.dr) === Number(r.cr), JSON.stringify(r)); return `Dr ${r.dr} = Cr ${r.cr}`;
});

// --- approvals
await check('client cannot insert approval requests directly', () =>
  as(FLEET, `insert into approval_requests (company_id, reference_type, reference_id, reference_number, amount, requested_by)
             values ('${HO}','Expense','${BANK}','X',10,'${FLEET}')`), 'permission denied');
await check('requester cannot approve their own request', async () => {
  await asServer(`insert into approval_requests (id, company_id, reference_type, reference_id, reference_number, amount, requested_by)
                  values ('99999999-0000-0000-0000-000000000001','${HO}','Expense','${BANK}','EXP-1',10,'${ADMIN}')`);
  return tx(ADMIN, `select decide_approval('99999999-0000-0000-0000-000000000001','Approved','mine')`);
}, 'own request');

t.report();
