'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, Lock, Activity, ArrowRight } from 'lucide-react';
import { useAuth, landingFor } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Button, Callout, Card, Field } from '@/components/ui';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(landingFor(user));
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const me = await login(email.trim(), password);
      router.replace(landingFor(me));
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

  return (
    <div className="auth-wrap">
      <Card className="auth-card">
        <div className="brand">
          <span className="brand__mark">
            <Activity size={24} />
          </span>
          <span className="brand__text">
            <span className="brand__en">Oromia Health Bureau</span><br></br>
            <span className="brand__om">Biiroo Eegumsa Fayyaa Oromiyaa</span>
          </span>
        </div>

        <div className="micro-label" style={{ marginBottom: 6 }}>
          Secure Sign In
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Laboratory Reporting System</h1>
        <p className="muted text-sm" style={{ marginBottom: 20 }}>
          Sign in with the credentials provided by the Bureau administrator.
        </p>

        {error && (
          <div style={{ marginBottom: 16 }}>
            <Callout tone="danger" title="Sign in failed">
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
      </Card>
    </div>
  );
}
