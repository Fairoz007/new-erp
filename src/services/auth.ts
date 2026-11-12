// Auth & user-administration service (Agent G).
// Conventions: docs/audit/CONTRACTS.md. Every function throws ServiceError on failure.
//
// Security notes:
//   * Roles come from public.roles / profiles.role_id (guarded by trigger), never from user_metadata.
//   * Inviting sends email through the invite-user edge function (service-role key stays server-side).
import type { AuthError, Session } from '@supabase/supabase-js';
import { supabase, unwrap, rpcAny, ServiceError, toServiceError } from './core';
import type { Database } from '../types/database';
import type { User, UserRole, Permission } from '../types/system';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type MemberRow = Database['public']['Tables']['company_members']['Row'];

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  isSuper: boolean;
  sortOrder: number;
}

export interface RolePermission {
  roleId: string;
  role: UserRole;            // role name
  module: string;
  action: Permission;
}

export interface ApprovalLimit {
  roleId: string;
  role: UserRole;
  module: string;
  maxAmount: number | null; // null = unlimited
}

export interface Membership {
  userId: string;
  companyId: string;
  roleId: string | null;     // office role; null = the user's organization role applies
}

// Captured at module load, before supabase-js consumes the URL hash: tells the gate whether
// the user arrived from an invite or password-recovery email and must set a password.
const readUrlAuthType = (): string | null => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, '') + '&' + window.location.search.replace(/^\?/, ''));
  return params.get('type');
};
export const initialUrlAuthType: string | null = readUrlAuthType();

// Friendlier messages for Supabase Auth errors.
const authError = (e: AuthError | Error): ServiceError => {
  const msg = e.message || 'Authentication failed';
  if (/invalid login credentials/i.test(msg)) return new ServiceError('Incorrect email or password.');
  if (/email not confirmed/i.test(msg)) return new ServiceError('Your email address is not confirmed yet. Use the link in your invitation email.');
  if (/rate limit|too many/i.test(msg)) return new ServiceError('Too many attempts. Please wait a minute and try again.');
  if (/failed to fetch|network/i.test(msg)) return new ServiceError('Cannot reach the authentication server. Check your connection.');
  if (/password should be|weak password/i.test(msg)) return new ServiceError(msg);
  return new ServiceError(msg, { code: (e as AuthError).code });
};

const roleNames = new Map<string, string>();

export const profileToUser = (p: ProfileRow, companyId?: string): User => ({
  id: p.id,
  name: p.name,
  email: p.email,
  role: (roleNames.get((p as any).role_id) ?? (p.role === 'Company Admin' ? 'Admin' : p.role)) as UserRole,
  roleId: (p as any).role_id ?? '',
  allOffices: !!(p as any).all_offices,
  avatar: p.avatar ?? undefined,
  companyId,
  department: p.department ?? '',
  phone: p.phone ?? undefined,
  status: p.status === 'inactive' ? 'inactive' : 'active',
});

// ---------------------------------------------------------------- session
export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw authError(error);
  if (!data.session) throw new ServiceError('Sign-in did not return a session.');
  return data.session;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  // A session that already expired server-side still clears locally; only surface real failures.
  if (error && !/session.*(missing|not found)/i.test(error.message)) throw authError(error);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw authError(error);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw authError(error);
}

// ---------------------------------------------------------------- profile & permissions
export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  return unwrap(supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
}

// Profiles visible to the caller under RLS (self, same-office colleagues, everyone for users-roles:view).
export async function fetchProfiles(): Promise<ProfileRow[]> {
  return unwrap(supabase.from('profiles').select('*').order('name'));
}

// Memberships visible under RLS (own rows, or all rows with users-roles:view).
export async function fetchMemberships(): Promise<Membership[]> {
  const rows = await unwrap<Array<MemberRow & { role_id: string | null }>>(supabase.from('company_members').select('*') as any);
  return rows.map(r => ({ userId: r.user_id, companyId: r.company_id, roleId: r.role_id ?? null }));
}

// Roles are data (table public.roles); names are cached so profiles map to their role name.
export async function fetchRoles(): Promise<Role[]> {
  const rows = await unwrap<any[]>((supabase as any).from('roles').select('*').order('sort_order').order('name'));
  roleNames.clear();
  for (const r of rows) roleNames.set(r.id, r.name);
  return rows.map(r => ({
    id: r.id, name: r.name, description: r.description ?? '', isSystem: !!r.is_system, isSuper: !!r.is_super, sortOrder: r.sort_order ?? 100,
  }));
}

export async function fetchRolePermissions(): Promise<RolePermission[]> {
  const rows = await unwrap<any[]>((supabase as any).from('role_grants').select('role_id, module, action'));
  return rows.map(r => ({ roleId: r.role_id, role: (roleNames.get(r.role_id) ?? '') as UserRole, module: r.module, action: r.action as Permission }));
}

export async function fetchApprovalLimits(): Promise<ApprovalLimit[]> {
  const rows = await unwrap<any[]>((supabase as any).from('role_approval_limits').select('role_id, module, max_amount'));
  return rows.map(r => ({
    roleId: r.role_id, role: (roleNames.get(r.role_id) ?? '') as UserRole, module: r.module,
    maxAmount: r.max_amount == null ? null : Number(r.max_amount),
  }));
}

// ---------------------------------------------------------------- role administration (Super Admin; RPCs re-check)
export const createRole = (name: string, description: string, copyFrom: string | null) =>
  rpcAny<string>('create_role', { p_name: name.trim(), p_description: description.trim() || null, p_copy_from: copyFrom });
export const updateRole = (id: string, name: string, description: string) =>
  rpcAny<void>('update_role', { p_role: id, p_name: name.trim(), p_description: description.trim() || null });
export const deleteRole = (id: string) => rpcAny<void>('delete_role', { p_role: id });
export const setRoleGrants = (id: string, grants: Array<{ module: string; action: Permission }>) =>
  rpcAny<void>('set_role_grants', { p_role: id, p_grants: grants });
export const setRoleApprovalLimits = (id: string, limits: Array<{ module: string; max_amount: number | null }>) =>
  rpcAny<void>('set_role_approval_limits', { p_role: id, p_limits: limits });

// Replace a user's offices together with the role in each office (null = organization role).
export const setUserOfficeRoles = (userId: string, assignments: Array<{ company_id: string; role_id: string | null }>) =>
  rpcAny<void>('set_user_office_roles', { p_user: userId, p_assignments: assignments });

// ---------------------------------------------------------------- invitations
export interface Invitation {
  id: string; email: string; name: string; roleId: string; allOffices: boolean;
  officeRoles: Array<{ company_id: string; role_id: string | null }>; status: 'pending' | 'accepted' | 'revoked'; createdAt: string;
}
export async function fetchInvitations(): Promise<Invitation[]> {
  const rows = await unwrap<any[]>((supabase as any).from('user_invitations').select('*').order('created_at', { ascending: false }));
  return rows.map(r => ({
    id: r.id, email: r.email, name: r.name ?? '', roleId: r.role_id, allOffices: !!r.all_offices,
    officeRoles: r.office_roles ?? [], status: r.status, createdAt: r.created_at,
  }));
}
// Records the invitation (role + offices applied at first sign-up), then asks the invite-user edge
// function to send the email. If the function is not deployed the invitation still stands and the
// admin can send the email from the Supabase dashboard; the returned flag says which happened.
export async function inviteUser(input: { email: string; name: string; roleId: string; allOffices: boolean;
  officeRoles: Array<{ company_id: string; role_id: string | null }> }): Promise<{ emailSent: boolean; message?: string }> {
  await rpcAny<string>('create_invitation', {
    p_email: input.email.trim(), p_name: input.name.trim(), p_role: input.roleId, p_all_offices: input.allOffices, p_office_roles: input.officeRoles,
  });
  try {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined;
    const { error } = await supabase.functions.invoke('invite-user', { body: { email: input.email.trim(), redirectTo } });
    if (error) return { emailSent: false, message: error.message };
    return { emailSent: true };
  } catch (e) {
    return { emailSent: false, message: (e as Error).message };
  }
}
export const revokeInvitation = (id: string) => rpcAny<void>('revoke_invitation', { p_id: id });

// ---------------------------------------------------------------- user administration
export interface UserUpdate {
  name?: string;
  roleId?: string;
  allOffices?: boolean;
  status?: 'active' | 'inactive';
  department?: string;
  phone?: string;
}

// Role/status changes are re-checked by the guard_profile_update trigger (no self-promotion,
// Super Admin only grantable by a Super Admin, Company Admins limited to their offices).
export async function updateUserProfile(userId: string, patch: UserUpdate): Promise<User> {
  const row: Database['public']['Tables']['profiles']['Update'] = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.roleId !== undefined) (row as any).role_id = patch.roleId;
  if (patch.allOffices !== undefined) (row as any).all_offices = patch.allOffices;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.department !== undefined) row.department = patch.department.trim() || null;
  if (patch.phone !== undefined) row.phone = patch.phone.trim() || null;
  const updated = await unwrap(supabase.from('profiles').update(row).eq('id', userId).select('*'));
  if (!updated || updated.length === 0) throw new ServiceError('Permission denied for this action.');
  return profileToUser(updated[0]);
}

// Atomically replace a user's office memberships (RPC from 20261026000600_auth.sql; RLS applies).
export async function setUserCompanies(userId: string, companyIds: string[]): Promise<string[]> {
  try {
    const rows = await rpcAny<Array<string | { set_user_companies: string }>>('set_user_companies', {
      p_user: userId,
      p_companies: companyIds,
    });
    return (rows ?? []).map(r => (typeof r === 'string' ? r : r.set_user_companies));
  } catch (e) {
    throw toServiceError(e as Error);
  }
}
