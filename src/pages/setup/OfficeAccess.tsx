// Office access: the "All offices / Chosen offices" choice with one card per office and the role
// held there, and the read-only users × offices overview. Used by Setup Wizard step 5 and by
// Users & Roles. The database enforces every rule (only a Super Admin may set profiles.all_offices,
// company_members RLS for office assignments); these screens only show what is allowed.
import React, { useMemo } from 'react';
import { Building2, Globe2, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { OfficeBadge, AllOfficesBadge, useOfficeLogoUrls } from '../../components/common/OfficeBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useOffices, LoadState, tableCls, thCls, tdCls } from './shared';
import type { User } from '../../types/system';

export type Assign = { company_id: string; role_id: string | null };

interface PickerProps {
  allOffices: boolean;
  onAllOffices: (v: boolean) => void;
  offices: Assign[];
  onOffices: (v: Assign[]) => void;
  /** Offices whose membership the signed-in user may change. */
  manageable: (companyId: string) => boolean;
  /** Only a Super Admin may give (or take away) access to all offices. */
  canGrantAll: boolean;
  disabled?: boolean;
  error?: string;
}

const Choice: React.FC<{ checked: boolean; disabled: boolean; onSelect: () => void; icon: React.ReactNode; title: string; text: string; name: string }> = ({
  checked, disabled, onSelect, icon, title, text, name,
}) => (
  <label className={`flex items-start gap-3 rounded-card border p-3 text-xs transition-colors ${
    checked ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-700 bg-white'
  } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-slate-600'}`}>
    <input type="radio" name={name} className="mt-0.5 w-4 h-4 accent-brand-500" checked={checked} disabled={disabled} onChange={onSelect} />
    <span className="text-slate-400 shrink-0" aria-hidden="true">{icon}</span>
    <span className="min-w-0">
      <span className="block font-semibold text-slate-100">{title}</span>
      <span className="block text-slate-400 mt-0.5">{text}</span>
    </span>
  </label>
);

export const OfficeAccessPicker: React.FC<PickerProps> = ({
  allOffices, onAllOffices, offices: value, onOffices, manageable, canGrantAll, disabled, error,
}) => {
  const { offices, loading, error: loadError, reload } = useOffices();
  const { roles } = useAuth();
  const logoUrl = useOfficeLogoUrls(offices.map(o => o.logo));
  const codes = offices.map(o => o.code);
  const name = React.useId();
  const lockAll = disabled || !canGrantAll;

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-xs font-semibold text-slate-300 mb-2">Office access</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Office access">
        <Choice name={name} checked={allOffices} disabled={lockAll} onSelect={() => onAllOffices(true)}
          icon={<Globe2 className="w-4 h-4" />} title="All offices"
          text={canGrantAll ? 'Every office, including offices added later.' : 'Every office, including offices added later. Only a Super Admin can give or remove this.'} />
        <Choice name={name} checked={!allOffices} disabled={lockAll && allOffices} onSelect={() => onAllOffices(false)}
          icon={<Building2 className="w-4 h-4" />} title="Chosen offices"
          text="Only the offices ticked below, each with the role held there." />
      </div>

      {!allOffices && (
        <LoadState loading={loading} error={loadError} onRetry={reload} empty={offices.length === 0} emptyText="No offices yet (Setup Wizard step 3).">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {offices.map(o => {
              const a = value.find(x => x.company_id === o.id);
              const can = manageable(o.id) && !disabled;
              const toggle = () => onOffices(a ? value.filter(x => x.company_id !== o.id) : [...value, { company_id: o.id, role_id: null }]);
              return (
                <li key={o.id} className={`rounded-card border p-3 space-y-2 ${a ? 'border-brand-500 bg-brand-50/60' : 'border-slate-700 bg-white'} ${can ? '' : 'opacity-60'}`}>
                  <label className={`flex items-center gap-3 text-xs ${can ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                    <input type="checkbox" className="w-4 h-4 accent-brand-500" checked={!!a} disabled={!can} onChange={toggle} />
                    <OfficeBadge office={o} allCodes={codes} logoUrl={logoUrl(o.logo)} size="sm" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-100 truncate" title={o.name}>{o.name}</span>
                      <span className="block text-slate-400 font-mono">{o.code}{o.city ? ` · ${o.city}` : ''}</span>
                    </span>
                  </label>
                  {a && (
                    <select aria-label={`Role in ${o.name}`} disabled={!can}
                      className="w-full h-10 sm:h-9 rounded-control border border-slate-700 px-2 text-xs bg-white"
                      value={a.role_id ?? ''}
                      onChange={e => onOffices(value.map(x => (x.company_id === o.id ? { ...x, role_id: e.target.value || null } : x)))}>
                      <option value="">Same as organization role</option>
                      {roles.filter(r => !r.isSuper).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  )}
                  {!can && !disabled && <p className="text-2xs text-slate-400">You do not manage users in this office.</p>}
                </li>
              );
            })}
          </ul>
        </LoadState>
      )}
      {error && <p role="alert" className="text-xs text-danger-700">{error}</p>}
    </fieldset>
  );
};

/** Role a user holds in an office, or null when the user cannot open it. */
export function roleInOffice(
  u: Pick<User, 'id' | 'roleId' | 'allOffices'>,
  officeId: string,
  memberships: { userId: string; companyId: string; roleId: string | null }[],
  isSuperRole: (roleId: string | null | undefined) => boolean,
): { roleId: string | null | undefined; via: 'super' | 'all' | 'member' } | null {
  if (isSuperRole(u.roleId)) return { roleId: u.roleId, via: 'super' };
  const m = memberships.find(x => x.userId === u.id && x.companyId === officeId);
  if (m) return { roleId: m.roleId ?? u.roleId, via: 'member' };
  if (u.allOffices) return { roleId: u.roleId, via: 'all' };
  return null;
}

/** Read-only grid: who can open which office, and with which role. */
export const AccessOverview: React.FC = () => {
  const { users, memberships, roleById } = useAuth();
  const { offices, loading, error, reload } = useOffices();
  const logoUrl = useOfficeLogoUrls(offices.map(o => o.logo));
  const codes = offices.map(o => o.code);
  const isSuper = (id: string | null | undefined) => !!roleById(id)?.isSuper;
  const active = useMemo(() => [...users].sort((a, b) => a.name.localeCompare(b.name)), [users]);

  const cell = (u: User, officeId: string) => {
    const r = roleInOffice(u, officeId, memberships, isSuper);
    if (!r) return <span className="text-slate-400" aria-label="No access">—</span>;
    return (
      <span className="inline-flex items-center gap-1 text-slate-200">
        <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" aria-hidden="true" />
        {roleById(r.roleId)?.name ?? 'Role not found'}
        {r.via === 'all' && <span className="text-2xs text-slate-400">(all offices)</span>}
      </span>
    );
  };

  if (!loading && !error && users.length === 0) {
    return <EmptyState title="No users to show" description="People appear here once they have an account you are allowed to see." />;
  }

  return (
    <LoadState loading={loading} error={error} onRetry={reload} empty={offices.length === 0} emptyText="No offices yet.">
      <p className="text-xs text-slate-400 mb-3">
        Read-only. Each cell shows the role a person holds in that office; change it from the Users tab.
        <span className="inline-flex items-center gap-1 ml-2"><AllOfficesBadge size="sm" /> All offices also covers offices added later.</span>
      </p>
      {/* desktop and tablet: users × offices table */}
      <div className="hidden sm:block overflow-auto max-h-[70vh] border border-slate-700 rounded-card">
        <table className={tableCls}>
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th scope="col" className={thCls}>User</th>
              {offices.map(o => (
                <th key={o.id} scope="col" className={thCls}>
                  <span className="flex items-center gap-2 normal-case tracking-normal">
                    <OfficeBadge office={o} allCodes={codes} logoUrl={logoUrl(o.logo)} size="sm" />
                    <span className="text-slate-300">{o.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map(u => (
              <tr key={u.id}>
                <th scope="row" className={`${tdCls} font-normal`}>
                  <span className="block font-semibold text-slate-100">{u.name}</span>
                  <span className="block text-slate-400">{u.email}{u.status !== 'active' ? ' · inactive' : ''}</span>
                </th>
                {offices.map(o => <td key={o.id} className={tdCls}>{cell(u, o.id)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* phone: one card per user */}
      <ul className="sm:hidden space-y-2">
        {active.map(u => (
          <li key={u.id} className="border border-slate-700 rounded-card p-3 text-xs bg-white">
            <p className="font-semibold text-slate-100">{u.name}</p>
            <p className="text-slate-400 mb-2 break-all">{u.email}{u.status !== 'active' ? ' · inactive' : ''}</p>
            <dl className="space-y-1">
              {offices.map(o => (
                <div key={o.id} className="flex items-center justify-between gap-2">
                  <dt className="text-slate-300 truncate min-w-0" title={o.name}>{o.name}</dt>
                  <dd>{cell(u, o.id)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </LoadState>
  );
};
