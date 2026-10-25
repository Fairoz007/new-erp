// HR & payroll service: employees, payroll runs and payslip lines.
// Conventions: docs/audit/CONTRACTS.md. Every async function throws ServiceError on failure.
// Sensitive columns (civil_id, passport_number, iban, salaries) are readable only by roles with
// 'payroll:view' in the employee's office (RLS); never cache them outside FleetContext state.
import { ServiceError, num, nul, rpcAny, supabase, unwrap, unwrapOne, ymd } from './core';
import type { CollectionKey, Fetchers } from './core';
import type { Employee, EmployeeDepartment, PayrollLineItem, PayrollRun } from '../types/hr';
import { requireCompany } from './accounting';

const r3 = (v: number) => Math.round((v + Number.EPSILON) * 1000) / 1000;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------------------------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------------------------
export const rowToEmployee = (r: any): Employee => ({
  id: r.id,
  employeeCode: r.employee_code,
  companyId: r.company_id,
  name: r.name,
  designation: r.designation,
  department: r.department as EmployeeDepartment,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  civilId: r.civil_id ?? undefined,
  nationalId: r.civil_id ?? undefined,           // the app used both names for the same Oman ID
  passportNumber: r.passport_number ?? undefined,
  nationality: r.nationality ?? undefined,
  joiningDate: ymd(r.joining_date),
  status: r.status,
  avatar: r.avatar ?? undefined,
  basicSalary: num(r.basic_salary),
  housingAllowance: num(r.housing_allowance),
  transportAllowance: num(r.transport_allowance),
  otherAllowances: num(r.other_allowances),
  totalGrossSalary: num(r.total_gross_salary),   // generated column
  bankName: r.bank_name ?? '',
  bankAccountNumber: r.bank_account_number ?? undefined,
  accountNumber: r.bank_account_number ?? undefined,
  iban: r.iban ?? '',
  paymentMethod: r.payment_method ?? 'Bank Transfer',
  socialSecurityNumber: r.social_security_number ?? undefined,
  pasiContributionPercentage: num(r.pasi_employee_pct),
  employerPasiPercentage: num(r.pasi_employer_pct),
  assignedVehicleId: r.assigned_vehicle_id ?? undefined,
  assignedVehiclePlate: r.vehicle?.plate_number ?? undefined,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
});

// App -> DB; only keys present are written. total_gross_salary is generated, employee_code is
// assigned by the DB numbering trigger, assignedVehiclePlate is display-only (send assignedVehicleId).
export const employeeToRow = (e: Partial<Employee>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => { if (v !== undefined) row[k] = v; };
  const opt = (v: string | undefined) => (v === undefined ? undefined : nul(v));
  set('company_id', e.companyId);
  set('name', e.name);
  set('designation', e.designation);
  set('department', e.department);
  set('email', opt(e.email));
  set('phone', opt(e.phone));
  set('civil_id', e.civilId !== undefined ? nul(e.civilId) : opt(e.nationalId));
  set('passport_number', opt(e.passportNumber));
  set('nationality', opt(e.nationality));
  set('joining_date', e.joiningDate);
  set('status', e.status);
  set('avatar', opt(e.avatar));
  set('basic_salary', e.basicSalary);
  set('housing_allowance', e.housingAllowance);
  set('transport_allowance', e.transportAllowance);
  set('other_allowances', e.otherAllowances);
  set('bank_name', opt(e.bankName));
  set('bank_account_number', e.bankAccountNumber !== undefined ? nul(e.bankAccountNumber) : opt(e.accountNumber));
  set('iban', opt(e.iban));
  set('payment_method', e.paymentMethod);
  set('social_security_number', opt(e.socialSecurityNumber));
  set('pasi_employee_pct', e.pasiContributionPercentage);
  set('pasi_employer_pct', e.employerPasiPercentage);
  set('assigned_vehicle_id', opt(e.assignedVehicleId));
  set('notes', opt(e.notes));
  return row;
};

export const rowToPayrollLine = (i: any): PayrollLineItem => ({
  id: i.id,
  employeeId: i.employee_id,
  employeeCode: i.employee?.employee_code ?? '',
  employeeName: i.employee?.name ?? '',
  designation: i.employee?.designation ?? '',
  department: i.employee?.department ?? '',
  basicSalary: num(i.basic_salary),
  housingAllowance: num(i.housing_allowance),
  transportAllowance: num(i.transport_allowance),
  otherAllowances: num(i.other_allowances),
  overtimeAmount: num(i.overtime_amount),
  bonusAmount: num(i.bonus_amount),
  grossPay: num(i.gross_pay),
  pasiEmployeeDeduction: num(i.pasi_employee_deduction),
  pasiEmployerContribution: num(i.pasi_employer_contribution),
  unpaidLeaveDeduction: num(i.unpaid_leave_deduction),
  loanAdvanceDeduction: num(i.loan_advance_deduction),
  otherDeductions: num(i.other_deductions),
  totalDeductions: num(i.total_deductions),
  netPay: num(i.net_pay),
  // bank details are the employee's CURRENT details (not snapshotted on the payslip line)
  paymentMethod: i.employee?.payment_method ?? 'Bank Transfer',
  bankName: i.employee?.bank_name ?? '',
  iban: i.employee?.iban ?? '',
  status: i.status,
});

export const rowToPayrollRun = (r: any): PayrollRun => {
  const items: PayrollLineItem[] = (r.items ?? []).map(rowToPayrollLine)
    .sort((a: PayrollLineItem, b: PayrollLineItem) => a.employeeCode.localeCompare(b.employeeCode));
  const s = (f: (i: PayrollLineItem) => number) => r3(items.reduce((t, i) => t + f(i), 0));
  const bank = r.bank;
  return {
    id: r.id,
    payrollNumber: r.payroll_number,
    companyId: r.company_id,
    companyName: r.company?.name ?? '',
    month: r.month,
    year: r.year,
    periodLabel: `${MONTH_NAMES[r.month - 1]} ${r.year}`,
    totalEmployees: items.length,
    totalBasicSalary: s(i => i.basicSalary),
    totalAllowances: s(i => i.housingAllowance + i.transportAllowance + i.otherAllowances),
    totalGrossPay: s(i => i.grossPay),
    totalPasiDeduction: s(i => i.pasiEmployeeDeduction),
    totalOtherDeductions: s(i => i.unpaidLeaveDeduction + i.loanAdvanceDeduction + i.otherDeductions),
    totalDeductions: s(i => i.totalDeductions),
    totalNetPayout: s(i => i.netPay),
    totalEmployerPasi: s(i => i.pasiEmployerContribution ?? 0),
    items,
    status: r.status,
    approvedBy: r.approver?.name ?? undefined,
    approvedDate: r.approved_date ? ymd(r.approved_date) : undefined,
    processedDate: ymd(r.created_at),
    paymentDate: r.payment_date ? ymd(r.payment_date) : undefined,
    bankAccountId: r.bank_account_id ?? undefined,
    bankAccountName: bank ? `${bank.bank_name} — ${bank.account_name} (${bank.account_number})` : undefined,
    journalEntryId: r.journal_entry_id ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
};

const EMP_SELECT = '*, vehicle:vehicles(plate_number)';
const PR_SELECT = '*, company:companies(name), approver:profiles!payroll_runs_approved_by_fkey(name), ' +
  'bank:bank_accounts!payroll_runs_bank_account_id_fkey(bank_name, account_name, account_number), ' +
  'items:payroll_items(*, employee:employees(employee_code, name, designation, department, payment_method, bank_name, iban))';

// ---------------------------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------------------------
export async function fetchEmployees(): Promise<Employee[]> {
  const rows = await unwrap<any[]>(supabase.from('employees').select(EMP_SELECT).order('employee_code') as any);
  return rows.map(rowToEmployee);
}

export async function fetchPayrollRuns(): Promise<PayrollRun[]> {
  const rows = await unwrap<any[]>(supabase.from('payroll_runs').select(PR_SELECT)
    .order('year', { ascending: false }).order('month', { ascending: false }) as any);
  return rows.map(rowToPayrollRun);
}

export const fetchers: Fetchers = {
  employees: fetchEmployees,
  payrollRuns: fetchPayrollRuns,
};

// ---------------------------------------------------------------------------------------------
// Mutations (same names/params as FleetContext, async)
// ---------------------------------------------------------------------------------------------
const validateSalary = (e: Partial<Employee>) => {
  for (const k of ['basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances'] as const) {
    const v = e[k];
    if (v !== undefined && !(Number(v) >= 0)) throw new ServiceError('Salary components must be zero or positive numbers.');
  }
  for (const k of ['pasiContributionPercentage', 'employerPasiPercentage'] as const) {
    const v = e[k];
    if (v !== undefined && !(Number(v) >= 0 && Number(v) <= 100)) throw new ServiceError('PASI percentages must be between 0 and 100.');
  }
};

export async function addEmployee(emp: Omit<Employee, 'id' | 'employeeCode' | 'createdAt'>): Promise<Employee> {
  requireCompany(emp.companyId);
  validateSalary(emp);
  const row = { ...employeeToRow(emp), employee_code: null };   // DB numbering trigger assigns EMP-###
  return rowToEmployee(await unwrapOne(supabase.from('employees').insert(row as any).select(EMP_SELECT).single() as any));
}

export async function updateEmployee(id: string, emp: Partial<Employee>): Promise<void> {
  validateSalary(emp);
  const row = employeeToRow(emp);
  delete row.company_id;   // payroll history is per office; transfer = terminate + re-enrol
  if (Object.keys(row).length === 0) return;
  const updated = await unwrap<any[]>(supabase.from('employees').update(row as any).eq('id', id).select('id') as any);
  if (!updated?.length) throw new ServiceError('Employee not found or you do not have permission to edit it.');
}

/** Hard delete; the DB refuses (FK) when the employee has payslips — set status 'Terminated' instead. */
export async function deleteEmployee(id: string): Promise<void> {
  try {
    const deleted = await unwrap<any[]>(supabase.from('employees').delete().eq('id', id).select('id') as any);
    if (!deleted?.length) throw new ServiceError('Employee not found or you do not have permission to delete it.');
  } catch (e) {
    if ((e as ServiceError).code === '23503') {
      throw new ServiceError('This employee has processed payslips and cannot be deleted. Set the status to Terminated instead.', { code: '23503' });
    }
    throw e;
  }
}

/**
 * Processes one month's payroll for ONE company through the `process_payroll` RPC (atomic: run +
 * payslip lines + balanced journal). Params are the FleetContext ones plus `companyId` (required).
 * With bankAccountId: net pay is credited to that bank's GL account and the run is 'Paid';
 * without: net pay is accrued to 2050 Salaries Payable and the run is 'Approved'.
 */
export async function processPayrollRun(params: {
  month: number; year: number; paymentDate?: string; bankAccountId?: string; autoPostGL?: boolean; companyId?: string;
}): Promise<PayrollRun> {
  const companyId = requireCompany(params.companyId);
  const id = await rpcAny<string>('process_payroll', {
    p_company: companyId,
    p_year: params.year,
    p_month: params.month,
    p_payment_date: params.paymentDate || null,
    p_bank_account: params.bankAccountId || null,
    p_post_gl: params.autoPostGL ?? true,
  });
  return rowToPayrollRun(await unwrapOne(supabase.from('payroll_runs').select(PR_SELECT).eq('id', id).maybeSingle() as any));
}

export const affects: Record<string, CollectionKey[]> = {
  addEmployee: ['employees'],
  updateEmployee: ['employees'],
  deleteEmployee: ['employees'],
  processPayrollRun: ['payrollRuns', 'journalEntries', 'chartOfAccounts', 'bankAccounts'],
};
