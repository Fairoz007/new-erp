// Starts a month's payroll as a Draft (nothing is posted until approval).
import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select, Input } from '../../components/ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { generatePayroll } from '../../services/hr';
import type { PayrollRun } from '../../types/hr';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const GeneratePayrollModal: React.FC<{ isOpen: boolean; onClose: () => void; onCreated?: (run: PayrollRun) => void }> = ({ isOpen, onClose, onCreated }) => {
  const { companies, selectedCompanyId, payrollRuns, reload } = useFleet();
  const { hasPermission } = useAuth();
  const { addToast } = useUI();
  const offices = companies.filter(c => hasPermission('create', 'payroll', c.id));
  const now = new Date();
  const [officeId, setOfficeId] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen) { setOfficeId(offices.some(o => o.id === selectedCompanyId) ? selectedCompanyId : offices[0]?.id ?? ''); setErr(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const exists = payrollRuns.find(r => r.companyId === officeId && r.month === month && r.year === year);

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const run = await generatePayroll(officeId, year, month);
      await reload(['payrollRuns']);
      addToast({ type: 'success', title: 'Draft payroll created', message: `${run.payrollNumber}: ${run.totalEmployees} payslips. Review, then submit for approval.` });
      onCreated?.(run);
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => undefined : onClose} size="sm" title="Prepare payroll"
      description="Creates a draft from salaries, recurring allowances and deductions, overtime in attendance and approved unpaid leave. Nothing is posted until it is approved.">
      <div className="space-y-3">
        <Select label="Office" value={officeId} onChange={e => setOfficeId(e.target.value)}>
          {offices.length === 0 && <option value="">You cannot prepare payroll in any office</option>}
          {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Month" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
          <Input label="Year" type="number" min={2000} max={2100} value={year} onChange={e => setYear(Number(e.target.value))} />
        </div>
        {exists && <p className="text-xs text-amber-600">{exists.payrollNumber} already exists for this month ({exists.status}).</p>}
        {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void go()} isLoading={busy} disabled={busy || !officeId || !!exists}>Create draft</Button>
        </div>
      </div>
    </Modal>
  );
};
