// Ledger & system data layer: general_ledger_summary, v_journal_list reversal columns,
// v_notification_list / notification_counts, v_audit_log_list, office_record_counts.
// Migration 20261113000400_advance_ledger_system.sql
// Standalone: node supabase/tests/20261113000400_advance_ledger_system.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, tx, as, asServer, assert } = t;
await seedFixtures(t.db);
const { ADMIN, VIEWER, FLEET, OTHER, HO, DQ } = IDS;
const FM_DQ = '00000000-0000-0000-0000-0000000000f2';   // Finance Manager, member of DQ only
const SUP = '33333333-3333-3333-3333-333333333333';
const BANK = '44444444-4444-4444-4444-444444444444';
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const role = (name) => `(select id from public.roles where name = '${name}')`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return ymd(d); };
const n3 = (x) => Math.round(Number(x) * 1000) / 1000;

await asServer(`
  insert into auth.users (id, email) values ('${FM_DQ}','fmdq@x.com');
  update profiles set role_id = ${role('Finance Manager')} where id = '${FM_DQ}';
  insert into company_members (user_id, company_id) values ('${FM_DQ}','${DQ}');
  insert into accounts (company_id, code, name, category, subcategory) values
    ('${DQ}','1010','Bank','Asset','Cash'), ('${DQ}','2010','AP','Liability','Payables'), ('${DQ}','5000','Maintenance','Expense','Direct')
  on conflict (company_id, code) do nothing;
  update accounts set opening_balance = 500 where company_id = '${HO}' and code = '1010';
  update accounts set opening_balance = 70 where company_id = '${DQ}' and code = '1010';
`);

// ---------------------------------------------------------------- ledger fixture
const post = (company, date, desc, amt) => tx(ADMIN, `select post_journal_entry('${company}', '${date}', '${desc}',
  '[{"account_code":"5000","debit":${amt}},{"account_code":"1010","credit":${amt}}]')`);
await post(HO, day(-60), 'old fuel', 40);
await post(HO, day(-20), 'fuel a', 12.345);
await post(HO, day(-10), 'fuel b', 7.5);
await post(DQ, day(-15), 'dq fuel', 9);
await post(HO, day(5), 'future', 3);
const FROM = day(-30), TO = day(0);

// Old app logic (getGeneralLedger): opening = opening_balance + normal-direction movement before
// FROM; lines and totals in [FROM, TO]; closing = opening + period movement.
const expected = async (companies) => {
  const list = companies.map(c => `'${c}'`).join(',');
  const lines = (await asServer(`select l.account_code, l.debit, l.credit, e.date::text d from journal_lines l
     join journal_entries e on e.id = l.entry_id where e.status = 'Posted' and l.company_id in (${list})`)).rows;
  const accts = (await asServer(`select code, category, sum(opening_balance) ob from accounts
     where company_id in (${list}) group by code, category order by code`)).rows;
  const out = {};
  for (const a of accts) {
    const dn = a.category === 'Asset' || a.category === 'Expense';
    const nrm = (d, c) => (dn ? d - c : c - d);
    let open = Number(a.ob), dr = 0, cr = 0, cnt = 0;
    for (const l of lines.filter(x => x.account_code === a.code)) {
      if (l.d < FROM) open += nrm(Number(l.debit), Number(l.credit));
      else if (l.d <= TO) { dr += Number(l.debit); cr += Number(l.credit); cnt++; }
    }
    out[a.code] = { open: n3(open), dr: n3(dr), cr: n3(cr), cnt, close: n3(open + nrm(dr, cr)) };
  }
  return out;
};
// What the page computes from general_ledger_summary (accountBalancesFrom in accounting.ts)
const fromSummary = async (uid, company) => {
  const rows = (await as(uid, `select * from general_ledger_summary(${company ? `'${company}'` : 'null'}, '${FROM}', '${TO}')`)).rows;
  const accts = (await as(uid, `select code, category, sum(opening_balance) ob from accounts
     where ${company ? `company_id = '${company}'` : 'true'} group by code, category order by code`)).rows;
  const out = {};
  for (const a of accts) {
    const dn = a.category === 'Asset' || a.category === 'Expense';
    const nrm = (d, c) => (dn ? d - c : c - d);
    const r = rows.find(x => x.account_code === a.code) ?? { before_debit: 0, before_credit: 0, debit: 0, credit: 0, line_count: 0 };
    const open = n3(Number(a.ob) + nrm(Number(r.before_debit), Number(r.before_credit)));
    out[a.code] = { open, dr: n3(r.debit), cr: n3(r.credit), cnt: Number(r.line_count), close: n3(open + nrm(Number(r.debit), Number(r.credit))) };
  }
  return out;
};

await check('general ledger summary equals the old per-account opening, totals, line count and closing (one office)', async () => {
  const [a, b] = [await expected([HO]), await fromSummary(ADMIN, HO)];
  assert(JSON.stringify(a) === JSON.stringify(b), JSON.stringify({ a, b }));
  assert(b['1010'].open === 460 && b['1010'].cnt === 2 && b['1010'].close === 440.155, JSON.stringify(b['1010']));
  return JSON.stringify(b['1010']);
});
await check('general ledger summary equals the old figures for all offices (summed by code)', async () => {
  const [a, b] = [await expected([HO, DQ]), await fromSummary(ADMIN, null)];
  assert(JSON.stringify(a) === JSON.stringify(b), JSON.stringify({ a, b }));
  return JSON.stringify(b['5000']);
});
await check('summary line count = general_ledger_page total_count, and its last running balance = closing', async () => {
  const s = (await as(ADMIN, `select line_count from general_ledger_summary('${HO}', '${FROM}', '${TO}') where account_code = '1010'`)).rows[0];
  const p = (await as(ADMIN, `select total_count, running_balance from general_ledger_page('${HO}', '1010', '${FROM}', '${TO}', 1000, 0)`)).rows;
  const exp = await expected([HO]);
  assert(Number(s.line_count) === Number(p[0].total_count) && n3(p[p.length - 1].running_balance) === exp['1010'].close, JSON.stringify({ s, p }));
  return `${s.line_count} lines`;
});
await check('without a start date nothing is brought forward and every line to the end date counts', async () => {
  const r = (await as(ADMIN, `select * from general_ledger_summary('${HO}', null, '${TO}') where account_code = '5000'`)).rows[0];
  assert(Number(r.before_debit) === 0 && Number(r.line_count) === 3 && n3(r.debit) === 59.845, JSON.stringify(r)); return JSON.stringify(r);
});
await check('a ledger reader of one office sees only that office in the all-offices summary', async () => {
  const r = (await as(FM_DQ, `select account_code, debit, credit, line_count from general_ledger_summary(null, '${FROM}', '${TO}') where account_code = '5000'`)).rows[0];
  assert(n3(r.debit) === 9 && Number(r.line_count) === 1, JSON.stringify(r)); return JSON.stringify(r);
});
await check('a ledger reader cannot ask for another office', () => as(FM_DQ, `select * from general_ledger_summary('${HO}', null, null)`), 'Permission denied');
await check('a user without accounting:view gets no ledger summary', async () => {
  const n = (await as(FLEET, `select count(*)::int n from general_ledger_summary(null, null, null)`)).rows[0].n;
  assert(n === 0, n); return 'empty';
});
const asAnon = async (sql) => { await t.db.exec('set role anon'); try { return await t.db.query(sql); } finally { await t.db.exec('reset role'); } };
await check('anon cannot run general_ledger_summary', () => asAnon(`select * from general_ledger_summary(null, null, null)`), 'permission denied');

// ---------------------------------------------------------------- journal list: reversal info
await check('the journal list marks a reversed entry and names the reversing entry', async () => {
  const id = await val(`select id from journal_entries where description = 'fuel b'`);
  await tx(ADMIN, `select reverse_journal_entry('${id}', '${TO}', 'wrong vehicle')`);
  const r = (await as(ADMIN, `select is_reversed, reversed_by_number, (select entry_number from journal_entries where reverses_entry_id = '${id}') rn
                               from v_journal_list where id = '${id}'`)).rows[0];
  const others = (await as(ADMIN, `select count(*)::int n from v_journal_list where is_reversed and id <> '${id}'`)).rows[0].n;
  assert(r.is_reversed === true && r.reversed_by_number && r.reversed_by_number === r.rn && others === 0, JSON.stringify({ r, others }));
  return r.reversed_by_number;
});
await check('the journal list keeps its earlier columns (totals, search text)', async () => {
  const r = (await as(ADMIN, `select total_debit, total_credit, search_text from v_journal_list where description = 'fuel a'`)).rows[0];
  assert(n3(r.total_debit) === 12.345 && n3(r.total_credit) === 12.345 && r.search_text.includes('fuel a'), JSON.stringify(r)); return 'ok';
});
await check('another office cannot see the journal list rows', async () => {
  const n = (await as(FM_DQ, `select count(*)::int n from v_journal_list where company_id = '${HO}'`)).rows[0].n;
  assert(n === 0, n); return 'hidden';
});

// ---------------------------------------------------------------- notifications
await asServer(`
  insert into notifications (id, company_id, user_id, type, title, message, severity) values
    ('99999999-0000-0000-0000-000000000001','${HO}', null, 'info', 'HO everyone', 'm', 'info'),
    ('99999999-0000-0000-0000-000000000002','${HO}', '${VIEWER}', 'info', 'HO viewer', 'm', 'critical'),
    ('99999999-0000-0000-0000-000000000003','${HO}', '${FLEET}', 'info', 'HO fleet', 'm', 'critical'),
    ('99999999-0000-0000-0000-000000000004','${DQ}', null, 'info', 'DQ everyone', 'm', 'warning');
`);
await check('the notification list shows the caller\'s alerts with the caller\'s read state', async () => {
  await as(VIEWER, `insert into notification_reads (notification_id, user_id) values ('99999999-0000-0000-0000-000000000001', '${VIEWER}')`);
  const rows = (await as(VIEWER, `select title, is_read from v_notification_list where id::text like '99999999%' order by title`)).rows;
  const fleetRead = (await as(FLEET, `select is_read from v_notification_list where id = '99999999-0000-0000-0000-000000000001'`)).rows[0].is_read;
  assert(JSON.stringify(rows) === JSON.stringify([{ title: 'HO everyone', is_read: true }, { title: 'HO viewer', is_read: false }]) && fleetRead === false,
    JSON.stringify({ rows, fleetRead }));
  return 'own read state';
});
await check('notification counts equal the counts over the visible rows (as the old page computed)', async () => {
  for (const uid of [VIEWER, OTHER, FLEET]) {
    const c = (await as(uid, `select notification_counts() c`)).rows[0].c;
    const w = (await as(uid, `select count(*)::int total, count(*) filter (where not is_read)::int unread,
        count(*) filter (where severity = 'critical')::int critical from notifications n
        left join lateral (select exists (select 1 from notification_reads r where r.notification_id = n.id) is_read) x on true`)).rows[0];
    assert(c.total === w.total && c.unread === w.unread && c.critical === w.critical, JSON.stringify({ uid, c, w }));
  }
  const o = (await as(OTHER, `select notification_counts() c`)).rows[0].c;
  assert(!JSON.stringify(o).includes('"total":0'), JSON.stringify(o));
  return JSON.stringify(o);
});
await check('mark all read leaves no unread for the caller only', async () => {
  const before = (await as(FLEET, `select notification_counts() c`)).rows[0].c.unread;
  await as(VIEWER, `select mark_all_notifications_read()`);
  const c = (await as(VIEWER, `select notification_counts() c`)).rows[0].c;
  const f = (await as(FLEET, `select notification_counts() c`)).rows[0].c;
  assert(c.unread === 0 && f.unread === before && before > 0, JSON.stringify({ c, f, before })); return 'ok';
});
await check('anon cannot read the notification list', () => asAnon(`select * from v_notification_list`), 'permission denied');
await check('anon cannot run notification_counts', () => asAnon(`select notification_counts()`), 'permission denied');

// ---------------------------------------------------------------- audit log list
await check('audit list: an invoice payment shows as PAYMENT with its number', async () => {
  const id = '66666666-6666-6666-6666-000000000401';
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date)
      values ('${id}','${HO}','AUD-1','Purchase','Supplier','${SUP}','${TO}','${TO}');
    insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
      values ('${id}', 1, 'Parts', 1, 100, 0, '5000')`);
  await tx(ADMIN, `select post_invoice('${id}')`);
  await tx(ADMIN, `select record_payment('${id}', 30, '${TO}', 'Bank Transfer', '${BANK}')`);
  const r = (await as(ADMIN, `select display_action, entity_label, entity_name, new_value->>'payment_number' pn from v_audit_log_list
                               where entity_type = 'payments' and action = 'CREATE' limit 1`)).rows[0];
  assert(r && r.display_action === 'PAYMENT' && r.entity_label === 'Payment' && r.entity_name === r.pn, JSON.stringify(r));
  return `${r.display_action} ${r.entity_name}`;
});
await check('audit list: an update lists the changed field with old and new value in the search text', async () => {
  await tx(ADMIN, `update vehicles set brand = 'Nissan' where id = '55555555-5555-5555-5555-555555555555'`);
  const r = (await as(ADMIN, `select display_action, entity_label, entity_name, search_text from v_audit_log_list
                               where entity_type = 'vehicles' and action = 'UPDATE' order by id desc limit 1`)).rows[0];
  assert(r.display_action === 'UPDATE' && r.entity_label === 'Vehicle' && r.entity_name === '1234 AB'
    && r.search_text.includes('brand: toyota -> nissan') && !r.search_text.includes('updated_at:'), JSON.stringify(r));
  return r.search_text.slice(0, 80);
});
await check('audit list: an approval decision shows as APPROVE / REJECT (same rule as the app)', async () => {
  await asServer(`insert into audit_logs (company_id, action, entity_type, entity_id, old_value, new_value)
      values ('${HO}', 'UPDATE', 'approval_requests', 'x', '{"status":"Pending","reference_type":"Invoice","reference_number":"R-1"}',
              '{"status":"Rejected","reference_type":"Invoice","reference_number":"R-1","current_level":1,"total_levels":2}'),
             ('${HO}', 'UPDATE', 'approval_requests', 'y', '{"status":"Pending","reference_type":"WorkOrder","reference_number":"R-2"}',
              '{"status":"Pending","reference_type":"WorkOrder","reference_number":"R-2","notes":"n"}')`);
  const rows = (await asServer(`select a.action, a.old_value->>'status' o, a.new_value->>'status' n, v.display_action
      from audit_logs a join v_audit_log_list v on v.id = a.id where a.entity_type = 'approval_requests'`)).rows;
  for (const r of rows) {
    const want = r.action === 'UPDATE' && r.o !== r.n ? (r.n === 'Approved' ? 'APPROVE' : r.n === 'Rejected' ? 'REJECT' : 'UPDATE') : r.action;
    assert(r.display_action === want, JSON.stringify(r));
  }
  const x = (await as(ADMIN, `select display_action, entity_label, entity_name, search_text from v_audit_log_list where entity_id = 'x'`)).rows[0];
  const y = (await as(ADMIN, `select display_action, entity_label from v_audit_log_list where entity_id = 'y'`)).rows[0];
  assert(x.display_action === 'REJECT' && x.entity_label === 'Invoice' && x.entity_name === 'R-1' && x.search_text.includes('rejected level 1/2'), JSON.stringify(x));
  assert(y.display_action === 'UPDATE' && y.entity_label === 'WorkOrder', JSON.stringify(y));
  return `${rows.length} decisions checked`;
});
await check('audit list: row visibility is the audit_logs RLS (other office and non-auditors see none)', async () => {
  const admin = (await as(ADMIN, `select count(*)::int n from v_audit_log_list`)).rows[0].n;
  const adminBase = (await as(ADMIN, `select count(*)::int n from audit_logs`)).rows[0].n;
  const viewer = (await as(VIEWER, `select count(*)::int n from v_audit_log_list`)).rows[0].n;
  const viewerBase = (await as(VIEWER, `select count(*)::int n from audit_logs`)).rows[0].n;
  const fmHo = (await as(FM_DQ, `select count(*)::int n from v_audit_log_list where company_id = '${HO}'`)).rows[0].n;
  assert(admin === adminBase && admin > 0 && viewer === viewerBase && fmHo === 0, JSON.stringify({ admin, adminBase, viewer, viewerBase, fmHo }));
  return JSON.stringify({ admin, viewer, fmHo });
});
await check('anon cannot read the audit list', () => asAnon(`select * from v_audit_log_list`), 'permission denied');

// ---------------------------------------------------------------- office record counts
await check('office record counts equal the rows each user can see per office', async () => {
  for (const uid of [ADMIN, VIEWER, OTHER]) {
    const got = (await as(uid, `select company_id, vehicles::int, employees::int, invoices::int from office_record_counts() order by company_id`)).rows;
    const want = (await as(uid, `select c.id company_id,
        (select count(*) from vehicles v where v.company_id = c.id)::int vehicles,
        (select count(*) from employees e where e.company_id = c.id)::int employees,
        (select count(*) from invoices i where i.company_id = c.id)::int invoices from companies c order by c.id`)).rows;
    assert(JSON.stringify(got) === JSON.stringify(want), JSON.stringify({ uid, got, want }));
  }
  const ho = (await as(ADMIN, `select vehicles::int, invoices::int from office_record_counts() where company_id = '${HO}'`)).rows[0];
  const dq = (await as(OTHER, `select company_id from office_record_counts()`)).rows.map(r => r.company_id);
  assert(ho.vehicles === 1 && ho.invoices === 1 && JSON.stringify(dq) === JSON.stringify([DQ]), JSON.stringify({ ho, dq }));
  return JSON.stringify(ho);
});
await check('anon cannot run office_record_counts', () => asAnon(`select * from office_record_counts()`), 'permission denied');

t.report();
