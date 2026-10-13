'use client';

import { useEffect, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
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
        <p>Register regional laboratories. Retire a lab with Deactivate — labs are never deleted, since they anchor submissions and audit history. Set a lab&apos;s coordinates to plot it on the compliance map.</p>
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
                  <th>Coordinates</th>
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

/** Formats a coordinate pair for display, or a muted placeholder when unset. */
function coordLabel(lab: Laboratory): string | null {
  if (lab.latitude == null || lab.longitude == null) return null;
  return `${lab.latitude.toFixed(3)}, ${lab.longitude.toFixed(3)}`;
}

function LabRow({ lab, onChanged }: { lab: Laboratory; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [lat, setLat] = useState(lab.latitude != null ? String(lab.latitude) : '');
  const [lng, setLng] = useState(lab.longitude != null ? String(lab.longitude) : '');

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

  async function saveCoords() {
    setError(null);
    const latTrim = lat.trim();
    const lngTrim = lng.trim();
    // Both-or-neither; blank both clears the position.
    if ((latTrim === '') !== (lngTrim === '')) {
      setError('Enter both latitude and longitude, or clear both.');
      return;
    }
    const payload =
      latTrim === ''
        ? { latitude: null, longitude: null }
        : { latitude: Number(latTrim), longitude: Number(lngTrim) };
    if (payload.latitude != null && (Number.isNaN(payload.latitude) || Number.isNaN(payload.longitude))) {
      setError('Latitude and longitude must be numbers.');
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/labs/${lab.id}`, payload);
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  const coords = coordLabel(lab);

  return (
    <>
      <tr>
        <td style={{ fontWeight: 600 }}>{lab.name}</td>
        <td className="text-sm muted">{lab.code}</td>
        <td className="text-sm muted">
          {coords ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={13} /> {coords}
            </span>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        <td className="text-sm muted">{lab._count?.users ?? 0}</td>
        <td>
          <Pill tone={lab.isActive ? 'green' : 'slate'}>{lab.isActive ? 'Active' : 'Retired'}</Pill>
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setError(null);
              setEditing((v) => !v);
            }}
          >
            {editing ? 'Close' : coords ? 'Edit location' : 'Set location'}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleActive} disabled={busy}>
            {lab.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--surface-muted)' }}>
            <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="Latitude" hint="−90 to 90">
                <input
                  className="input"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="e.g. 8.54"
                  inputMode="decimal"
                  style={{ width: 150 }}
                />
              </Field>
              <Field label="Longitude" hint="−180 to 180">
                <input
                  className="input"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="e.g. 39.27"
                  inputMode="decimal"
                  style={{ width: 150 }}
                />
              </Field>
              <Button onClick={saveCoords} disabled={busy}>
                Save location
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setLat('');
                  setLng('');
                }}
                disabled={busy}
              >
                Clear
              </Button>
            </div>
            {error && <div className="field__error" style={{ marginTop: 8 }}>{error}</div>}
          </td>
        </tr>
      )}
      {error && !editing && (
        <tr>
          <td colSpan={6}>
            <div className="field__error">{error}</div>
          </td>
        </tr>
      )}
    </>
  );
}

function NewLabCard({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const latTrim = lat.trim();
    const lngTrim = lng.trim();
    if ((latTrim === '') !== (lngTrim === '')) {
      setError('Enter both latitude and longitude, or leave both blank.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/labs', {
        name: name.trim(),
        ...(code.trim() ? { code: code.trim().toUpperCase() } : {}),
        ...(latTrim !== '' ? { latitude: Number(latTrim), longitude: Number(lngTrim) } : {}),
      });
      setName('');
      setCode('');
      setLat('');
      setLng('');
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
        <div className="toolbar" style={{ gap: 10 }}>
          <Field label="Latitude" hint="Optional — for the map">
            <input
              className="input"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="e.g. 8.54"
              inputMode="decimal"
            />
          </Field>
          <Field label="Longitude" hint="Optional — for the map">
            <input
              className="input"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="e.g. 39.27"
              inputMode="decimal"
            />
          </Field>
        </div>
        <Button type="submit" disabled={busy || name.trim().length < 2}>
          <Plus size={16} /> Add laboratory
        </Button>
      </form>
    </Card>
  );
}
