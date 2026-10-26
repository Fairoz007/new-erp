import React from 'react';
import { Printer } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useUI } from '../../context/UIContext';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const PrintablePayslipModal: React.FC = () => {
  const { viewingPayslip, closePayslipModal } = useUI();
  const { currency, companies, employees } = useFleet();

  if (!viewingPayslip) return null;

  // The payslip belongs to the employee's own company, not whichever office is selected in the header.
  const employee = employees.find(e => e.id === viewingPayslip.employeeId);
  const company = companies.find(c => c.id === employee?.companyId);
  const companyName = company?.name ?? '';
  const initials = companyName.split(/\s+/).filter(Boolean).slice(0, 3).map(w => w[0]).join('').toUpperCase();
  const isPaid = viewingPayslip.status === 'Paid';

  const handlePrint = () => {
    window.print();
  };


  return (
    <Modal
      isOpen={!!viewingPayslip}
      onClose={closePayslipModal}
      title={`Employee Payslip — ${viewingPayslip.periodLabel}`}
      description={`Confidential salary disbursal statement for ${viewingPayslip.employeeName} (${viewingPayslip.employeeCode})`}
      size="lg"
    >
      <div id="printable-payslip" className="space-y-6 text-slate-200 printable-payslip-content">
        {/* Company Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-lg">
              {initials || '—'}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {companyName || 'Company not available'}
              </h2>
              {company?.registrationNumber && <p className="text-xs text-slate-400">CR No: {company.registrationNumber}</p>}
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider block">
              MONTHLY SALARY ADVICE
            </span>
            <span className="text-xs text-slate-300 font-medium">Period: {viewingPayslip.periodLabel}</span>
          </div>
        </div>

        {/* Employee Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Employee Name</span>
            <p className="font-bold text-slate-100">{viewingPayslip.employeeName}</p>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Employee ID</span>
            <p className="font-mono font-bold text-indigo-300">{viewingPayslip.employeeCode}</p>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Designation</span>
            <p className="font-semibold text-slate-200">{viewingPayslip.designation}</p>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Department</span>
            <p className="font-semibold text-slate-200">{viewingPayslip.department}</p>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Bank Name</span>
            <p className="text-slate-300">{viewingPayslip.bankName || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <span className="text-[10px] text-slate-400 block uppercase">IBAN / Account Number</span>
            <p className="font-mono text-slate-300 text-[11px]">{viewingPayslip.iban || '—'}</p>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">{isPaid ? 'Payment Date' : 'Pay Date (scheduled)'}</span>
            <p className="text-slate-300">{formatDate(viewingPayslip.paymentDate)}</p>
          </div>
        </div>

        {/* Earnings & Deductions Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Earnings */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
            <div className="p-2.5 bg-emerald-950/40 border-b border-slate-800 flex justify-between items-center text-xs font-semibold text-emerald-300 uppercase">
              <span>Earnings</span>
              <span>Amount ({currency})</span>
            </div>
            <div className="divide-y divide-slate-800/60 text-xs">
              <div className="p-2.5 flex justify-between">
                <span className="text-slate-300">Basic Salary</span>
                <span className="font-mono font-semibold">{formatCurrency(viewingPayslip.basicSalary, currency)}</span>
              </div>
              <div className="p-2.5 flex justify-between">
                <span className="text-slate-300">Housing Allowance</span>
                <span className="font-mono">{formatCurrency(viewingPayslip.housingAllowance, currency)}</span>
              </div>
              <div className="p-2.5 flex justify-between">
                <span className="text-slate-300">Transport Allowance</span>
                <span className="font-mono">{formatCurrency(viewingPayslip.transportAllowance, currency)}</span>
              </div>
              {viewingPayslip.otherAllowances > 0 && (
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-300">Other Allowances</span>
                  <span className="font-mono">{formatCurrency(viewingPayslip.otherAllowances, currency)}</span>
                </div>
              )}
              {viewingPayslip.overtimeAmount > 0 && (
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-300">Overtime & Trips</span>
                  <span className="font-mono">{formatCurrency(viewingPayslip.overtimeAmount, currency)}</span>
                </div>
              )}
              {viewingPayslip.bonusAmount > 0 && (
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-300">Bonus</span>
                  <span className="font-mono">{formatCurrency(viewingPayslip.bonusAmount, currency)}</span>
                </div>
              )}
              <div className="p-2.5 bg-emerald-950/20 font-bold flex justify-between text-emerald-300">
                <span>Total Gross Earnings</span>
                <span className="font-mono">{formatCurrency(viewingPayslip.grossPay, currency)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
            <div className="p-2.5 bg-rose-950/40 border-b border-slate-800 flex justify-between items-center text-xs font-semibold text-rose-300 uppercase">
              <span>Deductions</span>
              <span>Amount ({currency})</span>
            </div>
            <div className="divide-y divide-slate-800/60 text-xs">
              <div className="p-2.5 flex justify-between">
                <span className="text-slate-300">PASI Social Insurance (employee share)</span>
                <span className="font-mono font-semibold text-rose-400">
                  {formatCurrency(viewingPayslip.pasiEmployeeDeduction, currency)}
                </span>
              </div>
              {viewingPayslip.unpaidLeaveDeduction > 0 && (
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-300">Unpaid Leave</span>
                  <span className="font-mono text-rose-400">{formatCurrency(viewingPayslip.unpaidLeaveDeduction, currency)}</span>
                </div>
              )}
              {viewingPayslip.otherDeductions > 0 && (
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-300">Other Deductions</span>
                  <span className="font-mono text-rose-400">{formatCurrency(viewingPayslip.otherDeductions, currency)}</span>
                </div>
              )}
              {viewingPayslip.loanAdvanceDeduction > 0 && (
                <div className="p-2.5 flex justify-between">
                  <span className="text-slate-300">Salary Advance / Loan</span>
                  <span className="font-mono text-rose-400">{formatCurrency(viewingPayslip.loanAdvanceDeduction, currency)}</span>
                </div>
              )}
              <div className="p-2.5 bg-rose-950/20 font-bold flex justify-between text-rose-300">
                <span>Total Deductions</span>
                <span className="font-mono">{formatCurrency(viewingPayslip.totalDeductions, currency)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Net Take-Home Pay Banner */}
        <div className="p-4 bg-gradient-to-r from-indigo-950/70 via-slate-900/80 to-emerald-950/70 rounded-xl border border-indigo-500/40 flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-300 block font-semibold">
              Net Pay (Take Home)
            </span>
            <p className="text-xs text-emerald-400 font-medium mt-0.5">
              {isPaid ? 'Paid' : `Status: ${viewingPayslip.status}`}
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
              {formatCurrency(viewingPayslip.netPay, currency)}
            </span>
          </div>
        </div>

        {/* Footer Signatures */}
        <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-800 text-center text-xs text-slate-400">
          <div>
            <div className="h-10 border-b border-dashed border-slate-700 mx-auto w-40 mb-1"></div>
            <p className="font-semibold text-slate-300">Prepared by: HR & Payroll Officer</p>
            <p className="text-[10px] text-slate-500">{companyName}</p>
          </div>
          <div>
            <div className="h-10 border-b border-dashed border-slate-700 mx-auto w-40 mb-1"></div>
            <p className="font-semibold text-slate-300">Employee Signature & Date</p>
            <p className="text-[10px] text-slate-500">I acknowledge receipt of the net pay above</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-800 print:hidden">
          <Button variant="secondary" size="sm" onClick={closePayslipModal}>
            Close
          </Button>
          <Button variant="primary" size="sm" onClick={handlePrint} leftIcon={<Printer className="w-4 h-4" />}>
            Print Payslip
          </Button>
        </div>
      </div>
    </Modal>
  );
};
