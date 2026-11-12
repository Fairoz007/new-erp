// Office transfers: the only way to move a vehicle, employee, client or supplier to another office.
// transfer_to_office() checks edit rights in the current office and create rights in the destination,
// moves dependent records (mounted tyres, the vehicle's fixed asset at book value through 1600
// Inter-Office Current Account) and writes an office_transfers row (audited).
import { rpcAny, supabase, unwrap } from './core';
import type { CollectionKey } from './core';

export type TransferEntity = 'vehicle' | 'employee' | 'client' | 'supplier';

export interface OfficeTransfer {
  id: string;
  entity: TransferEntity;
  recordId: string;
  recordLabel: string;
  fromCompanyId: string;
  toCompanyId: string;
  effectiveDate: string;
  reason: string;
  details: Record<string, unknown>;
  transferredBy: string | null;
  transferredAt: string;
}

type Row = Record<string, any>;
export const rowToOfficeTransfer = (r: Row): OfficeTransfer => ({
  id: r.id,
  entity: r.entity,
  recordId: r.record_id,
  recordLabel: r.record_label ?? '',
  fromCompanyId: r.from_company_id,
  toCompanyId: r.to_company_id,
  effectiveDate: r.effective_date,
  reason: r.reason,
  details: r.details ?? {},
  transferredBy: r.transferred_by ?? null,
  transferredAt: r.transferred_at,
});

export async function fetchTransfers(entity: TransferEntity, recordId: string): Promise<OfficeTransfer[]> {
  const rows = await unwrap<Row[]>((supabase as any).from('office_transfers').select('*')
    .eq('entity', entity).eq('record_id', recordId).order('transferred_at', { ascending: false }));
  return (rows ?? []).map(rowToOfficeTransfer);
}

export async function transferToOffice(entity: TransferEntity, recordId: string, toCompanyId: string, reason: string, effectiveDate: string): Promise<string> {
  return rpcAny<string>('transfer_to_office', { p_entity: entity, p_id: recordId, p_to: toCompanyId, p_reason: reason, p_effective: effectiveDate });
}

/** Collections that change when a record of this type moves office. */
export const TRANSFER_AFFECTS: Record<TransferEntity, CollectionKey[]> = {
  vehicle: ['vehicles', 'tyres', 'employees', 'fixedAssets', 'journalEntries', 'chartOfAccounts', 'timeline'],
  employee: ['employees'],
  client: ['customers'],
  supplier: ['suppliers'],
};

export const TRANSFER_MODULE: Record<TransferEntity, string> = {
  vehicle: 'vehicles', employee: 'hr', client: 'customers', supplier: 'suppliers',
};
