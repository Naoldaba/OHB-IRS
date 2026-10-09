'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight } from 'lucide-react';
import { useAuth, homeFor } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { BrandMark, Button, Callout, Card, Field, Spinner } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function ChangePasswordPage() {
  const { user, loading, refresh, logout } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Only signed-in users can be here; a signed-out user goes to login.
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );
  }

  const forced = user.mustChangePassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      await refresh();
      router.replace(homeFor(user.scope));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <ThemeToggle floating />
      <Card className="auth-card">
        <div className="brand">
          <BrandMark size={44} />
          <span className="brand__text">
            <span className="brand__en">Oromia Health Bureau</span><br></br>
            <span className="brand__om">Biiroo Eegumsa Fayyaa Oromiyaa</span>
          </span>
        </div>

        <div className="micro-label" style={{ marginBottom: 6 }}>
          Account Security
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Change your password</h1>
        <p className="muted text-sm" style={{ marginBottom: 20 }}>
          {forced
            ? 'Your account uses a temporary password set by the administrator. Choose a new password to continue.'
            : 'Update the password you use to sign in.'}
        </p>

        {error && (
          <div style={{ marginBottom: 16 }}>
            <Callout tone="danger" title="Could not change password">
              {error}
            </Callout>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Field label={forced ? 'Temporary password' : 'Current password'} htmlFor="current">
            <div className="input-group">
              <Lock className="input-group__icon" size={16} />
              <input
                id="current"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </Field>

          <Field label="New password" htmlFor="new" hint="At least 8 characters.">
            <div className="input-group">
              <Lock className="input-group__icon" size={16} />
              <input
                id="new"
                className="input"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={100}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </Field>

          <Field label="Confirm new password" htmlFor="confirm">
            <div className="input-group">
              <Lock className="input-group__icon" size={16} />
              <input
                id="confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </Field>

          <Button type="submit" block disabled={submitting}>
            {submitting ? 'Saving…' : 'Set new password'}
            {!submitting && <ArrowRight size={16} />}
          </Button>
        </form>

        <button
          type="button"
          className="btn btn--ghost btn--sm btn--block"
          style={{ marginTop: 12 }}
          onClick={() => logout().then(() => router.replace('/login'))}
        >
          Sign out
        </button>
      </Card>
    </div>
  );
}
