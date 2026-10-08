'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Lock, Mail, Trash2 } from 'lucide-react';
import { RoleName } from '@ohb/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type { AuthUser } from '@/lib/types';
import { Avatar, Button, Callout, Card, Field, Spinner } from '@/components/ui';

const ROLE_LABEL: Record<RoleName, string> = {
  [RoleName.BUREAU_ADMIN]: 'Bureau Administrator',
  [RoleName.REGIONAL_LAB_HEAD]: 'Regional Lab Head',
};

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

export default function ProfilePage() {
  const { user, loading, refresh } = useAuth();

  if (loading || !user) {
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div className="micro-label">Account</div>
        <h1>Your profile</h1>
        <p>Manage your display name, profile picture and sign-in password.</p>
      </div>

      <div className="profile-grid">
        <div className="stack" style={{ gap: 18 }}>
          <IdentityCard user={user} refresh={refresh} />
          <NameCard user={user} refresh={refresh} />
        </div>
        <PasswordCard />
      </div>
    </>
  );
}

/** Avatar + read-only identity (email, role), with upload/remove controls. */
function IdentityCard({
  user,
  refresh,
}: {
  user: AuthUser;
  refresh: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setError(null);
    setNotice(null);

    if (!ACCEPTED.includes(file.type)) {
      setError('Please choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That image is larger than 2 MB. Please choose a smaller one.');
      return;
    }

    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      await api.upload('/auth/profile/avatar', form);
      await refresh();
      setNotice('Profile picture updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the image.');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api.del('/auth/profile/avatar');
      await refresh();
      setNotice('Profile picture removed.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the image.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="profile-identity">
        <Avatar name={user.fullName} src={user.avatarUrl} size={96} />
        <div className="profile-identity__meta">
          <h2 className="card__title" style={{ marginBottom: 2 }}>
            {user.fullName}
          </h2>
          <div className="profile-identity__row">
            <Mail size={14} />
            <span>{user.email}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <span className="pill pill--slate">
              <span className="pill__dot" />
              {ROLE_LABEL[user.role]}
            </span>
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED.join(',')}
        onChange={onPick}
        hidden
      />
      <div className="toolbar" style={{ marginTop: 16 }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Camera size={15} />
          {user.avatarUrl ? 'Change picture' : 'Upload picture'}
        </Button>
        {user.avatarUrl && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
            <Trash2 size={15} />
            Remove
          </Button>
        )}
      </div>
      <p className="muted text-sm" style={{ marginTop: 10 }}>
        JPEG, PNG or WebP, up to 2&nbsp;MB. Your email and role are managed by the
        Bureau administrator.
      </p>

      {error && (
        <div style={{ marginTop: 12 }}>
          <Callout tone="danger" title="Something went wrong">
            {error}
          </Callout>
        </div>
      )}
      {notice && (
        <div style={{ marginTop: 12 }}>
          <Callout title="Saved">{notice}</Callout>
        </div>
      )}
    </Card>
  );
}

/** Edit the display name. */
function NameCard({
  user,
  refresh,
}: {
  user: AuthUser;
  refresh: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Keep the field in sync if the user is refreshed elsewhere.
  useEffect(() => setFullName(user.fullName), [user.fullName]);

  const dirty = fullName.trim() !== user.fullName && fullName.trim().length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.patch('/auth/profile', { fullName: fullName.trim() });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your name.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Display name" desc="The name shown across the system and on your reports.">
      <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
        <Field label="Full name" htmlFor="fullName">
          <input
            id="fullName"
            className="input"
            value={fullName}
            maxLength={120}
            required
            onChange={(e) => {
              setFullName(e.target.value);
              setSaved(false);
            }}
          />
        </Field>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Callout tone="danger" title="Could not save">
              {error}
            </Callout>
          </div>
        )}
        <Button type="submit" disabled={busy || !dirty}>
          {saved && !dirty ? <Check size={16} /> : null}
          {busy ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save name'}
        </Button>
      </form>
    </Card>
  );
}

/** Change the sign-in password (reuses the self-service auth endpoint). */
function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Password" desc="Update the password you use to sign in.">
      <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
        <Field label="Current password" htmlFor="current">
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

        {error && (
          <div style={{ marginBottom: 12 }}>
            <Callout tone="danger" title="Could not change password">
              {error}
            </Callout>
          </div>
        )}
        {done && (
          <div style={{ marginBottom: 12 }}>
            <Callout title="Password changed">
              Your password has been updated.
            </Callout>
          </div>
        )}

        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    </Card>
  );
}
