import React, { useState } from 'react';
import { Users, Calculator, Printer, Plus, Play, Eye, Pencil, Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Employee, EmployeeDepartment, EmployeeStatus, PayrollRun, PayrollLineItem, PayslipModalData } from '../../types/hr';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

const DEPARTMENTS: EmployeeDepartment[] = ['Fleet & Logistics', 'Workshop & Maintenance', 'Operations', 'Finance & Accounts', 'Human Resources', 'Executive Management'];
const STATUSES: EmployeeStatus[] = ['Active', 'Probation', 'On Leave', 'Terminated'];
// Same eligibility rule as the process_payroll RPC.
const isPayable = (e: Employee) => e.status === 'Active' || e.status === 'Probation';
const pasiOf = (e: Employee) => Math.round(e.basicSalary * (e.pasiContributionPercentage || 0) * 10) / 1000;

const toPayslip = (run: PayrollRun, item: PayrollLineItem): PayslipModalData => ({
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

export const PayrollPage: React.FC = () => {
  const { employees: allEmployees, payrollRuns: allPayrollRuns, currency, selectedCompanyId, updateEmployee, deleteEmployee } = useFleet();
  const inScope = (cid: string) => !selectedCompanyId || selectedCompanyId === 'all' || cid === selectedCompanyId;
  const employees = allEmployees.filter(e => inScope(e.companyId));
  const payrollRuns = allPayrollRuns.filter(r => inScope(r.companyId));
  const { openQuickModal, openPayslipModal, addToast } = useUI();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('create', 'payroll');
  const canEdit = hasPermission('edit', 'payroll');
  const canDelete = hasPermission('delete', 'payroll');
  const [activeTab, setActiveTab] = useState<'employees' | 'runs'>('employees');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<Partial<Employee>>({});
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [pending, setPending] = useState(false);

  const payable = employees.filter(isPayable);
  const totalMonthlyGross = payable.reduce((s, e) => s + e.totalGrossSalary, 0);
  const totalMonthlyBasic = payable.reduce((s, e) => s + e.basicSalary, 0);
  const totalMonthlyPasi = payable.reduce((s, e) => s + pasiOf(e), 0);
  const totalMonthlyNet = totalMonthlyGross - totalMonthlyPasi;

  const filteredEmployees = employees.filter(e => deptFilter === 'all' || e.department === deptFilter);

  // Latest processed payslip line for an employee (payslips are only shown for processed runs).
  const latestPayslip = (emp: Employee): PayslipModalData | null => {
    const runs = [...payrollRuns].sort((a, b) => b.year - a.year || b.month - a.month);
    for (const run of runs) {
      const item = run.items.find(i => i.employeeId === emp.id);
      if (item) return toPayslip(run, item);
    }
    return null;
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setEditForm({
      name: emp.name, designation: emp.designation, department: emp.department, status: emp.status,
      joiningDate: emp.joiningDate, email: emp.email, phone: emp.phone, civilId: emp.civilId,
      passportNumber: emp.passportNumber, nationality: emp.nationality,
      basicSalary: emp.basicSalary, housingAllowance: emp.housingAllowance, transportAllowance: emp.transportAllowance,
      otherAllowances: emp.otherAllowances, pasiContributionPercentage: emp.pasiContributionPercentage,
      employerPasiPercentage: emp.employerPasiPercentage, paymentMethod: emp.paymentMethod,
      bankName: emp.bankName, iban: emp.iban, bankAccountNumber: emp.bankAccountNumber, notes: emp.notes,
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || pending) return;
    const money = ['basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances'] as const;
    if (money.some(k => !(Number(editForm[k]) >= 0))) {
      addToast({ type: 'error', title: 'Invalid salary', message: 'Salary components must be zero or positive.' });
      return;
    }
    setPending(true);
    try {
      // total gross salary is computed by the database
      await updateEmployee(editing.id, {
        ...editForm,
        basicSalary: Number(editForm.basicSalary), housingAllowance: Number(editForm.housingAllowance),
        transportAllowance: Number(editForm.transportAllowance), otherAllowances: Number(editForm.otherAllowances),
        pasiContributionPercentage: Number(editForm.pasiContributionPercentage),
        employerPasiPercentage: Number(editForm.employerPasiPercentage ?? 0),
      });
      addToast({ type: 'success', title: 'Employee updated', message: `${editing.name} saved.` });
      setEditing(null);
    } catch (err) {
      addToast({ type: 'error', title: 'Update failed', message: (err as Error).message });
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting || pending) return;
    setPending(true);
    try {
      await deleteEmployee(deleting.id);
      addToast({ type: 'success', title: 'Employee removed', message: `${deleting.name} deleted.` });
      setDeleting(null);
    } catch (err) {
      addToast({ type: 'error', title: 'Delete failed', message: (err as Error).message });
    } finally {
      setPending(false);
    }
  };

  const employeeColumns: Column<Employee>[] = [
    {
      key: 'employeeCode',
      header: 'Emp ID / Name',
      render: (emp) => (
        <div>
          <span className="font-mono font-bold text-slate-100">{emp.employeeCode}</span>
          <p className="font-bold text-slate-200">{emp.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-[#086343] font-bold text-[10px]">{emp.designation}</span>
            {emp.status !== 'Active' && <span className="text-[10px] text-amber-500 font-semibold">{emp.status}</span>}
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
            <p className="text-[10px] text-slate-400">No vehicle assigned</p>
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
      render: (emp) => (
        <div className="text-right font-mono">
          <span className="text-slate-300 font-semibold">{formatCurrency(emp.housingAllowance + emp.transportAllowance + (emp.otherAllowances || 0), currency)}</span>
          <p className="text-[10px] text-slate-400 font-sans">Housing + Transport + Other</p>
        </div>
      ),
    },
    {
      key: 'totalGrossSalary',
      header: 'Gross Salary',
      align: 'right',
      render: (emp) => <div className="text-right font-mono"><span className="text-slate-100 font-extrabold text-sm">{formatCurrency(emp.totalGrossSalary, currency)}</span></div>,
    },
    {
      key: 'pasiDeduction',
      header: 'PASI Deduction',
      align: 'right',
      render: (emp) => (
        <div className="text-right font-mono">
          <span className="text-amber-700 font-bold">{formatCurrency(pasiOf(emp), currency)}</span>
          <p className="text-[10px] text-slate-400 font-sans">Employee share on basic</p>
        </div>
      ),
    },
    {
      key: 'netSalary',
      header: 'Net Take-Home',
      align: 'right',
      render: (emp) => (
        <div className="text-right font-mono">
          <span className="text-[#086343] font-extrabold text-sm">{formatCurrency(emp.totalGrossSalary - pasiOf(emp), currency)}</span>
          <p className="text-[10px] text-slate-400 font-sans">Before other deductions</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      render: (emp) => {
        const slip = latestPayslip(emp);
        return (
          <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="xs" disabled={!slip} title={slip ? `Latest payslip: ${slip.periodLabel}` : 'No processed payslip yet'}
              onClick={() => slip && openPayslipModal(slip)} leftIcon={<Printer className="w-3.5 h-3.5" />}>
              Payslip
            </Button>
            {canEdit && <Button variant="ghost" size="xs" onClick={() => openEdit(emp)} leftIcon={<Pencil className="w-3.5 h-3.5" />}>Edit</Button>}
            {canDelete && <Button variant="ghost" size="xs" onClick={() => setDeleting(emp)} leftIcon={<Trash2 className="w-3.5 h-3.5" />}>Delete</Button>}
          </div>
        );
      },
    },
  ];

  const num = (v: unknown) => (v === undefined || v === null ? '' : String(v));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">HR & Payroll Management</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Employee compensation, statutory PASI (employee and employer shares), monthly payroll runs and their balanced GL postings.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {canCreate && hasPermission('create', 'accounting') && (
            <Button variant="secondary" size="md" onClick={() => openQuickModal('run-payroll')} leftIcon={<Play className="w-4 h-4 text-[#086343] fill-current" />}>
              Disburse Payroll
            </Button>
          )}
          {canCreate && (
            <Button variant="primary" size="md" onClick={() => openQuickModal('add-employee')} leftIcon={<Plus className="w-4 h-4" />}>
              Enroll Employee
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards: projections from current salary structures of payable staff */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Payable Workforce" value={payable.length} subValue={`${employees.length} total registered (Active + Probation are paid)`} isHero={true} />
        <StatCard title="Monthly Gross Payroll" value={formatCurrency(totalMonthlyGross, currency)} subValue={`Basic: ${formatCurrency(totalMonthlyBasic, currency)}`} />
        <StatCard title="PASI Employee Share" value={formatCurrency(totalMonthlyPasi, currency)} subValue="Per employee PASI % of basic" />
        <StatCard title="Projected Net Pay" value={formatCurrency(totalMonthlyNet, currency)} subValue="Current salaries, before other deductions" />
      </div>

      {/* Tabs */}
      <div className="flex items-center p-1 bg-slate-850 border border-slate-700 rounded-full w-fit">
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'employees' ? 'bg-white text-slate-100 shadow-2xs' : 'text-slate-400 hover:text-slate-100'}`}
        >
          <Users className="w-4 h-4" />
          <span>Staff & Drivers Directory ({employees.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'runs' ? 'bg-white text-slate-100 shadow-2xs' : 'text-slate-400 hover:text-slate-100'}`}
        >
          <Calculator className="w-4 h-4" />
          <span>Payroll Runs & GL Postings ({payrollRuns.length})</span>
        </button>
      </div>

      {activeTab === 'employees' ? (
        <DataTable
          data={filteredEmployees}
          columns={employeeColumns}
          keyExtractor={e => e.id}
          title="Employee Master Roster"
          searchPlaceholder="Search employees by name, ID, designation, department, vehicle plate..."
          searchFields={['name', 'employeeCode', 'designation', 'department', 'assignedVehiclePlate']}
          exportFilename="FleetX_Employees_Register"
          emptyMessage="No employees registered for this selection."
          filterComponent={
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Departments</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          }
        />
      ) : (
        <div className="space-y-4">
          <Card className="overflow-hidden border border-slate-700 bg-white shadow-card rounded-[20px]">
            <div className="p-5 border-b border-slate-700">
              <h3 className="text-base font-bold text-slate-100">Monthly Payroll Runs</h3>
              <p className="text-xs text-slate-400 mt-0.5">One run per company and month, each with its balanced GL journal.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-850 border-b border-slate-700 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-5">Payroll Ref #</th>
                    <th className="py-3.5 px-5">Month & Period</th>
                    <th className="py-3.5 px-5">Payment Date</th>
                    <th className="py-3.5 px-5 text-center">Staff Count</th>
                    <th className="py-3.5 px-5 text-right">Total Gross</th>
                    <th className="py-3.5 px-5 text-right">PASI (employee)</th>
                    <th className="py-3.5 px-5 text-right">Net Pay</th>
                    <th className="py-3.5 px-5 text-center">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/80 bg-white">
                  {payrollRuns.length === 0 && (
                    <tr><td colSpan={9} className="py-8 text-center text-slate-400 italic">No payroll has been processed yet.</td></tr>
                  )}
                  {payrollRuns.map(run => (
                    <tr key={run.id} className="hover:bg-slate-850/60 transition-colors">
                      <td className="py-3.5 px-5 font-mono font-bold text-slate-100">{run.payrollNumber}</td>
                      <td className="py-3.5 px-5 font-bold text-slate-200">{run.periodLabel}</td>
                      <td className="py-3.5 px-5 text-slate-400">{run.paymentDate ? formatDate(run.paymentDate) : '—'}</td>
                      <td className="py-3.5 px-5 text-center font-bold text-slate-200">{run.totalEmployees} Staff</td>
                      <td className="py-3.5 px-5 text-right font-mono font-bold text-slate-100">{formatCurrency(run.totalGrossPay, currency)}</td>
                      <td className="py-3.5 px-5 text-right font-mono text-amber-700 font-bold">{formatCurrency(run.totalPasiDeduction, currency)}</td>
                      <td className="py-3.5 px-5 text-right font-mono font-extrabold text-[#086343]">{formatCurrency(run.totalNetPayout, currency)}</td>
                      <td className="py-3.5 px-5 text-center">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#DCEFE5] text-[#06452F] font-bold text-[10px]">{run.status}</span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <Button variant="ghost" size="xs" onClick={() => setSelectedRun(run)} leftIcon={<Eye className="w-3.5 h-3.5" />}>Details</Button>
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
          title={`Payroll Breakdown - ${selectedRun.periodLabel} (${selectedRun.payrollNumber})`}
          description={selectedRun.journalEntryId
            ? `Posted to the GL${selectedRun.bankAccountName ? `; net pay from ${selectedRun.bankAccountName}` : '; net pay accrued to salaries payable'}.`
            : 'Not posted to the general ledger.'}
          size="2xl"
          footer={<Button variant="primary" size="sm" onClick={() => setSelectedRun(null)}>Close Breakdown</Button>}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-850 p-4 rounded-2xl border border-slate-700">
              <div><p className="text-[10px] text-slate-400 uppercase font-bold">Total Gross</p><p className="text-sm font-extrabold text-slate-100 mt-0.5">{formatCurrency(selectedRun.totalGrossPay, currency)}</p></div>
              <div><p className="text-[10px] text-slate-400 uppercase font-bold">PASI Employee</p><p className="text-sm font-extrabold text-amber-700 mt-0.5">{formatCurrency(selectedRun.totalPasiDeduction, currency)}</p></div>
              <div><p className="text-[10px] text-slate-400 uppercase font-bold">PASI Employer</p><p className="text-sm font-extrabold text-amber-700 mt-0.5">{formatCurrency(selectedRun.totalEmployerPasi ?? 0, currency)}</p></div>
              <div><p className="text-[10px] text-slate-400 uppercase font-bold">Net Pay</p><p className="text-sm font-extrabold text-[#086343] mt-0.5">{formatCurrency(selectedRun.totalNetPayout, currency)}</p></div>
              <div><p className="text-[10px] text-slate-400 uppercase font-bold">Staff</p><p className="text-sm font-extrabold text-slate-100 mt-0.5">{selectedRun.totalEmployees} Employees</p></div>
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
                  {selectedRun.items.map(item => (
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
                        <Button variant="ghost" size="xs" onClick={() => openPayslipModal(toPayslip(selectedRun, item))} leftIcon={<Printer className="w-3.5 h-3.5" />}>Print</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Employee */}
      <Modal isOpen={!!editing} onClose={() => !pending && setEditing(null)} title={`Edit ${editing?.employeeCode ?? ''} — ${editing?.name ?? ''}`}
        description="Changes apply to future payroll runs; processed payslips keep their amounts." size="lg">
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Full Name" value={editForm.name ?? ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
            <Input label="Designation" value={editForm.designation ?? ''} onChange={e => setEditForm({ ...editForm, designation: e.target.value })} required />
            <Select label="Department" value={editForm.department} onChange={e => setEditForm({ ...editForm, department: e.target.value as EmployeeDepartment })}>
              {(DEPARTMENTS.includes(editForm.department as EmployeeDepartment) ? DEPARTMENTS : [editForm.department as EmployeeDepartment, ...DEPARTMENTS]).map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select label="Status" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value as EmployeeStatus })}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Input label="Joining Date" type="date" value={editForm.joiningDate ?? ''} onChange={e => setEditForm({ ...editForm, joiningDate: e.target.value })} required />
            <Input label="Civil ID" value={editForm.civilId ?? ''} onChange={e => setEditForm({ ...editForm, civilId: e.target.value })} />
            <Input label="Passport" value={editForm.passportNumber ?? ''} onChange={e => setEditForm({ ...editForm, passportNumber: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
            <Input label="Basic" type="number" step="0.001" min="0" value={num(editForm.basicSalary)} onChange={e => setEditForm({ ...editForm, basicSalary: Number(e.target.value) })} required />
            <Input label="Housing" type="number" step="0.001" min="0" value={num(editForm.housingAllowance)} onChange={e => setEditForm({ ...editForm, housingAllowance: Number(e.target.value) })} />
            <Input label="Transport" type="number" step="0.001" min="0" value={num(editForm.transportAllowance)} onChange={e => setEditForm({ ...editForm, transportAllowance: Number(e.target.value) })} />
            <Input label="Other" type="number" step="0.001" min="0" value={num(editForm.otherAllowances)} onChange={e => setEditForm({ ...editForm, otherAllowances: Number(e.target.value) })} />
            <Input label="PASI % (employee)" type="number" step="0.01" min="0" max="100" value={num(editForm.pasiContributionPercentage)} onChange={e => setEditForm({ ...editForm, pasiContributionPercentage: Number(e.target.value) })} />
            <Input label="PASI % (employer)" type="number" step="0.01" min="0" max="100" value={num(editForm.employerPasiPercentage)} onChange={e => setEditForm({ ...editForm, employerPasiPercentage: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select label="Payment Method" value={editForm.paymentMethod} onChange={e => setEditForm({ ...editForm, paymentMethod: e.target.value as Employee['paymentMethod'] })}>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
            </Select>
            <Input label="Bank Name" value={editForm.bankName ?? ''} onChange={e => setEditForm({ ...editForm, bankName: e.target.value })} />
            <Input label="Account Number" value={editForm.bankAccountNumber ?? ''} onChange={e => setEditForm({ ...editForm, bankAccountNumber: e.target.value })} />
            <Input label="IBAN" value={editForm.iban ?? ''} onChange={e => setEditForm({ ...editForm, iban: e.target.value })} />
          </div>
          <Textarea label="Notes" value={editForm.notes ?? ''} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setEditing(null)} disabled={pending}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Employee */}
      <Modal isOpen={!!deleting} onClose={() => !pending && setDeleting(null)} title={`Delete ${deleting?.name ?? ''}?`}
        description="Employees with processed payslips cannot be deleted; set their status to Terminated instead." size="sm">
        <div className="space-y-4 text-sm text-slate-300">
          <p>{deleting?.employeeCode} will be permanently removed from the employee register.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={pending}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={pending}>{pending ? 'Deleting…' : 'Delete Employee'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
