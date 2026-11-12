// "All vehicle types" dropdown for fleet lists. matches(vehicleId) tells whether a record's vehicle
// is of the chosen type (records without a vehicle match only "All").
import React, { useMemo, useState } from 'react';
import { useFleet } from '../context/FleetContext';
import { useVehicleTypes } from './useVehicleTypes';
import { FilterSelect } from '../components/ui/FilterControls';

export function useVehicleTypeFilter() {
  const { vehicles } = useFleet();
  const { types } = useVehicleTypes('');
  const [typeName, setTypeName] = useState('all');
  const typeOf = useMemo(() => new Map(vehicles.map(v => [v.id, v.vehicleType])), [vehicles]);
  const matches = (vehicleId?: string | null) => typeName === 'all' || (!!vehicleId && typeOf.get(vehicleId) === typeName);
  const ui = (
    <FilterSelect aria-label="Vehicle type" value={typeName} onChange={e => setTypeName(e.target.value)}>
      <option value="all">All vehicle types</option>
      {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
    </FilterSelect>
  );
  return { typeName, matches, ui };
}
