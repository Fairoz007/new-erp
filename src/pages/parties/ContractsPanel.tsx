// Contracts of one client/supplier with their rate cards. Office-scoped (module "contracts").
import React, { useCallback, useEffect, useState } from 'react';
import { FileSignature, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate, todayYmd } from '../../utils/date';
import { useVehicleTypes } from '../../hooks/useVehicleTypes';
import { useMaster } from '../setup/shared';
import { partyAvailableIn } from '../../services/finance';
import { createSignedUrl, uploadFile } from '../../services/storage';
import {
  BILLING_CYCLES, CONTRACT_STATUSES, Contract, ContractDraft, ContractRate, deleteContract, effectiveContractStatus, fetchContracts, saveContract,
} from '../../services/contracts';
import type { Customer, Supplier } from '../../types/operations';

const STATUS_VARIANT: Record<string, 'slate' | 'emerald' | 'amber' | 'rose'> = { Draft: 'slate', Active: 'emerald', Suspended: 'amber', Terminated: 'rose', Expired: 'rose' };

interface Props { partyType: 'Customer' | 'Supplier'; party: Customer | Supplier }

export const ContractsPanel: React.FC<Props> = ({ partyType, party }) => {
  const { companies, selectedCompanyId } = useFleet();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Contract | 'new' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setRows(await fetchContracts(partyType, party.id)); } catch (e) { setError((e as Error).message); }
  }, [partyType, party.id]);
  useEffect(() => { void load(); }, [load]);

  // offices where this party may be used and the user may create contracts
  const createOffices = companies.filter(c => partyAvailableIn(party, c.id) && hasPermission('create', 'contracts', c.id));
  const visible = (rows ?? []).filter(c => selectedCompanyId === 'all' || c.companyId === selectedCompanyId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">Agreed rates apply to new invoice lines for this {partyType === 'Customer' ? 'client' : 'supplier'} while the contract is active.</p>
        {createOffices.length > 0 && party.registration.status === 'Approved' && (
          <Button size="xs" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setEditing('new')}>New contract</Button>
        )}
      </div>
      {error && <p className="text-xs text-rose-500">Could not load contracts: {error} <button className="underline" onClick={() => void load()}>Retry</button></p>}
      {!rows && !error && <p className="text-xs text-slate-400">Loading contracts…</p>}
      {rows && visible.length === 0 && <p className="text-xs text-slate-400">No contracts{selectedCompanyId !== 'all' ? ' in this office' : ''}.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {visible.map(c => {
          const st = effectiveContractStatus(c);
          return (
            <button key={c.id} type="button" onClick={() => setEditing(c)}
              className="text-left rounded-2xl border border-slate-700 bg-white p-4 space-y-1.5 hover:border-[#086343]/50">
              <div className="flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-[#086343]" />
                <span className="font-mono text-xs font-semibold text-slate-100">{c.contractNumber}</span>
                <Badge variant={STATUS_VARIANT[st]}>{st}</Badge>
                <span className="ml-auto text-[11px] text-slate-400">{companies.find(o => o.id === c.companyId)?.code}</span>
              </div>
              <p className="text-sm font-semibold text-slate-100">{c.title}</p>
              <p className="text-[11px] text-slate-400">
                {formatDate(c.startDate)} – {c.endDate ? formatDate(c.endDate) : 'open-ended'} · {c.billingCycle}
                {c.contractValue != null && ` · ${formatCurrency(c.contractValue, c.currency)}`} · {c.rates.length} rate{c.rates.length === 1 ? '' : 's'}
              </p>
            </button>
          );
        })}
      </div>
      {editing && (
        <ContractModal partyType={partyType} party={party} contract={editing === 'new' ? null : editing} createOffices={createOffices.map(c => c.id)}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}
    </div>
  );
};

const blankRate = (): ContractRate => ({ description: '', vehicleTypeId: '', unitCode: '', rate: 0, taxRateId: '', minQuantity: 0, sortOrder: 100 });

const ContractModal: React.FC<{
  partyType: 'Customer' | 'Supplier'; party: Customer | Supplier; contract: Contract | null; createOffices: string[];
  onClose: () => void; onSaved: () => void;
}> = ({ partyType, party, contract, createOffices, onClose, onSaved }) => {
  const { companies, selectedCompanyId } = useFleet();
  const { hasPermission } = useAuth();
  const { addToast } = useUI();
  const { types } = useVehicleTypes();
  const units = useMaster('units').rows as { code: string; name: string; active: boolean }[];
  const taxes = useMaster('taxRates').rows as { id: string; name: string; rate: number; active: boolean }[];
  const officeDefault = contract?.companyId ?? (createOffices.includes(selectedCompanyId) ? selectedCompanyId : createOffices[0] ?? '');
  const [form, setForm] = useState<ContractDraft>(() => contract ? { ...contract } : {
    companyId: officeDefault, partyType, partyId: party.id, title: '', startDate: todayYmd(), endDate: '',
    status: 'Draft', contractValue: null, billingCycle: 'Monthly', paymentTermsDays: party.paymentTermsDays || 30, autoRenew: false,
    noticeDays: 30, documentPath: '', notes: '',
  });
  const [rates, setRates] = useState<ContractRate[]>(contract ? contract.rates.map(r => ({ ...r })) : [blankRate()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = contract ? !hasPermission('edit', 'contracts', contract.companyId) : false;
  const set = <K extends keyof ContractDraft>(k: K, v: ContractDraft[K]) => setForm(f => ({ ...f, [k]: v }));
  const setRate = (i: number, patch: Partial<ContractRate>) => setRates(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const upload = async (file?: File) => {
    if (!file || !form.companyId) return;
    setBusy(true);
    try {
      const stored = await uploadFile(file, form.companyId, 'documents');
      set('documentPath', stored.path);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await saveContract(form, rates.filter(r => r.description.trim() || r.rate));
      addToast({ type: 'success', title: contract ? 'Contract saved' : 'Contract created', message: form.title });
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!contract || !window.confirm('Delete this draft contract? This cannot be undone.')) return;
    setBusy(true);
    try { await deleteContract(contract.id); onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const cell = 'h-8 w-full rounded-lg border border-slate-700 bg-white px-2 text-xs disabled:opacity-60';

  return (
    <Modal isOpen onClose={onClose} size="2xl" title={contract ? `${contract.contractNumber}: ${contract.title}` : `New contract for ${party.name}`}
      description={contract ? `Currency ${contract.currency}` : 'The number and currency are assigned when you save.'}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Office" value={form.companyId} disabled={!!contract || readOnly} onChange={e => set('companyId', e.target.value)} required>
            {(contract ? companies.filter(c => c.id === contract.companyId) : companies.filter(c => createOffices.includes(c.id))).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Title" className="sm:col-span-2" value={form.title} disabled={readOnly} onChange={e => set('title', e.target.value)} required />
          <Input label="Start date" type="date" value={form.startDate} disabled={readOnly} onChange={e => set('startDate', e.target.value)} required />
          <Input label="End date" type="date" value={form.endDate} disabled={readOnly} onChange={e => set('endDate', e.target.value)} hint="Leave empty for open-ended" />
          <Select label="Status" value={form.status} disabled={readOnly} onChange={e => set('status', e.target.value as ContractDraft['status'])}>
            {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select label="Billing" value={form.billingCycle} disabled={readOnly} onChange={e => set('billingCycle', e.target.value as ContractDraft['billingCycle'])}>
            {BILLING_CYCLES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input label="Contract value" type="number" step="0.001" min="0" disabled={readOnly} value={form.contractValue ?? ''}
            onChange={e => set('contractValue', e.target.value === '' ? null : Number(e.target.value))} hint="Optional" />
          <Input label="Payment terms (days)" type="number" min="0" max="365" disabled={readOnly} value={form.paymentTermsDays}
            onChange={e => set('paymentTermsDays', Number(e.target.value))} />
          <Input label="Notice period (days)" type="number" min="0" max="365" disabled={readOnly} value={form.noticeDays}
            onChange={e => set('noticeDays', Number(e.target.value))} />
          <label className="flex items-center gap-2 text-xs text-slate-100 pt-6">
            <input type="checkbox" className="w-4 h-4 accent-[#086343]" checked={form.autoRenew} disabled={readOnly} onChange={e => set('autoRenew', e.target.checked)} /> Renews automatically
          </label>
          <div className="sm:col-span-2 flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-100">Signed copy</span>
            <div className="flex items-center gap-3">
              {!readOnly && <input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy || !form.companyId} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />}
              {form.documentPath && (
                <button type="button" className="text-[#086343] font-semibold hover:underline"
                  onClick={() => void createSignedUrl('documents', form.documentPath).then(u => window.open(u, '_blank', 'noopener')).catch(e => setError((e as Error).message))}>
                  View document
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Rate card</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="text-slate-400"><tr>
                <th scope="col" className="text-left py-1">Service</th><th scope="col" className="text-left">Vehicle type</th><th scope="col" className="text-left">Unit</th>
                <th scope="col" className="text-left">Rate</th><th scope="col" className="text-left">Tax</th><th scope="col" className="text-left">Min qty</th><th scope="col"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {rates.map((r, i) => (
                  <tr key={r.id ?? `n${i}`}>
                    <td className="pr-1 py-1"><input aria-label="Service" className={cell} value={r.description} disabled={readOnly} onChange={e => setRate(i, { description: e.target.value })} placeholder="e.g. School run per trip" /></td>
                    <td className="pr-1"><select aria-label="Vehicle type" className={cell} value={r.vehicleTypeId} disabled={readOnly} onChange={e => setRate(i, { vehicleTypeId: e.target.value })}>
                      <option value="">Any</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
                    <td className="pr-1"><select aria-label="Unit" className={cell} value={r.unitCode} disabled={readOnly} onChange={e => setRate(i, { unitCode: e.target.value })}>
                      <option value="">—</option>{units.filter(u => u.active || u.code === r.unitCode).map(u => <option key={u.code} value={u.code}>{u.name}</option>)}</select></td>
                    <td className="pr-1"><input aria-label="Rate" className={cell} type="number" step="0.001" min="0" value={r.rate} disabled={readOnly} onChange={e => setRate(i, { rate: Number(e.target.value) })} /></td>
                    <td className="pr-1"><select aria-label="Tax" className={cell} value={r.taxRateId} disabled={readOnly} onChange={e => setRate(i, { taxRateId: e.target.value })}>
                      <option value="">None</option>{taxes.filter(t => t.active || t.id === r.taxRateId).map(t => <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>)}</select></td>
                    <td className="pr-1"><input aria-label="Minimum quantity" className={cell} type="number" step="0.001" min="0" value={r.minQuantity} disabled={readOnly} onChange={e => setRate(i, { minQuantity: Number(e.target.value) })} /></td>
                    <td>{!readOnly && <button type="button" aria-label="Remove rate" className="p-1 inline-flex items-center justify-center text-slate-400 hover:text-rose-500" onClick={() => setRates(rs => rs.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && <Button size="xs" variant="outline" leftIcon={<Plus className="w-3 h-3" />} onClick={() => setRates(rs => [...rs, blankRate()])}>Add rate</Button>}
        </div>

        <Textarea label="Notes" value={form.notes} disabled={readOnly} onChange={e => set('notes', e.target.value)} />
        {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          <div>{contract?.status === 'Draft' && hasPermission('delete', 'contracts', contract.companyId) && <Button variant="danger" size="sm" onClick={() => void remove()} disabled={busy}>Delete draft</Button>}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
            {!readOnly && <Button isLoading={busy} onClick={() => void submit()}>Save</Button>}
          </div>
        </div>
      </div>
    </Modal>
  );
};
