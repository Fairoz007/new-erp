// "Transfer to office" for a vehicle, employee, client or supplier, with the record's transfer history.
import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { useAuth } from '../../context/AuthContext';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { OfficeTransfer, TRANSFER_AFFECTS, TRANSFER_MODULE, TransferEntity, fetchTransfers, transferToOffice } from '../../services/transfers';

const NOUN: Record<TransferEntity, string> = { vehicle: 'vehicle', employee: 'employee', client: 'client', supplier: 'supplier' };
const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  entity: TransferEntity;
  record: { id: string; label: string; officeId: string } | null;
  onClose: () => void;
  onDone?: () => void;
}

/** True when the user may start a transfer of this record (edit here, create in at least one other office). */
export const useCanTransfer = (entity: TransferEntity, officeId: string): boolean => {
  const { hasPermission } = useAuth();
  const { companies } = useFleet();
  const m = TRANSFER_MODULE[entity];
  return !!officeId && hasPermission('edit', m, officeId) && companies.some(c => c.id !== officeId && hasPermission('create', m, c.id));
};

export const TransferHistory: React.FC<{ entity: TransferEntity; recordId: string; refreshKey?: number }> = ({ entity, recordId, refreshKey }) => {
  const { companies } = useFleet();
  const [rows, setRows] = useState<OfficeTransfer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setRows(null); setError(null);
    fetchTransfers(entity, recordId).then(r => live && setRows(r)).catch(e => live && setError((e as Error).message));
    return () => { live = false; };
  }, [entity, recordId, refreshKey]);
  const name = (id: string) => companies.find(c => c.id === id)?.name ?? 'Other office';
  if (error) return <p className="text-xs text-rose-500">Could not load transfer history: {error}</p>;
  if (!rows) return <p className="text-xs text-slate-400">Loading transfer history…</p>;
  if (rows.length === 0) return <p className="text-xs text-slate-400">No office transfers yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map(t => (
        <li key={t.id} className="rounded-lg border border-slate-700 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-200">
            {name(t.fromCompanyId)} <ArrowRight className="w-3 h-3" /> {name(t.toCompanyId)}
            <span className="ml-auto font-normal text-slate-400">effective {t.effectiveDate}</span>
          </div>
          <p className="text-slate-300 mt-0.5">{t.reason}</p>
          {Object.keys(t.details).length > 0 && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {Object.entries(t.details).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`).join(' · ')}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
};

export const TransferOfficeModal: React.FC<Props> = ({ entity, record, onClose, onDone }) => {
  const { companies, reload } = useFleet();
  const { hasPermission } = useAuth();
  const { addToast } = useUI();
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => { setTo(''); setReason(''); setDate(today()); setError(null); }, [record?.id]);
  if (!record) return null;
  const m = TRANSFER_MODULE[entity];
  const targets = companies.filter(c => c.id !== record.officeId && c.active !== false && hasPermission('create', m, c.id));
  const from = companies.find(c => c.id === record.officeId)?.name ?? '—';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to) { setError('Choose the destination office.'); return; }
    if (!reason.trim()) { setError('A reason is required.'); return; }
    if (!date) { setError('Effective date is required.'); return; }
    setBusy(true); setError(null);
    try {
      await transferToOffice(entity, record.id, to, reason.trim(), date);
      await reload(TRANSFER_AFFECTS[entity]);
      addToast({ type: 'success', title: 'Transferred', message: `${record.label} moved to ${companies.find(c => c.id === to)?.name}.` });
      setRefresh(x => x + 1);
      onDone?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="md" title={`Transfer ${NOUN[entity]} to another office`}
      description={`${record.label} — currently in ${from}. The move is recorded and audited.`}>
      <form onSubmit={submit} className="space-y-4">
        {entity === 'vehicle' && (
          <p className="text-xs text-slate-400 rounded-lg border border-slate-700 p-2">
            Mounted tyres move with the vehicle, drivers of the old office are unassigned, and its fixed asset moves at book value
            through the Inter-Office Current Account (1600) in both offices. Open work orders must be closed first.
          </p>
        )}
        <Select label="Destination office" value={to} onChange={e => setTo(e.target.value)} required>
          <option value="">Select office</option>
          {targets.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {targets.length === 0 && <p className="text-xs text-rose-500">You cannot create a {NOUN[entity]} in any other office.</p>}
        <Input label="Effective date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
        <Textarea label="Reason" value={reason} onChange={e => setReason(e.target.value)} required placeholder="Why is it moving?" />
        {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={busy} disabled={busy || targets.length === 0}>Transfer</Button>
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-300 mb-1.5">History</h4>
          <TransferHistory entity={entity} recordId={record.id} refreshKey={refresh} />
        </div>
      </form>
    </Modal>
  );
};
