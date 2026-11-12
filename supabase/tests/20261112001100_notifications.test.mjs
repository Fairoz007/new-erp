// Phase 10 notifications: new leave requests notify the office's leave approvers; overdue invoices
// are raised by the daily refresh. Migration 20261112001100_notifications.sql
// Standalone: node supabase/tests/20261112001100_notifications.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, HO, DQ } = IDS;
const HRM = '00000000-0000-0000-0000-0000000000f1';   // HR Manager in HO (approves leave)
const HR2 = '00000000-0000-0000-0000-0000000000f2';   // HR Manager in DQ only
const CLK = '00000000-0000-0000-0000-0000000000f3';   // Finance Manager in HO: may request, not approve
const role = (name) => `(select id from public.roles where name = '${name}')`;
const YEAR = new Date().getFullYear() - 1;
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };

await asServer(`
  insert into auth.users (id, email) values ('${HRM}','h1@x.com'), ('${HR2}','h2@x.com'), ('${CLK}','c@x.com');
  update profiles set role_id = ${role('HR Manager')} where id in ('${HRM}','${HR2}');
  update profiles set role_id = ${role('Finance Manager')} where id = '${CLK}';
  insert into company_members (user_id, company_id) values ('${HRM}','${HO}'), ('${HR2}','${DQ}'), ('${CLK}','${HO}');
  insert into role_grants (role_id, module, action) select ${role('HR Manager')}, 'leave', 'approve' on conflict do nothing;
  insert into role_grants (role_id, module, action) select ${role('Finance Manager')}, m, a::permission_action
    from (values ('hr','view'),('leave','view'),('leave','create')) v(m, a) on conflict do nothing;
  delete from role_grants where role_id = ${role('Finance Manager')} and module = 'leave' and action = 'approve';
`);
const EMP = (await as(HRM, `insert into employees (company_id, employee_code, name, designation, department, joining_date, basic_salary)
  values ('${HO}','N-1','Hamad','Driver','Operations','${YEAR}-01-01',300) returning id`)).rows[0].id;

let LR;
await check('a new leave request notifies the leave approvers of that office by name', async () => {
  LR = (await as(CLK, `insert into leave_requests (company_id, employee_id, leave_type_id, start_date, end_date)
    values ('${HO}','${EMP}',(select id from leave_types where code = 'UNPAID'),'${YEAR}-03-02','${YEAR}-03-03') returning id`)).rows[0].id;
  const users = (await asServer(`select user_id from notifications where type = 'leave_request' and reference_id = '${LR}' order by user_id`)).rows.map(r => r.user_id);
  assert(users.includes(HRM) && users.includes(ADMIN), JSON.stringify(users)); return `${users.length} approver(s)`;
});
await check('the requester and users without approve rights are not notified', async () => {
  const n = await val(`select count(*)::int from notifications where type = 'leave_request' and reference_id = '${LR}' and user_id in ('${CLK}','${HR2}')`);
  assert(n === 0, n); return 'not notified';
});
await check('the approver sees the alert; the requester does not', async () => {
  const a = (await as(HRM, `select count(*)::int n from notifications where type = 'leave_request'`)).rows[0].n;
  const b = (await as(CLK, `select count(*)::int n from notifications where type = 'leave_request'`)).rows[0].n;
  assert(a === 1 && b === 0, JSON.stringify({ a, b })); return 'scoped';
});
await check('the decision notifies the requester', async () => {
  await as(HRM, `select review_leave('${LR}', 'Approved')`);
  const n = (await as(CLK, `select count(*)::int n from notifications where type = 'leave_review' and reference_id = '${LR}'`)).rows[0].n;
  assert(n === 1, n); return 'notified';
});
await check('a request in another office notifies that office only', async () => {
  const e2 = (await as(HR2, `insert into employees (company_id, employee_code, name, designation, department, joining_date, basic_salary)
    values ('${DQ}','N-2','Nasser','Driver','Operations','${YEAR}-01-01',300) returning id`)).rows[0].id;
  await asServer(`insert into company_members (user_id, company_id) values ('${CLK}','${DQ}')`);
  const id = (await as(CLK, `insert into leave_requests (company_id, employee_id, leave_type_id, start_date, end_date)
    values ('${DQ}','${e2}',(select id from leave_types where code = 'UNPAID'),'${YEAR}-04-01','${YEAR}-04-01') returning id`)).rows[0].id;
  const users = (await asServer(`select user_id from notifications where type = 'leave_request' and reference_id = '${id}'`)).rows.map(r => r.user_id);
  assert(users.includes(HR2) && !users.includes(HRM), JSON.stringify(users)); return 'office-scoped';
});
await check('the helper function is not callable by users', async () => {
  try { await as(HRM, `select public._users_with_perm_in('${HO}', 'leave', 'approve')`); } catch (e) { return 'denied'; }
  throw new Error('callable');
});
await check('the daily refresh raises one overdue alert per approved open invoice, none for drafts', async () => {
  const sup = '33333333-3333-3333-3333-333333333333';
  const inv = await val(`insert into invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date)
    values ('${HO}', 'BILL-OVD-1', 'Purchase', 'Supplier', '${sup}', '${YEAR}-01-05', '${YEAR}-02-05') returning id`);
  await asServer(`insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, gl_account_code) values ('${inv}', 1, 'Parts', 1, 50, '5000')`);
  const open = await val(`select outstanding_amount from invoices where id = '${inv}'`);
  await asServer(`select refresh_expiry_notifications(null)`);
  const draft = await val(`select count(*)::int from notifications where type = 'invoice_overdue' and reference_id = '${inv}'`);
  assert(draft === 0, `draft alerted: ${draft}`);
  await asServer(`update invoices set approval_status = 'Approved' where id = '${inv}'`);
  await asServer(`select refresh_expiry_notifications(null)`); await asServer(`select refresh_expiry_notifications(null)`);
  const n = await val(`select count(*)::int from notifications where type = 'invoice_overdue' and reference_id = '${inv}'`);
  assert(Number(open) > 0 && n === 1, JSON.stringify({ open, n })); return `outstanding ${open}, ${n} alert`;
});

t.report();
