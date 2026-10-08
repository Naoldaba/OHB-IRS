'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { Laboratory } from '@/lib/types';
import { Button, Callout, Card, Field, Pill, Spinner } from '@/components/ui';

export default function LabsPage() {
  const [labs, setLabs] = useState<Laboratory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api.get<Laboratory[]>('/labs');
    setLabs(data);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error && !labs) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!labs)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  return (
    <>
      <div className="page-head">
        <div className="micro-label">Administration</div>
        <h1>Laboratories</h1>
        <p>Register regional laboratories. Retire a lab with Deactivate — labs are never deleted, since they anchor submissions and audit history.</p>
      </div>

      <div className="split" style={{ marginTop: 18 }}>
        <NewLabCard onCreated={load} />

        <Card title="Laboratories">
          {labs.length === 0 ? (
            <div className="table__empty">No laboratories yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Users</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {labs.map((lab) => (
                  <LabRow key={lab.id} lab={lab} onChanged={load} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

function LabRow({ lab, onChanged }: { lab: Laboratory; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/labs/${lab.id}`, { isActive: !lab.isActive });
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{lab.name}</td>
      <td className="text-sm muted">{lab.code}</td>
      <td className="text-sm muted">{lab._count?.users ?? 0}</td>
      <td>
        <Pill tone={lab.isActive ? 'green' : 'slate'}>{lab.isActive ? 'Active' : 'Retired'}</Pill>
        {error && <div className="field__error">{error}</div>}
      </td>
      <td style={{ textAlign: 'right' }}>
        <Button variant="ghost" size="sm" onClick={toggleActive} disabled={busy}>
          {lab.isActive ? 'Deactivate' : 'Reactivate'}
        </Button>
      </td>
    </tr>
  );
}

function NewLabCard({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/labs', {
        name: name.trim(),
        ...(code.trim() ? { code: code.trim().toUpperCase() } : {}),
      });
      setName('');
      setCode('');
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create laboratory');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Add a laboratory">
      <form onSubmit={submit}>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Callout tone="danger">{error}</Callout>
          </div>
        )}
        <Field label="Name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Code" hint="Optional — derived from the name (uppercase, underscores) when left blank.">
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={50}
            placeholder="e.g. ADAMA"
          />
        </Field>
        <Button type="submit" disabled={busy || name.trim().length < 2}>
          <Plus size={16} /> Add laboratory
        </Button>
      </form>
    </Card>
  );
}
