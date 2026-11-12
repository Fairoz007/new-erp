// Roles & permissions editor (Setup step 4, Users & Roles page). Roles are data; only a Super Admin
// can change them (the RPCs re-check). Everyone with users-roles:view can read the matrix.
import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Save, Shield, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import * as auth from '../../services/auth';
import type { Permission } from '../../types/system';
import { NoticeBar, Section, errText, tableCls, tdCls, thCls, useNotice } from './shared';

export const ACTIONS: Permission[] = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print'];

// Module ids used by RLS (role_grants.module) with labels, grouped as in the sidebar
export const MODULE_GROUPS: { group: string; modules: [string, string][] }[] = [
  { group: 'General', modules: [['dashboards', 'Dashboards'], ['reports', 'Reports'], ['notifications', 'Notifications'], ['approvals', 'Approvals'], ['documents', 'Documents']] },
  { group: 'Fleet', modules: [['vehicles', 'Vehicles'], ['drivers', 'Drivers'], ['maintenance', 'Maintenance'], ['work-orders', 'Work orders'], ['oil', 'Oil service'], ['tyres', 'Tyres'], ['accidents', 'Accidents']] },
  { group: 'Parties', modules: [['customers', 'Clients'], ['suppliers', 'Suppliers'], ['contracts', 'Contracts & rate cards']] },
  { group: 'Finance', modules: [['invoices', 'Invoices & bills'], ['payments', 'Payments'], ['bank-accounts', 'Bank accounts'], ['reconciliation', 'Reconciliation'], ['accounting', 'Journals & ledger'], ['financial-statements', 'Financial statements'], ['fixed-assets', 'Fixed assets'], ['expenses', 'Expenses'], ['budgets', 'Budgets']] },
  { group: 'HR', modules: [['hr', 'Employees'], ['attendance', 'Attendance'], ['leave', 'Leave'], ['payroll', 'Payroll']] },
  { group: 'Administration', modules: [['companies', 'Offices'], ['users-roles', 'Users & roles'], ['settings', 'Settings'], ['audit-logs', 'Audit log']] },
];
export const APPROVAL_MODULES: [string, string][] = [
  ['invoice', 'Invoices & bills'], ['payment', 'Payments'], ['expense', 'Expenses'], ['maintenance', 'Maintenance / work orders'],
  ['payroll', 'Payroll'], ['leave', 'Leave'], ['budget', 'Budgets'], ['party', 'Client / supplier registration'], ['journal', 'Manual journals'],
];

export const RolesEditor: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => {
  const { roles, rolePermissions, approvalLimits, isSuperAdmin, users, memberships, refresh } = useAuth();
  const canEdit = isSuperAdmin && !readOnly;
  const [selected, setSelected] = useState<string>('');
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [limits, setLimits] = useState<Record<string, string>>({}); // module -> '' (none) | 'unlimited' | amount
  const [meta, setMeta] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState<{ name: string; description: string; copyFrom: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useNotice();

  useEffect(() => {
    if (!selected && roles.length) setSelected(roles.find(r => !r.isSuper)?.id ?? roles[0].id);
  }, [roles, selected]);

  const role = roles.find(r => r.id === selected);
  useEffect(() => {
    if (!role) return;
    setGrants(new Set(rolePermissions.filter(g => g.roleId === role.id).map(g => `${g.module}:${g.action}`)));
    const l: Record<string, string> = {};
    for (const a of approvalLimits.filter(x => x.roleId === role.id)) l[a.module] = a.maxAmount == null ? 'unlimited' : String(a.maxAmount);
    setLimits(l);
    setMeta({ name: role.name, description: role.description });
  }, [role, rolePermissions, approvalLimits]);

  const assigned = useMemo(() => {
    const n = new Map<string, number>();
    for (const u of users) if (u.roleId) n.set(u.roleId, (n.get(u.roleId) ?? 0) + 1);
    for (const m of memberships) if (m.roleId) n.set(m.roleId, (n.get(m.roleId) ?? 0) + 1);
    return n;
  }, [users, memberships]);

  const toggle = (module: string, action: Permission, on: boolean) => {
    setGrants(g => {
      const next = new Set(g);
      const k = `${module}:${action}`;
      if (on) { next.add(k); if (action !== 'view') next.add(`${module}:view`); }
      else { next.delete(k); if (action === 'view') ACTIONS.forEach(a => next.delete(`${module}:${a}`)); }
      return next;
    });
  };

  const save = async () => {
    if (!role || !canEdit || busy) return;
    for (const [m, v] of Object.entries(limits)) {
      if (v && v !== 'unlimited' && (Number.isNaN(Number(v)) || Number(v) < 0)) {
        setNotice({ tone: 'error', text: `Approval limit for ${m} must be a positive amount or "unlimited".` });
        return;
      }
    }
    setBusy(true);
    try {
      if (meta.name.trim() !== role.name || meta.description.trim() !== role.description) await auth.updateRole(role.id, meta.name, meta.description);
      if (!role.isSuper) {
        await auth.setRoleGrants(role.id, Array.from(grants).map(k => { const [module, action] = k.split(':'); return { module, action: action as Permission }; }));
        await auth.setRoleApprovalLimits(role.id, Object.entries(limits).filter(([, v]) => v !== '').map(([module, v]) => ({ module, max_amount: v === 'unlimited' ? null : Number(v) })));
      }
      await refresh();
      setNotice({ tone: 'success', text: `Role "${meta.name.trim()}" saved. Users with this role get the new permissions on their next page load.` });
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!creating || busy) return;
    if (!creating.name.trim()) { setNotice({ tone: 'error', text: 'Enter a role name.' }); return; }
    setBusy(true);
    try {
      const id = await auth.createRole(creating.name, creating.description, creating.copyFrom || null);
      await refresh();
      setSelected(id);
      setCreating(null);
      setNotice({ tone: 'success', text: `Role "${creating.name.trim()}" created.` });
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!role || busy || !window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await auth.deleteRole(role.id);
      setSelected('');
      await refresh();
      setNotice({ tone: 'success', text: 'Role deleted.' });
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const locked = !canEdit || !!role?.isSuper;

  return (
    <div className="space-y-4">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <Section title="Roles" description={canEdit ? 'Pick a role to edit its permissions, or create a new one by copying an existing role.' : 'Only a Super Admin can change roles.'}
        action={canEdit && !creating && <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreating({ name: '', description: '', copyFrom: role && !role.isSuper ? role.id : '' })}>New role</Button>}>
        <div className="flex flex-wrap gap-2">
          {roles.map(r => (
            <button key={r.id} type="button" onClick={() => setSelected(r.id)}
              className={`px-3 h-8 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 ${selected === r.id ? 'bg-[#086343] text-white border-[#086343]' : 'border-slate-700 text-slate-200 hover:bg-slate-850'}`}>
              {r.isSuper && <Shield className="w-3 h-3" />}{r.name}
              <span className={`text-[10px] ${selected === r.id ? 'text-white/80' : 'text-slate-400'}`}>{assigned.get(r.id) ?? 0}</span>
            </button>
          ))}
        </div>
        {creating && (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end border-t border-slate-700 pt-3">
            <Input label="Role name" required value={creating.name} onChange={e => setCreating({ ...creating, name: e.target.value })} maxLength={60} />
            <Input label="Description" value={creating.description} onChange={e => setCreating({ ...creating, description: e.target.value })} />
            <Select label="Copy permissions from" value={creating.copyFrom} onChange={e => setCreating({ ...creating, copyFrom: e.target.value })}
              options={[{ value: '', label: 'Start empty' }, ...roles.filter(r => !r.isSuper).map(r => ({ value: r.id, label: r.name }))]} />
            <div className="flex gap-2">
              <Button onClick={create} isLoading={busy} leftIcon={<Copy className="w-4 h-4" />}>Create</Button>
              <Button variant="ghost" onClick={() => setCreating(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Section>

      {role && (
        <Section title={`Permissions: ${role.name}`}
          description={role.isSuper ? 'Super Admin always has every permission in every office and can approve any amount.'
            : 'A user can hold a different role in each office; these permissions apply in the offices where they hold this role.'}
          action={canEdit && (
            <div className="flex gap-2">
              {!role.isSystem && <Button size="sm" variant="outline" onClick={remove} disabled={busy || (assigned.get(role.id) ?? 0) > 0}
                title={(assigned.get(role.id) ?? 0) > 0 ? 'Reassign its users first' : 'Delete role'} leftIcon={<Trash2 className="w-4 h-4" />}>Delete</Button>}
              <Button size="sm" onClick={save} isLoading={busy} leftIcon={<Save className="w-4 h-4" />}>Save role</Button>
            </div>
          )}>
          {role.isSystem && <Badge variant="slate">Default role: it can be edited but not deleted</Badge>}
          {canEdit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Name" value={meta.name} onChange={e => setMeta({ ...meta, name: e.target.value })} maxLength={60} />
              <Input label="Description" value={meta.description} onChange={e => setMeta({ ...meta, description: e.target.value })} />
            </div>
          )}
          <div className="overflow-x-auto -mx-1">
            <table className={tableCls}>
              <thead><tr><th scope="col" className={thCls}>Module</th>{ACTIONS.map(a => <th scope="col" key={a} className={`${thCls} text-center capitalize`}>{a}</th>)}</tr></thead>
              <tbody>
                {MODULE_GROUPS.map(g => (
                  <React.Fragment key={g.group}>
                    <tr><td colSpan={ACTIONS.length + 1} className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#086343]">{g.group}</td></tr>
                    {g.modules.map(([id, label]) => (
                      <tr key={id}>
                        <td className={tdCls}>{label}</td>
                        {ACTIONS.map(a => (
                          <td key={a} className={`${tdCls} text-center`}>
                            <input type="checkbox" aria-label={`${label} ${a}`} className="w-4 h-4 accent-[#086343]"
                              checked={role.isSuper || grants.has(`${id}:${a}`)} disabled={locked} onChange={e => toggle(id, a, e.target.checked)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {!role.isSuper && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-100">Approval limits</p>
              <p className="text-xs text-slate-400">Blank = cannot approve. Requests above a user's limit go to a role with a higher limit.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {APPROVAL_MODULES.map(([m, label]) => {
                  const v = limits[m] ?? '';
                  return (
                    <div key={m} className="flex items-end gap-2">
                      <Input label={label} className="flex-1" value={v === 'unlimited' ? '' : v} placeholder={v === 'unlimited' ? 'Unlimited' : 'No approval'}
                        disabled={locked || v === 'unlimited'} inputMode="decimal" onChange={e => setLimits({ ...limits, [m]: e.target.value.trim() })} />
                      <label className="text-[10px] text-slate-400 pb-3 inline-flex items-center gap-1">
                        <input type="checkbox" className="accent-[#086343]" disabled={locked} checked={v === 'unlimited'}
                          onChange={e => setLimits({ ...limits, [m]: e.target.checked ? 'unlimited' : '' })} /> Any amount
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
};
