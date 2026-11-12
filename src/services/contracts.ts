// Client / supplier contracts and their rate cards (contracts, contract_rates).
// RLS: module "contracts" per office; only Draft contracts can be deleted; the number (CON-YYYY-###)
// and currency are assigned by the database. contract_rate() picks the rate for an invoice line.
import { ServiceError, nul, num, rpcAny, supabase, unwrap, unwrapOne, ymd } from './core';
import { todayYmd } from '../utils/date';

type Row = Record<string, any>;
const table = (name: string): any => (supabase as any).from(name);

export type ContractStatus = 'Draft' | 'Active' | 'Suspended' | 'Terminated';
export type BillingCycle = 'One-off' | 'Monthly' | 'Quarterly' | 'Annual' | 'Per trip';
export const CONTRACT_STATUSES: ContractStatus[] = ['Draft', 'Active', 'Suspended', 'Terminated'];
export const BILLING_CYCLES: BillingCycle[] = ['One-off', 'Monthly', 'Quarterly', 'Annual', 'Per trip'];

export interface ContractRate {
  id?: string;
  description: string;
  vehicleTypeId: string;
  unitCode: string;
  rate: number;
  taxRateId: string;
  minQuantity: number;
  sortOrder: number;
}

export interface Contract {
  id: string;
  companyId: string;
  contractNumber: string;
  partyType: 'Customer' | 'Supplier';
  partyId: string;
  title: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  contractValue: number | null;
  currency: string;
  billingCycle: BillingCycle;
  paymentTermsDays: number;
  autoRenew: boolean;
  noticeDays: number;
  documentPath: string;
  notes: string;
  rates: ContractRate[];
  createdAt: string;
}

export type ContractDraft = Omit<Contract, 'id' | 'contractNumber' | 'currency' | 'createdAt' | 'rates'> & { id?: string };

export const rowToContractRate = (r: Row): ContractRate => ({
  id: r.id, description: r.description, vehicleTypeId: r.vehicle_type_id ?? '', unitCode: r.unit_code ?? '', rate: num(r.rate),
  taxRateId: r.tax_rate_id ?? '', minQuantity: num(r.min_quantity), sortOrder: r.sort_order ?? 100,
});

export const rowToContract = (r: Row): Contract => ({
  id: r.id,
  companyId: r.company_id,
  contractNumber: r.contract_number ?? '',
  partyType: r.party_type,
  partyId: r.customer_id ?? r.supplier_id ?? '',
  title: r.title,
  startDate: ymd(r.start_date),
  endDate: ymd(r.end_date),
  status: r.status,
  contractValue: r.contract_value == null ? null : num(r.contract_value),
  currency: r.currency,
  billingCycle: r.billing_cycle,
  paymentTermsDays: r.payment_terms_days ?? 30,
  autoRenew: !!r.auto_renew,
  noticeDays: r.notice_days ?? 30,
  documentPath: r.document_path ?? '',
  notes: r.notes ?? '',
  rates: ((r.rates ?? []) as Row[]).map(rowToContractRate).sort((a, b) => a.sortOrder - b.sortOrder),
  createdAt: r.created_at,
});

const CONTRACT_SELECT = '*, rates:contract_rates(*)';

/** "Expired" is derived: an Active contract past its end date. */
export const effectiveContractStatus = (c: Pick<Contract, 'status' | 'endDate'>, today = todayYmd()) =>
  c.status === 'Active' && c.endDate && c.endDate < today ? 'Expired' : c.status;

export async function fetchContracts(partyType: 'Customer' | 'Supplier', partyId: string): Promise<Contract[]> {
  const q = table('contracts').select(CONTRACT_SELECT);
  const filtered = partyType === 'Customer' ? q.eq('customer_id', partyId) : q.eq('supplier_id', partyId);
  const rows = await unwrap<Row[]>(filtered.order('start_date', { ascending: false }));
  return (rows ?? []).map(rowToContract);
}

const contractToRow = (c: ContractDraft): Row => ({
  company_id: c.companyId,
  party_type: c.partyType,
  customer_id: c.partyType === 'Customer' ? c.partyId : null,
  supplier_id: c.partyType === 'Supplier' ? c.partyId : null,
  title: c.title.trim(),
  start_date: c.startDate,
  end_date: nul(c.endDate),
  status: c.status,
  contract_value: c.contractValue == null || Number.isNaN(c.contractValue) ? null : c.contractValue,
  billing_cycle: c.billingCycle,
  payment_terms_days: c.paymentTermsDays,
  auto_renew: c.autoRenew,
  notice_days: c.noticeDays,
  document_path: nul(c.documentPath),
  notes: nul(c.notes),
});

/** Saves the contract and replaces its rate lines. */
export async function saveContract(c: ContractDraft, rates: ContractRate[]): Promise<Contract> {
  if (!c.title.trim()) throw new ServiceError('Contract title is required.');
  if (!c.companyId) throw new ServiceError('Choose the office for this contract.');
  if (!c.startDate) throw new ServiceError('Start date is required.');
  if (c.endDate && c.endDate < c.startDate) throw new ServiceError('End date cannot be before the start date.');
  const bad = rates.find(r => !r.description.trim() || !(r.rate >= 0));
  if (bad) throw new ServiceError('Every rate line needs a description and a rate of zero or more.');
  const row = contractToRow(c);
  let id = c.id;
  if (id) {
    // office, party and number are fixed once created (the database also enforces this)
    await unwrapOne(table('contracts').update({
      title: row.title, start_date: row.start_date, end_date: row.end_date, status: row.status, contract_value: row.contract_value,
      billing_cycle: row.billing_cycle, payment_terms_days: row.payment_terms_days, auto_renew: row.auto_renew,
      notice_days: row.notice_days, document_path: row.document_path, notes: row.notes,
    }).eq('id', id).select('id').maybeSingle());
  } else {
    id = (await unwrapOne<Row>(table('contracts').insert(row).select('id').single())).id;
  }
  const keep = rates.filter(r => r.id).map(r => r.id as string);
  let del = table('contract_rates').delete().eq('contract_id', id);
  if (keep.length) del = del.not('id', 'in', `(${keep.join(',')})`);
  await unwrap(del);
  const line = (r: ContractRate, i: number) => ({
    contract_id: id, description: r.description.trim(), vehicle_type_id: nul(r.vehicleTypeId), unit_code: nul(r.unitCode),
    rate: r.rate, tax_rate_id: nul(r.taxRateId), min_quantity: r.minQuantity || 0, sort_order: (i + 1) * 10,
  });
  // existing lines are updated in place (keeps their audit history), new ones inserted
  await Promise.all(rates.map((r, i) => (r.id ? unwrap(table('contract_rates').update(line(r, i)).eq('id', r.id)) : null)));
  const fresh = rates.map((r, i) => ({ r, i })).filter(x => !x.r.id);
  if (fresh.length) {
    await unwrap(table('contract_rates').insert(fresh.map(x => ({
      contract_id: id, description: x.r.description.trim(), vehicle_type_id: nul(x.r.vehicleTypeId), unit_code: nul(x.r.unitCode),
      rate: x.r.rate, tax_rate_id: nul(x.r.taxRateId), min_quantity: x.r.minQuantity || 0, sort_order: (x.i + 1) * 10,
    }))));
  }
  const out = await unwrapOne<Row>(table('contracts').select(CONTRACT_SELECT).eq('id', id).maybeSingle());
  return rowToContract(out);
}

export async function deleteContract(id: string): Promise<void> {
  const rows = await unwrap<Row[]>(table('contracts').delete().eq('id', id).select('id'));
  if (!rows?.length) throw new ServiceError('Only draft contracts can be deleted (end or terminate an active one).');
}

export interface ApplicableRate { source: 'contract' | 'fee_schedule'; contractId: string | null; contractNumber: string | null; description: string; rate: number; taxRateId: string | null; unitCode: string | null }
export async function contractRate(companyId: string, customerId: string, date: string, vehicleTypeId?: string, unitCode?: string): Promise<ApplicableRate | null> {
  const rows = await rpcAny<Row[]>('contract_rate', { p_company: companyId, p_customer: customerId, p_date: date, p_vehicle_type: vehicleTypeId ?? null, p_unit: unitCode ?? null });
  const r = rows?.[0];
  return r ? { source: r.source, contractId: r.contract_id, contractNumber: r.contract_number, description: r.description, rate: num(r.rate), taxRateId: r.tax_rate_id, unitCode: r.unit_code } : null;
}

/** Client contracts a vehicle of this office can be put on (Draft or Active). */
export async function fetchAssignableContracts(companyId: string): Promise<Pick<Contract, 'id' | 'contractNumber' | 'title' | 'status' | 'partyId'>[]> {
  const rows = await unwrap<Row[]>(table('contracts').select('id, contract_number, title, status, customer_id')
    .eq('company_id', companyId).eq('party_type', 'Customer').in('status', ['Draft', 'Active']).order('contract_number'));
  return (rows ?? []).map(r => ({ id: r.id, contractNumber: r.contract_number ?? '', title: r.title, status: r.status, partyId: r.customer_id }));
}
