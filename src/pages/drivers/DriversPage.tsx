// Drivers: employees with a driving licence, their licence expiry and the vehicle they drive.
// Assignment happens on the vehicle (Edit vehicle → Driver); the database enforces one vehicle per
// driver, same office, active driver with a valid licence.
import React, { useMemo, useState } from 'react';
import { IdCard, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useDrivers, invalidateDrivers } from '../../hooks/useDrivers';
import { deleteDriver, saveDriver, DRIVER_STATUSES, type Driver, type DriverDraft } from '../../services/drivers';
import { formatDate, getDaysDifference } from '../../utils/date';
import { useOptionalOrg } from '../../context/OrgContext';
import { PageHeader } from '../../components/ui/PageHeader';

export function licenceBadge(expiry: string, alertDays: number) {
  const days = getDaysDifference(expiry);
  if (days < 0) return <Badge variant="rose">Expired {formatDate(expiry)}</Badge>;
  if (days <= alertDays) return <Badge variant="amber">Expires in {days} day{days === 1 ? '' : 's'}</Badge>;
  return <span className="text-xs text-slate-300">{formatDate(expiry)}</span>;
}

export const DriversPage: React.FC = () => {
  const { companies, selectedCompanyId, vehicles, employees, reload } = useFleet();
  const { hasPermission } = useAuth();
  const { addToast, openVehicleDetail } = useUI();
  const org = useOptionalOrg();
  const alertDays = org?.organization?.expiryAlertDays ?? 30;
  const { drivers: all, loading, error, reload: reloadDrivers } = useDrivers();
  const drivers = selectedCompanyId === 'all' ? all : all.filter(d => d.companyId === selectedCompanyId);
  const [editing, setEditing] = useState<DriverDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canCreate = companies.some(c => hasPermission('create', 'drivers', c.id));
  const vehicleOf = (id: string) => vehicles.find(v => v.driverId === id);
  const officeName = (id: string) => companies.find(c => c.id === id)?.name ?? '—';

  const expired = drivers.filter(d => d.status === 'Active' && getDaysDifference(d.licenceExpiryDate) < 0).length;
  const expiring = drivers.filter(d => d.status === 'Active' && getDaysDifference(d.licenceExpiryDate) >= 0 && getDaysDifference(d.licenceExpiryDate) <= alertDays).length;
  const unassigned = drivers.filter(d => d.status === 'Active' && !vehicleOf(d.id)).length;

  const remove = async (d: Driver) => {
    if (!window.confirm(`Delete the driver record of ${d.name}? The employee is not deleted.`)) return;
    setBusyId(d.id);
    try {
      await deleteDriver(d.id);
      invalidateDrivers(); await reload(['vehicles', 'employees']);
      addToast({ type: 'success', title: 'Driver deleted', message: d.name });
    } catch (e) {
      addToast({ type: 'error', title: 'Delete failed', message: (e as Error).message });
    } finally { setBusyId(null); }
  };

  const columns: Column<Driver>[] = [
    { key: 'name', header: 'Driver', truncate: true, render: d => (
      <div><p className="font-bold text-slate-100">{d.name}</p><p className="text-[11px] text-slate-400">{officeName(d.companyId)}</p></div>
    ) },
    { key: 'licenceNumber', header: 'Licence', render: d => (
      <div><p className="font-mono text-xs text-slate-200">{d.licenceNumber}</p><p className="text-[11px] text-slate-400">{d.licenceClass || '—'}</p></div>
    ) },
    { key: 'licenceExpiryDate', header: 'Licence expiry', render: d => licenceBadge(d.licenceExpiryDate, alertDays) },
    { key: 'vehicle', header: 'Vehicle', value: d => vehicleOf(d.id)?.plateNumber ?? '', render: d => {
      const v = vehicleOf(d.id);
      return v ? <button type="button" className="text-forest-500 font-semibold hover:underline" onClick={() => openVehicleDetail(v.id)}>{v.plateNumber}</button>
        : <span className="text-slate-400 text-xs">Not assigned</span>;
    } },
    { key: 'status', header: 'Status', align: 'center', render: d => <Badge variant={d.status === 'Active' ? 'emerald' : d.status === 'Suspended' ? 'amber' : 'slate'}>{d.status}</Badge> },
    { key: 'actions', header: 'Actions', align: 'right', sortable: false, render: d => (
      <div className="flex justify-end gap-1.5">
        {hasPermission('edit', 'drivers', d.companyId) && (
          <Button variant="ghost" size="xs" leftIcon={<Pencil className="w-3 h-3" />} onClick={() => setEditing({ ...d })}>Edit</Button>
        )}
        {hasPermission('delete', 'drivers', d.companyId) && (
          <Button variant="ghost" size="xs" leftIcon={<Trash2 className="w-3 h-3" />} isLoading={busyId === d.id} disabled={busyId === d.id} onClick={() => void remove(d)}>Delete</Button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drivers"
        description="Employees who drive, their licences and the vehicle each one drives. Assign drivers on the vehicle."
        actions={
          <>
            {canCreate && (
              <Button size="md" leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setEditing({ companyId: selectedCompanyId === 'all' ? '' : selectedCompanyId, employeeId: '', licenceNumber: '', licenceClass: '', licenceIssueDate: '', licenceExpiryDate: '', status: 'Active', notes: '' })}>
                Add driver
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Active drivers" value={drivers.filter(d => d.status === 'Active').length} subValue={`${unassigned} without a vehicle`} icon={<IdCard className="w-4 h-4" />} variant="indigo" isHero />
        <StatCard title="Licences expiring" value={expiring} subValue={`Within ${alertDays} days`} icon={<AlertTriangle className="w-4 h-4" />} variant="amber" />
        <StatCard title="Licences expired" value={expired} subValue="Cannot be assigned to a vehicle" icon={<AlertTriangle className="w-4 h-4" />} variant="rose" />
      </div>

      <DataTable data={drivers} columns={columns} keyExtractor={d => d.id} title="Driver register" loading={loading} error={error} onRetry={() => void reloadDrivers()}
        searchFields={['name', 'licenceNumber', 'licenceClass', 'status']} searchPlaceholder="Search by name, licence number or class…" exportFilename="Drivers" exportModule="drivers"
        emptyMessage="No drivers registered yet." />

      {editing && <DriverModal draft={editing} employees={employees} drivers={all} onClose={() => setEditing(null)}
        onSaved={async () => { invalidateDrivers(); await reload(['vehicles', 'employees']); setEditing(null); }} />}
    </div>
  );
};

const DriverModal: React.FC<{
  draft: DriverDraft; employees: ReturnType<typeof useFleet>['employees']; drivers: Driver[];
  onClose: () => void; onSaved: () => Promise<void>;
}> = ({ draft, employees, drivers, onClose, onSaved }) => {
  const { hasPermission } = useAuth();
  const { companies } = useFleet();
  const { addToast } = useUI();
  const [f, setF] = useState<DriverDraft>(draft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const taken = useMemo(() => new Set(drivers.map(d => d.employeeId)), [drivers]);
  // employees the user may register as drivers: not terminated, no driver record yet, office allows create
  const choices = employees.filter(e => e.status !== 'Terminated' && !taken.has(e.id) && hasPermission('create', 'drivers', e.companyId)
    && (!draft.companyId || e.companyId === draft.companyId));
  const set = <K extends keyof DriverDraft>(k: K, v: DriverDraft[K]) => setF(p => ({ ...p, [k]: v }));
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const emp = employees.find(e => e.id === f.employeeId);
      const d = await saveDriver({ ...f, companyId: emp?.companyId ?? f.companyId });
      addToast({ type: 'success', title: draft.id ? 'Driver updated' : 'Driver added', message: d.name });
      await onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const name = draft.id ? drivers.find(d => d.id === draft.id)?.name : undefined;
  return (
    <Modal isOpen onClose={onClose} size="md" title={draft.id ? `Edit driver: ${name}` : 'Add driver'}>
      <div className="space-y-3">
        {draft.id ? (
          <p className="text-xs text-slate-400">Employee and office come from the HR record ({companies.find(c => c.id === draft.companyId)?.name}).</p>
        ) : (
          <Select label="Employee" required value={f.employeeId} onChange={e => set('employeeId', e.target.value)}
            hint={choices.length === 0 ? 'No employee available: everyone already has a driver record, or you cannot see employees (needs HR view rights).' : 'The driver belongs to the employee\'s office.'}>
            <option value="">Choose an employee…</option>
            {choices.map(e => <option key={e.id} value={e.id}>{e.name} · {e.employeeCode} · {companies.find(c => c.id === e.companyId)?.code}</option>)}
          </Select>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Licence number" required value={f.licenceNumber} onChange={e => set('licenceNumber', e.target.value)} />
          <Input label="Licence class" placeholder="e.g. Heavy, Light, Bus" value={f.licenceClass} onChange={e => set('licenceClass', e.target.value)} />
          <Input label="Issue date" type="date" value={f.licenceIssueDate} onChange={e => set('licenceIssueDate', e.target.value)} />
          <Input label="Expiry date" type="date" required value={f.licenceExpiryDate} onChange={e => set('licenceExpiryDate', e.target.value)} />
          <Select label="Status" value={f.status} onChange={e => set('status', e.target.value as DriverDraft['status'])}
            hint="Suspending or deactivating removes the driver from their vehicle.">
            {DRIVER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <Textarea label="Notes" value={f.notes} onChange={e => set('notes', e.target.value)} />
        {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} isLoading={busy} disabled={busy || (!draft.id && !f.employeeId)}>Save</Button>
        </div>
      </div>
    </Modal>
  );
};
