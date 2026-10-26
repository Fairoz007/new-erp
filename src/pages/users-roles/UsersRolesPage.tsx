import React, { useMemo, useState } from 'react';
import { Shield, Check, X, Users, Pencil, Info, Building2, Search } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select } from '../../components/ui/Input';
import { UserAvatar } from '../../components/layout/UserAvatar';
import { useAuth } from '../../context/AuthContext';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { updateUserProfile, setUserCompanies } from '../../services/auth';
import { User, UserRole, Permission } from '../../types/system';

const ROLES: UserRole[] = [
  'Super Admin', 'Company Admin', 'Fleet Manager', 'Maintenance Manager',
  'Accountant', 'Finance Manager', 'Procurement', 'Management', 'Viewer',
];
const ACTIONS: Permission[] = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print'];
const MODULE_LABELS: Record<string, string> = {
  vehicles: 'Vehicles', maintenance: 'Maintenance', 'work-orders': 'Work Orders', oil: 'Oil Service',
  tyres: 'Tyres', accidents: 'Accidents', expenses: 'Expenses', documents: 'Documents',
  suppliers: 'Suppliers', customers: 'Customers', invoices: 'Invoices', payments: 'Payments',
  reconciliation: 'Reconciliation', accounting: 'Accounting (GL, TB, P&L, BS)', 'fixed-assets': 'Fixed Assets & Depreciation',
  payroll: 'Payroll & HR', approvals: 'Approvals', 'audit-logs': 'Audit Logs', notifications: 'Notifications',
  companies: 'Offices', 'users-roles': 'Users & Roles', settings: 'Settings', reports: 'Reports',
};
const APPROVAL_LABELS: Record<string, string> = { maintenance: 'Maintenance / work orders', invoice: 'Invoices', expense: 'Expenses' };

interface EditState {
  user: User;
  name: string;
  department: string;
  phone: string;
  role: UserRole;
  status: 'active' | 'inactive';
  companyIds: string[];
}

export const UsersRolesPage: React.FC = () => {
  const {
    users, currentUser, hasPermission, isSuperAdmin, memberships, memberCompanyIds,
    rolePermissions, approvalLimits, refresh,
  } = useAuth();
  const { companies } = useFleet();
  const { addToast } = useUI();

  const canEdit = hasPermission('edit', 'users-roles');
  const [search, setSearch] = useState('');
  const [matrixRole, setMatrixRole] = useState<UserRole>('Fleet Manager');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? 'Office not visible to you';
  const officesOf = (userId: string) => memberships.filter(m => m.userId === userId).map(m => m.companyId);

  // Mirrors guard_profile_update / company_members policies so the UI doesn't offer what the DB will refuse.
  const manageBlockReason = (u: User): string | null => {
    if (!canEdit) return 'Read-only: your role cannot edit users.';
    if (isSuperAdmin) return null;
    if (u.role === 'Super Admin') return 'Only a Super Admin can edit a Super Admin.';
    if (u.id === currentUser.id) return null; // own name/department/phone only
    const offices = officesOf(u.id);
    if (offices.length > 0 && !offices.some(id => memberCompanyIds.includes(id))) {
      return 'This user belongs to an office you do not manage.';
    }
    return null;
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      [u.name, u.email, u.role, u.department].some(v => v?.toLowerCase().includes(q))
    );
  }, [users, search]);

  const openEdit = (u: User) =>
    setEdit({
      user: u,
      name: u.name,
      department: u.department,
      phone: u.phone ?? '',
      role: u.role,
      status: u.status,
      companyIds: officesOf(u.id),
    });

  const isSelfEdit = edit?.user.id === currentUser.id;
  const roleLocked = !!edit && isSelfEdit && !isSuperAdmin;
  // Offices the editor may assign: all visible offices for a Super Admin, own offices otherwise.
  const assignableCompanies = isSuperAdmin ? companies : companies.filter(c => memberCompanyIds.includes(c.id));

  const handleSave = async () => {
    if (!edit || saving) return;
    if (!edit.name.trim()) {
      addToast({ type: 'error', title: 'Name required', message: 'Enter the user’s name.' });
      return;
    }
    setSaving(true);
    try {
      const u = edit.user;
      const patch: Parameters<typeof updateUserProfile>[1] = {};
      if (edit.name.trim() !== u.name) patch.name = edit.name;
      if (edit.department.trim() !== u.department) patch.department = edit.department;
      if (edit.phone.trim() !== (u.phone ?? '')) patch.phone = edit.phone;
      if (!roleLocked && edit.role !== u.role) patch.role = edit.role;
      if (!roleLocked && edit.status !== u.status) patch.status = edit.status;
      if (Object.keys(patch).length > 0) await updateUserProfile(u.id, patch);

      const before = officesOf(u.id).slice().sort().join(',');
      const after = edit.companyIds.slice().sort().join(',');
      if (!roleLocked && u.role !== 'Super Admin' && before !== after) {
        await setUserCompanies(u.id, edit.companyIds);
      }
      await refresh();
      addToast({ type: 'success', title: 'User updated', message: `${edit.name.trim()} was saved.` });
      setEdit(null);
    } catch (e) {
      addToast({ type: 'error', title: 'Could not save user', message: (e as Error).message });
      // Partial saves (profile ok, offices failed) are reflected after a reload.
      void refresh().catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  const modules = useMemo(() => Array.from(new Set(rolePermissions.map(r => r.module))).sort(), [rolePermissions]);
  const matrixFor = (role: UserRole) => {
    const set = new Set(rolePermissions.filter(r => r.role === role).map(r => `${r.module}:${r.action}`));
    return (module: string, action: Permission) => role === 'Super Admin' || set.has(`${module}:${action}`);
  };
  const allowed = matrixFor(matrixRole);
  const matrixRoleLimits = approvalLimits.filter(l => l.role === matrixRole);

  const roleOptions = ROLES.filter(r => isSuperAdmin || r !== 'Super Admin' || edit?.role === 'Super Admin');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">Users & Roles</h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            User accounts, office access and the role permission matrix enforced by the database.
          </p>
        </div>
        {!canEdit && <Badge variant="slate">Read-only</Badge>}
      </div>

      {/* Inviting users: needs the service-role key, so it is not done from the browser */}
      {canEdit && (
        <Card className="p-4 sm:p-5 flex gap-3 items-start" variant="subtle">
          <Info className="w-4 h-4 text-[#086343] shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 space-y-1">
            <p className="font-bold text-slate-100">Adding a new user</p>
            <p>
              New accounts are invited by a Super Admin from the Supabase Dashboard (Authentication → Users → Invite user).
              The invitee sets a password from the email link and appears here as <span className="font-semibold">Viewer</span> with no
              office. Then edit them here to assign a role and offices.
            </p>
          </div>
        </Card>
      )}

      {/* Users */}
      <Card className="rounded-[20px] bg-white border border-slate-700 shadow-card">
        <CardHeader
          action={
            <div className="w-56 max-w-full">
              <Input
                pill
                placeholder="Search users"
                value={search}
                onChange={e => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
                aria-label="Search users"
              />
            </div>
          }
        >
          <CardTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#086343]" /> Users ({users.length})
          </CardTitle>
          <p className="text-xs text-slate-400">Profiles you are allowed to see</p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-5 py-2.5">User</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Department</th>
                <th className="px-3 py-2.5">Offices</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    {users.length === 0 ? 'No users visible to your account.' : 'No users match your search.'}
                  </td>
                </tr>
              )}
              {filteredUsers.map(u => {
                const offices = officesOf(u.id);
                const blocked = manageBlockReason(u);
                return (
                  <tr key={u.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar name={u.name} src={u.avatar} />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-100 truncate">
                            {u.name} {u.id === currentUser.id && <span className="text-[10px] text-[#086343] font-bold">(you)</span>}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-200">{u.role}</td>
                    <td className="px-3 py-3">{u.department || '—'}</td>
                    <td className="px-3 py-3">
                      {u.role === 'Super Admin' ? (
                        <span className="text-slate-400">All offices</span>
                      ) : offices.length === 0 ? (
                        <span className="text-amber-600">None assigned</span>
                      ) : (
                        <span className="line-clamp-2">{offices.map(companyName).join(', ')}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={u.status === 'active' ? 'emerald' : 'rose'} size="sm">
                        {u.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canEdit && !blocked && (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={!!blocked}
                          title={blocked ?? 'Edit user'}
                          onClick={() => openEdit(u)}
                          leftIcon={<Pencil className="w-3.5 h-3.5" />}
                        >
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Permission matrix from role_permissions */}
      <Card className="rounded-[20px] bg-white border border-slate-700 shadow-card">
        <CardHeader
          action={
            <div className="w-56 max-w-full">
              <Select
                value={matrixRole}
                onChange={e => setMatrixRole(e.target.value as UserRole)}
                options={ROLES.map(r => ({ value: r, label: r }))}
                aria-label="Role"
              />
            </div>
          }
        >
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#086343]" /> Role permission matrix
          </CardTitle>
          <p className="text-xs text-slate-400">
            Live from the <span className="font-mono">role_permissions</span> table; the database enforces the same rules.
          </p>
        </CardHeader>
        <div className="p-4 sm:p-5 space-y-4">
          {matrixRole === 'Super Admin' && (
            <p className="text-xs text-slate-400">Super Admin bypasses the matrix: every action on every module and office.</p>
          )}
          {modules.length === 0 ? (
            <p className="text-xs text-slate-400">No permission rows are visible.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="py-2.5 pr-3">Module</th>
                    {ACTIONS.map(a => (
                      <th key={a} className="py-2.5 px-2 text-center capitalize">{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {modules.map(m => (
                    <tr key={m}>
                      <td className="py-2 pr-3 font-medium text-slate-200">{MODULE_LABELS[m] ?? m}</td>
                      {ACTIONS.map(a => (
                        <td key={a} className="py-2 px-2 text-center">
                          {allowed(m, a) ? (
                            <Check className="w-4 h-4 text-forest-600 mx-auto" aria-label="allowed" />
                          ) : (
                            <X className="w-4 h-4 text-slate-400 mx-auto" aria-label="not allowed" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-slate-700 pt-4">
            <p className="text-xs font-bold text-slate-100 mb-1.5">Approval limits ({matrixRole})</p>
            {matrixRole === 'Super Admin' ? (
              <p className="text-xs text-slate-400">Unlimited.</p>
            ) : matrixRoleLimits.length === 0 ? (
              <p className="text-xs text-slate-400">This role cannot approve.</p>
            ) : (
              <ul className="text-xs text-slate-300 space-y-0.5">
                {matrixRoleLimits.map(l => (
                  <li key={l.module}>
                    {APPROVAL_LABELS[l.module] ?? l.module}:{' '}
                    <span className="font-semibold">{l.maxAmount == null ? 'unlimited' : `up to ${l.maxAmount.toLocaleString()}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {/* Edit user */}
      <Modal
        isOpen={!!edit}
        onClose={() => !saving && setEdit(null)}
        title={edit ? `Edit ${edit.user.name}` : ''}
        description={edit?.user.email}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEdit(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} isLoading={saving}>
              Save changes
            </Button>
          </div>
        }
      >
        {edit && (
          <div className="space-y-4">
            <Input label="Name" required value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Department" value={edit.department} onChange={e => setEdit({ ...edit, department: e.target.value })} />
              <Input label="Phone" value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Role"
                value={edit.role}
                disabled={roleLocked}
                onChange={e => setEdit({ ...edit, role: e.target.value as UserRole })}
                options={roleOptions.map(r => ({ value: r, label: r }))}
                hint={roleLocked ? 'You cannot change your own role.' : undefined}
              />
              <Select
                label="Status"
                value={edit.status}
                disabled={roleLocked}
                onChange={e => setEdit({ ...edit, status: e.target.value as 'active' | 'inactive' })}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive (cannot sign in)' },
                ]}
              />
            </div>

            {edit.user.role !== 'Super Admin' && !roleLocked && (
              <div>
                <p className="text-xs sm:text-sm font-semibold text-slate-100 flex items-center gap-1.5 mb-1.5">
                  <Building2 className="w-4 h-4 text-[#086343]" /> Offices
                </p>
                {assignableCompanies.length === 0 ? (
                  <p className="text-xs text-slate-400">There are no offices you can assign.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto border border-slate-700 rounded-xl p-2">
                    {assignableCompanies.map(c => {
                      const checked = edit.companyIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-850 cursor-pointer text-xs text-slate-200">
                          <input
                            type="checkbox"
                            className="accent-[#086343]"
                            checked={checked}
                            onChange={() =>
                              setEdit({
                                ...edit,
                                companyIds: checked ? edit.companyIds.filter(id => id !== c.id) : [...edit.companyIds, c.id],
                              })
                            }
                          />
                          <span>{c.name}</span>
                          {c.code && <span className="text-[10px] text-slate-400 font-mono">{c.code}</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
                {!isSuperAdmin && edit.companyIds.some(id => !memberCompanyIds.includes(id)) && (
                  <p className="text-[11px] text-slate-400 mt-1">Memberships in offices you don&apos;t manage are kept unchanged.</p>
                )}
              </div>
            )}
            {edit.role === 'Super Admin' && (
              <p className="text-[11px] text-slate-400">Super Admins have access to every office without memberships.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
