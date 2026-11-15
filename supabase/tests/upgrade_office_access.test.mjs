// Upgrade stage 7: office access screens ("All offices" / "Chosen offices" with a role per office).
// The screens write profiles.all_offices and company_members through the existing guards; these
// checks pin the rules they show: All offices covers offices created later, Chosen offices covers
// only the chosen ones (with the role set there), and only a Super Admin can give All offices.
import { setup, seedFixtures, IDS } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, as, tx, asServer, assert } = t;
await seedFixtures(t.db);
const { ADMIN, VIEWER, OTHER, HO, DQ } = IDS;
const ALL = '00000000-0000-0000-0000-0000000000a7';    // Viewer with All offices
const ADM = '00000000-0000-0000-0000-0000000000a8';    // Admin (not Super Admin) of Head Office
const NEW = '66666666-0000-0000-0000-000000000001';    // office created after the users were set up
const ids = async (uid) => (await as(uid, `select array_agg(id::text order by code) a from companies`)).rows[0].a ?? [];

await asServer(`insert into auth.users (id, email) values ('${ALL}','all@x.com'), ('${ADM}','adm@x.com');
  update profiles set role_id = (select id from roles where name = 'Viewer') where id = '${ALL}';
  update profiles set role_id = (select id from roles where name = 'Admin') where id = '${ADM}';
  insert into company_members (user_id, company_id) values ('${ADM}','${HO}');`);

await check('a Super Admin can give All offices', async () => {
  await tx(ADMIN, `update profiles set all_offices = true where id = '${ALL}'`);
  const r = (await asServer(`select all_offices from profiles where id = '${ALL}'`)).rows[0];
  assert(r.all_offices === true, JSON.stringify(r));
  return 'set';
});

await check('an All offices user also sees an office created later', async () => {
  const before = await ids(ALL);
  await tx(ADMIN, `insert into companies (id, name, code) values ('${NEW}','Nisfa','NSF')`);
  const after = await ids(ALL);
  assert(before.length === 2 && after.length === 3 && after.includes(NEW), `${before} -> ${after}`);
  return `${before.length} → ${after.length} offices`;
});

await check('a Chosen offices user sees only the chosen offices', async () => {
  const v = await ids(VIEWER), o = await ids(OTHER);
  assert(v.length === 1 && v[0] === HO, `viewer ${v}`);
  assert(o.length === 1 && o[0] === DQ, `other ${o}`);
  const veh = (await as(OTHER, `select count(*)::int n from vehicles where company_id = '${HO}'`)).rows[0].n;
  assert(veh === 0, `Duqm user sees ${veh} Head Office vehicles`);
  return 'Head Office only / Duqm only';
});

await check('the role chosen for an office applies in that office only', async () => {
  const fm = (await asServer(`select id from roles where name = 'Fleet Manager'`)).rows[0].id;
  await tx(ADMIN, `select set_user_office_roles('${VIEWER}', '[{"company_id":"${HO}","role_id":"${fm}"},{"company_id":"${DQ}","role_id":null}]'::jsonb)`);
  const r = (await as(VIEWER, `select public.can_in('${HO}','vehicles','edit') ho, public.can_in('${DQ}','vehicles','edit') dq`)).rows[0];
  assert(r.ho === true && r.dq === false, JSON.stringify(r));
  await tx(ADMIN, `select set_user_office_roles('${VIEWER}', '[{"company_id":"${HO}","role_id":null}]'::jsonb)`);
  return 'Fleet Manager in Head Office, Viewer in Duqm';
});

await check('a non-Super Admin cannot give All offices', async () => {
  await tx(ADM, `update profiles set all_offices = true where id = '${VIEWER}'`);
}, true);

await check('a non-Super Admin cannot invite an All offices user', async () => {
  const viewer = (await asServer(`select id from roles where name = 'Viewer'`)).rows[0].id;
  await tx(ADM, `select create_invitation('new.person@x.com', 'New Person', '${viewer}', true, '[]'::jsonb)`);
}, true);

await check('the overview reads memberships the admin may see, and nothing about other users\' offices it cannot see', async () => {
  const rows = (await as(OTHER, `select user_id::text u, company_id::text c from company_members`)).rows;
  assert(rows.every(r => r.c === DQ || r.u === OTHER), JSON.stringify(rows));
  return `${rows.length} row(s), own office only`;
});

t.report();
