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
          <p className="font-bold text-slate-200">{emp.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-[#086343] font-bold text-[10px]">
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
          <span className="text-slate-200 font-bold">{emp.department}</span>
          {emp.assignedVehiclePlate ? (
            <p className="text-[10px] font-mono text-[#086343] font-semibold mt-0.5">Assigned: {emp.assignedVehiclePlate}</p>
          ) : (
            <p className="text-[10px] text-slate-400">General Staff</p>
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
          <span className="text-slate-200 font-bold">{formatCurrency(emp.basicSalary, currency)}</span>
          <p className="text-[10px] text-slate-400 font-sans">PASI: {emp.pasiContributionPercentage}%</p>
        </div>
      ),
    },
    {
      key: 'housingAllowance',
      header: 'Allowances',
      align: 'right',
      render: (emp) => {
        const totalAllowances = emp.housingAllowance + emp.transportAllowance + (emp.otherAllowances || 0);
        return (
          <div className="text-right font-mono">
            <span className="text-slate-300 font-semibold">{formatCurrency(totalAllowances, currency)}</span>
            <p className="text-[10px] text-slate-400 font-sans">Housing + Transport + Other</p>
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
          <span className="text-slate-100 font-extrabold text-sm">{formatCurrency(emp.totalGrossSalary, currency)}</span>
        </div>
      ),
    },
    {
      key: 'pasiDeduction',
      header: 'PASI Deduction',
      align: 'right',
      render: (emp) => {
        const pasiAmount = (emp.basicSalary * (emp.pasiContributionPercentage || 0)) / 100;
        return (
          <div className="text-right font-mono">
            <span className="text-amber-700 font-bold">{formatCurrency(pasiAmount, currency)}</span>
            <p className="text-[10px] text-slate-400 font-sans">Statutory</p>
          </div>
        );
      },
    },
    {
      key: 'netSalary',
      header: 'Net Take-Home',
      align: 'right',
      render: (emp) => {
        const pasiAmount = (emp.basicSalary * (emp.pasiContributionPercentage || 0)) / 100;
        const net = emp.totalGrossSalary - pasiAmount;
        return (
          <div className="text-right font-mono">
            <span className="text-[#086343] font-extrabold text-sm">{formatCurrency(net, currency)}</span>
            <p className="text-[10px] text-slate-400 font-sans">WPS Direct</p>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      render: (emp) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              const pasiAmount = (emp.basicSalary * (emp.pasiContributionPercentage || 0)) / 100;
              const net = emp.totalGrossSalary - pasiAmount;
              openPayslipModal({
                employeeId: emp.id,
                employeeName: emp.name,
                employeeCode: emp.employeeCode,
                designation: emp.designation,
                department: emp.department,
                month: 8,
                year: 2026,
                periodLabel: 'August 2026',
                paymentDate: '2026-08-28',
                basicSalary: emp.basicSalary,
                housingAllowance: emp.housingAllowance,
                transportAllowance: emp.transportAllowance,
                otherAllowances: emp.otherAllowances || 0,
                overtimeAmount: 0,
                bonusAmount: 0,
                grossPay: emp.totalGrossSalary,
                pasiEmployeeDeduction: pasiAmount,
                unpaidLeaveDeduction: 0,
                loanAdvanceDeduction: 0,
                otherDeductions: 0,
                totalDeductions: pasiAmount,
                netPay: net,
                bankName: emp.bankName,
                iban: emp.iban,
                status: 'Paid',
              });
            }}
            leftIcon={<Printer className="w-3.5 h-3.5" />}
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            HR & Payroll Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            WPS electronic salary settlement, employee compensation structures, statutory PASI (7%), and auto-balanced GL postings.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="secondary"
            size="md"
            onClick={() => openQuickModal('run-payroll')}
            leftIcon={<Play className="w-4 h-4 text-[#086343] fill-current" />}
          >
            Disburse Payroll
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => openQuickModal('add-employee')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Enroll Employee
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Active Workforce"
          value={activeEmployees.length}
          subValue={`${employees.length} Total Registered`}
          isHero={true}
        />
        <StatCard
          title="Monthly Gross Payroll"
          value={formatCurrency(totalMonthlyGross, currency)}
          subValue={`Basic: ${formatCurrency(totalMonthlyBasic, currency)}`}
        />
        <StatCard
          title="PASI Social Insurance (7%)"
          value={formatCurrency(totalMonthlyPasi, currency)}
          subValue="Omani statutory deduction"
        />
        <StatCard
          title="Net Take-Home Disbursal"
          value={formatCurrency(totalMonthlyNet, currency)}
          subValue="WPS Direct Bank Transfer"
          trend={{ value: '100% Settled', direction: 'up' }}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center p-1 bg-slate-850 border border-slate-700 rounded-full w-fit">
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'employees'
              ? 'bg-white text-slate-100 shadow-2xs'
              : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff & Drivers Directory ({employees.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'runs'
              ? 'bg-white text-slate-100 shadow-2xs'
              : 'text-slate-400 hover:text-slate-100'
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
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
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
          <Card className="overflow-hidden border border-slate-700 bg-white shadow-card rounded-[20px]">
            <div className="p-5 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-100">
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
                  <tr className="bg-slate-850 border-b border-slate-700 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-5">Payroll Ref #</th>
                    <th className="py-3.5 px-5">Month & Period</th>
                    <th className="py-3.5 px-5">Disbursal Date</th>
                    <th className="py-3.5 px-5 text-center">Staff Count</th>
                    <th className="py-3.5 px-5 text-right">Total Gross</th>
                    <th className="py-3.5 px-5 text-right">Total PASI</th>
                    <th className="py-3.5 px-5 text-right">Net Disbursed</th>
                    <th className="py-3.5 px-5 text-center">WPS Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/80 bg-white">
                  {payrollRuns.map(run => (
                    <tr key={run.id} className="hover:bg-slate-850/60 transition-colors">
                      <td className="py-3.5 px-5 font-mono font-bold text-slate-100">{run.payrollNumber}</td>
                      <td className="py-3.5 px-5 font-bold text-slate-200">{run.periodLabel}</td>
                      <td className="py-3.5 px-5 text-slate-400">{formatDate(run.paymentDate || run.createdAt)}</td>
                      <td className="py-3.5 px-5 text-center font-bold text-slate-200">{run.totalEmployees} Staff</td>
                      <td className="py-3.5 px-5 text-right font-mono font-bold text-slate-100">{formatCurrency(run.totalGrossPay, currency)}</td>
                      <td className="py-3.5 px-5 text-right font-mono text-amber-700 font-bold">{formatCurrency(run.totalPasiDeduction, currency)}</td>
                      <td className="py-3.5 px-5 text-right font-mono font-extrabold text-[#086343]">{formatCurrency(run.totalNetPayout, currency)}</td>
                      <td className="py-3.5 px-5 text-center">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#DCEFE5] text-[#06452F] font-bold text-[10px]">
                          {run.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setSelectedRun(run)}
                          leftIcon={<Eye className="w-3.5 h-3.5" />}
                        >
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Selected Payroll Run Breakdown Modal */}
      {selectedRun && (
        <Modal
          isOpen={!!selectedRun}
          onClose={() => setSelectedRun(null)}
          title={`WPS Payroll Batch Breakdown - ${selectedRun.periodLabel} (${selectedRun.payrollNumber})`}
          description={`Automated double-entry GL journal voucher created with WPS direct disbursement across Oman banks.`}
          size="2xl"
          footer={
            <Button variant="primary" size="sm" onClick={() => setSelectedRun(null)}>
              Close Breakdown
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-850 p-4 rounded-2xl border border-slate-700">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Total Gross</p>
                <p className="text-sm font-extrabold text-slate-100 mt-0.5">{formatCurrency(selectedRun.totalGrossPay, currency)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Total PASI</p>
                <p className="text-sm font-extrabold text-amber-700 mt-0.5">{formatCurrency(selectedRun.totalPasiDeduction, currency)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Net Disbursed</p>
                <p className="text-sm font-extrabold text-[#086343] mt-0.5">{formatCurrency(selectedRun.totalNetPayout, currency)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Audited Staff</p>
                <p className="text-sm font-extrabold text-slate-100 mt-0.5">{selectedRun.totalEmployees} Employees</p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-700 rounded-2xl">
              <table className="w-full text-left">
                <thead className="bg-slate-850 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Staff Name</th>
                    <th className="py-2.5 px-3">Dept</th>
                    <th className="py-2.5 px-3 text-right">Basic</th>
                    <th className="py-2.5 px-3 text-right">Allowances</th>
                    <th className="py-2.5 px-3 text-right">Gross</th>
                    <th className="py-2.5 px-3 text-right">PASI</th>
                    <th className="py-2.5 px-3 text-right">Net Take-Home</th>
                    <th className="py-2.5 px-3 text-center">Payslip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700 bg-white">
                  {selectedRun.items?.map(item => (
                    <tr key={item.employeeId} className="hover:bg-slate-850/60">
                      <td className="py-2 px-3 font-bold text-slate-100">
                        {item.employeeName}
                        <p className="text-[10px] text-slate-400 font-mono font-normal">{item.employeeCode}</p>
                      </td>
                      <td className="py-2 px-3 text-slate-300 font-medium">{item.department}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-200">{formatCurrency(item.basicSalary, currency)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-400">{formatCurrency(item.housingAllowance + item.transportAllowance + item.otherAllowances, currency)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-100">{formatCurrency(item.grossPay, currency)}</td>
                      <td className="py-2 px-3 text-right font-mono text-amber-700 font-bold">{formatCurrency(item.pasiEmployeeDeduction, currency)}</td>
                      <td className="py-2 px-3 text-right font-mono font-extrabold text-[#086343]">{formatCurrency(item.netPay, currency)}</td>
                      <td className="py-2 px-3 text-center">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            openPayslipModal({
                              employeeId: item.employeeId,
                              employeeName: item.employeeName,
                              employeeCode: item.employeeCode,
                              designation: item.designation,
                              department: item.department,
                              month: selectedRun.month,
                              year: selectedRun.year,
                              periodLabel: selectedRun.periodLabel,
                              paymentDate: selectedRun.paymentDate || selectedRun.createdAt,
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
                          leftIcon={<Printer className="w-3.5 h-3.5" />}
                        >
                          Print
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
