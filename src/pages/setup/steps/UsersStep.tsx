// Step 5: users, invitations and office access (also the Users tab of Users & Roles).
// An invitation stores role + offices; they are applied when the person first signs up.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { useAuth } from '../../../context/AuthContext';
import * as auth from '../../../services/auth';
import type { Invitation } from '../../../services/auth';
import type { User } from '../../../types/system';
import { LoadState, NoticeBar, Section, Toggle, errText, tableCls, tdCls, thCls, useNotice, useOffices } from '../shared';

type Assign = { company_id: string; role_id: string | null };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// office checkboxes, each with an optional office-specific role
const OfficeRoles: React.FC<{ value: Assign[]; onChange: (v: Assign[]) => void; disabled?: boolean; manageable: (id: string) => boolean }> = ({ value, onChange, disabled, manageable }) => {
  const { offices } = useOffices();
  const { roles } = useAuth();
  return (
    <div className="space-y-1.5">
      {offices.length === 0 && <p className="text-xs text-slate-400">No offices yet (step 3).</p>}
      {offices.map(o => {
        const a = value.find(x => x.company_id === o.id);
        const can = manageable(o.id) && !disabled;
        return (
          <div key={o.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className={`flex items-center gap-2 text-xs min-w-[180px] ${can ? 'cursor-pointer' : 'opacity-60'}`}>
              <input type="checkbox" className="w-4 h-4 accent-[#086343]" checked={!!a} disabled={!can}
                onChange={e => onChange(e.target.checked ? [...value, { company_id: o.id, role_id: null }] : value.filter(x => x.company_id !== o.id))} />
              {o.name} <span className="font-mono text-slate-400">{o.code}</span>
            </label>
            {a && (
              <select aria-label={`Role in ${o.name}`} className="h-8 rounded-lg border border-slate-700 px-2 text-xs bg-white" value={a.role_id ?? ''} disabled={!can}
                onChange={e => onChange(value.map(x => (x.company_id === o.id ? { ...x, role_id: e.target.value || null } : x)))}>
                <option value="">Same as organization role</option>
                {roles.filter(r => !r.isSuper).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const UsersStep: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => {
  const { users, roles, memberships, currentUser, isSuperAdmin, hasPermission, roleById, refresh } = useAuth();
  const canInvite = !readOnly && hasPermission('create', 'users-roles');
  const canEdit = !readOnly && hasPermission('edit', 'users-roles');
  const manageable = useCallback((companyId: string) => isSuperAdmin || hasPermission('edit', 'users-roles', companyId), [isSuperAdmin, hasPermission]);

  const [invites, setInvites] = useState<Invitation[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState<string | null>(null);
  const [form, setForm] = useState<{ email: string; name: string; roleId: string; allOffices: boolean; offices: Assign[] } | null>(null);
  const [edit, setEdit] = useState<{ user: User; roleId: string; allOffices: boolean; status: 'active' | 'inactive'; offices: Assign[] } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useNotice();

  const loadInvites = useCallback(async () => {
    setInvLoading(true);
    setInvError(null);
    try { setInvites(await auth.fetchInvitations()); }
    catch (e) { setInvError(errText(e)); }
    finally { setInvLoading(false); }
  }, []);
  useEffect(() => { void loadInvites(); }, [loadInvites]);

  const viewer = roles.find(r => r.name === 'Viewer')?.id ?? roles[0]?.id ?? '';
  const officesOf = (uid: string): Assign[] => memberships.filter(m => m.userId === uid).map(m => ({ company_id: m.companyId, role_id: m.roleId }));

  const invite = async () => {
    if (!form || busy) return;
    const e: Record<string, string> = {};
    if (!EMAIL.test(form.email.trim())) e.email = 'Enter a valid email address.';
    else if (users.some(u => u.email.toLowerCase() === form.email.trim().toLowerCase())) e.email = 'This person already has an account.';
    if (!form.roleId) e.roleId = 'Choose a role.';
    const isSuperRole = !!roleById(form.roleId)?.isSuper;
    if (!form.allOffices && !isSuperRole && form.offices.length === 0) e.offices = 'Choose at least one office or give organization-wide access.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const r = await auth.inviteUser({ email: form.email, name: form.name, roleId: form.roleId, allOffices: form.allOffices || isSuperRole, officeRoles: form.offices });
      setNotice(r.emailSent
        ? { tone: 'success', text: `Invitation emailed to ${form.email.trim()}.` }
        : { tone: 'info', text: `Invitation saved for ${form.email.trim()}, but the email could not be sent (${r.message ?? 'invite-user function unavailable'}). Send it from Supabase → Authentication → Users → Invite user; the role and offices are applied when they sign up.` });
      setForm(null);
      await loadInvites();
    } catch (err) {
      setNotice({ tone: 'error', text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (i: Invitation) => {
    if (!window.confirm(`Revoke the invitation for ${i.email}?`)) return;
    try { await auth.revokeInvitation(i.id); await loadInvites(); setNotice({ tone: 'success', text: 'Invitation revoked.' }); }
    catch (e) { setNotice({ tone: 'error', text: errText(e) }); }
  };

  const saveUser = async () => {
    if (!edit || busy) return;
    setBusy(true);
    try {
      const u = edit.user;
      const patch: auth.UserUpdate = {};
      if (edit.roleId !== u.roleId) patch.roleId = edit.roleId;
      if (edit.allOffices !== !!u.allOffices) patch.allOffices = edit.allOffices;
      if (edit.status !== u.status) patch.status = edit.status;
      if (Object.keys(patch).length) await auth.updateUserProfile(u.id, patch);
      const key = (a: Assign[]) => a.map(x => `${x.company_id}:${x.role_id ?? ''}`).sort().join(',');
      if (!roleById(edit.roleId)?.isSuper && key(edit.offices) !== key(officesOf(u.id))) await auth.setUserOfficeRoles(u.id, edit.offices);
      await refresh();
      setNotice({ tone: 'success', text: `${u.name} updated.` });
      setEdit(null);
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
      void refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? users.filter(u => [u.name, u.email, u.role].some(v => v?.toLowerCase().includes(q))) : users;
  }, [users, search]);
  const pending = invites.filter(i => i.status === 'pending');

  const editBlock = (u: User): string | null => {
    if (!canEdit) return 'Your role cannot edit users';
    if (isSuperAdmin) return null;
    if (roleById(u.roleId)?.isSuper) return 'Only a Super Admin can edit a Super Admin';
    if (u.id === currentUser.id) return 'You cannot change your own access';
    const offs = officesOf(u.id);
    if (offs.length && !offs.some(o => manageable(o.company_id))) return 'User belongs to an office you do not manage';
    return null;
  };

  return (
    <div className="space-y-4">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Section title="Invite users" description="Each person gets an email link to set their password. Their role and offices are applied when they first sign in."
        action={canInvite && !form && <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setErrors({}); setForm({ email: '', name: '', roleId: viewer, allOffices: false, offices: [] }); }}>Invite user</Button>}>
        {form && (
          <div className="space-y-3 border border-slate-700 rounded-xl p-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label="Email" type="email" required value={form.email} error={errors.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <Input label="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Select label="Organization role" required value={form.roleId} error={errors.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}
                options={roles.filter(r => isSuperAdmin || !r.isSuper).map(r => ({ value: r.id, label: r.name }))} />
            </div>
            {!roleById(form.roleId)?.isSuper && (
              <>
                <Toggle label="Organization-wide access (all offices, current and future)" checked={form.allOffices} disabled={!isSuperAdmin}
                  onChange={v => setForm({ ...form, allOffices: v })} />
                {!form.allOffices && <OfficeRoles value={form.offices} onChange={v => setForm({ ...form, offices: v })} manageable={manageable} />}
                {errors.offices && <p className="text-xs text-rose-500">{errors.offices}</p>}
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
              <Button onClick={invite} isLoading={busy} leftIcon={<Mail className="w-4 h-4" />}>Send invitation</Button>
            </div>
          </div>
        )}
        <LoadState loading={invLoading} error={invError} onRetry={loadInvites} empty={pending.length === 0} emptyText="No pending invitations.">
          <ul className="divide-y divide-slate-700/60">
            {pending.map(i => (
              <li key={i.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                <span className="flex-1 min-w-0 truncate"><span className="font-semibold text-slate-100">{i.name || i.email}</span> {i.name && <span className="text-slate-400">{i.email}</span>}</span>
                <Badge variant="amber">Pending</Badge>
                <span className="text-slate-400">{roleById(i.roleId)?.name ?? 'Unknown role'} · {i.allOffices ? 'All offices' : `${i.officeRoles.length} office(s)`}</span>
                {canEdit && <Button size="xs" variant="ghost" onClick={() => void revoke(i)} leftIcon={<Trash2 className="w-3 h-3" />}>Revoke</Button>}
              </li>
            ))}
          </ul>
        </LoadState>
      </Section>

      <Section title={`Users (${users.length})`} description="Accounts you are allowed to see."
        action={<div className="w-56 max-w-full"><Input pill placeholder="Search users" value={search} onChange={e => setSearch(e.target.value)} leftIcon={<Search className="w-4 h-4" />} aria-label="Search users" /></div>}>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr><th scope="col" className={thCls}>User</th><th scope="col" className={thCls}>Organization role</th><th scope="col" className={thCls}>Offices</th><th scope="col" className={thCls}>Status</th><th scope="col" className={thCls}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={5} className={`${tdCls} text-slate-400`}>No users match.</td></tr>}
              {shown.map(u => {
                const offs = officesOf(u.id);
                const block = editBlock(u);
                return (
                  <tr key={u.id}>
                    <td className={tdCls}><p className="font-semibold text-slate-100">{u.name}</p><p className="text-slate-400">{u.email}</p></td>
                    <td className={tdCls}>{u.role}</td>
                    <td className={tdCls}>
                      {roleById(u.roleId)?.isSuper || u.allOffices ? <Badge variant="emerald">All offices</Badge> : offs.length === 0 ? <span className="text-slate-400">None</span> : (
                        <span>{offs.length} office(s){offs.some(o => o.role_id) ? ', office roles set' : ''}</span>
                      )}
                    </td>
                    <td className={tdCls}><Badge variant={u.status === 'active' ? 'emerald' : 'slate'}>{u.status}</Badge></td>
                    <td className={`${tdCls} text-right`}>
                      <Button size="xs" variant="outline" disabled={!!block} title={block ?? 'Edit access'} leftIcon={<Pencil className="w-3 h-3" />}
                        onClick={() => setEdit({ user: u, roleId: u.roleId ?? viewer, allOffices: !!u.allOffices, status: u.status, offices: offs })}>Edit</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {edit && (
        <Section title={`Access: ${edit.user.name}`} action={<Button size="xs" variant="ghost" aria-label="Close" onClick={() => setEdit(null)}><X className="w-4 h-4" /></Button>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Organization role" value={edit.roleId} onChange={e => setEdit({ ...edit, roleId: e.target.value })}
              options={roles.filter(r => isSuperAdmin || !r.isSuper).map(r => ({ value: r.id, label: r.name }))}
              hint="Applies in every assigned office unless an office role is set" />
            <Select label="Status" value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value as 'active' | 'inactive' })}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive (cannot sign in)' }]} />
          </div>
          {!roleById(edit.roleId)?.isSuper && (
            <>
              <Toggle label="Organization-wide access (all offices)" checked={edit.allOffices} disabled={!isSuperAdmin} onChange={v => setEdit({ ...edit, allOffices: v })} />
              <OfficeRoles value={edit.offices} onChange={v => setEdit({ ...edit, offices: v })} manageable={manageable} />
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={saveUser} isLoading={busy} leftIcon={<Save className="w-4 h-4" />}>Save access</Button>
          </div>
        </Section>
      )}
    </div>
  );
};
