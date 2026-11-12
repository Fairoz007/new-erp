// Data-driven roles and per-office role assignment: migration 20261112000100_roles_permissions.sql
// Standalone: node supabase/tests/20261112000100_roles.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET, OTHER, HO, DQ } = IDS;
const MIX = '00000000-0000-0000-0000-0000000000e1';   // Finance Manager in HO, Viewer in DQ
const ORG = '00000000-0000-0000-0000-0000000000e2';   // org-level Viewer (all offices)
const CA  = '00000000-0000-0000-0000-0000000000e3';   // Admin, member of HO
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const n = async (uid, sql) => Number(Object.values((await as(uid, sql)).rows[0])[0]);
const role = (name) => `(select id from public.roles where name = '${name}')`;

await asServer(`
  insert into auth.users (id, email) values ('${MIX}','mix@x'), ('${ORG}','org@x'), ('${CA}','ca@x');
  update profiles set role_id = ${role('Viewer')} where id = '${MIX}';
  update profiles set role_id = ${role('Viewer')}, all_offices = true where id = '${ORG}';
  update profiles set role_id = ${role('Admin')} where id = '${CA}';
  insert into company_members (user_id, company_id, role_id) values ('${MIX}','${HO}', ${role('Finance Manager')}), ('${MIX}','${DQ}', null);
  insert into company_members (user_id, company_id) values ('${CA}','${HO}');
  insert into vehicles (company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
    values ('${DQ}','VH-900','DQ-1','Bus','Ops','Toyota','Coaster','Diesel','Manual');
`);

await check('default roles exist (incl. HR Manager, Sponsor) and are system roles', async () => {
  const r = await val(`select string_agg(name, ',' order by sort_order) from roles where is_system`);
  for (const nme of ['Super Admin','Admin','Finance Manager','Accountant','Fleet Manager','HR Manager','Maintenance Manager','Procurement','Sponsor','Viewer'])
    assert(r.includes(nme), 'missing ' + nme);
  return r;
});
await check('existing profiles migrated to role_id', async () => {
  const k = await val(`select count(*)::int from profiles where role_id is null`);
  assert(k === 0, 'null role_id ' + k);
  assert(await val(`select r.name from profiles p join roles r on r.id = p.role_id where p.id = '${FLEET}'`) === 'Fleet Manager', 'fleet');
  return 'ok';
});
await check('no office policy still pairs my_company_ids() with a global has_perm()', async () => {
  const bad = await val(`select string_agg(tablename || '.' || policyname, ', ') from pg_policies
    where schemaname = 'public' and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'my_company_ids'
      and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'has_perm'`);
  assert(!bad, bad); return 'clean';
});

// --- per-office roles
await check('Finance Manager in HO can create an expense in HO', () =>
  tx(MIX, `insert into expenses (company_id, date, category, description, unit_price, total, payment_method)
           values ('${HO}', current_date, 'Fuel', 'diesel', 10, 10, 'Cash')`));
await check('...but is only Viewer in DQ: expense insert in DQ denied', () =>
  tx(MIX, `insert into expenses (company_id, date, category, description, unit_price, total, payment_method)
           values ('${DQ}', current_date, 'Fuel', 'diesel', 10, 10, 'Cash')`), 'row-level security');
await check('...can see invoices of HO only (Viewer role has no invoices access)', async () => {
  await asServer(`insert into invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date)
    values ('${HO}','P-HO','Purchase','Supplier','33333333-3333-3333-3333-333333333333',current_date,current_date),
           ('${DQ}','P-DQ','Purchase','Supplier','33333333-3333-3333-3333-333333333333',current_date,current_date)`);
  const r = (await as(MIX, `select string_agg(invoice_number, ',') v from invoices`)).rows[0].v;
  assert(r === 'P-HO', r); return r;
});
await check('...sees vehicles in both offices (both roles have vehicles:view)', async () => {
  const k = await n(MIX, `select count(*) from vehicles`); assert(k === 2, 'n=' + k); return 'n=2';
});
await check('perm_company_ids returns only the offices granting the permission', async () => {
  const r = (await as(MIX, `select perm_company_ids('expenses','create') a, perm_company_ids('vehicles','view') b`)).rows[0];
  assert(r.a.length === 1 && r.a[0] === HO && r.b.length === 2, JSON.stringify(r)); return 'ok';
});
await check('can_approve_in: FM limit applies in HO, not in DQ', async () => {
  const r = (await as(MIX, `select can_approve_in('${HO}','invoice', 99999) a, can_approve_in('${DQ}','invoice', 1) b`)).rows[0];
  assert(r.a === true && r.b === false, JSON.stringify(r)); return JSON.stringify(r);
});
await check('RPC uses the office role: MIX cannot post a journal in DQ', () =>
  tx(MIX, `select post_journal_entry('${DQ}', current_date, 'x', '[{"account_code":"5000","debit":1},{"account_code":"1010","credit":1}]')`), 'Permission denied');

// --- cross-office isolation
await check('Fleet Manager of DQ sees no HO rows (vehicles, expenses)', async () => {
  const a = await n(OTHER, `select count(*) from vehicles where company_id = '${HO}'`);
  const b = await n(OTHER, `select count(*) from expenses where company_id = '${HO}'`);
  assert(a === 0 && b === 0, `${a}/${b}`); return '0/0';
});
await check('Fleet Manager of DQ cannot update an HO vehicle', async () => {
  await as(OTHER, `update vehicles set notes = 'hack' where company_id = '${HO}'`);
  const v = await val(`select count(*)::int from vehicles where notes = 'hack'`);
  assert(v === 0, 'updated ' + v); return 'blocked';
});
await check('organization-level user (all_offices) sees every office', async () => {
  const k = await n(ORG, `select count(*) from companies`); assert(k === 2, 'n=' + k);
  const v = await n(ORG, `select count(*) from vehicles`); assert(v === 2, 'v=' + v); return 'offices 2, vehicles 2';
});

// --- role management
await check('Super Admin clones Fleet Manager into a custom role with the same grants', async () => {
  await tx(ADMIN, `select create_role('Depot Supervisor', 'Runs one depot', ${role('Fleet Manager')})`);
  const a = await val(`select count(*)::int from role_grants where role_id = ${role('Depot Supervisor')}`);
  const b = await val(`select count(*)::int from role_grants where role_id = ${role('Fleet Manager')}`);
  assert(a === b && a > 0, `${a} vs ${b}`); return `${a} grants`;
});
await check('duplicate role names rejected (case-insensitive)', () => tx(ADMIN, `select create_role('depot supervisor')`), 'already exists');
await check('rename a role', async () => {
  await tx(ADMIN, `select update_role(${role('Depot Supervisor')}, 'Depot Lead', 'Leads a depot')`);
  return await val(`select name from roles where name = 'Depot Lead'`);
});
await check('custom role grants drive RLS: assign Depot Lead in DQ, then remove vehicles:view', async () => {
  await asServer(`update company_members set role_id = ${role('Depot Lead')} where user_id = '${MIX}' and company_id = '${DQ}'`);
  await tx(ADMIN, `select set_role_grants(${role('Depot Lead')}, '[{"module":"expenses","action":"view"}]')`);
  const k = await n(MIX, `select count(*) from vehicles where company_id = '${DQ}'`);
  assert(k === 0, 'still sees ' + k); return 'DQ vehicles hidden';
});
await check('assigned custom role cannot be deleted', () => tx(ADMIN, `select delete_role(${role('Depot Lead')})`), 'still assigned');
await check('system role cannot be deleted', () => tx(ADMIN, `select delete_role(${role('Viewer')})`), 'cannot be deleted');
await check('Admin cannot change role definitions', () =>
  tx(CA, `select set_role_grants(${role('Viewer')}, '[{"module":"payroll","action":"delete"}]')`), 'only a Super Admin');
await check('Admin cannot create roles', () => tx(CA, `select create_role('Sneaky')`), 'only a Super Admin');
await check('Super Admin role cannot be assigned per office', () =>
  asServer(`insert into company_members (user_id, company_id, role_id) values ('${VIEWER}','${DQ}', ${role('Super Admin')})`), 'organization role');
await check('user cannot change their own office role', async () => {
  await as(MIX, `update company_members set role_id = ${role('Finance Manager')} where user_id = '${MIX}' and company_id = '${DQ}'`).catch(() => undefined);
  const r = await val(`select r.name from company_members m join roles r on r.id = m.role_id where m.user_id = '${MIX}' and m.company_id = '${DQ}'`);
  assert(r === 'Depot Lead', 'changed to ' + r); return 'unchanged';
});
await check('user cannot promote self via role_id', () =>
  tx(FLEET, `update profiles set role_id = ${role('Super Admin')} where id = '${FLEET}'`), true);
await check('Admin cannot grant Super Admin', () =>
  tx(CA, `update profiles set role_id = ${role('Super Admin')} where id = '${VIEWER}'`), 'only a Super Admin');
await check('legacy bootstrap still works: server-side `set role = Super Admin` resolves role_id', async () => {
  await asServer(`update profiles set role = 'Super Admin' where id = '${VIEWER}'`);
  const r = (await as(VIEWER, `select is_super_admin() s`)).rows[0].s;
  await asServer(`update profiles set role_id = ${role('Viewer')}, all_offices = false where id = '${VIEWER}'`);
  assert(r === true, 'not super'); return 'super';
});
await check('set_user_office_roles assigns offices with roles atomically', async () => {
  const viewerId = await val(`select id from roles where name = 'Viewer'`);
  const payload = JSON.stringify([{ company_id: DQ, role_id: null }, { company_id: HO, role_id: viewerId }]);
  await tx(ADMIN, `select set_user_office_roles('${OTHER}', '${payload}'::jsonb)`);
  const r = await val(`select string_agg(c.code || ':' || coalesce(r.name,'-'), ',' order by c.code) from company_members m join companies c on c.id = m.company_id left join roles r on r.id = m.role_id where m.user_id = '${OTHER}'`);
  assert(r === 'DQ:-,HO:Viewer', r); return r;
});
await check('approval actions record the custom role name', async () => {
  await asServer(`insert into approval_requests (id, company_id, reference_type, reference_id, reference_number, amount, requested_by)
                  values ('99999999-0000-0000-0000-0000000000e1','${HO}','Invoice','${HO}','INV-X', 10, '${ADMIN}')`);
  await tx(MIX, `select decide_approval('99999999-0000-0000-0000-0000000000e1', 'Rejected', 'wrong amount')`);
  return await val(`select approver_role_name from approval_actions where request_id = '99999999-0000-0000-0000-0000000000e1'`);
});

t.report();
