import React, { useState } from 'react';
import { Mail, Lock, ArrowLeft, KeyRound } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { requestPasswordReset } from '../../services/auth';
import { AuthShell, AuthNotice } from './AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// Email + password sign-in and password-reset request. No self sign-up: administrators invite users.
export const LoginPage: React.FC<{ notice?: string | null }> = ({ notice }) => {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'reset'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (!password) return setError('Enter your password.');
    setPending(true);
    try {
      await signIn(email, password);
      // On success the auth gate swaps this page for the app; keep the button disabled until then.
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    setPending(true);
    try {
      await requestPasswordReset(email);
      setResetSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  if (mode === 'reset') {
    return (
      <AuthShell title="Reset your password" subtitle="We will email you a link to choose a new password.">
        {resetSent ? (
          <AuthNotice tone="success">
            If an account exists for <span className="font-semibold">{email.trim()}</span>, a reset link is on its way. Check your inbox.
          </AuthNotice>
        ) : (
          <form onSubmit={handleReset} className="space-y-4" noValidate>
            {error && (
          <div className="space-y-2">
            <AuthNotice tone="error">{error}</AuthNotice>
            {(error.toLowerCase().includes('service unavailable') || error.includes('503') || error.toLowerCase().includes('failed to fetch')) && (
              <div className="text-[11px] p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
                <p className="font-semibold text-amber-100 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> Supabase Connection Notice
                </p>
                <p className="mt-1 text-slate-300 leading-relaxed">
                  The remote Supabase project (<code className="font-mono text-amber-200">fpeniljpqigpeqtsgizr</code>) is paused or unreachable. Unpause it in your Supabase Dashboard, or run <code className="font-mono text-amber-200">npm run seed</code> to verify your schema & enterprise data.
                </p>
              </div>
            )}
          </div>
        )}
            <Input
              label="Work email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              leftIcon={<Mail className="w-4 h-4" />}
              required
            />
            <Button type="submit" className="w-full" isLoading={pending}>
              Send reset link
            </Button>
          </form>
        )}
        <button
          type="button"
          onClick={() => {
            setMode('sign-in');
            setError(null);
            setResetSent(false);
          }}
          className="text-xs font-semibold text-[#086343] hover:text-[#06452F] inline-flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" subtitle="Use the account your administrator invited you with.">
      <form onSubmit={handleSignIn} className="space-y-4" noValidate>
        {notice && <AuthNotice tone="info">{notice}</AuthNotice>}
        {error && (
          <div className="space-y-2">
            <AuthNotice tone="error">{error}</AuthNotice>
            {(error.toLowerCase().includes('service unavailable') || error.includes('503') || error.toLowerCase().includes('failed to fetch')) && (
              <div className="text-[11px] p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
                <p className="font-semibold text-amber-100 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> Supabase Connection Notice
                </p>
                <p className="mt-1 text-slate-300 leading-relaxed">
                  The remote Supabase project (<code className="font-mono text-amber-200">fpeniljpqigpeqtsgizr</code>) is paused or unreachable. Unpause it in your Supabase Dashboard, or run <code className="font-mono text-amber-200">npm run seed</code> to verify your schema & enterprise data.
                </p>
              </div>
            )}
          </div>
        )}
        <Input
          label="Work email"
          type="email"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={e => setEmail(e.target.value)}
          leftIcon={<Mail className="w-4 h-4" />}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          required
        />
        <Button type="submit" className="w-full" isLoading={pending}>
          Sign in
        </Button>
      </form>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setMode('reset');
            setError(null);
          }}
          className="font-semibold text-[#086343] hover:text-[#06452F] cursor-pointer min-h-[44px] sm:min-h-0 inline-flex items-center"
        >
          Forgot password?
        </button>
        <span className="text-slate-400">No account? Ask your administrator.</span>
      </div>
    </AuthShell>
  );
};
