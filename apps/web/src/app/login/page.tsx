'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AtSign, Lock, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuth, landingFor } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { BrandMark, Button, Callout, Card, Field } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function LoginPage() {
  const { user, loading, login, verifyTwoFactor } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Second step: shown after a correct password when the account has 2FA.
  const [twoFactor, setTwoFactor] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!loading && user) router.replace(landingFor(user));
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await login(email.trim(), password);
      if ('twoFactorRequired' in outcome) {
        setTwoFactor(true);
        setSubmitting(false);
        return;
      }
      router.replace(landingFor(outcome.user));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Invalid email or password.'
          : err instanceof ApiError
            ? err.message
            : 'Something went wrong. Please try again.',
      );
      setSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const me = await verifyTwoFactor(code.trim());
      router.replace(landingFor(me));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? err.message
          : err instanceof ApiError
            ? err.message
            : 'Something went wrong. Please try again.',
      );
      setSubmitting(false);
    }
  }

  function backToCredentials() {
    setTwoFactor(false);
    setCode('');
    setPassword('');
    setError(null);
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
          {twoFactor ? 'Two-Step Verification' : 'Secure Portal Authentication'}
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Laboratory Reporting System</h1>
        <p className="muted text-sm" style={{ marginBottom: 20 }}>
          {twoFactor
            ? 'Enter the 6-digit code from your authenticator app, or a recovery code.'
            : 'Sign in with the credentials provided by the Bureau administrator.'}
        </p>

        {error && (
          <div style={{ marginBottom: 16 }}>
            <Callout tone="danger" title={twoFactor ? 'Verification failed' : 'Sign in failed'}>
              {error}
            </Callout>
          </div>
        )}

        {!twoFactor ? (
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

            <Field label="Password" htmlFor="password">
              <div className="input-group">
                <Lock className="input-group__icon" size={16} />
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </Field>

            <Button type="submit" block disabled={submitting}>
              {submitting ? 'Signing in…' : 'Authenticate and Access Portal'}
              {!submitting && <ArrowRight size={16} />}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <Field label="Authentication code" htmlFor="code">
              <div className="input-group">
                <KeyRound className="input-group__icon" size={16} />
                <input
                  id="code"
                  className="input"
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                />
              </div>
            </Field>

            <Button type="submit" block disabled={submitting}>
              {submitting ? 'Verifying…' : 'Verify and Continue'}
              {!submitting && <ArrowRight size={16} />}
            </Button>
          </form>
        )}

        <p className="auth-aside">
          {twoFactor ? (
            <button type="button" className="auth-link" onClick={backToCredentials}>
              ← Use a different account
            </button>
          ) : (
            <>
              Can&rsquo;t sign in?{' '}
              <Link href="/forgot-password" className="auth-link">
                Reset your password
              </Link>
            </>
          )}
        </p>

        <hr className="auth-divider" />

        <div className="auth-footer">
          <p className="auth-footer__notice">
            <ShieldCheck size={13} aria-hidden />
            <span>
              Authorized personnel only. This system contains confidential laboratory
              data and all access is logged.
            </span>
          </p>
          <p className="auth-footer__meta">
            © {new Date().getFullYear()} Oromia Regional Health Bureau · v{APP_VERSION}
          </p>
        </div>
      </Card>
    </div>
  );
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0';
