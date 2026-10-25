// Auth & user-administration service (Agent G).
// Conventions: docs/audit/CONTRACTS.md. Every function throws ServiceError on failure.
//
// Security notes:
//   * Roles come from public.profiles.role (guarded by trigger), never from user_metadata.
//   * Inviting users needs the service-role key, which must never ship to the browser:
//     invite from the Supabase Dashboard (Authentication -> Users -> Invite) or the CLI/server.
//     See docs/audit/agent-G.md "Inviting users".
import type { AuthError, Session } from '@supabase/supabase-js';
import { supabase, unwrap, rpcAny, ServiceError, toServiceError } from './core';
import type { Database } from '../types/database';
import type { User, UserRole, Permission } from '../types/system';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type MemberRow = Database['public']['Tables']['company_members']['Row'];

export interface RolePermission {
  role: UserRole;
  module: string;
  action: Permission;
}

export interface ApprovalLimit {
  role: UserRole;
  module: string;
  maxAmount: number | null; // null = unlimited
}

export interface Membership {
  userId: string;
  companyId: string;
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

export const profileToUser = (p: ProfileRow, companyId?: string): User => ({
  id: p.id,
  name: p.name,
  email: p.email,
  role: p.role as UserRole,
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
  const rows = await unwrap<MemberRow[]>(supabase.from('company_members').select('*'));
  return rows.map(r => ({ userId: r.user_id, companyId: r.company_id }));
}

export async function fetchRolePermissions(): Promise<RolePermission[]> {
  const rows = await unwrap(supabase.from('role_permissions').select('role, module, action'));
  return rows.map(r => ({ role: r.role as UserRole, module: r.module, action: r.action as Permission }));
}

export async function fetchApprovalLimits(): Promise<ApprovalLimit[]> {
  const rows = await unwrap(supabase.from('approval_limits').select('role, module, max_amount'));
  return rows.map(r => ({ role: r.role as UserRole, module: r.module, maxAmount: r.max_amount == null ? null : Number(r.max_amount) }));
}

// ---------------------------------------------------------------- user administration
export interface UserUpdate {
  name?: string;
  role?: UserRole;
  status?: 'active' | 'inactive';
  department?: string;
  phone?: string;
}

// Role/status changes are re-checked by the guard_profile_update trigger (no self-promotion,
// Super Admin only grantable by a Super Admin, Company Admins limited to their offices).
export async function updateUserProfile(userId: string, patch: UserUpdate): Promise<User> {
  const row: Database['public']['Tables']['profiles']['Update'] = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.role !== undefined) row.role = patch.role;
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
