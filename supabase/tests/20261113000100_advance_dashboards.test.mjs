// Dashboards: dashboard_open_invoices (finance dashboard / finance overview lists) and
// unread_notification_count (header and sidebar badge), plus the count-only filters the
// badges use. Each figure is compared with what the old browser code computed from all rows.
// Migration 20261113000100_advance_dashboards.sql
// Standalone: node supabase/tests/20261113000100_advance_dashboards.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', {
  quiet: true,
  // ADV_UPTO_SELF=1 skips later migrations (useful while they are being written)
  order: process.env.ADV_UPTO_SELF ? (fs) => fs.filter(f => f <= '20261113000100_advance_dashboards.sql') : undefined,
});
const { db, check, as, tx, asServer, assert, report } = t;
await seedFixtures(db);
const { ADMIN, FLEET, OTHER, HO, DQ } = IDS;
const SUP = '33333333-3333-3333-3333-333333333333';
const CUS = '99999999-9999-9999-9999-999999999991';
const BANK = '44444444-4444-4444-4444-444444444444';
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return ymd(d); };
const TODAY = day(0);
const n = (v) => Number(v);
const rows = async (uid, sql) => (await as(uid, sql)).rows;

await asServer(`insert into public.customers (id, customer_code, name, customer_type) values ('${CUS}','CUST-T1','Petro','Corporate')`);

let seq = 0;
const invoice = async ({ type = 'Purchase', company = HO, date = TODAY, due = day(30), price = 100, post = true } = {}) => {
  const id = `66666666-6666-6666-6666-${String(++seq).padStart(12, '0')}`;
  const party = type === 'Purchase' ? `'Supplier', '${SUP}', null` : `'Customer', null, '${CUS}'`;
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id, invoice_date, due_date)
      values ('${id}','${company}','D-${seq}','${type}',${party},'${date}','${due}');
    insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
      values ('${id}', 1, 'Line', 1, ${price}, 5, '${type === 'Purchase' ? '5000' : '4010'}')`);
  if (post) await tx(ADMIN, `select post_invoice('${id}')`);
  return id;
};
// HO: sales S1 (not due), S2 (overdue, part paid), S3 (overdue longer), S4 (draft, overdue date);
// purchases P1 (overdue), P2 (paid); credit note on S1; DQ: overdue sales S5.
const S1 = await invoice({ type: 'Sales', price: 400 });
const S2 = await invoice({ type: 'Sales', price: 300, date: day(-40), due: day(-10) });
const S3 = await invoice({ type: 'Sales', price: 200, date: day(-60), due: day(-30) });
const S4 = await invoice({ type: 'Sales', price: 50, date: day(-60), due: day(-20), post: false });
const P1 = await invoice({ price: 100, date: day(-50), due: day(-5) });
const P2 = await invoice({ price: 80 });
const S5 = await invoice({ type: 'Sales', price: 70, company: DQ, date: day(-30), due: day(-3) });
await tx(ADMIN, `select record_payment('${S2}', 100, '${TODAY}', 'Bank Transfer', '${BANK}')`);
await tx(ADMIN, `select record_payment('${P2}', 84, '${TODAY}', 'Bank Transfer', '${BANK}')`);
await tx(ADMIN, `select create_credit_note('${S1}', 'Discount', 50)`);

// The old browser rules, over every invoice row (rowToInvoice: credit notes have no open balance;
// effectivePaymentStatus = invoice_status_at).
const all = async () => (await asServer(`select v.*, invoice_status_at(v.payment_status, v.approval_status, v.is_credit_note, v.outstanding_amount, v.amount_paid, v.due_date, '${TODAY}') eff
  from v_invoice_list v`)).rows.map(r => ({ ...r, due: ymd(new Date(r.due_date)), open: r.is_credit_note ? 0 : n(r.outstanding_amount) }));
const ids = (xs) => xs.map(x => x.id ?? x.data?.id).join(',');

// ---------------------------------------------------------------- overdue receivables (finance dashboard)
await check('overdue_receivables = approved sales, not credit notes, open, due before today, oldest first', async () => {
  const inv = await all();
  const old = inv.filter(i => i.company_id === HO && i.approval_status === 'Approved' && i.open > 0 && !i.is_credit_note && i.invoice_type === 'Sales' && i.due < TODAY)
    .sort((a, b) => a.due.localeCompare(b.due));
  const r = await rows(ADMIN, `select d from dashboard_open_invoices('overdue_receivables', array['${HO}']::uuid[], '${TODAY}', 8) d`);
  const got = r.map(x => x.d);
  assert(ids(got) === ids(old) && ids(got) === [S3, S2].join(','), `${ids(got)} vs ${ids(old)}`);
  assert(n(got[1].outstanding_amount) === 215, 'S2 open ' + got[1].outstanding_amount);
  return 'S3, S2';
});
await check('overdue_receivables: the limit applies', async () => {
  const r = await rows(ADMIN, `select d from dashboard_open_invoices('overdue_receivables', null, '${TODAY}', 1) d`);
  assert(r.length === 1 && r[0].d.id === S3, ids(r.map(x => x.d))); return 'S3';
});
await check('overdue_receivables: the browser date decides what is overdue', async () => {
  const r = await rows(ADMIN, `select d from dashboard_open_invoices('overdue_receivables', array['${HO}']::uuid[], '${day(-15)}', 8) d`);
  assert(r.length === 1 && r[0].d.id === S3, ids(r.map(x => x.d))); return 'S3 only';
});

// ---------------------------------------------------------------- outstanding (finance overview)
await check('outstanding = open balance and not cancelled, overdue first then due date (same as before)', async () => {
  const inv = await all();
  const old = inv.filter(i => i.open > 0 && i.eff !== 'Cancelled')
    .sort((a, b) => (a.eff === 'Overdue') === (b.eff === 'Overdue') ? a.due.localeCompare(b.due) : a.eff === 'Overdue' ? -1 : 1).slice(0, 5);
  const r = await rows(ADMIN, `select d from dashboard_open_invoices('outstanding', null, '${TODAY}', 5) d`);
  const got = r.map(x => x.d);
  assert(ids(got) === ids(old), `${ids(got)} vs ${ids(old)}`);
  assert(!got.some(x => x.is_credit_note) && !got.some(x => x.id === P2), 'credit note or paid bill listed');
  assert(got[0].effective_status === 'Overdue', got[0].effective_status);
  return got.map(x => `${x.invoice_number}:${x.effective_status}`).join(',');
});
await check('outstanding: one office', async () => {
  const r = await rows(ADMIN, `select d from dashboard_open_invoices('outstanding', array['${DQ}']::uuid[], '${TODAY}', 5) d`);
  assert(r.length === 1 && r[0].d.id === S5, ids(r.map(x => x.d))); return 'S5';
});

// ---------------------------------------------------------------- scoping, limits, grants
const FMDQ = '00000000-0000-0000-0000-0000000000f1';   // Finance Manager of DQ only
await asServer(`insert into auth.users (id, email) values ('${FMDQ}','fmdq@x.com');
  update profiles set role_id = (select id from roles where name = 'Finance Manager') where id = '${FMDQ}';
  insert into company_members (user_id, company_id) values ('${FMDQ}','${DQ}');`);
await check('a finance user of another office sees only that office', async () => {
  const a = await rows(FMDQ, `select d from dashboard_open_invoices('outstanding', null, '${TODAY}', 50) d`);
  const b = await rows(FMDQ, `select d from dashboard_open_invoices('overdue_receivables', array['${HO}']::uuid[], '${TODAY}', 50) d`);
  const c = await rows(FMDQ, `select d from dashboard_open_invoices('overdue_receivables', null, '${TODAY}', 50) d`);
  assert(a.length === 1 && a[0].d.id === S5 && b.length === 0 && c.length === 1, JSON.stringify({ a: a.length, b: b.length, c: c.length }));
  return 'S5 only, 0 HO rows';
});
await check('a fleet user of another office gets no HO invoices', async () => {
  const a = await rows(OTHER, `select d from dashboard_open_invoices('outstanding', null, '${TODAY}', 50) d`);
  assert(a.every(x => x.d.company_id === DQ), JSON.stringify(a.length)); return `${a.length} row(s)`;
});
await check('page size above 1000 is refused', () => as(ADMIN, `select * from dashboard_open_invoices('outstanding', null, '${TODAY}', 1001)`), '1000');
await check('unknown mode is refused', () => as(ADMIN, `select * from dashboard_open_invoices('everything', null, '${TODAY}', 5)`), 'Unknown mode');
await check('anon cannot execute dashboard_open_invoices', () => db.exec(`set role anon; select * from dashboard_open_invoices('outstanding', null, current_date, 5);`).finally(() => db.exec('reset role')), 'permission denied');

// ---------------------------------------------------------------- sidebar overdue badge (count-only filter)
await check('the overdue badge filter counts exactly the invoices shown as Overdue', async () => {
  const inv = await all();
  const old = inv.filter(i => i.eff === 'Overdue').length;
  const c = n((await rows(ADMIN, `select count(*) c from invoices where approval_status = 'Approved' and is_credit_note = false
      and payment_status not in ('Paid','Cancelled') and outstanding_amount > 0.0005 and due_date < '${TODAY}'`))[0].c);
  assert(c === old && c === 4, `${c} vs ${old}`); return `${c} (S2, S3, P1, S5)`;
});

// ---------------------------------------------------------------- unread_notification_count
await asServer(`insert into notifications (id, company_id, user_id, type, title, message, severity) values
  ('88888888-0000-0000-0000-000000000001','${HO}',null,'budget_threshold','B','Budget 80%','warning'),
  ('88888888-0000-0000-0000-000000000002','${HO}','${FLEET}','info','Mine','For FLEET','info'),
  ('88888888-0000-0000-0000-000000000003','${HO}','${ADMIN}','info','Not mine','For ADMIN','info'),
  ('88888888-0000-0000-0000-000000000004','${DQ}',null,'info','DQ','DQ alert','info')`);
// old: rows of notifications (RLS) without a notification_reads row of mine
const oldUnread = async (uid) => n((await rows(uid, `select count(*) c from notifications n where not exists (select 1 from notification_reads r where r.notification_id = n.id)`))[0].c);
const unread = async (uid) => n((await rows(uid, `select unread_notification_count() c`))[0].c);
await check('unread count = visible alerts the user has not read (same as the list before)', async () => {
  const a = await unread(FLEET); const b = await oldUnread(FLEET);
  assert(a === b && a >= 2, `${a} vs ${b}`); return a;
});
await check('reading an alert lowers only that user\'s count', async () => {
  const before = await unread(FLEET);
  const adminBefore = await unread(ADMIN);
  await as(FLEET, `insert into notification_reads (notification_id, user_id) values ('88888888-0000-0000-0000-000000000001', '${FLEET}')`);
  const after = await unread(FLEET);
  const adminAfter = await unread(ADMIN);
  assert(after === before - 1 && adminAfter === adminBefore, JSON.stringify({ before, after, adminBefore, adminAfter }));
  return `${before} → ${after}`;
});
await check('a user of another office does not count its alerts', async () => {
  const visible = (await rows(OTHER, `select company_id from notifications`)).map(r => r.company_id);
  const c = await unread(OTHER);
  assert(visible.every(x => x === DQ) && c === visible.length, JSON.stringify({ c, visible })); return c;
});
await check('anon cannot execute unread_notification_count', () => db.exec(`set role anon; select unread_notification_count();`).finally(() => db.exec('reset role')), 'permission denied');

report();
