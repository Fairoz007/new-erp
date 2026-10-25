import React, { ReactNode, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LoginPage } from '../../pages/auth/LoginPage';
import { SetPasswordPage } from '../../pages/auth/SetPasswordPage';
import { AuthShell, AuthNotice } from '../../pages/auth/AuthShell';
import { Button } from '../ui/Button';

// Renders the app only for a signed-in user with an active profile.
// Must sit inside <AuthProvider> and outside anything that loads business data (FleetProvider).
export const AuthGate: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { status, error, session, passwordRecovery, signOut, refresh } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);

  // No profile / inactive profile: sign out and explain on the login screen.
  useEffect(() => {
    if (status === 'no-profile' || status === 'inactive') {
      setNotice(
        status === 'inactive'
          ? 'Your account has been deactivated. Contact your administrator if you need access.'
          : 'Your account has no user profile yet. Ask your administrator to finish setting up your access.'
      );
      void signOut().catch(() => undefined);
    }
  }, [status, signOut]);

  // Clear the notice once someone signs in successfully.
  useEffect(() => {
    if (status === 'ready') setNotice(null);
  }, [status]);

  if (session && passwordRecovery) return <SetPasswordPage />;

  if (status === 'ready') return <>{children}</>;

  if (status === 'error') {
    return (
      <AuthShell title="Could not load your account" subtitle="Your session is valid but your profile or permissions failed to load.">
        <AuthNotice tone="error">{error ?? 'Unknown error'}</AuthNotice>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void refresh()}>
            Retry
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (status === 'signed-out') return <LoginPage notice={notice} />;

  // loading, or no-profile/inactive while the sign-out above completes
  return (
    <div className="min-h-screen w-full bg-surface-secondary flex items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-2.5 text-sm text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin text-[#086343]" />
        <span>Loading your workspace…</span>
      </div>
    </div>
  );
};
