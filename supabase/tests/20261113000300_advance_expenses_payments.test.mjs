// Phase 1 data layer, expenses & payments group: expense_page_figures, payment_totals,
// reconcilable_invoice_page (+ reconciliations_invoice_idx).
// Migration 20261113000300_advance_expenses_payments.sql
// Standalone: node supabase/tests/20261113000300_advance_expenses_payments.test.mjs supabase/migrations
// Each figure is compared with what the page computed in the browser before (same rows, same
// TypeScript rule re-implemented below), as the same user (RLS scope).
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, as, tx, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, FLEET, HO, DQ } = IDS;
const SUP = '33333333-3333-3333-3333-333333333333';
const CUS = '99999999-9999-9999-9999-999999999993';
const BANK = '44444444-4444-4444-4444-444444444444';
const BANK_DQ = '44444444-4444-4444-4444-444444444445';
const VEH = '55555555-5555-5555-5555-555555555555';
const FM = '00000000-0000-0000-0000-0000000000e1';     // Finance Manager in HO
const FM_DQ = '00000000-0000-0000-0000-0000000000e3';  // Finance Manager in DQ
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return ymd(d); };
const TODAY = day(0);
const n = (v) => Number(v);
const rows = async (uid, sql) => (await as(uid, sql)).rows;
const anon = (sql) => db.exec(`set role anon; ${sql}; reset role;`).finally(() => db.exec('reset role'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

await asServer(`
  insert into auth.users (id, email) values ('${FM}','fm@x.com'), ('${FM_DQ}','fmdq@x.com');
  update profiles set role_id = (select id from roles where name = 'Finance Manager') where id in ('${FM}','${FM_DQ}');
  insert into company_members (user_id, company_id) values ('${FM}','${HO}'), ('${FM_DQ}','${DQ}');
  insert into customers (id, customer_code, name, customer_type) values ('${CUS}','CUST-T3','Petro','Corporate');
  insert into bank_accounts (id, company_id, bank_name, account_name, account_number, account_type) values ('${BANK_DQ}','${DQ}','NBO','Duqm ops','002','Current');
  insert into accounts (company_id, code, name, category, subcategory) values
    ('${DQ}','1010','Bank','Asset','Cash'), ('${DQ}','2010','AP','Liability','Payables'), ('${DQ}','1300','Input VAT','Asset','Tax'),
    ('${DQ}','5000','Maintenance','Expense','Direct')
  on conflict (company_id, code) do nothing;
`);

// ---------------------------------------------------------------- invoices and payments
let invSeq = 0;
const invoice = async ({ type = 'Purchase', company = HO, price = 100, post = true, currency = 'OMR', ref } = {}) => {
  const id = `66666666-6666-6666-6666-${String(++invSeq).padStart(12, '0')}`;
  const party = type === 'Purchase' ? `'Supplier', '${SUP}', null` : `'Customer', null, '${CUS}'`;
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id, invoice_date, due_date, reference_number, currency)
      values ('${id}','${company}','T3-${invSeq}','${type}',${party},'${day(-invSeq)}','${day(30)}','${ref ?? `REF-${invSeq}`}','${currency}');
    insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
      values ('${id}', 1, 'Line', 1, ${price}, 5, '${type === 'Purchase' ? '5000' : '4010'}')`);
  if (post) await tx(ADMIN, `select post_invoice('${id}')`);
  return id;
};
const P1 = await invoice({ price: 100, ref: 'TYRES-JAN' });   // 105, paid in full
const P2 = await invoice({ price: 200 });                      // 210, reconciled below
const P3 = await invoice({ price: 50, post: false });          // draft: still reconcilable
const P4 = await invoice({ price: 30, post: false });          // cancelled below
const P5 = await invoice({ price: 40, currency: 'USD' });      // 42 USD
const S1 = await invoice({ type: 'Sales', price: 400 });       // 420
const D1 = await invoice({ price: 70, company: DQ });           // 73.5, other office
await tx(ADMIN, `update invoices set approval_status = 'Cancelled' where id = '${P4}'`);
await tx(ADMIN, `select record_payment('${P1}', 105, '${TODAY}', 'Bank Transfer', '${BANK}')`);
await tx(ADMIN, `select record_payment('${P5}', 20, '${day(-3)}', 'Cheque', '${BANK}', null, 'CHQ-9')`);
await tx(ADMIN, `select record_payment('${S1}', 100, '${day(-10)}', 'Cash', '${BANK}')`);
await tx(ADMIN, `select record_payment('${D1}', 30, '${TODAY}', 'Bank Transfer', '${BANK_DQ}')`);
// record_payment takes the office currency; store one payment in USD to cover per-currency totals
await asServer(`update payments set currency = 'USD' where invoice_id = '${P5}'`);
await tx(ADMIN, `insert into reconciliations (company_id, reconciliation_number, invoice_id, matching_type, purchase_order_amount, invoice_amount, difference_amount, variance_percentage, status)
  values ('${HO}', null, '${P2}', '2-Way', 210, 0, 0, 0, 'Pending Review')`);

// What PaymentsPage computed before: payments visible to the user, page filters, then per currency.
const oldPaymentTotals = async (uid, f = {}) => {
  const ps = await rows(uid, `select p.company_id, p.payment_method, p.bank_account_id, p.payment_date::text d, p.amount, p.currency, i.party_type
    from payments p join invoices i on i.id = p.invoice_id`);
  const keep = ps.filter(p => (!f.company || p.company_id === f.company) && (!f.method || p.payment_method === f.method)
    && (!f.bank || p.bank_account_id === f.bank) && (!f.party_type || p.party_type === f.party_type)
    && (!f.from || p.d >= f.from) && (!f.to || p.d <= f.to));
  const by = (pt) => Object.entries(keep.filter(p => p.party_type === pt).reduce((a, p) => { a[p.currency] = (a[p.currency] ?? 0) + n(p.amount); return a; }, {}))
    .sort((a, b) => a[0].localeCompare(b[0])).map(([c, v]) => `${c}:${v}`).join(',');
  return { disbursed: by('Supplier'), received: by('Customer'), methods: [...new Set(ps.map(p => p.payment_method))].sort().join(',') };
};
const newPaymentTotals = async (uid, f = {}) => {
  const r = (await rows(uid, `select payment_totals('${JSON.stringify(f)}'::jsonb) r`))[0].r;
  const fmt = (xs) => xs.map(x => `${x.currency}:${n(x.total)}`).join(',');
  return { disbursed: fmt(r.disbursed), received: fmt(r.received), methods: r.methods.join(',') };
};

await check('payment_totals: same per-currency totals as the page computed (no filter, admin)', async () => {
  const [a, b] = [await newPaymentTotals(ADMIN), await oldPaymentTotals(ADMIN)];
  assert(same(a, b), JSON.stringify({ a, b }));
  assert(a.disbursed === 'OMR:135,USD:20' && a.received === 'OMR:100', JSON.stringify(a));
  return JSON.stringify(a);
});
for (const [label, f] of [
  ['office', { company: HO }], ['method', { method: 'Cheque' }], ['bank', { bank: BANK }], ['party type', { party_type: 'Customer' }],
  ['date range', { from: day(-5), to: TODAY }], ['all filters', { company: HO, method: 'Bank Transfer', party_type: 'Supplier', from: day(-1) }],
]) {
  await check(`payment_totals: filter by ${label} matches the page`, async () => {
    const [a, b] = [await newPaymentTotals(ADMIN, f), await oldPaymentTotals(ADMIN, f)];
    assert(same(a, b), JSON.stringify({ a, b })); return `${a.disbursed} | ${a.received}`;
  });
}
await check('payment_totals: an HO Finance Manager sees no DQ payments', async () => {
  const [a, b] = [await newPaymentTotals(FM), await oldPaymentTotals(FM)];
  assert(same(a, b) && a.disbursed === 'OMR:105,USD:20', JSON.stringify({ a, b })); return a.disbursed;
});
await check('payment_totals: a DQ Finance Manager sees only DQ payments', async () => {
  const a = await newPaymentTotals(FM_DQ);
  assert(a.disbursed === 'OMR:30' && a.received === '' && a.methods === 'Bank Transfer', JSON.stringify(a)); return a.disbursed;
});
await check('payment_totals: anon cannot execute', () => anon(`select payment_totals('{}'::jsonb)`), 'permission denied');

// ---------------------------------------------------------------- reconcilable invoices
const pick = async (uid, company = null, search = null, limit = 50) =>
  rows(uid, `select data, total_count from reconcilable_invoice_page(${company ? `'${company}'` : 'null'}, ${search ? `'${search}'` : 'null'}, ${limit}, 0)`);
await check('reconcilable_invoice_page: same invoices as the page filter (purchase, not cancelled, not reconciled)', async () => {
  const got = (await pick(ADMIN, HO)).map(r => r.data.id).sort();
  // old rule, over every invoice the user can see
  const inv = await rows(ADMIN, `select id, invoice_type, is_credit_note, payment_status, approval_status, company_id from invoices`);
  const rec = new Set((await rows(ADMIN, `select invoice_id from reconciliations`)).map(r => r.invoice_id));
  const want = inv.filter(i => i.invoice_type === 'Purchase' && !i.is_credit_note && !rec.has(i.id) && i.payment_status !== 'Cancelled'
    && i.approval_status !== 'Cancelled' && i.company_id === HO).map(i => i.id).sort();
  assert(same(got, want), JSON.stringify({ got, want }));
  assert(!got.includes(P2) && !got.includes(P4) && got.includes(P3) && got.includes(P1) && !got.includes(S1), 'rule');
  return `${got.length} invoices`;
});
await check('reconcilable_invoice_page: search words and total count', async () => {
  const r = await pick(ADMIN, null, 'tyres jan');
  assert(r.length === 1 && r[0].data.id === P1 && n(r[0].total_count) === 1, JSON.stringify(r.map(x => x.data.invoice_number)));
  const lim = await pick(ADMIN, null, null, 1);
  assert(lim.length === 1 && n(lim[0].total_count) === 4, 'total ' + (lim[0] && lim[0].total_count));
  return 'ok';
});
await check('reconcilable_invoice_page: an HO user sees no DQ invoices', async () => {
  const r = (await pick(FM)).map(x => x.data.id);
  assert(r.length > 0 && !r.includes(D1), JSON.stringify(r)); return `${r.length} HO invoices`;
});
await check('reconcilable_invoice_page: page size above 1000 is refused', () => as(ADMIN, `select * from reconcilable_invoice_page(null, null, 2000, 0)`), '1000');
await check('reconcilable_invoice_page: anon cannot execute', () => anon(`select * from reconcilable_invoice_page(null, null, 10, 0)`), 'permission denied');
await check('reconciliations_invoice_idx exists', async () => {
  const r = (await asServer(`select 1 from pg_indexes where indexname = 'reconciliations_invoice_idx'`)).rows;
  assert(r.length === 1, 'missing'); return 'present';
});

// ---------------------------------------------------------------- expense page figures
const expense = async (uid, company, amount, category, submitAs, extra = {}) => {
  const cols = { company_id: `'${company}'`, date: `'${TODAY}'`, category: `'${category}'`, description: `'Item ${amount}'`,
    quantity: 1, unit_price: amount, tax: 0, total: amount, payment_method: `'Cash'`, ...extra };
  const id = (await as(uid, `insert into expenses (${Object.keys(cols).join(',')}) values (${Object.values(cols).join(',')}) returning id`)).rows[0].id;
  if (submitAs) await tx(submitAs, `select submit_expense('${id}')`);
  return id;
};
await expense(FLEET, HO, 40, 'Fuel', FM, { vehicle_id: `'${VEH}'` });              // approved, unpaid
await expense(FLEET, HO, 60, 'Tolls', FM, { vehicle_id: `'${VEH}'` });             // approved, unpaid
await expense(FLEET, HO, 25, 'Fuel', null, { vehicle_id: `'${VEH}'` });            // draft
await expense(FLEET, HO, 800, 'Fuel', FLEET, { vehicle_id: `'${VEH}'` });          // above the limit: pending
await expense(FLEET, HO, 15, 'Parking', FM, { bank_account_id: `'${BANK}'` });    // approved and paid
await expense(FM_DQ, DQ, 90, 'Hotel', FM_DQ, { bank_account_id: `'${BANK_DQ}'` }); // other office

// What ExpensesPage computed before, over the expenses visible to the user.
const oldExpenseFigures = async (uid, f = {}) => {
  const xs = await rows(uid, `select company_id, category, status, payment_status, total, vehicle_id, date::text d, attachment_path from expenses`);
  const inOffice = xs.filter(e => !f.company || e.company_id === f.company);
  const filtered = inOffice.filter(e => (!f.category || e.category === f.category)
    && (!f.status || (f.status === 'unpaid' ? e.status === 'Approved' && e.payment_status === 'Unpaid' : e.status === f.status))
    && (!f.vehicle || e.vehicle_id === f.vehicle) && (!f.from || e.d >= f.from) && (!f.to || e.d <= f.to)
    && (f.receipt !== 'with-receipt' || !!e.attachment_path) && (f.receipt !== 'no-receipt' || !e.attachment_path));
  const sum = (rs) => rs.reduce((s, e) => s + n(e.total), 0);
  return {
    pending_total: sum(inOffice.filter(e => e.status === 'Pending Approval')),
    unpaid_total: sum(inOffice.filter(e => e.status === 'Approved' && e.payment_status === 'Unpaid')),
    filtered_count: filtered.length,
    categories: [...new Set(xs.map(e => e.category))].sort().join(','),
  };
};
const newExpenseFigures = async (uid, f = {}) => {
  const r = (await rows(uid, `select expense_page_figures('${JSON.stringify(f)}'::jsonb) r`))[0].r;
  return { pending_total: n(r.pending_total), unpaid_total: n(r.unpaid_total), filtered_count: n(r.filtered_count), categories: r.categories.join(',') };
};
for (const [label, uid, f] of [
  ['admin, all offices', ADMIN, {}], ['admin, HO', ADMIN, { company: HO }], ['HO, Fuel', ADMIN, { company: HO, category: 'Fuel' }],
  ['HO, approved not paid', ADMIN, { company: HO, status: 'unpaid' }], ['HO, drafts', ADMIN, { company: HO, status: 'Draft' }],
  ['HO, vehicle and dates', ADMIN, { company: HO, vehicle: VEH, from: day(-1), to: TODAY }], ['HO, no receipt', ADMIN, { company: HO, receipt: 'no-receipt' }],
  ['HO Finance Manager', FM, {}],
]) {
  await check(`expense_page_figures: ${label} matches the page`, async () => {
    const [a, b] = [await newExpenseFigures(uid, f), await oldExpenseFigures(uid, f)];
    assert(same(a, b), JSON.stringify({ a, b })); return JSON.stringify(a);
  });
}
await check('expense_page_figures: known values for HO', async () => {
  const a = await newExpenseFigures(ADMIN, { company: HO });
  assert(a.pending_total === 800 && a.unpaid_total === 100 && a.filtered_count === 5, JSON.stringify(a)); return 'pending 800, unpaid 100';
});
await check('expense_page_figures: an HO user sees no DQ expenses or categories', async () => {
  const a = await newExpenseFigures(FM);
  assert(!a.categories.includes('Hotel') && a.filtered_count === 5, JSON.stringify(a)); return a.categories;
});
await check('expense_page_figures: a DQ user sees only DQ figures', async () => {
  const a = await newExpenseFigures(FM_DQ);
  assert(a.categories === 'Hotel' && a.filtered_count === 1 && a.pending_total === 0, JSON.stringify(a)); return a.categories;
});
await check('expense_page_figures: anon cannot execute', () => anon(`select expense_page_figures('{}'::jsonb)`), 'permission denied');

// custom field filter (the `cf` key) through expense_page, as the Expenses page now sends it
await check('expense_page cf filter matches the browser custom field filter', async () => {
  await asServer(`insert into field_definitions (entity, key, label, field_type) values ('expense', 'trip', 'Trip', 'text'), ('expense', 'km', 'Km', 'number')`);
  await asServer(`update expenses set custom_fields = '{"trip":"Muscat run","km":120}' where total = 40;
                  update expenses set custom_fields = '{"trip":"Sohar","km":"80"}' where total = 60`);
  const totals = async (cf) => (await rows(ADMIN, `select data->>'total' t from expense_page('${JSON.stringify({ company: HO, cf })}'::jsonb)`))
    .map(r => n(r.t)).sort((a, b) => a - b).join(',');
  const text = await totals({ key: 'trip', type: 'text', value: 'MUSCAT' });
  const num = await totals({ key: 'km', type: 'number', value: '100', to: '' });
  const rng = await totals({ key: 'km', type: 'number', value: '50', to: '100' });
  assert(text === '40' && num === '40' && rng === '60', JSON.stringify({ text, num, rng }));
  return JSON.stringify({ text, num, rng });
});

t.report();
