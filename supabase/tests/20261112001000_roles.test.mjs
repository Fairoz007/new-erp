// Roles finish: approval rules by role id (custom roles), statement-only access for Sponsors,
// role guards. Migration 20261112001000_roles.sql
// Standalone: node supabase/tests/20261112001000_roles.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET, HO, DQ } = IDS;
const SP = '00000000-0000-0000-0000-0000000000d1';    // Viewer overall, Sponsor in HO only
const CR = '00000000-0000-0000-0000-0000000000d2';    // custom role "Workshop Approver" in HO
const VEH = '55555555-5555-5555-5555-555555555555';
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const role = (name) => `(select id from public.roles where name = '${name}')`;
const today = new Date().toISOString().slice(0, 10);

await asServer(`
  insert into auth.users (id, email) values ('${SP}','sp@x.com'), ('${CR}','cr@x.com');
  update profiles set role_id = ${role('Viewer')} where id = '${SP}';
  insert into company_members (user_id, company_id, role_id) values ('${SP}','${HO}', ${role('Sponsor')}), ('${SP}','${DQ}', null);
  insert into accounts (company_id, code, name, category, subcategory) values ('${DQ}','5000','M','Expense','Direct'), ('${DQ}','1010','B','Asset','Cash') on conflict do nothing;
`);
await as(ADMIN, `select post_journal_entry('${HO}', '${today}', 'Fuel', '[{"account_code":"5000","debit":70},{"account_code":"1010","credit":70}]')`);
await as(ADMIN, `select post_journal_entry('${HO}', '${today}', 'Fuel 2', '[{"account_code":"5000","debit":30},{"account_code":"1010","credit":30}]')`);
await as(ADMIN, `select post_journal_entry('${DQ}', '${today}', 'Duqm', '[{"account_code":"5000","debit":5},{"account_code":"1010","credit":5}]')`);

// ---------------------------------------------------------------- Sponsor: statements, no detail
await check('the Sponsor cannot read journal lines or accounts directly', async () => {
  const j = (await as(SP, `select count(*)::int n from journal_lines`)).rows[0].n;
  const a = (await as(SP, `select count(*)::int n from accounts`)).rows[0].n;
  assert(j === 0 && a === 0, JSON.stringify({ j, a })); return 'no detail';
});
await check('the Sponsor gets account totals for the offices they sponsor only', async () => {
  const rows = (await as(SP, `select company_id, code, balance from statement_accounts() order by code`)).rows;
  assert(rows.length > 0 && rows.every(r => r.company_id === HO), JSON.stringify(rows));
  const exp = rows.find(r => r.code === '5000');
  assert(Number(exp.balance) === 100, JSON.stringify(exp)); return `${rows.length} accounts`;
});
await check('daily totals are summed per day and account, with no descriptions', async () => {
  const r = (await as(SP, `select * from statement_daily_totals() where account_code = '5000'`)).rows;
  assert(r.length === 1 && Number(r[0].debit) === 100 && !('description' in r[0]), JSON.stringify(r)); return r[0];
});
await check('the Sponsor can run the cash flow statement for their office', async () => {
  const n = (await as(SP, `select count(*)::int n from cash_flow_statement('${HO}', '${today.slice(0, 4)}-01-01', '${today}')`)).rows[0].n;
  assert(n > 0, n); return n;
});
await check('but not for an office they do not sponsor', () => tx(SP, `select * from cash_flow_statement('${DQ}', '${today.slice(0, 4)}-01-01', '${today}')`), 'Permission denied');
await check('users with ledger access get nothing from the statement functions (they read the ledger)', async () => {
  const n = (await as(ADMIN, `select count(*)::int n from statement_accounts()`)).rows[0].n;
  assert(n === 0, n); return 'none';
});
await check('the Sponsor has no write rights anywhere', async () => {
  const n = await val(`select count(*)::int from role_grants where role_id = ${role('Sponsor')} and action not in ('view', 'export', 'print')`);
  assert(n === 0, n); return 'read-only';
});
await check('the Sponsor cannot create an invoice or an expense', () =>
  tx(SP, `insert into expenses (company_id, vehicle_id, date, category, description, quantity, unit_price, tax, total, payment_method)
          values ('${HO}','${VEH}','${today}','Fuel','x',1,1,0,1,'Cash')`), 'row-level security');

// ---------------------------------------------------------------- approval rules by role id
let RID, RULE;
await check('a super admin creates a custom role by cloning Fleet Manager', async () => {
  RID = (await as(ADMIN, `select create_role('Workshop Approver', 'Approves big work orders', ${role('Fleet Manager')}) id`)).rows[0].id;
  await asServer(`update profiles set role_id = '${RID}' where id = '${CR}'; insert into company_members (user_id, company_id) values ('${CR}','${HO}');
    insert into role_approval_limits (role_id, module, max_amount) values ('${RID}', 'maintenance', null) on conflict (role_id, module) do update set max_amount = null`);
  return RID;
});
await check('viewer cannot edit approval rules', () => tx(VIEWER, `select save_approval_rule(null, 'maintenance', 100, array[${role('Admin')}])`), 'Permission denied');
await check('approval rules only cover work orders and invoices', () => tx(ADMIN, `select save_approval_rule(null, 'expense', 100, '{}')`), 'work orders');
await check('a rule can name a custom role', async () => {
  await asServer(`delete from approval_rules where module = 'maintenance'`);
  RULE = (await as(ADMIN, `select save_approval_rule(null, 'maintenance', 100, array['${RID}'::uuid], 'Big jobs') id`)).rows[0].id;
  const r = (await asServer(`select required_role_ids, required_roles from approval_rules where id = '${RULE}'`)).rows[0];
  assert(r.required_role_ids.length === 1 && (r.required_roles === '{}' || r.required_roles.length === 0), JSON.stringify(r)); return 'custom role';
});
let REQ;
await check('a work order above the threshold creates a request for that role', async () => {
  await as(FLEET, `insert into work_orders (company_id, work_order_number, vehicle_id, reported_date, problem_description, priority, status, approval_status, estimated_cost, requested_by)
    values ('${HO}','WO-R-001','${VEH}',current_date,'Gearbox overhaul','High','Requested','Not Required',900,'${FLEET}')`);
  const r = (await asServer(`select id, required_role_ids, total_levels from approval_requests where reference_number = 'WO-R-001'`)).rows[0];
  REQ = r.id;
  assert(r.required_role_ids.length === 1 && r.required_role_ids[0] === RID && r.total_levels === 1, JSON.stringify(r)); return 'routed';
});
await check('a user without the named role cannot decide it', () => tx(FLEET, `select decide_approval('${REQ}', 'Approved', 'ok')`), 'not authorised');
await check('the custom-role holder decides it', async () => {
  await as(CR, `select decide_approval('${REQ}', 'Approved', 'Looks right')`);
  const s = await val(`select status from approval_requests where id = '${REQ}'`);
  assert(s === 'Approved', s); return s;
});
await check('legacy rules (role names only) still route through their roles', async () => {
  const r = await val(`select count(*)::int from approval_rules where cardinality(required_roles) > 0 and cardinality(required_role_ids) = 0`);
  assert(r === 0, r); return 'backfilled';
});
await check('a rule can be deleted by an admin', async () => {
  await as(ADMIN, `select delete_approval_rule('${RULE}')`);
  const n = await val(`select count(*)::int from approval_rules where id = '${RULE}'`);
  assert(n === 0, n); return 'deleted';
});

// ---------------------------------------------------------------- role guards
await check('a role still assigned to users cannot be deleted', () => tx(ADMIN, `select delete_role('${RID}')`), 'assigned');
await check('system roles cannot be deleted', () => tx(ADMIN, `select delete_role(${role('Sponsor')})`), 'cannot be deleted');
await check('the super admin flag cannot be moved to another role', () => asServer(`update roles set is_super = true where id = '${RID}'`), 'cannot change');
await check('roles can be renamed', async () => {
  await as(ADMIN, `select update_role('${RID}', 'Workshop Lead', 'Approves work orders')`);
  const n = await val(`select name from roles where id = '${RID}'`);
  assert(n === 'Workshop Lead', n); return n;
});
await check('an unassigned custom role can be deleted', async () => {
  await asServer(`update profiles set role_id = ${role('Viewer')} where id = '${CR}'`);
  await as(ADMIN, `select delete_role('${RID}')`);
  const n = await val(`select count(*)::int from roles where id = '${RID}'`);
  assert(n === 0, n); return 'deleted';
});

t.report();
