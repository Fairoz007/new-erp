// Office-scoped document numbers carry the office code, so two offices never issue the same number.
import { setup, seedFixtures, IDS } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, asServer, assert } = t;
const { HO, DQ } = IDS;
await seedFixtures(t.db);

await check('every office-scoped format includes the office code', async () => {
  const r = (await asServer(`select doc_type from public.document_formats where scope = 'office' and not include_office_code`)).rows;
  assert(r.length === 0, r.map(x => x.doc_type).join(', ')); return 'all';
});
await check('organization-wide codes (suppliers, customers) stay without an office code', async () => {
  const r = (await asServer(`select doc_type from public.document_formats where scope = 'organization' and include_office_code`)).rows;
  assert(r.length === 0, r.map(x => x.doc_type).join(', ')); return 'none';
});
await check('the first vehicle in two offices gets two different codes', async () => {
  await asServer(`insert into public.vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission) values
    ('${HO}', 'T1', 'Bus', 'Operations', 'A', 'B', 'Diesel', 'Manual'), ('${DQ}', 'T2', 'Bus', 'Operations', 'A', 'B', 'Diesel', 'Manual')`);
  const r = (await asServer(`select c.code, v.vehicle_code from public.vehicles v join public.companies c on c.id = v.company_id where plate_number in ('T1','T2') order by 1`)).rows;
  assert(r[0].vehicle_code !== r[1].vehicle_code, JSON.stringify(r));
  assert(r.every(x => x.vehicle_code.includes(x.code)), JSON.stringify(r));
  return r.map(x => x.vehicle_code).join(', ');
});
await check('invoice numbers of two offices differ', async () => {
  const a = (await asServer(`select public.preview_doc_number('sales_invoice', '${HO}') n`)).rows[0].n;
  const b = (await asServer(`select public.preview_doc_number('sales_invoice', '${DQ}') n`)).rows[0].n;
  assert(a !== b && a.includes('-HO-') && b.includes('-DQ-'), `${a} ${b}`); return `${a}, ${b}`;
});
await check('a supplier bill raised from a maintenance record follows the format (office code)', async () => {
  await asServer(`insert into public.suppliers (id, supplier_code, name, supplier_type) values ('33333333-0000-0000-0000-000000000001', 'SUP-T1', 'Garage T', 'Garage');
    insert into public.vehicles (id, company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission) values
      ('55555555-0000-0000-0000-000000000001', '${DQ}', 'T3', 'Bus', 'Operations', 'A', 'B', 'Diesel', 'Manual');
    insert into public.maintenance_records (company_id, vehicle_id, maintenance_date, maintenance_type, category, description, supplier_id, parts_cost)
      values ('${DQ}', '55555555-0000-0000-0000-000000000001', '2026-11-12', 'Corrective Maintenance', 'General Service', 'Brakes', '33333333-0000-0000-0000-000000000001', 45)`);
  const n = (await asServer(`select invoice_number from public.invoices where supplier_id = '33333333-0000-0000-0000-000000000001'`)).rows[0]?.invoice_number;
  assert(/^PINV-DQ-2026-\d{4}$/.test(n || ''), String(n)); return n;
});
// submit_manual_journal keeps 'JR-': the number of a journal waiting for approval, which has no
// numbering format of its own (the journal it becomes is numbered by the 'journal' format).
await check('no function builds a document number from a fixed prefix (all use doc_prefix)', async () => {
  const r = (await asServer(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname <> 'submit_manual_journal'
       and pg_get_functiondef(p.oid) ~ 'next_doc_number\\([^,()]+,\\s*''[A-Z]+-'''`)).rows;
  assert(r.length === 0, r.map(x => x.proname).join(', ')); return 'none';
});
t.report();
