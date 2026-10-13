'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AtSign, ArrowRight, ArrowLeft } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { BrandMark, Button, Callout, Card, Field } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      // The API intentionally returns the same result whether or not the email
      // matches an account, so we always show the same confirmation.
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
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
          Account Recovery
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Reset your password</h1>
        <p className="muted text-sm" style={{ marginBottom: 20 }}>
          Enter the email address for your account and we&rsquo;ll send you a link to
          choose a new password.
        </p>

        {sent ? (
          <>
            <Callout tone="success" title="Check your email">
              If an account exists for <strong>{email.trim()}</strong>, a password reset
              link is on its way. The link expires in 60 minutes.
            </Callout>
            <Link
              href="/login"
              className="btn btn--ghost btn--sm btn--block"
              style={{ marginTop: 16 }}
            >
              <ArrowLeft size={16} /> Back to sign in
            </Link>
          </>
        ) : (
          <>
            {error && (
              <div style={{ marginBottom: 16 }}>
                <Callout tone="danger" title="Could not send reset link">
                  {error}
                </Callout>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <Field label="Email" htmlFor="email">
                <div className="input-group">
                  <AtSign className="input-group__icon" size={16} />
                  <input
                    id="email"
                    className="input"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@ohb.local"
                  />
                </div>
              </Field>

              <Button type="submit" block disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset link'}
                {!submitting && <ArrowRight size={16} />}
              </Button>
            </form>

            <p className="auth-aside">
              <Link href="/login" className="auth-link">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
