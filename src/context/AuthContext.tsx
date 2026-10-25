import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { User, UserRole, Permission } from '../types/system';
import type { AppPage } from './UIContext';
import { supabase } from '../lib/supabase';
import * as authService from '../services/auth';
import type { ApprovalLimit, Membership, RolePermission } from '../services/auth';

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
  rolePermissions: RolePermission[]; // full matrix (all roles)
  approvalLimits: ApprovalLimit[];

  // Authorisation (UI only: RLS/RPCs enforce the same rules server-side)
  hasPermission: (permission: Permission, moduleName?: string) => boolean;
  canAccessPage: (page: AppPage, role?: UserRole) => boolean;
  canApprove: (module: 'maintenance' | 'invoice' | 'expense', amount: number) => boolean;
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

  const signIn = useCallback(async (email: string, password: string) => {
    await authService.signIn(email, password);
    // onAuthStateChange delivers the session and triggers the profile load.
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authService.signOut();
    } finally {
      // Clear even if the server call failed (e.g. offline); supabase-js already dropped the local session.
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
  const isSuperAdmin = status === 'ready' && currentUser.role === 'Super Admin'; // mirrors is_super_admin(): active profile only

  const permIndex = useMemo(() => {
    const idx = new Map<UserRole, Map<string, Set<Permission>>>();
    for (const rp of rolePermissions) {
      let byModule = idx.get(rp.role);
      if (!byModule) idx.set(rp.role, (byModule = new Map()));
      let actions = byModule.get(rp.module);
      if (!actions) byModule.set(rp.module, (actions = new Set()));
      actions.add(rp.action);
    }
    return idx;
  }, [rolePermissions]);

  const roleHas = useCallback(
    (role: UserRole, module: string, action: Permission): boolean => {
      if (role === 'Super Admin') return true;
      return permIndex.get(role)?.get(module)?.has(action) ?? false;
    },
    [permIndex]
  );

  const hasPermission = useCallback(
    (permission: Permission, moduleName?: string): boolean => {
      if (status !== 'ready') return false;
      if (isSuperAdmin) return true;
      const role = currentUser.role;
      if (!moduleName) {
        // No module: true if the role holds this action on any module (legacy semantics; no current call site).
        const byModule = permIndex.get(role);
        return !!byModule && Array.from(byModule.values()).some(set => set.has(permission));
      }
      return roleHas(role, resolveModule(moduleName), permission);
    },
    [status, isSuperAdmin, currentUser.role, permIndex, roleHas]
  );

  const canAccessPage = useCallback(
    (page: AppPage, role?: UserRole): boolean => {
      const r = role ?? currentUser.role;
      if (!role) {
        if (status !== 'ready') return false;
        if (isSuperAdmin) return true;
      }
      const module = PAGE_MODULE[page];
      if (module === undefined) return false; // unknown page id: deny
      if (module === null) return true;
      return roleHas(r, module, 'view');
    },
    [status, isSuperAdmin, currentUser.role, roleHas]
  );

  const canApprove = useCallback(
    (module: 'maintenance' | 'invoice' | 'expense', amount: number): boolean => {
      if (status !== 'ready') return false;
      if (isSuperAdmin) return true;
      const limit = approvalLimits.find(l => l.role === currentUser.role && l.module === module);
      if (!limit) return false;
      return limit.maxAmount == null || amount <= limit.maxAmount;
    },
    [status, isSuperAdmin, currentUser.role, approvalLimits]
  );

  const memberCompanyIds = useMemo(
    () => memberships.filter(m => m.userId === currentUser.id).map(m => m.companyId),
    [memberships, currentUser.id]
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
    rolePermissions,
    approvalLimits,
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
