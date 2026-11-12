// The one record picker (vehicle, employee, supplier, customer, bank account, ...).
// * A blank first option, so nothing looks chosen until the user chooses.
// * Inactive records are never hidden: they are listed as "(inactive)" and cannot be picked, so the
//   user sees why a record is missing. The record the form already points at is always listed (even
//   if inactive or outside the list), so editing never silently changes the value.
// * Long lists (more than SEARCH_FROM options) get a search box above the select; the chosen record
//   stays listed whatever the search.
// Office filtering is the caller's job (pass only the records of the form's office); `inactive` and
// `label` come from the caller too, because each record type has its own flag and label.
import { useId, useMemo, useState } from 'react';
import { Input, Select, type SelectProps } from './Input';

export interface RecordOption { value: string; label: string; inactive?: boolean; inactiveLabel?: string }

export const SEARCH_FROM = 12;
const MAX_SHOWN = 300;

export interface RecordSelectProps extends Omit<SelectProps, 'options' | 'children' | 'onChange'> {
  options: RecordOption[];
  value: string;
  onChange: (value: string) => void;
  /** Text of the blank option. */
  placeholder?: string;
  /** A record the form points at that is not in `options` (e.g. another office, or archived). */
  current?: RecordOption;
  searchable?: boolean;
}

export function RecordSelect({ options, value, onChange, placeholder = 'Select…', current, searchable, label, id, ...rest }: RecordSelectProps) {
  const [q, setQ] = useState('');
  const autoId = useId();
  const selectId = id ?? autoId;
  const showSearch = searchable ?? options.length > SEARCH_FROM;

  const list = useMemo(() => {
    let all = options;
    if (value && !all.some(o => o.value === value)) all = [current && current.value === value ? current : { value, label: 'Current selection (not available)', inactive: true }, ...all];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (o: RecordOption) => o.value === value || words.every(w => o.label.toLowerCase().includes(w));
    const found = words.length ? all.filter(hit) : all;
    return { shown: found.slice(0, MAX_SHOWN), more: Math.max(0, found.length - MAX_SHOWN), none: words.length > 0 && found.every(o => o.value === value) };
  }, [options, value, current, q]);

  return (
    <div className="space-y-1.5">
      <Select label={label} id={selectId} value={value} onChange={e => onChange(e.target.value)} {...rest}>
        <option value="">{placeholder}</option>
        {list.shown.map(o => (
          <option key={o.value} value={o.value} disabled={o.inactive && o.value !== value}>
            {o.inactive ? `${o.label} (${o.inactiveLabel ?? 'inactive'})` : o.label}
          </option>
        ))}
        {list.more > 0 && <option disabled value="__more">{`${list.more} more — type to narrow the list`}</option>}
      </Select>
      {showSearch && (
        <Input type="search" aria-label={`Search ${label ?? 'options'}`} aria-controls={selectId} placeholder="Type to filter the list"
          value={q} onChange={e => setQ(e.target.value)} hint={list.none ? 'No match' : undefined} />
      )}
    </div>
  );
}

// Option builders for the common record types (one label format each).
export const vehicleOption = (v: { id: string; plateNumber: string; brand?: string; model?: string; status?: string }): RecordOption => ({
  value: v.id, label: [v.plateNumber, [v.brand, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
  inactive: v.status === 'Sold' || v.status === 'Scrapped', inactiveLabel: v.status?.toLowerCase(),
});
export const employeeOption = (e: { id: string; name: string; employeeCode?: string; status?: string }): RecordOption => ({
  value: e.id, label: e.employeeCode ? `${e.name} · ${e.employeeCode}` : e.name,
  inactive: e.status === 'Terminated', inactiveLabel: 'terminated',
});
export const partyOption = (p: { id: string; name: string; status?: string }): RecordOption => ({
  value: p.id, label: p.name, inactive: !!p.status && p.status !== 'Active', inactiveLabel: p.status?.toLowerCase(),
});
export const bankOption = (b: { id: string; bankName?: string; accountName?: string; active?: boolean }): RecordOption => ({
  value: b.id, label: [b.bankName, b.accountName].filter(Boolean).join(' · '), inactive: b.active === false,
});
