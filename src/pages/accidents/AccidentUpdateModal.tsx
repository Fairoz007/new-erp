import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Accident, AccidentStatus } from '../../types/operations';

const STATUSES: AccidentStatus[] = ['Reported', 'Under Investigation', 'Insurance Processing', 'Repair Approved', 'Under Repair', 'Completed', 'Closed'];

interface Props {
  accident: Accident;
  onClose: () => void;
  onSubmit: (updates: Partial<Accident>) => Promise<void>; // must throw on failure
}

/** Move a claim through its lifecycle and record repair cost / recoveries. The net company cost is computed by the database. */
export const AccidentUpdateModal: React.FC<Props> = ({ accident, onClose, onSubmit }) => {
  const [form, setForm] = useState<Accident>(accident);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setForm(accident); setError(''); }, [accident]);

  const set = <K extends keyof Accident>(k: K, v: Accident[K]) => setForm(f => ({ ...f, [k]: v }));
  const num = (k: keyof Accident) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value === '' ? 0 : Number(e.target.value) }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        status: form.status, actualRepairCost: form.actualRepairCost, estimatedRepairCost: form.estimatedRepairCost,
        insuranceContribution: form.insuranceContribution, thirdPartyContribution: form.thirdPartyContribution,
        companyContribution: form.companyContribution, insuranceClaimNumber: form.insuranceClaimNumber,
        policeReportNumber: form.policeReportNumber, workshop: form.workshop,
        repairStartDate: form.repairStartDate, repairCompletionDate: form.repairCompletionDate,
        vehicleDowntimeDays: form.vehicleDowntimeDays, notes: form.notes,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={saving ? () => undefined : onClose}
      title={`Update Claim ${accident.accidentNumber}`}
      description={`${accident.vehiclePlate} - ${accident.accidentType}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" form="accident-update-form" isLoading={saving} disabled={saving}>Save</Button>
        </>
      }
    >
      <form id="accident-update-form" onSubmit={submit} className="space-y-4">
        {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <p className="text-xs text-slate-400">Closing or completing a claim releases the vehicle from Accident status when no other claim is open.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Status" value={form.status} onChange={e => set('status', e.target.value as AccidentStatus)} options={STATUSES.map(s => ({ value: s, label: s }))} />
          <Input label="Workshop" value={form.workshop} onChange={e => set('workshop', e.target.value)} />
          <Input label="Estimated repair cost" type="number" min={0} step="0.001" value={form.estimatedRepairCost} onChange={num('estimatedRepairCost')} />
          <Input label="Actual repair cost" type="number" min={0} step="0.001" value={form.actualRepairCost} onChange={num('actualRepairCost')} />
          <Input label="Insurance contribution" type="number" min={0} step="0.001" value={form.insuranceContribution} onChange={num('insuranceContribution')} />
          <Input label="Third-party contribution" type="number" min={0} step="0.001" value={form.thirdPartyContribution} onChange={num('thirdPartyContribution')} />
          <Input label="Insurance claim no." value={form.insuranceClaimNumber} onChange={e => set('insuranceClaimNumber', e.target.value)} />
          <Input label="Police report no." value={form.policeReportNumber} onChange={e => set('policeReportNumber', e.target.value)} />
          <Input label="Repair start" type="date" value={form.repairStartDate ?? ''} onChange={e => set('repairStartDate', e.target.value)} />
          <Input label="Repair completion" type="date" value={form.repairCompletionDate ?? ''} onChange={e => set('repairCompletionDate', e.target.value)} />
          <Input label="Downtime (days)" type="number" min={0} value={form.vehicleDowntimeDays} onChange={num('vehicleDowntimeDays')} />
        </div>
        <Textarea label="Notes" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
      </form>
    </Modal>
  );
};
