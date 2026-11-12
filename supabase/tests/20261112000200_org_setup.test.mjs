// Organization, universal settings, custom fields, invitations and setup wizard:
// migration 20261112000200_organization_setup.sql
// Standalone: node supabase/tests/20261112000200_org_setup.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
// These checks cover the numbering mechanics with the formats as first installed (no office code);
// office_numbers.test.mjs covers the office code that 20261113007000 turns on.
await t.db.exec(`update public.document_formats set include_office_code = false;`);
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET, OTHER, HO, DQ } = IDS;
const SUP = '33333333-3333-3333-3333-333333333333';
const CA = '00000000-0000-0000-0000-0000000000f1';   // Admin (not super), member of HO
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const role = (name) => `(select id from public.roles where name = '${name}')`;
await asServer(`select public._seed_chart_of_accounts('${HO}'); select public._seed_chart_of_accounts('${DQ}');
  insert into auth.users (id, email) values ('${CA}','ca@x');
  update profiles set role_id = ${role('Admin')} where id = '${CA}';
  insert into company_members (user_id, company_id) values ('${CA}','${HO}');`);

// --- defaults on a fresh install
await check('default vehicle types (bus-first) are seeded', async () => {
  const r = await val(`select string_agg(name, ',' order by sort_order) from vehicle_types where is_system`);
  for (const n of ['Bus', 'Mini-bus', 'Coaster', 'Car', 'Pickup', 'Truck']) assert(r.includes(n), 'missing ' + n);
  return r;
});
await check('default expense categories map to accounts in the template chart', async () => {
  const bad = await val(`select string_agg(c.name, ',') from expense_categories c
                         where not exists (select 1 from account_templates a where a.code = c.gl_account_code)`);
  assert(!bad, 'unmapped: ' + bad); return 'all mapped';
});
await check('document formats seeded for every numbered document', async () =>
  String(await val(`select count(*)::int from document_formats`)));
await check('no organization row until the wizard creates one', async () => {
  const n = await val(`select count(*)::int from organizations`); assert(n === 0, 'n=' + n); return '0';
});

// --- organization
await check('non-super user cannot create the organization', () =>
  tx(CA, `insert into organizations (legal_name) values ('X LLC')`), 'row-level security');
await check('Super Admin creates the organization; existing offices are linked to it', async () => {
  await tx(ADMIN, `insert into organizations (legal_name, trade_name, base_currency, fy_start_month) values ('Acme Transport LLC', 'Acme', 'OMR', 1)`);
  const n = await val(`select count(*)::int from companies where organization_id is null`);
  assert(n === 0, 'unlinked ' + n); return 'linked';
});
await check('only one organization can exist', () => asServer(`insert into organizations (legal_name) values ('Second')`), 'duplicate key');
await check('invalid base currency rejected', () => tx(ADMIN, `update organizations set base_currency = 'rial'`), 'check constraint');
await check('every signed-in user can read the organization (branding)', async () =>
  (await as(VIEWER, `select legal_name from organizations`)).rows[0].legal_name);
await check('Admin with settings:edit can edit the profile but not the setup state', async () => {
  await tx(CA, `update organizations set address = 'Muscat'`);
  return tx(CA, `update organizations set setup_status = 'completed'`);
}, 'Only a Super Admin');
await check('Admin cannot change the base currency or override rules', () =>
  tx(CA, `update organizations set overridable_settings = '{currency}'`), 'Only a Super Admin');
await check('Viewer cannot edit the organization (update is filtered)', async () => {
  await as(VIEWER, `update organizations set legal_name = 'hacked'`);
  const n = await val(`select legal_name from organizations`); assert(n !== 'hacked', n); return n;
});

// --- office inherits universal settings
await check('new office inherits the organization currency', async () => {
  await tx(ADMIN, `insert into organizations (legal_name) select 'dup' where false;
                   update organizations set base_currency = 'AED';
                   insert into companies (id, name, code, currency) values ('11111111-0000-0000-0000-00000000000e', 'Sohar', 'SOH', 'USD')`);
  const c = await val(`select currency from companies where code = 'SOH'`);
  assert(c === 'AED', c); return c;
});
await check('new office gets its own chart of accounts and creator membership', async () => {
  const n = await val(`select count(*)::int from accounts where company_id = '11111111-0000-0000-0000-00000000000e'`);
  assert(n > 20, 'accounts ' + n); return n + ' accounts';
});
await check('office cannot override a setting that is not overridable', () =>
  tx(ADMIN, `update companies set settings_overrides = '{"payment_terms_days": 15}' where code = 'SOH'`), 'cannot be overridden');
await check('office can override once the Super Admin allows it; office_setting() returns it', async () => {
  await tx(ADMIN, `update organizations set overridable_settings = '{payment_terms_days}';
                   update companies set settings_overrides = '{"payment_terms_days": 15}' where code = 'SOH'`);
  const v = await val(`select office_setting(id, 'payment_terms_days')::text from companies where code = 'SOH'`);
  assert(v === '15', v); return v;
});
await check('office currency change blocked when currency is not overridable', () =>
  tx(ADMIN, `update companies set currency = 'USD' where code = 'SOH'`), 'follows the organization');

// --- masters
await check('Super Admin adds tax rates and terms; one default each', async () => {
  await tx(ADMIN, `insert into tax_rates (name, rate, is_default) values ('VAT 5%', 5, true), ('Zero rated', 0, false);
                   insert into payment_terms (name, days, is_default) values ('Net 30', 30, true), ('On receipt', 0, false)`);
  return tx(ADMIN, `insert into tax_rates (name, rate, is_default) values ('VAT 10', 10, true)`);
}, 'duplicate key');
await check('Viewer cannot add tax rates', () => tx(VIEWER, `insert into tax_rates (name, rate) values ('x', 1)`), 'row-level security');
await check('document formats can be edited but not deleted', async () => {
  await tx(ADMIN, `update document_formats set prefix = 'SI', include_office_code = true where doc_type = 'sales_invoice'`);
  return as(ADMIN, `delete from document_formats where doc_type = 'sales_invoice'`);
}, 'permission denied');
await check('sales invoice numbers follow the edited format (prefix + office code + year)', async () => {
  await tx(ADMIN, `insert into customers (id, name, customer_type, office_id) values ('77777777-0000-0000-0000-000000000001','Bus Co','Corporate','${HO}');
     insert into invoices (company_id, invoice_number, invoice_type, party_type, customer_id, invoice_date, due_date)
     values ('${HO}', null, 'Sales', 'Customer', '77777777-0000-0000-0000-000000000001', '2026-11-01', '2026-11-30')`);
  const n = await val(`select invoice_number from invoices where customer_id = '77777777-0000-0000-0000-000000000001'`);
  assert(n === 'SI-HO-2026-0001', n); return n;
});
await check('preview_doc_number shows the next number without consuming it', async () => {
  const a = (await as(ADMIN, `select preview_doc_number('sales_invoice', '${HO}') v`)).rows[0].v;
  const b = (await as(ADMIN, `select preview_doc_number('sales_invoice', '${HO}') v`)).rows[0].v;
  assert(a === b && a.endsWith('0002'), a + ' / ' + b); return a;
});
await check('journal numbers follow the journal format', async () => {
  await tx(ADMIN, `update document_formats set prefix = 'GJ', padding = 5 where doc_type = 'journal';
                   select post_journal_entry('${HO}', current_date, 'fmt', '[{"account_code":"5000","debit":1},{"account_code":"1010","credit":1}]')`);
  const n = await val(`select entry_number from journal_entries where description = 'fmt'`);
  assert(/^GJ-\d{4}-00001$/.test(n), n); return n;
});
await check('fee schedule with items (price list)', async () => {
  await tx(ADMIN, `insert into fee_schedules (id, name, is_default) values ('88888888-0000-0000-0000-000000000001', 'Standard 2026', true);
     insert into fee_items (schedule_id, code, name, unit_code, rate, vehicle_type_id)
     values ('88888888-0000-0000-0000-000000000001', 'BUS-DAY', 'Bus hire per day', 'DAY', 85, (select id from vehicle_types where name = 'Bus'))`);
  return String(await val(`select rate from fee_items where code = 'BUS-DAY'`));
});

// --- vehicle types
await check('vehicle linked to its type; seats default from the type', async () => {
  await tx(ADMIN, `insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
                   values ('${HO}', 'BUS-1', 'bus', 'Ops', 'Toyota', 'Coaster', 'Diesel', 'Manual')`);
  const r = (await asServer(`select v.vehicle_type, v.number_of_seats, t.is_bus from vehicles v join vehicle_types t on t.id = v.vehicle_type_id where plate_number = 'BUS-1'`)).rows[0];
  assert(r.vehicle_type === 'Bus' && r.number_of_seats === 50 && r.is_bus, JSON.stringify(r)); return JSON.stringify(r);
});
await check('unknown vehicle type rejected with a clear message', () =>
  tx(ADMIN, `insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
             values ('${HO}', 'X-1', 'Hovercraft', 'Ops', 'a', 'b', 'Diesel', 'Manual')`), 'Unknown vehicle type');
await check('default vehicle type cannot be deleted', () => tx(ADMIN, `delete from vehicle_types where name = 'Truck'`), 'cannot be deleted');

// --- expense categories
await check('expense picks GL account from its category', async () => {
  await tx(ADMIN, `insert into expenses (company_id, date, category, description, unit_price, total, payment_method)
                   values ('${HO}', current_date, 'rent', 'Nov rent', 500, 500, 'Bank Transfer')`);
  const r = (await asServer(`select category, gl_account_code, category_id is not null linked from expenses where description = 'Nov rent'`)).rows[0];
  assert(r.category === 'Rent' && r.gl_account_code === '5100' && r.linked, JSON.stringify(r)); return JSON.stringify(r);
});
await check('expense category must map to an expense account', () =>
  tx(ADMIN, `insert into expense_categories (name, gl_account_code) values ('Bad', '1010')`), 'not an expense account');
await check('category requiring a vehicle enforces it', async () => {
  await tx(ADMIN, `update expense_categories set requires_vehicle = true where name = 'Fuel'`);
  return tx(ADMIN, `insert into expenses (company_id, date, category, description, unit_price, total, payment_method)
                    values ('${HO}', current_date, 'Fuel', 'diesel', 10, 10, 'Cash')`);
}, 'requires a vehicle');
await check('recurring expense template scoped to office permissions', async () => {
  await tx(ADMIN, `insert into recurring_expenses (company_id, category_id, description, amount, day_of_month, start_date)
                   values ('${HO}', (select id from expense_categories where name = 'Rent'), 'Depot rent', 500, 1, '2026-01-01')`);
  const a = Number((await as(VIEWER, `select count(*) n from recurring_expenses`)).rows[0].n);
  const b = Number((await as(OTHER, `select count(*) n from recurring_expenses`)).rows[0].n);
  assert(b === 0, 'DQ user sees HO template'); return `HO viewer ${a}, DQ user ${b}`;
});

// --- custom fields
await check('custom field definitions: Super Admin adds bus-only and global fields', () =>
  tx(ADMIN, `insert into field_definitions (entity, key, label, field_type, required, vehicle_type_id)
               values ('vehicle', 'route_permit', 'Route permit no.', 'text', true, (select id from vehicle_types where name = 'Bus'));
             insert into field_definitions (entity, key, label, field_type, options)
               values ('vehicle', 'livery', 'Livery', 'dropdown', '["Blue","White"]');
             insert into field_definitions (entity, key, label, field_type) values ('employee', 'sponsor', 'Sponsor', 'text');
             insert into field_definitions (entity, key, label, field_type) values ('vehicle', 'seats_wheelchair', 'Wheelchair spaces', 'number')`));
await check('required custom field enforced server-side (bus without route permit)', () =>
  tx(ADMIN, `insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
             values ('${HO}', 'BUS-2', 'Bus', 'Ops', 'a', 'b', 'Diesel', 'Manual')`), 'Required field(s) missing: Route permit no.');
await check('bus-only field does not apply to a car', () =>
  tx(ADMIN, `insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
             values ('${HO}', 'CAR-1', 'Car', 'Ops', 'a', 'b', 'Petrol', 'Automatic')`));
await check('dropdown value must be one of the options', () =>
  tx(ADMIN, `insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission, custom_fields)
             values ('${HO}', 'BUS-3', 'Bus', 'Ops', 'a', 'b', 'Diesel', 'Manual', '{"route_permit":"RP1","livery":"Red"}')`), 'must be one of');
await check('number field coerces numeric strings; unknown keys rejected', async () => {
  await tx(ADMIN, `insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission, custom_fields)
             values ('${HO}', 'BUS-4', 'Bus', 'Ops', 'a', 'b', 'Diesel', 'Manual', '{"route_permit":"RP4","seats_wheelchair":"2"}')`);
  const v = await val(`select jsonb_typeof(custom_fields->'seats_wheelchair') from vehicles where plate_number = 'BUS-4'`);
  assert(v === 'number', v);
  return tx(ADMIN, `update vehicles set custom_fields = '{"route_permit":"RP4","colour":"x"}' where plate_number = 'BUS-4'`);
}, 'Unknown custom field');
await check('per-office visibility: field hidden in DQ is not required there', async () => {
  await tx(ADMIN, `insert into field_office_settings (field_id, office_id, visibility)
                   values ((select id from field_definitions where key = 'route_permit'), '${DQ}', 'hidden')`);
  return tx(ADMIN, `insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
                    values ('${DQ}', 'BUS-DQ', 'Bus', 'Ops', 'a', 'b', 'Diesel', 'Manual')`);
});
await check('per-office visibility: optional field made required for one office', async () => {
  await tx(ADMIN, `insert into field_office_settings (field_id, office_id, visibility)
                   values ((select id from field_definitions where key = 'sponsor'), '${HO}', 'required')`);
  return tx(ADMIN, `insert into employees (company_id, name, designation, department, joining_date, status, basic_salary)
                    values ('${HO}', 'Omar', 'Driver', 'Operations', '2026-01-01', 'Active', 300)`);
}, 'Sponsor');
await check('Viewer cannot define custom fields', () =>
  tx(VIEWER, `insert into field_definitions (entity, key, label, field_type) values ('client', 'x', 'X', 'text')`), 'row-level security');

// --- invitations
await check('Admin invites a user with office roles; signup applies them', async () => {
  const fm = await val(`select id from roles where name = 'Finance Manager'`);
  await tx(CA, `select create_invitation('New.Person@Acme.om', 'New Person', ${role('Viewer')}, false,
                 '[{"company_id":"${HO}","role_id":"${fm}"}]'::jsonb)`);
  await asServer(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'new.person@acme.om')`);
  const r = (await asServer(`select p.name, r.name role, (select mr.name from company_members m join roles mr on mr.id = m.role_id
      where m.user_id = p.id and m.company_id = '${HO}') office_role,
      (select status from user_invitations where email = 'new.person@acme.om') st
      from profiles p join roles r on r.id = p.role_id where p.id = '00000000-0000-0000-0000-0000000000f2'`)).rows[0];
  assert(r.role === 'Viewer' && r.office_role === 'Finance Manager' && r.st === 'accepted' && r.name === 'New Person', JSON.stringify(r));
  return JSON.stringify(r);
});
await check('Admin cannot invite a Super Admin', () =>
  tx(CA, `select create_invitation('x@acme.om', 'X', ${role('Super Admin')}, false, '[]')`), 'Only a Super Admin');
await check('Admin cannot assign an office they do not manage', () =>
  tx(CA, `select create_invitation('y@acme.om', 'Y', ${role('Viewer')}, false, '[{"company_id":"${DQ}"}]')`), 'cannot assign an office');
await check('invitation for an existing user rejected', () =>
  tx(ADMIN, `select create_invitation('NEW.person@acme.om', 'F', ${role('Viewer')}, true, '[]')`), 'already exists');
await check('Fleet Manager cannot invite users', () =>
  tx(FLEET, `select create_invitation('z@acme.om', 'Z', ${role('Viewer')}, false, '[{"company_id":"${HO}"}]')`), 'Permission denied');
await check('uninvited signup gets Viewer with no offices', async () => {
  await asServer(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'stranger@x')`);
  const r = (await asServer(`select r.name, (select count(*)::int from company_members where user_id = p.id) n
     from profiles p join roles r on r.id = p.role_id where p.id = '00000000-0000-0000-0000-0000000000f3'`)).rows[0];
  assert(r.name === 'Viewer' && r.n === 0, JSON.stringify(r)); return JSON.stringify(r);
});

// --- opening balances
await check('customer opening balance creates a posted opening invoice (Dr AR / Cr 3900)', async () => {
  await tx(ADMIN, `select post_opening_party_balance('${HO}', 'Customer', '77777777-0000-0000-0000-000000000001', 1250.5, '2026-01-01')`);
  const r = (await asServer(`select i.outstanding_amount, i.reference_number,
      (select sum(credit) from journal_lines jl where jl.entry_id = i.journal_entry_id and jl.account_code = '3900') eq,
      (select sum(debit) from journal_lines jl where jl.entry_id = i.journal_entry_id and jl.account_code = '1100') ar
      from invoices i where i.reference_number = 'OPENING' and i.customer_id = '77777777-0000-0000-0000-000000000001'`)).rows[0];
  assert(Number(r.outstanding_amount) === 1250.5 && Number(r.eq) === 1250.5 && Number(r.ar) === 1250.5, JSON.stringify(r));
  return JSON.stringify(r);
});
await check('supplier opening balance credits AP', async () => {
  await tx(ADMIN, `select post_opening_party_balance('${HO}', 'Supplier', '${SUP}', 300, '2026-01-01')`);
  return String(await val(`select sum(credit) from journal_lines jl join invoices i on i.journal_entry_id = jl.entry_id
                            where i.reference_number = 'OPENING' and i.supplier_id = '${SUP}' and jl.account_code = '2010'`));
});
await check('opening balance must be positive', () =>
  tx(ADMIN, `select post_opening_party_balance('${HO}', 'Supplier', '${SUP}', 0, '2026-01-01')`), 'greater than zero');
await check('Viewer cannot post opening balances', () =>
  tx(VIEWER, `select post_opening_party_balance('${HO}', 'Supplier', '${SUP}', 10, '2026-01-01')`), 'Permission denied');
await check('fixed asset opening balance: cost, accumulated depreciation, net to 3900', async () => {
  await tx(ADMIN, `select post_opening_fixed_asset('${HO}', '{"name":"Coaster bus","purchase_cost":20000,"accumulated_depreciation":4000,"useful_life_years":10}', '2026-01-01')`);
  const r = (await asServer(`select a.current_book_value bv,
      (select sum(debit) from journal_lines jl join journal_entries je on je.id = jl.entry_id where je.source_id = a.id and jl.account_code = '1510') cost,
      (select sum(credit) from journal_lines jl join journal_entries je on je.id = jl.entry_id where je.source_id = a.id and jl.account_code = '3900') eq
      from fixed_assets a where a.name = 'Coaster bus'`)).rows[0];
  assert(Number(r.cost) === 20000 && Number(r.eq) === 16000, JSON.stringify(r)); return JSON.stringify(r);
});
await check('bank opening balance is dated with opening_date', async () => {
  await tx(ADMIN, `insert into bank_accounts (company_id, bank_name, account_name, account_number, account_type, gl_account_code, opening_balance, opening_date)
                   values ('${HO}', 'BankDhofar', 'Ops', 'OB-1', 'Current', '1020', 900, '2026-01-01')`);
  return String(await val(`select date from journal_entries where description like 'Opening balance BankDhofar%'`));
});
await check('trial balance still balances after opening balances', async () => {
  const r = (await asServer(`select sum(debit) dr, sum(credit) cr from journal_lines where company_id = '${HO}'`)).rows[0];
  assert(Number(r.dr) === Number(r.cr), JSON.stringify(r)); return `Dr ${r.dr} = Cr ${r.cr}`;
});

// --- setup wizard
await check('non-super cannot save setup progress', () => tx(CA, `select save_setup_progress(3, '{1,2}')`), 'Only a Super Admin');
await check('Super Admin saves progress', async () => {
  await tx(ADMIN, `select save_setup_progress(4, '{1,2,3,3,12}')`);
  const r = (await asServer(`select setup_step, setup_completed_steps::text s from organizations`)).rows[0];
  assert(r.setup_step === 4 && r.s === '{1,2,3}', JSON.stringify(r)); return JSON.stringify(r);
});
await check('complete_setup refuses while an office has no chart of accounts', async () => {
  await asServer(`alter table companies disable trigger user;
                  insert into companies (id, name, code) values ('11111111-0000-0000-0000-00000000000f', 'Empty', 'EMP');
                  alter table companies enable trigger user;`);
  return tx(ADMIN, `select complete_setup()`);
}, 'chart of accounts');
await check('setup_checklist names the failing office', async () => {
  const d = (await as(ADMIN, `select detail from setup_checklist() where check_key = 'chart_of_accounts'`)).rows[0].detail;
  assert(d === 'Empty', d); return d;
});
await check('complete_setup succeeds once every check passes', async () => {
  await asServer(`select public._seed_chart_of_accounts('11111111-0000-0000-0000-00000000000f')`);
  await tx(ADMIN, `select complete_setup()`);
  return await val(`select setup_status from organizations`);
});
await check('Admin cannot complete setup', () => tx(CA, `select complete_setup()`), 'Only a Super Admin');
await check('configuration changes are audited', async () => {
  const n = await val(`select count(*)::int from audit_logs where entity_type in ('organizations','tax_rates','field_definitions','document_formats')`);
  assert(n > 0, 'no audit rows'); return n + ' rows';
});
await check('anon has no access to the new tables', async () => { await db.exec('set role anon'); try { await db.query('select * from organizations'); } finally { await db.exec('reset role'); } }, 'permission denied');

t.report();
