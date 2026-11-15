import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import { SidePanel } from '../../components/ui/SidePanel';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { ImageUpload, useStoredFileCleanup } from '../../components/common/ImageUpload';
import { forgetOfficeLogo } from '../../components/common/OfficeBadge';
import { Company } from '../../types/system';
import { useOptionalOrg } from '../../context/OrgContext';
import { useCustomFieldsEditor } from '../../hooks/useCustomFields';
import { uploadFile } from '../../services/storage';
import { officeLocationLines, officeMapsUrl } from '../../lib/offices';

export type OfficeDraft = Omit<Company, 'id'>;

const EMPTY: OfficeDraft = {
  name: '', code: '', registrationNumber: '', vatNumber: '', taxNumber: '', address: '', country: '', state: '', city: '',
  postalCode: '', phone: '', email: '', website: '', logo: '', currency: '', financialYear: '',
  bankDetails: { bankName: '', accountNumber: '', iban: '', swiftCode: '', branch: '' }, notes: '', active: true,
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Edit when given, create otherwise. */
  office?: Company;
  /** Saves through FleetContext (addCompany / updateCompany); must throw on failure. */
  onSubmit: (data: OfficeDraft) => Promise<void>;
}

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="space-y-3" aria-label={title}>
    <div>
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </section>
);

/**
 * Add or edit an office in a side panel, grouped into Identity, Location, Contact, Registration & tax
 * and Bank. Same rules as before: name and code required, code unique (database), optimistic lock
 * (updatedAt), companies:create / companies:edit permission checked by RLS and by the caller.
 */
export const OfficeEditPanel: React.FC<Props> = ({ isOpen, onClose, office, onSubmit }) => {
  const [form, setForm] = useState<OfficeDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const org = useOptionalOrg();
  const baseCurrency = org?.baseCurrency ?? '';
  // offices use the organization's base currency unless the Setup Wizard made currency overridable
  const currencyOverridable = !!org?.organization?.overridableSettings.includes('currency');
  const cf = useCustomFieldsEditor('office', office?.id, office?.customFields);
  const files = useStoredFileCleanup('media');

  useEffect(() => {
    if (isOpen) {
      const { id: _id, ...rest } = office ?? ({ id: '', ...EMPTY } as Company);
      setForm({ ...EMPTY, ...rest, bankDetails: { ...EMPTY.bankDetails, ...(rest.bankDetails ?? {}) } });
      setError('');
    }
  }, [isOpen, office]);

  const set = <K extends keyof OfficeDraft>(key: K, value: OfficeDraft[K]) => setForm(f => ({ ...f, [key]: value }));
  const setBank = (key: keyof OfficeDraft['bankDetails'], value: string) =>
    setForm(f => ({ ...f, bankDetails: { ...f.bankDetails, [key]: value } }));

  const lines = useMemo(() => officeLocationLines(form), [form]);
  const mapsUrl = useMemo(() => officeMapsUrl(form), [form]);

  const uploadLogo = useCallback(async (file: File) => {
    if (!office) throw new Error('Save the office first, then add its logo.');
    const stored = await uploadFile(file, office.id, 'logos', { bucket: 'media' });
    files.track(stored.path);
    return stored.path;
  }, [office, files]);

  const close = () => { files.abandon(); onClose(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim() || !form.code.trim()) {
      setError('Office name and code are required.');
      return;
    }
    if (!cf.validate()) { setError('Check the additional information fields.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        ...form, name: form.name.trim(), code: form.code.trim().toUpperCase(),
        currency: currencyOverridable ? (form.currency || baseCurrency) : baseCurrency,
        customFields: cf.value(),
      });
      // the record now points at form.logo: remove the logo it replaced and any other upload
      files.commit(form.logo, office?.logo ?? '');
      if (office?.logo && office.logo !== form.logo) forgetOfficeLogo(office.logo);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={saving ? () => undefined : close}
      title={office ? `Edit ${office.name}` : 'Add office or branch'}
      description="Each office keeps its own vehicles, records, chart of accounts and numbering."
      footer={requestClose => (
        <>
          <Button variant="outline" onClick={requestClose} disabled={saving} type="button">Cancel</Button>
          <Button variant="primary" type="submit" form="office-form" isLoading={saving} disabled={saving}>
            {office ? 'Save changes' : 'Create office'}
          </Button>
        </>
      )}
    >
      <form id="office-form" onSubmit={submit} className="space-y-7" noValidate>
        {error && (
          <p role="alert" className="text-xs font-semibold text-danger-700 bg-danger-50 border border-danger/30 rounded-control px-3 py-2">{error}</p>
        )}

        <Section title="Identity">
          <Input label="Office name" required value={form.name} onChange={e => set('name', e.target.value)}
            aria-invalid={!!error && !form.name.trim()} />
          <Input label="Office code" required value={form.code} onChange={e => set('code', e.target.value)}
            hint="Unique short code, e.g. HO. Used in document numbers." aria-invalid={!!error && !form.code.trim()} />
          {office && (
            <Select
              label="Status"
              value={form.active ? 'active' : 'inactive'}
              onChange={e => set('active', e.target.value === 'active')}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
            />
          )}
          <div className="sm:col-span-2">
            {office ? (
              <ImageUpload
                label="Office logo"
                kind="logo"
                value={form.logo}
                upload={uploadLogo}
                onChange={path => set('logo', path)}
                hint="PNG, JPEG or WebP. Shown on a square badge: the image is fitted into a square, nothing is cut off."
                disabled={saving}
              />
            ) : (
              <p className="text-xs text-slate-400">The logo can be added once the office is created.</p>
            )}
          </div>
          <Textarea label="Description" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
            className="sm:col-span-2" rows={2} />
        </Section>

        <Section title="Location" description="Used on the Offices screen and for the Open in Maps link.">
          <Input label="Address" value={form.address} onChange={e => set('address', e.target.value)} className="sm:col-span-2"
            placeholder="Street, area" />
          <Input label="City" value={form.city} onChange={e => set('city', e.target.value)} />
          <Input label="State / Governorate" value={form.state} onChange={e => set('state', e.target.value)} />
          <Input label="Postal code" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} />
          <Input label="Country" value={form.country} onChange={e => set('country', e.target.value)} />
          <div className="sm:col-span-2 rounded-card border border-slate-700 bg-slate-850 p-3 text-xs" aria-live="polite">
            <p className="font-semibold text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Preview
            </p>
            {lines.length ? (
              <div className="mt-1 text-slate-200 space-y-0.5">{lines.map(l => <p key={l}>{l}</p>)}</div>
            ) : (
              <p className="mt-1 text-slate-400">No location entered.</p>
            )}
            {mapsUrl ? (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-600 underline">
                Open in Maps <ExternalLink className="w-3 h-3" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <p className="mt-2 text-slate-400">The Open in Maps link appears once an address is entered.</p>
            )}
          </div>
        </Section>

        <Section title="Contact">
          <Input label="Phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
          <Input label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          <Input label="Website" value={form.website} onChange={e => set('website', e.target.value)} className="sm:col-span-2" />
        </Section>

        <Section title="Registration & tax">
          <Input label="Commercial registration (CR)" value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} />
          <Input label="VAT number" value={form.vatNumber} onChange={e => set('vatNumber', e.target.value)} />
          <Input label="Tax card number" value={form.taxNumber} onChange={e => set('taxNumber', e.target.value)} />
          <Input label="Fiscal period" value={form.financialYear} onChange={e => set('financialYear', e.target.value)} placeholder="e.g. Jan - Dec" />
          {currencyOverridable ? (
            <Input label="Currency" value={form.currency || baseCurrency} maxLength={3}
              onChange={e => set('currency', e.target.value.toUpperCase())} hint="ISO code, e.g. OMR" />
          ) : (
            <Input label="Currency" value={baseCurrency} disabled hint="Organization base currency (Settings → Organization)" />
          )}
        </Section>

        <Section title="Bank" description="Printed on this office's invoices.">
          <Input label="Bank name" value={form.bankDetails.bankName} onChange={e => setBank('bankName', e.target.value)} />
          <Input label="Branch" value={form.bankDetails.branch} onChange={e => setBank('branch', e.target.value)} />
          <Input label="Account number" value={form.bankDetails.accountNumber} onChange={e => setBank('accountNumber', e.target.value)} />
          <Input label="IBAN" value={form.bankDetails.iban} onChange={e => setBank('iban', e.target.value)} />
          <Input label="SWIFT" value={form.bankDetails.swiftCode} onChange={e => setBank('swiftCode', e.target.value)} />
        </Section>

        {cf.node}
      </form>
    </SidePanel>
  );
};
