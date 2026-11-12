// Organization profile, universal settings and setup-wizard service (migration 20261112000200).
// Every function throws ServiceError; RLS / RPCs enforce permissions server-side.
import { supabase, unwrap, unwrapOne, rpcAny, num, ServiceError } from './core';
import { createSignedUrl, validateFile, sanitizeFileName } from './storage';

const db = supabase as any; // tables added after the generated types

// ---------------------------------------------------------------- organization
export interface Organization {
  id: string;
  legalName: string;
  tradeName: string;
  crNumber: string;
  vatNumber: string;
  taxNumber: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  logoPath: string;
  baseCurrency: string;
  currencyDecimals: number;
  fyStartMonth: number;
  timezone: string;
  language: 'en' | 'ar';
  letterhead: { header?: string; footer?: string; showLogo?: boolean };
  overridableSettings: string[];
  partyApprovalRequired: boolean;      // new clients/suppliers wait for approval
  expiryAlertDays: number;             // alert window for registration, insurance, permit, inspection, licence
  payrollHoursPerDay: number;          // overtime hourly rate = basic / (30 x hours per day) x overtime rate
  payrollOvertimeRate: number;
  gratuityInitialYears: number;        // gratuity = initial years x initial days + later years x later days, x basic / 30
  gratuityDaysInitial: number;
  gratuityDaysLater: number;
  setupStatus: 'in_progress' | 'completed';
  setupStep: number;
  setupCompletedSteps: number[];
  setupCompletedAt: string | null;
}

const toOrg = (r: any): Organization => ({
  id: r.id,
  legalName: r.legal_name ?? '',
  tradeName: r.trade_name ?? '',
  crNumber: r.cr_number ?? '',
  vatNumber: r.vat_number ?? '',
  taxNumber: r.tax_number ?? '',
  address: r.address ?? '',
  city: r.city ?? '',
  country: r.country ?? '',
  phone: r.phone ?? '',
  email: r.email ?? '',
  website: r.website ?? '',
  logoPath: r.logo_path ?? '',
  baseCurrency: r.base_currency,
  currencyDecimals: r.currency_decimals ?? 3,
  fyStartMonth: r.fy_start_month ?? 1,
  timezone: r.timezone ?? 'Asia/Muscat',
  language: r.language === 'ar' ? 'ar' : 'en',
  letterhead: r.letterhead ?? {},
  overridableSettings: r.overridable_settings ?? [],
  partyApprovalRequired: !!r.party_approval_required,
  expiryAlertDays: Number(r.expiry_alert_days ?? 30),
  payrollHoursPerDay: Number(r.payroll_hours_per_day ?? 8),
  payrollOvertimeRate: Number(r.payroll_overtime_rate ?? 1.25),
  gratuityInitialYears: Number(r.gratuity_initial_years ?? 3),
  gratuityDaysInitial: Number(r.gratuity_days_initial ?? 15),
  gratuityDaysLater: Number(r.gratuity_days_later ?? 30),
  setupStatus: r.setup_status,
  setupStep: r.setup_step ?? 1,
  setupCompletedSteps: r.setup_completed_steps ?? [],
  setupCompletedAt: r.setup_completed_at ?? null,
});

export type OrganizationInput = Omit<Organization, 'id' | 'setupStatus' | 'setupStep' | 'setupCompletedSteps' | 'setupCompletedAt'>;

const fromOrg = (o: Partial<OrganizationInput>) => {
  const t = (v?: string) => (v == null ? undefined : v.trim() || null);
  const row: Record<string, unknown> = {
    legal_name: o.legalName?.trim(), trade_name: t(o.tradeName), cr_number: t(o.crNumber), vat_number: t(o.vatNumber),
    tax_number: t(o.taxNumber), address: t(o.address), city: t(o.city), country: t(o.country), phone: t(o.phone),
    email: t(o.email), website: t(o.website), logo_path: o.logoPath === undefined ? undefined : o.logoPath || null,
    base_currency: o.baseCurrency?.trim().toUpperCase(), currency_decimals: o.currencyDecimals, fy_start_month: o.fyStartMonth,
    timezone: o.timezone, language: o.language, letterhead: o.letterhead, overridable_settings: o.overridableSettings, party_approval_required: o.partyApprovalRequired, expiry_alert_days: o.expiryAlertDays,
    payroll_hours_per_day: o.payrollHoursPerDay, payroll_overtime_rate: o.payrollOvertimeRate, gratuity_initial_years: o.gratuityInitialYears,
    gratuity_days_initial: o.gratuityDaysInitial, gratuity_days_later: o.gratuityDaysLater,
  };
  for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
  return row;
};

export async function fetchOrganization(): Promise<Organization | null> {
  const r = await unwrap<any>(db.from('organizations').select('*').maybeSingle());
  return r ? toOrg(r) : null;
}

export async function saveOrganization(id: string | null, input: Partial<OrganizationInput>): Promise<Organization> {
  const row = fromOrg(input);
  const q = id ? db.from('organizations').update(row).eq('id', id).select('*') : db.from('organizations').insert(row).select('*');
  const rows = await unwrap<any[]>(q);
  if (!rows?.length) throw new ServiceError('Permission denied for this action.');
  return toOrg(rows[0]);
}

export async function uploadOrgLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new ServiceError('Logo must be a PNG, JPG or WebP image.');
  if (file.size > 2 * 1024 * 1024) throw new ServiceError('Logo must be 2 MB or smaller.');
  validateFile(file, 'media');
  const path = `organization/logo-${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new ServiceError(`Logo upload failed: ${error.message}`);
  return path;
}
export const orgLogoSignedUrl = (path: string) => createSignedUrl('media', path, { expiresIn: 3600 });

// ---------------------------------------------------------------- setup progress
export const saveSetupProgress = (step: number, completed: number[]) =>
  rpcAny<void>('save_setup_progress', { p_step: step, p_completed: completed });
export const completeSetup = () => rpcAny<void>('complete_setup');
export interface ChecklistItem { key: string; label: string; ok: boolean; detail: string | null }
export async function fetchSetupChecklist(): Promise<ChecklistItem[]> {
  const rows = await rpcAny<any[]>('setup_checklist');
  return (rows ?? []).map(r => ({ key: r.check_key, label: r.label, ok: !!r.ok, detail: r.detail ?? null }));
}

// ---------------------------------------------------------------- master data (generic)
export interface TaxRate { id: string; name: string; rate: number; appliesTo: 'sales' | 'purchase' | 'both'; isDefault: boolean; active: boolean }
export interface PaymentTerm { id: string; name: string; days: number; isDefault: boolean; active: boolean }
export interface Unit { code: string; name: string; active: boolean }
export interface DocumentFormat { docType: string; label: string; prefix: string; includeYear: boolean; includeOfficeCode: boolean; padding: number; scope: 'office' | 'organization' }
export interface FeeSchedule { id: string; name: string; description: string; currency: string; validFrom: string; validTo: string; isDefault: boolean; active: boolean }
export interface FeeItem { id: string; scheduleId: string; code: string; name: string; unitCode: string; rate: number; taxRateId: string; vehicleTypeId: string; glAccountCode: string }
export interface VehicleType {
  id: string; name: string; category: 'Passenger' | 'Light' | 'Heavy' | 'Other'; isBus: boolean; seatCapacity: number | null;
  licenceClass: string; serviceIntervalKm: number | null; serviceIntervalMonths: number | null; isSystem: boolean; active: boolean; sortOrder: number;
}
export interface ExpenseCategory { id: string; name: string; glAccountCode: string; requiresVehicle: boolean; isSystem: boolean; active: boolean; sortOrder: number }
export interface RecurringExpense {
  id: string; companyId: string; categoryId: string; description: string; amount: number; tax: number; supplierId: string;
  vehicleId: string; paymentMethod: string; dayOfMonth: number; startDate: string; endDate: string; active: boolean;
}
export type FieldEntity = 'office' | 'vehicle' | 'client' | 'supplier' | 'employee' | 'expense';
export type FieldType = 'text' | 'number' | 'date' | 'dropdown' | 'file' | 'boolean';
export interface FieldDefinition {
  id: string; entity: FieldEntity; key: string; label: string; fieldType: FieldType; options: string[]; required: boolean;
  officeId: string; vehicleTypeId: string; helpText: string; showInList: boolean; sortOrder: number; active: boolean;
}
export interface FieldOfficeSetting { fieldId: string; officeId: string; visibility: 'shown' | 'required' | 'hidden' }

const s = (v: unknown) => (v == null ? '' : String(v));
const blankToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

export const mapTaxRate = (r: any): TaxRate => ({ id: r.id, name: r.name, rate: num(r.rate), appliesTo: r.applies_to, isDefault: !!r.is_default, active: !!r.active });
export const mapTerm = (r: any): PaymentTerm => ({ id: r.id, name: r.name, days: r.days, isDefault: !!r.is_default, active: !!r.active });
export const mapUnit = (r: any): Unit => ({ code: r.code, name: r.name, active: !!r.active });
export const mapFormat = (r: any): DocumentFormat => ({
  docType: r.doc_type, label: r.label, prefix: r.prefix, includeYear: !!r.include_year, includeOfficeCode: !!r.include_office_code, padding: r.padding, scope: r.scope,
});
export const mapSchedule = (r: any): FeeSchedule => ({
  id: r.id, name: r.name, description: s(r.description), currency: r.currency, validFrom: s(r.valid_from), validTo: s(r.valid_to), isDefault: !!r.is_default, active: !!r.active,
});
export const mapFeeItem = (r: any): FeeItem => ({
  id: r.id, scheduleId: r.schedule_id, code: r.code, name: r.name, unitCode: s(r.unit_code), rate: num(r.rate), taxRateId: s(r.tax_rate_id),
  vehicleTypeId: s(r.vehicle_type_id), glAccountCode: s(r.gl_account_code),
});
export const mapVehicleType = (r: any): VehicleType => ({
  id: r.id, name: r.name, category: r.category, isBus: !!r.is_bus, seatCapacity: r.seat_capacity ?? null, licenceClass: s(r.licence_class),
  serviceIntervalKm: r.service_interval_km ?? null, serviceIntervalMonths: r.service_interval_months ?? null, isSystem: !!r.is_system,
  active: !!r.active, sortOrder: r.sort_order ?? 100,
});
export const mapCategory = (r: any): ExpenseCategory => ({
  id: r.id, name: r.name, glAccountCode: r.gl_account_code, requiresVehicle: !!r.requires_vehicle, isSystem: !!r.is_system, active: !!r.active, sortOrder: r.sort_order ?? 100,
});
export const mapRecurring = (r: any): RecurringExpense => ({
  id: r.id, companyId: r.company_id, categoryId: r.category_id, description: r.description, amount: num(r.amount), tax: num(r.tax),
  supplierId: s(r.supplier_id), vehicleId: s(r.vehicle_id), paymentMethod: r.payment_method, dayOfMonth: r.day_of_month,
  startDate: s(r.start_date), endDate: s(r.end_date), active: !!r.active,
});
export const mapField = (r: any): FieldDefinition => ({
  id: r.id, entity: r.entity, key: r.key, label: r.label, fieldType: r.field_type, options: r.options ?? [], required: !!r.required,
  officeId: s(r.office_id), vehicleTypeId: s(r.vehicle_type_id), helpText: s(r.help_text), showInList: !!r.show_in_list,
  sortOrder: r.sort_order ?? 100, active: !!r.active,
});

interface MasterSpec<T> { table: string; key: string; order: string; map: (r: any) => T; toRow: (v: Partial<T>) => Record<string, unknown> }

const clean = (row: Record<string, unknown>) => {
  for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
  return row;
};

// HR masters (Phase 6)
export interface Department { id: string; name: string; code: string; active: boolean; sortOrder: number }
export interface Designation { id: string; name: string; departmentId: string; active: boolean; sortOrder: number }
export interface LeaveType { id: string; name: string; code: string; daysPerYear: number | null; paid: boolean; carryForwardMax: number; requiresDocument: boolean; active: boolean; sortOrder: number }
export interface PayComponent { id: string; name: string; kind: 'Allowance' | 'Deduction'; glAccountCode: string; active: boolean; sortOrder: number }
const mapDepartment = (r: any): Department => ({ id: r.id, name: r.name, code: r.code ?? '', active: r.active, sortOrder: r.sort_order });
const mapDesignation = (r: any): Designation => ({ id: r.id, name: r.name, departmentId: r.department_id ?? '', active: r.active, sortOrder: r.sort_order });
const mapLeaveType = (r: any): LeaveType => ({
  id: r.id, name: r.name, code: r.code, daysPerYear: r.days_per_year == null ? null : Number(r.days_per_year), paid: r.paid,
  carryForwardMax: Number(r.carry_forward_max ?? 0), requiresDocument: r.requires_document, active: r.active, sortOrder: r.sort_order,
});
const mapPayComponent = (r: any): PayComponent => ({ id: r.id, name: r.name, kind: r.kind, glAccountCode: r.gl_account_code ?? '', active: r.active, sortOrder: r.sort_order });

export const MASTERS = {
  taxRates: {
    table: 'tax_rates', key: 'id', order: 'sort_order', map: mapTaxRate,
    toRow: (v: Partial<TaxRate>) => clean({ name: v.name?.trim(), rate: v.rate, applies_to: v.appliesTo, is_default: v.isDefault, active: v.active }),
  } as MasterSpec<TaxRate>,
  paymentTerms: {
    table: 'payment_terms', key: 'id', order: 'days', map: mapTerm,
    toRow: (v: Partial<PaymentTerm>) => clean({ name: v.name?.trim(), days: v.days, is_default: v.isDefault, active: v.active }),
  } as MasterSpec<PaymentTerm>,
  units: {
    table: 'units', key: 'code', order: 'sort_order', map: mapUnit,
    toRow: (v: Partial<Unit>) => clean({ code: v.code?.trim().toUpperCase(), name: v.name?.trim(), active: v.active }),
  } as MasterSpec<Unit>,
  documentFormats: {
    table: 'document_formats', key: 'doc_type', order: 'sort_order', map: mapFormat,
    toRow: (v: Partial<DocumentFormat>) => clean({
      prefix: v.prefix?.trim().toUpperCase(), include_year: v.includeYear, include_office_code: v.includeOfficeCode, padding: v.padding,
    }),
  } as MasterSpec<DocumentFormat>,
  feeSchedules: {
    table: 'fee_schedules', key: 'id', order: 'name', map: mapSchedule,
    toRow: (v: Partial<FeeSchedule>) => clean({
      name: v.name?.trim(), description: v.description === undefined ? undefined : v.description.trim() || null, currency: v.currency,
      valid_from: v.validFrom === undefined ? undefined : blankToNull(v.validFrom), valid_to: v.validTo === undefined ? undefined : blankToNull(v.validTo),
      is_default: v.isDefault, active: v.active,
    }),
  } as MasterSpec<FeeSchedule>,
  feeItems: {
    table: 'fee_items', key: 'id', order: 'sort_order', map: mapFeeItem,
    toRow: (v: Partial<FeeItem>) => clean({
      schedule_id: v.scheduleId, code: v.code?.trim().toUpperCase(), name: v.name?.trim(), unit_code: v.unitCode === undefined ? undefined : blankToNull(v.unitCode),
      rate: v.rate, tax_rate_id: v.taxRateId === undefined ? undefined : blankToNull(v.taxRateId),
      vehicle_type_id: v.vehicleTypeId === undefined ? undefined : blankToNull(v.vehicleTypeId),
      gl_account_code: v.glAccountCode === undefined ? undefined : blankToNull(v.glAccountCode?.trim()),
    }),
  } as MasterSpec<FeeItem>,
  vehicleTypes: {
    table: 'vehicle_types', key: 'id', order: 'sort_order', map: mapVehicleType,
    toRow: (v: Partial<VehicleType>) => clean({
      name: v.name?.trim(), category: v.category, is_bus: v.isBus, seat_capacity: v.seatCapacity, licence_class: v.licenceClass === undefined ? undefined : v.licenceClass.trim() || null,
      service_interval_km: v.serviceIntervalKm, service_interval_months: v.serviceIntervalMonths, active: v.active, sort_order: v.sortOrder,
    }),
  } as MasterSpec<VehicleType>,
  expenseCategories: {
    table: 'expense_categories', key: 'id', order: 'sort_order', map: mapCategory,
    toRow: (v: Partial<ExpenseCategory>) => clean({
      name: v.name?.trim(), gl_account_code: v.glAccountCode?.trim(), requires_vehicle: v.requiresVehicle, active: v.active, sort_order: v.sortOrder,
    }),
  } as MasterSpec<ExpenseCategory>,
  recurringExpenses: {
    table: 'recurring_expenses', key: 'id', order: 'day_of_month', map: mapRecurring,
    toRow: (v: Partial<RecurringExpense>) => clean({
      company_id: v.companyId, category_id: v.categoryId, description: v.description?.trim(), amount: v.amount, tax: v.tax,
      supplier_id: v.supplierId === undefined ? undefined : blankToNull(v.supplierId), vehicle_id: v.vehicleId === undefined ? undefined : blankToNull(v.vehicleId),
      payment_method: v.paymentMethod, day_of_month: v.dayOfMonth, start_date: v.startDate,
      end_date: v.endDate === undefined ? undefined : blankToNull(v.endDate), active: v.active,
    }),
  } as MasterSpec<RecurringExpense>,
  departments: {
    table: 'departments', key: 'id', order: 'sort_order', map: mapDepartment,
    toRow: (v: Partial<Department>) => clean({ name: v.name?.trim(), code: v.code === undefined ? undefined : v.code.trim() || null, active: v.active, sort_order: v.sortOrder }),
  } as MasterSpec<Department>,
  designations: {
    table: 'designations', key: 'id', order: 'sort_order', map: mapDesignation,
    toRow: (v: Partial<Designation>) => clean({ name: v.name?.trim(), department_id: v.departmentId === undefined ? undefined : blankToNull(v.departmentId), active: v.active, sort_order: v.sortOrder }),
  } as MasterSpec<Designation>,
  leaveTypes: {
    table: 'leave_types', key: 'id', order: 'sort_order', map: mapLeaveType,
    toRow: (v: Partial<LeaveType>) => clean({
      name: v.name?.trim(), code: v.code?.trim().toUpperCase(), days_per_year: v.daysPerYear, paid: v.paid, carry_forward_max: v.carryForwardMax,
      requires_document: v.requiresDocument, active: v.active, sort_order: v.sortOrder,
    }),
  } as MasterSpec<LeaveType>,
  payComponents: {
    table: 'pay_components', key: 'id', order: 'sort_order', map: mapPayComponent,
    toRow: (v: Partial<PayComponent>) => clean({
      name: v.name?.trim(), kind: v.kind, gl_account_code: v.glAccountCode === undefined ? undefined : blankToNull(v.glAccountCode?.trim()),
      active: v.active, sort_order: v.sortOrder,
    }),
  } as MasterSpec<PayComponent>,
  fieldDefinitions: {
    table: 'field_definitions', key: 'id', order: 'sort_order', map: mapField,
    toRow: (v: Partial<FieldDefinition>) => clean({
      entity: v.entity, key: v.key?.trim(), label: v.label?.trim(), field_type: v.fieldType, options: v.options, required: v.required,
      office_id: v.officeId === undefined ? undefined : blankToNull(v.officeId), vehicle_type_id: v.vehicleTypeId === undefined ? undefined : blankToNull(v.vehicleTypeId),
      help_text: v.helpText === undefined ? undefined : v.helpText.trim() || null, show_in_list: v.showInList, sort_order: v.sortOrder, active: v.active,
    }),
  } as MasterSpec<FieldDefinition>,
};

export type MasterName = keyof typeof MASTERS;
type MasterType<K extends MasterName> = (typeof MASTERS)[K] extends MasterSpec<infer T> ? T : never;

/** Fired after field definitions or per-office visibility change, so open forms and lists refresh. */
export const fieldConfigEvents = new EventTarget();
/** Fired after any master list changes (detail = master name). */
export const masterEvents = new EventTarget();
const fieldConfigChanged = (name: string) => {
  masterEvents.dispatchEvent(new CustomEvent('change', { detail: name }));
  if (name === 'fieldDefinitions') fieldConfigEvents.dispatchEvent(new Event('change'));
};

export async function listMaster<K extends MasterName>(name: K): Promise<MasterType<K>[]> {
  const spec = MASTERS[name] as unknown as MasterSpec<MasterType<K>>;
  const rows = await unwrap<any[]>(db.from(spec.table).select('*').order(spec.order));
  return rows.map(spec.map);
}

export async function saveMaster<K extends MasterName>(name: K, key: string | null, value: Partial<MasterType<K>>): Promise<MasterType<K>> {
  const spec = MASTERS[name] as unknown as MasterSpec<MasterType<K>>;
  const row = spec.toRow(value);
  const q = key ? db.from(spec.table).update(row).eq(spec.key, key).select('*') : db.from(spec.table).insert(row).select('*');
  const rows = await unwrap<any[]>(q);
  if (!rows?.length) throw new ServiceError('Permission denied for this action.');
  fieldConfigChanged(name);
  return spec.map(rows[0]);
}

export async function deleteMaster(name: MasterName, key: string): Promise<void> {
  const spec = MASTERS[name];
  const rows = await unwrap<any[]>(db.from(spec.table).delete().eq(spec.key, key).select(spec.key));
  if (!rows?.length) throw new ServiceError('Permission denied for this action.');
  fieldConfigChanged(name);
}

// Sets one default row (tax rate, payment term, fee schedule): clear the old default first (unique index).
export async function setDefault(name: 'taxRates' | 'paymentTerms' | 'feeSchedules', id: string): Promise<void> {
  const spec = MASTERS[name];
  await unwrap(db.from(spec.table).update({ is_default: false }).eq('is_default', true).neq('id', id));
  await unwrapOne(db.from(spec.table).update({ is_default: true }).eq('id', id).select('id').maybeSingle());
}

export async function listFieldOfficeSettings(): Promise<FieldOfficeSetting[]> {
  const rows = await unwrap<any[]>(db.from('field_office_settings').select('*'));
  return rows.map(r => ({ fieldId: r.field_id, officeId: r.office_id, visibility: r.visibility }));
}
export async function setFieldOfficeVisibility(fieldId: string, officeId: string, visibility: FieldOfficeSetting['visibility'] | null): Promise<void> {
  if (visibility === null) {
    await unwrap(db.from('field_office_settings').delete().eq('field_id', fieldId).eq('office_id', officeId));
  } else {
    await unwrap(db.from('field_office_settings').upsert({ field_id: fieldId, office_id: officeId, visibility }, { onConflict: 'field_id,office_id' }));
  }
  fieldConfigChanged('fieldDefinitions');
}

/** Records holding a value for a field (Field Builder shows it before type changes / deletes). */
export const customFieldUsage = (fieldId: string) => rpcAny<number>('custom_field_usage', { p_field: fieldId });

export const previewDocNumber = (docType: string, companyId: string | null) =>
  rpcAny<string>('preview_doc_number', { p_type: docType, p_company: companyId });

// ---------------------------------------------------------------- opening balances
export const postOpeningPartyBalance = (a: { companyId: string; partyType: 'Customer' | 'Supplier'; partyId: string; amount: number; date: string; dueDate?: string; reference?: string }) =>
  rpcAny<string>('post_opening_party_balance', {
    p_company: a.companyId, p_party_type: a.partyType, p_party: a.partyId, p_amount: a.amount, p_date: a.date,
    p_due_date: a.dueDate || null, p_reference: a.reference || null,
  });
export const postOpeningFixedAsset = (companyId: string, asset: Record<string, unknown>, date: string) =>
  rpcAny<string>('post_opening_fixed_asset', { p_company: companyId, p_asset: asset, p_date: date });

export async function createBankAccount(a: {
  companyId: string; bankName: string; accountName: string; accountNumber: string; iban?: string; swiftCode?: string; branch?: string;
  accountType: string; currency: string; glAccountCode: string; openingBalance: number; openingDate: string;
}): Promise<string> {
  const r = await unwrapOne<any>(db.from('bank_accounts').insert({
    company_id: a.companyId, bank_name: a.bankName.trim(), account_name: a.accountName.trim(), account_number: a.accountNumber.trim(),
    iban: a.iban?.trim() || null, swift_code: a.swiftCode?.trim() || null, branch: a.branch?.trim() || null, account_type: a.accountType,
    currency: a.currency, gl_account_code: a.glAccountCode, opening_balance: a.openingBalance, opening_date: a.openingDate || null,
  }).select('id').single());
  return r.id;
}

export interface AccountTemplate { code: string; name: string; category: string }
export async function listAccountTemplates(): Promise<AccountTemplate[]> {
  const rows = await unwrap<any[]>(db.from('account_templates').select('code, name, category').eq('active', true).order('code'));
  return rows.map(r => ({ code: r.code, name: r.name, category: r.category }));
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
