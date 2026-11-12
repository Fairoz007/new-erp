// Decides between the Setup Wizard and the app once a user is signed in.
//  * No organization yet: Super Admin runs the wizard; everyone else sees "setup in progress".
//  * Organization exists but setup is unfinished (e.g. an existing install after upgrade):
//    the Super Admin is taken to the wizard and may continue to the app once an office exists;
//    other users keep working normally.
import React, { ReactNode, Suspense, lazy, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { AuthShell, AuthNotice } from '../auth/AuthShell';
import { Button } from '../../components/ui/Button';

const SetupWizard = lazy(() => import('./SetupWizard').then(m => ({ default: m.SetupWizard })));

const Spinner: React.FC<{ text: string }> = ({ text }) => (
  <div className="min-h-screen w-full bg-surface-secondary flex items-center justify-center" role="status" aria-live="polite">
    <div className="flex items-center gap-2.5 text-sm text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin text-[#086343]" /> <span>{text}</span>
    </div>
  </div>
);

export const SetupGate: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSuperAdmin, signOut, refresh } = useAuth();
  const { organization, loading, error, reload, setupComplete } = useOrg();
  const [deferred, setDeferred] = useState(false);

  if (loading) return <Spinner text="Loading organization…" />;
  if (error) {
    return (
      <AuthShell title="Could not load the organization" subtitle="The organization settings failed to load.">
        <AuthNotice tone="error">{error}</AuthNotice>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void reload()}>Retry</Button>
          <Button variant="outline" className="flex-1" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </AuthShell>
    );
  }
  if (setupComplete || (organization && (deferred || !isSuperAdmin))) return <>{children}</>;
  if (isSuperAdmin) {
    return (
      <Suspense fallback={<Spinner text="Opening setup…" />}>
        <SetupWizard onDefer={organization ? () => setDeferred(true) : undefined} />
      </Suspense>
    );
  }
  return (
    <AuthShell title="Setup in progress" subtitle="Your organization has not been set up yet.">
      <AuthNotice tone="info">A Super Admin must finish the Setup Wizard before the app can be used. Try again later.</AuthNotice>
      <div className="flex gap-2">
        {/* re-read the user's role too: an admin may have just made this user a Super Admin */}
        <Button className="flex-1" onClick={() => void Promise.all([refresh(), reload()])}>Check again</Button>
        <Button variant="outline" className="flex-1" onClick={() => void signOut()}>Sign out</Button>
      </div>
    </AuthShell>
  );
};
