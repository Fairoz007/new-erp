// Step 2: universal settings inherited by every office (currency, financial year, tax rates, payment
// terms, units, document numbering, letterhead, price lists). Also Settings → Universal settings.
import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { useOrg } from '../../../context/OrgContext';
import { useAuth } from '../../../context/AuthContext';
import * as org from '../../../services/org';
import type { DocumentFormat, FeeItem, FeeSchedule, PaymentTerm, TaxRate, Unit } from '../../../services/org';
import { MasterEditor } from '../MasterEditor';
import { CURRENCIES, LoadState, NoticeBar, Section, TIMEZONES, Toggle, errText, tableCls, tdCls, thCls, useMaster, useNotice } from '../shared';

export const OVERRIDABLE: { key: string; label: string }[] = [
  { key: 'currency', label: 'Office currency' },
  { key: 'payment_terms_days', label: 'Default payment terms' },
  { key: 'tax_rate', label: 'Default tax rate' },
  { key: 'letterhead', label: 'Letterhead text' },
  { key: 'fee_schedule', label: 'Default price list' },
];

const GeneralSettings: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => {
  const { organization, setOrganization } = useOrg();
  const { isSuperAdmin } = useAuth();
  const [form, setForm] = useState({ baseCurrency: 'OMR', currencyDecimals: 3, fyStartMonth: 1, timezone: 'Asia/Muscat', language: 'en' as 'en' | 'ar',
    overridable: [] as string[], header: '', footer: '', showLogo: true, partyApproval: false, alertDays: 30 });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useNotice();

  useEffect(() => {
    if (!organization) return;
    setForm({
      baseCurrency: organization.baseCurrency, currencyDecimals: organization.currencyDecimals, fyStartMonth: organization.fyStartMonth,
      timezone: organization.timezone, language: organization.language, overridable: organization.overridableSettings,
      header: organization.letterhead.header ?? '', footer: organization.letterhead.footer ?? '', showLogo: organization.letterhead.showLogo ?? true,
      partyApproval: organization.partyApprovalRequired, alertDays: organization.expiryAlertDays,
    });
  }, [organization]);

  if (!organization) return <p className="text-xs text-slate-400">Create the organization profile first (step 1).</p>;
  const superOnly = !isSuperAdmin;

  const save = async () => {
    if (readOnly || saving) return;
    setSaving(true);
    try {
      const patch: Partial<org.OrganizationInput> = {
        currencyDecimals: Number(form.currencyDecimals), fyStartMonth: Number(form.fyStartMonth), timezone: form.timezone, language: form.language,
        letterhead: { header: form.header.trim(), footer: form.footer.trim(), showLogo: form.showLogo },
        partyApprovalRequired: form.partyApproval,
        expiryAlertDays: Math.min(365, Math.max(1, Math.round(Number(form.alertDays) || 30))),
      };
      if (isSuperAdmin) { patch.baseCurrency = form.baseCurrency; patch.overridableSettings = form.overridable; }
      setOrganization(await org.saveOrganization(organization.id, patch));
      setNotice({ tone: 'success', text: 'Settings saved.' });
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="General" description="Every office uses these values unless an override is allowed below."
      action={!readOnly && <Button size="sm" onClick={save} isLoading={saving} leftIcon={<Save className="w-4 h-4" />}>Save</Button>}>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select label="Base currency" required value={form.baseCurrency} disabled={readOnly || superOnly}
          hint={superOnly ? 'Only a Super Admin can change this' : 'Cannot change after transactions are posted'}
          onChange={e => setForm(f => ({ ...f, baseCurrency: e.target.value }))}
          options={Array.from(new Set([form.baseCurrency, ...CURRENCIES])).map(c => ({ value: c, label: c }))} />
        <Select label="Decimal places" value={String(form.currencyDecimals)} disabled={readOnly}
          onChange={e => setForm(f => ({ ...f, currencyDecimals: Number(e.target.value) }))}
          options={[0, 1, 2, 3].map(n => ({ value: String(n), label: String(n) }))} />
        <Select label="Financial year starts" value={String(form.fyStartMonth)} disabled={readOnly}
          onChange={e => setForm(f => ({ ...f, fyStartMonth: Number(e.target.value) }))}
          options={org.MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
        <Select label="Time zone" value={form.timezone} disabled={readOnly} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
          options={Array.from(new Set([form.timezone, ...TIMEZONES])).map(z => ({ value: z, label: z }))} />
        <Select label="Language" value={form.language} disabled={readOnly} onChange={e => setForm(f => ({ ...f, language: e.target.value as 'en' | 'ar' }))}
          options={[{ value: 'en', label: 'English' }, { value: 'ar', label: 'Arabic (documents)' }]}
          hint="The interface is English; Arabic applies to printed documents when available" />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-100 mb-2">Offices may override</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {OVERRIDABLE.map(o => (
            <Toggle key={o.key} label={o.label} checked={form.overridable.includes(o.key)} disabled={readOnly || superOnly}
              onChange={v => setForm(f => ({ ...f, overridable: v ? [...f.overridable, o.key] : f.overridable.filter(k => k !== o.key) }))} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Textarea label="Letterhead header" rows={2} value={form.header} disabled={readOnly} maxLength={500}
          onChange={e => setForm(f => ({ ...f, header: e.target.value }))} hint="Printed under the logo on invoices and reports" />
        <Textarea label="Letterhead footer" rows={2} value={form.footer} disabled={readOnly} maxLength={500}
          onChange={e => setForm(f => ({ ...f, footer: e.target.value }))} hint="e.g. bank details, CR and VAT numbers" />
      </div>
      <Toggle label="Show logo on documents" checked={form.showLogo} disabled={readOnly} onChange={v => setForm(f => ({ ...f, showLogo: v }))} />
      <Toggle label="New clients and suppliers need approval before they can be used" checked={form.partyApproval} disabled={readOnly}
        onChange={v => setForm(f => ({ ...f, partyApproval: v }))} />
      <Input label="Expiry alert window (days)" type="number" min={1} max={365} value={form.alertDays} disabled={readOnly}
        onChange={e => setForm(f => ({ ...f, alertDays: Number(e.target.value) }))}
        hint="Registration, insurance, route permit, inspection and driving licence alerts start this many days before the date." />
    </Section>
  );
};

const DocumentFormats: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => {
  const { rows, loading, error, reload } = useMaster('documentFormats');
  const [drafts, setDrafts] = useState<Record<string, Partial<DocumentFormat>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();
  const preview = (f: DocumentFormat) => {
    const d = { ...f, ...drafts[f.docType] };
    return [d.prefix || '?', d.includeOfficeCode ? 'HO' : null, d.includeYear ? String(new Date().getFullYear()) : null, '1'.padStart(Number(d.padding) || 1, '0')]
      .filter(Boolean).join('-');
  };
  const save = async (f: DocumentFormat) => {
    const d = drafts[f.docType];
    if (!d) return;
    if (d.prefix !== undefined && !/^[A-Za-z0-9]{1,8}$/.test(d.prefix)) { setNotice({ tone: 'error', text: 'Prefix: 1–8 letters or digits.' }); return; }
    setBusy(f.docType);
    try {
      await org.saveMaster('documentFormats', f.docType, { ...d, padding: d.padding === undefined ? undefined : Number(d.padding) });
      setDrafts(x => { const n = { ...x }; delete n[f.docType]; return n; });
      await reload();
      setNotice({ tone: 'success', text: `${f.label} format saved.` });
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Section title="Document numbering" description="New documents get the next number in this format. Existing numbers never change.">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <LoadState loading={loading} error={error} onRetry={reload}>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr>
              <th className={thCls}>Document</th><th className={thCls}>Prefix</th><th className={thCls}>Office code</th>
              <th className={thCls}>Year</th><th className={thCls}>Digits</th><th className={thCls}>Example</th>{!readOnly && <th className={thCls} />}
            </tr></thead>
            <tbody>
              {rows.map(f => {
                const d = { ...f, ...drafts[f.docType] };
                const upd = (p: Partial<DocumentFormat>) => setDrafts(x => ({ ...x, [f.docType]: { ...x[f.docType], ...p } }));
                return (
                  <tr key={f.docType}>
                    <td className={tdCls}>{f.label}{f.scope === 'organization' && <span className="text-[10px] text-slate-400"> (organization-wide)</span>}</td>
                    <td className={tdCls}><input aria-label={`${f.label} prefix`} className="w-20 h-8 rounded-lg border border-slate-700 px-2 text-xs uppercase" value={d.prefix} maxLength={8} disabled={readOnly} onChange={e => upd({ prefix: e.target.value.toUpperCase() })} /></td>
                    <td className={tdCls}><input type="checkbox" aria-label="Include office code" className="w-4 h-4 accent-[#086343]" checked={d.includeOfficeCode} disabled={readOnly || f.scope === 'organization'} onChange={e => upd({ includeOfficeCode: e.target.checked })} /></td>
                    <td className={tdCls}><input type="checkbox" aria-label="Include year" className="w-4 h-4 accent-[#086343]" checked={d.includeYear} disabled={readOnly} onChange={e => upd({ includeYear: e.target.checked })} /></td>
                    <td className={tdCls}><input type="number" aria-label="Digits" min={1} max={9} className="w-16 h-8 rounded-lg border border-slate-700 px-2 text-xs" value={d.padding} disabled={readOnly} onChange={e => upd({ padding: Number(e.target.value) })} /></td>
                    <td className={`${tdCls} font-mono text-slate-100`}>{preview(f)}</td>
                    {!readOnly && <td className={`${tdCls} text-right`}><Button size="xs" variant={drafts[f.docType] ? 'primary' : 'outline'} disabled={!drafts[f.docType]} isLoading={busy === f.docType} onClick={() => void save(f)}>Save</Button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </LoadState>
    </Section>
  );
};

const FeeSchedules: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => {
  const { organization } = useOrg();
  const schedules = useMaster('feeSchedules');
  const units = useMaster('units');
  const taxes = useMaster('taxRates');
  const types = useMaster('vehicleTypes');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Section title="Price lists (fee schedules)" description="Standard rates for client quotes and invoices, e.g. bus hire per day or per trip.">
      <MasterEditor<FeeSchedule>
        master="feeSchedules" readOnly={readOnly} defaultFlag="feeSchedules" rowKey={r => r.id} addLabel="Add price list"
        blank={{ name: '', currency: organization?.baseCurrency ?? 'OMR', active: true, validFrom: '', validTo: '' }}
        onChanged={schedules.reload}
        columns={[
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'currency', label: 'Currency', type: 'select', options: CURRENCIES.map(c => ({ value: c, label: c })), width: '90px' },
          { key: 'validFrom', label: 'Valid from (YYYY-MM-DD)', type: 'text', placeholder: '2026-01-01', validate: v => (v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? 'Use YYYY-MM-DD' : null) },
          { key: 'validTo', label: 'Valid to', type: 'text', placeholder: 'optional', validate: v => (v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? 'Use YYYY-MM-DD' : null) },
          { key: 'active', label: 'Active', type: 'checkbox' },
        ]}
      />
      {schedules.rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-100">Rates</p>
          <div className="flex flex-wrap gap-2">
            {schedules.rows.map(s => (
              <Button key={s.id} size="xs" variant={open === s.id ? 'primary' : 'outline'} onClick={() => setOpen(open === s.id ? null : s.id)}>{s.name}</Button>
            ))}
          </div>
          {open && (
            <MasterEditor<FeeItem>
              key={open} master="feeItems" readOnly={readOnly} rowKey={r => r.id} filter={r => r.scheduleId === open} addLabel="Add rate"
              blank={{ scheduleId: open, code: '', name: '', unitCode: 'DAY', rate: 0, taxRateId: '', vehicleTypeId: '' }}
              columns={[
                { key: 'code', label: 'Code', type: 'text', required: true, width: '110px' },
                { key: 'name', label: 'Description', type: 'text', required: true },
                { key: 'vehicleTypeId', label: 'Vehicle type', type: 'select', options: [{ value: '', label: 'Any' }, ...types.rows.map(t => ({ value: t.id, label: t.name }))] },
                { key: 'unitCode', label: 'Unit', type: 'select', options: [{ value: '', label: '—' }, ...units.rows.map(u => ({ value: u.code, label: u.name }))] },
                { key: 'rate', label: 'Rate', type: 'number', min: 0, step: '0.001', required: true, width: '110px' },
                { key: 'taxRateId', label: 'Tax', type: 'select', options: [{ value: '', label: 'Default' }, ...taxes.rows.map(t => ({ value: t.id, label: t.name }))] },
              ]}
            />
          )}
        </div>
      )}
    </Section>
  );
};

export const UniversalSettingsStep: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => (
  <div className="space-y-4">
    <GeneralSettings readOnly={readOnly} />
    <Section title="Tax rates" description="Add at least one (a 0% rate is fine if you are not VAT-registered). The default is pre-selected on new invoice lines.">
      <MasterEditor<TaxRate>
        master="taxRates" readOnly={readOnly} defaultFlag="taxRates" rowKey={r => r.id} addLabel="Add tax rate"
        blank={{ name: '', rate: 5, appliesTo: 'both', active: true }}
        columns={[
          { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'VAT 5%' },
          { key: 'rate', label: 'Rate %', type: 'number', min: 0, max: 100, step: '0.001', required: true, width: '100px' },
          { key: 'appliesTo', label: 'Applies to', type: 'select', options: [{ value: 'both', label: 'Sales & purchases' }, { value: 'sales', label: 'Sales' }, { value: 'purchase', label: 'Purchases' }] },
          { key: 'active', label: 'Active', type: 'checkbox' },
        ]}
      />
    </Section>
    <Section title="Payment terms">
      <MasterEditor<PaymentTerm>
        master="paymentTerms" readOnly={readOnly} defaultFlag="paymentTerms" rowKey={r => r.id} addLabel="Add payment term"
        blank={{ name: '', days: 30, active: true }}
        columns={[
          { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Net 30' },
          { key: 'days', label: 'Days', type: 'number', min: 0, max: 365, required: true, width: '100px' },
          { key: 'active', label: 'Active', type: 'checkbox' },
        ]}
      />
    </Section>
    <Section title="Units of measure">
      <MasterEditor<Unit>
        master="units" readOnly={readOnly} rowKey={r => r.code} addLabel="Add unit" blank={{ code: '', name: '', active: true }}
        columns={[
          { key: 'code', label: 'Code', type: 'text', required: true, editableOnCreateOnly: true, width: '110px', validate: v => (/^[A-Za-z0-9._-]{1,16}$/.test(String(v ?? '')) ? null : '1–16 letters/digits') },
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'active', label: 'Active', type: 'checkbox' },
        ]}
      />
    </Section>
    <DocumentFormats readOnly={readOnly} />
    <FeeSchedules readOnly={readOnly} />
  </div>
);
