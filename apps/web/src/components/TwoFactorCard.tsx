'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { TwoFactorSetup, TwoFactorStatus } from '@/lib/types';
import { Button, Callout, Card, Field, Spinner } from '@/components/ui';

type Mode = 'idle' | 'enrolling' | 'disabling' | 'regenerating';

/**
 * Self-service two-step verification, available to every role. Walks the user
 * through QR enrollment, shows one-time recovery codes, and lets them disable
 * 2FA or regenerate codes. The backend is authoritative for every step.
 */
export function TwoFactorCard({ refresh }: { refresh: () => Promise<void> }) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadStatus() {
    const s = await api.get<TwoFactorStatus>('/auth/2fa/status');
    setStatus(s);
  }

  useEffect(() => {
    loadStatus().catch(() => setError('Could not load your security settings.'));
  }, []);

  function reset() {
    setMode('idle');
    setSetup(null);
    setError(null);
    setNotice(null);
  }

  async function beginSetup() {
    setError(null);
    setNotice(null);
    setRecoveryCodes(null);
    setBusy(true);
    try {
      const info = await api.post<TwoFactorSetup>('/auth/2fa/setup');
      setSetup(info);
      setMode('enrolling');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start setup.');
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <Card title="Two-step verification">
        <div style={{ padding: '12px 0' }}>
          <Spinner />
        </div>
      </Card>
    );
  }

  // One-time recovery-code display takes over the card until acknowledged.
  if (recoveryCodes) {
    return (
      <Card title="Save your recovery codes">
        <RecoveryCodes codes={recoveryCodes} />
        <Button
          style={{ marginTop: 14 }}
          onClick={async () => {
            setRecoveryCodes(null);
            reset();
            await loadStatus();
            await refresh();
          }}
        >
          I&rsquo;ve saved these codes
        </Button>
      </Card>
    );
  }

  return (
    <Card title="Two-step verification" desc="Add a time-based code from an authenticator app as a second factor when you sign in.">
      <div className="toolbar" style={{ alignItems: 'center', marginTop: 4 }}>
        {status.enabled ? (
          <span className="pill pill--green">
            <ShieldCheck size={13} /> Enabled
          </span>
        ) : (
          <span className="pill pill--slate">
            <ShieldOff size={13} /> Not enabled
          </span>
        )}
        {status.enabled && (
          <span className="muted text-sm">
            {status.recoveryCodesRemaining} recovery code
            {status.recoveryCodesRemaining === 1 ? '' : 's'} remaining
          </span>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 12 }}>
          <Callout tone="danger" title="Something went wrong">
            {error}
          </Callout>
        </div>
      )}
      {notice && (
        <div style={{ marginTop: 12 }}>
          <Callout tone="success" title="Done">
            {notice}
          </Callout>
        </div>
      )}

      {/* Not enabled: offer setup, or show the active enrollment flow. */}
      {!status.enabled && mode !== 'enrolling' && (
        <div style={{ marginTop: 16 }}>
          <Button onClick={beginSetup} disabled={busy}>
            <KeyRound size={16} /> {busy ? 'Starting…' : 'Set up two-step verification'}
          </Button>
        </div>
      )}

      {!status.enabled && mode === 'enrolling' && setup && (
        <EnrollForm
          setup={setup}
          onCancel={reset}
          onEnabled={(codes) => {
            setRecoveryCodes(codes);
          }}
          setError={setError}
        />
      )}

      {/* Enabled: manage (disable / regenerate codes). */}
      {status.enabled && (
        <div className="stack" style={{ gap: 12, marginTop: 16 }}>
          <div className="toolbar">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                reset();
                setMode('regenerating');
              }}
            >
              Regenerate recovery codes
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                reset();
                setMode('disabling');
              }}
            >
              <ShieldOff size={15} /> Disable
            </Button>
          </div>

          {mode === 'regenerating' && (
            <CodePrompt
              label="Enter a current authenticator code to generate a new set"
              confirmLabel="Regenerate codes"
              onCancel={reset}
              onSubmit={async (code) => {
                const res = await api.post<{ recoveryCodes: string[] }>(
                  '/auth/2fa/recovery-codes',
                  { code },
                );
                setRecoveryCodes(res.recoveryCodes);
              }}
            />
          )}

          {mode === 'disabling' && (
            <DisableForm
              onCancel={reset}
              onDone={async () => {
                reset();
                setNotice('Two-step verification has been turned off.');
                await loadStatus();
                await refresh();
              }}
            />
          )}
        </div>
      )}
    </Card>
  );
}

/** QR + manual-entry + confirmation code, shown while enrolling. */
function EnrollForm({
  setup,
  onCancel,
  onEnabled,
  setError,
}: {
  setup: TwoFactorSetup;
  onCancel: () => void;
  onEnabled: (codes: string[]) => void;
  setError: (msg: string | null) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ recoveryCodes: string[] }>('/auth/2fa/enable', {
        code: code.trim(),
      });
      onEnabled(res.recoveryCodes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not confirm the code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <ol className="two-factor-steps">
        <li>
          Scan this QR code with an authenticator app (Google Authenticator, Microsoft
          Authenticator, Authy, 1Password…).
        </li>
      </ol>
      <div className="two-factor-qr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qrDataUrl} alt="Two-step verification QR code" width={192} height={192} />
      </div>
      <p className="muted text-sm" style={{ marginTop: 8 }}>
        Can&rsquo;t scan? Enter this key manually:
      </p>
      <code className="two-factor-secret">{setup.secret}</code>

      <form onSubmit={confirm} style={{ marginTop: 14 }}>
        <Field label="Enter the 6-digit code from the app" htmlFor="enroll-code">
          <input
            id="enroll-code"
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
        </Field>
        <div className="toolbar">
          <Button type="submit" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify and enable'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Password + current code, required to turn 2FA off. */
function DisableForm({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/2fa/disable', { password, code: code.trim() });
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not disable two-step verification.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="two-factor-inset">
      {error && (
        <div style={{ marginBottom: 10 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
      <Field label="Current password" htmlFor="disable-pw">
        <input
          id="disable-pw"
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      <Field label="Authenticator or recovery code" htmlFor="disable-code">
        <input
          id="disable-code"
          className="input"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
        />
      </Field>
      <div className="toolbar">
        <Button type="submit" variant="danger" disabled={busy}>
          {busy ? 'Disabling…' : 'Turn off two-step verification'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A single current-code prompt (used when regenerating recovery codes). */
function CodePrompt({
  label,
  confirmLabel,
  onCancel,
  onSubmit,
}: {
  label: string;
  confirmLabel: string;
  onCancel: () => void;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(code.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="two-factor-inset">
      {error && (
        <div style={{ marginBottom: 10 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
      <Field label={label} htmlFor="prompt-code">
        <input
          id="prompt-code"
          className="input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
        />
      </Field>
      <div className="toolbar">
        <Button type="submit" disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Renders the one-time recovery codes with copy-to-clipboard. */
function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <>
      <Callout tone="danger" title="Store these somewhere safe">
        Each code can be used once if you lose access to your authenticator. They
        won&rsquo;t be shown again.
      </Callout>
      <div className="two-factor-codes">
        {codes.map((c) => (
          <code key={c}>{c}</code>
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={copy} style={{ marginTop: 10 }}>
        <Copy size={15} /> {copied ? 'Copied' : 'Copy all'}
      </Button>
    </>
  );
}
