'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Lock, ArrowRight, ArrowLeft } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { BrandMark, Button, Callout, Card, Field, Spinner } from '@/components/ui';

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
      setSubmitting(false);
    }
  }

  return (
    <Card className="auth-card">
      <div className="brand">
        <BrandMark size={44} />
        <span className="brand__text">
          <span className="brand__en">Oromia Health Bureau</span><br></br>
          <span className="brand__om">Biiroo Eegumsa Fayyaa Oromiyaa</span>
        </span>
      </div>

      <div className="micro-label" style={{ marginBottom: 6 }}>
        Account Recovery
      </div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Choose a new password</h1>
      <p className="muted text-sm" style={{ marginBottom: 20 }}>
        Enter a new password for your account.
      </p>

      {done ? (
        <>
          <Callout tone="success" title="Password updated">
            Your password has been changed. You can now sign in with your new password.
          </Callout>
          <Link
            href="/login"
            className="btn btn--block"
            style={{ marginTop: 16 }}
          >
            Go to sign in <ArrowRight size={16} />
          </Link>
        </>
      ) : !token ? (
        <>
          <Callout tone="danger" title="Missing reset link">
            This page needs a valid reset link. Please request a new one.
          </Callout>
          <Link
            href="/forgot-password"
            className="btn btn--ghost btn--sm btn--block"
            style={{ marginTop: 16 }}
          >
            Request a reset link
          </Link>
        </>
      ) : (
        <>
          {error && (
            <div style={{ marginBottom: 16 }}>
              <Callout tone="danger" title="Could not reset password">
                {error}
              </Callout>
            </div>
          )}

          <form onSubmit={handleSubmit}>
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

          <p className="auth-aside">
            <Link href="/login" className="auth-link">
              <ArrowLeft size={14} style={{ verticalAlign: 'middle' }} /> Back to sign in
            </Link>
          </p>
        </>
      )}
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-wrap">
      <Suspense
        fallback={
          <div className="loading-screen">
            <Spinner />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
