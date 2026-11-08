import React from 'react';
import { Users, Phone, Mail, Building2, CreditCard, Calendar, DollarSign, ExternalLink, Pencil, ShieldCheck, Printer } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Employee, PayslipModalData } from '../../types/hr';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

interface EmployeeDetailModalProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (employee: Employee) => void;
  latestPayslip: PayslipModalData | null;
}

export const EmployeeDetailModal: React.FC<EmployeeDetailModalProps> = ({
  employee,
  isOpen,
  onClose,
  onEdit,
  latestPayslip,
}) => {
  const { currency, payrollRuns } = useFleet();
  const { openPayslipModal } = useUI();

  if (!employee) return null;

  const pasiEmployee = Math.round(employee.basicSalary * (employee.pasiContributionPercentage || 0) * 10) / 1000;
  const pasiEmployer = Math.round(employee.basicSalary * (employee.employerPasiPercentage || 0) * 10) / 1000;
  const netMonthly = Math.max(0, employee.totalGrossSalary - pasiEmployee);

  // Find all payslip records for this employee across runs
  const employeeRuns = payrollRuns
    .filter(r => r.items.some(i => i.employeeId === employee.id))
    .sort((a, b) => b.year - a.year || b.month - a.month);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm shrink-0 border border-purple-500/20">
            <Users className="w-5 h-5 text-purple-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">{employee.name}</h2>
              <StatusBadge status={employee.status} size="sm" />
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Code: {employee.employeeCode} • {employee.designation} ({employee.department})
            </p>
          </div>
        </div>
      }
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onClose();
              onEdit(employee);
            }}
            leftIcon={<Pencil className="w-4 h-4" />}
          >
            Edit Record
          </Button>

          <div className="flex items-center gap-2">
            {latestPayslip && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  openPayslipModal(latestPayslip);
                }}
                leftIcon={<Printer className="w-4 h-4" />}
              >
                View Latest Payslip
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 text-xs text-slate-300">
        {/* Compensation Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Basic Salary</span>
            <span className="text-lg font-bold text-slate-100 mt-1 block">
              {formatCurrency(employee.basicSalary, currency)}
            </span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Total Allowances</span>
            <span className="text-lg font-bold text-slate-200 mt-1 block">
              {formatCurrency((employee.housingAllowance || 0) + (employee.transportAllowance || 0) + (employee.otherAllowances || 0), currency)}
            </span>
            <span className="text-[10px] text-slate-500">Housing, Transport, Other</span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Monthly Gross Pay</span>
            <span className="text-lg font-bold text-indigo-300 mt-1 block">
              {formatCurrency(employee.totalGrossSalary, currency)}
            </span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Calculated Net Disbursal</span>
            <span className="text-lg font-bold text-emerald-400 mt-1 block">
              {formatCurrency(netMonthly, currency)}
            </span>
            <span className="text-[10px] text-slate-500">After PASI ({employee.pasiContributionPercentage}%)</span>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Personal & Civil Records</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">National / Civil ID</span>
              <span className="font-mono font-semibold text-slate-200">{employee.civilId || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Passport Number</span>
              <span className="font-mono text-slate-200">{employee.passportNumber || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Nationality</span>
              <span className="text-slate-200">{employee.nationality || 'Omani'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Joining Date</span>
              <span className="text-slate-200">{formatDate(employee.joiningDate)}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Phone Contact</span>
              <span className="text-slate-200">{employee.phone || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Email Address</span>
              <span className="text-slate-200">{employee.email || '-'}</span>
            </div>
          </div>
        </div>

        {/* Banking & Disbursal Channel */}
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Banking & PASI Social Protection</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Bank Name</span>
              <span className="font-semibold text-slate-200">{employee.bankName || 'Direct Disbursal'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Account Number</span>
              <span className="font-mono text-slate-200">{employee.bankAccountNumber || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">IBAN</span>
              <span className="font-mono text-slate-200 truncate">{employee.iban || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Employee PASI Share</span>
              <span className="font-semibold text-rose-400">
                {formatCurrency(pasiEmployee, currency)} ({employee.pasiContributionPercentage}%)
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Employer PASI Share</span>
              <span className="font-semibold text-slate-300">
                {formatCurrency(pasiEmployer, currency)} ({employee.employerPasiPercentage}%)
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Disbursal Mode</span>
              <span className="text-slate-200">{employee.paymentMethod}</span>
            </div>
          </div>
        </div>

        {/* Payroll History */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">
            Processed Payroll Runs ({employeeRuns.length})
          </h3>
          {employeeRuns.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center border border-slate-800/80 rounded-xl bg-slate-950/30">
              No processed payroll cycles on record for this employee yet.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="px-3 py-2">Cycle</th>
                    <th className="px-3 py-2">Batch #</th>
                    <th className="px-3 py-2">Payment Date</th>
                    <th className="px-3 py-2 text-right">Gross Pay</th>
                    <th className="px-3 py-2 text-right">Deductions</th>
                    <th className="px-3 py-2 text-right">Net Paid</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {employeeRuns.slice(0, 8).map(run => {
                    const item = run.items.find(i => i.employeeId === employee.id)!;
                    return (
                      <tr key={run.id} className="hover:bg-slate-900/40">
                        <td className="px-3 py-2 font-bold text-slate-100">{run.periodLabel}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{run.payrollNumber}</td>
                        <td className="px-3 py-2 text-slate-400">{formatDate(run.paymentDate || run.processedDate)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-200">{formatCurrency(item.grossPay, currency)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-rose-400">-{formatCurrency(item.totalDeductions, currency)}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-400">{formatCurrency(item.netPay, currency)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => {
                              onClose();
                              openPayslipModal({
                                employeeId: item.employeeId,
                                employeeName: item.employeeName,
                                employeeCode: item.employeeCode,
                                designation: item.designation,
                                department: item.department,
                                month: run.month,
                                year: run.year,
                                periodLabel: run.periodLabel,
                                paymentDate: run.paymentDate || run.processedDate || run.createdAt,
                                basicSalary: item.basicSalary,
                                housingAllowance: item.housingAllowance,
                                transportAllowance: item.transportAllowance,
                                otherAllowances: item.otherAllowances,
                                overtimeAmount: item.overtimeAmount,
                                bonusAmount: item.bonusAmount,
                                grossPay: item.grossPay,
                                pasiEmployeeDeduction: item.pasiEmployeeDeduction,
                                unpaidLeaveDeduction: item.unpaidLeaveDeduction,
                                loanAdvanceDeduction: item.loanAdvanceDeduction,
                                otherDeductions: item.otherDeductions,
                                totalDeductions: item.totalDeductions,
                                netPay: item.netPay,
                                bankName: item.bankName,
                                iban: item.iban,
                                status: item.status,
                              });
                            }}
                            className="text-forest-400 hover:underline font-semibold cursor-pointer"
                          >
                            Payslip
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
