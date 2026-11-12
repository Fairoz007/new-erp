// Reports data layer: party_statement, vehicle_financial_totals, invoice_tax_by_month.
// Migration 20261113000200_advance_reports.sql
// Each figure is compared with a port of the TypeScript it replaces, run on the same rows.
// Standalone: node supabase/tests/20261113000200_advance_reports.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', {
  quiet: true,
  // REPORTS_ONLY=1 skips the other Phase 1 migrations (useful while they are being written)
  order: process.env.REPORTS_ONLY ? (fs) => fs.filter(f => f <= '20261113000000_advance_data_layer.sql' || f === '20261113000200_advance_reports.sql') : undefined,
});
const { db, check, as, tx, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET, OTHER, HO, DQ } = IDS;
const SUP = '33333333-3333-3333-3333-333333333333';
const CUS = '99999999-9999-9999-9999-999999999991';
const BANK = '44444444-4444-4444-4444-444444444444';
const VEH = '55555555-5555-5555-5555-555555555555';
const VEH2 = '55555555-5555-5555-5555-555555555556';
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return ymd(d); };
const TODAY = day(0);
const n = (v) => Number(v);
const r3 = (x) => Math.round(x * 1000) / 1000;
const rows = async (uid, sql) => (await as(uid, sql)).rows;
const denied = (sql) => db.exec(`set role anon; ${sql}; reset role;`).finally(() => db.exec('reset role'));
const FMD = '00000000-0000-0000-0000-0000000000e2';   // Finance Manager in DQ only

await asServer(`insert into auth.users (id, email) values ('${FMD}','fmd@x.com');
  update profiles set role_id = (select id from roles where name = 'Finance Manager') where id = '${FMD}';
  insert into company_members (user_id, company_id) values ('${FMD}','${DQ}');`);
await asServer(`
  insert into public.customers (id, customer_code, name, customer_type, opening_balance) values ('${CUS}','CUST-T1','Petro','Corporate', 40);
  update public.suppliers set opening_balance = 25 where id = '${SUP}';
  insert into public.vehicles (id, company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
    values ('${VEH2}','${DQ}','VH-002','9999 ZZ','SUV','Operations','Nissan','Patrol','Diesel','Automatic');
  insert into public.accounts (company_id, code, name, category, subcategory) values
    ('${HO}','4010','Rental','Revenue','Operating'), ('${DQ}','5000','Maintenance','Expense','Direct'), ('${DQ}','2010','AP','Liability','Payables'),
    ('${DQ}','1300','Input VAT','Asset','Tax'), ('${DQ}','1010','Bank','Asset','Cash')
  on conflict (company_id, code) do nothing;
`);

let invSeq = 0;
const invoice = async ({ type = 'Purchase', company = HO, date = TODAY, due = day(30), price = 100, post = true, vehicle = VEH, notes = null } = {}) => {
  const id = `66666666-6666-6666-6666-${String(++invSeq).padStart(12, '0')}`;
  const party = type === 'Purchase' ? `'Supplier', '${SUP}', null` : `'Customer', null, '${CUS}'`;
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id, invoice_date, due_date, vehicle_id, notes)
      values ('${id}','${company}','T-${String(invSeq).padStart(3, '0')}','${type}',${party},'${date}','${due}', ${vehicle ? `'${vehicle}'` : 'null'}, ${notes ? `'${notes}'` : 'null'});
    insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
      values ('${id}', 1, 'Line', 1, ${price}, 5, '${type === 'Purchase' ? '5000' : '4010'}')`);
  if (post) await tx(ADMIN, `select post_invoice('${id}')`);
  return id;
};
// Supplier: P1 (day -20), P2 (day -5), P3 draft, DQ bill; a credit note on P2; payment on P1.
const P1 = await invoice({ price: 100, date: day(-20) });
const P2 = await invoice({ price: 200, date: day(-5), notes: 'Engine work' });
await invoice({ price: 50, post: false });
await invoice({ price: 70, company: DQ, vehicle: VEH2 });
await tx(ADMIN, `select create_credit_note('${P2}', 'Overcharge', 21)`);
await tx(ADMIN, `select record_payment('${P1}', 60, '${day(-1)}', 'Bank Transfer', '${BANK}')`);
// Customer: S1 (day -30), S2 (today), a credit note on S1, a receipt on S1; sales on the vehicle.
const S1 = await invoice({ type: 'Sales', price: 400, date: day(-30) });
await invoice({ type: 'Sales', price: 300 });
await invoice({ type: 'Sales', price: 80, vehicle: null });
await tx(ADMIN, `select create_credit_note('${S1}', 'Discount', 42)`);
await tx(ADMIN, `select record_payment('${S1}', 100, '${day(-2)}', 'Cash', '${BANK}')`);

// Raw rows (as the browser used to load them) for the TypeScript ports
const raw = async () => ({
  invoices: (await asServer(`select i.*, (select count(*) from invoice_lines l where l.invoice_id = i.id)::int line_count from invoices i`)).rows.map(r => ({
    id: r.id, companyId: r.company_id, invoiceNumber: r.invoice_number, invoiceType: r.invoice_type, partyType: r.party_type,
    partyId: r.supplier_id ?? r.customer_id, approvalStatus: r.approval_status, paymentStatus: r.payment_status,
    isCreditNote: r.is_credit_note, isDebitNote: r.is_debit_note, invoiceDate: ymd(new Date(r.invoice_date)), createdAt: new Date(r.created_at).toISOString(),
    grandTotal: (r.is_credit_note ? -1 : 1) * n(r.grand_total), taxTotal: (r.is_credit_note ? -1 : 1) * n(r.tax_total),
    notes: r.notes ?? '', items: Array.from({ length: r.line_count }), vehicleId: r.vehicle_id,
  })),
  payments: (await asServer(`select p.*, i.invoice_type, i.party_type, i.supplier_id, i.customer_id, i.invoice_number from payments p join invoices i on i.id = p.invoice_id`)).rows.map(r => ({
    id: r.id, companyId: r.company_id, paymentNumber: r.payment_number, paymentDate: ymd(new Date(r.payment_date)), createdAt: new Date(r.created_at).toISOString(),
    amount: n(r.amount), invoiceType: r.invoice_type, partyType: r.party_type, partyId: r.supplier_id ?? r.customer_id,
    invoiceNumber: r.invoice_number, paymentMethod: r.payment_method, notes: r.notes ?? '',
  })),
});

// Port of finance.getPartyLedger (src/services/finance.ts)
const oldLedger = (partyId, partyType, invoices, payments, openingBalance, companyId) => {
  const supplier = partyType === 'Supplier';
  const docs = invoices.filter(i => i.partyId === partyId && i.partyType === partyType && (!companyId || i.companyId === companyId)
    && i.approvalStatus === 'Approved' && i.paymentStatus !== 'Cancelled');
  const pays = payments.filter(p => p.partyId === partyId && p.partyType === partyType && (!companyId || p.companyId === companyId));
  const events = [
    ...docs.map(i => { const amt = Math.abs(i.grandTotal); const cn = !!i.isCreditNote;
      return { date: i.invoiceDate, created: i.createdAt, delta: cn ? -amt : amt, ref: i.invoiceNumber,
        debit: supplier ? (cn ? amt : 0) : (cn ? 0 : amt), credit: supplier ? (cn ? 0 : amt) : (cn ? amt : 0),
        description: i.notes || `${i.invoiceType} ${cn ? 'credit note' : 'invoice'} (${i.items.length} line${i.items.length === 1 ? '' : 's'})` }; }),
    ...pays.map(p => ({ date: p.paymentDate, created: p.createdAt, delta: -p.amount, ref: p.paymentNumber,
      debit: supplier ? p.amount : 0, credit: supplier ? 0 : p.amount, description: p.notes || `${supplier ? 'Payment' : 'Collection'} via ${p.paymentMethod}` })),
  ].sort((a, b) => a.date.localeCompare(b.date) || String(a.created).localeCompare(String(b.created)));
  let running = openingBalance, totalDebit = 0, totalCredit = 0;
  const lines = events.map(ev => { running += ev.delta; totalDebit += ev.debit; totalCredit += ev.credit; return { ...ev, runningBalance: r3(running) }; });
  return { openingBalance, lines, totalDebit: r3(totalDebit), totalCredit: r3(totalCredit), closingBalance: r3(running) };
};
// Port of the Client / Supplier Statement report (src/pages/reports/extraReports.tsx)
const oldStatement = (kind, partyId, invoices, payments, f) => {
  const type = kind === 'Customer' ? 'Sales' : 'Purchase';
  const inv = invoices.filter(i => i.partyId === partyId && i.invoiceType === type && i.approvalStatus === 'Approved' && (f.office === 'all' || i.companyId === f.office));
  const pay = payments.filter(p => p.partyId === partyId && p.invoiceType === type && (f.office === 'all' || p.companyId === f.office));
  const moves = [
    ...inv.map(i => ({ date: i.invoiceDate, ref: i.invoiceNumber, detail: i.isCreditNote ? 'Credit note' : i.isDebitNote ? 'Debit note' : 'Invoice', charge: i.isCreditNote ? 0 : Math.abs(i.grandTotal), credit: i.isCreditNote ? Math.abs(i.grandTotal) : 0 })),
    ...pay.map(p => ({ date: p.paymentDate, ref: p.paymentNumber, detail: `Payment · ${p.invoiceNumber}`, charge: 0, credit: p.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  const open = moves.filter(m => f.from && m.date < f.from).reduce((s, m) => s + m.charge - m.credit, 0);
  let bal = open;
  const out = moves.filter(m => (!f.from || m.date >= f.from) && (!f.to || m.date <= f.to)).map(m => { bal += m.charge - m.credit; return { ...m, balance: r3(bal) }; });
  return { opening: open, rows: out };
};
const stmt = async (uid, args) => (await rows(uid, `select party_statement(${args}) s`))[0].s;

// ---------------------------------------------------------------- party_statement: ledger style
await check('party_statement (ledger) equals getPartyLedger for the supplier, all offices', async () => {
  const { invoices, payments } = await raw();
  const old = oldLedger(SUP, 'Supplier', invoices, payments, 25);
  const s = await stmt(ADMIN, `'${SUP}', 'Supplier', null, null, null, 'ledger', 1000, 0`);
  assert(n(s.opening_balance) === 25, 'opening ' + s.opening_balance);
  assert(n(s.closing_balance) === old.closingBalance, `closing ${s.closing_balance} vs ${old.closingBalance}`);
  assert(n(s.total_count) === old.lines.length && s.lines.length === old.lines.length, 'count');
  const a = s.lines.map(l => [l.reference, n(l.running_balance)]);
  const b = old.lines.map(l => [l.ref, l.runningBalance]);
  assert(JSON.stringify(a) === JSON.stringify(b), JSON.stringify([a, b]));
  // supplier: charge = credit column, credit = debit column
  const td = r3(n(s.total_credit)), tc = r3(n(s.total_charge));
  assert(td === old.totalDebit && tc === old.totalCredit, JSON.stringify([td, tc, old.totalDebit, old.totalCredit]));
  const p2 = s.lines.find(l => l.reference === 'T-002');
  assert(p2.notes === 'Engine work' && s.lines.find(l => l.reference === 'T-001').line_count === 1, 'description inputs');
  return `closing ${old.closingBalance}, ${old.lines.length} lines`;
});
await check('party_statement (ledger) equals getPartyLedger for the client, one office', async () => {
  const { invoices, payments } = await raw();
  const old = oldLedger(CUS, 'Customer', invoices, payments, 40, HO);
  const s = await stmt(ADMIN, `'${CUS}', 'Customer', '${HO}', null, null, 'ledger', 1000, 0`);
  assert(n(s.closing_balance) === old.closingBalance, `closing ${s.closing_balance} vs ${old.closingBalance}`);
  assert(JSON.stringify(s.lines.map(l => n(l.running_balance))) === JSON.stringify(old.lines.map(l => l.runningBalance)), 'running');
  assert(r3(n(s.total_charge)) === old.totalDebit && r3(n(s.total_credit)) === old.totalCredit, 'totals');
  return `closing ${old.closingBalance}`;
});
await check('party_statement: paging keeps running balance and totals of the whole range', async () => {
  const all = await stmt(ADMIN, `'${SUP}', 'Supplier', null, null, null, 'ledger', 1000, 0`);
  const p2 = await stmt(ADMIN, `'${SUP}', 'Supplier', null, null, null, 'ledger', 2, 2`);
  assert(p2.lines.length === Math.min(2, all.lines.length - 2), 'page size');
  assert(JSON.stringify(p2.lines) === JSON.stringify(all.lines.slice(2, 4)), 'page 2 = lines 3-4');
  assert(n(p2.closing_balance) === n(all.closing_balance) && n(p2.total_count) === n(all.total_count), 'totals');
  return `${p2.lines.length} lines on page 2`;
});
await check('party_statement: page size above 1000 is refused', () => as(ADMIN, `select party_statement('${SUP}', 'Supplier', null, null, null, 'ledger', 1001, 0)`), '1000');

// ---------------------------------------------------------------- party_statement: statement style
for (const [kind, party] of [['Supplier', SUP], ['Customer', CUS]]) {
  for (const f of [{ office: 'all', from: '', to: '' }, { office: HO, from: day(-10), to: day(-1) }, { office: 'all', from: day(-3), to: TODAY }]) {
    await check(`party_statement (statement) equals the ${kind} Statement report ${JSON.stringify({ ...f, office: f.office === 'all' ? 'all' : 'HO' })}`, async () => {
      const { invoices, payments } = await raw();
      const old = oldStatement(kind, party, invoices, payments, f);
      const s = await stmt(ADMIN, `'${party}', '${kind}', ${f.office === 'all' ? 'null' : `'${f.office}'`}, ${f.from ? `'${f.from}'` : 'null'}, ${f.to ? `'${f.to}'` : 'null'}, 'statement', 1000, 0`);
      assert(r3(n(s.opening_balance)) === r3(old.opening), `opening ${s.opening_balance} vs ${old.opening}`);
      const closing = old.rows.length ? old.rows[old.rows.length - 1].balance : r3(old.opening);
      assert(n(s.closing_balance) === closing, `closing ${s.closing_balance} vs ${closing}`);
      const a = s.lines.map(l => [l.reference, n(l.charge), n(l.credit), n(l.running_balance)]);
      const b = old.rows.map(m => [m.ref, m.charge, m.credit, m.balance]);
      assert(JSON.stringify(a) === JSON.stringify(b), JSON.stringify([a, b]));
      return `opening ${r3(old.opening)}, closing ${closing}, ${b.length} lines`;
    });
  }
}
await check('party_statement: the statement style ignores the party opening balance', async () => {
  const s = await stmt(ADMIN, `'${SUP}', 'Supplier', null, null, null, 'statement', 1000, 0`);
  assert(n(s.opening_balance) === 0, s.opening_balance); return '0';
});
await check('party_statement: a DQ finance user sees only the DQ bill of the supplier', async () => {
  const s = await stmt(FMD, `'${SUP}', 'Supplier', null, null, null, 'statement', 1000, 0`);
  assert(s.lines.length === 1 && s.lines.every(l => l.reference === 'T-004'), JSON.stringify(s.lines)); return `${s.lines.length} line(s)`;
});
await check('party_statement: an HO viewer asking for DQ gets nothing', async () => {
  const s = await stmt(VIEWER, `'${SUP}', 'Supplier', '${DQ}', null, null, 'statement', 1000, 0`);
  assert(s.lines.length === 0 && n(s.closing_balance) === 0, JSON.stringify(s)); return '0 lines';
});
await check('party_statement: anon cannot execute', () => denied(`select party_statement('${SUP}', 'Supplier')`), 'permission denied');

// ---------------------------------------------------------------- vehicle_financial_totals
const VEH_EXPENSES = [[40, 'Insurance'], [15, 'Registration'], [30, 'Fuel'], [20, 'Maintenance'], [10, 'Tolls']];
for (const [amount, category] of VEH_EXPENSES) {
  await asServer(`insert into expenses (company_id, vehicle_id, date, category, description, quantity, unit_price, tax, total, payment_method, status)
    values ('${HO}','${VEH}','${TODAY}','${category}','x',1,${amount},0,${amount},'Cash','Approved')`);
}
await asServer(`insert into expenses (company_id, vehicle_id, date, category, description, quantity, unit_price, tax, total, payment_method, status)
  values ('${HO}','${VEH}','${TODAY}','Fuel','draft',1,99,0,99,'Cash','Draft'), ('${DQ}','${VEH2}','${TODAY}','Fuel','dq',1,12,0,12,'Cash','Approved')`);
const oldVehicle = async (vid) => {
  const ex = (await asServer(`select category, total, status from expenses where vehicle_id = '${vid}'`)).rows
    .filter(e => (e.status ?? 'Approved') === 'Approved').map(e => ({ category: e.category, total: n(e.total) }));
  const sum = (l) => l.reduce((s, e) => s + e.total, 0);
  const { invoices } = await raw();
  return {
    insurance: sum(ex.filter(e => e.category === 'Insurance')), registration: sum(ex.filter(e => e.category === 'Registration')),
    other: sum(ex.filter(e => !['Insurance', 'Registration', 'Maintenance', 'Oil', 'Tyres', 'Accident'].includes(e.category))),
    expense_total: sum(ex),
    revenue: r3(invoices.filter(i => i.invoiceType === 'Sales' && i.vehicleId === vid && i.approvalStatus === 'Approved')
      .reduce((s, i) => s + (i.isCreditNote ? -Math.abs(i.grandTotal) : i.grandTotal), 0)),
  };
};
await check('vehicle_financial_totals equals getVehicleFinancialSummary inputs', async () => {
  const r = (await rows(ADMIN, `select * from vehicle_financial_totals(null, '${VEH}')`))[0];
  const o = await oldVehicle(VEH);
  const got = { insurance: n(r.insurance), registration: n(r.registration), other: n(r.other), expense_total: n(r.expense_total), revenue: n(r.revenue) };
  assert(JSON.stringify(got) === JSON.stringify(o), JSON.stringify([got, o]));
  return JSON.stringify(got);
});
await check('vehicle_financial_totals: every vehicle in one call, one row each', async () => {
  const r = await rows(ADMIN, `select * from vehicle_financial_totals()`);
  assert(r.length === 2 && n(r[0].total_count) === 2, r.length);
  const dq = r.find(x => x.vehicle_id === VEH2);
  assert(n(dq.expense_total) === 12 && n(dq.revenue) === 0, JSON.stringify(dq));
  const ho = await rows(ADMIN, `select * from vehicle_financial_totals('${HO}')`);
  assert(ho.length === 1 && ho[0].vehicle_id === VEH, 'office filter'); return 'ok';
});
await check('vehicle_financial_totals: DQ user sees no HO vehicle', async () => {
  const r = await rows(OTHER, `select * from vehicle_financial_totals()`);
  assert(r.every(x => x.vehicle_id !== VEH), JSON.stringify(r)); return `${r.length} row(s)`;
});
await check('vehicle_financial_totals: page size above 1000 is refused', () => as(ADMIN, `select * from vehicle_financial_totals(null, null, 5000, 0)`), '1000');
await check('vehicle_financial_totals: anon cannot execute', () => denied(`select * from vehicle_financial_totals()`), 'permission denied');

// ---------------------------------------------------------------- invoice_tax_by_month
const oldTax = (invoices, f) => {
  const inRange = (d) => !!d && (!f.from || d >= f.from) && (!f.to || d <= f.to);
  const m = new Map();
  invoices.filter(i => (f.office === 'all' || i.companyId === f.office) && inRange(i.invoiceDate) && i.paymentStatus !== 'Cancelled'
    && i.approvalStatus !== 'Draft' && i.approvalStatus !== 'Rejected' && i.approvalStatus !== 'Cancelled').forEach(i => {
    const key = i.invoiceDate.slice(0, 7);
    const row = m.get(key) ?? { month: key, outputTax: 0, inputTax: 0 };
    const signed = i.isCreditNote ? -Math.abs(i.taxTotal) : i.taxTotal;
    if (i.invoiceType === 'Sales') row.outputTax += signed; else row.inputTax += signed;
    m.set(key, row);
  });
  return [...m.values()].sort((a, b) => b.month.localeCompare(a.month)).map(r => [r.month, r3(r.outputTax), r3(r.inputTax)]);
};
for (const f of [{ office: 'all', from: '', to: '' }, { office: HO, from: day(-25), to: TODAY }]) {
  await check(`invoice_tax_by_month equals the VAT report ${f.office === 'all' ? 'all offices' : 'HO, last 25 days'}`, async () => {
    const { invoices } = await raw();
    const r = await rows(ADMIN, `select * from invoice_tax_by_month(${f.office === 'all' ? 'null' : `'${f.office}'`}, ${f.from ? `'${f.from}'` : 'null'}, ${f.to ? `'${f.to}'` : 'null'}) order by month desc`);
    const a = r.map(x => [x.month, r3(n(x.output_tax)), r3(n(x.input_tax))]);
    const b = oldTax(invoices, f);
    assert(JSON.stringify(a) === JSON.stringify(b), JSON.stringify([a, b]));
    return JSON.stringify(a);
  });
}
await check('invoice_tax_by_month: a DQ finance user sees only DQ tax', async () => {
  const r = await rows(FMD, `select sum(input_tax) i, sum(output_tax) o from invoice_tax_by_month()`);
  assert(n(r[0].i) === 3.5 && n(r[0].o) === 0, JSON.stringify(r)); return 'input 3.5';
});
await check('invoice_tax_by_month: anon cannot execute', () => denied(`select * from invoice_tax_by_month()`), 'permission denied');

await check('audit history index exists', async () => {
  const r = await asServer(`select 1 from pg_indexes where indexname = 'audit_logs_entity_id_time_idx'`);
  assert(r.rows.length === 1, 'missing'); return 'present';
});

t.report();
