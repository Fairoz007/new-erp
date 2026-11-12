// HR: departments/designations, employee profile, attendance, leave, payroll workflow, HR documents.
// Migration 20261112000700_hr.sql
// Standalone: node supabase/tests/20261112000700_hr.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, OTHER, HO, DQ } = IDS;
const HRM = '00000000-0000-0000-0000-0000000000e1';   // HR Manager in HO
const FM = '00000000-0000-0000-0000-0000000000e2';    // Finance Manager in HO
const FM2 = '00000000-0000-0000-0000-0000000000e3';   // Finance Manager in HO
const BANK = '44444444-4444-4444-4444-444444444444';
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const role = (name) => `(select id from public.roles where name = '${name}')`;
const YEAR = new Date().getFullYear() - 1;   // a closed past year keeps dates deterministic
const ymd = (m, d) => `${YEAR}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

await asServer(`
  insert into organizations (legal_name, trade_name, base_currency) values ('Acme Transport LLC', 'Acme', 'OMR');
  insert into auth.users (id, email) values ('${HRM}','hr@x.com'), ('${FM}','fm@x.com'), ('${FM2}','fm2@x.com');
  update profiles set role_id = ${role('HR Manager')} where id = '${HRM}';
  update profiles set role_id = ${role('Finance Manager')} where id in ('${FM}','${FM2}');
  insert into company_members (user_id, company_id) values ('${HRM}','${HO}'), ('${FM}','${HO}'), ('${FM2}','${HO}');
  insert into role_grants (role_id, module, action) select ${role('HR Manager')}, 'leave', 'approve' on conflict do nothing;
  insert into role_grants (role_id, module, action) select ${role('Finance Manager')}, m, a::permission_action
    from (values ('hr','view'),('leave','view'),('leave','create'),('attendance','view')) v(m, a) on conflict do nothing;
`);
const newEmp = (uid, code, extra = {}) => {
  const cols = { company_id: `'${HO}'`, employee_code: `'${code}'`, name: `'${extra.name ?? code}'`, designation: `'${extra.designation ?? 'Driver'}'`,
    department: `'${extra.department ?? 'Operations'}'`, joining_date: `'${extra.joining ?? ymd(1, 1)}'`, basic_salary: extra.basic ?? 300, ...extra.cols };
  return as(uid, `insert into employees (${Object.keys(cols).join(',')}) values (${Object.values(cols).join(',')}) returning id`).then(r => r.rows[0].id);
};

// ---------------------------------------------------------------- masters and profile
let E1, E2, E3;
await check('HR manager adds an employee; department and designation ids are filled in', async () => {
  E1 = await newEmp(HRM, 'E-1', { name: 'Salim', basic: 450 });
  const r = (await asServer(`select d.name dn, g.name gn from employees e join departments d on d.id = e.department_id join designations g on g.id = e.designation_id where e.id = '${E1}'`)).rows[0];
  assert(r.dn === 'Operations' && r.gn === 'Driver', JSON.stringify(r)); return `${r.dn}/${r.gn}`;
});
await check('app users cannot use an unknown department', () => newEmp(HRM, 'E-X', { department: 'Space Ops' }), 'Unknown department "Space Ops"');
await check('server-side imports create the missing master row', async () => {
  await asServer(`insert into employees (company_id, employee_code, name, designation, department, joining_date, basic_salary)
                  values ('${HO}','E-IMP','Imported','Dispatcher','Dispatch','${ymd(1, 1)}',200)`);
  const n = await val(`select count(*)::int from departments where name = 'Dispatch'`);
  assert(n === 1, n); return 'created';
});
await check('an inactive department cannot be chosen', async () => {
  await asServer(`update departments set active = false where name = 'Dispatch'`);
  return newEmp(HRM, 'E-Y', { department: 'Dispatch' });
}, 'is inactive');
await check('viewer cannot edit departments', () => tx(VIEWER, `insert into departments (name) values ('X')`), 'row-level security');
await check('reporting lines cannot loop', async () => {
  E2 = await newEmp(HRM, 'E-2', { name: 'Khalid', basic: 300 });
  await as(HRM, `update employees set manager_id = '${E1}' where id = '${E2}'`);
  return tx(HRM, `update employees set manager_id = '${E2}' where id = '${E1}'`);
}, 'circular reporting line');
await check('a department in use cannot be deleted', () => tx(ADMIN, `delete from departments where name = 'Operations'`), 'violates foreign key');
await check('viewer without HR or payroll rights sees no employees', async () => {
  const n = (await as(VIEWER, `select count(*)::int n from employees`)).rows[0].n;
  assert(n === 0, n); return '0';
});

// ---------------------------------------------------------------- attendance
await check('attendance: office comes from the employee; times must be in order', async () => {
  const r = (await as(HRM, `insert into attendance (company_id, employee_id, work_date, status, check_in, check_out, overtime_hours)
    values ('${DQ}','${E1}','${ymd(3, 2)}','Present','07:00','17:00',2) returning company_id`)).rows[0];
  assert(r.company_id === HO, r.company_id);
  return tx(HRM, `insert into attendance (employee_id, company_id, work_date, status, check_in, check_out) values ('${E1}','${HO}','${ymd(3, 3)}','Present','17:00','07:00')`);
}, 'attendance_check');
await check('one attendance row per employee per day', () =>
  tx(HRM, `insert into attendance (employee_id, company_id, work_date, status) values ('${E1}','${HO}','${ymd(3, 2)}','Absent')`), 'duplicate key');
await check('attendance before joining is rejected', () =>
  tx(HRM, `insert into attendance (employee_id, company_id, work_date, status) values ('${E1}','${HO}','${YEAR - 1}-12-31','Present')`), 'joined on');
await check('present cannot be recorded in advance', () =>
  tx(HRM, `insert into attendance (employee_id, company_id, work_date, status) values ('${E1}','${HO}',current_date + 3,'Present')`), 'in advance');
await check('other office cannot see HO attendance', async () => {
  const n = (await as(OTHER, `select count(*)::int n from attendance`)).rows[0].n;
  assert(n === 0, n); return '0';
});

// ---------------------------------------------------------------- leave
const ANNUAL = `(select id from leave_types where code = 'ANNUAL')`, SICK = `(select id from leave_types where code = 'SICK')`, UNPAID = `(select id from leave_types where code = 'UNPAID')`;
let L1, L2;
await check('leave balance: full-year entitlement with adjustments', async () => {
  await as(HRM, `insert into leave_adjustments (company_id, employee_id, leave_type_id, year, days, reason) values ('${HO}','${E1}',${ANNUAL},${YEAR},5,'Carried forward')`);
  const r = (await as(HRM, `select * from leave_balance('${E1}', ${ANNUAL}, ${YEAR})`)).rows[0];
  assert(Number(r.entitlement) === 30 && Number(r.adjustments) === 5 && Number(r.remaining) === 35, JSON.stringify(r)); return '35 days';
});
await check('request more than the balance is rejected', () =>
  tx(HRM, `insert into leave_requests (company_id, employee_id, leave_type_id, start_date, end_date) values ('${HO}','${E1}',${ANNUAL},'${ymd(6, 1)}','${ymd(7, 10)}')`), 'Not enough annual leave balance');
await check('sick leave over 2 days needs a document', () =>
  tx(HRM, `insert into leave_requests (company_id, employee_id, leave_type_id, start_date, end_date) values ('${HO}','${E1}',${SICK},'${ymd(2, 1)}','${ymd(2, 5)}')`), 'needs a supporting document');
await check('HR manager requests annual leave (Pending, days counted)', async () => {
  const r = (await as(HRM, `insert into leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, status) values ('${HO}','${E1}',${ANNUAL},'${ymd(4, 1)}','${ymd(4, 5)}','Approved') returning id, status, days`)).rows[0];
  L1 = r.id;
  assert(r.status === 'Pending' && Number(r.days) === 5, JSON.stringify(r)); return 'Pending, 5 days';
});
await check('overlapping requests are rejected', () =>
  tx(HRM, `insert into leave_requests (company_id, employee_id, leave_type_id, start_date, end_date) values ('${HO}','${E1}',${UNPAID},'${ymd(4, 4)}','${ymd(4, 8)}')`), 'Overlaps');
await check('status cannot be changed with a plain update', () => tx(ADMIN, `update leave_requests set status = 'Approved' where id = '${L1}'`), 'Use Approve / Reject / Cancel');
await check('the requester cannot approve their own request', () => tx(HRM, `select review_leave('${L1}', 'Approved')`), 'you submitted');
await check('rejecting needs a reason', () => tx(FM, `select review_leave('${L1}', 'Rejected', '')`), 'reason is required');
await check('approval marks attendance On Leave and notifies the requester', async () => {
  await as(ADMIN, `select review_leave('${L1}', 'Approved')`);
  const r = (await asServer(`select (select count(*)::int from attendance where leave_request_id = '${L1}' and status = 'On Leave') a,
    (select count(*)::int from notifications where user_id = '${HRM}' and type = 'leave_review') n,
    (select taken from leave_balance('${E1}', ${ANNUAL}, ${YEAR})) tk`)).rows[0];
  assert(r.a === 5 && r.n === 1 && Number(r.tk) === 5, JSON.stringify(r)); return `${r.a} days on leave`;
});
await check('cancelling approved leave removes the attendance rows', async () => {
  L2 = (await as(HRM, `insert into leave_requests (company_id, employee_id, leave_type_id, start_date, end_date) values ('${HO}','${E2}',${ANNUAL},'${ymd(5, 10)}','${ymd(5, 11)}') returning id`)).rows[0].id;
  await as(ADMIN, `select review_leave('${L2}', 'Approved')`);
  await as(HRM, `select review_leave('${L2}', 'Cancelled')`);
  const n = await val(`select count(*)::int from attendance where leave_request_id = '${L2}'`);
  assert(n === 0, n); return 'removed';
});
await check('unpaid leave in March is approved (feeds payroll)', async () => {
  const id = (await as(HRM, `insert into leave_requests (company_id, employee_id, leave_type_id, start_date, end_date) values ('${HO}','${E2}',${UNPAID},'${ymd(3, 10)}','${ymd(3, 12)}') returning id`)).rows[0].id;
  await as(ADMIN, `select review_leave('${id}', 'Approved')`);
  return 'approved';
});

// ---------------------------------------------------------------- payroll
let RUN;
await check('generate March payroll: overtime, unpaid leave, components, proration', async () => {
  E3 = await newEmp(HRM, 'E-3', { name: 'Rashid', basic: 310, joining: ymd(3, 17) });   // joins mid-month: 15/31
  await as(ADMIN, `insert into employee_pay_components (company_id, employee_id, component_id, amount, start_date)
                   values ('${HO}','${E1}',(select id from pay_components where name = 'Fuel allowance'),20,'${ymd(1, 1)}'),
                          ('${HO}','${E1}',(select id from pay_components where name = 'Traffic fine recovery'),10,'${ymd(3, 1)}')`);
  RUN = await val(`select 1`);   // placeholder
  RUN = (await as(HRM, `select payroll_generate('${HO}', ${YEAR}, 3) id`)).rows[0].id;
  const r = (await asServer(`select e.employee_code c, i.basic_salary b, i.overtime_hours oh, i.overtime_amount oa, i.unpaid_leave_days ud,
      i.unpaid_leave_deduction u, i.other_allowances oa2, i.other_deductions od, i.days_worked dw, i.net_pay net
    from payroll_items i join employees e on e.id = i.employee_id where i.run_id = '${RUN}' order by 1`)).rows;
  const by = Object.fromEntries(r.map(x => [x.c, x]));
  // E-1: 2 OT hours at 450/(30*8)*1.25 = 4.688; fuel 20, fine 10
  assert(Number(by['E-1'].oh) === 2 && Number(by['E-1'].oa) === 4.688 && Number(by['E-1'].oa2) === 20 && Number(by['E-1'].od) === 10, JSON.stringify(by['E-1']));
  // E-2: 3 unpaid days at 300/30
  assert(Number(by['E-2'].ud) === 3 && Number(by['E-2'].u) === 30, JSON.stringify(by['E-2']));
  // E-3: 15 of 31 days
  assert(Number(by['E-3'].dw) === 15 && Number(by['E-3'].b) === Math.round(310 * 15 / 31 * 1000) / 1000, JSON.stringify(by['E-3']));
  return `${r.length} payslips`;
});
await check('a second payroll for the same month is rejected', () => tx(HRM, `select payroll_generate('${HO}', ${YEAR}, 3)`), 'already exists');
await check('viewer cannot generate payroll', () => tx(VIEWER, `select payroll_generate('${HO}', ${YEAR}, 4)`), 'Permission denied');
await check('HR manager adds a bonus and a loan deduction on a draft line', async () => {
  const item = await val(`select i.id from payroll_items i join employees e on e.id = i.employee_id where run_id = '${RUN}' and e.employee_code = 'E-2'`);
  await as(HRM, `select payroll_update_item('${item}', 25, 15, 0, 'Eid bonus')`);
  const r = (await asServer(`select bonus_amount b, loan_advance_deduction l, notes from payroll_items where id = '${item}'`)).rows[0];
  assert(Number(r.b) === 25 && Number(r.l) === 15 && r.notes === 'Eid bonus', JSON.stringify(r)); return 'saved';
});
await check('recalculate keeps the manual bonus', async () => {
  await as(HRM, `select payroll_recalculate('${RUN}')`);
  const b = await val(`select bonus_amount from payroll_items i join employees e on e.id = i.employee_id where run_id = '${RUN}' and e.employee_code = 'E-2'`);
  assert(Number(b) === 25, b); return 'kept';
});
await check('HR manager (no approve rights) cannot approve', () => tx(HRM, `select payroll_approve('${RUN}')`), 'Permission denied');
await check('the submitter cannot approve their own payroll', async () => {
  await as(FM2, `select payroll_submit('${RUN}')`);
  return tx(FM2, `select payroll_approve('${RUN}')`);
}, 'you submitted');
await check('a submitted run is locked for edits', async () => {
  const item = await val(`select id from payroll_items where run_id = '${RUN}' limit 1`);
  return tx(HRM, `select payroll_update_item('${item}', 1, 0, 0, null)`);
}, 'Only draft payroll can be edited');
let JE;
await check('Finance Manager approves: balanced accrual journal', async () => {
  JE = (await as(FM, `select payroll_approve('${RUN}') id`)).rows[0].id;
  const r = (await asServer(`select sum(debit) d, sum(credit) c,
      sum(credit) filter (where account_code = '2050') net_cr, sum(credit) filter (where account_code = '1250') loan,
      sum(credit) filter (where account_code = '2060') ded
    from journal_lines where entry_id = '${JE}'`)).rows[0];
  const net = await val(`select sum(net_pay) from payroll_items where run_id = '${RUN}'`);
  assert(Number(r.d) === Number(r.c) && Number(r.net_cr) === Number(net) && Number(r.loan) === 15 && Number(r.ded) === 10, JSON.stringify(r));
  const s = await val(`select status from payroll_runs where id = '${RUN}'`);
  assert(s === 'Approved', s); return `Dr = Cr = ${r.d}`;
});
await check('attendance for an approved payroll month is closed', () =>
  tx(HRM, `insert into attendance (employee_id, company_id, work_date, status) values ('${E2}','${HO}','${ymd(3, 20)}','Present')`), 'attendance for that month is closed');
await check('pay from bank: Dr 2050 / Cr bank, line tagged with the bank account', async () => {
  const je = (await as(FM, `select payroll_pay('${RUN}', '${BANK}', '${ymd(4, 2)}') id`)).rows[0].id;
  const r = (await asServer(`select sum(debit) filter (where account_code = '2050') d, count(*) filter (where bank_account_id = '${BANK}' and credit > 0)::int b
    from journal_lines where entry_id = '${je}'`)).rows[0];
  const s = await val(`select status from payroll_runs where id = '${RUN}'`);
  assert(r.b === 1 && Number(r.d) > 0 && s === 'Paid', JSON.stringify(r)); return 'Paid';
});
await check('a paid run cannot be deleted', () => tx(ADMIN, `select payroll_delete_draft('${RUN}')`), 'Only draft payroll can be deleted');

await check('leaver: prorated pay plus end-of-service gratuity, settled once', async () => {
  // Khalid joined Jan 1 of the previous year; leaves 15 April this year: ~1.29 years x 15 days x 300/30
  await asServer(`update employees set joining_date = '${YEAR - 1}-01-01' where id = '${E2}'`);
  await as(HRM, `update employees set termination_date = '${ymd(4, 15)}' where id = '${E2}'`);
  const exp = await val(`select employee_gratuity('${E2}', '${ymd(4, 15)}')`);
  const run = (await as(HRM, `select payroll_generate('${HO}', ${YEAR}, 4) id`)).rows[0].id;
  const r = (await asServer(`select i.gratuity_amount g, i.days_worked dw from payroll_items i where run_id = '${run}' and employee_id = '${E2}'`)).rows[0];
  assert(Number(r.g) === Number(exp) && Number(r.g) > 0 && Number(r.dw) === 15, JSON.stringify(r));
  await as(FM, `select payroll_approve('${run}')`);
  const paid = await val(`select gratuity_paid_on from employees where id = '${E2}'`);
  const je = (await asServer(`select sum(debit) filter (where account_code = '5085') g from journal_lines l join payroll_runs r on r.journal_entry_id = l.entry_id where r.id = '${run}'`)).rows[0];
  assert(paid && Number(je.g) === Number(exp), JSON.stringify({ paid, je })); return `gratuity ${exp}`;
});
await check('gratuity date is set by payroll only', () => tx(HRM, `update employees set gratuity_paid_on = null where id = '${E2}'`), 'set by payroll');
await check('a draft run can be deleted', async () => {
  const run = (await as(HRM, `select payroll_generate('${HO}', ${YEAR}, 6) id`)).rows[0].id;
  await as(ADMIN, `select payroll_delete_draft('${run}')`);
  const n = await val(`select count(*)::int from payroll_runs where id = '${run}'`);
  assert(n === 0, n); return 'deleted';
});
await check('legacy one-step process_payroll needs payroll approve rights', () =>
  tx(HRM, `select process_payroll('${HO}', ${YEAR}, 8, null, null, false)`), 'approval rights');

// ---------------------------------------------------------------- documents and alerts
await check('an HR document must be in the employee\'s office', () =>
  tx(ADMIN, `insert into documents (company_id, document_name, category, employee_id) values ('${DQ}','Passport','HR','${E1}')`), 'another office');
await check('visa expiry raises an HR alert', async () => {
  await as(HRM, `update employees set visa_number = 'V-1', visa_expiry_date = current_date + 5 where id = '${E1}'`);
  await asServer(`select refresh_expiry_notifications(null)`);
  const r = (await asServer(`select title, link from notifications where type = 'employee_document_expiring' and reference_id = '${E1}'`)).rows;
  assert(r.length === 1 && r[0].link === 'employees' && r[0].title === 'Visa expiring: Salim', JSON.stringify(r)); return r[0].title;
});
await check('leave certificates are stored under the leave module', async () => {
  const m = await val(`select storage_module('${HO}/leave/x.pdf')`);
  assert(m === 'leave', m); return m;
});

t.report();
