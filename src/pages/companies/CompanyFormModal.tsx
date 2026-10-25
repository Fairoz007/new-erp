import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Company } from '../../types/system';

type CompanyDraft = Omit<Company, 'id'>;

const EMPTY: CompanyDraft = {
  name: '', code: '', registrationNumber: '', vatNumber: '', taxNumber: '', address: '', country: '', state: '', city: '',
  postalCode: '', phone: '', email: '', website: '', logo: '', currency: 'OMR', financialYear: '',
  bankDetails: { bankName: '', accountNumber: '', iban: '', swiftCode: '', branch: '' }, notes: '', active: true,
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  company?: Company; // edit when given, create otherwise
  onSubmit: (data: CompanyDraft) => Promise<void>; // must throw on failure
}

export const CompanyFormModal: React.FC<Props> = ({ isOpen, onClose, company, onSubmit }) => {
  const [form, setForm] = useState<CompanyDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      const { id: _id, ...rest } = company ?? ({ id: '', ...EMPTY } as Company);
      setForm({ ...EMPTY, ...rest, bankDetails: { ...EMPTY.bankDetails, ...(rest.bankDetails ?? {}) } });
      setError('');
    }
  }, [isOpen, company]);

  const set = <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) => setForm(f => ({ ...f, [key]: value }));
  const setBank = (key: keyof CompanyDraft['bankDetails'], value: string) =>
    setForm(f => ({ ...f, bankDetails: { ...f.bankDetails, [key]: value } }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim() || !form.code.trim()) {
      setError('Office name and code are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({ ...form, name: form.name.trim(), code: form.code.trim().toUpperCase() });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title={company ? `Edit ${company.name}` : 'Add Office / Branch'}
      description="Each office keeps its own vehicles, records, chart of accounts and numbering."
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} type="button">Cancel</Button>
          <Button variant="primary" type="submit" form="company-form" isLoading={saving} disabled={saving}>
            {company ? 'Save Changes' : 'Create Office'}
          </Button>
        </>
      }
    >
      <form id="company-form" onSubmit={submit} className="space-y-5">
        {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Office name" required value={form.name} onChange={e => set('name', e.target.value)} />
          <Input label="Office code" required value={form.code} onChange={e => set('code', e.target.value)} hint="Unique short code, e.g. HO" />
          <Input label="Commercial registration (CR)" value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} />
          <Input label="VAT number" value={form.vatNumber} onChange={e => set('vatNumber', e.target.value)} />
          <Input label="Tax card number" value={form.taxNumber} onChange={e => set('taxNumber', e.target.value)} />
          <Input label="Fiscal period" value={form.financialYear} onChange={e => set('financialYear', e.target.value)} placeholder="e.g. Jan - Dec" />
          <Select
            label="Currency"
            value={form.currency}
            onChange={e => set('currency', e.target.value as Company['currency'])}
            options={['OMR', 'USD', 'EUR', 'SAR', 'AED'].map(c => ({ value: c, label: c }))}
          />
          {company && (
            <Select
              label="Status"
              value={form.active ? 'active' : 'inactive'}
              onChange={e => set('active', e.target.value === 'active')}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Address" value={form.address} onChange={e => set('address', e.target.value)} className="sm:col-span-2" />
          <Input label="City" value={form.city} onChange={e => set('city', e.target.value)} />
          <Input label="State / Governorate" value={form.state} onChange={e => set('state', e.target.value)} />
          <Input label="Country" value={form.country} onChange={e => set('country', e.target.value)} />
          <Input label="Postal code" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} />
          <Input label="Phone" value={form.phone} onChange={e => set('phone', e.target.value)} />
          <Input label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          <Input label="Website" value={form.website} onChange={e => set('website', e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Bank name" value={form.bankDetails.bankName} onChange={e => setBank('bankName', e.target.value)} />
          <Input label="Branch" value={form.bankDetails.branch} onChange={e => setBank('branch', e.target.value)} />
          <Input label="Account number" value={form.bankDetails.accountNumber} onChange={e => setBank('accountNumber', e.target.value)} />
          <Input label="IBAN" value={form.bankDetails.iban} onChange={e => setBank('iban', e.target.value)} />
          <Input label="SWIFT" value={form.bankDetails.swiftCode} onChange={e => setBank('swiftCode', e.target.value)} />
        </div>

        <Textarea label="Notes" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
      </form>
    </Modal>
  );
};
