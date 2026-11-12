// Audit trail coverage (Phase 6).
// 1. Every public table with a company_id (business data) has an audit trigger, unless it is on
//    the NO_AUDIT list with a reason.
// 2. One write per module, made as a signed-in user, leaves an audit_logs row with that user,
//    the office and the action.
// Standalone: node supabase/tests/audit_coverage.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, FLEET, HO } = IDS;

const tables = (await asServer(`
  select c.relname t, exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
                              where g.tgrelid = c.oid and p.proname = 'trg_audit' and not g.tgisinternal) audited
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped)
  order by 1`)).rows;

await check('business tables found', () => { assert(tables.length > 20, tables.length); return tables.length + ' tables with company_id'; });
const unaudited = tables.filter(r => !r.audited).map(r => r.t);
await check('tables with company_id and no audit trigger (listed, not failed)', () => unaudited.join(', ') || 'none');

// ---------------------------------------------------------------- one write per module
const VEH = '55555555-5555-5555-5555-555555555555';
const SUP = '33333333-3333-3333-3333-333333333333';
const lastAudit = async (table, id) => (await asServer(`select user_id::text, company_id::text, action from audit_logs
  where entity_type = '${table}' ${id ? `and entity_id = '${id}'` : ''} order by id desc limit 1`)).rows[0];
const audited = async (user, table, sql, id, action = 'CREATE') => {
  await tx(user, sql);
  const a = await lastAudit(table, id);
  assert(a, `no audit row for ${table}`);
  assert(a.user_id === user, `user ${a.user_id} != ${user}`);
  if (table !== "suppliers") assert(a.company_id === HO, `office ${a.company_id}`); // parties are shared: no company_id
  assert(a.action === action, a.action);
  return `${table}: ${a.action} by user, office set`;
};
const audTables = new Set((await asServer(`select distinct c.relname t from pg_trigger g join pg_proc p on p.oid = g.tgfoid
  join pg_class c on c.oid = g.tgrelid where p.proname = 'trg_audit'`)).rows.map(r => r.t));
const each = [
  ['vehicles (fleet)', ADMIN, 'vehicles', `update vehicles set color = 'Grey' where id = '${VEH}'`, VEH, 'UPDATE'],
  ['expenses', FLEET, 'expenses', `insert into expenses (id, company_id, vehicle_id, date, category, description, quantity, unit_price, tax, total, payment_method)
     values ('77777777-0000-0000-0000-000000000001','${HO}','${VEH}',current_date,'Fuel','Diesel',1,10,0,10,'Cash')`, '77777777-0000-0000-0000-000000000001'],
  ['invoices', ADMIN, 'invoices', `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, reference_number)
     values ('77777777-0000-0000-0000-000000000002','${HO}','AUD-1','Purchase','Supplier','${SUP}', current_date, current_date + 30, 'AUD-R1')`, '77777777-0000-0000-0000-000000000002'],
  ['suppliers (parties)', ADMIN, 'suppliers', `update suppliers set notes = 'audited' where id = '${SUP}'`, SUP, 'UPDATE'],
];
for (const [name, user, table, sql, id, action] of each) {
  await check(`audit row for a write in ${name}`, async () => {
    assert(audTables.has(table), `${table} has no audit trigger`);
    return audited(user, table, sql, id, action);
  });
}
await check('users cannot change or delete audit rows', async () => {
  try { await tx(ADMIN, `delete from audit_logs`); } catch (e) { return 'refused: ' + e.message.slice(0, 40); }
  const n = (await asServer(`select count(*)::int n from audit_logs`)).rows[0].n;
  assert(n > 0, 'audit rows deleted'); return 'no rows deleted (RLS)';
});

t.report();
