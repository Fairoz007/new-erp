// AR/AP tests (Agent B, migration 20261026000200_finance.sql).
// Standalone: node supabase/tests/20261026000200_finance.test.mjs supabase/migrations
// Applies every migration to an in-memory PGlite and exercises create_invoice / submit_invoice /
// replace_invoice_lines / duplicate_invoice / create_credit_note, the approval bridge, the
// invoice/line/payment guards, record_payment, reconciliation computation and v_party_summary.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = process.argv[2] || 'supabase/migrations';
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to authenticated;
  grant execute on function auth.uid() to authenticated;
`);

for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(join(dir, f), 'utf8')); }
  catch (e) { console.log('FAIL migration', f, '\n  ', e.message); process.exit(1); }
}

// The numbering triggers belong to Agent E (20261026000000_platform.sql). If that migration is not
// present yet, install a test-only stand-in with the contract formats so these tests can run.
const hasNumbering = (await db.query(`
  select count(*)::int n from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.invoices'::regclass and not t.tgisinternal
    and (p.proname ilike '%number%' or p.proname ilike '%numbering%' or p.proname ilike '%doc_no%')`)).rows[0].n > 0;
if (!hasNumbering) {
  await db.exec(`
    create function public.zz_test_invoice_no() returns trigger language plpgsql security definer set search_path = public as $$
    begin
      if coalesce(new.invoice_number, '') = '' then
        new.invoice_number := public.next_doc_number(new.company_id,
          (case when new.is_credit_note then 'CN' when new.invoice_type = 'Purchase' then 'PINV' else 'INV' end)
          || '-' || extract(year from new.invoice_date)::int, 4);
      end if;
      return new;
    end $$;
    create function public.zz_test_rec_no() returns trigger language plpgsql security definer set search_path = public as $$
    begin
      if coalesce(new.reconciliation_number, '') = '' then
        new.reconciliation_number := public.next_doc_number(new.company_id, 'REC-' || extract(year from current_date)::int, 3);
      end if;
      return new;
    end $$;
    create trigger aa_test_numbering before insert on public.invoices for each row execute function public.zz_test_invoice_no();
    create trigger zz_test_numbering before insert on public.reconciliations for each row execute function public.zz_test_rec_no();
  `);
}

const results = [];
const check = async (name, fn, expectError) => {
  try { const r = await fn(); results.push([expectError ? 'FAIL' : 'PASS', name, expectError ? `expected error, got ${JSON.stringify(r ?? 'success')}` : (r ?? '')]); }
  catch (e) { results.push([expectError && (expectError === true || e.message.includes(expectError)) ? 'PASS' : 'FAIL', name, e.message]); }
};
const as = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try { return await db.query(sql); }
  finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
};
// transaction so the deferred double-entry constraint fires at commit
const tx = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try { await db.exec(`begin; ${sql}; commit;`); }
  catch (e) { await db.exec('rollback'); throw e; }
  finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
};
// run a single-value statement inside a committed transaction and return the value
const val = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try {
    await db.exec('begin');
    const r = await db.query(sql);
    await db.exec('commit');
    const row = r.rows[0]; return row ? Object.values(row)[0] : undefined;
  } catch (e) { await db.exec('rollback'); throw e; }
  finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
};
const one = async (sql) => (await db.query(sql)).rows[0];
const eq = (label, got, want) => { if (Math.abs(Number(got) - want) > 0.0005) throw new Error(`${label}: got ${got}, want ${want}`); };

const SA = '00000000-0000-0000-0000-0000000000b1', FM = '00000000-0000-0000-0000-0000000000b2',
      ACC = '00000000-0000-0000-0000-0000000000b3', VIEW = '00000000-0000-0000-0000-0000000000b4',
      PROC = '00000000-0000-0000-0000-0000000000b5', OTHER = '00000000-0000-0000-0000-0000000000b6';
const HO = '11111111-1111-1111-1111-1111111111b1', DQ = '22222222-2222-2222-2222-2222222222b2';
const SUP = '33333333-3333-3333-3333-3333333333b1', SUP2 = '33333333-3333-3333-3333-3333333333b2',
      CUS = '33333333-3333-3333-3333-3333333333b3', SUPX = '33333333-3333-3333-3333-3333333333b4';
const BANK = '44444444-4444-4444-4444-4444444444b1';

const coa = (cid) => `
  insert into public.accounts (company_id, code, name, category, subcategory) values
    ('${cid}','1010','Bank','Asset','Cash'), ('${cid}','1100','AR','Asset','Receivables'),
    ('${cid}','1300','Input VAT','Asset','Tax'), ('${cid}','2010','AP','Liability','Payables'),
    ('${cid}','2100','Output VAT','Liability','Tax'), ('${cid}','4000','Revenue','Revenue','Operating'),
    ('${cid}','5000','Maintenance','Expense','Direct')
  on conflict do nothing;`;

await db.exec(`
  insert into auth.users (id, email) values ('${SA}','sa@x'),('${FM}','fm@x'),('${ACC}','acc@x'),('${VIEW}','v@x'),('${PROC}','p@x'),('${OTHER}','o@x');
  update public.profiles set role = 'Super Admin' where id = '${SA}';
  update public.profiles set role = 'Finance Manager' where id = '${FM}';
  update public.profiles set role = 'Accountant' where id in ('${ACC}','${OTHER}');
  update public.profiles set role = 'Viewer' where id = '${VIEW}';
  update public.profiles set role = 'Procurement' where id = '${PROC}';
  insert into public.companies (id, name, code) values ('${HO}','Head Office','HOB'), ('${DQ}','Duqm','DQB');
  delete from public.company_members where company_id in ('${HO}','${DQ}');
  insert into public.company_members (user_id, company_id) values
    ('${FM}','${HO}'), ('${ACC}','${HO}'), ('${VIEW}','${HO}'), ('${PROC}','${HO}'), ('${OTHER}','${DQ}');
  ${coa(HO)} ${coa(DQ)}
  insert into public.suppliers (id, supplier_code, name, supplier_type, payment_terms_days) values
    ('${SUP}','SUP-B01','Zubair Garage','Garage',30), ('${SUP2}','SUP-B02','Tyre Co','Tyre Supplier',15);
  insert into public.suppliers (id, supplier_code, name, supplier_type, status) values ('${SUPX}','SUP-B03','Blocked Co','Other','Blocked');
  insert into public.customers (id, customer_code, name, customer_type) values ('${CUS}','CUST-B01','PDO','Corporate');
  insert into public.bank_accounts (id, company_id, bank_name, account_name, account_number, account_type, opening_balance)
    values ('${BANK}','${HO}','BM','Ops','001','Current', 5000);
`);

const line = (qty, price, extra = {}) => ({ description: 'Brake pads', quantity: qty, unit_price: price, tax_rate_percentage: 5, gl_account_code: '5000', ...extra });
const createSql = (header, lines, submit = true) =>
  `select public.create_invoice('${JSON.stringify(header).replace(/'/g, "''")}'::jsonb, '${JSON.stringify(lines).replace(/'/g, "''")}'::jsonb, ${submit})`;
const purchase = (extra = {}) => ({ company_id: HO, invoice_type: 'Purchase', supplier_id: SUP, invoice_date: '2026-10-01', ...extra });
const inv = (id) => one(`select * from public.invoices where id = '${id}'`);

// ---------------------------------------------------------------- create_invoice
let P1;
await check('create_invoice: Accountant 2 x 100 @5% = 210 is posted (<= 500 limit); client totals ignored', async () => {
  P1 = await val(ACC, createSql(purchase({ grand_total: 99999, amount_paid: 50, reference_number: 'ZG-1001' }), [line(2, 100)]));
  const r = await inv(P1);
  eq('grand_total', r.grand_total, 210); eq('tax_total', r.tax_total, 10); eq('amount_paid', r.amount_paid, 0);
  if (r.approval_status !== 'Approved' || !r.journal_entry_id) throw new Error(`status ${r.approval_status} je ${r.journal_entry_id}`);
  if (!/^PINV-2026-\d+$/.test(r.invoice_number)) throw new Error('number ' + r.invoice_number);
  if (r.party_snapshot.name !== 'Zubair Garage') throw new Error('snapshot ' + JSON.stringify(r.party_snapshot));
  if (r.due_date.toISOString().slice(0, 10) !== '2026-10-31') throw new Error('due ' + r.due_date);
  return `${r.invoice_number} total 210, posted`;
});
await check('create_invoice: Viewer denied', () => val(VIEW, createSql(purchase(), [line(1, 10)])), 'Permission denied');
await check('create_invoice: foreign office (Duqm accountant -> HO) denied', () => val(OTHER, createSql(purchase(), [line(1, 10)])), 'Permission denied');
await check('create_invoice: no lines rejected', () => val(ACC, createSql(purchase(), [])), 'at least one line');
await check('create_invoice: zero quantity rejected', () => val(ACC, createSql(purchase(), [line(0, 10)])), 'quantity must be greater than zero');
await check('create_invoice: negative price rejected', () => val(ACC, createSql(purchase(), [line(1, -10)])), 'cannot be negative');
await check('create_invoice: zero total rejected', () => val(ACC, createSql(purchase(), [line(1, 0)])), 'greater than zero');
await check('create_invoice: other charges rejected', () => val(ACC, createSql(purchase({ other_charges: 5 }), [line(1, 10)])), 'Other charges');
await check('create_invoice: unknown GL account rejected', () => val(ACC, createSql(purchase(), [line(1, 10, { gl_account_code: '9999' })])), 'does not exist');
await check('create_invoice: blocked supplier rejected', () => val(ACC, createSql(purchase({ supplier_id: SUPX }), [line(1, 10)])), 'not active');
await check('create_invoice: duplicate supplier bill reference rejected (double submit)', () =>
  val(ACC, createSql(purchase({ reference_number: 'zg-1001' }), [line(2, 100)])), 'already recorded');
await check('create_invoice: nothing left behind by failed calls', async () => {
  const n = (await one(`select count(*)::int n from public.invoices`)).n; if (n !== 1) throw new Error('n=' + n); return 'n=1';
});

// ---------------------------------------------------------------- approval flow
let P2;
await check('create_invoice: 1000 by Accountant -> Pending Approval + approval request, not posted', async () => {
  P2 = await val(ACC, createSql(purchase({ supplier_id: SUP2 }), [line(10, 100, { tax_rate_percentage: 0 })]));
  const r = await inv(P2);
  const req = await one(`select count(*)::int n, max(amount) amount from public.approval_requests where reference_id = '${P2}' and status = 'Pending'`);
  if (r.approval_status !== 'Pending Approval' || r.journal_entry_id || req.n !== 1) throw new Error(JSON.stringify({ s: r.approval_status, req }));
  eq('request amount', req.amount, 1000);
  return 'pending, 1 request';
});
await check('record_payment on unposted invoice rejected', () =>
  tx(FM, `select record_payment('${P2}', 100, current_date, 'Cash', '${BANK}')`), 'approved and posted');
await check('submit_invoice while a request is open rejected', () => val(FM, `select public.submit_invoice('${P2}')`), 'already awaiting approval');
await check('Accountant cannot approve 1000 (limit 500)', async () => {
  const id = (await one(`select id from public.approval_requests where reference_id = '${P2}'`)).id;
  return tx(ACC, `select decide_approval('${id}', 'Approved', 'ok')`);
}, 'not authorised');
await check('Finance Manager approves -> invoice posted by the bridge', async () => {
  const id = (await one(`select id from public.approval_requests where reference_id = '${P2}'`)).id;
  await tx(FM, `select decide_approval('${id}', 'Approved', 'Checked against PO')`);
  const r = await inv(P2);
  if (r.approval_status !== 'Approved' || !r.journal_entry_id) throw new Error(r.approval_status);
  return 'Approved + journal';
});

let P3;
await check('Procurement invoice -> pending; FM rejects -> Rejected', async () => {
  P3 = await val(PROC, createSql(purchase(), [line(1, 50)]));
  if ((await inv(P3)).approval_status !== 'Pending Approval') throw new Error('not pending');
  const id = (await one(`select id from public.approval_requests where reference_id = '${P3}'`)).id;
  await tx(FM, `select decide_approval('${id}', 'Rejected', 'Wrong supplier price')`);
  const r = await inv(P3);
  if (r.approval_status !== 'Rejected' || r.journal_entry_id) throw new Error(r.approval_status);
  return 'Rejected, unposted';
});
await check('replace_invoice_lines on rejected invoice, then resubmit -> new request', async () => {
  await tx(PROC, `select public.replace_invoice_lines('${P3}', '${JSON.stringify([line(1, 40), line(2, 5)])}'::jsonb)`);
  eq('new total', (await inv(P3)).grand_total, 52.5);
  const s = await val(PROC, `select public.submit_invoice('${P3}')`);
  const n = (await one(`select count(*)::int n from public.approval_requests where reference_id = '${P3}' and status = 'Pending'`)).n;
  if (s !== 'Pending Approval' || n !== 1) throw new Error(`${s} ${n}`);
  return s;
});
await check('replace_invoice_lines on posted invoice rejected', () =>
  tx(ACC, `select public.replace_invoice_lines('${P1}', '${JSON.stringify([line(1, 1)])}'::jsonb)`), 'draft or rejected');
await check('replace_invoice_lines by Viewer denied', () =>
  tx(VIEW, `select public.replace_invoice_lines('${P3}', '${JSON.stringify([line(1, 1)])}'::jsonb)`), 'Permission denied');
await check('submit_invoice on posted invoice rejected', () => val(ACC, `select public.submit_invoice('${P1}')`), 'cannot be submitted');

// ---------------------------------------------------------------- client guards
await check('client cannot set amount_paid directly', () => as(FM, `update public.invoices set amount_paid = 210 where id = '${P1}'`), 'maintained by the system');
await check('client cannot set grand_total directly', () => as(FM, `update public.invoices set grand_total = 1 where id = '${P1}'`), 'maintained by the system');
await check('client cannot self-approve (approval_status = Approved)', () =>
  as(PROC, `update public.invoices set approval_status = 'Approved' where id = '${P3}'`), 'Invalid approval status');
await check('client cannot mark invoice Paid', () => as(FM, `update public.invoices set payment_status = 'Paid' where id = '${P1}'`), 'maintained by the system');
await check('client cannot change party of a posted invoice', () =>
  as(FM, `update public.invoices set supplier_id = '${SUP2}' where id = '${P1}'`), 'cannot change party');
await check('client may edit notes of a posted invoice', async () => {
  await as(FM, `update public.invoices set notes = 'checked' where id = '${P1}'`); return (await inv(P1)).notes;
});
await check('client cannot insert a credit note directly', () =>
  as(FM, `insert into public.invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, is_credit_note, parent_invoice_id)
          values ('${HO}','X1','Purchase','Supplier','${SUP}',current_date,current_date,true,'${P1}')`), 'create_credit_note');
await check('client direct insert is forced to Draft with zero totals', async () => {
  await as(FM, `insert into public.invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, approval_status, grand_total, amount_paid, payment_status)
          values ('${HO}','DIRECT-1','Purchase','Supplier','${SUP}',current_date,current_date,'Approved',500,500,'Paid')`);
  const r = await one(`select approval_status, payment_status, grand_total, amount_paid from public.invoices where invoice_number = 'DIRECT-1'`);
  if (r.approval_status !== 'Draft' || r.payment_status !== 'Unpaid' || Number(r.grand_total) !== 0 || Number(r.amount_paid) !== 0) throw new Error(JSON.stringify(r));
  await as(FM, `delete from public.invoices where invoice_number = 'DIRECT-1'`);
  return 'Draft / Unpaid / 0';
});
await check('client cannot add lines to a posted invoice', () =>
  as(FM, `insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit_price) values ('${P1}', 9, 'x', 1, 1)`), true);
await check('client cannot add lines to a pending invoice', () =>
  as(PROC, `insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit_price) values ('${P3}', 9, 'x', 1, 1)`), 'draft or rejected');
await check('posted invoice cannot be deleted', () => as(SA, `delete from public.invoices where id = '${P1}'`), 'can be deleted');

// ---------------------------------------------------------------- payments
await check('payment: zero amount rejected', () => tx(ACC, `select record_payment('${P1}', 0, current_date, 'Cash', '${BANK}')`), 'between 0 and outstanding');
await check('payment: negative amount rejected', () => tx(ACC, `select record_payment('${P1}', -5, current_date, 'Cash', '${BANK}')`), 'between 0 and outstanding');
await check('payment: over outstanding rejected', () => tx(ACC, `select record_payment('${P1}', 210.01, current_date, 'Cash', '${BANK}')`), 'between 0 and outstanding');
await check('payment: Viewer denied', () => tx(VIEW, `select record_payment('${P1}', 10, current_date, 'Cash', '${BANK}')`), 'Permission denied');
await check('payment: Duqm accountant denied on HO invoice', () => tx(OTHER, `select record_payment('${P1}', 10, current_date, 'Cash', '${BANK}')`), 'Permission denied');
await check('payment: 60 accepted -> outstanding 150, Partially Paid, bank 4940', async () => {
  await tx(ACC, `select record_payment('${P1}', 60, current_date, 'Bank Transfer', '${BANK}', 'TRX-1')`);
  const r = await inv(P1);
  eq('outstanding', r.outstanding_amount, 150);
  if (r.payment_status !== 'Partially Paid') throw new Error(r.payment_status);
  eq('bank', (await one(`select current_balance from public.v_bank_balances where id = '${BANK}'`)).current_balance, 4940);
  return 'ok';
});

// ---------------------------------------------------------------- credit notes
let CN1;
await check('credit note: zero amount rejected', () => val(ACC, `select public.create_credit_note('${P1}', 'Damaged', 0)`), 'greater than zero');
await check('credit note: negative amount rejected', () => val(ACC, `select public.create_credit_note('${P1}', 'Damaged', -10)`), 'greater than zero');
await check('credit note: over-credit (200 > outstanding 150) rejected', () => val(ACC, `select public.create_credit_note('${P1}', 'Damaged', 200)`), 'exceeds outstanding');
await check('credit note: reason required', () => val(ACC, `select public.create_credit_note('${P1}', '  ', 10)`), 'reason is required');
await check('credit note: Viewer denied', () => val(VIEW, `select public.create_credit_note('${P1}', 'x', 10)`), 'Permission denied');
await check('credit note: foreign office denied', () => val(OTHER, `select public.create_credit_note('${P1}', 'x', 10)`), 'Permission denied');
await check('credit note: Procurement lacks approval authority', () => val(PROC, `select public.create_credit_note('${P1}', 'x', 10)`), 'approval authority');
await check('credit note: not on an unposted invoice', () => val(FM, `select public.create_credit_note('${P3}', 'x', 10)`), 'Only approved');
await check('credit note: partial 105 (half) -> parent outstanding 45, posted, CN number', async () => {
  CN1 = await val(ACC, `select public.create_credit_note('${P1}', 'Returned 1 set', 105)`);
  const c = await inv(CN1), p = await inv(P1);
  eq('cn total', c.grand_total, 105); eq('parent credited', p.credited_amount, 105); eq('parent outstanding', p.outstanding_amount, 45);
  if (!c.is_credit_note || c.parent_invoice_id !== P1 || !c.journal_entry_id || c.approval_status !== 'Approved') throw new Error('cn ' + JSON.stringify(c));
  if (!/^CN-2026-\d+$/.test(c.invoice_number)) throw new Error('number ' + c.invoice_number);
  return `${c.invoice_number}`;
});
await check('credit note: cannot credit a credit note', () => val(ACC, `select public.create_credit_note('${CN1}', 'x', 1)`), 'credit note');
await check('credit note: cannot be paid', () => tx(ACC, `select record_payment('${CN1}', 1, current_date, 'Cash', '${BANK}')`), 'cannot be paid');
await check('credit note: full remaining (null amount) -> parent Paid', async () => {
  await val(ACC, `select public.create_credit_note('${P1}', 'Settled by credit')`);
  const p = await inv(P1);
  eq('outstanding', p.outstanding_amount, 0);
  if (p.payment_status !== 'Paid') throw new Error(p.payment_status);
  return 'outstanding 0, Paid';
});
await check('credit note: second full credit (duplicate submit) rejected', () => val(ACC, `select public.create_credit_note('${P1}', 'again')`), 'no outstanding');
await check('payment after full credit rejected', () => tx(ACC, `select record_payment('${P1}', 1, current_date, 'Cash', '${BANK}')`), 'between 0 and outstanding');

// ---------------------------------------------------------------- duplicate
await check('duplicate_invoice: Draft copy with same lines, new number, bill ref cleared', async () => {
  const id = await val(ACC, `select public.duplicate_invoice('${P2}')`);
  const r = await inv(id), o = await inv(P2);
  eq('total', r.grand_total, Number(o.grand_total));
  if (r.approval_status !== 'Draft' || r.journal_entry_id || r.invoice_number === o.invoice_number || r.reference_number) throw new Error(JSON.stringify(r));
  const s = await val(FM, `select public.submit_invoice('${id}')`);
  if (s !== 'Approved') throw new Error('FM submit ' + s);
  return `${r.invoice_number}, submitted by FM -> ${s}`;
});
await check('duplicate_invoice: credit note cannot be duplicated', () => val(ACC, `select public.duplicate_invoice('${CN1}')`), 'cannot be duplicated');
await check('duplicate_invoice: Viewer denied', () => val(VIEW, `select public.duplicate_invoice('${P2}')`), 'Permission denied');
await check('duplicate_invoice: foreign office denied', () => val(OTHER, `select public.duplicate_invoice('${P2}')`), 'Permission denied');

// ---------------------------------------------------------------- sales side
let S1;
await check('sales invoice: posted to AR / revenue / output VAT, customer payment raises bank', async () => {
  S1 = await val(FM, createSql({ company_id: HO, invoice_type: 'Sales', customer_id: CUS, invoice_date: '2026-10-05' },
    [{ description: 'Haulage', quantity: 4, unit_price: 250, tax_rate_percentage: 5, gl_account_code: '4000' }]));
  const r = await inv(S1);
  if (!/^INV-2026-\d+$/.test(r.invoice_number) || r.approval_status !== 'Approved') throw new Error(r.invoice_number + r.approval_status);
  await tx(FM, `select record_payment('${S1}', 50, current_date, 'Cheque', '${BANK}')`);
  eq('bank', (await one(`select current_balance from public.v_bank_balances where id = '${BANK}'`)).current_balance, 4990);
  return r.invoice_number;
});

await check('credit note: awkward partial 333.333 on sales invoice is exact (pro-rata + rounding line)', async () => {
  const cn = await val(FM, `select public.create_credit_note('${S1}', 'Late delivery discount', 333.333)`);
  eq('cn total', (await inv(cn)).grand_total, 333.333);
  eq('parent outstanding', (await inv(S1)).outstanding_amount, 1050 - 50 - 333.333);
  return 'exact';
});
await check('submit_invoice posts a system-raised Pending Approval invoice (no request yet)', async () => {
  await db.exec(`insert into public.invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, approval_status)
    values ('99999999-9999-9999-9999-9999999999b1','${HO}','PINV-SYS-1','Purchase','Supplier','${SUP}',current_date,current_date+30,'Pending Approval');
    insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit_price, gl_account_code)
    values ('99999999-9999-9999-9999-9999999999b1', 1, 'Auto from maintenance', 1, 80, '5000');`);
  const s = await val(ACC, `select public.submit_invoice('99999999-9999-9999-9999-9999999999b1')`);
  if (s !== 'Approved') throw new Error(s);
  return s;
});

// ---------------------------------------------------------------- GL integrity
await check('GL: every posted entry balances; AP/AR control = open posted invoices', async () => {
  const bad = (await one(`select count(*)::int n from (select entry_id from public.journal_lines group by entry_id having sum(debit) <> sum(credit)) x`)).n;
  if (bad) throw new Error(bad + ' unbalanced');
  const ap = await one(`select balance from public.v_account_balances where company_id = '${HO}' and code = '2010'`);
  const apOpen = await one(`select coalesce(sum(outstanding_amount),0) s from public.invoices where company_id = '${HO}' and invoice_type = 'Purchase' and not is_credit_note and journal_entry_id is not null`);
  eq('AP vs open purchase invoices', ap.balance, Number(apOpen.s));
  const ar = await one(`select balance from public.v_account_balances where company_id = '${HO}' and code = '1100'`);
  const arOpen = await one(`select coalesce(sum(outstanding_amount),0) s from public.invoices where company_id = '${HO}' and invoice_type = 'Sales' and not is_credit_note and journal_entry_id is not null`);
  eq('AR vs open sales invoices', ar.balance, Number(arOpen.s));
  return `AP ${ap.balance}, AR ${ar.balance}`;
});
await check('GL: client cannot write journal lines directly', () =>
  as(SA, `insert into public.journal_lines (entry_id, company_id, account_code, debit) select id, company_id, '5000', 1 from public.journal_entries limit 1`), true);

// ---------------------------------------------------------------- party balances
await check('v_party_summary: supplier balance from DB (FM sees HO invoices)', async () => {
  const r = (await as(FM, `select * from public.v_party_summary where party_id = '${SUP2}'`)).rows[0];
  const open = await one(`select sum(outstanding_amount) s, sum(grand_total) t, count(*)::int n from public.invoices where supplier_id = '${SUP2}' and not is_credit_note`);
  eq('current_balance', r.current_balance, Number(open.s)); eq('total_invoiced', r.total_invoiced, Number(open.t));
  if (Number(r.invoice_count) !== open.n) throw new Error('count');
  return `balance ${r.current_balance}, ${r.invoice_count} invoices`;
});
await check('v_party_summary: SUP credit notes counted, outstanding 0', async () => {
  const r = (await as(FM, `select * from public.v_party_summary where party_id = '${SUP}'`)).rows[0];
  eq('credited', r.total_credited, 210 - 60); eq('paid', r.total_paid, 60);
  return JSON.stringify({ outstanding: r.outstanding, credited: r.total_credited });
});
await check('v_party_summary: Duqm user sees no HO activity', async () => {
  const r = (await as(OTHER, `select * from public.v_party_summary where party_id = '${SUP2}'`)).rows[0];
  eq('total_invoiced', r ? r.total_invoiced : 0, 0); return '0';
});

// ---------------------------------------------------------------- reconciliation
const recSql = (invoiceId, extra) => `insert into public.reconciliations (company_id, reconciliation_number, invoice_id, matching_type,
   purchase_order_number, purchase_order_amount, goods_received_amount, work_order_number, work_order_amount,
   invoice_amount, difference_amount, variance_percentage, status)
   values ('${DQ}', null, '${invoiceId}', ${extra}, 1, 0, 0, 'Matched') returning *`;
await check('reconciliation: 2-way PO 1000 vs invoice 1000 -> Matched (client company/status ignored)', async () => {
  const r = (await as(ACC, recSql(P2, `'2-Way', 'PO-1', 1000, null, null, null`))).rows[0];
  if (r.status !== 'Matched' || r.company_id !== HO || Number(r.difference_amount) !== 0) throw new Error(JSON.stringify(r));
  return `${r.reconciliation_number} Matched`;
});
await check('reconciliation: 2-way PO 980 vs 1000 -> diff 20, 2.041%, Partially Matched', async () => {
  const r = (await as(ACC, recSql(P2, `'2-Way', 'PO-1', 980, null, null, null`))).rows[0];
  eq('diff', r.difference_amount, 20); eq('variance', r.variance_percentage, 2.041);
  if (r.status !== 'Partially Matched') throw new Error(r.status);
  return r.status;
});
await check('reconciliation: 3-way received 294 vs invoice 1000 -> Mismatch (no hard-coded 294)', async () => {
  const r = (await as(ACC, recSql(P2, `'3-Way', 'PO-1', 1000, 294, 'WO-1', 1000`))).rows[0];
  eq('diff', r.difference_amount, 706);
  if (r.status !== 'Mismatch' || r.work_order_number !== 'WO-1') throw new Error(r.status);
  return r.status;
});
await check('reconciliation: 3-way received 0 -> Mismatch, variance 100', async () => {
  const r = (await as(ACC, recSql(P2, `'3-Way', 'PO-1', 1000, 0, null, null`))).rows[0];
  if (r.status !== 'Mismatch' || Number(r.variance_percentage) !== 100) throw new Error(JSON.stringify(r));
  return 'Mismatch';
});
await check('reconciliation: 3-way without received amount rejected', () => as(ACC, recSql(P2, `'3-Way', 'PO-1', 1000, null, null, null`)), 'received amount');
await check('reconciliation: zero PO amount rejected', () => as(ACC, recSql(P2, `'2-Way', 'PO-1', 0, null, null, null`)), 'greater than zero');
await check('reconciliation: sales invoice rejected', () => as(ACC, recSql(S1, `'2-Way', 'PO-1', 10, null, null, null`)), 'purchase invoices');
await check('reconciliation: credit note rejected', () => as(ACC, recSql(CN1, `'2-Way', 'PO-1', 10, null, null, null`)), 'purchase invoices');
await check('reconciliation: Viewer denied', () => as(VIEW, recSql(P2, `'2-Way', 'PO-1', 1000, null, null, null`)), true);
await check('reconciliation: Duqm user cannot reconcile HO invoice', () => as(OTHER, recSql(P2, `'2-Way', 'PO-1', 1000, null, null, null`)), true);
await check('reconciliation: client update cannot fake the status', async () => {
  await as(ACC, `update public.reconciliations set status = 'Matched', difference_amount = 0 where status = 'Mismatch'`);
  const n = (await one(`select count(*)::int n from public.reconciliations where status = 'Mismatch'`)).n;
  if (n !== 2) throw new Error('n=' + n); return 'still 2 Mismatch';
});

// ---------------------------------------------------------------- anon
await check('anon cannot call create_invoice', async () => {
  await db.exec('set role anon');
  try { await db.query(createSql(purchase(), [line(1, 1)])); } finally { await db.exec('reset role'); }
}, 'permission denied');

for (const [s, n, d] of results) console.log(s.padEnd(5), n, d ? '— ' + String(d).slice(0, 160) : '');
const fails = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} passed${hasNumbering ? '' : ' (numbering stub: Agent E platform migration not present)'}`);
process.exit(fails ? 1 : 0);
