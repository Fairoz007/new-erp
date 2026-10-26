// Edit form for supplier / customer master data (balances are DB-owned and not editable here).
import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import type { Supplier, Customer, SupplierType } from '../../types/operations';

const SUPPLIER_TYPES: SupplierType[] = [
  'Vehicle Dealer', 'Garage', 'Workshop', 'Tyre Supplier', 'Oil Supplier', 'Parts Supplier',
  'Insurance Company', 'Fuel Supplier', 'Rental Company', 'Other',
];
const CUSTOMER_TYPES: Customer['customerType'][] = ['Corporate', 'Individual', 'Government', 'Partner'];

type Props =
  | { kind: 'supplier'; party: Supplier | null; onClose: () => void; onSave: (id: string, changes: Partial<Supplier>) => Promise<void> }
  | { kind: 'customer'; party: Customer | null; onClose: () => void; onSave: (id: string, changes: Partial<Customer>) => Promise<void> };

export const PartyEditModal: React.FC<Props> = (props) => {
  const { kind, party, onClose } = props;
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!party) return;
    setForm({
      name: party.name, contactPerson: party.contactPerson, phone: party.phone, email: party.email,
      address: party.address, city: party.city, country: party.country, vatNumber: party.vatNumber,
      taxNumber: party.taxNumber, paymentTermsDays: party.paymentTermsDays, creditLimit: party.creditLimit,
      status: party.status, notes: party.notes ?? '',
      type: kind === 'supplier' ? (party as Supplier).supplierType : (party as Customer).customerType,
      bankDetails: kind === 'supplier' ? { ...(party as Supplier).bankDetails } : undefined,
    });
  }, [party, kind]);

  if (!party) return null;
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const setBank = (k: string, v: string) => setForm(f => ({ ...f, bankDetails: { ...f.bankDetails, [k]: v } }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!String(form.name || '').trim()) { setError('Name is required.'); return; }
    if (Number(form.paymentTermsDays) < 0 || Number(form.creditLimit) < 0) { setError('Terms and credit limit cannot be negative.'); return; }
    const common = {
      name: String(form.name).trim(), contactPerson: form.contactPerson, phone: form.phone, email: form.email,
      address: form.address, city: form.city, country: form.country, vatNumber: form.vatNumber, taxNumber: form.taxNumber,
      paymentTermsDays: Number(form.paymentTermsDays), creditLimit: Number(form.creditLimit), notes: form.notes,
    };
    setSaving(true);
    setError(null);
    try {
      if (props.kind === 'supplier') {
        await props.onSave(party.id, { ...common, supplierType: form.type, status: form.status, bankDetails: form.bankDetails });
      } else {
        await props.onSave(party.id, { ...common, customerType: form.type, status: form.status });
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const label = kind === 'supplier' ? 'Supplier' : 'Customer';
  return (
    <Modal
      isOpen={!!party}
      onClose={() => { if (!saving) onClose(); }}
      title={`Edit ${label}: ${kind === 'supplier' ? (party as Supplier).supplierId : (party as Customer).customerId}`}
      description="Balances and totals are calculated from posted invoices and payments and cannot be edited here."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label={`${label} Name`} value={form.name ?? ''} onChange={e => set('name', e.target.value)} required />
          <Select label="Type" value={form.type ?? ''} onChange={e => set('type', e.target.value)}>
            {(kind === 'supplier' ? SUPPLIER_TYPES : CUSTOMER_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input label="Contact Person" value={form.contactPerson ?? ''} onChange={e => set('contactPerson', e.target.value)} />
          <Input label="Phone" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} />
          <Input label="Email" type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} />
          <Input label="Address" value={form.address ?? ''} onChange={e => set('address', e.target.value)} />
          <Input label="City" value={form.city ?? ''} onChange={e => set('city', e.target.value)} />
          <Input label="Country" value={form.country ?? ''} onChange={e => set('country', e.target.value)} />
          <Input label="VAT Number" value={form.vatNumber ?? ''} onChange={e => set('vatNumber', e.target.value)} />
          <Input label="Tax Number" value={form.taxNumber ?? ''} onChange={e => set('taxNumber', e.target.value)} />
          <Input label="Payment Terms (days)" type="number" min={0} value={form.paymentTermsDays ?? 0} onChange={e => set('paymentTermsDays', e.target.value)} />
          <Input label="Credit Limit" type="number" min={0} step="0.001" value={form.creditLimit ?? 0} onChange={e => set('creditLimit', e.target.value)} />
          <Select label="Status" value={form.status ?? 'Active'} onChange={e => set('status', e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            {kind === 'supplier' && <option value="Blocked">Blocked</option>}
          </Select>
        </div>
        {kind === 'supplier' && form.bankDetails && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Bank Name" value={form.bankDetails.bankName ?? ''} onChange={e => setBank('bankName', e.target.value)} />
            <Input label="Account Number" value={form.bankDetails.accountNumber ?? ''} onChange={e => setBank('accountNumber', e.target.value)} />
            <Input label="IBAN" value={form.bankDetails.iban ?? ''} onChange={e => setBank('iban', e.target.value)} />
            <Input label="SWIFT" value={form.bankDetails.swiftCode ?? ''} onChange={e => setBank('swiftCode', e.target.value)} />
          </div>
        )}
        <Textarea label="Notes" rows={2} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" isLoading={saving} disabled={saving}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
};
