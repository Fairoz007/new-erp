// Drivers: an employee with a driving licence. The office and name come from the employee (database
// trigger). A driver drives at most one vehicle, in the same office, with a valid licence; the
// database checks this on vehicles.driver_id. RLS: module "drivers" per office.
import { ServiceError, nul, supabase, unwrap, unwrapOne, ymd } from './core';

type Row = Record<string, any>;
const table = (name: string): any => (supabase as any).from(name);

export type DriverStatus = 'Active' | 'Suspended' | 'Inactive';
export const DRIVER_STATUSES: DriverStatus[] = ['Active', 'Suspended', 'Inactive'];

export interface Driver {
  id: string;
  companyId: string;
  employeeId: string;
  name: string;
  licenceNumber: string;
  licenceClass: string;
  licenceIssueDate: string;
  licenceExpiryDate: string;
  status: DriverStatus;
  notes: string;
}
export type DriverDraft = Omit<Driver, 'id' | 'name' | 'companyId'> & { id?: string; companyId: string };

const rowToDriver = (r: Row): Driver => ({
  id: r.id, companyId: r.company_id, employeeId: r.employee_id, name: r.display_name ?? '',
  licenceNumber: r.licence_number, licenceClass: r.licence_class ?? '', licenceIssueDate: ymd(r.licence_issue_date),
  licenceExpiryDate: ymd(r.licence_expiry_date), status: r.status, notes: r.notes ?? '',
});

export async function fetchDrivers(): Promise<Driver[]> {
  const rows = await unwrap<Row[]>(table('drivers').select('*').order('display_name'));
  return (rows ?? []).map(rowToDriver);
}

export async function saveDriver(d: DriverDraft): Promise<Driver> {
  if (!d.employeeId) throw new ServiceError('Choose the employee.');
  if (!d.licenceNumber.trim()) throw new ServiceError('Licence number is required.');
  if (!d.licenceExpiryDate) throw new ServiceError('Licence expiry date is required.');
  if (d.licenceIssueDate && d.licenceIssueDate > d.licenceExpiryDate) throw new ServiceError('The issue date cannot be after the expiry date.');
  const row = d.id
    ? await unwrapOne<Row>(table('drivers').update({
        licence_number: d.licenceNumber.trim(), licence_class: nul(d.licenceClass), licence_issue_date: nul(d.licenceIssueDate),
        licence_expiry_date: d.licenceExpiryDate, status: d.status, notes: nul(d.notes),
      }).eq('id', d.id).select('*').maybeSingle())
    // company_id is overwritten by the database with the employee's office
    : await unwrapOne<Row>(table('drivers').insert({
        company_id: d.companyId, employee_id: d.employeeId,
        licence_number: d.licenceNumber.trim(), licence_class: nul(d.licenceClass), licence_issue_date: nul(d.licenceIssueDate),
        licence_expiry_date: d.licenceExpiryDate, status: d.status, notes: nul(d.notes),
      }).select('*').single());
  return rowToDriver(row);
}

export async function deleteDriver(id: string): Promise<void> {
  const rows = await unwrap<Row[]>(table('drivers').delete().eq('id', id).select('id'));
  if (!rows?.length) throw new ServiceError('You cannot delete this driver.');
}

export type ExpiryKind = 'registration' | 'insurance' | 'permit' | 'inspection' | 'licence';
export interface FleetExpiry { companyId: string; kind: ExpiryKind; vehicleId: string | null; driverId: string | null; label: string; dueDate: string }
export const EXPIRY_LABEL: Record<ExpiryKind, string> = {
  registration: 'Registration (ROP/RTA)', insurance: 'Insurance', permit: 'Route permit', inspection: 'Inspection', licence: 'Driving licence',
};

/** Dates due on or before `until` (overdue included), for the dashboard. RLS limits the rows to the user's offices. */
export async function fetchFleetExpiries(until: string): Promise<FleetExpiry[]> {
  const rows = await unwrap<Row[]>(table('v_fleet_expiries').select('company_id, kind, vehicle_id, driver_id, label, due_date')
    .lte('due_date', until).order('due_date'));
  return (rows ?? []).map(r => ({ companyId: r.company_id, kind: r.kind, vehicleId: r.vehicle_id, driverId: r.driver_id, label: r.label, dueDate: ymd(r.due_date) }));
}

