// Upgrade stage 6: office edit panel. The panel saves through the same companies update as before;
// these checks pin what it relies on: the audit trail keeps old and new values of an edit, the code
// stays unique, a stale save is refused, only users with companies:edit for that office can save,
// and a logo can only be stored inside the office's own folder by those users.
import { setup, seedFixtures, IDS } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, as, tx, asServer, assert } = t;
await seedFixtures(t.db);
const { ADMIN, VIEWER, OTHER, HO, DQ } = IDS;   // VIEWER: Head Office, no companies:edit; OTHER: Fleet Manager of Duqm
const ADM_DQ = '00000000-0000-0000-0000-0000000000e1';   // a role with companies:edit, member of DQ only

const editRole = (await asServer(`select r.name from role_grants g join roles r on r.id = g.role_id
  where g.module = 'companies' and g.action = 'edit' and not r.is_super order by r.name limit 1`)).rows[0]?.name;
if (editRole) {
  await asServer(`insert into auth.users (id, email) values ('${ADM_DQ}','adm-dq@x.com');
    update profiles set role_id = (select id from roles where name = '${editRole}') where id = '${ADM_DQ}';
    insert into company_members (user_id, company_id) values ('${ADM_DQ}','${DQ}');`);
}

await check('editing an office name leaves an audit row with the old and the new name', async () => {
  await tx(ADMIN, `update companies set name = 'Head Office Ghala' where id = '${HO}'`);
  const a = (await asServer(`select action, user_id::text uid, old_value->>'name' old_name, new_value->>'name' new_name
    from audit_logs where entity_type = 'companies' and entity_id = '${HO}' order by id desc limit 1`)).rows[0];
  assert(a, 'no audit row');
  assert(a.action === 'UPDATE' && a.uid === ADMIN, JSON.stringify(a));
  assert(a.old_name === 'Head Office' && a.new_name === 'Head Office Ghala', JSON.stringify(a));
  await tx(ADMIN, `update companies set name = 'Head Office' where id = '${HO}'`);
  return `${a.old_name} → ${a.new_name}`;
});

await check('office codes stay unique', async () => {
  await tx(ADMIN, `update companies set code = 'HO' where id = '${DQ}'`);
}, true);

await check('a save from a stale copy is refused (updatedAt check)', async () => {
  const before = (await asServer(`select updated_at::text u from companies where id = '${HO}'`)).rows[0].u;
  await tx(ADMIN, `update companies set phone = '9226 2277' where id = '${HO}'`);
  await tx(ADMIN, `update companies set phone = '9693 6065', updated_at = '${before}' where id = '${HO}'`);
}, true);

await check('a user without companies:edit cannot change an office', async () => {
  await tx(VIEWER, `update companies set name = 'Changed' where id = '${HO}'`);
  const n = (await asServer(`select name from companies where id = '${HO}'`)).rows[0].name;
  assert(n === 'Head Office', n);
  return 'no row changed';
});

await check('an office admin of Duqm can edit Duqm but not Head Office', async () => {
  if (!editRole) return 'no non-super role has companies:edit (skipped)';
  await tx(ADM_DQ, `update companies set city = 'Duqm' where id = '${DQ}'`);
  await tx(ADM_DQ, `update companies set city = 'Changed' where id = '${HO}'`);
  const r = (await asServer(`select (select city from companies where id = '${DQ}') dq, (select city from companies where id = '${HO}') ho`)).rows[0];
  assert(r.dq === 'Duqm' && r.ho !== 'Changed', JSON.stringify(r));
  return `${editRole}: Duqm saved, Head Office unchanged`;
});

await check('office logos can be stored only in the office\'s own folder', async () => {
  const can = async (uid, path) => (await as(uid, `select public.media_can_write('${path}') ok`)).rows[0].ok;
  assert(await can(ADMIN, `${HO}/logos/a-logo.png`), 'super admin');
  assert(!(await can(VIEWER, `${HO}/logos/a-logo.png`)), 'viewer has no companies:edit');
  assert(!(await can(OTHER, `${HO}/logos/a-logo.png`)), 'Duqm fleet manager, Head Office folder');
  assert(await can(OTHER, `${DQ}/logos/a-logo.png`), 'Duqm fleet manager, own folder');
  if (editRole) {
    assert(await can(ADM_DQ, `${DQ}/logos/a-logo.png`), 'own office');
    assert(!(await can(ADM_DQ, `${HO}/logos/a-logo.png`)), 'other office');
  }
  return 'own office only';
});

t.report();
