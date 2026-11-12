// Add / edit an employee: profile, reporting line, ID papers with expiry dates, salary, bank (WPS),
// custom fields and (when editing) recurring allowances and deductions. Department and designation
// come from the HR masters; the database rejects unknown or inactive ones.
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useMaster } from '../../hooks/useMaster';
import { useCustomFieldsEditor } from '../../hooks/useCustomFields';
import { formatCurrency } from '../../utils/financial';
import { localToday } from '../../utils/date';
import type { Employee, EmployeeStatus } from '../../types/hr';
import type { Department, Designation, PayComponent } from '../../services/org';
import { RecordSelect, employeeOption } from '../../components/ui/RecordSelect';
import {
  deleteEmployeePayComponent, fetchEmployeePayComponents, saveEmployeePayComponent, type EmployeePayComponent,
} from '../../services/hrops';

const STATUSES: EmployeeStatus[] = ['Active', 'Probation', 'On Leave', 'Terminated'];
type Form = Omit<Employee, 'id' | 'employeeCode' | 'createdAt'> & { id?: string };

const blank = (companyId: string): Form => ({
  companyId, name: '', designation: '', department: '', email: '', phone: '', civilId: '', passportNumber: '', nationality: '',
  joiningDate: localToday(), status: 'Active', basicSalary: 0, housingAllowance: 0, transportAllowance: 0, otherAllowances: 0,
  totalGrossSalary: 0, bankName: '', bankAccountNumber: '', iban: '', paymentMethod: 'Bank Transfer', socialSecurityNumber: '',
  pasiContributionPercentage: 7, employerPasiPercentage: 11.5, notes: '', customFields: {}, managerId: null, sponsor: '',
  dateOfBirth: '', civilIdExpiryDate: '', passportExpiryDate: '', visaNumber: '', visaExpiryDate: '', labourCardNumber: '',
  labourCardExpiryDate: '', terminationDate: '',
});

export function validateEmployee(f: Form): string | null {
  if (!f.companyId) return 'Choose the office.';
  if (!f.name.trim()) return 'Name is required.';
  if (!f.department) return 'Choose the department.';
  if (!f.designation) return 'Choose the designation.';
  if (!f.joiningDate) return 'Joining date is required.';
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return 'Email is not valid.';
  if (!(f.basicSalary > 0)) return 'Basic salary must be more than zero.';
  for (const v of [f.housingAllowance, f.transportAllowance, f.otherAllowances]) if (!(v >= 0)) return 'Allowances cannot be negative.';
  for (const v of [f.pasiContributionPercentage, f.employerPasiPercentage ?? 0]) if (!(v >= 0 && v <= 100)) return 'PASI percentages must be between 0 and 100.';
  if (f.terminationDate && f.terminationDate < f.joiningDate) return 'The leaving date cannot be before the joining date.';
  if (f.status === 'Terminated' && !f.terminationDate) return 'Enter the leaving date for a terminated employee.';
  if (f.dateOfBirth && f.dateOfBirth > localToday()) return 'Date of birth cannot be in the future.';
  return null;
}

export const EmployeeFormModal: React.FC<{ isOpen: boolean; employee?: Employee | null; onClose: () => void }> = ({ isOpen, employee, onClose }) => {
  const { companies, employees, selectedCompanyId, addEmployee, updateEmployee, currency } = useFleet();
  const { hasPermission } = useAuth();
  const { addToast } = useUI();
  const offices = companies.filter(c => hasPermission(employee ? 'edit' : 'create', 'hr', c.id));
  const initialOffice = employee?.companyId ?? (offices.some(o => o.id === selectedCompanyId) ? selectedCompanyId : offices[0]?.id ?? '');
  const [f, setF] = useState<Form>(() => (employee ? { ...employee } : blank(initialOffice)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const departments = useMaster<Department>('departments', { activeOnly: true, keep: [employee?.department ?? ''] }).rows;
  const designations = useMaster<Designation>('designations', { activeOnly: true, keep: [employee?.designation ?? ''] }).rows;
  const cf = useCustomFieldsEditor('employee', f.companyId, employee?.customFields ?? {});

  useEffect(() => {
    if (isOpen) { setF(employee ? { ...employee } : blank(initialOffice)); setErr(null); cf.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, employee?.id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }));
  const num = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === '' ? 0 : Number(e.target.value)) as never);
  const deptId = departments.find(d => d.name === f.department)?.id;
  const designationOptions = designations.filter(d => !d.departmentId || !deptId || d.departmentId === deptId || d.name === f.designation);
  // every other employee; terminated ones are listed as unavailable, and a current terminated manager stays shown
  const managers = useMemo(() => employees.filter(e => e.id !== employee?.id).map(employeeOption), [employees, employee?.id]);
  const gross = f.basicSalary + f.housingAllowance + f.transportAllowance + f.otherAllowances;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateEmployee(f);
    if (v) { setErr(v); return; }
    if (!cf.validate()) { setErr('Check the additional information fields.'); return; }
    setBusy(true); setErr(null);
    try {
      const { id: _id, ...data } = f;
      const payload = { ...data, totalGrossSalary: gross, customFields: cf.value() };
      if (employee) {
        const { companyId: _c, ...changes } = payload;   // office moves go through Transfer
        await updateEmployee(employee.id, { ...changes, updatedAt: employee.updatedAt });
        addToast({ type: 'success', title: 'Employee updated', message: f.name });
      } else {
        const created = await addEmployee(payload);
        addToast({ type: 'success', title: 'Employee added', message: `${created.employeeCode} ${created.name}` });
      }
      onClose();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => undefined : onClose} size="2xl"
      title={employee ? `Edit ${employee.employeeCode} — ${employee.name}` : 'Add employee'}
      footer={<>
        <Button variant="outline" type="button" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" form="employee-form" isLoading={busy} disabled={busy}>Save</Button>
      </>}>
      <form id="employee-form" onSubmit={submit} className="space-y-5">
        {err && <p role="alert" className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</p>}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {employee ? (
            <Input label="Office" value={companies.find(c => c.id === f.companyId)?.name ?? ''} disabled hint="Use Transfer to move the employee" />
          ) : (
            <Select label="Office" required value={f.companyId} onChange={e => set('companyId', e.target.value)}>
              {offices.length === 0 && <option value="">No office available</option>}
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          )}
          <Input label="Full name" required value={f.name} onChange={e => set('name', e.target.value)} />
          <Select label="Status" value={f.status} onChange={e => set('status', e.target.value as EmployeeStatus)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select label="Department" required value={f.department} onChange={e => set('department', e.target.value)}>
            <option value="">Choose…</option>
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}{d.active ? '' : ' (inactive)'}</option>)}
          </Select>
          <Select label="Designation" required value={f.designation} onChange={e => set('designation', e.target.value)}>
            <option value="">Choose…</option>
            {designationOptions.map(d => <option key={d.id} value={d.name}>{d.name}{d.active ? '' : ' (inactive)'}</option>)}
          </Select>
          <RecordSelect label="Reports to" value={f.managerId ?? ''} onChange={v => set('managerId', v || null)} placeholder="No manager" options={managers} />
          <Input label="Joining date" type="date" required value={f.joiningDate} onChange={e => set('joiningDate', e.target.value)} />
          <Input label="Leaving date" type="date" value={f.terminationDate ?? ''} onChange={e => set('terminationDate', e.target.value)}
            hint="Final pay and end-of-service gratuity go in that month's payroll" />
          <Input label="Date of birth" type="date" value={f.dateOfBirth ?? ''} onChange={e => set('dateOfBirth', e.target.value)} />
          <Input label="Email" type="email" value={f.email ?? ''} onChange={e => set('email', e.target.value)} />
          <Input label="Phone" value={f.phone ?? ''} onChange={e => set('phone', e.target.value)} />
          <Input label="Nationality" value={f.nationality ?? ''} onChange={e => set('nationality', e.target.value)} />
          <Input label="Sponsor" value={f.sponsor ?? ''} onChange={e => set('sponsor', e.target.value)} hint="Visa sponsor (company or person)" />
        </section>

        <section>
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Identity and work papers</h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Input label="Civil ID" value={f.civilId ?? ''} onChange={e => set('civilId', e.target.value)} />
            <Input label="Civil ID expiry" type="date" value={f.civilIdExpiryDate ?? ''} onChange={e => set('civilIdExpiryDate', e.target.value)} />
            <Input label="Passport number" value={f.passportNumber ?? ''} onChange={e => set('passportNumber', e.target.value)} />
            <Input label="Passport expiry" type="date" value={f.passportExpiryDate ?? ''} onChange={e => set('passportExpiryDate', e.target.value)} />
            <Input label="Visa number" value={f.visaNumber ?? ''} onChange={e => set('visaNumber', e.target.value)} />
            <Input label="Visa expiry" type="date" value={f.visaExpiryDate ?? ''} onChange={e => set('visaExpiryDate', e.target.value)} />
            <Input label="Labour card number" value={f.labourCardNumber ?? ''} onChange={e => set('labourCardNumber', e.target.value)} />
            <Input label="Labour card expiry" type="date" value={f.labourCardExpiryDate ?? ''} onChange={e => set('labourCardExpiryDate', e.target.value)} />
          </div>
        </section>

        <section className="p-4 rounded-xl border border-slate-700 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex justify-between">
            <span>Monthly salary ({currency})</span><span className="text-emerald-600">Gross {formatCurrency(gross, currency)}</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <Input label="Basic" type="number" min={0} step="0.001" required value={f.basicSalary || ''} onChange={num('basicSalary')} />
            <Input label="Housing" type="number" min={0} step="0.001" value={f.housingAllowance || ''} onChange={num('housingAllowance')} />
            <Input label="Transport" type="number" min={0} step="0.001" value={f.transportAllowance || ''} onChange={num('transportAllowance')} />
            <Input label="Other" type="number" min={0} step="0.001" value={f.otherAllowances || ''} onChange={num('otherAllowances')} />
            <Input label="Employee PASI %" type="number" min={0} max={100} step="0.1" value={f.pasiContributionPercentage} onChange={num('pasiContributionPercentage')} />
            <Input label="Employer PASI %" type="number" min={0} max={100} step="0.1" value={f.employerPasiPercentage ?? 0} onChange={num('employerPasiPercentage')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Select label="Paid by" value={f.paymentMethod ?? 'Bank Transfer'} onChange={e => set('paymentMethod', e.target.value as Form['paymentMethod'])}>
              {['Bank Transfer', 'Cash', 'Cheque'].map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Input label="Bank" value={f.bankName} onChange={e => set('bankName', e.target.value)} />
            <Input label="Account number" value={f.bankAccountNumber ?? ''} onChange={e => set('bankAccountNumber', e.target.value)} />
            <Input label="IBAN" value={f.iban} onChange={e => set('iban', e.target.value)} />
            <Input label="Social security number" value={f.socialSecurityNumber ?? ''} onChange={e => set('socialSecurityNumber', e.target.value)} />
          </div>
        </section>

        {employee && <RecurringComponents employee={employee} />}
        <Textarea label="Notes" value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} />
        {cf.node}
      </form>
    </Modal>
  );
};

/** Recurring allowances and deductions of one employee (used by payroll each month). */
export const RecurringComponents: React.FC<{ employee: Employee }> = ({ employee }) => {
  const { hasPermission } = useAuth();
  const { currency } = useFleet();
  const components = useMaster<PayComponent>('payComponents', { activeOnly: true }).rows;
  const canEdit = hasPermission('edit', 'payroll', employee.companyId);
  const canView = hasPermission('view', 'payroll', employee.companyId);
  const [rows, setRows] = useState<EmployeePayComponent[]>([]);
  const [draft, setDraft] = useState({ componentId: '', amount: 0, startDate: localToday(), endDate: '' });
  const [err, setErr] = useState<string | null>(null);
  const load = () => { if (canView) fetchEmployeePayComponents(employee.id).then(setRows).catch(e => setErr((e as Error).message)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [employee.id, canView]);
  if (!canView) return null;
  const name = (id: string) => components.find(c => c.id === id);
  const add = async () => {
    setErr(null);
    try {
      await saveEmployeePayComponent({ employeeId: employee.id, componentId: draft.componentId, amount: draft.amount, startDate: draft.startDate, endDate: draft.endDate, notes: '' }, employee.companyId);
      setDraft({ componentId: '', amount: 0, startDate: localToday(), endDate: '' }); load();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Recurring allowances and deductions</h4>
      {rows.length === 0 && <p className="text-xs text-slate-400">None. Add fuel, phone or shift allowances, or recoveries such as accommodation.</p>}
      {rows.map(r => (
        <div key={r.id} className="flex items-center justify-between text-xs border-b border-slate-700/60 py-1.5">
          <span className="text-slate-200">{name(r.componentId)?.name ?? 'Component'} <span className="text-slate-400">({name(r.componentId)?.kind})</span></span>
          <span className="text-slate-300">{formatCurrency(r.amount, currency)} / month · from {r.startDate}{r.endDate ? ` to ${r.endDate}` : ''}</span>
          {canEdit && <Button variant="ghost" size="xs" type="button" leftIcon={<Trash2 className="w-3 h-3" />}
            onClick={() => void deleteEmployeePayComponent(r.id).then(load).catch(e => setErr((e as Error).message))}>Remove</Button>}
        </div>
      ))}
      {canEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
          <Select label="Add" value={draft.componentId} onChange={e => setDraft({ ...draft, componentId: e.target.value })}>
            <option value="">Choose…</option>
            {components.map(c => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
          </Select>
          <Input label="Monthly amount" type="number" min={0} step="0.001" value={draft.amount || ''} onChange={e => setDraft({ ...draft, amount: Number(e.target.value) })} />
          <Input label="From" type="date" value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} />
          <Input label="Until (optional)" type="date" value={draft.endDate} onChange={e => setDraft({ ...draft, endDate: e.target.value })} />
          <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => void add()}>Add</Button>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
    </section>
  );
};
