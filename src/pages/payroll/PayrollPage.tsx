import React, { useState } from 'react';
import { Users, DollarSign, Calculator, Printer, Plus, Play, Eye, FileText, CheckCircle2, ShieldCheck, Download, CreditCard, Building2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Employee, PayrollRun, PayrollLineItem } from '../../types/hr';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const PayrollPage: React.FC = () => {
  const { employees, payrollRuns, currency, selectedCompanyId } = useFleet();
  const { openQuickModal, openPayslipModal } = useUI();
  const [activeTab, setActiveTab] = useState<'employees' | 'runs'>('employees');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);

  const activeEmployees = employees.filter(e => e.status === 'Active');
  const totalMonthlyGross = activeEmployees.reduce((s, e) => s + e.totalGrossSalary, 0);
  const totalMonthlyBasic = activeEmployees.reduce((s, e) => s + e.basicSalary, 0);
  const totalMonthlyPasi = activeEmployees.reduce((s, e) => s + (e.basicSalary * (e.pasiContributionPercentage || 0)) / 100, 0);
  const totalMonthlyNet = totalMonthlyGross - totalMonthlyPasi;

  const filteredEmployees = employees.filter(e => {
    if (deptFilter !== 'all' && e.department !== deptFilter) return false;
    return true;
  });

  const employeeColumns: Column<Employee>[] = [
    {
      key: 'employeeCode',
      header: 'Emp ID / Name',
      render: (emp) => (
        <div>
          <span className="font-mono font-bold text-slate-100">{emp.employeeCode}</span>
          <p className="font-semibold text-slate-200">{emp.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-indigo-300 text-[10px]">
              {emp.designation}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department & Vehicle',
      render: (emp) => (
        <div>
          <span className="text-slate-200 font-medium">{emp.department}</span>
          {emp.assignedVehiclePlate ? (
            <p className="text-[10px] font-mono text-indigo-400">Assigned: {emp.assignedVehiclePlate}</p>
          ) : (
            <p className="text-[10px] text-slate-500">General Staff</p>
          )}
        </div>
      ),
    },
    {
      key: 'basicSalary',
      header: 'Basic Salary',
      align: 'right',
      render: (emp) => (
        <div className="text-right font-mono">
          <span className="text-slate-200 font-semibold">{formatCurrency(emp.basicSalary, currency)}</span>
          <p className="text-[10px] text-slate-500">PASI: {emp.pasiContributionPercentage}%</p>
        </div>
      ),
    },
    {
      key: 'housingAllowance',
      header: 'Allowances',
      align: 'right',
      render: (emp) => {
        const totalAllowances = emp.housingAllowance + emp.transportAllowance + emp.otherAllowances;
        return (
          <div className="text-right font-mono">
            <span className="text-slate-300">{formatCurrency(totalAllowances, currency)}</span>
            <p className="text-[10px] text-slate-500">
              H: {emp.housingAllowance} | T: {emp.transportAllowance}
            </p>
          </div>
        );
      },
    },
    {
      key: 'totalGrossSalary',
      header: 'Gross Salary',
      align: 'right',
      render: (emp) => (
        <div className="text-right font-mono">
          <span className="font-bold text-emerald-400">{formatCurrency(emp.totalGrossSalary, currency)}</span>
          <p className="text-[10px] text-slate-500">Per Month</p>
        </div>
      ),
    },
    {
      key: 'bankName',
      header: 'Bank & IBAN',
      render: (emp) => (
        <div>
          <p className="text-slate-200 text-[11px] font-medium">{emp.bankName || 'Bank Muscat'}</p>
          <p className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">{emp.iban || emp.accountNumber}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      render: (emp) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              const latestRun = payrollRuns[0];
              const item = latestRun?.items.find(i => i.employeeId === emp.id);
              openPayslipModal({
                employeeId: emp.id,
                employeeCode: emp.employeeCode,
                employeeName: emp.name,
                designation: emp.designation,
                department: emp.department,
                month: latestRun?.month || 8,
                year: latestRun?.year || 2026,
                periodLabel: latestRun?.periodLabel || 'August 2026',
                paymentDate: latestRun?.paymentDate || new Date().toISOString().slice(0, 10),
                basicSalary: emp.basicSalary,
                housingAllowance: emp.housingAllowance,
                transportAllowance: emp.transportAllowance,
                otherAllowances: emp.otherAllowances,
                overtimeAmount: item?.overtimeAmount || 0,
                bonusAmount: item?.bonusAmount || 0,
                grossPay: emp.totalGrossSalary,
                pasiEmployeeDeduction: (emp.basicSalary * (emp.pasiContributionPercentage || 0)) / 100,
                unpaidLeaveDeduction: 0,
                loanAdvanceDeduction: 0,
                otherDeductions: 0,
                totalDeductions: (emp.basicSalary * (emp.pasiContributionPercentage || 0)) / 100,
                netPay: emp.totalGrossSalary - (emp.basicSalary * (emp.pasiContributionPercentage || 0)) / 100,
                bankName: emp.bankName,
                iban: emp.iban,
                status: 'Paid',
              });
            }}
            leftIcon={<Printer className="w-3 h-3" />}
          >
            Payslip
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-indigo-400" />
            <span>HR & Payroll Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            WPS electronic salary settlement, employee compensation structures, statutory PASI (7%), and auto-balanced GL postings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openQuickModal('run-payroll')}
            leftIcon={<Play className="w-4 h-4 text-emerald-400" />}
          >
            Disburse Monthly Payroll
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal('add-employee')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Enroll Employee
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <StatCard
          title="Active Workforce"
          value={activeEmployees.length}
          subValue={`${employees.length} Total Registered`}
          icon={<Users className="w-4 h-4" />}
          variant="indigo"
        />
        <StatCard
          title="Monthly Gross Payroll"
          value={formatCurrency(totalMonthlyGross, currency)}
          subValue={`Basic: ${formatCurrency(totalMonthlyBasic, currency)}`}
          icon={<DollarSign className="w-4 h-4" />}
          variant="blue"
        />
        <StatCard
          title="PASI Social Insurance (7%)"
          value={formatCurrency(totalMonthlyPasi, currency)}
          subValue="Omani statutory deduction"
          icon={<ShieldCheck className="w-4 h-4" />}
          variant="amber"
        />
        <StatCard
          title="Net Take-Home Disbursal"
          value={formatCurrency(totalMonthlyNet, currency)}
          subValue="WPS Direct Bank Transfer"
          icon={<CreditCard className="w-4 h-4" />}
          variant="emerald"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'employees'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff & Drivers Directory ({employees.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'runs'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>WPS Payroll Batches & GL Runs ({payrollRuns.length})</span>
        </button>
      </div>

      {activeTab === 'employees' ? (
        <DataTable
          data={filteredEmployees}
          columns={employeeColumns}
          keyExtractor={e => e.id}
          title="Employee Master Roster"
          searchPlaceholder="Search employees by name, ID, designation, department, vehicle plate..."
          searchFields={['name', 'employeeCode', 'designation', 'department', 'assignedVehiclePlate', 'nationalId']}
          exportFilename="FleetX_Employees_Register"
          filterComponent={
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Departments</option>
              <option value="Fleet & Logistics">Fleet & Logistics (Drivers)</option>
              <option value="Workshop & Maintenance">Workshop & Maintenance</option>
              <option value="Operations">Operations</option>
              <option value="Finance & Accounts">Finance & Accounts</option>
              <option value="Human Resources">Human Resources</option>
              <option value="Executive Management">Executive Management</option>
            </select>
          }
        />
      ) : (
        /* Payroll Batches Log */
        <div className="space-y-4">
          <Card className="overflow-hidden border border-slate-800 shadow-xl">
            <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  WPS Electronic Payroll Disbursal Batches
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Audited monthly payroll history with automated double-entry GL journal vouchers.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">Payroll Ref #</th>
                    <th className="py-3 px-4 font-semibold">Month & Period</th>
                    <th className="py-3 px-4 font-semibold">Disbursal Date</th>
                    <th className="py-3 px-4 font-semibold text-center">Staff Count</th>
                    <th className="py-3 px-4 font-semibold text-right">Gross Total</th>
                    <th className="py-3 px-4 font-semibold text-right text-rose-400">PASI Deductions</th>
                    <th className="py-3 px-4 font-semibold text-right text-emerald-400">Net Remittance</th>
                    <th className="py-3 px-4 font-semibold">Linked GL Journal</th>
                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {payrollRuns.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-500 italic">
                        No payroll batches processed yet. Click "Disburse Monthly Payroll" above.
                      </td>
                    </tr>
                  ) : (
                    payrollRuns.map(run => (
                      <tr key={run.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-100">{run.payrollNumber}</td>
                        <td className="py-3 px-4 font-semibold text-indigo-300">{run.periodLabel}</td>
                        <td className="py-3 px-4 text-slate-300 font-mono">{formatDate(run.paymentDate)}</td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
                            {run.totalEmployees} Staff
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-200">
                          {formatCurrency(run.totalGrossPay, currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-400">
                          {formatCurrency(run.totalPasiDeduction, currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          {formatCurrency(run.totalNetPayout, currency)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono text-[10px] font-bold">
                            {run.journalEntryId ? 'JE-POSTED' : 'JE-AUTO'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setSelectedRun(run)}
                            leftIcon={<Eye className="w-3 h-3" />}
                          >
                            View Breakdown
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Payroll Run Detail Modal */}
      {selectedRun && (
        <Modal
          isOpen={!!selectedRun}
          onClose={() => setSelectedRun(null)}
          title={`Payroll Breakdown: ${selectedRun.periodLabel} (${selectedRun.payrollNumber})`}
          description={`Processed via ${selectedRun.bankAccountName || 'Bank Muscat'} on ${formatDate(selectedRun.paymentDate)} • Total Disbursal: ${formatCurrency(selectedRun.totalNetPayout, currency)}`}
          size="xl"
        >
          <div className="space-y-4">
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                    <th className="py-2.5 px-3">Emp ID</th>
                    <th className="py-2.5 px-3">Employee Name</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3 text-right">Basic</th>
                    <th className="py-2.5 px-3 text-right">Gross Pay</th>
                    <th className="py-2.5 px-3 text-right text-rose-400">PASI (7%)</th>
                    <th className="py-2.5 px-3 text-right text-emerald-400 font-bold">Net Payout</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {selectedRun.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-mono font-bold text-slate-200">{item.employeeCode}</td>
                      <td className="py-2 px-3 font-medium text-slate-100">{item.employeeName}</td>
                      <td className="py-2 px-3 text-slate-400">{item.department}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-300">{formatCurrency(item.basicSalary, currency)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-200">{formatCurrency(item.grossPay, currency)}</td>
                      <td className="py-2 px-3 text-right font-mono text-rose-400">{formatCurrency(item.pasiEmployeeDeduction, currency)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(item.netPay, currency)}</td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            openPayslipModal({
                              employeeId: item.employeeId,
                              employeeCode: item.employeeCode,
                              employeeName: item.employeeName,
                              designation: item.designation,
                              department: item.department,
                              month: selectedRun.month,
                              year: selectedRun.year,
                              periodLabel: selectedRun.periodLabel,
                              paymentDate: selectedRun.paymentDate || selectedRun.createdAt.slice(0, 10),
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
                          leftIcon={<Printer className="w-3 h-3" />}
                        >
                          Slip
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedRun(null)}>
                Close Breakdown
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
