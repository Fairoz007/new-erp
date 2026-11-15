// Upgrade stage 9: sales invoice numbers {n}-FT-{yyyy}, one series for the whole company
// (migration 20261115000100_invoice_number_pattern.sql). The old system's last number is 446-FT-2026.
import { setup, seedFixtures, IDS } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, as, tx, asServer, assert } = t;
await seedFixtures(t.db);
const { ADMIN, OTHER, HO, DQ } = IDS;
const CUS = '99999999-9999-9999-9999-999999999993';
const SUP = '33333333-3333-3333-3333-333333333333';
await asServer(`insert into customers (id, customer_code, name, customer_type) values ('${CUS}','CUST-N1','Sample Customer','Corporate')`);

let seq = 0;
const nextId = () => `88888888-8888-8888-8888-${String(++seq).padStart(12, '0')}`;
const sale = async (company, date, number = null, uid = ADMIN) => {
  const id = nextId();
  await tx(uid, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, customer_id, invoice_date, due_date)
    values ('${id}','${company}', ${number ? `'${number}'` : 'null'}, 'Sales','Customer','${CUS}','${date}', date '${date}' + 30)`);
  return (await asServer(`select invoice_number n from invoices where id = '${id}'`)).rows[0].n;
};
const year = new Date().getFullYear();

await check('the sales invoice format is {n}-FT-{yyyy}, organization-wide, starting after 446 in 2026', async () => {
  const f = (await asServer(`select pattern, scope, padding from document_formats where doc_type = 'sales_invoice'`)).rows[0];
  const s = (await asServer(`select last_value from global_doc_sequences where prefix = '{n}-FT-2026'`)).rows[0];
  assert(f.pattern === '{n}-FT-{yyyy}' && f.scope === 'organization' && f.padding === 1, JSON.stringify(f));
  assert(s?.last_value === 446, JSON.stringify(s));
  return `${f.pattern}, last 446`;
});

await check('the preview shows 447-FT-2026 before the first invoice (2026)', async () => {
  if (year !== 2026) return `today is ${year}: preview is for ${year} (skipped)`;
  const p = (await as(ADMIN, `select preview_doc_number('sales_invoice', '${HO}') n`)).rows[0].n;
  assert(p === '447-FT-2026', p); return p;
});

await check('after 446 the next invoice is 447-FT-2026', async () => {
  const n = await sale(HO, '2026-11-15');
  assert(n === '447-FT-2026', n); return n;
});

await check('the series is shared by every office', async () => {
  const n = await sale(DQ, '2026-11-16');
  assert(n === '448-FT-2026', n); return `Duqm: ${n}`;
});

await check('the year of the invoice date sets the suffix (a new year starts its own series)', async () => {
  const a = await sale(HO, '2027-01-04');
  const b = await sale(HO, '2027-01-05');
  const c = await sale(HO, '2026-12-31');
  assert(a === '1-FT-2027' && b === '2-FT-2027' && c === '449-FT-2026', `${a} ${b} ${c}`);
  return `${a}, ${b}; 2026 continues: ${c}`;
});

await check('two invoices saved at the same moment get different numbers', async () => {
  const ids = [nextId(), nextId()];
  // one statement, two rows: both go through the sequence row lock in the same instant
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, customer_id, invoice_date, due_date) values
    ('${ids[0]}','${HO}', null, 'Sales','Customer','${CUS}','2026-11-17','2026-12-17'),
    ('${ids[1]}','${DQ}', null, 'Sales','Customer','${CUS}','2026-11-17','2026-12-17')`);
  const r = (await asServer(`select invoice_number n from invoices where id in ('${ids[0]}','${ids[1]}') order by 1`)).rows.map(x => x.n);
  assert(r.length === 2 && r[0] !== r[1] && r.includes('450-FT-2026') && r.includes('451-FT-2026'), r.join(' '));
  const lock = (await asServer(`select pg_get_functiondef('public._assign_pattern_number'::regproc) d`)).rows[0].d;
  assert(/on conflict \(prefix\) do update/.test(lock), 'series is not a locked row');
  return r.join(', ') + ' (row lock on the series)';
});

await check('a save that fails gives its number back: no gaps', async () => {
  try {
    await tx(ADMIN, `insert into invoices (company_id, invoice_number, invoice_type, party_type, customer_id, invoice_date, due_date)
      values ('${HO}', null, 'Sales','Customer','${CUS}','2026-11-18','2026-11-01')`);   // due before invoice date: refused
  } catch { /* expected */ }
  const n = await sale(HO, '2026-11-18');
  assert(n === '452-FT-2026', n); return `next is still ${n}`;
});

await check('a number typed for an imported invoice is kept and moves the series past it', async () => {
  const a = await sale(HO, '2026-11-19', '460-FT-2026');
  const b = await sale(HO, '2026-11-19');
  const c = await sale(HO, '2026-11-19', 'OLD-77');
  assert(a === '460-FT-2026' && b === '461-FT-2026' && c === 'OLD-77', `${a} ${b} ${c}`);
  return `${a} then ${b}; other text kept as typed`;
});

await check('other document types are unchanged (credit notes, purchase bills, payments, vehicles)', async () => {
  const p = async (type, company) => (await asServer(`select preview_doc_number('${type}', '${company}') n`)).rows[0].n;
  const y = String(year);
  const r = { cn: await p('credit_note', HO), pinv: await p('purchase_invoice', DQ), pay: await p('payment', HO), veh: await p('vehicle', HO) };
  assert(r.cn === `CN-HO-${y}-0001` && r.pinv === `PINV-DQ-${y}-0001` && r.pay === `PAY-HO-${y}-0001` && /^VH-HO-\d{3}$/.test(r.veh), JSON.stringify(r));
  const id = nextId();
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, reference_number)
    values ('${id}','${HO}', null, 'Purchase','Supplier','${SUP}','2026-11-15','2026-12-15','BILL-1')`);
  const n = (await asServer(`select invoice_number n from invoices where id = '${id}'`)).rows[0].n;
  assert(n === 'PINV-HO-2026-0001', n);
  return `${r.cn}, ${n}, ${r.pay}, ${r.veh}`;
});

await check('numbers already issued do not change when an invoice is edited', async () => {
  const id = (await asServer(`select id from invoices where invoice_number = '447-FT-2026'`)).rows[0].id;
  await tx(ADMIN, `update invoices set notes = 'edited' where id = '${id}'`);
  const n = (await asServer(`select invoice_number n from invoices where id = '${id}'`)).rows[0].n;
  assert(n === '447-FT-2026', n); return n;
});

await check('opening balances take OB numbers and never use an FT number', async () => {
  const before = (await asServer(`select last_value from global_doc_sequences where prefix = '{n}-FT-2026'`)).rows[0].last_value;
  await asServer(`insert into accounts (company_id, code, name, category, subcategory) values ('${HO}','1100','AR','Asset','Receivables') on conflict do nothing`);
  const id = (await as(ADMIN, `select post_opening_party_balance('${HO}', 'Customer', '${CUS}', 125.5, '2026-11-01') id`)).rows[0].id;
  const n = (await asServer(`select invoice_number n from invoices where id = '${id}'`)).rows[0].n;
  const after = (await asServer(`select last_value from global_doc_sequences where prefix = '{n}-FT-2026'`)).rows[0].last_value;
  assert(n === 'OB-HO-2026-0001' && after === before, `${n} ${before}->${after}`);
  return `${n}; FT series still at ${after}`;
});

await check('the preview of an office the user cannot open is empty', async () => {
  const r = (await as(OTHER, `select preview_doc_number('purchase_invoice', '${HO}') n`)).rows[0].n;
  assert(r === null, r); return 'null';
});

await check('a pattern must contain {n} once and only known tokens', async () => {
  for (const bad of ['FT-{yyyy}', '{n}-{n}-FT', '{n}-FT-{month}', '{n} FT']) {
    try { await asServer(`update document_formats set pattern = '${bad}' where doc_type = 'credit_note'`); }
    catch { continue; }
    throw new Error(`accepted ${bad}`);
  }
  await asServer(`update document_formats set pattern = '{office}/{n}/{yy}' where doc_type = 'credit_note'`);
  await asServer(`update document_formats set pattern = null where doc_type = 'credit_note'`);
  return '4 refused, {office}/{n}/{yy} accepted';
});

t.report();
