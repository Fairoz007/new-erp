import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { updatePassword } from '../../services/auth';
import { AuthShell, AuthNotice } from './AuthShell';

const MIN_LENGTH = 8;

// Shown after an invite or password-recovery link signs the user in: they must choose a password.
export const SetPasswordPage: React.FC = () => {
  const { session, clearPasswordRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError('Passwords do not match.');
    setPending(true);
    try {
      await updatePassword(password);
      clearPasswordRecovery();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  };

  return (
    <AuthShell
      title="Choose a password"
      subtitle={session?.user.email ? `Signed in as ${session.user.email}` : 'Set a password to finish signing in.'}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <AuthNotice tone="error">{error}</AuthNotice>}
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          hint={`At least ${MIN_LENGTH} characters.`}
          required
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
          required
        />
        <Button type="submit" className="w-full" isLoading={pending}>
          Save password
        </Button>
      </form>
      <button
        type="button"
        onClick={() => void signOut()}
        className="text-xs font-semibold text-slate-400 hover:text-slate-100 cursor-pointer"
      >
        Cancel and sign out
      </button>
    </AuthShell>
  );
};
