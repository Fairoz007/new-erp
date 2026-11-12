// Bus operations block for vehicle forms: driver, client contract, route, route permit and inspection.
// Options are limited to the vehicle's office; the database re-checks every rule.
import React, { useEffect, useState } from 'react';
import { Input, Select } from '../ui/Input';
import { useDrivers } from '../../hooks/useDrivers';
import { useAuth } from '../../context/AuthContext';
import { fetchAssignableContracts } from '../../services/contracts';
import { localToday } from '../../utils/date';
import type { Vehicle } from '../../types/vehicle';

export type VehicleOps = Pick<Vehicle, 'driverId' | 'contractId' | 'routeName' | 'permitNumber' | 'permitExpiryDate' | 'lastInspectionDate' | 'nextInspectionDate'>;
export const EMPTY_OPS: VehicleOps = { driverId: null, contractId: null, routeName: '', permitNumber: '', permitExpiryDate: '', lastInspectionDate: '', nextInspectionDate: '' };

export function validateOps(o: VehicleOps): string | null {
  if (o.lastInspectionDate && o.nextInspectionDate && o.nextInspectionDate < o.lastInspectionDate) return 'Next inspection cannot be before the last inspection.';
  return null;
}

export const VehicleOperationsFields: React.FC<{
  officeId: string; vehicleId?: string; value: VehicleOps; onChange: (v: VehicleOps) => void; takenBy?: (driverId: string) => string | undefined;
}> = ({ officeId, vehicleId, value, onChange, takenBy }) => {
  const { hasPermission } = useAuth();
  const canSeeDrivers = !!officeId && hasPermission('view', 'drivers', officeId);
  const canSeeContracts = !!officeId && hasPermission('view', 'contracts', officeId);
  const { drivers } = useDrivers(canSeeDrivers);
  const [contracts, setContracts] = useState<Awaited<ReturnType<typeof fetchAssignableContracts>>>([]);
  useEffect(() => {
    if (!canSeeContracts) { setContracts([]); return; }
    let live = true;
    fetchAssignableContracts(officeId).then(c => { if (live) setContracts(c); }).catch(() => { if (live) setContracts([]); });
    return () => { live = false; };
  }, [officeId, canSeeContracts]);
  const today = localToday();
  const set = <K extends keyof VehicleOps>(k: K, v: VehicleOps[K]) => onChange({ ...value, [k]: v });
  const officeDrivers = drivers.filter(d => d.companyId === officeId && (d.status === 'Active' || d.id === value.driverId));
  const err = validateOps(value);

  return (
    <section>
      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Operations (route, driver, permit, inspection)</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Select label="Driver" value={value.driverId ?? ''} disabled={!canSeeDrivers} onChange={e => set('driverId', e.target.value || null)}
          hint={!canSeeDrivers ? 'You cannot see drivers in this office.' : officeDrivers.length === 0 ? 'No drivers in this office yet (Fleet → Drivers).' : 'One vehicle per driver; expired licences cannot be assigned.'}>
          <option value="">No driver</option>
          {officeDrivers.map(d => {
            const other = takenBy?.(d.id);
            const expired = d.licenceExpiryDate < today;
            const busy = !!other && other !== vehicleId;
            return <option key={d.id} value={d.id} disabled={(expired || busy) && d.id !== value.driverId}>
              {d.name} · {d.licenceNumber}{expired ? ' (licence expired)' : ''}{busy ? ' (drives another vehicle)' : ''}
            </option>;
          })}
        </Select>
        <Select label="Client contract" value={value.contractId ?? ''} disabled={!canSeeContracts} onChange={e => set('contractId', e.target.value || null)}
          hint={!canSeeContracts ? 'You cannot see contracts in this office.' : 'Active or draft client contracts of this office.'}>
          <option value="">No contract</option>
          {contracts.map(c => <option key={c.id} value={c.id}>{c.contractNumber} · {c.title}{c.status === 'Draft' ? ' (draft)' : ''}</option>)}
          {value.contractId && !contracts.some(c => c.id === value.contractId) && <option value={value.contractId}>Current contract (no longer active)</option>}
        </Select>
        <Input label="Route" placeholder="e.g. Seeb – Mawaleh school run" value={value.routeName ?? ''} onChange={e => set('routeName', e.target.value)} />
        <Input label="Route permit number" value={value.permitNumber ?? ''} onChange={e => set('permitNumber', e.target.value)} />
        <Input label="Permit expiry" type="date" value={value.permitExpiryDate ?? ''} onChange={e => set('permitExpiryDate', e.target.value)} />
        <div />
        <Input label="Last inspection" type="date" value={value.lastInspectionDate ?? ''} onChange={e => set('lastInspectionDate', e.target.value)} />
        <Input label="Next inspection due" type="date" value={value.nextInspectionDate ?? ''} error={err ?? undefined} onChange={e => set('nextInspectionDate', e.target.value)} />
      </div>
    </section>
  );
};
