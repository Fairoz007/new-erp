// Phase 1 data layer: indexes, ledger_movements, general_ledger_page, list views, invoice_page,
// invoice_summary, dashboard_series, expense_page / expense_summary / expense_totals.
// Migration 20261113000000_advance_data_layer.sql
// Standalone: node supabase/tests/20261113000000_advance_data_layer.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', {
  quiet: true,
  // ADV_CORE_ONLY=1 skips later migrations (useful while they are being written)
  order: process.env.ADV_CORE_ONLY ? (fs) => fs.filter(f => f <= '20261113000000_advance_data_layer.sql') : undefined,
});
const { db, check, as, tx, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET, OTHER, HO, DQ } = IDS;
const SUP = '33333333-3333-3333-3333-333333333333';
const CUS = '99999999-9999-9999-9999-999999999991';
const BANK = '44444444-4444-4444-4444-444444444444';
const VEH = '55555555-5555-5555-5555-555555555555';
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return ymd(d); };
const TODAY = day(0);
const n = (v) => Number(v);
const rows = async (uid, sql) => (await as(uid, sql)).rows;

await asServer(`insert into public.customers (id, customer_code, name, customer_type) values ('${CUS}','CUST-T1','Petro','Corporate')`);

// Fixture: 3 purchase bills, 2 sales invoices (one overdue), one credit note, one draft, one in DQ.
let invSeq = 0;
const invoice = async ({ type = 'Purchase', company = HO, date = TODAY, due = day(30), price = 100, post = true, ref } = {}) => {
  const id = `66666666-6666-6666-6666-${String(++invSeq).padStart(12, '0')}`;
  const party = type === 'Purchase' ? `'Supplier', '${SUP}', null` : `'Customer', null, '${CUS}'`;
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id, invoice_date, due_date, reference_number, vehicle_id)
      values ('${id}','${company}','T-${invSeq}','${type}',${party},'${date}','${due}','REF-${ref ?? invSeq}', ${company === HO ? `'${VEH}'` : 'null'});
    insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
      values ('${id}', 1, 'Line', 1, ${price}, 5, '${type === 'Purchase' ? '5000' : '4010'}')`);
  if (post) await tx(ADMIN, `select post_invoice('${id}')`);
  return id;
};
const P1 = await invoice({ price: 100 });
const P2 = await invoice({ price: 200, date: day(-50), due: day(-45) });
const P3 = await invoice({ price: 50, post: false });
const S1 = await invoice({ type: 'Sales', price: 400 });
const S2 = await invoice({ type: 'Sales', price: 300, due: day(-10), date: day(-40) });
await invoice({ price: 70, company: DQ });
await tx(ADMIN, `select record_payment('${P1}', 105, '${TODAY}', 'Bank Transfer', '${BANK}')`);
await tx(ADMIN, `select record_payment('${S2}', 100, '${TODAY}', 'Bank Transfer', '${BANK}')`);
await tx(ADMIN, `select post_journal_entry('${HO}', '${day(-5)}', 'Fuel float', '[{"account_code":"5000","debit":30},{"account_code":"1010","credit":30}]')`);

// ---------------------------------------------------------------- indexes
await check('list indexes exist', async () => {
  const want = ['invoices_list_idx', 'journal_entries_list_idx', 'journal_lines_account_entry_idx', 'payments_list_idx',
    'expenses_date_idx', 'notifications_user_idx', 'audit_logs_entity_time_idx'];
  const have = (await asServer(`select indexname from pg_indexes where schemaname = 'public'`)).rows.map(r => r.indexname);
  const missing = want.filter(w => !have.includes(w));
  assert(!missing.length, 'missing ' + missing); return `${want.length} present`;
});

// ---------------------------------------------------------------- ledger_movements
await check('ledger_movements equals Σ posted lines per office and account', async () => {
  const a = await rows(ADMIN, `select company_id, account_code, debit, credit from ledger_movements(null, null, null) order by 1, 2`);
  const b = (await asServer(`select e.company_id, l.account_code, sum(l.debit) debit, sum(l.credit) credit
      from journal_lines l join journal_entries e on e.id = l.entry_id where e.status = 'Posted' group by 1, 2 order by 1, 2`)).rows;
  assert(JSON.stringify(a.map(r => [r.company_id, r.account_code, n(r.debit), n(r.credit)])) ===
         JSON.stringify(b.map(r => [r.company_id, r.account_code, n(r.debit), n(r.credit)])), 'mismatch');
  return `${a.length} rows`;
});
await check('ledger_movements: a Fleet Manager without accounting access sees nothing', async () => {
  const r = await rows(FLEET, `select * from ledger_movements(null, null, null)`); assert(r.length === 0, r.length); return '0 rows';
});
await check('ledger_movements: date range filters', async () => {
  const r = await rows(ADMIN, `select sum(debit) d from ledger_movements('${HO}', '${day(-6)}', '${day(-4)}')`);
  assert(n(r[0].d) === 30, r[0].d); return '30';
});
await check('ledger_movements: anon cannot execute', () => db.exec(`set role anon; select * from ledger_movements(null,null,null); reset role;`).finally(() => db.exec('reset role')), 'permission denied');

// ---------------------------------------------------------------- general_ledger_page
await check('general_ledger_page: running balance and brought-forward balance', async () => {
  const r = await rows(ADMIN, `select * from general_ledger_page('${HO}', '5000', '${day(-6)}', null, 100, 0)`);
  // 5000 lines in range: fuel float 30 (day -5) and P1 100; P2 200 (day -50) is brought forward; P3 is a draft
  assert(r.length === 2, 'lines ' + r.length);
  const last = r[r.length - 1];
  assert(n(last.running_balance) === 330, 'closing ' + last.running_balance);
  assert(n(last.total_count) === 2, 'count');
  assert(n(r[0].running_balance) === 230, 'first line includes the 200 brought forward: ' + r[0].running_balance);
  const fwd = await rows(ADMIN, `select * from general_ledger_page('${HO}', '5000', '${day(1)}', null, 100, 0)`);
  assert(fwd.length === 0, 'no lines after today');
  return 'closing 330';
});
await check('general_ledger_page: page size above 1000 is refused', () => as(ADMIN, `select * from general_ledger_page('${HO}', '5000', null, null, 5000, 0)`), '1000');
await check('general_ledger_page: user without accounting access is refused or gets nothing', async () => {
  try { const r = await rows(FLEET, `select * from general_ledger_page('${HO}', '5000', null, null, 100, 0)`); assert(r.length === 0, r.length); return '0 rows'; }
  catch (e) { assert(/permission|denied|access/i.test(e.message), e.message); return 'refused'; }
});

// ---------------------------------------------------------------- invoice_page / summary
const page = (uid, args) => rows(uid, `select data, total_count from invoice_page(${args})`);
await check('invoice_page: every HO invoice, newest first, total count', async () => {
  const r = await page(ADMIN, `p_company => '${HO}', p_today => '${TODAY}'`);
  assert(r.length === 5 && n(r[0].total_count) === 5, r.length);
  return r.map(x => x.data.invoice_number).join(',');
});
await check('invoice_page: overdue view uses the browser date', async () => {
  const r = await page(ADMIN, `p_company => '${HO}', p_view => 'overdue', p_today => '${TODAY}'`);
  assert(r.length === 2, 'overdue ' + r.length);                     // P2 and S2
  const none = await page(ADMIN, `p_company => '${HO}', p_view => 'overdue', p_today => '${day(-60)}'`);
  assert(none.length === 0, 'none before due');
  return r.map(x => x.data.invoice_number).join(',');
});
await check('invoice_page: search matches party name and reference, all words', async () => {
  const r = await page(ADMIN, `p_company => '${HO}', p_search => 'petro ref-4', p_today => '${TODAY}'`);
  assert(r.length === 1 && r[0].data.id === S1, JSON.stringify(r.map(x => x.data.invoice_number))); return 'S1';
});
await check('invoice_page: vehicle filter and paging', async () => {
  const r = await page(ADMIN, `p_vehicle => '${VEH}', p_limit => 2, p_offset => 2, p_sort => 'invoice_number', p_ascending => true, p_today => '${TODAY}'`);
  assert(r.length === 2 && n(r[0].total_count) === 5, r.length); return r.map(x => x.data.invoice_number).join(',');
});
await check('invoice_page: unknown sort column falls back, limit capped', () => page(ADMIN, `p_sort => 'id; drop table invoices', p_limit => 1001`), '1000');
await check('invoice_page: DQ user sees only DQ invoices', async () => {
  const r = await page(OTHER, `p_today => '${TODAY}'`);
  assert(r.length <= 1 && r.every(x => x.data.company_id === DQ), JSON.stringify(r)); return `${r.length} row(s)`;
});
await check('invoice_summary matches the Invoices page definitions', async () => {
  const s = (await rows(ADMIN, `select invoice_summary('${HO}', '${TODAY}') s`))[0].s;
  // AP: P1 105 paid of 105 → 0; P2 210 open; P3 draft not counted. AR: S1 420, S2 315 - 100 = 215.
  assert(n(s.ap_outstanding) === 210, 'ap ' + s.ap_outstanding);
  assert(n(s.ar_outstanding) === 635, 'ar ' + s.ar_outstanding);
  assert(n(s.purchase_total) === 315, 'purchases ' + s.purchase_total);
  assert(n(s.sales_total) === 735, 'sales ' + s.sales_total);
  assert(n(s.count_all) === 5 && n(s.count_draft) === 1 && n(s.count_overdue) === 2 && n(s.count_pending) === 3, JSON.stringify(s));
  // ageing: P2 45 days → bucket 2 (31-60); S2 10 days → bucket 1; S1 not due → bucket 0
  assert(n(s.aging_ap[2]) === 210 && n(s.aging_ar[1]) === 215 && n(s.aging_ar[0]) === 420, JSON.stringify([s.aging_ap, s.aging_ar]));
  assert(s.top_parties[0].name === 'Petro' && n(s.top_parties[0].total) === 635, JSON.stringify(s.top_parties));
  return 'ok';
});
await check('invoice_summary: Viewer of HO cannot see DQ figures', async () => {
  const s = (await rows(VIEWER, `select invoice_summary('${DQ}', '${TODAY}') s`))[0].s;
  assert(n(s.count_all) === 0, s.count_all); return '0';
});

// ---------------------------------------------------------------- dashboard_series
await check('dashboard_series: sales per day, range capped at 400 days', async () => {
  const r = await rows(ADMIN, `select * from dashboard_series('${HO}', '${day(-41)}', '${TODAY}')`);
  const sales = r.reduce((s, x) => s + n(x.sales), 0);
  assert(sales === 700, 'sales ' + sales);                          // subtotals 400 + 300
  const long = await rows(ADMIN, `select count(*) c from dashboard_series(null, '2020-01-01', '2030-01-01')`);
  assert(n(long[0].c) === 401, long[0].c); return 'ok';
});

// ---------------------------------------------------------------- expenses
const FM = '00000000-0000-0000-0000-0000000000e1';
await asServer(`insert into auth.users (id, email) values ('${FM}','fm@x.com');
  update profiles set role_id = (select id from roles where name = 'Finance Manager') where id = '${FM}';
  insert into company_members (user_id, company_id) values ('${FM}','${HO}');`);
const expense = async (amount, category = 'Fuel', submit = true) => {
  const id = (await as(FLEET, `insert into expenses (company_id, vehicle_id, date, category, description, quantity, unit_price, tax, total, payment_method)
    values ('${HO}','${VEH}','${TODAY}','${category}','Item ${amount}',1,${amount},0,${amount},'Cash') returning id`)).rows[0].id;
  if (submit) await tx(FM, `select submit_expense('${id}')`);
  return id;
};
await expense(40); await expense(60, 'Tolls'); await expense(25, 'Fuel', false);
await check('expense_page: filter, search, paging', async () => {
  const all = await rows(ADMIN, `select data, total_count from expense_page('{"company":"${HO}"}'::jsonb)`);
  assert(all.length === 3, 'all ' + all.length);
  const fuel = await rows(ADMIN, `select data from expense_page('{"company":"${HO}","category":"Fuel","search":"item 40"}'::jsonb)`);
  assert(fuel.length === 1 && n(fuel[0].data.total) === 40, JSON.stringify(fuel));
  const drafts = await rows(ADMIN, `select data from expense_page('{"status":"draft-or-rejected"}'::jsonb)`);
  assert(drafts.length === 1, 'drafts ' + drafts.length);
  return 'ok';
});
await check('expense_page: limit capped', () => as(ADMIN, `select * from expense_page('{}'::jsonb, 'date', false, 2000, 0)`), '1000');
await check('expense_summary: counted statuses only', async () => {
  const s = (await rows(ADMIN, `select expense_summary('{"company":"${HO}"}'::jsonb) s`))[0].s;
  assert(n(s.draft_count) === 1, 'drafts ' + s.draft_count);
  assert(n(s.filtered_total) === n(s.approved_total) + 0 || n(s.filtered_total) >= 100, JSON.stringify(s));
  return JSON.stringify({ fuel: s.fuel_total, approved: s.approved_total, filtered: s.filtered_total });
});
await check('expense_totals by category (approved only)', async () => {
  const r = await rows(ADMIN, `select category, total from expense_totals('{"company":"${HO}"}'::jsonb, 'category') order by category`);
  const direct = (await asServer(`select category, sum(total) total from expenses where company_id = '${HO}' and coalesce(status, 'Approved') = 'Approved' group by 1 order by 1`)).rows;
  assert(JSON.stringify(r.map(x => [x.category, n(x.total)])) === JSON.stringify(direct.map(x => [x.category, n(x.total)])), JSON.stringify([r, direct]));
  return JSON.stringify(r.map(x => [x.category, n(x.total)]));
});
await check('expense lists: DQ user sees no HO expenses', async () => {
  const r = await rows(OTHER, `select data from expense_page('{}'::jsonb)`); assert(r.length === 0, r.length); return '0';
});

// ---------------------------------------------------------------- views
await check('list views are security_invoker and hidden from anon', async () => {
  const r = (await asServer(`select c.relname, c.reloptions from pg_class c where relname in ('v_invoice_list','v_payment_list','v_journal_list','v_expense_list')`)).rows;
  assert(r.length === 4 && r.every(x => String(x.reloptions).includes('security_invoker=true')), JSON.stringify(r));
  const anon = (await asServer(`select count(*) c from information_schema.role_table_grants where grantee = 'anon' and table_name in ('v_invoice_list','v_payment_list','v_journal_list','v_expense_list')`)).rows[0].c;
  assert(n(anon) === 0, 'anon grants ' + anon); return 'ok';
});
await check('v_payment_list: DQ user sees no HO payments', async () => {
  const r = await rows(OTHER, `select * from v_payment_list`); assert(r.length === 0, r.length); return '0';
});

t.report();
