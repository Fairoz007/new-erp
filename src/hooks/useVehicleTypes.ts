// Active vehicle types from the vehicle_types master (Settings → Vehicle types). Vehicles store the
// type name; the database resolves vehicle_type_id and rejects unknown names.
import { useEffect, useState } from 'react';
import * as org from '../services/org';
import type { VehicleType } from '../services/org';

let cache: Promise<VehicleType[]> | null = null;
const load = () => (cache ??= org.listMaster('vehicleTypes').then(r => r as VehicleType[]).catch(e => { cache = null; throw e; }));
org.masterEvents.addEventListener('change', e => { if ((e as CustomEvent).detail === 'vehicleTypes') cache = null; });

export function useVehicleTypes(current?: string) {
  const [types, setTypes] = useState<VehicleType[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    load().then(t => live && setTypes(t)).catch(e => live && setError((e as Error).message));
    return () => { live = false; };
  }, []);
  // keep an inactive type selectable for a vehicle that already has it
  const active = types.filter(t => t.active || t.name === current).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const idOf = (name: string) => types.find(t => t.name === name)?.id;
  const byName = (name: string) => types.find(t => t.name === name);
  return { types: active, idOf, byName, error };
}
