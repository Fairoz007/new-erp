# Agent G: Authentication & Security

Scope: real Supabase Auth, AuthContext on the DB permission matrix, login/password flows, Header/Sidebar, Users & Roles, and a security review.
Nothing was written to the remote database. The dev server was not run.

## Files

| File | Change |
|---|---|
| `src/context/AuthContext.tsx` | Rewritten on Supabase Auth. Same API shape (`currentUser`, `users`, `hasPermission`, `canAccessPage`, `canApprove`). Adds `session`, `loading`, `isAuthenticated`, `status`, `error`, `signIn`, `signOut`, `refresh`, `memberCompanyIds`, `memberships`, `isSuperAdmin`, `rolePermissions`, `approvalLimits`, `passwordRecovery`, `clearPasswordRecovery`. **`setCurrentUserId` removed.** `AuthProvider` is idempotent: a nested one passes through. |
| `src/services/auth.ts` (new) | signIn, signOut, requestPasswordReset, updatePassword, fetchProfile(s), fetchMemberships, fetchRolePermissions, fetchApprovalLimits, updateUserProfile, setUserCompanies (RPC), profileToUser. Every function throws `ServiceError`. |
| `src/components/layout/AuthGate.tsx` (new) | Shows a loading screen, then SetPasswordPage (invite or recovery link), then LoginPage (no session), then an error screen with retry and sign-out. Once the profile is active, it renders the app. A missing or inactive profile signs the user out and explains why. |
| `src/components/layout/UserAvatar.tsx` (new) | Avatar with an initials fallback (`profiles.avatar` is optional). |
| `src/pages/auth/LoginPage.tsx`, `SetPasswordPage.tsx`, `AuthShell.tsx` (new) | Email and password sign-in, "Forgot password", and set-password after an invite or recovery link. There is no sign-up UI. |
| `src/main.tsx` | Wraps `<App/>` in `<AuthProvider><AuthGate>`. No business data (FleetProvider) mounts before sign-in. |
| `src/components/layout/Header.tsx` | Role switcher replaced by the signed-in user's name and role plus **Sign out**. The office switcher lists the real accessible `companies` (it was hard-coded to `comp-1`/`comp-2` and "Muscat HQ"/"Duqm" labels). Quick-add entries are filtered by `canAccessPage` and `create` permission. |
| `src/components/layout/Sidebar.tsx` | Restricted links are now **hidden** (they used to show with a lock), and empty groups are hidden. The fake "Download Driver App / Get Driver Portal" promo card is removed (no driver app exists; it linked to Documents). |
| `src/pages/users-roles/UsersRolesPage.tsx` | Real profiles, memberships and matrix. Edit modal for name, department, phone, role, status and offices. Read-only without `users-roles:edit`. The fake "Switch User" buttons and the hard-coded matrix are gone. |
| `supabase/migrations/20261026000600_auth.sql` (new) | Security hardening plus the `set_user_companies` RPC (see the Security review section). |
| `supabase/tests/20261026000600_auth.test.mjs` (new) | 29 checks, all passing. Standalone: `node supabase/tests/20261026000600_auth.test.mjs supabase/migrations`. `npm run test:db` still passes 26/26. |

## Permission model in the client

- **Super Admin bypass** happens when `role === 'Super Admin'` and the profile is active, which matches `is_super_admin()` / `app_role()`. An inactive profile gets nothing, because the gate signs it out.
- **`canAccessPage(page)`** is true when the role has `view` on `PAGE_MODULE[page]`. The seed only created rows where the old `canAccessPage` was true, and every such role had `view`, so this is exactly the old page rule.
- **`hasPermission(action, module)`** resolves the module through `MODULE_ALIASES`, then looks it up in `role_permissions`. Called without a module, it is true if the role has that action on any module (no call site does this).
- **`canApprove(module, amount)`** reads `approval_limits` (`max_amount` null means unlimited), the same as SQL `can_approve`.
- **Unknown module or page** is denied, except for Super Admin.

### Page to module map (`PAGE_MODULE`)

| Page(s) | Module |
|---|---|
| dashboard | *(none)*: open to every active user. Its widgets only show rows that RLS returns. |
| companies | companies |
| vehicles, vehicle-detail, **profitability** | vehicles. Profitability used to be open to all roles, and every role has `vehicles:view`, so behaviour is unchanged. |
| maintenance / work-orders / accidents / expenses / documents / suppliers / customers / invoices / payments / reconciliation / payroll / approvals / notifications / audit-logs / reports / users-roles / settings | same name |
| oil-management | oil |
| tyre-management | tyres |
| accounting, trial-balance, general-ledger, profit-loss, balance-sheet | accounting |
| fixed-assets, depreciation | fixed-assets |

`PAGE_MODULE` is typed `Record<AppPage, …>`, so adding a page without a mapping fails `tsc`.

### Legacy module aliases (`MODULE_ALIASES`)

`finance`, `pnl`, `profit-loss`, `balance-sheet`, `trial-balance` and `general-ledger` map to `accounting`. `oil-management` maps to `oil`, `tyre-management` to `tyres`, `depreciation` to `fixed-assets`, `vehicle-detail` and `profitability` to `vehicles`, `hr` to `payroll`, `users` to `users-roles`, and `audit` to `audit-logs`.

### Call-site audit (every `hasPermission(` / `canAccessPage(` / `canApprove(` in `src/`)

| Call site | Call | Old meaning | New meaning |
|---|---|---|---|
| App.tsx:46 | `canAccessPage(currentPage)` | page switch | view on the mapped module. Same for every role and page. |
| Sidebar.tsx | `canAccessPage(item.id)` | showed lock | same rule; links are now hidden |
| Header.tsx (quick add) | `canAccessPage(p) && hasPermission('create', m)` | (not filtered) | same rule as UIContext |
| UIContext.tsx:241 | `canAccessPage(page) && hasPermission('create', module)` for every quick modal | role switch | matrix. Identical, because the seed is "page access AND old hasPermission". |
| UIContext.tsx:250 | `canAccessPage('invoices')` | role switch | `invoices:view`, identical |
| AccountingPage.tsx:41,243 | `hasPermission('create','accounting')` | SA/CA/FM/Accountant | identical (Management view-only, others have no page) |
| WorkOrdersPage.tsx:27 | `hasPermission('edit','work-orders')` | role switch | identical for every role |
| WorkOrdersPage.tsx:31 | `canApprove('maintenance', cost)` | SA/CA/FinMgr unlimited, Fleet Mgr ≤ 500 | `approval_limits`, identical |
| ApprovalsPage.tsx:32,73 | `canApprove(module, amount)` | same | identical |

One change in semantics: the old `hasPermission` ignored page access. For example, Fleet Manager `hasPermission('create','payroll')` used to be `true` and is now `false`. RLS already refused those writes, so this only removes buttons that would have failed. Every current call site pairs it with `canAccessPage` or targets a module the role can open, so no visible behaviour changes.

## Action inventory

| Control | Behaviour | Backend op | Auth requirement | Status |
|---|---|---|---|---|
| Login: Sign in | validate, then `signInWithPassword`; errors shown inline; button disabled while pending | Supabase Auth | none | Done |
| Login: Forgot password | sends a reset email; confirmation does not reveal whether the account exists | `resetPasswordForEmail(redirectTo = app origin)` | none | Done |
| Set password (after invite or recovery link) | needs at least 8 characters and a matching confirmation | `auth.updateUser({password})` | recovery or invite session | Done |
| Set password: Cancel | signs out | `auth.signOut` | session | Done |
| Gate: no profile / inactive | signs out and shows the reason on the login page | — | — | Done |
| Gate: load error | Retry / Sign out | reload profile and matrix | session | Done |
| Header: account menu | shows name, email, role and department | — | signed in | Done |
| Header: Sign out | `signOut`; error shown in the menu if it fails; the app unmounts | `auth.signOut` | signed in | Done |
| Header: role switcher | **removed** | — | — | Removed |
| Header: office switcher | lists the `companies` the user can see (RLS) plus "All offices"; empty state | FleetContext `companies` | signed in | Done (depends on the coordinator's Supabase `companies`) |
| Header: quick add | only entries the user can create | UIContext re-checks | create perm | Done |
| Sidebar links | hidden when `canAccessPage` is false | — | view perm | Done |
| Users & Roles: list | profiles visible under RLS, with search | `select profiles`, `company_members` | `users-roles:view` (page gate) | Done |
| Users & Roles: Edit | name, department, phone, role, status | `update profiles` (guard trigger) | `users-roles:edit`; see guard rules | Done |
| Users & Roles: Offices | checkboxes for the offices the editor manages (Super Admin: all) | RPC `set_user_companies` (atomic, RLS) | `users-roles:edit` + access to the office | Done |
| Users & Roles: matrix | live `role_permissions` per role plus `approval_limits` | select | any signed-in user | Done |
| Users & Roles: Invite | **no button.** Inviting needs the service-role key, so the page explains the Dashboard procedure. | — | Super Admin via Dashboard | Documented |
| Users & Roles: "Switch User" | **removed** (it was fake auth) | — | — | Removed |

## Issues

| # | Sev | Issue | Status |
|---|---|---|---|
| G1 | P0 | Fake auth: the app started as Super Admin and anyone could switch to any seeded user | **Fixed** (Supabase Auth, gate, switcher removed) |
| G2 | P1 | **Company Admin could promote themselves (or anyone) to Super Admin.** The guard only checked `has_perm('users-roles','edit')`, which Company Admin has. | **Fixed** in 000600: only a Super Admin may grant, change or revoke Super Admin; nobody but a Super Admin can change their own role or status. Tested. |
| G3 | P1 | **Company Admin could add themselves (or anyone) to any office** (`members_write` only checked `users-roles:edit`), which broke office isolation | **Fixed**: insert, update and delete require `has_company_access(company_id)`; a trigger blocks non-Super-Admins from touching a Super Admin's memberships. Tested. |
| G4 | P1 | Company Admin could edit or deactivate users of other offices | **Fixed**: the guard only allows targets that share an office with the editor, or that have no office yet (fresh invitees). Tested. |
| G5 | P2 | Any user could change their own `profiles.email` (shown to colleagues), so they could pass as someone else | **Fixed**: `id`, `email` and `legacy_id` are not editable from the client. Tested. |
| G6 | P2 | `role_permissions` / `approval_limits` are global (cross-office) but writable by any `settings:edit` holder (Company Admin) | **Fixed**: Super Admin only. `approval_rules` is unchanged (`settings:edit`). |
| G7 | P2 | The last active Super Admin could demote or deactivate themselves (lock-out) | **Fixed**: the guard refuses. Server-side SQL can still recover. |
| G8 | P2 | Self sign-up is enabled (`supabase/config.toml` `[auth] enable_signup = true`, `[auth.email] enable_signup = true`; remote default is the same). Anyone with the public key can create a Viewer account. With no office membership, such an account sees only its own profile and the global config tables. | **Open**: owner E for config.toml (set both to `false`, `minimum_password_length = 8`); a Super Admin for the remote Dashboard. Invites keep working with sign-ups off. |
| G9 | P2 | `.gitignore` covers `.env`, `.env.local` and `.env*.local` but not `.env.production` / `.env.development` | **Open** (root file, coordinator): add `.env.*` and `!.env.example` |
| G10 | P3 | `dist/` is committed. No keys are in its history (checked), but a future build would embed the URL and publishable key. | **Open** (coordinator): `git rm -r --cached dist` and add `dist` to `.gitignore` |
| G11 | P3 | Hard-coded `'usr-1'` user ids: `QuickActionModals.tsx:112,474` (`requestedBy`), `FleetContext.tsx:384,1258` | **Open** (coordinator): use `useAuth().currentUser.id`, or omit it and let the DB default `auth.uid()`. FleetProvider now sits inside AuthProvider, so `useAuth()` works there. |
| G12 | P3 | UIContext quick-modal map uses module `accounting` for `run-depreciation` / `add-fixed-asset`; RLS uses `fixed-assets` | **Open** (UIContext owner): change to `'fixed-assets'`. Equivalent with today's seed, so no behaviour change. |
| G13 | P3 | `config.toml` `site_url = http://127.0.0.1:3000`, but Vite serves on 5173. Reset and invite links would point at the wrong origin locally. | **Open** (E): set `site_url` / `additional_redirect_urls` to the Vite origin |
| G14 | P3 | Fake "Download Driver App" promo in the Sidebar | **Fixed** (removed) |

## Security review

- **Client-side trust:** roles come only from `profiles.role`, read through RLS. Nothing reads `user_metadata` / `app_metadata` in `src/`. `handle_new_user` copies only `name` from metadata, and role defaults to Viewer (tested with a `{"role":"Super Admin"}` metadata payload). Client checks are UI only: every rule is enforced again by RLS, the guard triggers and the RPCs.
- **Keys:** the browser uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Vite `envPrefix` adds `NEXT_PUBLIC_`). No service-role or secret key appears anywhere in the working tree or in `git log -p --all`, including the committed `dist/` history. The only key-like string ever committed is the placeholder `sb_publishable_xxx` in `.env.example`. `.env` is gitignored and untracked. **Never prefix a service or secret key with `VITE_` or `NEXT_PUBLIC_`**: it would be bundled.
- **profiles:** update policy is self or `users-roles:edit`. The new guard covers role/status (admins only, office-scoped, no self-change, Super Admin only by a Super Admin, never the last SA), identity columns (locked), and cross-office edits. There is no insert or delete policy, so profiles are created only by the auth trigger.
- **company_members:** select is self or `users-roles:view`; writes need `users-roles:edit` + `has_company_access(company_id)`; Super Admin targets are protected. A Fleet Manager or Company Admin adding themselves to another office is refused (tested).
- **Inactive users:** `app_role()` returns null, so they have no permissions and no office access (tested). The client gate also signs them out.
- **Sessions:** supabase-js keeps the session in localStorage (standard for SPAs). Any XSS could steal it, so keep `dangerouslySetInnerHTML` out of user-controlled content.
- **Dependency for E:** the company-bootstrap trigger that adds the creator to `company_members` **must be `SECURITY DEFINER`** (owned by `postgres`). The new insert policy requires `has_company_access(company_id)`, which the creator does not yet have for a brand-new company.

## Bootstrap: first Super Admin (remote has 0 users)

1. Dashboard, Authentication, Sign In / Providers, Email: turn **off** "Allow new users to sign up" (invites still work). Set the minimum password length to 8.
2. Authentication, URL Configuration: set **Site URL** to the app origin (for example `https://erp.example.com`). Add `http://localhost:5173` to the Redirect URLs for dev. Reset and invite links come back to the app, which shows the set-password screen.
3. Authentication, Users, **Invite user** with your email. Open the email link and choose a password. You land as a Viewer with no office, so the app works but is empty.
4. SQL editor, which runs server-side so the guard allows it:
   ```sql
   update public.profiles set role = 'Super Admin', status = 'active' where email = 'you@example.com';
   ```
5. Reload the app. As Super Admin, create the offices (Offices page), invite the other users from the Dashboard, then assign their role and offices on **Users & Roles**.

### Inviting users later

Only from a trusted place with the service-role key, never the browser:
- Dashboard, Authentication, Users, Invite user. The invitee appears in Users & Roles as Viewer with no office, and a Company Admin or Super Admin then assigns a role and offices.
- Or the Admin API from a local shell, keeping the key out of git: `curl -X POST "$SUPABASE_URL/auth/v1/invite" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"email":"user@example.com"}'`
- Removing access: set Status to Inactive in Users & Roles (takes effect immediately in RLS). To delete an account, a Super Admin does it from the Dashboard.

## Integration steps for the coordinator

1. **Nothing is required in App.tsx.** `main.tsx` now renders `<AuthProvider><AuthGate><App/></AuthGate></AuthProvider>`. The `<AuthProvider>` still inside `App.tsx` detects the outer one and becomes a pass-through. Optional cleanup in `src/App.tsx`: delete the `<AuthProvider>` / `</AuthProvider>` lines (145, 151) and change the import to `import { useAuth } from './context/AuthContext';`.
2. **`setCurrentUserId` removed.** Its only consumers were `Header.tsx` and `UsersRolesPage.tsx` (both mine, both fixed). `tsc` shows no errors from the API change. The remaining `tsc` errors are in DocumentUploadZone, DashboardPage and NotificationsPage, which are not mine and not related.
3. FleetProvider now mounts only after sign-in and unmounts on sign-out, so per-user data is not shared between sessions. Inside FleetContext you can call `useAuth()` (for `currentUser.id`, `memberCompanyIds`, `isSuperAdmin`).
4. Header's office switcher reads `useFleet().companies` / `selectedCompanyId` / `setSelectedCompanyId`. Once `companies` comes from Supabase (RLS-filtered), it lists exactly the user's offices. Users & Roles uses the same `companies` for office names and checkboxes.
5. Fix G11 (`'usr-1'`), G12 (UIContext module), G9 and G10 (gitignore, dist).
6. Tell E: G8 and G13 (config.toml), and that the company bootstrap trigger must be `SECURITY DEFINER`. E's runner can call my test file standalone (see Files).
7. Tell D (Settings): `role_permissions` and `approval_limits` writes are now Super Admin only. `approval_rules` is still `settings:edit`.
8. Push order: `20261026000600_auth.sql` runs after E's `000000`. It replaces `guard_profile_update()` and the `members_write`, `role_permissions_write` and `approval_limits_write` policies. If E also redefines `guard_profile_update`, mine wins, because it sorts later.
9. Remote Dashboard settings (bootstrap steps 1–2) must be done before inviting anyone.
