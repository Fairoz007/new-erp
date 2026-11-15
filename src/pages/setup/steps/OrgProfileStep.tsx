// Step 1: organization profile (legal identity, contact, logo). Also Settings → Organization.
import React, { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input, Textarea } from '../../../components/ui/Input';
import { useOrg } from '../../../context/OrgContext';
import * as org from '../../../services/org';
import { removeFiles } from '../../../services/storage';
import { ImageUpload } from '../../../components/common/ImageUpload';
import { NoticeBar, Section, useNotice, errText } from '../shared';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const OrgProfileStep: React.FC<{ readOnly?: boolean; onSaved?: () => void; registerSave?: (fn: (() => Promise<boolean>) | null) => void }> = ({ readOnly, onSaved, registerSave }) => {
  const { organization, setOrganization } = useOrg();
  const [form, setForm] = useState({
    legalName: '', legalNameAr: '', tradeName: '', crNumber: '', vatNumber: '', taxNumber: '', address: '', city: '', country: 'Oman',
    phone: '', email: '', website: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useNotice();
  const loaded = useRef('');   // the form as last loaded or saved, to tell unsaved edits apart

  useEffect(() => {
    if (!organization) return;
    const next = {
      legalName: organization.legalName, legalNameAr: organization.legalNameAr, tradeName: organization.tradeName, crNumber: organization.crNumber,
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

  // the logo is saved on the organization as soon as it is uploaded or removed; the file it
  // replaces is then deleted (a failed save deletes the new upload instead)
  const onLogo = async (path: string) => {
    if (!organization) return;
    const previous = organization.logoPath;
    try {
      setOrganization(await org.saveOrganization(organization.id, { logoPath: path }));
      if (previous && previous !== path) removeFiles('media', [previous]).catch(() => undefined);
      setNotice({ tone: 'success', text: path ? 'Logo saved.' : 'Logo removed.' });
    } catch (e) {
      if (path) removeFiles('media', [path]).catch(() => undefined);
      setNotice({ tone: 'error', text: errText(e) });
    }
  };

  return (
    <div className="space-y-4">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <Section title="Legal identity" description="Shown on invoices, payslips, statements and reports.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Legal name" required value={form.legalName} onChange={set('legalName')} error={errors.legalName} disabled={readOnly} maxLength={200} />
          <Input label="Legal name in Arabic" dir="rtl" lang="ar" value={form.legalNameAr} onChange={set('legalNameAr')} hint="Printed with the English name on invoices and statements" disabled={readOnly} maxLength={200} />
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
      <Section title="Logo" description="Shown in the sidebar and on printed documents. Save the profile first.">
        <ImageUpload
          label="Organization logo"
          kind="brand"
          shape="wide"
          value={organization?.logoPath ?? ''}
          upload={org.uploadOrgLogo}
          onChange={path => void onLogo(path)}
          hint="PNG, JPEG or WebP. Kept in proportion, resized to 1200 px wide and saved as PNG (transparency kept)."
          disabled={!organization || readOnly}
        />
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
