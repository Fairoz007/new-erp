import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { User, UserRole, Permission } from '../types/system';
import type { AppPage } from './UIContext';
import { supabase } from '../lib/supabase';
import * as authService from '../services/auth';
import { purgeLegacyCaches } from '../lib/cache';
import type { ApprovalLimit, Membership, Role, RolePermission } from '../services/auth';

// ---------------------------------------------------------------------------
// Page id -> permission module (role_permissions.module). Source of truth for
// canAccessPage. A page with module `null` is open to every signed-in, active user.
// Keep in sync with the seed in 20261025000200_erp_rls.sql section 5.
// ---------------------------------------------------------------------------
export const PAGE_MODULE: Record<AppPage, string | null> = {
  dashboard: null,              // landing page; its widgets only show rows RLS returns
  companies: 'companies',
  vehicles: 'vehicles',
  'vehicle-detail': 'vehicles',
  'customer-detail': 'customers',
  drivers: 'drivers',
  'supplier-detail': 'suppliers',
  maintenance: 'maintenance',
  'work-orders': 'work-orders',
  'oil-management': 'oil',
  'tyre-management': 'tyres',
  accidents: 'accidents',
  expenses: 'expenses',
  documents: 'documents',
  suppliers: 'suppliers',
  customers: 'customers',
  invoices: 'invoices',
  payments: 'payments',
  reconciliation: 'reconciliation',
  accounting: 'accounting',
  'trial-balance': 'accounting',
  'general-ledger': 'accounting',
  'profit-loss': 'accounting',
  'balance-sheet': 'accounting',
  'fixed-assets': 'fixed-assets',
  depreciation: 'fixed-assets',
  payroll: 'payroll',
  profitability: 'vehicles',    // per-vehicle cost/revenue; was open to all roles, every role has vehicles:view
  notifications: 'notifications',
  approvals: 'approvals',
  'audit-logs': 'audit-logs',
  reports: 'reports',
  'users-roles': 'users-roles',
  settings: 'settings',
};

// Legacy / page-style module names passed to hasPermission -> matrix module.
export const MODULE_ALIASES: Record<string, string> = {
  finance: 'accounting',
  pnl: 'accounting',
  'profit-loss': 'accounting',
  'balance-sheet': 'accounting',
  'trial-balance': 'accounting',
  'general-ledger': 'accounting',
  'oil-management': 'oil',
  'tyre-management': 'tyres',
  depreciation: 'fixed-assets',
  'vehicle-detail': 'vehicles',
  profitability: 'vehicles',
  hr: 'payroll',
  employees: 'hr',
  users: 'users-roles',
  audit: 'audit-logs',
};

export const resolveModule = (moduleName: string): string => MODULE_ALIASES[moduleName] ?? moduleName;

export type AuthStatus =
  | 'loading'       // checking session / loading profile
  | 'signed-out'    // no session
  | 'ready'         // session + active profile + matrix loaded
  | 'no-profile'    // session but no profiles row (trigger missing / deleted)
  | 'inactive'      // profile.status = inactive
  | 'error';        // failed to load profile/matrix

interface AuthContextType {
  // Session
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;          // session + active profile loaded
  status: AuthStatus;
  error: string | null;
  passwordRecovery: boolean;         // arrived via invite/recovery link: must set a password
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearPasswordRecovery: () => void;
  refresh: () => Promise<void>;      // reload profile, users, memberships and matrix

  // Identity & data
  currentUser: User;
  users: User[];                     // profiles visible under RLS
  memberCompanyIds: string[];        // offices the user belongs to (Super Admin sees all regardless)
  memberships: Membership[];         // all memberships visible under RLS (self, or all with users-roles:view)
  isSuperAdmin: boolean;
  roles: Role[];                     // data-driven roles (public.roles)
  rolePermissions: RolePermission[]; // full matrix (all roles)
  approvalLimits: ApprovalLimit[];
  roleById: (id: string | null | undefined) => Role | undefined;
  roleIn: (companyId: string) => Role | undefined; // effective role in one office (mirrors my_role_in)

  // Authorisation (UI only: RLS/RPCs enforce the same rules server-side)
  // hasPermission without an office: true if any of the user's roles grants it (mirrors has_perm);
  // pass companyId to check one office (mirrors can_in).
  hasPermission: (permission: Permission, moduleName?: string, companyId?: string) => boolean;
  canAccessPage: (page: AppPage, role?: UserRole) => boolean;
  canApprove: (module: string, amount: number, companyId?: string) => boolean;
}

const GUEST: User = { id: '', name: '', email: '', role: 'Viewer', department: '', status: 'inactive' };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const InnerAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState<boolean>(
    authService.initialUrlAuthType === 'recovery' || authService.initialUrlAuthType === 'invite'
  );

  const [currentUser, setCurrentUser] = useState<User>(GUEST);
  const [users, setUsers] = useState<User[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [approvalLimits, setApprovalLimits] = useState<ApprovalLimit[]>([]);

  const userId = session?.user.id ?? null;
  const loadSeq = useRef(0);

  // 1. Session: initial check + subscription. Never call Supabase inside the callback (deadlock risk).
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (!alive) return;
      if (err) setError(err.message);
      setSession(data.session);
      setSessionChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      setSession(s);
      setSessionChecked(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2. Profile + matrix, reloaded when the signed-in user changes (not on token refresh).
  // silent: keep the app mounted while reloading (used by refresh after admin edits).
  const load = useCallback(async (uid: string, silent = false) => {
    const seq = ++loadSeq.current;
    if (!silent) setStatus('loading');
    setError(null);
    try {
      const profile = await authService.fetchProfile(uid);
      if (seq !== loadSeq.current) return;
      if (!profile) {
        setCurrentUser(GUEST);
        setStatus('no-profile');
        return;
      }
      const roleRows = await authService.fetchRoles(); // first: names are needed to map profiles and grants
      if (seq !== loadSeq.current) return;
      const [allMembers, perms, limits, profiles] = await Promise.all([
        authService.fetchMemberships(),
        authService.fetchRolePermissions(),
        authService.fetchApprovalLimits(),
        profile.status === 'active' ? authService.fetchProfiles() : Promise.resolve([profile]),
      ]);
      if (seq !== loadSeq.current) return;
      const firstCompany = (id: string) => allMembers.find(m => m.userId === id)?.companyId;
      const me = authService.profileToUser(profile, firstCompany(profile.id));
      setCurrentUser(me);
      setMemberships(allMembers);
      setRoles(roleRows);
      setRolePermissions(perms);
      setApprovalLimits(limits);
      setUsers(profiles.map(p => authService.profileToUser(p, firstCompany(p.id))));
      setStatus(me.status === 'active' ? 'ready' : 'inactive');
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (silent) throw e; // keep the current state; the caller shows the error
      setError((e as Error).message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!sessionChecked) return;
    if (!userId) {
      loadSeq.current++;
      setCurrentUser(GUEST);
      setUsers([]);
      setMemberships([]);
      setRoles([]);
      setRolePermissions([]);
      setApprovalLimits([]);
      setStatus('signed-out');
      return;
    }
    void load(userId);
  }, [sessionChecked, userId, load]);

  const refresh = useCallback(async () => {
    if (userId) await load(userId, status === 'ready');
  }, [userId, load, status]);

  // Pick up role / status / permission changes made by an admin while this tab was in the background.
  useEffect(() => {
    if (status !== 'ready' || !userId) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 60_000) return;
      last = Date.now();
      load(userId, true).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status, userId, load]);

  const signIn = useCallback(async (email: string, password: string) => {
    await authService.signIn(email, password);
    // onAuthStateChange delivers the session and triggers the profile load.
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authService.signOut();
    } finally {
      // Clear even if the server call failed (e.g. offline); supabase-js already dropped the local session.
      purgeLegacyCaches();
      setSession(null);
      setPasswordRecovery(false);
    }
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setPasswordRecovery(false);
    if (typeof window !== 'undefined' && /type=(recovery|invite)/.test(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // ---------------------------------------------------------------- authorisation
  const roleById = useCallback((id: string | null | undefined) => roles.find(r => r.id === id), [roles]);
  const myRole = roleById(currentUser.roleId);
  // mirrors is_super_admin(): active profile with the super role
  const isSuperAdmin = status === 'ready' && (!!myRole?.isSuper || (!myRole && currentUser.role === 'Super Admin'));

  const memberCompanyIds = useMemo(
    () => memberships.filter(m => m.userId === currentUser.id).map(m => m.companyId),
    [memberships, currentUser.id]
  );

  const grantIndex = useMemo(() => {
    const idx = new Map<string, Set<string>>();
    for (const rp of rolePermissions) {
      let set = idx.get(rp.roleId);
      if (!set) idx.set(rp.roleId, (set = new Set()));
      set.add(`${rp.module}:${rp.action}`);
    }
    return idx;
  }, [rolePermissions]);

  const roleHasId = useCallback(
    (roleId: string | null | undefined, module: string, action: Permission): boolean => {
      if (!roleId) return false;
      if (roles.find(r => r.id === roleId)?.isSuper) return true;
      return grantIndex.get(roleId)?.has(`${module}:${action}`) ?? false;
    },
    [grantIndex, roles]
  );
  const roleNameToId = useCallback((name: string) => roles.find(r => r.name === name)?.id, [roles]);

  // effective role in an office: membership role, else the organization role (members, all-office users)
  const roleIdIn = useCallback(
    (companyId: string): string | undefined => {
      const m = memberships.find(x => x.userId === currentUser.id && x.companyId === companyId);
      if (m) return m.roleId ?? currentUser.roleId;
      if (currentUser.allOffices || isSuperAdmin) return currentUser.roleId;
      return undefined;
    },
    [memberships, currentUser.id, currentUser.roleId, currentUser.allOffices, isSuperAdmin]
  );
  const roleIn = useCallback((companyId: string) => roleById(roleIdIn(companyId)), [roleById, roleIdIn]);

  // every role the user holds anywhere (organization role + office roles)
  const myRoleIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentUser.roleId) ids.add(currentUser.roleId);
    for (const m of memberships) if (m.userId === currentUser.id && m.roleId) ids.add(m.roleId);
    return Array.from(ids);
  }, [memberships, currentUser.id, currentUser.roleId]);

  const hasPermission = useCallback(
    (permission: Permission, moduleName?: string, companyId?: string): boolean => {
      if (status !== 'ready') return false;
      if (isSuperAdmin) return true;
      if (!moduleName) {
        return myRoleIds.some(id => Array.from(grantIndex.get(id) ?? []).some(k => k.endsWith(':' + permission)));
      }
      const module = resolveModule(moduleName);
      if (companyId) return roleHasId(roleIdIn(companyId), module, permission);
      return myRoleIds.some(id => roleHasId(id, module, permission));
    },
    [status, isSuperAdmin, myRoleIds, grantIndex, roleHasId, roleIdIn]
  );

  const canAccessPage = useCallback(
    (page: AppPage, role?: UserRole): boolean => {
      const module = PAGE_MODULE[page];
      if (module === undefined) return false; // unknown page id: deny
      if (role) {
        // preview for a named role (Users & Roles page)
        return module === null || roleHasId(roleNameToId(role), module, 'view');
      }
      if (status !== 'ready') return false;
      if (isSuperAdmin || module === null) return true;
      return myRoleIds.some(id => roleHasId(id, module, 'view'));
    },
    [status, isSuperAdmin, myRoleIds, roleHasId, roleNameToId]
  );

  const canApprove = useCallback(
    (module: string, amount: number, companyId?: string): boolean => {
      if (status !== 'ready') return false;
      if (isSuperAdmin) return true;
      const ids = companyId ? [roleIdIn(companyId)].filter(Boolean) as string[] : myRoleIds;
      return approvalLimits.some(l => ids.includes(l.roleId) && l.module === module && (l.maxAmount == null || amount <= l.maxAmount));
    },
    [status, isSuperAdmin, roleIdIn, myRoleIds, approvalLimits]
  );

  const value: AuthContextType = {
    session,
    loading: status === 'loading',
    isAuthenticated: status === 'ready',
    status,
    error,
    passwordRecovery,
    signIn,
    signOut,
    clearPasswordRecovery,
    refresh,
    currentUser,
    users,
    memberCompanyIds,
    memberships,
    isSuperAdmin,
    roles,
    rolePermissions,
    approvalLimits,
    roleById,
    roleIn,
    hasPermission,
    canAccessPage,
    canApprove,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Idempotent: a nested <AuthProvider> (e.g. the one still in App.tsx while main.tsx also wraps)
// reuses the outer context instead of opening a second auth subscription.
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const parent = useContext(AuthContext);
  if (parent) return <>{children}</>;
  return <InnerAuthProvider>{children}</InnerAuthProvider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
