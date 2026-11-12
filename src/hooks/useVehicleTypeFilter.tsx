// "All vehicle types" dropdown for fleet lists. matches(vehicleId) tells whether a record's vehicle
// is of the chosen type (records without a vehicle match only "All").
import React, { useMemo, useState } from 'react';
import { useFleet } from '../context/FleetContext';
import { useVehicleTypes } from './useVehicleTypes';

export function useVehicleTypeFilter() {
  const { vehicles } = useFleet();
  const { types } = useVehicleTypes('');
  const [typeName, setTypeName] = useState('all');
  const typeOf = useMemo(() => new Map(vehicles.map(v => [v.id, v.vehicleType])), [vehicles]);
  const matches = (vehicleId?: string | null) => typeName === 'all' || (!!vehicleId && typeOf.get(vehicleId) === typeName);
  const ui = (
    <select aria-label="Vehicle type" value={typeName} onChange={e => setTypeName(e.target.value)}
      className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer">
      <option value="all">All vehicle types</option>
      {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
    </select>
  );
  return { typeName, matches, ui };
}
