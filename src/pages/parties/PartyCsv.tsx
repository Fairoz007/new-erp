// CSV import / export for clients and suppliers. The export uses the same columns as the import
// template (round trip), including custom fields as cf_<key>. Rows are imported one by one through
// the normal service, so RLS, duplicate blocking, registration approval and custom-field rules apply;
// each row reports its own result.
import React, { useMemo, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { exportToCSV } from '../../utils/export';
import { parseCsv } from '../setup/shared';
import { useCustomFields } from '../../hooks/useCustomFields';
import { formatCustomValue, normaliseCustomValues, validateCustomValues } from '../../components/common/CustomFieldsForm';
import type { FieldDefinition } from '../../services/org';
import type { Customer, PartySharing, Supplier, SupplierType } from '../../types/operations';

type Kind = 'customer' | 'supplier';
const SUPPLIER_TYPES: SupplierType[] = ['Vehicle Dealer', 'Garage', 'Workshop', 'Tyre Supplier', 'Oil Supplier', 'Parts Supplier', 'Insurance Company', 'Fuel Supplier', 'Rental Company', 'Other'];
const CUSTOMER_TYPES: Customer['customerType'][] = ['Corporate', 'Individual', 'Government', 'Partner'];
const BASE_COLS = ['code', 'name', 'type', 'contact_person', 'phone', 'email', 'address', 'city', 'country', 'vat_number', 'cr_number',
  'tax_number', 'payment_terms_days', 'credit_limit', 'status', 'home_office', 'sharing', 'notes'];
const norm = (v: string) => v.replace(/[\s\-./]/g, '').toUpperCase();

export function exportPartiesCsv(kind: Kind, rows: (Customer | Supplier)[], defs: FieldDefinition[], officeCode: (id: string) => string) {
  const cols = [...BASE_COLS, ...defs.map(d => `cf_${d.key}`)];
  const data: Record<string, unknown>[] = rows.map(p => ({
    code: kind === 'customer' ? (p as Customer).customerId : (p as Supplier).supplierId,
    name: p.name, type: kind === 'customer' ? (p as Customer).customerType : (p as Supplier).supplierType,
    contact_person: p.contactPerson, phone: p.phone, email: p.email, address: p.address, city: p.city, country: p.country,
    vat_number: p.vatNumber, cr_number: p.crNumber, tax_number: p.taxNumber, payment_terms_days: p.paymentTermsDays,
    credit_limit: p.creditLimit, status: p.status, home_office: officeCode(p.officeId), sharing: p.sharing, notes: p.notes ?? '',
    ...Object.fromEntries(defs.map(d => [`cf_${d.key}`, d.fieldType === 'file' ? '' : formatCustomValue(d, p.customFields?.[d.key])])),
  }));
  exportToCSV<Record<string, unknown>>(kind === 'customer' ? 'clients' : 'suppliers', data.length ? data : [Object.fromEntries(cols.map(c => [c, '']))],
    cols.map(c => ({ key: c, label: c })));
}

interface Parsed { line: number; raw: Record<string, string>; officeId: string; sharing: PartySharing; errors: string[] }
type Result = { line: number; ok: boolean; text: string };

export const PartyImportModal: React.FC<{ kind: Kind; onClose: () => void }> = ({ kind, onClose }) => {
  const fleet = useFleet();
  const { companies, selectedCompanyId } = fleet;
  const { hasPermission } = useAuth();
  const module = kind === 'customer' ? 'customers' : 'suppliers';
  const cf = useCustomFields(kind === 'customer' ? 'client' : 'supplier');
  const existing: (Customer | Supplier)[] = kind === 'customer' ? fleet.customers : fleet.suppliers;
  const offices = companies.filter(c => hasPermission('create', module, c.id));
  const [officeId, setOfficeId] = useState(offices.some(o => o.id === selectedCompanyId) ? selectedCompanyId : offices[0]?.id ?? '');
  const [rows, setRows] = useState<Parsed[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const types = kind === 'customer' ? CUSTOMER_TYPES : SUPPLIER_TYPES;
  const fileCfKeys = useMemo(() => new Set(cf.defs.map(d => `cf_${d.key}`)), [cf.defs]);

  const template = () => exportPartiesCsv(kind, [], cf.defs.filter(d => d.fieldType !== 'file'), () => '');

  const validate = (list: Record<string, string>[], headers: string[]): Parsed[] => {
    const unknown = headers.filter(h => h && !BASE_COLS.includes(h) && !fileCfKeys.has(h));
    const seen = { vat: new Map<string, number>(), cr: new Map<string, number>(), email: new Map<string, number>() };
    const known = {
      vat: new Set(existing.map(p => norm(p.vatNumber || '')).filter(Boolean)),
      cr: new Set(existing.map(p => norm(p.crNumber || '')).filter(Boolean)),
      email: new Set(existing.map(p => (p.email || '').trim().toLowerCase()).filter(Boolean)),
    };
    return list.map((raw, i) => {
      const line = i + 2;
      const errors: string[] = [];
      if (i === 0 && unknown.length) errors.push(`Unknown column(s) ignored: ${unknown.join(', ')}`);
      if (!raw.name) errors.push('Name is required');
      if (raw.type && !types.includes(raw.type as never)) errors.push(`Type must be one of: ${types.join(', ')}`);
      if (raw.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw.email)) errors.push('Email is not valid');
      for (const k of ['payment_terms_days', 'credit_limit'] as const) {
        if (raw[k] && !(Number(raw[k]) >= 0)) errors.push(`${k.replace(/_/g, ' ')} must be a number ≥ 0`);
      }
      const office = raw.home_office ? companies.find(c => c.code.toLowerCase() === raw.home_office.toLowerCase())?.id ?? '' : officeId;
      if (!office) errors.push(`Unknown office code "${raw.home_office}"`);
      else if (!hasPermission('create', module, office)) errors.push('You cannot add records in that office');
      const sharing = (raw.sharing || 'office') as PartySharing;
      if (!['office', 'organization'].includes(sharing)) errors.push('Sharing must be "office" or "organization" (set selected offices after import)');
      for (const [key, value] of [['vat', raw.vat_number ? norm(raw.vat_number) : ''], ['cr', raw.cr_number ? norm(raw.cr_number) : ''], ['email', (raw.email || '').toLowerCase()]] as const) {
        if (!value) continue;
        if (known[key].has(value)) errors.push(`${key.toUpperCase()} already registered`);
        const prev = seen[key].get(value);
        if (prev) errors.push(`${key.toUpperCase()} repeats line ${prev}`); else seen[key].set(value, line);
      }
      const fields = cf.fieldsFor(office || undefined);
      const values = Object.fromEntries(fields.map(f => [f.def.key, raw[`cf_${f.def.key}`] ?? '']).map(([k, v]) => {
        const def = fields.find(f => f.def.key === k)!.def;
        return [k, def.fieldType === 'boolean' ? ['yes', 'true', '1'].includes(String(v).toLowerCase()) : v];
      }));
      const cfErr = validateCustomValues(fields.filter(f => f.def.fieldType !== 'file'), values);
      errors.push(...Object.values(cfErr));
      if (fields.some(f => f.def.fieldType === 'file' && f.visibility === 'required')) errors.push('A required file field must be filled in on the record after import');
      return { line, raw, officeId: office, sharing, errors };
    });
  };

  const onFile = async (file?: File) => {
    setResults(null); setFileError(null); setRows(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setFileError('The file is larger than 2 MB.'); return; }
    const { headers, rows: list } = parseCsv(await file.text());
    if (!headers.includes('name')) { setFileError('The file needs a "name" column. Download the template to see the columns.'); return; }
    if (list.length === 0) { setFileError('The file has no rows.'); return; }
    if (list.length > 1000) { setFileError('Import at most 1000 rows at a time.'); return; }
    setRows(validate(list, headers));
  };

  const good = (rows ?? []).filter(r => r.errors.length === 0 || (r.errors.length === 1 && r.errors[0].startsWith('Unknown column')));

  const run = async () => {
    if (!good.length) return;
    setBusy(true);
    const out: Result[] = [];
    for (const r of good) {
      const raw = r.raw;
      const fields = cf.fieldsFor(r.officeId);
      const values = Object.fromEntries(fields.filter(f => f.def.fieldType !== 'file').map(f => [f.def.key, raw[`cf_${f.def.key}`] ?? '']));
      const common = {
        name: raw.name, contactPerson: raw.contact_person ?? '', phone: raw.phone ?? '', email: raw.email ?? '', address: raw.address ?? '',
        city: raw.city ?? '', country: raw.country ?? '', vatNumber: raw.vat_number ?? '', crNumber: raw.cr_number ?? '', taxNumber: raw.tax_number ?? '',
        paymentTermsDays: raw.payment_terms_days ? Number(raw.payment_terms_days) : 30, creditLimit: raw.credit_limit ? Number(raw.credit_limit) : 0,
        notes: raw.notes ?? '', officeId: r.officeId, sharing: r.sharing, sharedOfficeIds: [] as string[],
        customFields: normaliseCustomValues(fields.filter(f => f.def.fieldType !== 'file'), values),
      };
      try {
        if (kind === 'customer') {
          const c = await fleet.addCustomer({ ...common, customerType: (raw.type || 'Corporate') as Customer['customerType'], status: raw.status === 'Inactive' ? 'Inactive' : 'Active' });
          out.push({ line: r.line, ok: true, text: `${c.customerId} ${c.name}${c.registration.status === 'Pending' ? ' (waiting for approval)' : ''}` });
        } else {
          const s = await fleet.addSupplier({
            ...common, supplierType: (raw.type || 'Other') as SupplierType,
            status: (['Inactive', 'Blocked'].includes(raw.status) ? raw.status : 'Active') as Supplier['status'],
            bankDetails: { bankName: '', accountNumber: '', iban: '', swiftCode: '' },
          });
          out.push({ line: r.line, ok: true, text: `${s.supplierId} ${s.name}${s.registration.status === 'Pending' ? ' (waiting for approval)' : ''}` });
        }
      } catch (e) {
        out.push({ line: r.line, ok: false, text: (e as Error).message });
      }
      setResults([...out]);
    }
    setBusy(false);
  };

  const noun = kind === 'customer' ? 'clients' : 'suppliers';
  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="2xl" title={`Import ${noun} from CSV`}
      description="Each row is checked before import; duplicates (VAT, CR, email) and invalid rows are skipped.">
      <div className="space-y-4 text-xs">
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Default home office" value={officeId} onChange={e => { setOfficeId(e.target.value); setRows(null); setResults(null); }}
            hint='Used when a row has no "home_office" code'>
            {offices.map(o => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
          </Select>
          <Button variant="outline" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={template}>Download template</Button>
          <label className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-slate-700 cursor-pointer hover:bg-slate-850">
            <Upload className="w-4 h-4" /> Choose CSV file
            <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy || !officeId} onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        {offices.length === 0 && <p className="text-rose-500">You cannot add {noun} in any office.</p>}
        {fileError && <p role="alert" className="text-rose-500">{fileError}</p>}
        {rows && (
          <>
            <p className="text-slate-300">{rows.length} row(s): <b className="text-emerald-600">{good.length} ready</b>, <b className="text-rose-500">{rows.length - good.length} with problems</b>.</p>
            <div className="max-h-72 overflow-auto rounded-xl border border-slate-700">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white text-slate-400"><tr><th className="px-2 py-1">Line</th><th className="px-2 py-1">Name</th><th className="px-2 py-1">Office</th><th className="px-2 py-1">Check</th><th className="px-2 py-1">Result</th></tr></thead>
                <tbody className="divide-y divide-slate-700/60">
                  {rows.map(r => {
                    const res = results?.find(x => x.line === r.line);
                    return (
                      <tr key={r.line}>
                        <td className="px-2 py-1 font-mono">{r.line}</td>
                        <td className="px-2 py-1 text-slate-200">{r.raw.name || '—'}</td>
                        <td className="px-2 py-1">{companies.find(c => c.id === r.officeId)?.code ?? '—'}</td>
                        <td className={`px-2 py-1 ${r.errors.length ? 'text-rose-500' : 'text-emerald-600'}`}>{r.errors.length ? r.errors.join('; ') : 'OK'}</td>
                        <td className={`px-2 py-1 ${res ? (res.ok ? 'text-emerald-600' : 'text-rose-500') : 'text-slate-400'}`}>{res ? res.text : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {results && !busy && (
          <p className="font-semibold text-slate-200">Imported {results.filter(r => r.ok).length} of {good.length}. {results.some(r => !r.ok) && 'Rows that failed show the reason above.'}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>{results ? 'Close' : 'Cancel'}</Button>
          {!results && <Button onClick={() => void run()} isLoading={busy} disabled={busy || good.length === 0}>Import {good.length} row(s)</Button>}
        </div>
      </div>
    </Modal>
  );
};
