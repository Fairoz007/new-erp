#!/usr/bin/env node
// End-to-end suite against a REAL Supabase stack (Auth + PostgREST + Storage + RLS).
//
//   node e2e/remote.e2e.mjs --help
//   node e2e/remote.e2e.mjs --dry-run     (validates config, lists the plan, makes NO network calls)
//   node e2e/remote.e2e.mjs               (runs for real: creates tagged offices/users/rows, then cleans up)
//
// Config comes from the environment only (see e2e/README.md). Secrets are never printed.
// Table/RPC calls mirror src/services/*.ts; the source of each is noted next to the call.
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

const PROJECT_REF = 'fpeniljpqigpeqtsgizr';
const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  console.log(`ERP remote end-to-end suite

Usage: node e2e/remote.e2e.mjs [--dry-run] [--help]

Required environment variables (never put them in a committed file):
  SUPABASE_URL                 https://${PROJECT_REF}.supabase.co
  SUPABASE_ANON_KEY            publishable / anon key
  SUPABASE_SERVICE_ROLE_KEY    service-role (secret) key: setup + teardown only
  E2E_CONFIRM                  must equal ${PROJECT_REF} (safety guard)

Flags:
  --dry-run   validate configuration and print the planned steps; no network calls
  --help      this text

Exit code: 0 all pass (skips allowed), 1 any failure, 2 configuration error.`);
  process.exit(0);
}
const DRY = args.has('--dry-run');

// ------------------------------------------------------------------ config + guard
const env = (k) => (process.env[k] || '').trim();
const URL_ = env('SUPABASE_URL').replace(/\/+$/, '');
const ANON = env('SUPABASE_ANON_KEY');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const CONFIRM = env('E2E_CONFIRM');

const secrets = [ANON, SERVICE].filter(Boolean);
const redact = (s) => {
  let out = String(s ?? '');
  for (const x of secrets) out = out.split(x).join('[redacted]');
  return out;
};
const log = (...a) => console.log(...a.map(redact));

const configErrors = [];
if (!URL_) configErrors.push('SUPABASE_URL is not set');
else {
  let host = '';
  try { host = new URL(URL_).hostname; } catch { configErrors.push('SUPABASE_URL is not a valid URL'); }
  if (host && !(host === `${PROJECT_REF}.supabase.co`)) {
    configErrors.push(`SUPABASE_URL host must be ${PROJECT_REF}.supabase.co (wrong-project guard)`);
  }
}
if (!ANON) configErrors.push('SUPABASE_ANON_KEY is not set');
if (!SERVICE) configErrors.push('SUPABASE_SERVICE_ROLE_KEY is not set (needed for setup/teardown)');
if (CONFIRM !== PROJECT_REF) configErrors.push(`E2E_CONFIRM must equal ${PROJECT_REF}`);
if (ANON && SERVICE && ANON === SERVICE) configErrors.push('SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are identical');

const RUN_ID = `e2e-${Date.now()}`;
const SHORT = Date.now().toString(36).slice(-6).toUpperCase();
const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = TODAY.slice(0, 4);

// ------------------------------------------------------------------ tiny test runner
class Skip extends Error {}
const skip = (why) => { throw new Skip(why); };
const registry = []; // { group, name, fn }
const test = (group, name, fn) => registry.push({ group, name, fn });
const results = [];
const S = {}; // shared state between tests

const fmtErr = (e) => redact(e?.message || e?.error_description || JSON.stringify(e) || String(e)).slice(0, 220);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (label, got, want) => assert(Math.abs(Number(got) - want) < 0.0005, `${label}: got ${got}, want ${want}`);
/** Unwrap a supabase-js {data,error} result. */
const ok = async (p, what = 'call') => {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${fmtErr(error)}`);
  return data;
};
/** The call must fail with an error (optionally matching `re`). */
const mustFail = async (p, re, what = 'call') => {
  const { data, error } = await p;
  if (!error) throw new Error(`${what}: expected an error but it succeeded (${redact(JSON.stringify(data)).slice(0, 120)})`);
  if (re && !re.test(error.message || '')) throw new Error(`${what}: error did not match ${re}: ${fmtErr(error)}`);
};
/** RLS-style denial: an error OR a silently empty result. Caller must re-read to prove nothing changed. */
const mustBeBlocked = async (p, what = 'call') => {
  const { data, error } = await p;
  if (error) return;
  const empty = data == null || (Array.isArray(data) && data.length === 0);
  if (!empty) throw new Error(`${what}: expected denial but got ${redact(JSON.stringify(data)).slice(0, 120)}`);
};

// ------------------------------------------------------------------ fixtures
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const ROLES = {
  sa: 'Super Admin', cadmin: 'Company Admin', fm: 'Fleet Manager', acc: 'Accountant', view: 'Viewer', b: 'Fleet Manager',
};
const mkClient = (key) => createClient(URL_, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
let svc, anonClient;
const users = {}; // key -> { id, email, password, client }
const created = { companies: [], authUsers: [], objects: [], suppliers: [], rules: [], banks: [] };
const randomPassword = () => `Aa1!${randomBytes(18).toString('base64url')}`;

// ------------------------------------------------------------------ setup
async function setup() {
  svc = mkClient(SERVICE);
  anonClient = mkClient(ANON);

  // two offices (service role: no creator membership, tagged names/codes)
  for (const k of ['A', 'B']) {
    const row = await ok(svc.from('companies').insert({ name: `E2E ${RUN_ID} Office ${k}`, code: `E2E${k}${SHORT}`, currency: 'OMR' }).select().single(), `create office ${k}`);
    created.companies.push(row.id);
    S[`office${k}`] = row.id;
  }

  // users via the admin API; roles/memberships via the service role (server-side: allowed by the guard triggers)
  for (const key of Object.keys(ROLES)) {
    const email = `e2e+${RUN_ID}-${key}@example.test`;
    const password = randomPassword();
    const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `E2E ${key}` } });
    if (error) throw new Error(`create user ${key}: ${fmtErr(error)}`);
    users[key] = { id: data.user.id, email, password };
    created.authUsers.push(data.user.id);
    secrets.push(password);
  }
  for (const [key, role] of Object.entries(ROLES)) {
    // handle_new_user creates the profile; wait for it, then set the role
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      const { data } = await svc.from('profiles').select('id').eq('id', users[key].id).maybeSingle();
      found = !!data; if (!found) await new Promise(r => setTimeout(r, 300));
    }
    assert(found, `profile for ${key} was not created by the auth trigger`);
    await ok(svc.from('profiles').update({ role, status: 'active' }).eq('id', users[key].id), `set role ${key}`);
  }
  const members = [['cadmin', 'A'], ['fm', 'A'], ['acc', 'A'], ['view', 'A'], ['b', 'B']].map(([u, o]) => ({ user_id: users[u].id, company_id: S[`office${o}`] }));
  await ok(svc.from('company_members').insert(members), 'memberships');

  // independent signed-in client per user
  for (const [key, u] of Object.entries(users)) {
    u.client = mkClient(ANON);
    const { error } = await u.client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw new Error(`sign in ${key}: ${fmtErr(error)}`);
  }

  // reference data that has no client create path: a supplier (global table), a bank account, and a maintenance approval rule
  const sup = await ok(svc.from('suppliers').insert({ supplier_code: null, name: `E2E ${RUN_ID} Supplier`, supplier_type: 'Garage', payment_terms_days: 30 }).select().single(), 'create supplier');
  created.suppliers.push(sup.id); S.supplier = sup.id;
  const bank = await ok(svc.from('bank_accounts').insert({
    company_id: S.officeA, bank_name: 'E2E Bank', account_name: `E2E ${RUN_ID}`, account_number: SHORT, account_type: 'Current', gl_account_code: '1010',
  }).select().single(), 'create bank account');
  created.banks.push(bank.id); S.bank = bank.id;
  // threshold above the Fleet Manager approval limit (500) so a work order of exactly this estimate goes Pending
  const rule = await ok(svc.from('approval_rules').insert({
    module: 'maintenance', threshold_amount: 7777, required_roles: ['Super Admin'], description: `e2e rule ${RUN_ID} (temporary)`, active: true,
  }).select().single(), 'create approval rule');
  created.rules.push(rule.id);
}

// ------------------------------------------------------------------ tests
const cl = (k) => users[k].client;

// ---- Auth (src/services/auth.ts)
test('Auth', 'every test user can sign in and the session belongs to them', async () => {
  for (const k of Object.keys(users)) {
    const { data, error } = await cl(k).auth.getUser();
    assert(!error && data.user?.id === users[k].id, `${k}: session user mismatch`);
  }
});
test('Auth', 'profile + role load through RLS (auth.ts fetchProfile)', async () => {
  for (const [k, role] of Object.entries(ROLES)) {
    const p = await ok(cl(k).from('profiles').select('*').eq('id', users[k].id).maybeSingle(), `profile ${k}`);
    assert(p?.role === role, `${k}: role ${p?.role}, expected ${role}`);
  }
  const perms = await ok(cl('view').from('role_permissions').select('role, module, action').eq('role', 'Viewer'), 'role_permissions');
  assert(perms.length > 0 && !perms.some(p => p.action === 'create'), 'Viewer permission matrix must not contain create');
});
test('Auth', 'self-service profile edit works (name), role/status do not', async () => {
  await ok(cl('view').from('profiles').update({ phone: `+000${SHORT}` }).eq('id', users.view.id).select('id'), 'viewer edits own phone');
  const p = await ok(svc.from('profiles').select('phone').eq('id', users.view.id).single(), 'reread');
  assert(p.phone === `+000${SHORT}`, 'own phone was not persisted');
});
test('Auth', 'Viewer cannot change own role to Super Admin', async () => {
  await mustFail(cl('view').from('profiles').update({ role: 'Super Admin' }).eq('id', users.view.id).select('id'), undefined, 'viewer self-promote');
  const p = await ok(svc.from('profiles').select('role').eq('id', users.view.id).single(), 'reread');
  assert(p.role === 'Viewer', `role is now ${p.role}`);
});
test('Auth', 'Fleet Manager cannot change own role to Super Admin', async () => {
  await mustFail(cl('fm').from('profiles').update({ role: 'Super Admin' }).eq('id', users.fm.id).select('id'), undefined, 'fm self-promote');
  const p = await ok(svc.from('profiles').select('role').eq('id', users.fm.id).single(), 'reread');
  assert(p.role === 'Fleet Manager', `role is now ${p.role}`);
});
test('Auth', 'Company Admin cannot promote self or others to Super Admin', async () => {
  await mustFail(cl('cadmin').from('profiles').update({ role: 'Super Admin' }).eq('id', users.cadmin.id).select('id'), undefined, 'cadmin self-promote');
  await mustFail(cl('cadmin').from('profiles').update({ role: 'Super Admin' }).eq('id', users.fm.id).select('id'), undefined, 'cadmin promotes fm');
  for (const k of ['cadmin', 'fm']) {
    const p = await ok(svc.from('profiles').select('role').eq('id', users[k].id).single(), 'reread');
    assert(p.role === ROLES[k], `${k} role is now ${p.role}`);
  }
});
test('Auth', 'Company Admin cannot edit a user of another office', async () => {
  await mustBlockedOrFail(cl('cadmin').from('profiles').update({ role: 'Viewer' }).eq('id', users.b.id).select('id'), 'cadmin edits office-B user');
  const p = await ok(svc.from('profiles').select('role').eq('id', users.b.id).single(), 'reread');
  assert(p.role === 'Fleet Manager', `office-B user role is now ${p.role}`);
});
async function mustBlockedOrFail(p, what) { await mustBeBlocked(p, what); }

// ---- Company bootstrap (platform.sql: companies_bootstrap)
test('Company bootstrap', 'Super Admin creates an office: chart of accounts seeded + creator membership', async () => {
  const c = await ok(cl('sa').from('companies').insert({ name: `E2E ${RUN_ID} Office C`, code: `E2EC${SHORT}` }).select().single(), 'SA creates office');
  created.companies.push(c.id); S.officeC = c.id;
  const accts = await ok(svc.from('accounts').select('code').eq('company_id', c.id), 'accounts');
  assert(accts.length >= 28, `only ${accts.length} accounts seeded`);
  const codes = new Set(accts.map(a => a.code));
  for (const code of ['1010', '1100', '1300', '2010', '2040', '2050', '2100', '4000', '5000', '5075', '5080', '1520']) {
    assert(codes.has(code), `account ${code} missing from seeded chart`);
  }
  const m = await ok(svc.from('company_members').select('user_id').eq('company_id', c.id).eq('user_id', users.sa.id), 'membership');
  assert(m.length === 1, 'creator membership missing');
});
test('Company bootstrap', 'Viewer cannot create an office', async () => {
  await mustBeBlocked(cl('view').from('companies').insert({ name: `E2E ${RUN_ID} bad`, code: `E2EX${SHORT}` }).select(), 'viewer creates office');
  const r = await ok(svc.from('companies').select('id').eq('code', `E2EX${SHORT}`), 'reread');
  assert(r.length === 0, 'office was created by a Viewer');
});
test('Company bootstrap', 'office isolation: office-B user cannot see office A', async () => {
  const seen = await ok(cl('b').from('companies').select('id'), 'B lists companies');
  assert(seen.some(c => c.id === S.officeB), 'B cannot see own office');
  assert(!seen.some(c => c.id === S.officeA), 'B can see office A');
  const accts = await ok(cl('b').from('accounts').select('id').eq('company_id', S.officeA), 'B reads A accounts');
  assert(accts.length === 0, 'B can read office A chart of accounts');
});

// ---- Vehicles + numbering (src/services/fleet.ts addVehicle/updateVehicle)
const vehicleRow = (company, n, extra = {}) => ({
  company_id: company, vehicle_code: null, plate_number: `E2E-${SHORT}-${n}`, vehicle_type: 'SUV', vehicle_category: 'Operations',
  brand: 'Toyota', model: 'E2E', fuel_type: 'Diesel', transmission: 'Automatic', current_mileage: 1000, ...extra,
});
test('Vehicles', 'Fleet Manager creates two vehicles; DB numbers them VH-nnn consecutively', async () => {
  const v1 = await ok(cl('fm').from('vehicles').insert(vehicleRow(S.officeA, 1)).select().single(), 'create vehicle 1');
  const v2 = await ok(cl('fm').from('vehicles').insert(vehicleRow(S.officeA, 2)).select().single(), 'create vehicle 2');
  S.v1 = v1.id; S.v2 = v2.id;
  const n1 = /^VH-(\d{3,})$/.exec(v1.vehicle_code), n2 = /^VH-(\d{3,})$/.exec(v2.vehicle_code);
  assert(n1 && n2, `bad codes ${v1.vehicle_code}, ${v2.vehicle_code}`);
  assert(Number(n2[1]) === Number(n1[1]) + 1, `not consecutive: ${v1.vehicle_code}, ${v2.vehicle_code}`);
  assert(v1.vehicle_code === 'VH-001', `first vehicle of a new office should be VH-001, got ${v1.vehicle_code}`);
});
test('Vehicles', 'Fleet Manager update persists (re-read as another user)', async () => {
  await ok(cl('fm').from('vehicles').update({ current_mileage: 4321, notes: `e2e ${RUN_ID}` }).eq('id', S.v1).select('id'), 'update');
  const r = await ok(cl('cadmin').from('vehicles').select('current_mileage, notes').eq('id', S.v1).single(), 'reread as Company Admin');
  eq('mileage', r.current_mileage, 4321);
});
test('Vehicles', 'Viewer cannot create or update vehicles', async () => {
  await mustBeBlocked(cl('view').from('vehicles').insert(vehicleRow(S.officeA, 99)).select(), 'viewer insert');
  await mustBeBlocked(cl('view').from('vehicles').update({ current_mileage: 1 }).eq('id', S.v1).select('id'), 'viewer update');
  const r = await ok(svc.from('vehicles').select('current_mileage').eq('id', S.v1).single(), 'reread');
  eq('mileage unchanged', r.current_mileage, 4321);
  const n = await ok(svc.from('vehicles').select('id').eq('plate_number', `E2E-${SHORT}-99`), 'reread insert');
  assert(n.length === 0, 'Viewer-created vehicle exists');
});
test('Vehicles', 'Viewer can read vehicles of own office', async () => {
  const r = await ok(cl('view').from('vehicles').select('id').eq('id', S.v1), 'viewer read');
  assert(r.length === 1, 'viewer cannot read own office vehicle');
});
test('Vehicles', 'office-B user: cannot see office-A rows, cannot write into office A; B can write own office', async () => {
  const seen = await ok(cl('b').from('vehicles').select('id').in('id', [S.v1, S.v2]), 'B reads A vehicles');
  assert(seen.length === 0, 'B sees office-A vehicles');
  await mustBeBlocked(cl('b').from('vehicles').insert(vehicleRow(S.officeA, 77)).select(), 'B inserts into A');
  await mustBeBlocked(cl('b').from('vehicles').update({ current_mileage: 1 }).eq('id', S.v1).select('id'), 'B updates A');
  const bv = await ok(cl('b').from('vehicles').insert(vehicleRow(S.officeB, 1)).select().single(), 'B creates own vehicle');
  S.vB = bv.id;
  const seenByA = await ok(cl('fm').from('vehicles').select('id').eq('id', S.vB), 'A reads B vehicle');
  assert(seenByA.length === 0, 'office-A Fleet Manager sees office-B vehicle');
});
test('Vehicles', 'Fleet Manager cannot insert into office B', async () => {
  await mustBeBlocked(cl('fm').from('vehicles').insert(vehicleRow(S.officeB, 55)).select(), 'fm inserts into B');
});

// ---- Expenses numbering (fleet.ts addExpense)
test('Numbering', 'expense gets EXP-YYYY-0001 and total is computed by the DB', async () => {
  const e = await ok(cl('fm').from('expenses').insert({
    company_id: S.officeA, expense_number: null, vehicle_id: S.v1, date: TODAY, category: 'Fuel', description: `e2e ${RUN_ID}`,
    quantity: 40, unit_price: 0.5, tax: 1, total: 999, payment_method: 'Card',
  }).select().single(), 'create expense');
  S.expense = e.id;
  assert(new RegExp(`^EXP-${YEAR}-0001$`).test(e.expense_number), `expense number ${e.expense_number}`);
  eq('total (client value 999 must be ignored)', e.total, 21);
});
test('Numbering', 'oil/tyre/maintenance numbers follow CONTRACTS formats (via work order below); suppliers get SUP-nnn', async () => {
  const s = await ok(svc.from('suppliers').select('supplier_code').eq('id', S.supplier).single(), 'supplier');
  assert(/^SUP-\d{3,}$/.test(s.supplier_code), `supplier code ${s.supplier_code}`);
});

// ---- Work order + approval (fleet.ts addWorkOrder / system.ts decideApproval / fleet.ts updateWorkOrderStatus)
test('Work orders', 'WO at the rule threshold is Pending, numbered WO-YYYY-001, approval request raised', async () => {
  const w = await ok(cl('fm').from('work_orders').insert({
    company_id: S.officeA, work_order_number: null, vehicle_id: S.v1, reported_date: TODAY, problem_description: `e2e brake ${RUN_ID}`,
    requested_by: users.fm.id, priority: 'High', status: 'Requested', estimated_cost: 7777, approval_status: 'Not Required',
  }).select().single(), 'create WO');
  S.wo = w.id;
  assert(new RegExp(`^WO-${YEAR}-\\d{3}$`).test(w.work_order_number), `WO number ${w.work_order_number}`);
  assert(w.approval_status === 'Pending', `approval_status ${w.approval_status} (client cannot opt out)`);
  const reqs = await ok(cl('fm').from('approval_requests').select('*').eq('reference_id', w.id), 'approval request');
  assert(reqs.length === 1 && reqs[0].status === 'Pending', 'approval request missing or not pending');
  S.req = reqs[0].id;
});
test('Work orders', 'completing a pending WO is refused; Fleet Manager cannot approve above their limit', async () => {
  await mustBeBlocked(cl('fm').from('work_orders').update({ status: 'In Progress' }).eq('id', S.wo).select('id'), 'advance while pending');
  await mustFail(cl('fm').rpc('decide_approval', { p_request: S.req, p_action: 'Approved', p_comment: 'self' }), undefined, 'fm decides');
  await mustFail(cl('view').rpc('decide_approval', { p_request: S.req, p_action: 'Approved', p_comment: 'viewer' }), undefined, 'viewer decides');
  const w = await ok(svc.from('work_orders').select('status, approval_status').eq('id', S.wo).single(), 'reread');
  assert(w.approval_status === 'Pending' && w.status === 'Requested', `WO changed: ${w.status}/${w.approval_status}`);
});
test('Work orders', 'approver (Super Admin) decides -> WO Approved; complete_work_order creates exactly one maintenance record', async () => {
  await ok(cl('sa').rpc('decide_approval', { p_request: S.req, p_action: 'Approved', p_comment: `e2e ${RUN_ID}` }), 'decide_approval');
  const r = await ok(svc.from('approval_requests').select('status').eq('id', S.req).single(), 'request');
  assert(r.status === 'Approved', `request ${r.status}`);
  let w = await ok(svc.from('work_orders').select('status, approval_status').eq('id', S.wo).single(), 'wo');
  assert(w.approval_status === 'Approved', `wo approval ${w.approval_status}`);
  await ok(cl('fm').from('work_orders').update({ status: 'In Progress' }).eq('id', S.wo).select('id'), 'start work');
  await ok(cl('fm').rpc('complete_work_order', { p_work_order: S.wo, p_final_cost: 7000 }), 'complete_work_order');
  const m = await ok(cl('acc').from('maintenance_records').select('record_number, total_cost, work_order_id').eq('work_order_id', S.wo), 'maintenance records (read as Accountant)');
  assert(m.length === 1, `${m.length} maintenance records for the WO`);
  assert(new RegExp(`^MNT-${YEAR}-\\d{3}$`).test(m[0].record_number), `record number ${m[0].record_number}`);
  await mustFail(cl('fm').rpc('complete_work_order', { p_work_order: S.wo, p_final_cost: 7000 }), /already completed/i, 'complete twice');
  const m2 = await ok(svc.from('maintenance_records').select('id').eq('work_order_id', S.wo), 'recount');
  assert(m2.length === 1, `${m2.length} records after second attempt`);
  w = await ok(svc.from('work_orders').select('status').eq('id', S.wo).single(), 'wo');
  assert(w.status === 'Completed', `wo ${w.status}`);
});
test('Work orders', 'office-B user cannot read or decide office-A work orders / approvals', async () => {
  const r = await ok(cl('b').from('work_orders').select('id').eq('id', S.wo), 'B reads WO');
  assert(r.length === 0, 'B sees office-A work order');
  const q = await ok(cl('b').from('approval_requests').select('id').eq('id', S.req), 'B reads approval');
  assert(q.length === 0, 'B sees office-A approval request');
});

// ---- Invoices + payments + credit notes (finance.ts addInvoice / addPayment / createCreditNote)
const invHeader = (company) => ({ company_id: company, invoice_type: 'Purchase', supplier_id: S.supplier, invoice_date: TODAY, reference_number: `E2E-${SHORT}`, currency: 'OMR', exchange_rate: 1, other_charges: 0 });
const invLines = [{ description: 'E2E brake pads', quantity: 2, unit_price: 100, tax_rate_percentage: 5, gl_account_code: '5000' }];
async function journalBalance(entryId) {
  const lines = await ok(svc.from('journal_lines').select('debit, credit').eq('entry_id', entryId), 'journal lines');
  const d = lines.reduce((s, l) => s + Number(l.debit), 0), c = lines.reduce((s, l) => s + Number(l.credit), 0);
  assert(lines.length >= 2, `journal has ${lines.length} lines`);
  assert(Math.abs(d - c) < 0.0005 && d > 0, `unbalanced journal: debit ${d} credit ${c}`);
  return d;
}
test('Invoices', 'Accountant create_invoice(submit): DB number PINV-YYYY-0001, totals computed, posted balanced journal', async () => {
  const id = await ok(cl('acc').rpc('create_invoice', { p_header: invHeader(S.officeA), p_lines: invLines, p_submit: true }), 'create_invoice');
  S.inv = id;
  const inv = await ok(cl('acc').from('invoices').select('*').eq('id', id).single(), 'reread');
  assert(new RegExp(`^PINV-${YEAR}-0001$`).test(inv.invoice_number), `number ${inv.invoice_number}`);
  eq('grand_total', inv.grand_total, 210); eq('tax_total', inv.tax_total, 10); eq('amount_paid', inv.amount_paid, 0);
  assert(inv.approval_status === 'Approved' && inv.journal_entry_id, `status ${inv.approval_status}, journal ${inv.journal_entry_id}`);
  const je = await ok(svc.from('journal_entries').select('status').eq('id', inv.journal_entry_id).single(), 'je');
  assert(je.status === 'Posted', `journal ${je.status}`);
  eq('journal total', await journalBalance(inv.journal_entry_id), 210);
});
test('Invoices', 'Viewer and office-B user cannot create invoices for office A', async () => {
  await mustFail(cl('view').rpc('create_invoice', { p_header: invHeader(S.officeA), p_lines: invLines, p_submit: true }), undefined, 'viewer');
  await mustFail(cl('b').rpc('create_invoice', { p_header: invHeader(S.officeA), p_lines: invLines, p_submit: true }), undefined, 'office B');
  const n = await ok(svc.from('invoices').select('id').eq('company_id', S.officeA), 'count');
  assert(n.length === 1, `${n.length} invoices in office A, expected 1`);
});
test('Payments', 'partial record_payment updates outstanding; journal balanced; over-payment rejected', async () => {
  const pid = await ok(cl('acc').rpc('record_payment', {
    p_invoice: S.inv, p_amount: 100, p_date: TODAY, p_method: 'Bank Transfer', p_bank_account: S.bank, p_reference: `E2E-${SHORT}`, p_cheque: null, p_notes: null,
  }), 'record_payment');
  const pay = await ok(svc.from('payments').select('*').eq('id', pid).single(), 'payment');
  assert(/^[A-Z]+-/.test(pay.payment_number), `payment number ${pay.payment_number}`);
  await journalBalance(pay.journal_entry_id);
  let inv = await ok(cl('acc').from('invoices').select('amount_paid, outstanding_amount, payment_status').eq('id', S.inv).single(), 'reread');
  eq('amount_paid', inv.amount_paid, 100); eq('outstanding', inv.outstanding_amount, 110);
  assert(inv.payment_status === 'Partially Paid', `payment_status ${inv.payment_status}`);
  await mustFail(cl('acc').rpc('record_payment', {
    p_invoice: S.inv, p_amount: 500, p_date: TODAY, p_method: 'Bank Transfer', p_bank_account: S.bank, p_reference: null, p_cheque: null, p_notes: null,
  }), /outstanding/i, 'over-payment');
  inv = await ok(svc.from('invoices').select('amount_paid, outstanding_amount').eq('id', S.inv).single(), 'reread');
  eq('amount_paid after rejected over-payment', inv.amount_paid, 100);
  const pays = await ok(svc.from('payments').select('id').eq('invoice_id', S.inv), 'payments');
  assert(pays.length === 1, `${pays.length} payments`);
});
test('Payments', 'Viewer and Fleet Manager cannot record payments', async () => {
  for (const k of ['view', 'fm']) {
    await mustFail(cl(k).rpc('record_payment', {
      p_invoice: S.inv, p_amount: 1, p_date: TODAY, p_method: 'Cash', p_bank_account: S.bank, p_reference: null, p_cheque: null, p_notes: null,
    }), undefined, `${k} pays`);
  }
  await mustBeBlocked(cl('acc').from('payments').insert({ company_id: S.officeA, invoice_id: S.inv, payment_date: TODAY, amount: 1, payment_method: 'Cash', bank_account_id: S.bank, payment_number: 'X' }).select(), 'direct payments insert');
});
test('Credit notes', 'credit note over the outstanding amount rejected; valid one reduces outstanding, numbered CN-YYYY-0001', async () => {
  await mustFail(cl('acc').rpc('create_credit_note', { p_invoice: S.inv, p_reason: 'too much', p_amount: 500 }), /exceeds outstanding/i, 'over-credit');
  const id = await ok(cl('acc').rpc('create_credit_note', { p_invoice: S.inv, p_reason: `e2e ${RUN_ID}`, p_amount: 10 }), 'create_credit_note');
  const cn = await ok(svc.from('invoices').select('invoice_number, is_credit_note, journal_entry_id').eq('id', id).single(), 'cn');
  assert(cn.is_credit_note && new RegExp(`^CN-${YEAR}-0001$`).test(cn.invoice_number), `cn ${cn.invoice_number}`);
  await journalBalance(cn.journal_entry_id);
  const inv = await ok(svc.from('invoices').select('outstanding_amount, credited_amount').eq('id', S.inv).single(), 'orig');
  eq('credited', inv.credited_amount, 10); eq('outstanding', inv.outstanding_amount, 100);
  await mustFail(cl('view').rpc('create_credit_note', { p_invoice: S.inv, p_reason: 'viewer', p_amount: 1 }), undefined, 'viewer credit note');
});
test('Invoices', 'office-B user cannot read office-A invoices, payments or journals', async () => {
  for (const t of ['invoices', 'payments', 'journal_entries', 'journal_lines', 'bank_accounts']) {
    const r = await ok(cl('b').from(t).select('id').eq('company_id', S.officeA), `B reads ${t}`);
    assert(r.length === 0, `B sees ${r.length} ${t} rows of office A`);
  }
});

// ---- Payroll (hr.ts addEmployee / processPayrollRun)
test('Payroll', 'Super Admin creates employee (EMP-001) and process_payroll posts a balanced journal; duplicate month rejected', async () => {
  const e = await ok(cl('sa').from('employees').insert({
    company_id: S.officeA, employee_code: null, name: `E2E Driver ${SHORT}`, designation: 'Driver', department: 'Fleet & Logistics',
    joining_date: '2025-01-01', status: 'Active', basic_salary: 500, housing_allowance: 100, transport_allowance: 50, other_allowances: 0,
  }).select().single(), 'create employee');
  assert(/^EMP-\d{3,}$/.test(e.employee_code), `employee code ${e.employee_code}`);
  eq('gross', e.total_gross_salary, 650);
  const runId = await ok(cl('sa').rpc('process_payroll', { p_company: S.officeA, p_year: 2026, p_month: 9, p_payment_date: null, p_bank_account: null, p_post_gl: true }), 'process_payroll');
  const run = await ok(svc.from('payroll_runs').select('*').eq('id', runId).single(), 'run');
  assert(run.payroll_number === 'PR-2026-09', `payroll number ${run.payroll_number}`);
  assert(run.journal_entry_id, 'no journal');
  await journalBalance(run.journal_entry_id);
  await mustFail(cl('sa').rpc('process_payroll', { p_company: S.officeA, p_year: 2026, p_month: 9, p_payment_date: null, p_bank_account: null, p_post_gl: true }), /already processed/i, 'duplicate month');
  const runs = await ok(svc.from('payroll_runs').select('id').eq('company_id', S.officeA), 'runs');
  assert(runs.length === 1, `${runs.length} payroll runs`);
});
test('Payroll', 'Fleet Manager / Viewer cannot run payroll or read employees; office-B user cannot read office-A employees', async () => {
  await mustFail(cl('fm').rpc('process_payroll', { p_company: S.officeA, p_year: 2026, p_month: 10, p_payment_date: null, p_bank_account: null, p_post_gl: true }), undefined, 'fm payroll');
  await mustFail(cl('view').rpc('process_payroll', { p_company: S.officeA, p_year: 2026, p_month: 10, p_payment_date: null, p_bank_account: null, p_post_gl: true }), undefined, 'viewer payroll');
  const b = await ok(cl('b').from('employees').select('id').eq('company_id', S.officeA), 'B employees');
  assert(b.length === 0, 'B sees office-A employees');
  const runs = await ok(svc.from('payroll_runs').select('id').eq('company_id', S.officeA), 'runs');
  assert(runs.length === 1, 'extra payroll run created');
});

// ---- Fixed assets + depreciation (accounting.ts addFixedAsset / runDepreciation)
test('Depreciation', 'fixed asset (FA-001) + run_depreciation posts balanced journal; duplicate period rejected', async () => {
  const fa = await ok(cl('sa').from('fixed_assets').insert({
    company_id: S.officeA, asset_code: null, name: `E2E Truck ${SHORT}`, category: 'Fleet Vehicle', purchase_date: '2026-01-01', purchase_cost: 12000,
    salvage_value: 0, useful_life_years: 5, annual_rate_percentage: 20, depreciation_method: 'Straight-Line', accumulated_depreciation: 0,
    gl_asset_account: '1510', gl_expense_account: '5080', gl_accum_dep_account: '1520', status: 'Active',
  }).select().single(), 'create asset');
  S.asset = fa.id;
  assert(/^FA-\d{3,}$/.test(fa.asset_code), `asset code ${fa.asset_code}`);
  const runId = await ok(cl('sa').rpc('run_depreciation', { p_company: S.officeA, p_period: '2026-09-01', p_notes: `e2e ${RUN_ID}`, p_post_gl: true }), 'run_depreciation');
  const run = await ok(svc.from('depreciation_runs').select('*').eq('id', runId).single(), 'run');
  assert(/^DEP-2026-\d{2}$/.test(run.batch_number), `batch ${run.batch_number}`);
  await journalBalance(run.journal_entry_id);
  const a1 = await ok(svc.from('fixed_assets').select('accumulated_depreciation').eq('id', S.asset).single(), 'asset');
  assert(Number(a1.accumulated_depreciation) > 0, 'accumulated depreciation not updated');
  await mustFail(cl('sa').rpc('run_depreciation', { p_company: S.officeA, p_period: '2026-09-01', p_notes: null, p_post_gl: true }), /already run/i, 'duplicate period');
  const a2 = await ok(svc.from('fixed_assets').select('accumulated_depreciation').eq('id', S.asset).single(), 'asset again');
  eq('accumulated unchanged by rejected duplicate', a2.accumulated_depreciation, Number(a1.accumulated_depreciation));
});
test('Depreciation', 'Fleet Manager and office-B user cannot run depreciation for office A', async () => {
  await mustFail(cl('fm').rpc('run_depreciation', { p_company: S.officeA, p_period: '2026-10-01', p_notes: null, p_post_gl: true }), undefined, 'fm');
  await mustFail(cl('b').rpc('run_depreciation', { p_company: S.officeA, p_period: '2026-10-01', p_notes: null, p_post_gl: true }), undefined, 'B');
  const r = await ok(svc.from('depreciation_runs').select('id').eq('company_id', S.officeA), 'runs');
  assert(r.length === 1, `${r.length} depreciation runs`);
});

// ---- Notifications (system.ts markNotificationRead / markAllNotificationsRead)
test('Notifications', 'office notification visible in-office only; mark read persists; mark_all_notifications_read', async () => {
  const n = await ok(svc.from('notifications').insert([
    { company_id: S.officeA, type: 'e2e', title: `E2E ${RUN_ID} 1`, message: 'one', severity: 'info' },
    { company_id: S.officeA, type: 'e2e', title: `E2E ${RUN_ID} 2`, message: 'two', severity: 'warning' },
  ]).select(), 'seed notifications');
  S.notes = n.map(x => x.id);
  const seen = await ok(cl('view').from('notifications').select('id').in('id', S.notes), 'viewer reads');
  assert(seen.length === 2, `viewer sees ${seen.length}/2`);
  const hidden = await ok(cl('b').from('notifications').select('id').in('id', S.notes), 'B reads');
  assert(hidden.length === 0, 'office-B user sees office-A notifications');
  await ok(cl('view').from('notification_reads').upsert({ notification_id: S.notes[0], user_id: users.view.id }, { onConflict: 'notification_id,user_id', ignoreDuplicates: true }), 'mark one read');
  let reads = await ok(svc.from('notification_reads').select('notification_id').eq('user_id', users.view.id).in('notification_id', S.notes), 'reread');
  assert(reads.length === 1, `${reads.length} reads after mark one`);
  await ok(cl('view').rpc('mark_all_notifications_read'), 'mark all');
  reads = await ok(svc.from('notification_reads').select('notification_id').eq('user_id', users.view.id).in('notification_id', S.notes), 'reread');
  assert(reads.length === 2, `${reads.length} reads after mark all`);
  const other = await ok(svc.from('notification_reads').select('notification_id').eq('user_id', users.fm.id).in('notification_id', S.notes), 'other user reads');
  assert(other.length === 0, 'marking read leaked to another user');
});

// ---- Audit logs (written by triggers, scoped by office)
test('Audit logs', 'trigger wrote audit rows for the vehicle; visible in-office, hidden from office B, not writable', async () => {
  const mine = await ok(cl('fm').from('audit_logs').select('id, action, company_id').eq('entity_id', S.v1), 'fm reads audit');
  assert(mine.length >= 1, 'no audit rows for the vehicle');
  const theirs = await ok(cl('b').from('audit_logs').select('id').eq('company_id', S.officeA), 'B reads audit');
  assert(theirs.length === 0, `B sees ${theirs.length} audit rows of office A`);
  await mustBeBlocked(cl('fm').from('audit_logs').insert({ action: 'FORGED', entity_type: 'vehicles', company_id: S.officeA }).select(), 'forge audit');
  await mustBeBlocked(cl('fm').from('audit_logs').delete().eq('entity_id', S.v1).select(), 'delete audit');
  const again = await ok(svc.from('audit_logs').select('id').eq('entity_id', S.v1), 'reread');
  assert(again.length >= mine.length, 'audit rows disappeared');
});

// ---- Storage (src/services/storage.ts upload/createSignedUrl/remove, documents.ts)
const objName = (office, folder, ext) => `${office}/${folder}/${randomUUID()}-e2e-${SHORT}.${ext}`;
const track = (bucket, path) => created.objects.push({ bucket, path });
const exists = async (bucket, path) => {
  const dir = path.split('/').slice(0, -1).join('/'), file = path.split('/').pop();
  const { data, error } = await svc.storage.from(bucket).list(dir, { search: file });
  if (error) throw new Error(`list: ${fmtErr(error)}`);
  return data.some(o => o.name === file);
};
test('Storage', 'Fleet Manager uploads PDF + PNG to documents/<officeA>/documents; signed URL returns identical bytes', async () => {
  S.pdfPath = objName(S.officeA, 'documents', 'pdf'); S.pngPath = objName(S.officeA, 'documents', 'png');
  for (const [p, buf, type] of [[S.pdfPath, PDF, 'application/pdf'], [S.pngPath, PNG, 'image/png']]) {
    track('documents', p);
    await ok(cl('fm').storage.from('documents').upload(p, buf, { contentType: type, upsert: false }), `upload ${type}`);
    assert(await exists('documents', p), `${p} not found after upload`);
  }
  const { data, error } = await cl('fm').storage.from('documents').createSignedUrl(S.pdfPath, 60);
  if (error) throw new Error(`signed url: ${fmtErr(error)}`);
  const res = await fetch(data.signedUrl);
  assert(res.ok, `signed URL fetch ${res.status}`);
  const got = Buffer.from(await res.arrayBuffer());
  assert(got.equals(PDF), 'downloaded bytes differ from uploaded bytes');
});
test('Storage', 'Viewer cannot upload or delete in documents; cross-office path denied for Fleet Manager', async () => {
  const p = objName(S.officeA, 'documents', 'pdf'); track('documents', p);
  await mustFail(cl('view').storage.from('documents').upload(p, PDF, { contentType: 'application/pdf' }), undefined, 'viewer upload');
  assert(!(await exists('documents', p)), 'Viewer upload landed');
  const x = objName(S.officeB, 'documents', 'pdf'); track('documents', x);
  await mustFail(cl('fm').storage.from('documents').upload(x, PDF, { contentType: 'application/pdf' }), undefined, 'cross-office upload');
  assert(!(await exists('documents', x)), 'cross-office upload landed');
  await cl('view').storage.from('documents').remove([S.pdfPath]);
  assert(await exists('documents', S.pdfPath), 'Viewer deleted an object');
});
test('Storage', 'office-B user cannot sign or download office-A objects', async () => {
  const { data, error } = await cl('b').storage.from('documents').createSignedUrl(S.pdfPath, 60);
  assert(error || !data?.signedUrl, 'B obtained a signed URL for an office-A object');
  const dl = await cl('b').storage.from('documents').download(S.pdfPath);
  assert(dl.error, 'B downloaded an office-A object');
});
test('Storage', 'bucket rejects wrong MIME and oversize (documents 10 MB, media 5 MB)', async () => {
  const bad = objName(S.officeA, 'documents', 'txt'); track('documents', bad);
  await mustFail(cl('fm').storage.from('documents').upload(bad, Buffer.from('hello'), { contentType: 'text/plain' }), undefined, 'text/plain');
  const big = objName(S.officeA, 'documents', 'pdf'); track('documents', big);
  await mustFail(cl('fm').storage.from('documents').upload(big, Buffer.alloc(10 * 1024 * 1024 + 1024, 0x20), { contentType: 'application/pdf' }), undefined, 'oversize documents');
  const gif = objName(S.officeA, 'vehicles', 'gif'); track('media', gif);
  await mustFail(cl('fm').storage.from('media').upload(gif, Buffer.from('GIF89a'), { contentType: 'image/gif' }), undefined, 'gif in media');
  const bigm = objName(S.officeA, 'vehicles', 'png'); track('media', bigm);
  await mustFail(cl('fm').storage.from('media').upload(bigm, Buffer.alloc(5 * 1024 * 1024 + 1024, 0), { contentType: 'image/png' }), undefined, 'oversize media');
  for (const [b, p] of [['documents', bad], ['documents', big], ['media', gif], ['media', bigm]]) assert(!(await exists(b, p)), `${b}/${p} landed`);
});
test('Storage', 'media bucket: Fleet Manager uploads a vehicle photo and links it; Viewer denied', async () => {
  const p = objName(S.officeA, 'vehicles', 'png'); track('media', p);
  await mustFail(cl('view').storage.from('media').upload(p, PNG, { contentType: 'image/png' }), undefined, 'viewer photo');
  assert(!(await exists('media', p)), 'Viewer photo landed');
  await ok(cl('fm').storage.from('media').upload(p, PNG, { contentType: 'image/png' }), 'fm photo');
  await ok(cl('fm').from('vehicles').update({ photo_url: p }).eq('id', S.v1).select('id'), 'link photo');
  const v = await ok(cl('view').from('vehicles').select('photo_url').eq('id', S.v1).single(), 'reread');
  assert(v.photo_url === p, 'photo_url not persisted');
  const { data, error } = await cl('view').storage.from('media').createSignedUrl(p, 60);
  if (error) throw new Error(`member signed url: ${fmtErr(error)}`);
  const res = await fetch(data.signedUrl);
  assert(res.ok && Buffer.from(await res.arrayBuffer()).equals(PNG), 'media bytes differ');
  const dl = await cl('b').storage.from('media').download(p);
  assert(dl.error, 'office B downloaded an office-A photo');
});
test('Storage', 'avatars: own folder only', async () => {
  const mine = `${S.officeA}/avatars/${users.view.id}/${randomUUID()}.png`; track('media', mine);
  const theirs = `${S.officeA}/avatars/${users.fm.id}/${randomUUID()}.png`; track('media', theirs);
  await ok(cl('view').storage.from('media').upload(mine, PNG, { contentType: 'image/png' }), 'own avatar');
  await mustFail(cl('view').storage.from('media').upload(theirs, PNG, { contentType: 'image/png' }), undefined, "someone else's avatar");
  assert(await exists('media', mine) && !(await exists('media', theirs)), 'avatar presence wrong');
});
test('Storage', 'documents row + object lifecycle: insert row, delete row and object, both gone', async () => {
  const row = await ok(cl('fm').from('documents').insert({
    company_id: S.officeA, document_name: `E2E doc ${SHORT}`, category: 'Other', storage_path: S.pngPath, file_size: PNG.length, mime_type: 'image/png',
  }).select().single(), 'insert document row');
  const seen = await ok(cl('view').from('documents').select('id').eq('id', row.id), 'viewer reads row');
  assert(seen.length === 1, 'row not visible in-office');
  const hid = await ok(cl('b').from('documents').select('id').eq('id', row.id), 'B reads row');
  assert(hid.length === 0, 'office B sees the document row');
  await mustBeBlocked(cl('view').from('documents').delete().eq('id', row.id).select('id'), 'viewer deletes row');
  const del = await ok(cl('fm').from('documents').delete().eq('id', row.id).select('id'), 'fm deletes row');
  assert(del.length === 1, 'row not deleted');
  await ok(cl('fm').storage.from('documents').remove([S.pngPath]), 'remove object');
  assert(!(await exists('documents', S.pngPath)), 'object still exists');
  const left = await ok(svc.from('documents').select('id').eq('id', row.id), 'recheck');
  assert(left.length === 0, 'row still exists');
});

// ---- Anonymous access
const ANON_TABLES = ['companies', 'company_members', 'profiles', 'role_permissions', 'approval_limits', 'approval_rules', 'approval_requests', 'vehicles', 'work_orders',
  'maintenance_records', 'expenses', 'documents', 'suppliers', 'customers', 'invoices', 'invoice_lines', 'payments', 'bank_accounts', 'accounts', 'journal_entries',
  'journal_lines', 'employees', 'payroll_runs', 'fixed_assets', 'depreciation_runs', 'notifications', 'audit_logs'];
test('Anonymous', 'anon cannot read any table (error or zero rows)', async () => {
  const leaks = [];
  for (const t of ANON_TABLES) {
    const { data, error } = await anonClient.from(t).select('*').limit(1);
    if (!error && data && data.length > 0) leaks.push(t);
  }
  assert(leaks.length === 0, `anon read rows from: ${leaks.join(', ')}`);
});
test('Anonymous', 'anon cannot write or call RPCs', async () => {
  await mustBeBlocked(anonClient.from('vehicles').insert(vehicleRow(S.officeA, 88)).select(), 'anon insert');
  await mustFail(anonClient.rpc('next_doc_number', { p_company: S.officeA, p_prefix: 'E2E', p_pad: 3 }), undefined, 'anon next_doc_number');
  await mustFail(anonClient.rpc('create_invoice', { p_header: invHeader(S.officeA), p_lines: invLines, p_submit: true }), undefined, 'anon create_invoice');
  const n = await ok(svc.from('vehicles').select('id').eq('plate_number', `E2E-${SHORT}-88`), 'reread');
  assert(n.length === 0, 'anon insert landed');
});
test('Anonymous', 'anon cannot list or sign storage objects', async () => {
  for (const [b, dir] of [['documents', `${S.officeA}/documents`], ['media', `${S.officeA}/vehicles`]]) {
    const { data, error } = await anonClient.storage.from(b).list(dir);
    assert(error || (data || []).length === 0, `anon listed ${b}`);
  }
  const { data, error } = await anonClient.storage.from('media').createSignedUrl(S.pdfPath || `${S.officeA}/x.png`, 60);
  assert(error || !data?.signedUrl, 'anon got a signed URL');
});

// ------------------------------------------------------------------ teardown
const left = []; // things that could not be removed
async function tryStep(label, fn) {
  try { await fn(); return true; } catch (e) { left.push(`${label}: ${fmtErr(e)}`); return false; }
}
async function teardown() {
  if (!svc) return;
  // storage objects first
  for (const b of ['documents', 'media']) {
    const paths = created.objects.filter(o => o.bucket === b).map(o => o.path);
    if (paths.length) await tryStep(`storage objects in ${b}`, async () => { await ok(svc.storage.from(b).remove(paths), 'remove'); });
  }
  // company-owned rows, dependency order. Deletes that the DB forbids by design (posted journals, audit, invoices with payments) are reported, not forced.
  const offices = created.companies;
  const byCompany = ['notifications', 'documents', 'payroll_runs', 'depreciation_runs', 'fixed_assets', 'employees', 'work_orders', 'maintenance_records',
    'expenses', 'payments', 'invoices', 'bank_accounts', 'vehicles'];
  if (offices.length) {
    for (const t of byCompany) {
      await tryStep(`rows in ${t}`, async () => { await ok(svc.from(t).delete().in('company_id', offices), `delete ${t}`); });
    }
  }
  if (created.rules.length) await tryStep('approval_rules', async () => { await ok(svc.from('approval_rules').delete().in('id', created.rules), 'delete rules'); });
  if (created.suppliers.length) await tryStep('suppliers', async () => { await ok(svc.from('suppliers').delete().in('id', created.suppliers), 'delete suppliers'); });
  if (offices.length) {
    // offices: removable only if no immutable journal data hangs off them
    for (const id of offices) await tryStep(`office ${id}`, async () => { await ok(svc.from('companies').delete().eq('id', id), 'delete company'); });
  }
  for (const id of created.authUsers) {
    await tryStep(`auth user ${id}`, async () => { const { error } = await svc.auth.admin.deleteUser(id); if (error) throw new Error(fmtErr(error)); });
  }
}

// ------------------------------------------------------------------ main
const PLAN_SETUP = [
  'create 2 tagged offices (A, B) with the service role',
  'create 6 auth users (Super Admin, Company Admin, Fleet Manager A, Accountant A, Viewer A, Fleet Manager B) with random in-memory passwords',
  'set profile roles + company_members; sign each user in with its own client',
  'create 1 supplier, 1 bank account (office A) and 1 temporary maintenance approval rule (threshold 7777)',
];
const PLAN_TEARDOWN = [
  'remove storage objects (documents, media)',
  'delete tagged rows in dependency order (best effort; immutable data is reported)',
  'delete the temporary approval rule, supplier and offices where allowed',
  'delete the test auth users',
  'print the summary table and anything left behind',
];

if (DRY) {
  console.log(`DRY RUN (no network calls). run id would be ${RUN_ID}`);
  console.log(`Project ref guard : ${PROJECT_REF}`);
  console.log(`SUPABASE_URL      : ${URL_ ? 'set' : 'MISSING'}`);
  console.log(`SUPABASE_ANON_KEY : ${ANON ? 'set' : 'MISSING'}`);
  console.log(`SERVICE_ROLE_KEY  : ${SERVICE ? 'set' : 'MISSING'}`);
  console.log(`E2E_CONFIRM       : ${CONFIRM === PROJECT_REF ? 'ok' : 'MISSING or wrong'}`);
  if (configErrors.length) { console.log('\nConfiguration problems:'); configErrors.forEach(e => console.log('  - ' + e)); }
  console.log('\nSetup:'); PLAN_SETUP.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log(`\nTests (${registry.length}):`);
  let g = '';
  for (const t of registry) { if (t.group !== g) { g = t.group; console.log(`  [${g}]`); } console.log(`    - ${t.name}`); }
  console.log('\nTeardown (always runs):'); PLAN_TEARDOWN.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  process.exit(configErrors.length ? 2 : 0);
}

if (configErrors.length) {
  console.error('Refusing to run:');
  configErrors.forEach(e => console.error('  - ' + e));
  console.error('See e2e/README.md. Use --dry-run to validate configuration without any network calls.');
  process.exit(2);
}

let exitCode = 0;
try {
  log(`E2E run ${RUN_ID} against project ${PROJECT_REF}`);
  try { await setup(); log('setup complete'); }
  catch (e) { log(`SETUP FAILED: ${fmtErr(e)}`); exitCode = 1; S.setupFailed = true; }

  for (const t of registry) {
    if (S.setupFailed) { results.push({ ...t, status: 'SKIP', note: 'setup failed' }); continue; }
    try { await t.fn(); results.push({ ...t, status: 'PASS', note: '' }); }
    catch (e) {
      if (e instanceof Skip) results.push({ ...t, status: 'SKIP', note: e.message });
      else results.push({ ...t, status: 'FAIL', note: fmtErr(e) });
    }
  }
} finally {
  await teardown().catch(e => left.push(`teardown crashed: ${fmtErr(e)}`));
}

const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + '~' : s.padEnd(n));
log('\nResults');
log(`${pad('status', 6)} ${pad('group', 16)} test`);
for (const r of results) log(`${pad(r.status, 6)} ${pad(r.group, 16)} ${r.name}${r.note ? `\n         -> ${r.note}` : ''}`);
const count = (s) => results.filter(r => r.status === s).length;
log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped (run ${RUN_ID})`);
if (left.length) {
  log('\nLeft behind (tagged with the run id; posted journals/audit are immutable by design):');
  left.forEach(l => log('  - ' + l));
  log(`  offices: ${created.companies.join(', ') || '(none)'}`);
}
if (count('FAIL') > 0) exitCode = 1;
process.exit(exitCode);
