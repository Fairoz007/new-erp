import type { PayrollLineItem, PayrollRun, PayslipModalData } from '../../types/hr';

export const toPayslip = (run: PayrollRun, item: PayrollLineItem): PayslipModalData => ({
  employeeId: item.employeeId, employeeName: item.employeeName, employeeCode: item.employeeCode, designation: item.designation,
  department: item.department, month: run.month, year: run.year, periodLabel: run.periodLabel,
  paymentDate: run.paymentDate || run.processedDate || run.createdAt,
  basicSalary: item.basicSalary, housingAllowance: item.housingAllowance, transportAllowance: item.transportAllowance,
  otherAllowances: item.otherAllowances, overtimeAmount: item.overtimeAmount, bonusAmount: item.bonusAmount, grossPay: item.grossPay,
  pasiEmployeeDeduction: item.pasiEmployeeDeduction, unpaidLeaveDeduction: item.unpaidLeaveDeduction,
  loanAdvanceDeduction: item.loanAdvanceDeduction, otherDeductions: item.otherDeductions, totalDeductions: item.totalDeductions,
  netPay: item.netPay, bankName: item.bankName, iban: item.iban, status: item.status,
  lines: item.lines, overtimeHours: item.overtimeHours, unpaidLeaveDays: item.unpaidLeaveDays, daysWorked: item.daysWorked, notes: item.notes,
});

/** The employee's payslip in the latest approved or paid run (drafts are not payslips yet). */
export function latestPayslipOf(runs: PayrollRun[], employeeId: string): PayslipModalData | null {
  const run = runs.filter(r => (r.status === 'Approved' || r.status === 'Paid') && r.items.some(i => i.employeeId === employeeId))
    .sort((a, b) => b.year - a.year || b.month - a.month)[0];
  const item = run?.items.find(i => i.employeeId === employeeId);
  return run && item ? toPayslip(run, item) : null;
}
