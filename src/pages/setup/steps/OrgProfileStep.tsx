// Step 1: organization profile (legal identity, contact, logo). Also Settings → Organization.
import React, { useEffect, useRef, useState } from 'react';
import { Upload, Save } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input, Textarea } from '../../../components/ui/Input';
import { useOrg } from '../../../context/OrgContext';
import * as org from '../../../services/org';
import { NoticeBar, Section, useNotice, errText } from '../shared';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const OrgProfileStep: React.FC<{ readOnly?: boolean; onSaved?: () => void; registerSave?: (fn: (() => Promise<boolean>) | null) => void }> = ({ readOnly, onSaved, registerSave }) => {
  const { organization, setOrganization, logoUrl } = useOrg();
  const [form, setForm] = useState({
    legalName: '', tradeName: '', crNumber: '', vatNumber: '', taxNumber: '', address: '', city: '', country: 'Oman',
    phone: '', email: '', website: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useNotice();
  const loaded = useRef('');   // the form as last loaded or saved, to tell unsaved edits apart

  useEffect(() => {
    if (!organization) return;
    const next = {
      legalName: organization.legalName, tradeName: organization.tradeName, crNumber: organization.crNumber,
      vatNumber: organization.vatNumber, taxNumber: organization.taxNumber, address: organization.address,
      city: organization.city, country: organization.country || 'Oman', phone: organization.phone,
      email: organization.email, website: organization.website,
    };
    loaded.current = JSON.stringify(next);
    setForm(next);
  }, [organization]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setErrors(x => ({ ...x, [k]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.legalName.trim()) e.legalName = 'Legal name is required.';
    if (form.email.trim() && !EMAIL.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.website.trim() && !/^https?:\/\/|^[\w-]+\.[\w.-]+/.test(form.website.trim())) e.website = 'Enter a web address such as www.example.com.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async (): Promise<boolean> => {
    if (readOnly || saving) return false;
    if (!validate()) { (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(); return false; }
    setSaving(true);
    try {
      const saved = await org.saveOrganization(organization?.id ?? null, form);
      loaded.current = JSON.stringify(form);
      setOrganization(saved);
      setNotice({ tone: 'success', text: 'Organization profile saved.' });
      onSaved?.();
      return true;
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // unsaved edits (or no organization yet): the wizard's "Save & continue" saves them first
  const dirty = !readOnly && (!organization || JSON.stringify(form) !== loaded.current);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    registerSave?.(dirty ? () => saveRef.current() : null);
    return () => registerSave?.(null);
  }, [dirty, registerSave]);

  const onLogo = async (file: File | undefined) => {
    if (!file || !organization) return;
    setUploading(true);
    try {
      const path = await org.uploadOrgLogo(file);
      setOrganization(await org.saveOrganization(organization.id, { logoPath: path }));
      setNotice({ tone: 'success', text: 'Logo uploaded.' });
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <Section title="Legal identity" description="Shown on invoices, payslips, statements and reports.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Legal name" required value={form.legalName} onChange={set('legalName')} error={errors.legalName} disabled={readOnly} maxLength={200} />
          <Input label="Trade name" value={form.tradeName} onChange={set('tradeName')} hint="Used in the app header if set" disabled={readOnly} maxLength={200} />
          <Input label="Commercial registration (CR) no." value={form.crNumber} onChange={set('crNumber')} disabled={readOnly} maxLength={50} />
          <Input label="VAT number" value={form.vatNumber} onChange={set('vatNumber')} disabled={readOnly} maxLength={50} />
          <Input label="Tax card number" value={form.taxNumber} onChange={set('taxNumber')} disabled={readOnly} maxLength={50} />
        </div>
      </Section>
      <Section title="Contact & address">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Textarea label="Address" value={form.address} onChange={set('address')} rows={2} className="sm:col-span-2" disabled={readOnly} maxLength={500} />
          <Input label="City" value={form.city} onChange={set('city')} disabled={readOnly} />
          <Input label="Country" value={form.country} onChange={set('country')} disabled={readOnly} />
          <Input label="Phone" value={form.phone} onChange={set('phone')} disabled={readOnly} inputMode="tel" />
          <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} disabled={readOnly} />
          <Input label="Website" value={form.website} onChange={set('website')} error={errors.website} disabled={readOnly} />
        </div>
      </Section>
      <Section title="Logo" description="PNG, JPG or WebP up to 2 MB. Save the profile first.">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-24 h-24 rounded-2xl border border-slate-700 bg-slate-850 flex items-center justify-center overflow-hidden">
            {logoUrl ? <img src={logoUrl} alt="Organization logo" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-slate-400">No logo</span>}
          </div>
          <label className={`inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-slate-700 text-xs font-semibold ${!organization || readOnly ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-slate-850'}`}>
            <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={!organization || readOnly || uploading}
              onChange={e => { void onLogo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      </Section>
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={save} isLoading={saving} leftIcon={<Save className="w-4 h-4" />}>
            {organization ? 'Save profile' : 'Create organization'}
          </Button>
        </div>
      )}
    </div>
  );
};
