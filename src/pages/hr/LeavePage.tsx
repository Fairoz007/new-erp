// HR → Leave. Requests (with supporting document), approval by someone other than the requester,
// balances per employee and leave type, and manual adjustments (carry forward, corrections).
// Approval writes "On Leave" attendance; unpaid leave reduces the month's payroll.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, CheckCircle2, XCircle, Ban, Undo2, Paperclip, Plane, Clock, Scale } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Tabs } from '../../components/ui/Tabs';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useMaster } from '../../hooks/useMaster';
import { formatDate, localToday } from '../../utils/date';
import { createSignedUrl, removeFiles, uploadFile } from '../../services/storage';
import { tableCls, thCls, tdCls } from '../setup/shared';
import {
  LeaveBalance, LeaveRequest, addLeaveAdjustment, fetchLeaveRequests, leaveBalance, requestLeave, reviewLeave, withdrawLeave,
} from '../../services/hrops';
import type { LeaveType } from '../../services/org';
import type { Employee } from '../../types/hr';
import { FilterSelect } from '../../components/ui/FilterControls';
import { PageHeader } from '../../components/ui/PageHeader';

const STATUS_VARIANT = { Pending: 'amber', Approved: 'emerald', Rejected: 'rose', Cancelled: 'slate' } as const;

export const LeavePage: React.FC = () => {
  const { employees, companies, selectedCompanyId } = useFleet();
  const { hasPermission, currentUser, isSuperAdmin } = useAuth();
  const { addToast } = useUI();
  const types = useMaster<LeaveType>('leaveTypes');
  const [year, setYear] = useState(new Date().getFullYear());
  const [tab, setTab] = useState('requests');
  const [status, setStatus] = useState('all');
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<{ r: LeaveRequest; decision: 'Approved' | 'Rejected' | 'Cancelled' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setRows(await fetchLeaveRequests(year)); } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [year]);
  useEffect(() => { void load(); }, [load]);

  const empOf = (id: string) => employees.find(e => e.id === id);
  const typeOf = (id: string) => types.all.find(t => t.id === id);
  const inOffice = selectedCompanyId === 'all' ? rows : rows.filter(r => r.companyId === selectedCompanyId);
  const shown = inOffice.filter(r => status === 'all' || r.status === status);
  const canRequest = companies.some(c => hasPermission('create', 'leave', c.id));
  const today = localToday();

  const withdraw = async (r: LeaveRequest) => {
    if (!window.confirm('Withdraw this pending request?')) return;
    try { await withdrawLeave(r.id); await load(); addToast({ type: 'success', title: 'Request withdrawn', message: empOf(r.employeeId)?.name ?? '' }); }
    catch (e) { addToast({ type: 'error', title: 'Could not withdraw', message: (e as Error).message }); }
  };
  const openDoc = async (path: string) => {
    try { window.open(await createSignedUrl('documents', path), '_blank', 'noopener'); }
    catch (e) { addToast({ type: 'error', title: 'Could not open the document', message: (e as Error).message }); }
  };

  const columns: Column<LeaveRequest>[] = [
    { key: 'employee', header: 'Employee', truncate: true, value: r => empOf(r.employeeId)?.name ?? '', render: r => {
      const e = empOf(r.employeeId);
      return <div><p className="font-semibold text-slate-100">{e?.name ?? '—'}</p><p className="text-[11px] text-slate-400">{e?.employeeCode} · {e?.department}</p></div>;
    } },
    { key: 'type', header: 'Type', value: r => typeOf(r.leaveTypeId)?.name ?? '', render: r => {
      const t = typeOf(r.leaveTypeId);
      return <span className="text-xs">{t?.name ?? '—'}{t && !t.paid ? <Badge variant="rose" className="ml-1">Unpaid</Badge> : null}</span>;
    } },
    { key: 'startDate', header: 'Dates', render: r => <span className="text-xs">{formatDate(r.startDate)} – {formatDate(r.endDate)}</span> },
    { key: 'days', header: 'Days', align: 'right' },
    { key: 'reason', header: 'Reason', render: r => (
      <div className="text-xs max-w-xs">
        <p className="text-slate-300 truncate" title={r.reason}>{r.reason || '—'}</p>
        {r.reviewNote && <p className="text-[11px] text-slate-400 truncate" title={r.reviewNote}>Review: {r.reviewNote}</p>}
        {r.documentPath && <button type="button" className="text-[11px] text-forest-400 inline-flex items-center gap-1" onClick={() => void openDoc(r.documentPath)}><Paperclip className="w-3 h-3" />Document</button>}
      </div>
    ) },
    { key: 'status', header: 'Status', align: 'center', render: r => <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge> },
    { key: 'actions', header: '', sortable: false, align: 'right', render: r => {
      const mine = r.requestedBy === currentUser.id;
      const approver = hasPermission('approve', 'leave', r.companyId) && (!mine || isSuperAdmin);
      const editor = hasPermission('edit', 'leave', r.companyId);
      return (
        <div className="flex justify-end gap-1 flex-wrap">
          {r.status === 'Pending' && approver && <>
            <Button variant="ghost" size="xs" leftIcon={<CheckCircle2 className="w-3 h-3" />} onClick={() => setReviewing({ r, decision: 'Approved' })}>Approve</Button>
            <Button variant="ghost" size="xs" leftIcon={<XCircle className="w-3 h-3" />} onClick={() => setReviewing({ r, decision: 'Rejected' })}>Reject</Button>
          </>}
          {r.status === 'Pending' && mine && <Button variant="ghost" size="xs" leftIcon={<Undo2 className="w-3 h-3" />} onClick={() => void withdraw(r)}>Withdraw</Button>}
          {r.status === 'Approved' && (editor || mine) && <Button variant="ghost" size="xs" leftIcon={<Ban className="w-3 h-3" />} onClick={() => setReviewing({ r, decision: 'Cancelled' })}>Cancel</Button>}
          {r.status === 'Pending' && mine && hasPermission('approve', 'leave', r.companyId) && !isSuperAdmin && <span className="text-[10px] text-slate-400 self-center">Another approver must review</span>}
        </div>
      );
    } },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave"
        description="Leave requests, approvals and balances. Approved leave marks attendance; unpaid leave is deducted in payroll."
        actions={
          <>
            <FilterSelect aria-label="Year" value={year} onChange={e => setYear(Number(e.target.value))}>
              {[0, 1, 2, 3].map(n => new Date().getFullYear() + 1 - n).map(y => <option key={y} value={y}>{y}</option>)}
            </FilterSelect>
            {canRequest && <Button size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>New leave request</Button>}
          </>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Pending requests" value={inOffice.filter(r => r.status === 'Pending').length} subValue="Waiting for a decision" icon={<Clock className="w-4 h-4" />} variant="amber" isHero />
        <StatCard title="On leave today" value={inOffice.filter(r => r.status === 'Approved' && r.startDate <= today && r.endDate >= today).length} subValue="Approved leave covering today" icon={<Plane className="w-4 h-4" />} variant="indigo" />
        <StatCard title={`Approved days ${year}`} value={inOffice.filter(r => r.status === 'Approved').reduce((t, r) => t + r.days, 0)} subValue="All leave types" icon={<Scale className="w-4 h-4" />} variant="emerald" />
      </div>
      <Tabs variant="segmented" tabs={[{ id: 'requests', label: 'Requests', count: inOffice.filter(r => r.status === 'Pending').length || undefined }, { id: 'balances', label: 'Balances' }]} activeTab={tab} onChange={setTab} />
      {tab === 'requests'
        ? <DataTable data={shown} columns={columns} keyExtractor={r => r.id} title={`Leave requests ${year}`} loading={loading} error={err} onRetry={() => void load()}
            searchText={r => `${empOf(r.employeeId)?.name ?? ''} ${empOf(r.employeeId)?.employeeCode ?? ''} ${typeOf(r.leaveTypeId)?.name ?? ''} ${r.reason}`}
            exportFilename={`Leave_${year}`} exportModule="leave" emptyMessage="No leave requests for this year."
            filterComponent={
              <FilterSelect aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="all">All statuses</option>
                {Object.keys(STATUS_VARIANT).map(s => <option key={s} value={s}>{s}</option>)}
              </FilterSelect>
            } />
        : <Balances year={year} types={types.rows} />}
      {creating && <RequestModal year={year} types={types.rows} onClose={() => setCreating(false)} onSaved={load} />}
      {reviewing && <ReviewModal {...reviewing} employee={empOf(reviewing.r.employeeId)} type={typeOf(reviewing.r.leaveTypeId)} onClose={() => setReviewing(null)} onDone={load} />}
    </div>
  );
};

const BalanceLine: React.FC<{ b: LeaveBalance | null; loading: boolean }> = ({ b, loading }) => {
  if (loading) return <p className="text-xs text-slate-400">Checking balance…</p>;
  if (!b) return null;
  if (b.entitlement == null) return <p className="text-xs text-slate-400">No yearly limit for this leave type. Taken {b.taken} day(s), pending {b.pending}.</p>;
  return <p className="text-xs text-slate-300">Entitled {b.entitlement} + adjustments {b.adjustments} − taken {b.taken} − pending {b.pending} = <b className={Number(b.remaining) < 0 ? 'text-rose-500' : 'text-emerald-500'}>{b.remaining} day(s) left</b></p>;
};

function useBalance(employeeId: string, typeId: string, year: number) {
  const [b, setB] = useState<LeaveBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!employeeId || !typeId) { setB(null); return; }
    let live = true;
    setLoading(true);
    leaveBalance(employeeId, typeId, year).then(x => live && setB(x)).catch(() => live && setB(null)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [employeeId, typeId, year, tick]);
  return { b, loading, refresh: () => setTick(t => t + 1) };
}

const RequestModal: React.FC<{ year: number; types: LeaveType[]; onClose: () => void; onSaved: () => Promise<void> }> = ({ year, types, onClose, onSaved }) => {
  const { employees, companies, selectedCompanyId } = useFleet();
  const { hasPermission } = useAuth();
  const { addToast } = useUI();
  const eligible = useMemo(() => employees.filter(e => e.status !== 'Terminated' && hasPermission('create', 'leave', e.companyId)
    && (selectedCompanyId === 'all' || e.companyId === selectedCompanyId)).sort((a, b) => a.name.localeCompare(b.name)), [employees, hasPermission, selectedCompanyId]);
  const [v, setV] = useState({ employeeId: '', leaveTypeId: types[0]?.id ?? '', startDate: '', endDate: '', reason: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emp = eligible.find(e => e.id === v.employeeId);
  const type = types.find(t => t.id === v.leaveTypeId);
  const { b, loading } = useBalance(v.employeeId, v.leaveTypeId, v.startDate ? Number(v.startDate.slice(0, 4)) : year);
  const days = v.startDate && v.endDate && v.endDate >= v.startDate
    ? Math.round((new Date(`${v.endDate}T00:00:00`).getTime() - new Date(`${v.startDate}T00:00:00`).getTime()) / 86400000) + 1 : 0;
  const needsDoc = !!type?.requiresDocument && days > 2;

  const save = async () => {
    setErr(null);
    if (!emp) { setErr('Choose the employee.'); return; }
    if (needsDoc && !file) { setErr(`${type?.name} longer than 2 days needs a supporting document.`); return; }
    if (b?.remaining != null && days > b.remaining) { setErr(`Only ${b.remaining} day(s) left for ${type?.name}.`); return; }
    setBusy(true);
    let path: string | undefined;
    try {
      if (file) path = (await uploadFile(file, emp.companyId, 'leave')).path;
      await requestLeave({ ...v, documentPath: path }, emp.companyId);
      await onSaved();
      addToast({ type: 'success', title: 'Leave requested', message: `${emp.name}: ${days} day(s) of ${type?.name}` });
      onClose();
    } catch (e) {
      if (path) void removeFiles('documents', [path]).catch(() => undefined);
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="md" title="New leave request" description="Days are counted as calendar days, including weekends and holidays in the range.">
      <div className="space-y-3">
        <Select label="Employee" value={v.employeeId} onChange={e => setV({ ...v, employeeId: e.target.value })}>
          <option value="">Choose…</option>
          {eligible.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employeeCode}){companies.length > 1 ? ` · ${companies.find(c => c.id === e.companyId)?.name ?? ''}` : ''}</option>)}
        </Select>
        <Select label="Leave type" value={v.leaveTypeId} onChange={e => setV({ ...v, leaveTypeId: e.target.value })}>
          {types.map(t => <option key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (unpaid)'}{t.daysPerYear != null ? ` · ${t.daysPerYear} days/year` : ''}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="From" type="date" value={v.startDate} min={emp?.joiningDate} onChange={e => setV({ ...v, startDate: e.target.value, endDate: v.endDate && v.endDate >= e.target.value ? v.endDate : e.target.value })} />
          <Input label="To" type="date" value={v.endDate} min={v.startDate} onChange={e => setV({ ...v, endDate: e.target.value })} />
        </div>
        {days > 0 && <p className="text-xs text-slate-300">{days} calendar day(s)</p>}
        <BalanceLine b={b} loading={loading} />
        <Textarea label="Reason" value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<Paperclip className="w-4 h-4" />} onClick={() => fileRef.current?.click()} disabled={busy || !emp}>{file ? 'Change document' : 'Attach document'}</Button>
          <span className="text-xs text-slate-400 truncate">{file ? file.name : needsDoc ? 'Required for this request (PDF, PNG or JPEG, up to 10 MB)' : 'Optional'}</span>
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </div>
        {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} isLoading={busy} disabled={busy || !v.employeeId || !v.leaveTypeId || !days}>Submit request</Button>
        </div>
      </div>
    </Modal>
  );
};

const ReviewModal: React.FC<{ r: LeaveRequest; decision: 'Approved' | 'Rejected' | 'Cancelled'; employee?: Employee; type?: LeaveType; onClose: () => void; onDone: () => Promise<void> }> = ({
  r, decision, employee, type, onClose, onDone,
}) => {
  const { addToast } = useUI();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { b, loading } = useBalance(r.employeeId, r.leaveTypeId, Number(r.startDate.slice(0, 4)));
  const verb = decision === 'Approved' ? 'Approve' : decision === 'Rejected' ? 'Reject' : 'Cancel';
  const go = async () => {
    if (decision === 'Rejected' && !note.trim()) { setErr('Give a reason for rejecting.'); return; }
    setBusy(true); setErr(null);
    try { await reviewLeave(r.id, decision, note); await onDone(); addToast({ type: 'success', title: `Leave ${decision.toLowerCase()}`, message: employee?.name ?? '' }); onClose(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="sm" title={`${verb} leave`}
      description={`${employee?.name ?? ''}: ${type?.name ?? ''}, ${formatDate(r.startDate)} – ${formatDate(r.endDate)} (${r.days} day(s)).${decision === 'Cancelled' ? ' Attendance for these days is cleared.' : ''}`}>
      <div className="space-y-3">
        {r.reason && <p className="text-xs text-slate-300">Reason: {r.reason}</p>}
        {decision !== 'Cancelled' && <BalanceLine b={b} loading={loading} />}
        <Textarea label={decision === 'Rejected' ? 'Reason for rejecting (required)' : 'Note (optional)'} value={note} onChange={e => setNote(e.target.value)} />
        {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Back</Button>
          <Button variant={decision === 'Approved' ? 'success' : 'danger'} onClick={() => void go()} isLoading={busy} disabled={busy}>{verb}</Button>
        </div>
      </div>
    </Modal>
  );
};

const Balances: React.FC<{ year: number; types: LeaveType[] }> = ({ year, types }) => {
  const { employees, selectedCompanyId } = useFleet();
  const { hasPermission } = useAuth();
  const { addToast } = useUI();
  const staff = useMemo(() => employees.filter(e => e.status !== 'Terminated' && (selectedCompanyId === 'all' || e.companyId === selectedCompanyId))
    .sort((a, b) => a.name.localeCompare(b.name)), [employees, selectedCompanyId]);
  const [empId, setEmpId] = useState('');
  const [bal, setBal] = useState<Record<string, LeaveBalance>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<LeaveType | null>(null);
  const emp = staff.find(e => e.id === empId);
  // pick the first employee, and again when the office changes and the chosen one is no longer listed
  useEffect(() => { if ((!empId || !staff.some(e => e.id === empId)) && staff[0]) setEmpId(staff[0].id); }, [staff, empId]);
  const load = useCallback(async () => {
    if (!empId) return;
    setLoading(true); setErr(null);
    try { setBal(Object.fromEntries(await Promise.all(types.map(async t => [t.id, await leaveBalance(empId, t.id, year)] as const)))); }
    catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [empId, types, year]);
  useEffect(() => { void load(); }, [load]);
  const canAdjust = !!emp && hasPermission('create', 'leave', emp.companyId) && hasPermission('edit', 'leave', emp.companyId);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40">
      <div className="flex flex-wrap items-end gap-3 p-3 border-b border-slate-700">
        <div className="w-full sm:w-72"><Select label="Employee" value={empId} onChange={e => setEmpId(e.target.value)}>
          {staff.length === 0 && <option value="">No employees</option>}
          {staff.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employeeCode})</option>)}
        </Select></div>
        {emp && <p className="text-xs text-slate-400 pb-2">Joined {formatDate(emp.joiningDate)}. Entitlement is pro-rated in the joining and leaving year.</p>}
      </div>
      {err && <p role="alert" className="text-xs text-rose-500 p-3">{err}</p>}
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead><tr><th scope="col" className={thCls}>Leave type</th><th scope="col" className={`${thCls} text-right`}>Entitled</th><th scope="col" className={`${thCls} text-right`}>Adjustments</th><th scope="col" className={`${thCls} text-right`}>Taken</th><th scope="col" className={`${thCls} text-right`}>Pending</th><th scope="col" className={`${thCls} text-right`}>Remaining</th><th scope="col" className={thCls}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading && <tr><td className={tdCls} colSpan={7}>Loading…</td></tr>}
            {!loading && types.map(t => { const b = bal[t.id]; return (
              <tr key={t.id}>
                <td className={tdCls}><p className="font-semibold text-slate-100">{t.name}</p><p className="text-[11px] text-slate-400">{t.paid ? 'Paid' : 'Unpaid'}{t.requiresDocument ? ' · document needed over 2 days' : ''}</p></td>
                <td className={`${tdCls} text-right font-mono`}>{b?.entitlement ?? 'No limit'}</td>
                <td className={`${tdCls} text-right font-mono`}>{b?.adjustments ?? '—'}</td>
                <td className={`${tdCls} text-right font-mono`}>{b?.taken ?? '—'}</td>
                <td className={`${tdCls} text-right font-mono`}>{b?.pending ?? '—'}</td>
                <td className={`${tdCls} text-right font-mono font-bold ${b?.remaining != null && b.remaining < 0 ? 'text-rose-500' : ''}`}>{b?.remaining ?? '—'}</td>
                <td className={`${tdCls} text-right`}>{canAdjust && t.daysPerYear != null && <Button variant="ghost" size="xs" onClick={() => setAdjusting(t)}>Adjust</Button>}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      {adjusting && emp && <AdjustModal employee={emp} type={adjusting} year={year} onClose={() => setAdjusting(null)}
        onSaved={async () => { await load(); addToast({ type: 'success', title: 'Balance adjusted', message: `${emp.name} · ${adjusting.name}` }); setAdjusting(null); }} />}
    </div>
  );
};

const AdjustModal: React.FC<{ employee: Employee; type: LeaveType; year: number; onClose: () => void; onSaved: () => Promise<void> }> = ({ employee, type, year, onClose, onSaved }) => {
  const [days, setDays] = useState(0);
  const [reason, setReason] = useState(type.carryForwardMax ? `Carried forward from ${year - 1}` : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await addLeaveAdjustment({ employeeId: employee.id, leaveTypeId: type.id, year, days, reason }, employee.companyId); await onSaved(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="sm" title={`Adjust ${type.name} ${year}`}
      description={`${employee.name}. Use a positive number to add days and a negative number to remove them.${type.carryForwardMax ? ` Carry forward is capped at ${type.carryForwardMax} day(s).` : ''}`}>
      <div className="space-y-3">
        <Input label="Days" type="number" step="0.5" value={days} onChange={e => setDays(Number(e.target.value))} />
        <Input label="Reason" value={reason} onChange={e => setReason(e.target.value)} />
        {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void go()} isLoading={busy} disabled={busy || !days || !reason.trim()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
};
