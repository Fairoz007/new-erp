// Renders the custom fields that apply to one record (entity + office + vehicle type) from
// field_definitions / field_office_settings. Validation here is for fast feedback only: the
// validate_custom_fields() trigger enforces the same rules in the database.
import React, { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Input, Select } from '../ui/Input';
import type { FieldDefinition, FieldEntity, FieldOfficeSetting } from '../../services/org';
import { uploadFile } from '../../services/storage';

export type CustomValues = Record<string, unknown>;
export type Visibility = 'shown' | 'required' | 'hidden';

export function applicableFields(defs: FieldDefinition[], settings: FieldOfficeSetting[], entity: FieldEntity, officeId?: string, vehicleTypeId?: string) {
  return defs
    .filter(d => d.entity === entity && d.active && (!d.officeId || d.officeId === officeId) && (!d.vehicleTypeId || d.vehicleTypeId === vehicleTypeId))
    .map(d => {
      const s = officeId ? settings.find(x => x.fieldId === d.id && x.officeId === officeId) : undefined;
      const visibility: Visibility = s?.visibility ?? (d.required ? 'required' : 'shown');
      return { def: d, visibility };
    })
    .filter(f => f.visibility !== 'hidden')
    .sort((a, b) => a.def.sortOrder - b.def.sortOrder || a.def.label.localeCompare(b.def.label));
}

export function validateCustomValues(fields: ReturnType<typeof applicableFields>, values: CustomValues): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const { def, visibility } of fields) {
    const v = values[def.key];
    const blank = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (blank) { if (visibility === 'required') errs[def.key] = `${def.label} is required`; continue; }
    if (def.fieldType === 'number' && Number.isNaN(Number(v))) errs[def.key] = `${def.label} must be a number`;
    if (def.fieldType === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errs[def.key] = `${def.label} must be a date`;
    if (def.fieldType === 'dropdown' && !def.options.includes(String(v))) errs[def.key] = `Choose a value for ${def.label}`;
  }
  return errs;
}

// '' -> removed, numbers as numbers, booleans as booleans (what the trigger stores)
export function normaliseCustomValues(fields: ReturnType<typeof applicableFields>, values: CustomValues, keepKeys: string[] = []): CustomValues {
  const out: CustomValues = {};
  for (const k of keepKeys) if (values[k] !== undefined) out[k] = values[k]; // hidden fields keep their stored value
  for (const { def } of fields) {
    const v = values[def.key];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) continue;
    out[def.key] = def.fieldType === 'number' ? Number(v) : def.fieldType === 'boolean' ? !!v : typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

interface Props {
  fields: ReturnType<typeof applicableFields>;
  values: CustomValues;
  onChange: (v: CustomValues) => void;
  errors?: Record<string, string>;
  companyId?: string;       // needed for file uploads
  disabled?: boolean;
  columns?: 1 | 2;
}

export const CustomFieldsForm: React.FC<Props> = ({ fields, values, onChange, errors = {}, companyId, disabled, columns = 2 }) => {
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<Record<string, string>>({});
  if (fields.length === 0) return null;
  const set = (k: string, v: unknown) => onChange({ ...values, [k]: v });

  const upload = async (key: string, file?: File) => {
    if (!file || !companyId) return;
    setUploading(key);
    setUploadErr(e => ({ ...e, [key]: '' }));
    try {
      const stored = await uploadFile(file, companyId, 'documents');
      set(key, stored.path);
    } catch (e) {
      setUploadErr(x => ({ ...x, [key]: (e as Error).message }));
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className={`grid grid-cols-1 ${columns === 2 ? 'sm:grid-cols-2' : ''} gap-3`}>
      {fields.map(({ def, visibility }) => {
        const required = visibility === 'required';
        const v = values[def.key];
        const err = errors[def.key] || uploadErr[def.key];
        switch (def.fieldType) {
          case 'number':
            return <Input key={def.id} label={def.label} required={required} type="number" step="any" value={v == null ? '' : String(v)} hint={def.helpText} error={err} disabled={disabled} onChange={e => set(def.key, e.target.value)} />;
          case 'date':
            return <Input key={def.id} label={def.label} required={required} type="date" value={v == null ? '' : String(v)} hint={def.helpText} error={err} disabled={disabled} onChange={e => set(def.key, e.target.value)} />;
          case 'dropdown':
            return <Select key={def.id} label={def.label} required={required} value={v == null ? '' : String(v)} hint={def.helpText} error={err} disabled={disabled}
              onChange={e => set(def.key, e.target.value)} options={[{ value: '', label: 'Select…' }, ...def.options.map(o => ({ value: o, label: o }))]} />;
          case 'boolean':
            return (
              <label key={def.id} className="flex items-center gap-2 text-sm text-slate-100 pt-6">
                <input type="checkbox" className="w-4 h-4 accent-[#086343]" checked={!!v} disabled={disabled} onChange={e => set(def.key, e.target.checked)} />
                {def.label}{required && <span className="text-rose-500">*</span>}
              </label>
            );
          case 'file':
            return (
              <div key={def.id} className="flex flex-col gap-1.5">
                <span className="text-xs sm:text-sm font-semibold text-slate-100">{def.label} {required && <span className="text-rose-500">*</span>}</span>
                <label className={`inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-700 text-xs ${disabled || !companyId ? 'opacity-60' : 'cursor-pointer hover:bg-slate-850'}`}>
                  <Paperclip className="w-4 h-4" />
                  <span className="truncate">{uploading === def.key ? 'Uploading…' : v ? String(v).split('/').pop() : companyId ? 'Attach file (PDF or image)' : 'Choose an office first'}</span>
                  <input type="file" className="hidden" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={disabled || !companyId || uploading === def.key}
                    onChange={e => { void upload(def.key, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {err ? <p className="text-xs text-rose-500">{err}</p> : def.helpText ? <p className="text-xs text-slate-400">{def.helpText}</p> : null}
              </div>
            );
          default:
            return <Input key={def.id} label={def.label} required={required} value={v == null ? '' : String(v)} hint={def.helpText} error={err} disabled={disabled} maxLength={2000} onChange={e => set(def.key, e.target.value)} />;
        }
      })}
    </div>
  );
};
