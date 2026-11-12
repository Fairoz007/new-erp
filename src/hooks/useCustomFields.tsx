// Custom field configuration for one record type: the form fields that apply to a record, the
// list columns (definitions marked "show in list"), search text and a filter control. Definitions
// load once per session and reload when the Field Builder saves.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as org from '../services/org';
import type { FieldDefinition, FieldEntity, FieldOfficeSetting } from '../services/org';
import type { Column } from '../components/ui/DataTable';
import { CustomFieldsForm, applicableFields, formatCustomValue, normaliseCustomValues, validateCustomValues } from '../components/common/CustomFieldsForm';
import { FilterInput, FilterSelect } from '../components/ui/FilterControls';

interface Config { defs: FieldDefinition[]; settings: FieldOfficeSetting[] }
let cache: Promise<Config> | null = null;
const load = () => (cache ??= Promise.all([org.listMaster('fieldDefinitions'), org.listFieldOfficeSettings()])
  .then(([defs, settings]) => ({ defs: defs as FieldDefinition[], settings }))
  .catch(e => { cache = null; throw e; }));
org.fieldConfigEvents.addEventListener('change', () => { cache = null; });

type WithCustom = { customFields?: Record<string, unknown> };

export function useCustomFields(entity: FieldEntity) {
  const [cfg, setCfg] = useState<Config>({ defs: [], settings: [] });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    load().then(c => { setCfg(c); setError(null); }).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    refresh();
    const on = () => refresh();
    org.fieldConfigEvents.addEventListener('change', on);
    return () => org.fieldConfigEvents.removeEventListener('change', on);
  }, [refresh]);

  const defs = useMemo(() => cfg.defs.filter(d => d.entity === entity && d.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)), [cfg.defs, entity]);

  /** Fields of a form for this office (and vehicle type). */
  const fieldsFor = useCallback((officeId?: string, vehicleTypeId?: string) =>
    applicableFields(cfg.defs, cfg.settings, entity, officeId, vehicleTypeId), [cfg, entity]);

  /** Keys hidden in this office: their stored values are kept when the record is saved. */
  const hiddenKeys = useCallback((officeId?: string) => cfg.settings
    .filter(s => s.officeId === officeId && s.visibility === 'hidden')
    .map(s => cfg.defs.find(d => d.id === s.fieldId)?.key).filter((k): k is string => !!k), [cfg]);

  /** Table columns for definitions marked "show in list" (sortable; CSV/PDF use the shown text). */
  const listColumns = useCallback(<T extends WithCustom>(): Column<T>[] => defs.filter(d => d.showInList).map(d => ({
    key: `cf_${d.key}`,
    header: d.label,
    value: (row: T) => {
      const v = row.customFields?.[d.key];
      return d.fieldType === 'number' && v !== undefined && v !== null ? Number(v) : formatCustomValue(d, v);
    },
    render: (row: T) => <span className="text-slate-300 text-xs">{formatCustomValue(d, row.customFields?.[d.key]) || '—'}</span>,
  })), [defs]);

  /** Text of all custom values of a row, for table search. */
  const searchText = useCallback((row: WithCustom) =>
    defs.map(d => formatCustomValue(d, row.customFields?.[d.key])).filter(Boolean).join(' '), [defs]);

  return { defs, fieldsFor, hiddenKeys, listColumns, searchText, loading, error, refresh };
}

/** Filter by one custom field: dropdown / yes-no equality, text contains, number and date ranges. */
export function useCustomFieldFilter<T extends WithCustom>(defs: FieldDefinition[], rows: T[]) {
  const filterable = defs.filter(d => d.fieldType !== 'file');
  const [fieldKey, setFieldKey] = useState('');
  const [value, setValue] = useState('');
  const [to, setTo] = useState('');
  const def = filterable.find(d => d.key === fieldKey);

  const filtered = useMemo(() => {
    if (!def || (value === '' && to === '')) return rows;
    return rows.filter(r => {
      const v = r.customFields?.[def.key];
      switch (def.fieldType) {
        case 'boolean': return (value === 'yes') === !!v;
        case 'dropdown': return String(v ?? '') === value;
        case 'number': {
          if (v === undefined || v === null || v === '') return false;
          const n = Number(v);
          return (value === '' || n >= Number(value)) && (to === '' || n <= Number(to));
        }
        case 'date': {
          if (!v) return false;
          const d = String(v);
          return (value === '' || d >= value) && (to === '' || d <= to);
        }
        default: return String(v ?? '').toLowerCase().includes(value.toLowerCase());
      }
    });
  }, [rows, def, value, to]);

  const ui = filterable.length === 0 ? null : (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect aria-label="Filter by custom field" value={fieldKey} onChange={e => { setFieldKey(e.target.value); setValue(''); setTo(''); }}>
        <option value="">Filter by field…</option>
        {filterable.map(d => <option key={d.id} value={d.key}>{d.label}</option>)}
      </FilterSelect>
      {def && (def.fieldType === 'dropdown' || def.fieldType === 'boolean') && (
        <FilterSelect aria-label={def.label} value={value} onChange={e => setValue(e.target.value)}>
          <option value="">Any</option>
          {(def.fieldType === 'boolean' ? ['yes', 'no'] : def.options).map(o => <option key={o} value={o}>{def.fieldType === 'boolean' ? (o === 'yes' ? 'Yes' : 'No') : o}</option>)}
        </FilterSelect>
      )}
      {def && (def.fieldType === 'number' || def.fieldType === 'date') && (
        <>
          <FilterInput aria-label={`${def.label} from`} type={def.fieldType} value={value} onChange={e => setValue(e.target.value)} placeholder="From" />
          <FilterInput aria-label={`${def.label} to`} type={def.fieldType} value={to} onChange={e => setTo(e.target.value)} placeholder="To" />
        </>
      )}
      {def && def.fieldType === 'text' && (
        <FilterInput aria-label={def.label} value={value} onChange={e => setValue(e.target.value)} placeholder="Contains…" />
      )}
      {def && (value !== '' || to !== '') && (
        <button type="button" className="text-xs text-slate-400 hover:underline" onClick={() => { setValue(''); setTo(''); }}>Clear</button>
      )}
    </div>
  );
  return { filtered, ui };
}

/**
 * Custom fields block of an entity form. Usage:
 *   const cf = useCustomFieldsEditor('vehicle', officeId, initial, vehicleTypeId);
 *   ...{cf.node}...   on submit: if (!cf.validate()) return; payload.customFields = cf.value();
 */
export function useCustomFieldsEditor(entity: FieldEntity, officeId: string | undefined, initial: Record<string, unknown> | undefined, vehicleTypeId?: string, opts: { disabled?: boolean; title?: string } = {}) {
  const { fieldsFor, hiddenKeys, error } = useCustomFields(entity);
  const [values, setValues] = useState<Record<string, unknown>>(initial ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const initialKey = JSON.stringify(initial ?? {});
  useEffect(() => { setValues(JSON.parse(initialKey)); setErrors({}); }, [initialKey]);
  const fields = fieldsFor(officeId, vehicleTypeId);

  const validate = () => {
    const e = validateCustomValues(fields, values);
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  // fields that are hidden here or do not apply (other office / vehicle type) keep their stored values
  const value = () => {
    const shown = new Set(fields.map(f => f.def.key));
    const keep = [...hiddenKeys(officeId), ...Object.keys(initial ?? {}).filter(k => !shown.has(k))];
    return normaliseCustomValues(fields, values, keep);
  };

  const node = (fields.length > 0 || error) ? (
    <section className="space-y-2">
      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{opts.title ?? 'Additional information'}</h4>
      {error && <p className="text-xs text-rose-500">Custom fields could not be loaded: {error}</p>}
      <CustomFieldsForm fields={fields} values={values} onChange={setValues} errors={errors} companyId={officeId} disabled={opts.disabled} />
    </section>
  ) : null;
  const reset = () => { setValues(JSON.parse(initialKey)); setErrors({}); };
  return { node, validate, value, fields, reset };
}

/** Inserts custom field columns before the actions column (if any). */
export function withCustomColumns<T>(base: Column<T>[], extra: Column<T>[]): Column<T>[] {
  const i = base.findIndex(c => c.key === 'actions');
  return i < 0 ? [...base, ...extra] : [...base.slice(0, i), ...extra, ...base.slice(i)];
}
