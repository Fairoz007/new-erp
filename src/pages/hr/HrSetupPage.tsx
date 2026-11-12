// HR → HR setup: departments, designations, leave types, recurring allowances / deductions and the
// payroll rules (overtime and gratuity). Each list is editable by whoever holds edit rights on its
// module (hr, leave, payroll); payroll rules are organization settings (settings:edit).
import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import * as org from '../../services/org';
import type { Department, Designation, LeaveType, PayComponent } from '../../services/org';
import { MasterEditor } from '../setup/MasterEditor';
import { NoticeBar, Section, errText, useMaster, useNotice } from '../setup/shared';
import { PageHeader } from '../../components/ui/PageHeader';

export const HrSetupPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState('departments');
  const departments = useMaster('departments');
  const [accounts, setAccounts] = useState<org.AccountTemplate[]>([]);
  useEffect(() => { org.listAccountTemplates().then(setAccounts).catch(() => setAccounts([])); }, []);
  const deptOptions = [{ value: '', label: 'Any department' }, ...(departments.rows as Department[]).map(d => ({ value: d.id, label: d.name }))];

  return (
    <div className="space-y-6">
      <PageHeader title="HR setup" description="Lists and rules used by employees, leave and payroll in every office." />
      <Tabs variant="pills" className="overflow-x-auto" activeTab={tab} onChange={setTab}
        tabs={[{ id: 'departments', label: 'Departments' }, { id: 'designations', label: 'Designations' }, { id: 'leave', label: 'Leave types' },
          { id: 'pay', label: 'Allowances & deductions' }, { id: 'rules', label: 'Payroll rules' }]} />
      {tab === 'departments' && (
        <Section title="Departments" description="Renaming a department updates every employee in it. A department in use cannot be deleted; untick Active instead.">
          <MasterEditor<Department> master="departments" readOnly={!hasPermission('edit', 'hr')} rowKey={r => r.id} addLabel="Add department" onChanged={departments.reload}
            blank={{ name: '', code: '', active: true }}
            columns={[
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'code', label: 'Code', type: 'text', width: '120px' },
              { key: 'active', label: 'Active', type: 'checkbox' },
            ]} />
        </Section>
      )}
      {tab === 'designations' && (
        <Section title="Designations" description="Job titles. Linking a designation to a department is optional.">
          <MasterEditor<Designation> master="designations" readOnly={!hasPermission('edit', 'hr')} rowKey={r => r.id} addLabel="Add designation"
            blank={{ name: '', departmentId: '', active: true }}
            columns={[
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'departmentId', label: 'Department', type: 'select', options: deptOptions },
              { key: 'active', label: 'Active', type: 'checkbox' },
            ]} />
        </Section>
      )}
      {tab === 'leave' && (
        <Section title="Leave types" description="Days per year is the full-year entitlement (pro-rated for joiners and leavers); leave it blank for no limit. Unpaid leave is deducted in payroll at basic ÷ 30 per day.">
          <MasterEditor<LeaveType> master="leaveTypes" readOnly={!hasPermission('edit', 'leave')} rowKey={r => r.id} addLabel="Add leave type"
            blank={{ name: '', code: '', daysPerYear: 0, paid: true, carryForwardMax: 0, requiresDocument: false, active: true }}
            columns={[
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'code', label: 'Code', type: 'text', required: true, width: '110px', editableOnCreateOnly: true,
                validate: v => (/^[A-Z][A-Z0-9_]{1,19}$/.test(String(v ?? '')) ? null : 'Capitals, digits, _') },
              { key: 'daysPerYear', label: 'Days / year', type: 'number', min: 0, max: 366, step: '0.5', nullable: true, width: '100px' },
              { key: 'paid', label: 'Paid', type: 'checkbox' },
              { key: 'carryForwardMax', label: 'Max carry forward', type: 'number', min: 0, max: 366, step: '0.5', width: '110px' },
              { key: 'requiresDocument', label: 'Document over 2 days', type: 'checkbox' },
              { key: 'active', label: 'Active', type: 'checkbox' },
            ]} />
        </Section>
      )}
      {tab === 'pay' && (
        <Section title="Allowances and deductions" description="Recurring items added to an employee's monthly pay (set amounts on the employee). Deductions credit the account you choose (default 2060 Other payroll deductions).">
          <MasterEditor<PayComponent> master="payComponents" readOnly={!hasPermission('edit', 'payroll')} rowKey={r => r.id} addLabel="Add item"
            blank={{ name: '', kind: 'Allowance', glAccountCode: '', active: true }}
            columns={[
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'kind', label: 'Type', type: 'select', required: true, editableOnCreateOnly: true, options: [{ value: 'Allowance', label: 'Allowance' }, { value: 'Deduction', label: 'Deduction' }] },
              { key: 'glAccountCode', label: 'GL account', type: 'select',
                options: [{ value: '', label: 'Default (salaries / 2060)' }, ...accounts.filter(a => a.category === 'Expense' || a.category === 'Liability').map(a => ({ value: a.code, label: `${a.code} ${a.name}` }))] },
              { key: 'active', label: 'Active', type: 'checkbox' },
            ]} />
        </Section>
      )}
      {tab === 'rules' && <PayrollRules readOnly={!hasPermission('edit', 'settings')} />}
    </div>
  );
};

const PayrollRules: React.FC<{ readOnly: boolean }> = ({ readOnly }) => {
  const { organization, setOrganization } = useOrg();
  const [f, setF] = useState({ hours: 8, rate: 1.25, years: 3, initial: 15, later: 30 });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useNotice();
  useEffect(() => {
    if (organization) setF({ hours: organization.payrollHoursPerDay, rate: organization.payrollOvertimeRate, years: organization.gratuityInitialYears,
      initial: organization.gratuityDaysInitial, later: organization.gratuityDaysLater });
  }, [organization]);
  if (!organization) return <p className="text-xs text-slate-400">Create the organization profile first (Setup Wizard step 1).</p>;

  const err = !(f.hours > 0 && f.hours <= 24) ? 'Hours per day must be between 1 and 24.'
    : !(f.rate >= 1 && f.rate <= 5) ? 'Overtime rate must be between 1 and 5.'
    : !(f.years >= 0 && f.years <= 50) ? 'Initial years must be between 0 and 50.'
    : !(f.initial >= 0 && f.initial <= 60 && f.later >= 0 && f.later <= 60) ? 'Gratuity days must be between 0 and 60.' : null;
  const save = async () => {
    if (err || readOnly) return;
    setSaving(true);
    try {
      setOrganization(await org.saveOrganization(organization.id, {
        payrollHoursPerDay: f.hours, payrollOvertimeRate: f.rate, gratuityInitialYears: f.years, gratuityDaysInitial: f.initial, gratuityDaysLater: f.later,
      }));
      setNotice({ tone: 'success', text: 'Payroll rules saved. They apply to payroll prepared or recalculated from now on.' });
    } catch (e) { setNotice({ tone: 'error', text: errText(e) }); } finally { setSaving(false); }
  };
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(x => ({ ...x, [k]: Number(e.target.value) }));

  return (
    <Section title="Payroll rules" description={readOnly ? 'Only users who can edit organization settings can change these.' : 'Used when payroll is prepared and when end-of-service gratuity is worked out.'}
      action={!readOnly && <Button size="sm" onClick={() => void save()} isLoading={saving} disabled={!!err} leftIcon={<Save className="w-4 h-4" />}>Save</Button>}>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Working hours per day" type="number" min={1} max={24} step="0.5" value={f.hours} disabled={readOnly} onChange={num('hours')} />
        <Input label="Overtime rate (× hourly pay)" type="number" min={1} max={5} step="0.05" value={f.rate} disabled={readOnly} onChange={num('rate')} />
        <Input label="Gratuity: initial years" type="number" min={0} max={50} value={f.years} disabled={readOnly} onChange={num('years')} />
        <Input label="Gratuity: days per year in the initial years" type="number" min={0} max={60} value={f.initial} disabled={readOnly} onChange={num('initial')} />
        <Input label="Gratuity: days per year after that" type="number" min={0} max={60} value={f.later} disabled={readOnly} onChange={num('later')} />
      </div>
      {err && <p role="alert" className="text-xs text-rose-500 mt-2">{err}</p>}
      <p className="text-xs text-slate-400 mt-3">
        Hourly pay = basic ÷ (30 × {f.hours || '?'} h); overtime pays {f.rate || '?'} × hourly pay. Gratuity = basic ÷ 30 × ({f.initial} days × first {f.years} years + {f.later} days × later years), pro-rated for part years.
      </p>
    </Section>
  );
};
