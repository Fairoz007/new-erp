// Fleet operations service (Agent A): companies, vehicles, maintenance, work orders, oil, tyres, accidents, expenses.
// Same function names / parameters as the old FleetContext mutations, but async and backed by Supabase.
// Business side effects that must be atomic (timeline, odometer, vehicle status after an accident, approval request
// for expensive work orders, pending purchase invoice for unpaid maintenance, DB-computed totals) live in the
// triggers of supabase/migrations/20261026000100_fleet.sql, not in the browser.
import {
  CollectionKey, Fetchers, ServiceError, currentUserId, nul, num, numOrUndef, rpcAny, supabase, unwrap, unwrapOne, ymd,
  fetchPaged,
} from './core';
import { parseStorageRef, toStorageRef } from './storage';
import { Company } from '../types/system';
import {
  OilChange, OilConfig, Tyre, TyreEvent, Vehicle, VehicleDepreciationConfig, VehicleFinancialSummary,
  VehiclePurchaseDetails,
} from '../types/vehicle';
import { MaintenanceRecord, WorkOrder, WorkOrderStatus } from '../types/maintenance';
import { Accident, TimelineEvent, VehicleExpense } from '../types/operations';
import { Invoice } from '../types/finance';
import { calculateCostPerKm, calculateCurrentBookValue, roundToPrecision } from '../utils/financial';

type Row = Record<string, any>;
const table = (name: string): any => (supabase as any).from(name);

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
/** PostgREST caps a response at 1000 rows: page through so a collection is never silently truncated. */
async function fetchAll(name: string, select: string, order: { column: string; ascending?: boolean } = { column: 'created_at', ascending: false }): Promise<Row[]> {
  return fetchPaged<Row>((from, to) => unwrap<Row[]>(
    table(name).select(select).order(order.column, { ascending: order.ascending ?? false }).order('id').range(from, to),
  ));
}

const int = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));
const money = (v: unknown): number => roundToPrecision(num(v), 3);
const date = (v: unknown): string | null => nul(ymd((v as string) ?? ''));
const text = (v: unknown): string | null => (v == null ? null : String(v).trim() === '' ? null : String(v));

/** Build a patch row from a Partial<AppType>: only keys present in `updates` are written. */
function patcher<T extends object>(updates: Partial<T>, out: Row) {
  return (key: keyof T, column: string, fn: (v: any) => any = v => v) => {
    if (updates[key] !== undefined) out[column] = fn(updates[key]);
  };
}

const uniqueMessage = (e: unknown, message: string): never => {
  if (e instanceof ServiceError && e.code === '23505') throw new ServiceError(message, { code: e.code });
  throw e;
};

async function vehicleInfo(vehicleId: string): Promise<{ companyId: string; mileage: number; oilConfig: Partial<OilConfig> }> {
  if (!vehicleId) throw new ServiceError('Select a vehicle.');
  const v = await unwrapOne<Row>(
    table('vehicles').select('company_id, current_mileage, oil_config').eq('id', vehicleId).maybeSingle(),
  );
  return { companyId: v.company_id, mileage: num(v.current_mileage), oilConfig: v.oil_config ?? {} };
}

// ---------------------------------------------------------------------------------------------
// companies
// ---------------------------------------------------------------------------------------------
export const rowToCompany = (r: Row): Company => ({
  id: r.id,
  name: r.name,
  code: r.code,
  registrationNumber: r.registration_number ?? '',
  vatNumber: r.vat_number ?? '',
  taxNumber: r.tax_number ?? '',
  address: r.address ?? '',
  country: r.country ?? '',
  state: r.state ?? '',
  city: r.city ?? '',
  postalCode: r.postal_code ?? '',
  phone: r.phone ?? '',
  email: r.email ?? '',
  website: r.website ?? '',
  logo: r.logo ?? '',
  currency: r.currency ?? 'OMR',
  financialYear: r.financial_year ?? '',
  bankDetails: {
    bankName: r.bank_details?.bankName ?? '',
    accountNumber: r.bank_details?.accountNumber ?? '',
    iban: r.bank_details?.iban ?? '',
    swiftCode: r.bank_details?.swiftCode ?? '',
    branch: r.bank_details?.branch ?? '',
  },
  notes: r.notes ?? undefined,
  active: r.active ?? true,
});

export const companyToRow = (c: Partial<Company>): Row => {
  const o: Row = {};
  const m = patcher<Company>(c, o);
  m('name', 'name'); m('code', 'code');
  m('registrationNumber', 'registration_number', text); m('vatNumber', 'vat_number', text); m('taxNumber', 'tax_number', text);
  m('address', 'address', text); m('country', 'country', text); m('state', 'state', text); m('city', 'city', text);
  m('postalCode', 'postal_code', text); m('phone', 'phone', text); m('email', 'email', text); m('website', 'website', text);
  m('logo', 'logo', text); m('currency', 'currency'); m('financialYear', 'financial_year', text);
  m('bankDetails', 'bank_details'); m('notes', 'notes', text); m('active', 'active');
  return o;
};

export async function addCompany(data: Omit<Company, 'id'>): Promise<Company> {
  if (!data.name?.trim() || !data.code?.trim()) throw new ServiceError('Office name and code are required.');
  const row = await unwrapOne<Row>(
    table('companies').insert(companyToRow(data)).select('*').single(),
  ).catch(e => uniqueMessage(e, `An office with code ${data.code} already exists.`));
  return rowToCompany(row);
}

export async function updateCompany(id: string, updates: Partial<Company>): Promise<Company> {
  const row = await unwrapOne<Row>(
    table('companies').update(companyToRow(updates)).eq('id', id).select('*').maybeSingle(),
  ).catch(e => uniqueMessage(e, 'An office with this code already exists.'));
  return rowToCompany(row);
}

// ---------------------------------------------------------------------------------------------
// vehicles
// ---------------------------------------------------------------------------------------------
const VEHICLE_SELECT = '*, company:companies(name)';

export const rowToVehicle = (r: Row): Vehicle => ({
  id: r.id,
  vehicleId: r.vehicle_code ?? '',
  companyId: r.company_id,
  companyName: r.company?.name ?? '',
  plateNumber: r.plate_number,
  registrationNumber: r.registration_number ?? '',
  vin: r.vin ?? '',
  engineNumber: r.engine_number ?? '',
  vehicleType: r.vehicle_type,
  vehicleCategory: r.vehicle_category,
  brand: r.brand,
  manufacturer: r.manufacturer ?? '',
  model: r.model,
  variant: r.variant ?? '',
  manufacturingYear: num(r.manufacturing_year),
  registrationDate: ymd(r.registration_date),
  registrationExpiryDate: ymd(r.registration_expiry_date),
  countryOfRegistration: r.country_of_registration ?? '',
  color: r.color ?? '',
  fuelType: r.fuel_type,
  transmission: r.transmission,
  engineCapacityCc: num(r.engine_capacity_cc),
  numberOfSeats: num(r.number_of_seats),
  currentMileage: num(r.current_mileage),
  initialOdometer: num(r.initial_odometer),
  status: r.status,
  photoUrl: r.photo_url ?? '',
  assignedDriver: r.assigned_driver ?? undefined,
  department: r.department ?? undefined,
  location: r.location ?? undefined,
  purchase: {
    purchaseDate: '', purchaseValue: 0, purchaseInvoiceNumber: '', supplierId: '', supplierName: '',
    paymentMethod: '' as VehiclePurchaseDetails['paymentMethod'],
    ...(r.purchase ?? {}),
  } as VehiclePurchaseDetails,
  depreciation: {
    depreciationMethod: 'Straight-Line', usefulLifeYears: 0, annualRatePercentage: 0, salvageValue: 0,
    ...(r.depreciation ?? {}),
  } as VehicleDepreciationConfig,
  oilConfig: {
    oilType: '', oilBrand: '', oilGrade: '', intervalKm: 0, intervalMonths: 0, estimatedCost: 0, capacityLitres: 0,
    ...(r.oil_config ?? {}),
  } as OilConfig,
  currentMarketValue: num(r.current_market_value),
  marketValueUpdatedDate: ymd(r.market_value_updated_date),
  insuranceProvider: r.insurance_provider ?? '',
  insurancePolicyNumber: r.insurance_policy_number ?? '',
  insuranceExpiryDate: ymd(r.insurance_expiry_date),
  insurancePremiumAnnual: num(r.insurance_premium_annual),
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const vehicleToRow = (v: Partial<Vehicle>): Row => {
  const o: Row = {};
  const m = patcher<Vehicle>(v, o);
  m('companyId', 'company_id');
  m('plateNumber', 'plate_number', s => String(s).trim());
  m('registrationNumber', 'registration_number', text); m('vin', 'vin', text); m('engineNumber', 'engine_number', text);
  m('vehicleType', 'vehicle_type'); m('vehicleCategory', 'vehicle_category');
  m('brand', 'brand'); m('manufacturer', 'manufacturer', text); m('model', 'model'); m('variant', 'variant', text);
  m('manufacturingYear', 'manufacturing_year', int);
  m('registrationDate', 'registration_date', date); m('registrationExpiryDate', 'registration_expiry_date', date);
  m('countryOfRegistration', 'country_of_registration', text); m('color', 'color', text);
  m('fuelType', 'fuel_type'); m('transmission', 'transmission');
  m('engineCapacityCc', 'engine_capacity_cc', int); m('numberOfSeats', 'number_of_seats', int);
  m('currentMileage', 'current_mileage', s => int(s) ?? 0); m('initialOdometer', 'initial_odometer', s => int(s) ?? 0);
  m('status', 'status'); m('photoUrl', 'photo_url', text);
  m('assignedDriver', 'assigned_driver', text); m('department', 'department', text); m('location', 'location', text);
  m('purchase', 'purchase'); m('depreciation', 'depreciation'); m('oilConfig', 'oil_config');
  m('currentMarketValue', 'current_market_value', money); m('marketValueUpdatedDate', 'market_value_updated_date', date);
  m('insuranceProvider', 'insurance_provider', text); m('insurancePolicyNumber', 'insurance_policy_number', text);
  m('insuranceExpiryDate', 'insurance_expiry_date', date); m('insurancePremiumAnnual', 'insurance_premium_annual', money);
  m('notes', 'notes', text);
  return o;
};

const plateTaken = (plate?: string) => `A vehicle with plate number ${plate ?? ''} already exists in this office.`.replace('  ', ' ');

export async function addVehicle(data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vehicle> {
  const row = { ...vehicleToRow(data), vehicle_code: null }; // vehicle_code (VH-001) is assigned by the database
  const created = await unwrapOne<Row>(
    table('vehicles').insert(row).select(VEHICLE_SELECT).single(),
  ).catch(e => uniqueMessage(e, plateTaken(data.plateNumber)));
  return rowToVehicle(created);
}

export async function updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle> {
  const patch = vehicleToRow(updates);
  delete patch.company_id; // an office transfer is not an edit: it would orphan the vehicle's records
  const updated = await unwrapOne<Row>(
    table('vehicles').update(patch).eq('id', id).select(VEHICLE_SELECT).maybeSingle(),
  ).catch(e => uniqueMessage(e, plateTaken(updates.plateNumber)));
  return rowToVehicle(updated);
}

export async function deleteVehicle(id: string): Promise<void> {
  let deleted: Row[];
  try {
    deleted = await unwrap<Row[]>(table('vehicles').delete().eq('id', id).select('id'));
  } catch (e) {
    if (e instanceof ServiceError && e.code === '23503') {
      throw new ServiceError('Vehicle has linked records; set its status to Inactive instead of deleting.', { code: e.code });
    }
    throw e;
  }
  if (!deleted || deleted.length === 0) throw new ServiceError('Vehicle not found, or you do not have permission to delete it.');
}

// ---------------------------------------------------------------------------------------------
// timeline (written by triggers; read-only here)
// ---------------------------------------------------------------------------------------------
const TIMELINE_STYLE: Record<string, { icon: string; color: string }> = {
  Purchase: { icon: 'Car', color: 'indigo' },
  Registration: { icon: 'FileText', color: 'slate' },
  Maintenance: { icon: 'Wrench', color: 'blue' },
  Oil: { icon: 'Droplet', color: 'amber' },
  Tyre: { icon: 'Disc', color: 'amber' },
  Accident: { icon: 'AlertTriangle', color: 'rose' },
  Expense: { icon: 'Receipt', color: 'teal' },
  Depreciation: { icon: 'Percent', color: 'purple' },
  Inspection: { icon: 'ClipboardCheck', color: 'slate' },
  Status: { icon: 'Activity', color: 'slate' },
};

export const rowToTimeline = (r: Row): TimelineEvent => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  date: ymd(r.date),
  title: r.title,
  description: r.description ?? '',
  amount: numOrUndef(r.amount),
  currency: r.currency ?? undefined,
  category: r.category,
  referenceId: r.reference_id ?? undefined,
  referenceType: r.reference_type ?? undefined,
  ...(TIMELINE_STYLE[r.category] ?? {}),
});

// ---------------------------------------------------------------------------------------------
// maintenance records
// ---------------------------------------------------------------------------------------------
const MAINTENANCE_SELECT = '*, vehicle:vehicles(plate_number), supplier:suppliers(name), work_order:work_orders(work_order_number)';

const rowToAttachments = (list: any): any[] =>
  (Array.isArray(list) ? list : []).map((a: Row, i: number) => ({
    id: a.id ?? `att-${i}`,
    name: a.name ?? '',
    type: a.type ?? 'Document',
    url: a.storage_path ? toStorageRef('documents', a.storage_path) : a.url ?? '',
    storagePath: a.storage_path ?? undefined,
    uploadedAt: a.uploadedAt ?? a.uploaded_at ?? '',
  }));

const attachmentsToRows = (list: any[] | undefined): Row[] =>
  (list ?? []).map(a => {
    const ref = parseStorageRef(a.url);
    const path: string | undefined = a.storagePath ?? ref?.path;
    if (!path) {
      throw new ServiceError(`Attachment "${a.name ?? ''}" has not been uploaded to storage. Upload it with storage.uploadFile first.`);
    }
    return { id: a.id, name: a.name, type: a.type, storage_path: path, uploadedAt: a.uploadedAt };
  });

export const rowToMaintenance = (r: Row): MaintenanceRecord => ({
  id: r.id,
  recordNumber: r.record_number,
  vehicleId: r.vehicle_id,
  vehiclePlate: r.vehicle?.plate_number ?? '',
  companyId: r.company_id,
  maintenanceDate: ymd(r.maintenance_date),
  maintenanceType: r.maintenance_type,
  category: r.category,
  description: r.description,
  odometerReading: num(r.odometer_reading),
  serviceCentre: r.service_centre ?? '',
  supplierId: r.supplier_id ?? '',
  supplierName: r.supplier?.name ?? '',
  technician: r.technician ?? undefined,
  workOrderNumber: r.work_order?.work_order_number ?? undefined,
  invoiceNumber: r.invoice_number ?? undefined,
  partsCost: num(r.parts_cost),
  labourCost: num(r.labour_cost),
  tax: num(r.tax),
  discount: num(r.discount),
  otherCharges: num(r.other_charges),
  totalCost: num(r.total_cost),
  paymentStatus: r.payment_status,
  paymentMethod: r.payment_method ?? undefined,
  nextServiceDate: nul(ymd(r.next_service_date)) ?? undefined,
  nextServiceMileage: numOrUndef(r.next_service_mileage),
  warrantyPeriodMonths: numOrUndef(r.warranty_period_months),
  warrantyExpiryDate: nul(ymd(r.warranty_expiry_date)) ?? undefined,
  partsUsed: Array.isArray(r.parts_used) && r.parts_used.length ? r.parts_used : undefined,
  attachments: Array.isArray(r.attachments) && r.attachments.length ? rowToAttachments(r.attachments) : undefined,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
});

export async function addMaintenanceRecord(data: Omit<MaintenanceRecord, 'id' | 'recordNumber' | 'createdAt'>): Promise<MaintenanceRecord> {
  const v = await vehicleInfo(data.vehicleId);
  let workOrderId: string | null = null;
  if (data.workOrderNumber) {
    const wo = await unwrap<Row | null>(
      table('work_orders').select('id').eq('company_id', v.companyId).eq('work_order_number', data.workOrderNumber).maybeSingle(),
    );
    workOrderId = wo?.id ?? null;
  }
  const row: Row = {
    company_id: v.companyId,
    record_number: null, // MNT-YYYY-001 is assigned by the database
    vehicle_id: data.vehicleId,
    work_order_id: workOrderId,
    maintenance_date: ymd(data.maintenanceDate),
    maintenance_type: data.maintenanceType,
    category: data.category,
    description: data.description,
    odometer_reading: int(data.odometerReading),
    service_centre: text(data.serviceCentre),
    supplier_id: nul(data.supplierId),
    technician: text(data.technician),
    invoice_number: text(data.invoiceNumber),
    parts_cost: money(data.partsCost), labour_cost: money(data.labourCost), tax: money(data.tax),
    discount: money(data.discount), other_charges: money(data.otherCharges),
    total_cost: money(data.totalCost), // recomputed by the database from the parts above
    payment_status: data.paymentStatus,
    payment_method: text(data.paymentMethod),
    next_service_date: date(data.nextServiceDate), next_service_mileage: int(data.nextServiceMileage),
    warranty_period_months: int(data.warrantyPeriodMonths), warranty_expiry_date: date(data.warrantyExpiryDate),
    parts_used: data.partsUsed ?? [],
    attachments: attachmentsToRows(data.attachments),
    notes: text(data.notes),
  };
  const created = await unwrapOne<Row>(table('maintenance_records').insert(row).select(MAINTENANCE_SELECT).single());
  return rowToMaintenance(created);
}

// ---------------------------------------------------------------------------------------------
// work orders
// ---------------------------------------------------------------------------------------------
const WORK_ORDER_SELECT = '*, vehicle:vehicles(plate_number), supplier:suppliers(name), requester:profiles(name)';

export const rowToWorkOrder = (r: Row, approvalId?: string): WorkOrder => ({
  id: r.id,
  workOrderNumber: r.work_order_number,
  vehicleId: r.vehicle_id,
  vehiclePlate: r.vehicle?.plate_number ?? '',
  companyId: r.company_id,
  reportedDate: ymd(r.reported_date),
  problemDescription: r.problem_description,
  requestedBy: r.requested_by ?? '',
  requestedByName: r.requester?.name ?? '',
  assignedTechnician: r.assigned_technician ?? undefined,
  workshop: r.workshop ?? '',
  supplierId: r.supplier_id ?? undefined,
  supplierName: r.supplier?.name ?? undefined,
  priority: r.priority,
  status: r.status,
  expectedCompletion: nul(ymd(r.expected_completion)) ?? undefined,
  actualCompletion: nul(ymd(r.actual_completion)) ?? undefined,
  estimatedCost: num(r.estimated_cost),
  partsCharges: num(r.parts_charges),
  labourCharges: num(r.labour_charges),
  additionalCharges: num(r.additional_charges),
  tax: num(r.tax),
  finalCost: num(r.final_cost),
  partsRequired: r.parts_required ?? undefined,
  approvalStatus: r.approval_status,
  approvalId,
  invoiceNumber: r.invoice_number ?? undefined,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function approvalIdsFor(workOrderIds?: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const rows = workOrderIds
    ? await unwrap<Row[]>(table('approval_requests').select('id, reference_id, requested_at').eq('reference_type', 'WorkOrder').in('reference_id', workOrderIds).order('requested_at', { ascending: true }))
    : await fetchAll('approval_requests', 'id, reference_id, requested_at', { column: 'requested_at', ascending: true });
  for (const r of rows ?? []) map.set(r.reference_id, r.id); // latest request wins
  return map;
}

export async function addWorkOrder(data: Omit<WorkOrder, 'id' | 'workOrderNumber' | 'createdAt' | 'updatedAt'>): Promise<WorkOrder> {
  const v = await vehicleInfo(data.vehicleId);
  const row: Row = {
    company_id: v.companyId,
    work_order_number: null, // WO-YYYY-001 assigned by the database
    vehicle_id: data.vehicleId,
    reported_date: ymd(data.reportedDate),
    problem_description: data.problemDescription,
    requested_by: await currentUserId(), // the signed-in user, never a client-supplied id
    assigned_technician: text(data.assignedTechnician),
    workshop: text(data.workshop),
    supplier_id: nul(data.supplierId),
    priority: data.priority,
    status: data.status === 'Draft' ? 'Draft' : 'Requested',
    expected_completion: date(data.expectedCompletion),
    estimated_cost: money(data.estimatedCost),
    parts_charges: money(data.partsCharges), labour_charges: money(data.labourCharges),
    additional_charges: money(data.additionalCharges), tax: money(data.tax),
    final_cost: money(data.finalCost),
    parts_required: text(data.partsRequired),
    approval_status: 'Not Required', // the database raises 'Pending' + the approval request when a rule applies
    notes: text(data.notes),
  };
  const created = await unwrapOne<Row>(table('work_orders').insert(row).select(WORK_ORDER_SELECT).single());
  const approvals = await approvalIdsFor([created.id]).catch(() => new Map<string, string>());
  return rowToWorkOrder(created, approvals.get(created.id));
}

export async function updateWorkOrderStatus(id: string, status: WorkOrderStatus, actualCost?: number): Promise<void> {
  const wo = await unwrapOne<Row>(table('work_orders').select('*').eq('id', id).maybeSingle());
  if (wo.status === status) return;
  if (wo.status === 'Completed' || wo.status === 'Cancelled') {
    throw new ServiceError(`Work order ${wo.work_order_number} is already ${wo.status} and cannot be changed.`);
  }
  if (status !== 'Cancelled' && wo.approval_status === 'Pending') {
    throw new ServiceError(`Work order ${wo.work_order_number} is waiting for approval. Decide it in the Approvals module first.`);
  }
  if (status !== 'Cancelled' && wo.approval_status === 'Rejected') {
    throw new ServiceError(`Work order ${wo.work_order_number} was rejected and can only be cancelled.`);
  }

  if (status === 'Completed') {
    if (wo.status === 'Requested' || wo.status === 'Draft') {
      throw new ServiceError('Approve and start the work order before completing it.');
    }
    const finalCost = actualCost !== undefined ? actualCost : num(wo.final_cost) || num(wo.estimated_cost);
    // One transaction: marks the order completed AND creates exactly one maintenance record.
    await rpcAny('complete_work_order', { p_work_order: id, p_final_cost: money(finalCost) });
    return;
  }

  const patch: Row = { status };
  if (actualCost !== undefined) patch.final_cost = money(actualCost);
  const updated = await unwrap<Row[]>(table('work_orders').update(patch).eq('id', id).select('id'));
  if (!updated || updated.length === 0) throw new ServiceError('Work order not found, or you do not have permission to update it.');
}

// ---------------------------------------------------------------------------------------------
// oil changes
// ---------------------------------------------------------------------------------------------
const OIL_SELECT = '*, vehicle:vehicles(plate_number, current_mileage), supplier:suppliers(name)';

export function oilStatus(nextMileage: number, currentMileage: number): OilChange['status'] {
  if (!nextMileage) return 'Normal';
  if (currentMileage >= nextMileage) return 'Overdue';
  if (nextMileage - currentMileage <= 1000) return 'Due Soon';
  return 'Normal';
}

export const rowToOilChange = (r: Row, status?: OilChange['status']): OilChange => {
  const next = num(r.next_oil_change_mileage);
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    date: ymd(r.date),
    odometer: num(r.odometer),
    oilType: r.oil_type ?? '',
    oilBrand: r.oil_brand ?? '',
    oilGrade: r.oil_grade ?? '',
    quantityLitres: num(r.quantity_litres),
    oilCost: num(r.oil_cost),
    filterCost: num(r.filter_cost),
    labourCost: num(r.labour_cost),
    tax: num(r.tax),
    totalCost: num(r.total_cost),
    supplierId: r.supplier_id ?? undefined,
    supplierName: r.supplier?.name ?? undefined,
    invoiceNumber: r.invoice_number ?? undefined,
    nextOilChangeMileage: next,
    nextOilChangeDate: ymd(r.next_oil_change_date),
    status: status ?? oilStatus(next, num(r.vehicle?.current_mileage)),
    performedBy: r.performed_by ?? undefined,
    notes: r.notes ?? undefined,
  };
};

export async function addOilChange(data: Omit<OilChange, 'id' | 'status'>): Promise<OilChange> {
  const v = await vehicleInfo(data.vehicleId);
  const intervalKm = num(v.oilConfig.intervalKm) || 10000;
  const nextMileage = Math.round(num(data.odometer)) + intervalKm; // service interval comes from the vehicle's oil config
  const sum = money(num(data.oilCost) + num(data.filterCost) + num(data.labourCost) + num(data.tax));
  const row: Row = {
    company_id: v.companyId,
    vehicle_id: data.vehicleId,
    date: ymd(data.date),
    odometer: int(data.odometer) ?? 0,
    oil_type: text(data.oilType), oil_brand: text(data.oilBrand), oil_grade: text(data.oilGrade),
    quantity_litres: num(data.quantityLitres),
    oil_cost: money(data.oilCost), filter_cost: money(data.filterCost), labour_cost: money(data.labourCost), tax: money(data.tax),
    total_cost: sum, // recomputed by the database
    supplier_id: nul(data.supplierId),
    invoice_number: text(data.invoiceNumber),
    next_oil_change_mileage: nextMileage,
    next_oil_change_date: date(data.nextOilChangeDate),
    performed_by: text(data.performedBy),
    notes: text(data.notes),
  };
  const created = await unwrapOne<Row>(table('oil_changes').insert(row).select(OIL_SELECT).single());
  // vehicle mileage was bumped by the trigger; re-read it so the status reflects the new odometer
  const veh = await unwrap<Row | null>(table('vehicles').select('plate_number, current_mileage').eq('id', data.vehicleId).maybeSingle());
  return rowToOilChange({ ...created, vehicle: veh ?? created.vehicle });
}

// ---------------------------------------------------------------------------------------------
// tyres & tyre events
// ---------------------------------------------------------------------------------------------
const TYRE_SELECT = '*, supplier:suppliers(name)';

export const rowToTyre = (r: Row): Tyre => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  brand: r.brand,
  model: r.model ?? '',
  size: r.size ?? '',
  serialNumber: r.serial_number ?? '',
  position: r.position,
  purchaseDate: ymd(r.purchase_date),
  purchaseCost: num(r.purchase_cost),
  installationDate: ymd(r.installation_date),
  installationMileage: num(r.installation_mileage),
  expectedLifeKm: num(r.expected_life_km),
  currentMileage: num(r.current_mileage),
  treadDepthMm: num(r.tread_depth_mm),
  replacementDate: nul(ymd(r.replacement_date)) ?? undefined,
  replacementMileage: numOrUndef(r.replacement_mileage),
  supplierId: r.supplier_id ?? undefined,
  supplierName: r.supplier?.name ?? undefined,
  invoiceNumber: r.invoice_number ?? undefined,
  status: r.status,
  notes: r.notes ?? undefined,
});

const tyreToRow = (t: Partial<Tyre>): Row => {
  const o: Row = {};
  const m = patcher<Tyre>(t, o);
  m('vehicleId', 'vehicle_id'); m('brand', 'brand'); m('model', 'model', text); m('size', 'size', text);
  m('serialNumber', 'serial_number', text); m('position', 'position');
  m('purchaseDate', 'purchase_date', date); m('purchaseCost', 'purchase_cost', money);
  m('installationDate', 'installation_date', date); m('installationMileage', 'installation_mileage', int);
  m('expectedLifeKm', 'expected_life_km', int); m('currentMileage', 'current_mileage', int);
  m('treadDepthMm', 'tread_depth_mm', s => Math.round(num(s) * 100) / 100);
  m('replacementDate', 'replacement_date', date); m('replacementMileage', 'replacement_mileage', int);
  m('supplierId', 'supplier_id', nul); m('invoiceNumber', 'invoice_number', text);
  m('status', 'status'); m('notes', 'notes', text);
  return o;
};

export async function addTyre(data: Omit<Tyre, 'id'>): Promise<Tyre> {
  const v = await vehicleInfo(data.vehicleId);
  const created = await unwrapOne<Row>(
    table('tyres').insert({ ...tyreToRow(data), company_id: v.companyId }).select(TYRE_SELECT).single(),
  );
  return rowToTyre(created);
}

export async function updateTyre(id: string, updates: Partial<Tyre>): Promise<Tyre> {
  const patch = tyreToRow(updates);
  delete patch.vehicle_id; // a tyre cannot be moved to another vehicle by an edit
  const updated = await unwrapOne<Row>(table('tyres').update(patch).eq('id', id).select(TYRE_SELECT).maybeSingle());
  return rowToTyre(updated);
}

const TYRE_EVENT_SELECT = '*, supplier:suppliers(name)';

export const rowToTyreEvent = (r: Row): TyreEvent => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  date: ymd(r.date),
  eventType: r.event_type,
  odometer: num(r.odometer),
  tyrePositionsAffected: r.positions_affected ?? [],
  cost: num(r.cost),
  supplierId: r.supplier_id ?? undefined,
  supplierName: r.supplier?.name ?? undefined,
  invoiceNumber: r.invoice_number ?? undefined,
  technician: r.technician ?? undefined,
  notes: r.notes ?? undefined,
});

export async function addTyreEvent(data: Omit<TyreEvent, 'id'>): Promise<TyreEvent> {
  const v = await vehicleInfo(data.vehicleId);
  const row: Row = {
    company_id: v.companyId,
    vehicle_id: data.vehicleId,
    date: ymd(data.date),
    event_type: data.eventType,
    odometer: int(data.odometer),
    positions_affected: data.tyrePositionsAffected ?? [],
    cost: money(data.cost),
    supplier_id: nul(data.supplierId),
    invoice_number: text(data.invoiceNumber),
    technician: text(data.technician),
    notes: text(data.notes),
  };
  const created = await unwrapOne<Row>(table('tyre_events').insert(row).select(TYRE_EVENT_SELECT).single());
  return rowToTyreEvent(created);
}

// ---------------------------------------------------------------------------------------------
// accidents
// ---------------------------------------------------------------------------------------------
const ACCIDENT_SELECT = '*, vehicle:vehicles(plate_number)';

export const rowToAccident = (r: Row): Accident => ({
  id: r.id,
  accidentNumber: r.accident_number,
  vehicleId: r.vehicle_id,
  vehiclePlate: r.vehicle?.plate_number ?? '',
  companyId: r.company_id,
  accidentDate: ymd(r.accident_date),
  accidentTime: r.accident_time ? String(r.accident_time).slice(0, 5) : '',
  location: r.location ?? '',
  driverName: r.driver_name ?? '',
  accidentDescription: r.accident_description ?? '',
  accidentType: r.accident_type,
  damageDescription: r.damage_description ?? '',
  policeReportNumber: r.police_report_number ?? '',
  insuranceClaimNumber: r.insurance_claim_number ?? '',
  thirdPartyDetails: r.third_party_details ?? undefined,
  estimatedRepairCost: num(r.estimated_repair_cost),
  actualRepairCost: num(r.actual_repair_cost),
  insuranceContribution: num(r.insurance_contribution),
  companyContribution: num(r.company_contribution),
  thirdPartyContribution: num(r.third_party_contribution),
  netAccidentCostToCompany: Math.max(0, num(r.net_cost_to_company)), // generated column; floored at 0 as before
  workshop: r.workshop ?? '',
  supplierId: r.supplier_id ?? undefined,
  repairStartDate: nul(ymd(r.repair_start_date)) ?? undefined,
  repairCompletionDate: nul(ymd(r.repair_completion_date)) ?? undefined,
  vehicleDowntimeDays: num(r.vehicle_downtime_days),
  status: r.status,
  attachments: Array.isArray(r.attachments) && r.attachments.length ? rowToAttachments(r.attachments) : undefined,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
});

const accidentToRow = (a: Partial<Accident>): Row => {
  const o: Row = {};
  const m = patcher<Accident>(a, o);
  m('vehicleId', 'vehicle_id'); m('accidentDate', 'accident_date', date);
  m('accidentTime', 'accident_time', s => nul(s)); m('location', 'location', text); m('driverName', 'driver_name', text);
  m('accidentDescription', 'accident_description', text); m('accidentType', 'accident_type');
  m('damageDescription', 'damage_description', text); m('policeReportNumber', 'police_report_number', text);
  m('insuranceClaimNumber', 'insurance_claim_number', text); m('thirdPartyDetails', 'third_party_details', text);
  m('estimatedRepairCost', 'estimated_repair_cost', money); m('actualRepairCost', 'actual_repair_cost', money);
  m('insuranceContribution', 'insurance_contribution', money); m('companyContribution', 'company_contribution', money);
  m('thirdPartyContribution', 'third_party_contribution', money);
  m('workshop', 'workshop', text); m('supplierId', 'supplier_id', nul);
  m('repairStartDate', 'repair_start_date', date); m('repairCompletionDate', 'repair_completion_date', date);
  m('vehicleDowntimeDays', 'vehicle_downtime_days', s => int(s) ?? 0);
  m('status', 'status'); m('notes', 'notes', text);
  if (a.attachments !== undefined) o.attachments = attachmentsToRows(a.attachments);
  return o;
};

export async function addAccident(data: Omit<Accident, 'id' | 'accidentNumber' | 'createdAt' | 'netAccidentCostToCompany'>): Promise<Accident> {
  const v = await vehicleInfo(data.vehicleId);
  const row = { ...accidentToRow(data), company_id: v.companyId, accident_number: null }; // ACC-YYYY-001 by the database
  const created = await unwrapOne<Row>(table('accidents').insert(row).select(ACCIDENT_SELECT).single());
  return rowToAccident(created);
}

export async function updateAccident(id: string, updates: Partial<Accident>): Promise<Accident> {
  const patch = accidentToRow(updates);
  delete patch.vehicle_id;
  const updated = await unwrapOne<Row>(table('accidents').update(patch).eq('id', id).select(ACCIDENT_SELECT).maybeSingle());
  return rowToAccident(updated);
}

// ---------------------------------------------------------------------------------------------
// expenses
// ---------------------------------------------------------------------------------------------
const EXPENSE_SELECT = '*, vehicle:vehicles(plate_number), supplier:suppliers(name)';

export const rowToExpense = (r: Row): VehicleExpense => {
  const path: string | null = r.attachment_path ?? null;
  return {
    id: r.id,
    expenseNumber: r.expense_number,
    vehicleId: r.vehicle_id ?? '',
    vehiclePlate: r.vehicle?.plate_number ?? '',
    companyId: r.company_id,
    date: ymd(r.date),
    category: r.category,
    supplierId: r.supplier_id ?? undefined,
    supplierName: r.supplier?.name ?? undefined,
    description: r.description,
    quantity: num(r.quantity),
    unitPrice: num(r.unit_price),
    tax: num(r.tax),
    total: num(r.total),
    paymentMethod: r.payment_method,
    invoiceNumber: r.invoice_number ?? undefined,
    receiptNumber: r.receipt_number ?? undefined,
    costCentre: r.cost_centre ?? '',
    glAccountCode: r.gl_account_code ?? undefined,
    // storage://documents/<path>: DocumentViewerModal / openBillModal resolve it to a short-lived signed URL
    attachmentUrl: path ? toStorageRef('documents', path) : undefined,
    attachmentName: path ? (path.split('/').pop() ?? '').replace(/^[0-9a-f-]{36}-/i, '') : undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
};

export async function addExpense(data: Omit<VehicleExpense, 'id' | 'expenseNumber' | 'createdAt'>): Promise<VehicleExpense> {
  let attachmentPath: string | null = null;
  if (data.attachmentUrl) {
    const ref = parseStorageRef(data.attachmentUrl);
    if (!ref || ref.bucket !== 'documents') {
      // blob:/data:/http(s) URLs are not durable: the receipt must be uploaded with storage.uploadFile(file, companyId, 'expenses')
      // first and its storage://documents/<path> reference (toStorageRef) passed here.
      throw new ServiceError('The receipt has not been uploaded to storage. Upload the file first, then save the expense.');
    }
    attachmentPath = ref.path;
  }
  let companyId = data.companyId;
  if (data.vehicleId) companyId = (await vehicleInfo(data.vehicleId)).companyId;
  const row: Row = {
    company_id: companyId,
    expense_number: null, // EXP-YYYY-0001 assigned by the database
    vehicle_id: nul(data.vehicleId),
    date: ymd(data.date),
    category: data.category,
    supplier_id: nul(data.supplierId),
    description: data.description,
    quantity: num(data.quantity) || 1,
    unit_price: money(data.unitPrice),
    tax: money(data.tax),
    total: money(data.total), // recomputed by the database as quantity x unit price + tax
    payment_method: data.paymentMethod,
    invoice_number: text(data.invoiceNumber), receipt_number: text(data.receiptNumber),
    cost_centre: text(data.costCentre), gl_account_code: text(data.glAccountCode),
    attachment_path: attachmentPath,
    notes: text(data.notes),
  };
  const created = await unwrapOne<Row>(table('expenses').insert(row).select(EXPENSE_SELECT).single());
  return rowToExpense(created);
}

// ---------------------------------------------------------------------------------------------
// vehicle financial summary (pure; moved from FleetContext)
// ---------------------------------------------------------------------------------------------
export interface VehicleFinancialCollections {
  vehicles: Vehicle[];
  maintenanceRecords: MaintenanceRecord[];
  accidents: Accident[];
  oilChanges: OilChange[];
  tyres: Tyre[];
  tyreEvents: TyreEvent[];
  expenses: VehicleExpense[];
  invoices: Invoice[];
}

export function getVehicleFinancialSummary(vehicleId: string, c: VehicleFinancialCollections): VehicleFinancialSummary {
  const vehicle = c.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) {
    return {
      purchaseValue: 0, currentBookValue: 0, accumulatedDepreciation: 0, currentMarketValue: 0,
      totalMaintenanceCost: 0, totalAccidentRepairCost: 0, totalOilChangeCost: 0, totalTyreCost: 0,
      totalInsuranceCost: 0, totalRegistrationCost: 0, otherExpenses: 0, totalLifetimeVehicleCost: 0,
      totalDistanceTravelled: 0, costPerKilometer: 0, maintenanceCostPerKm: 0, totalRevenueGenerated: 0, netVehicleProfit: 0,
    };
  }
  const purchaseVal = vehicle.purchase.purchaseValue || 0;
  const { bookValue, accumulatedDepreciation } = calculateCurrentBookValue(vehicle);
  const sum = <T,>(list: T[], pick: (x: T) => number) => list.reduce((s, x) => s + (pick(x) || 0), 0);

  const totalMnt = sum(c.maintenanceRecords.filter(m => m.vehicleId === vehicleId), m => m.totalCost);
  const totalAcc = sum(c.accidents.filter(a => a.vehicleId === vehicleId), a => a.actualRepairCost);
  const totalOil = sum(c.oilChanges.filter(o => o.vehicleId === vehicleId), o => o.totalCost);
  const totalTyre = sum(c.tyres.filter(t => t.vehicleId === vehicleId), t => t.purchaseCost)
    + sum(c.tyreEvents.filter(te => te.vehicleId === vehicleId), te => te.cost);

  const vehicleExps = c.expenses.filter(e => e.vehicleId === vehicleId);
  const totalIns = sum(vehicleExps.filter(e => e.category === 'Insurance'), e => e.total) + (vehicle.insurancePremiumAnnual || 0);
  const totalReg = sum(vehicleExps.filter(e => e.category === 'Registration'), e => e.total);
  const otherExp = sum(
    vehicleExps.filter(e => !['Insurance', 'Registration', 'Maintenance', 'Oil', 'Tyres', 'Accident'].includes(e.category)),
    e => e.total,
  );

  const operatingCost = totalMnt + totalAcc + totalOil + totalTyre + totalIns + totalReg + otherExp;
  const lifetimeCost = purchaseVal + operatingCost;
  const distance = Math.max(1, vehicle.currentMileage - (vehicle.initialOdometer || 0));

  // Revenue = approved (GL-posted) sales invoices for this vehicle, net of approved credit notes
  const totalRev = c.invoices
    .filter(i => i.invoiceType === 'Sales' && i.vehicleId === vehicleId && i.approvalStatus === 'Approved')
    .reduce((s, i) => s + (i.isCreditNote ? -Math.abs(i.grandTotal) : i.grandTotal), 0);

  return {
    purchaseValue: purchaseVal,
    currentBookValue: bookValue,
    accumulatedDepreciation,
    currentMarketValue: vehicle.currentMarketValue || bookValue,
    totalMaintenanceCost: roundToPrecision(totalMnt, 3),
    totalAccidentRepairCost: roundToPrecision(totalAcc, 3),
    totalOilChangeCost: roundToPrecision(totalOil, 3),
    totalTyreCost: roundToPrecision(totalTyre, 3),
    totalInsuranceCost: roundToPrecision(totalIns, 3),
    totalRegistrationCost: roundToPrecision(totalReg, 3),
    otherExpenses: roundToPrecision(otherExp, 3),
    totalLifetimeVehicleCost: roundToPrecision(lifetimeCost, 3),
    totalDistanceTravelled: distance,
    costPerKilometer: calculateCostPerKm(operatingCost, distance),
    maintenanceCostPerKm: calculateCostPerKm(totalMnt, distance),
    totalRevenueGenerated: roundToPrecision(totalRev, 3),
    netVehicleProfit: roundToPrecision(totalRev - operatingCost, 3),
  };
}

// ---------------------------------------------------------------------------------------------
// fetchers / affects (used by the coordinator's FleetContext to (re)load collections)
// ---------------------------------------------------------------------------------------------
export const fetchers: Fetchers = {
  companies: async () => (await fetchAll('companies', '*', { column: 'name', ascending: true })).map(rowToCompany),
  vehicles: async () => (await fetchAll('vehicles', VEHICLE_SELECT)).map(rowToVehicle),
  tyres: async () => (await fetchAll('tyres', TYRE_SELECT)).map(rowToTyre),
  tyreEvents: async () => (await fetchAll('tyre_events', TYRE_EVENT_SELECT, { column: 'date' })).map(rowToTyreEvent),
  oilChanges: async () => {
    const rows = await fetchAll('oil_changes', OIL_SELECT, { column: 'date' });
    // Only the latest service of a vehicle is "live"; older ones were superseded and must not show as overdue.
    const latest = new Map<string, Row>();
    for (const r of rows) {
      const cur = latest.get(r.vehicle_id);
      if (!cur || ymd(r.date) > ymd(cur.date) || (ymd(r.date) === ymd(cur.date) && num(r.odometer) > num(cur.odometer))) latest.set(r.vehicle_id, r);
    }
    return rows.map(r => rowToOilChange(r, latest.get(r.vehicle_id) === r ? undefined : 'Normal'));
  },
  maintenanceRecords: async () => (await fetchAll('maintenance_records', MAINTENANCE_SELECT, { column: 'maintenance_date' })).map(rowToMaintenance),
  workOrders: async () => {
    const rows = await fetchAll('work_orders', WORK_ORDER_SELECT);
    const approvals = await approvalIdsFor().catch(() => new Map<string, string>()); // approvals module may be hidden for this role
    return rows.map(r => rowToWorkOrder(r, approvals.get(r.id)));
  },
  accidents: async () => (await fetchAll('accidents', ACCIDENT_SELECT, { column: 'accident_date' })).map(rowToAccident),
  expenses: async () => (await fetchAll('expenses', EXPENSE_SELECT, { column: 'date' })).map(rowToExpense),
  timeline: async () => (await fetchAll('vehicle_timeline', '*', { column: 'date' })).map(rowToTimeline),
};

export const affects: Record<string, CollectionKey[]> = {
  addCompany: ['companies', 'chartOfAccounts'],   // companies_bootstrap seeds the new office's chart of accounts
  updateCompany: ['companies'],
  addVehicle: ['vehicles', 'timeline'],
  updateVehicle: ['vehicles', 'timeline'],
  deleteVehicle: ['vehicles', 'timeline'],
  addMaintenanceRecord: ['maintenanceRecords', 'vehicles', 'timeline', 'invoices', 'suppliers'],
  addWorkOrder: ['workOrders', 'approvalRequests', 'notifications'],   // approval request notifies approvers
  updateWorkOrderStatus: ['workOrders', 'maintenanceRecords', 'vehicles', 'timeline', 'invoices', 'suppliers'],
  addOilChange: ['oilChanges', 'vehicles', 'timeline'],
  addTyre: ['tyres'],
  updateTyre: ['tyres'],
  addTyreEvent: ['tyreEvents', 'timeline'],
  addAccident: ['accidents', 'vehicles', 'timeline'],
  updateAccident: ['accidents', 'vehicles'],
  addExpense: ['expenses', 'timeline'],
};
