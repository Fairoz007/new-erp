// HR → Attendance. A day sheet per office (status, in/out, overtime), a month summary per employee,
// and CSV import. Overtime and absences here feed payroll; once a month's payroll is approved the
// database closes that month's attendance.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Upload, Save, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Input';
import { Tabs } from '../../components/ui/Tabs';
import { Badge } from '../../components/ui/Badge';
import { useVirtualRows } from '../../components/ui/useVirtualRows';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { localToday, formatDate } from '../../utils/date';
import { parseCsv, tableCls, thCls, tdCls } from '../setup/shared';
import {
  ATTENDANCE_STATUSES, Attendance, AttendanceInput, AttendanceStatus, deleteAttendance, fetchAttendance, saveAttendance, validateAttendance,
} from '../../services/hrops';
import type { Employee } from '../../types/hr';
import { downloadCsv } from '../../utils/export';
import { PageHeader } from '../../components/ui/PageHeader';

const shiftDay = (d: string, n: number) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
const monthRange = (d: string) => {
  const [y, m] = d.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${d.slice(0, 7)}-01`, to: `${d.slice(0, 7)}-${String(last).padStart(2, '0')}` };
};
const onRoll = (e: Employee, day: string) => e.joiningDate <= day && (!e.terminationDate || e.terminationDate >= day);
const inputCls = 'bg-slate-850 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 w-full';

type Draft = { status: AttendanceStatus | ''; checkIn: string; checkOut: string; overtimeHours: number; notes: string };

export const AttendancePage: React.FC = () => {
  const { employees, companies, selectedCompanyId } = useFleet();
  const { hasPermission } = useAuth();
  const offices = companies.filter(c => hasPermission('view', 'attendance', c.id));
  const [officeId, setOfficeId] = useState('');
  const [day, setDay] = useState(localToday());
  const [tab, setTab] = useState('day');
  const [rows, setRows] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    if (!officeId || !offices.some(o => o.id === officeId)) setOfficeId(offices.some(o => o.id === selectedCompanyId) ? selectedCompanyId : offices[0]?.id ?? '');
  }, [offices, officeId, selectedCompanyId]);

  const { from, to } = monthRange(day);
  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setRows(await fetchAttendance(from, to)); } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  const staff = useMemo(() => employees.filter(e => e.companyId === officeId).sort((a, b) => a.name.localeCompare(b.name)), [employees, officeId]);
  const canEdit = !!officeId && (hasPermission('create', 'attendance', officeId) || hasPermission('edit', 'attendance', officeId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Daily attendance and overtime. Approved leave is filled in automatically; overtime and absences feed payroll."
        actions={
          <>
            {canEdit && <Button size="md" variant="outline" leftIcon={<Upload className="w-4 h-4" />} onClick={() => setImporting(true)}>Import CSV</Button>}
          </>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Select label="Office" value={officeId} onChange={e => setOfficeId(e.target.value)}>
            {offices.length === 0 && <option value="">No office available</option>}
            {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Previous day" onClick={() => setDay(shiftDay(day, -1))}><ChevronLeft className="w-4 h-4" /></Button>
          <input type="date" aria-label="Date" value={day} onChange={e => e.target.value && setDay(e.target.value)} className={`${inputCls} w-40`} />
          <Button variant="ghost" size="sm" aria-label="Next day" onClick={() => setDay(shiftDay(day, 1))}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setDay(localToday())}>Today</Button>
        </div>
        <Tabs variant="segmented" tabs={[{ id: 'day', label: 'Day sheet' }, { id: 'month', label: 'Month summary' }]} activeTab={tab} onChange={setTab} />
      </div>
      {err && <p role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err} <button className="underline" onClick={() => void load()}>Retry</button></p>}
      {tab === 'day'
        ? <DaySheet day={day} staff={staff.filter(e => onRoll(e, day))} rows={rows.filter(r => r.workDate === day && r.companyId === officeId)} officeId={officeId} canEdit={canEdit}
            canDelete={!!officeId && hasPermission('delete', 'attendance', officeId)} loading={loading} onSaved={load} />
        : <MonthSummary staff={staff.filter(e => onRoll(e, to) || onRoll(e, from))} rows={rows.filter(r => r.companyId === officeId)} label={new Date(`${from}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} />}
      {importing && <ImportModal officeId={officeId} staff={staff} onClose={() => setImporting(false)} onDone={load} />}
    </div>
  );
};

const DaySheet: React.FC<{ day: string; staff: Employee[]; rows: Attendance[]; officeId: string; canEdit: boolean; canDelete: boolean; loading: boolean; onSaved: () => Promise<void> }> = ({
  day, staff, rows, officeId, canEdit, canDelete, loading, onSaved,
}) => {
  const { addToast } = useUI();
  const byEmp = useMemo(() => new Map(rows.map(r => [r.employeeId, r])), [rows]);
  const vDay = useVirtualRows(staff.length, { rowHeight: 62 });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDrafts({}); setErrors({}); }, [day, officeId]);
  const valueOf = (e: Employee): Draft => drafts[e.id] ?? (() => {
    const r = byEmp.get(e.id);
    return r ? { status: r.status, checkIn: r.checkIn, checkOut: r.checkOut, overtimeHours: r.overtimeHours, notes: r.notes } : { status: '', checkIn: '', checkOut: '', overtimeHours: 0, notes: '' };
  })();
  const set = (e: Employee, patch: Partial<Draft>) => setDrafts(d => ({ ...d, [e.id]: { ...valueOf(e), ...patch } }));
  const dirty = Object.keys(drafts).filter(id => drafts[id].status !== '');
  const future = day > localToday();

  const markAll = (status: AttendanceStatus) => setDrafts(d => {
    const next = { ...d };
    for (const e of staff) if (!byEmp.has(e.id) && !(d[e.id]?.status)) next[e.id] = { status, checkIn: '', checkOut: '', overtimeHours: 0, notes: '' };
    return next;
  });

  const saveAll = async () => {
    setBusy(true);
    const errs: Record<string, string> = {};
    let ok = 0;
    for (const id of dirty) {
      const d = drafts[id];
      const input: AttendanceInput = { employeeId: id, workDate: day, status: d.status as AttendanceStatus, checkIn: d.checkIn, checkOut: d.checkOut, overtimeHours: d.overtimeHours, notes: d.notes };
      const v = validateAttendance(input);
      if (v) { errs[id] = v; continue; }
      try { await saveAttendance(input, officeId); ok++; } catch (e) { errs[id] = (e as Error).message; }
    }
    setErrors(errs);
    setDrafts(d => Object.fromEntries(Object.entries(d).filter(([id]) => errs[id])));
    await onSaved();
    setBusy(false);
    addToast({ type: Object.keys(errs).length ? 'warning' : 'success', title: `Saved ${ok} record(s)`, message: Object.keys(errs).length ? `${Object.keys(errs).length} row(s) need fixing` : formatDate(day) });
  };

  const remove = async (r: Attendance) => {
    if (!window.confirm('Clear this attendance record?')) return;
    try { await deleteAttendance(r.id); await onSaved(); } catch (e) { addToast({ type: 'error', title: 'Could not clear', message: (e as Error).message }); }
  };

  const counts = ATTENDANCE_STATUSES.map(s => [s, staff.filter(e => valueOf(e).status === s).length] as const).filter(([, n]) => n > 0);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-slate-700">
        <div className="flex flex-wrap gap-1.5 items-center text-xs text-slate-400">
          <CalendarCheck className="w-4 h-4" /> {formatDate(day)} · {staff.length} on the roll · {staff.length - staff.filter(e => valueOf(e).status).length} not marked
          {counts.map(([s, n]) => <Badge key={s} variant="slate">{s} {n}</Badge>)}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {!future && <Button variant="outline" size="xs" onClick={() => markAll('Present')}>Mark unmarked present</Button>}
            <Button variant="outline" size="xs" onClick={() => markAll('Holiday')}>Mark unmarked holiday</Button>
            <Button size="xs" leftIcon={<Save className="w-3 h-3" />} isLoading={busy} disabled={busy || dirty.length === 0} onClick={() => void saveAll()}>Save {dirty.length || ''}</Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto" {...vDay.containerProps}>
        <table className={tableCls}>
          <thead className={vDay.active ? 'sticky top-0 z-10 bg-white' : undefined}><tr><th scope="col" className={thCls}>Employee</th><th scope="col" className={thCls}>Status</th><th scope="col" className={thCls}>In</th><th scope="col" className={thCls}>Out</th><th scope="col" className={thCls}>Overtime (h)</th><th scope="col" className={thCls}>Notes</th><th scope="col" className={thCls}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading && staff.length === 0 && <tr><td className={tdCls} colSpan={7}>Loading…</td></tr>}
            {!loading && staff.length === 0 && <tr><td className={tdCls} colSpan={7}>No employees on the roll in this office on this date.</td></tr>}
            {vDay.padTop > 0 && <tr aria-hidden="true" style={{ height: vDay.padTop }}><td colSpan={7} /></tr>}
            {staff.slice(vDay.start, vDay.end).map(e => {
              const v = valueOf(e);
              const saved = byEmp.get(e.id);
              const fromLeave = !!saved?.leaveRequestId;
              const locked = !canEdit || fromLeave;
              return (
                <tr key={e.id} className={drafts[e.id] ? 'bg-forest-500/5' : ''}>
                  <td className={tdCls}><p className="font-semibold text-slate-100">{e.name}</p><p className="text-[11px] text-slate-400">{e.employeeCode} · {e.designation}</p>
                    {errors[e.id] && <p role="alert" className="text-[11px] text-rose-500">{errors[e.id]}</p>}</td>
                  <td className={tdCls}>
                    <select aria-label={`Status for ${e.name}`} className={inputCls} disabled={locked} value={v.status} onChange={x => set(e, { status: x.target.value as AttendanceStatus })}>
                      <option value="">—</option>
                      {ATTENDANCE_STATUSES.filter(s => s !== 'On Leave' || fromLeave || v.status === 'On Leave').map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {fromLeave && <p className="text-[10px] text-slate-400 mt-0.5">From approved leave</p>}
                  </td>
                  <td className={tdCls}><input type="time" aria-label={`Check-in for ${e.name}`} className={inputCls} disabled={locked} value={v.checkIn} onChange={x => set(e, { checkIn: x.target.value })} /></td>
                  <td className={tdCls}><input type="time" aria-label={`Check-out for ${e.name}`} className={inputCls} disabled={locked} value={v.checkOut} onChange={x => set(e, { checkOut: x.target.value })} /></td>
                  <td className={tdCls}><input type="number" min={0} max={16} step={0.25} aria-label={`Overtime for ${e.name}`} className={`${inputCls} w-20`} disabled={locked} value={v.overtimeHours} onChange={x => set(e, { overtimeHours: Number(x.target.value) })} /></td>
                  <td className={tdCls}><input aria-label={`Notes for ${e.name}`} className={inputCls} disabled={locked} value={v.notes} onChange={x => set(e, { notes: x.target.value })} /></td>
                  <td className={tdCls}>{saved && !fromLeave && canDelete && <Button variant="ghost" size="xs" onClick={() => void remove(saved)}>Clear</Button>}</td>
                </tr>
              );
            })}
            {vDay.padBottom > 0 && <tr aria-hidden="true" style={{ height: vDay.padBottom }}><td colSpan={7} /></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const MonthSummary: React.FC<{ staff: Employee[]; rows: Attendance[]; label: string }> = ({ staff, rows, label }) => {
  const cols: AttendanceStatus[] = ['Present', 'Late', 'Half Day', 'Absent', 'On Leave', 'Holiday', 'Weekend'];
  // rows grouped once per employee (was a filter over the whole month for every employee)
  const byEmployee = useMemo(() => {
    const m = new Map<string, Attendance[]>();
    for (const r of rows) { const l = m.get(r.employeeId); if (l) l.push(r); else m.set(r.employeeId, [r]); }
    return m;
  }, [rows]);
  const vMonth = useVirtualRows(staff.length, { rowHeight: 49 });
  const sum = (id: string) => {
    const mine = byEmployee.get(id) ?? [];
    return { by: Object.fromEntries(cols.map(c => [c, mine.filter(r => r.status === c).length])) as Record<AttendanceStatus, number>, ot: mine.reduce((t, r) => t + r.overtimeHours, 0), n: mine.length };
  };
  const exportCsv = () => downloadCsv(`Attendance_${label.replace(/\s+/g, '_')}`, ['employee_code', 'name', ...cols, 'overtime_hours'],
    staff.map(e => { const s = sum(e.id); return [e.employeeCode, e.name, ...cols.map(c => s.by[c]), s.ot]; }), { dated: false });
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40">
      <div className="flex items-center justify-between p-3 border-b border-slate-700">
        <p className="text-xs text-slate-400 font-semibold">{label}</p>
        <Button variant="outline" size="xs" leftIcon={<Download className="w-3 h-3" />} onClick={exportCsv} disabled={staff.length === 0}>Export CSV</Button>
      </div>
      <div className="overflow-x-auto" {...vMonth.containerProps}>
        <table className={tableCls}>
          <thead className={vMonth.active ? 'sticky top-0 z-10 bg-white' : undefined}><tr><th scope="col" className={thCls}>Employee</th>{cols.map(c => <th scope="col" key={c} className={`${thCls} text-center`}>{c}</th>)}<th scope="col" className={`${thCls} text-right`}>Overtime (h)</th><th scope="col" className={`${thCls} text-center`}>Days recorded</th></tr></thead>
          <tbody>
            {staff.length === 0 && <tr><td className={tdCls} colSpan={cols.length + 3}>No employees in this office.</td></tr>}
            {vMonth.padTop > 0 && <tr aria-hidden="true" style={{ height: vMonth.padTop }}><td colSpan={cols.length + 3} /></tr>}
            {staff.slice(vMonth.start, vMonth.end).map(e => { const s = sum(e.id); return (
              <tr key={e.id}>
                <td className={tdCls}><p className="font-semibold text-slate-100">{e.name}</p><p className="text-[11px] text-slate-400">{e.employeeCode}</p></td>
                {cols.map(c => <td key={c} className={`${tdCls} text-center ${c === 'Absent' && s.by[c] ? 'text-rose-500 font-bold' : ''}`}>{s.by[c] || '—'}</td>)}
                <td className={`${tdCls} text-right font-mono`}>{s.ot ? s.ot.toFixed(2) : '—'}</td>
                <td className={`${tdCls} text-center`}>{s.n}</td>
              </tr>
            ); })}
            {vMonth.padBottom > 0 && <tr aria-hidden="true" style={{ height: vMonth.padBottom }}><td colSpan={cols.length + 3} /></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TEMPLATE = 'employee_code,date,status,check_in,check_out,overtime_hours,notes\nEMP-001,2026-11-01,Present,08:00,17:00,1,\n';
type Parsed = { line: number; input?: AttendanceInput; label: string; error?: string };

const ImportModal: React.FC<{ officeId: string; staff: Employee[]; onClose: () => void; onDone: () => Promise<void> }> = ({ officeId, staff, onClose, onDone }) => {
  const { addToast } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const byCode = useMemo(() => new Map(staff.map(e => [e.employeeCode.trim().toLowerCase(), e])), [staff]);

  const read = async (f: File) => {
    if (f.size > 2 * 1024 * 1024) { setParsed([{ line: 0, label: f.name, error: 'File is larger than 2 MB.' }]); return; }
    const { headers, rows } = parseCsv(await f.text());
    const need = ['employee_code', 'date', 'status'];
    const missing = need.filter(h => !headers.includes(h));
    if (missing.length) { setParsed([{ line: 1, label: 'Header', error: `Missing column(s): ${missing.join(', ')}` }]); return; }
    if (rows.length > 3000) { setParsed([{ line: 0, label: f.name, error: 'At most 3000 rows per file.' }]); return; }
    const seen = new Set<string>();
    setParsed(rows.map((r, i) => {
      const line = i + 2;
      const code = (r.employee_code ?? '').trim();
      const e = byCode.get(code.toLowerCase());
      const label = `${code || '?'} · ${r.date ?? ''}`;
      if (!e) return { line, label, error: `No employee with code "${code}" in this office.` };
      const status = ATTENDANCE_STATUSES.find(s => s.toLowerCase() === (r.status ?? '').trim().toLowerCase());
      const input: AttendanceInput = {
        employeeId: e.id, workDate: (r.date ?? '').trim(), status: (status ?? r.status) as AttendanceStatus,
        checkIn: (r.check_in ?? '').trim(), checkOut: (r.check_out ?? '').trim(), overtimeHours: r.overtime_hours ? Number(r.overtime_hours) : 0, notes: (r.notes ?? '').trim(),
      };
      if (status === 'On Leave') return { line, label, error: 'Record leave through a leave request, not attendance import.' };
      const v = validateAttendance(input);
      if (v) return { line, label, error: v };
      const key = `${e.id}|${input.workDate}`;
      if (seen.has(key)) return { line, label, error: 'Same employee and date appears twice in the file.' };
      seen.add(key);
      return { line, label: `${e.name} · ${input.workDate} · ${input.status}`, input };
    }));
  };

  const valid = parsed?.filter(p => p.input) ?? [];
  const bad = parsed?.filter(p => p.error) ?? [];
  const run = async () => {
    setBusy(true);
    const fails: Parsed[] = [];
    let i = 0;
    for (const p of valid) {
      try { await saveAttendance(p.input!, officeId); } catch (e) { fails.push({ ...p, error: (e as Error).message }); }
      setProgress(++i);
    }
    await onDone();
    setBusy(false);
    addToast({ type: fails.length ? 'warning' : 'success', title: `Imported ${valid.length - fails.length} of ${valid.length} row(s)`, message: fails.length ? 'Some rows were rejected; see the list.' : 'Attendance updated' });
    if (fails.length) setParsed(fails); else onClose();
  };
  const template = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })); a.download = 'attendance_template.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="lg" title="Import attendance"
      description="One row per employee per day. Existing records for the same day are replaced. Statuses: Present, Late, Half Day, Absent, Holiday, Weekend.">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={template}>Download template</Button>
          <Button size="sm" leftIcon={<Upload className="w-4 h-4" />} disabled={busy} onClick={() => fileRef.current?.click()}>Choose CSV</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
        </div>
        {parsed && (
          <>
            <p className="text-xs text-slate-300">{valid.length} row(s) ready · {bad.length} with problems{busy ? ` · saving ${progress}/${valid.length}` : ''}</p>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-700 divide-y divide-slate-700/60">
              {parsed.map(p => (
                <div key={`${p.line}-${p.label}`} className="px-3 py-1.5 text-xs flex justify-between gap-2">
                  <span className="text-slate-300">Line {p.line}: {p.label}</span>
                  {p.error ? <span className="text-rose-500 text-right">{p.error}</span> : <span className="text-emerald-500">OK</span>}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          <Button onClick={() => void run()} isLoading={busy} disabled={busy || valid.length === 0}>Import {valid.length || ''} row(s)</Button>
        </div>
      </div>
    </Modal>
  );
};
