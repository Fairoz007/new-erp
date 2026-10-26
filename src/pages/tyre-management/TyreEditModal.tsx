import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Tyre, TyrePosition, TyreStatus } from '../../types/vehicle';

const STATUSES: TyreStatus[] = ['Good', 'Fair', 'Due Soon', 'Critical', 'Replaced', 'Scrapped'];
const POSITIONS: TyrePosition[] = ['Front Left', 'Front Right', 'Rear Left', 'Rear Right', 'Spare'];
const opts = (l: string[]) => l.map(v => ({ value: v, label: v }));

interface Props {
  tyre: Tyre;
  onClose: () => void;
  onSubmit: (updates: Partial<Tyre>) => Promise<void>; // must throw on failure
}

export const TyreEditModal: React.FC<Props> = ({ tyre, onClose, onSubmit }) => {
  const [form, setForm] = useState<Tyre>(tyre);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setForm(tyre); setError(''); }, [tyre]);

  const set = <K extends keyof Tyre>(k: K, v: Tyre[K]) => setForm(f => ({ ...f, [k]: v }));
  const num = (k: keyof Tyre) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value === '' ? 0 : Number(e.target.value) }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.brand.trim()) { setError('Brand is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        brand: form.brand, model: form.model, size: form.size, serialNumber: form.serialNumber, position: form.position,
        treadDepthMm: form.treadDepthMm, currentMileage: form.currentMileage, status: form.status,
        replacementDate: form.replacementDate, replacementMileage: form.replacementMileage, notes: form.notes,
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
      title="Update Tyre"
      description={`${tyre.brand} ${tyre.model} - ${tyre.position}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" form="tyre-edit-form" isLoading={saving} disabled={saving}>Save</Button>
        </>
      }
    >
      <form id="tyre-edit-form" onSubmit={submit} className="space-y-4">
        {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Brand" required value={form.brand} onChange={e => set('brand', e.target.value)} />
          <Input label="Model" value={form.model} onChange={e => set('model', e.target.value)} />
          <Input label="Size" value={form.size} onChange={e => set('size', e.target.value)} />
          <Input label="Serial number" value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} />
          <Select label="Position" value={form.position} onChange={e => set('position', e.target.value as TyrePosition)} options={opts(POSITIONS)} />
          <Select label="Status" value={form.status} onChange={e => set('status', e.target.value as TyreStatus)} options={opts(STATUSES)} />
          <Input label="Tread depth (mm)" type="number" min={0} step="0.1" value={form.treadDepthMm} onChange={num('treadDepthMm')} />
          <Input label="Current mileage (KM)" type="number" min={0} value={form.currentMileage} onChange={num('currentMileage')} />
          <Input label="Replacement date" type="date" value={form.replacementDate ?? ''} onChange={e => set('replacementDate', e.target.value)} />
          <Input label="Replacement mileage" type="number" min={0} value={form.replacementMileage ?? ''} onChange={e => set('replacementMileage', e.target.value === '' ? undefined : Number(e.target.value))} />
        </div>
        <Textarea label="Notes" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
      </form>
    </Modal>
  );
};
