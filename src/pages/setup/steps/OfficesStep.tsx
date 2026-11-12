// Step 3: offices (branches). Each new office gets its own chart of accounts and number sequences
// automatically (trg_company_bootstrap). Also Settings → Offices.
import React, { useState } from 'react';
import { Building2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { useAuth } from '../../../context/AuthContext';
import { useOrg } from '../../../context/OrgContext';
import { addCompany, updateCompany } from '../../../services/fleet';
import type { Company } from '../../../types/system';
import { CURRENCIES, LoadState, NoticeBar, Section, Toggle, errText, useNotice, useOffices } from '../shared';
import { RecordSelect } from '../../../components/ui/RecordSelect';

type Contact = { name: string; role: string; phone: string; email: string };
type Form = {
  name: string; code: string; registrationNumber: string; address: string; city: string; country: string; phone: string;
  email: string; currency: string; managerUserId: string; contacts: Contact[]; active: boolean;
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const emptyForm = (currency: string, country: string): Form => ({
  name: '', code: '', registrationNumber: '', address: '', city: '', country, phone: '', email: '', currency,
  managerUserId: '', contacts: [], active: true,
});

export const OfficesStep: React.FC<{ readOnly?: boolean; onChanged?: (count: number) => void }> = ({ readOnly, onChanged }) => {
  const { offices, loading, error, reload } = useOffices();
  const { users, refresh: refreshAuth } = useAuth();
  const { organization } = useOrg();
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useNotice();
  const currencyLocked = !organization?.overridableSettings.includes('currency');

  const open = (c?: Company) => {
    setErrors({});
    setEditing(c ? {
      id: c.id,
      form: {
        name: c.name, code: c.code, registrationNumber: c.registrationNumber, address: c.address, city: c.city, country: c.country,
        phone: c.phone, email: c.email, currency: c.currency, managerUserId: c.managerUserId ?? '', contacts: c.contacts ?? [], active: c.active,
      },
    } : { id: null, form: emptyForm(organization?.baseCurrency ?? 'OMR', organization?.country || 'Oman') });
  };

  const upd = (p: Partial<Form>) => setEditing(e => (e ? { ...e, form: { ...e.form, ...p } } : e));

  const validate = (f: Form, id: string | null) => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Office name is required.';
    if (!/^[A-Za-z0-9-]{2,10}$/.test(f.code.trim())) e.code = 'Code: 2–10 letters, digits or dashes.';
    else if (offices.some(o => o.id !== id && o.code.toLowerCase() === f.code.trim().toLowerCase())) e.code = 'Another office already uses this code.';
    if (f.email.trim() && !EMAIL.test(f.email.trim())) e.email = 'Enter a valid email address.';
    f.contacts.forEach((c, i) => {
      if (!c.name.trim()) e[`contact${i}`] = 'Contact name is required.';
      else if (c.email.trim() && !EMAIL.test(c.email.trim())) e[`contact${i}`] = 'Contact email is not valid.';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!editing || saving || !validate(editing.form, editing.id)) return;
    setSaving(true);
    const f = editing.form;
    const payload: Partial<Company> = {
      name: f.name.trim(), code: f.code.trim().toUpperCase(), registrationNumber: f.registrationNumber, address: f.address, city: f.city,
      country: f.country, phone: f.phone, email: f.email.trim(), managerUserId: f.managerUserId, active: f.active,
      contacts: f.contacts.map(c => ({ name: c.name.trim(), role: c.role.trim(), phone: c.phone.trim(), email: c.email.trim() })),
    };
    if (!currencyLocked) payload.currency = f.currency;
    try {
      if (editing.id) await updateCompany(editing.id, payload);
      else await addCompany(payload as Omit<Company, 'id'>);
      setNotice({ tone: 'success', text: editing.id ? 'Office updated.' : `Office ${payload.name} created with its own chart of accounts.` });
      setEditing(null);
      await reload();
      await refreshAuth().catch(() => undefined); // the creator becomes a member of the new office
      onChanged?.(offices.length + (editing.id ? 0 : 1));
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setSaving(false);
    }
  };

  const managerName = (id?: string) => users.find(u => u.id === id)?.name;

  return (
    <div className="space-y-4">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <Section title="Offices" description="Add every branch or depot. Data is kept separate per office; users see only the offices they are assigned to."
        action={!readOnly && !editing && <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => open()}>Add office</Button>}>
        <LoadState loading={loading} error={error} onRetry={reload} empty={offices.length === 0 && !editing} emptyText="No offices yet. Add your first office (for example the head office).">
          <ul className="divide-y divide-slate-700/60">
            {offices.map(o => (
              <li key={o.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#DCEFE5] text-[#086343] flex items-center justify-center shrink-0"><Building2 className="w-4 h-4" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{o.name} <span className="font-mono text-xs text-slate-400">{o.code}</span></p>
                    <p className="text-xs text-slate-400 truncate">
                      {[o.city, o.country].filter(Boolean).join(', ') || 'No address'} · {o.currency}
                      {managerName(o.managerUserId) ? ` · Manager: ${managerName(o.managerUserId)}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!o.active && <Badge variant="slate">Inactive</Badge>}
                  {!readOnly && <Button size="xs" variant="outline" leftIcon={<Pencil className="w-3 h-3" />} onClick={() => open(o)}>Edit</Button>}
                </div>
              </li>
            ))}
          </ul>
        </LoadState>
      </Section>

      {editing && (
        <Section title={editing.id ? 'Edit office' : 'New office'}
          action={<Button size="xs" variant="ghost" onClick={() => setEditing(null)} aria-label="Close"><X className="w-4 h-4" /></Button>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Office name" required value={editing.form.name} onChange={e => upd({ name: e.target.value })} error={errors.name} maxLength={120} />
            <Input label="Code" required value={editing.form.code} onChange={e => upd({ code: e.target.value.toUpperCase() })} error={errors.code}
              hint="Short code used in document numbers, e.g. HO, SOH" maxLength={10} />
            <Input label="Registration no." value={editing.form.registrationNumber} onChange={e => upd({ registrationNumber: e.target.value })} />
            <RecordSelect label="Office manager" value={editing.form.managerUserId} onChange={v => upd({ managerUserId: v })} placeholder="Not set"
              options={users.map(u => ({ value: u.id, label: u.name, inactive: u.status !== 'active', inactiveLabel: u.status }))}
              hint="Invite users in step 5, then come back to set a manager" />
            <Textarea label="Address" rows={2} className="sm:col-span-2" value={editing.form.address} onChange={e => upd({ address: e.target.value })} />
            <Input label="City" value={editing.form.city} onChange={e => upd({ city: e.target.value })} />
            <Input label="Country" value={editing.form.country} onChange={e => upd({ country: e.target.value })} />
            <Input label="Phone" value={editing.form.phone} onChange={e => upd({ phone: e.target.value })} inputMode="tel" />
            <Input label="Email" type="email" value={editing.form.email} onChange={e => upd({ email: e.target.value })} error={errors.email} />
            <Select label="Currency" value={editing.form.currency} disabled={currencyLocked} onChange={e => upd({ currency: e.target.value })}
              hint={currencyLocked ? 'Follows the organization base currency' : 'Override allowed by the Super Admin'}
              options={Array.from(new Set([editing.form.currency, ...CURRENCIES])).map(c => ({ value: c, label: c }))} />
            <div className="flex items-end pb-2"><Toggle label="Active" checked={editing.form.active} onChange={v => upd({ active: v })} /></div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-100">Contacts</p>
            {editing.form.contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-start">
                {(['name', 'role', 'phone', 'email'] as const).map(k => (
                  <input key={k} aria-label={`Contact ${k}`} placeholder={k[0].toUpperCase() + k.slice(1)} className="h-9 rounded-lg border border-slate-700 px-2 text-xs"
                    value={c[k]} onChange={e => upd({ contacts: editing.form.contacts.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} />
                ))}
                <Button size="xs" variant="ghost" aria-label="Remove contact" onClick={() => upd({ contacts: editing.form.contacts.filter((_, j) => j !== i) })}><Trash2 className="w-3.5 h-3.5" /></Button>
                {errors[`contact${i}`] && <p className="text-[10px] text-rose-500 sm:col-span-5">{errors[`contact${i}`]}</p>}
              </div>
            ))}
            <Button size="xs" variant="outline" leftIcon={<Plus className="w-3 h-3" />}
              onClick={() => upd({ contacts: [...editing.form.contacts, { name: '', role: '', phone: '', email: '' }] })}>Add contact</Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} isLoading={saving} leftIcon={<Save className="w-4 h-4" />}>{editing.id ? 'Save office' : 'Create office'}</Button>
          </div>
        </Section>
      )}
    </div>
  );
};
