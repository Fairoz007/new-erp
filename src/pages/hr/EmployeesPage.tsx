// HR → Employees: the employee register with department, reporting line and the next expiring paper.
import React, { useState } from 'react';
import { Users, Plus, Pencil, Eye, Trash2, AlertTriangle } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useOptionalOrg } from '../../context/OrgContext';
import { useCustomFields, useCustomFieldFilter, withCustomColumns } from '../../hooks/useCustomFields';
import { useMaster } from '../../hooks/useMaster';
import { EmployeeFormModal } from './EmployeeFormModal';
import { EmployeeDetailModal } from '../payroll/EmployeeDetailModal';
import { latestPayslipOf } from '../payroll/payslip';
import { formatDate, getDaysDifference } from '../../utils/date';
import type { Employee } from '../../types/hr';
import type { Department } from '../../services/org';
import { FilterSelect } from '../../components/ui/FilterControls';
import { PageHeader } from '../../components/ui/PageHeader';

/** The paper (civil ID, passport, visa, labour card) that expires first. */
export function nextExpiry(e: Employee): { label: string; date: string } | null {
  const list = [['Civil ID', e.civilIdExpiryDate], ['Passport', e.passportExpiryDate], ['Visa', e.visaExpiryDate], ['Labour card', e.labourCardExpiryDate]]
    .filter(([, d]) => !!d) as [string, string][];
  if (!list.length) return null;
  const [label, date] = list.sort((a, b) => a[1].localeCompare(b[1]))[0];
  return { label, date };
}

export const EmployeesPage: React.FC = () => {
  const { employees: all, companies, selectedCompanyId, deleteEmployee, currency, payrollRuns } = useFleet();
  const { hasPermission } = useAuth();
  const { addToast } = useUI();
  const alertDays = useOptionalOrg()?.organization?.expiryAlertDays ?? 30;
  const departments = useMaster<Department>('departments').rows;
  const [dept, setDept] = useState('all');
  const [status, setStatus] = useState('current');
  const [editing, setEditing] = useState<Employee | null | undefined>(undefined);   // undefined = closed, null = new
  const [viewing, setViewing] = useState<Employee | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inOffice = selectedCompanyId === 'all' ? all : all.filter(e => e.companyId === selectedCompanyId);
  const rows = inOffice.filter(e => (dept === 'all' || e.department === dept)
    && (status === 'all' || (status === 'current' ? e.status !== 'Terminated' : e.status === status)));
  const canCreate = companies.some(c => hasPermission('create', 'hr', c.id));
  const officeName = (id: string) => companies.find(c => c.id === id)?.name ?? '—';
  const nameOf = (id?: string | null) => (id ? all.find(e => e.id === id)?.name ?? '—' : '—');
  const expiring = inOffice.filter(e => e.status !== 'Terminated' && (() => { const x = nextExpiry(e); return x && getDaysDifference(x.date) <= alertDays; })()).length;
  const cf = useCustomFields('employee');
  const { filtered, ui: cfFilter } = useCustomFieldFilter(cf.defs, rows);

  const remove = async (e: Employee) => {
    if (!window.confirm(`Delete ${e.name}? Employees with payslips cannot be deleted; set a leaving date instead.`)) return;
    setBusyId(e.id);
    try { await deleteEmployee(e.id); addToast({ type: 'success', title: 'Employee deleted', message: e.name }); }
    catch (x) { addToast({ type: 'error', title: 'Delete failed', message: (x as Error).message }); }
    finally { setBusyId(null); }
  };

  const columns: Column<Employee>[] = [
    { key: 'name', header: 'Employee', truncate: true, render: e => (
      <button type="button" className="text-left" onClick={() => setViewing(e)}>
        <p className="font-bold text-slate-100 hover:text-forest-400">{e.name}</p>
        <p className="text-[11px] text-slate-400 font-mono">{e.employeeCode} · {officeName(e.companyId)}</p>
      </button>
    ) },
    { key: 'department', header: 'Department / designation', render: e => (
      <div><p className="text-slate-200 text-xs font-semibold">{e.department}</p><p className="text-[11px] text-slate-400">{e.designation}</p></div>
    ) },
    { key: 'managerId', header: 'Reports to', value: e => nameOf(e.managerId), render: e => <span className="text-xs text-slate-300">{nameOf(e.managerId)}</span> },
    { key: 'joiningDate', header: 'Joined', render: e => <span className="text-xs text-slate-300">{formatDate(e.joiningDate)}</span> },
    { key: 'expiry', header: 'Next expiry', value: e => nextExpiry(e)?.date ?? '', render: e => {
      const x = nextExpiry(e);
      if (!x) return <span className="text-[11px] text-slate-400">No papers recorded</span>;
      const d = getDaysDifference(x.date);
      return <Badge variant={d < 0 ? 'rose' : d <= alertDays ? 'amber' : 'slate'}>{x.label} {d < 0 ? 'expired' : ''} {formatDate(x.date)}</Badge>;
    } },
    { key: 'totalGrossSalary', header: `Gross (${currency})`, align: 'right', render: e => <span className="font-mono text-xs text-slate-200">{e.totalGrossSalary.toFixed(3)}</span> },
    { key: 'status', header: 'Status', align: 'center', render: e => <StatusBadge status={e.status} size="sm" /> },
    { key: 'actions', header: 'Actions', align: 'right', sortable: false, render: e => (
      <div className="flex justify-end gap-1.5" onClick={x => x.stopPropagation()}>
        <Button variant="ghost" size="xs" leftIcon={<Eye className="w-3 h-3" />} onClick={() => setViewing(e)}>View</Button>
        {hasPermission('edit', 'hr', e.companyId) && <Button variant="ghost" size="xs" leftIcon={<Pencil className="w-3 h-3" />} onClick={() => setEditing(e)}>Edit</Button>}
        {hasPermission('delete', 'hr', e.companyId) && (
          <Button variant="ghost" size="xs" leftIcon={<Trash2 className="w-3 h-3" />} isLoading={busyId === e.id} disabled={busyId === e.id} onClick={() => void remove(e)}>Delete</Button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Staff profiles, reporting lines, ID and work papers, salary and bank details."
        actions={
          <>
            {canCreate && <Button size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditing(null)}>Add employee</Button>}
          </>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Current employees" value={inOffice.filter(e => e.status !== 'Terminated').length} subValue={`${inOffice.filter(e => e.status === 'On Leave').length} on leave`} icon={<Users className="w-4 h-4" />} variant="indigo" isHero />
        <StatCard title="Papers expiring" value={expiring} subValue={`Civil ID, passport, visa or labour card within ${alertDays} days`} icon={<AlertTriangle className="w-4 h-4" />} variant="amber" />
        <StatCard title="Departments" value={new Set(inOffice.map(e => e.department)).size} subValue="With at least one employee" icon={<Users className="w-4 h-4" />} variant="emerald" />
      </div>
      <DataTable data={filtered} collection="employees" columns={withCustomColumns(columns, cf.listColumns<Employee>())} keyExtractor={e => e.id}
        title="Employee register" searchText={cf.searchText} searchFields={['name', 'employeeCode', 'designation', 'department', 'email', 'phone', 'civilId', 'passportNumber']}
        searchPlaceholder="Search by name, code, department, ID or passport…" exportFilename="Employees" exportModule="hr"
        filterComponent={
          <div className="flex flex-wrap gap-1.5">
            <FilterSelect aria-label="Department" value={dept} onChange={e => setDept(e.target.value)}>
              <option value="all">All departments</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </FilterSelect>
            <FilterSelect aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="current">Current staff</option>
              {['Active', 'Probation', 'On Leave', 'Terminated'].map(s => <option key={s} value={s}>{s}</option>)}
              <option value="all">Everyone</option>
            </FilterSelect>
          </div>
        }
        extraFilters={cfFilter} />
      <EmployeeFormModal isOpen={editing !== undefined} employee={editing ?? null} onClose={() => setEditing(undefined)} />
      <EmployeeDetailModal isOpen={!!viewing} employee={viewing} onClose={() => setViewing(null)} onEdit={e => { setViewing(null); setEditing(e); }}
        latestPayslip={viewing ? latestPayslipOf(payrollRuns, viewing.id) : null} />
    </div>
  );
};
