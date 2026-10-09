'use client';

import { useEffect, useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { RoleName } from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import type { Laboratory, User } from '@/lib/types';
import { Button, Callout, Card, Field, Pill, Spinner } from '@/components/ui';

const ROLE_LABEL: Record<RoleName, string> = {
  [RoleName.BUREAU_ADMIN]: 'Bureau Administrator',
  [RoleName.REGIONAL_LAB_HEAD]: 'Regional Lab Head',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [labs, setLabs] = useState<Laboratory[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [u, l] = await Promise.all([
      api.get<User[]>('/users'),
      api.get<Laboratory[]>('/labs'),
    ]);
    setUsers(u);
    setLabs(l);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error && !users) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!users)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  const activeLabs = labs.filter((l) => l.isActive);

  return (
    <>
      <div className="page-head">
        <div className="micro-label">Administration</div>
        <h1>Users</h1>
        <p>Create Bureau Administrators and Regional Lab Heads. New users receive a temporary password and must set their own at first sign-in.</p>
      </div>

      <div className="split" style={{ marginTop: 18 }}>
        <NewUserCard labs={activeLabs} onCreated={load} />

        <Card title="People">
          {users.length === 0 ? (
            <div className="table__empty">No users yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Laboratory</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow key={u.id} user={u} onChanged={load} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

function UserRow({ user, onChanged }: { user: User; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/users/${user.id}`, { isActive: !user.isActive });
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function resetTwoFactor() {
    if (
      !window.confirm(
        `Reset two-step verification for ${user.fullName}? They will sign in with their password alone until they re-enroll.`,
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post(`/users/${user.id}/reset-2fa`);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{user.fullName}</div>
        <div className="text-sm muted">{user.email}</div>
      </td>
      <td className="text-sm">{ROLE_LABEL[user.role.name]}</td>
      <td className="text-sm muted">{user.laboratory?.name ?? '—'}</td>
      <td>
        <div className="toolbar" style={{ gap: 6 }}>
          <Pill tone={user.isActive ? 'green' : 'slate'}>{user.isActive ? 'Active' : 'Disabled'}</Pill>
          {user.twoFactorEnabled && (
            <span className="pill pill--slate" title="Two-step verification enabled">
              <ShieldCheck size={12} /> 2FA
            </span>
          )}
        </div>
        {error && <div className="field__error">{error}</div>}
      </td>
      <td style={{ textAlign: 'right' }}>
        <div className="toolbar" style={{ justifyContent: 'flex-end', gap: 4 }}>
          {user.twoFactorEnabled && (
            <Button variant="ghost" size="sm" onClick={resetTwoFactor} disabled={busy}>
              Reset 2FA
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={toggleActive} disabled={busy}>
            {user.isActive ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function NewUserCard({
  labs,
  onCreated,
}: {
  labs: Laboratory[];
  onCreated: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleName>(RoleName.REGIONAL_LAB_HEAD);
  const [laboratoryId, setLaboratoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsLab = role === RoleName.REGIONAL_LAB_HEAD;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsLab && !laboratoryId) {
      setError('Select a laboratory for the Regional Lab Head.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/users', {
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        role,
        ...(needsLab ? { laboratoryId } : {}),
      });
      setFullName('');
      setEmail('');
      setPassword('');
      setLaboratoryId('');
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Add a user">
      <form onSubmit={submit}>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Callout tone="danger">{error}</Callout>
          </div>
        )}
        <Field label="Full name">
          <input
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            minLength={2}
            maxLength={150}
            required
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="name@ohb.local"
          />
        </Field>
        <Field label="Role">
          <select
            className="select"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as RoleName);
              setLaboratoryId('');
            }}
          >
            {Object.values(RoleName).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        {needsLab && (
          <Field
            label="Laboratory"
            hint={labs.length === 0 ? 'No active laboratories — add one under Labs first.' : undefined}
          >
            <select
              className="select"
              value={laboratoryId}
              onChange={(e) => setLaboratoryId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select a laboratory…
              </option>
              {labs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Temporary password" hint="At least 8 characters. The user must change it at first sign-in.">
          <input
            className="input"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            maxLength={100}
            required
            autoComplete="off"
          />
        </Field>
        <Button type="submit" disabled={busy || (needsLab && labs.length === 0)}>
          <Plus size={16} /> Add user
        </Button>
      </form>
    </Card>
  );
}
