// Home office + sharing controls for a client/supplier. The database enforces the same rules:
// the home office must be one where the user may create the party (RLS), and sharing changes
// go through set_party_sharing (edit rights in the home office).
import React from 'react';
import { Select } from '../ui/Input';
import { useAuth } from '../../context/AuthContext';
import { useFleet } from '../../context/FleetContext';
import type { PartySharing } from '../../types/operations';

export interface PartyOfficeValue {
  officeId: string;
  sharing: PartySharing;
  sharedOfficeIds: string[];
}

export const SHARING_LABEL: Record<PartySharing, string> = {
  office: 'This office only',
  selected: 'Selected offices',
  organization: 'All offices',
};

interface Props {
  module: 'customers' | 'suppliers';
  value: PartyOfficeValue;
  onChange: (v: PartyOfficeValue) => void;
  /** Existing party: the home office is changed with "Transfer to office", not here. */
  lockOffice?: boolean;
  disabled?: boolean;
}

export const PartyOfficeFields: React.FC<Props> = ({ module, value, onChange, lockOffice, disabled }) => {
  const { companies } = useFleet();
  const { hasPermission } = useAuth();
  const homeChoices = lockOffice ? companies.filter(c => c.id === value.officeId) : companies.filter(c => hasPermission('create', module, c.id));
  const others = companies.filter(c => c.id !== value.officeId);
  const noun = module === 'customers' ? 'client' : 'supplier';

  return (
    <div className="space-y-3 rounded-xl border border-slate-700 p-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Select label="Home office" value={value.officeId} required disabled={disabled || lockOffice}
          onChange={e => onChange({ ...value, officeId: e.target.value, sharedOfficeIds: value.sharedOfficeIds.filter(id => id !== e.target.value) })}>
          <option value="">Select office</option>
          {homeChoices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select label="Visible to" value={value.sharing} disabled={disabled || companies.length < 2}
          onChange={e => onChange({ ...value, sharing: e.target.value as PartySharing })}>
          {(Object.keys(SHARING_LABEL) as PartySharing[]).map(k => <option key={k} value={k}>{SHARING_LABEL[k]}</option>)}
        </Select>
      </div>
      {homeChoices.length === 0 && !lockOffice && (
        <p className="text-xs text-rose-500">You are not allowed to add a {noun} in any office.</p>
      )}
      {value.sharing === 'selected' && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold text-slate-300 mb-1">Share with</legend>
          {others.length === 0 && <p className="text-xs text-slate-400">There are no other offices.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {others.map(c => (
              <label key={c.id} className="flex items-center gap-2 text-xs text-slate-200">
                <input type="checkbox" className="w-4 h-4 accent-[#086343]" disabled={disabled}
                  checked={value.sharedOfficeIds.includes(c.id)}
                  onChange={e => onChange({ ...value, sharedOfficeIds: e.target.checked ? [...value.sharedOfficeIds, c.id] : value.sharedOfficeIds.filter(id => id !== c.id) })} />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p className="text-[11px] text-slate-400">
        The {noun} can be used on invoices, expenses and work orders only in offices it is visible to.
      </p>
    </div>
  );
};

export const validatePartyOffice = (v: PartyOfficeValue): string | null =>
  !v.officeId ? 'Choose the home office.' : v.sharing === 'selected' && v.sharedOfficeIds.length === 0 ? 'Choose at least one office to share with, or pick another visibility.' : null;
