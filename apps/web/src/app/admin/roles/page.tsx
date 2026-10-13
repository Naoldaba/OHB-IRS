'use client';

/**
 * Role & permission administration (Phase 26; editable grants 28a; scope axis +
 * custom roles 28b). Roles are data: an admin can create custom roles (each with
 * a data-boundary scope), edit each role's capability grants in the matrix, and
 * assign users to any role. Capability keys are code-defined — editing a cell
 * toggles the DB-backed grant the API enforces; the server authorizes every call
 * and rejects anything it can't enforce or that would lock administration out.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import {
  NON_REVOCABLE_CAPABILITIES,
  RoleScope,
  type PermissionMatrix,
  type RoleMember,
  type RoleSummary,
} from '@ohb/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Laboratory } from '@/lib/types';
import {
  Button,
  Callout,
  Card,
  Field,
  Pill,
  SegmentedToggle,
  Select,
  Spinner,
} from '@/components/ui';

function scopeLabel(scope: RoleScope | string): string {
  return scope === RoleScope.BUREAU ? 'Bureau (all labs)' : 'Lab (own lab)';
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [r, m] = await Promise.all([
      api.get<RoleSummary[]>('/roles'),
      api.get<PermissionMatrix>('/roles/permissions'),
    ]);
    setRoles(r);
    setMatrix(m);
  }, []);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [reload]);

  if (error && !roles) return <Callout tone="danger" title="Could not load">{error}</Callout>;
  if (!roles || !matrix)
    return (
      <div className="loading-screen">
        <Spinner />
      </div>
    );

  return (
    <>
      <div className="page-head">
        <div className="micro-label">Administration</div>
        <h1>Roles &amp; permissions</h1>
        <p>
          Create roles, set what each can do, and assign who holds them. A role&apos;s{' '}
          <strong>scope</strong> is its data boundary (bureau = all labs, lab = own lab);
          its <strong>capabilities</strong> are what it may do. The server enforces both
          and rejects a change that would leave no one able to administer the system.
        </p>
      </div>

      <div style={{ marginTop: 18 }}>
        <RolesManager roles={roles} onChanged={reload} onMatrix={setMatrix} />
      </div>

      <div style={{ marginTop: 18 }}>
        <Card title="Permission matrix">
          <EditablePermissionMatrix
            matrix={matrix}
            roles={roles}
            onSaved={async (next) => {
              setMatrix(next);
              await reload();
            }}
          />
        </Card>
      </div>

      <div style={{ marginTop: 18 }}>
        <MembersCard roles={roles} onChanged={reload} />
      </div>
    </>
  );
}

/** Role cards + the create / edit / delete controls for custom roles. */
function RolesManager({
  roles,
  onChanged,
  onMatrix,
}: {
  roles: RoleSummary[];
  onChanged: () => Promise<void>;
  onMatrix: (m: PermissionMatrix) => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Roles</h2>
        <Button size="sm" variant={creating ? 'ghost' : 'primary'} onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : (<><Plus size={15} /> New role</>)}
        </Button>
      </div>

      {creating && (
        <NewRoleForm
          onCreated={async (m) => {
            onMatrix(m);
            await onChanged();
            setCreating(false);
          }}
        />
      )}

      <div className="role-cards">
        {roles.map((r) => (
          <RoleCard key={r.name} role={r} onChanged={onChanged} onMatrix={onMatrix} />
        ))}
      </div>
    </div>
  );
}

function RoleCard({
  role,
  onChanged,
  onMatrix,
}: {
  role: RoleSummary;
  onChanged: () => Promise<void>;
  onMatrix: (m: PermissionMatrix) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete the “${role.label}” role? This cannot be undone.`)) return;
    setError(null);
    setBusy(true);
    try {
      const m = await api.del<PermissionMatrix>(`/roles/${encodeURIComponent(role.name)}`);
      onMatrix(m);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete role');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setError(null);
    setBusy(true);
    try {
      const m = await api.patch<PermissionMatrix>(`/roles/${encodeURIComponent(role.name)}`, {
        isActive: !role.isActive,
      });
      onMatrix(m);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update role');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={role.label}>
      <div className="toolbar" style={{ gap: 6, marginTop: -4, flexWrap: 'wrap' }}>
        <Pill tone={role.scope === RoleScope.BUREAU ? 'green' : 'slate'}>{scopeLabel(role.scope)}</Pill>
        <Pill tone={role.isSystem ? 'slate' : 'amber'}>{role.isSystem ? 'System' : 'Custom'}</Pill>
        {!role.isActive && <Pill tone="amber">Inactive</Pill>}
      </div>
      {role.description && (
        <p className="text-sm muted" style={{ marginTop: 8 }}>{role.description}</p>
      )}
      <div className="role-card__stats">
        <span>
          <Users size={14} /> {role.memberCount} {role.memberCount === 1 ? 'member' : 'members'}
        </span>
        <span>
          <ShieldCheck size={14} /> {role.capabilityKeys.length} capabilities
        </span>
      </div>
      {!role.isSystem && (
        <div className="toolbar" style={{ gap: 6, marginTop: 10 }}>
          <Button variant="ghost" size="sm" onClick={toggleActive} disabled={busy}>
            {role.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={busy || role.memberCount > 0}
            title={role.memberCount > 0 ? 'Reassign its members first' : undefined}
          >
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      )}
      {error && <div className="field__error" style={{ marginTop: 6 }}>{error}</div>}
    </Card>
  );
}

function NewRoleForm({ onCreated }: { onCreated: (m: PermissionMatrix) => Promise<void> }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<RoleScope>(RoleScope.LAB);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const m = await api.post<PermissionMatrix>('/roles', {
        name: name.trim(),
        scope,
        description: description.trim() || undefined,
      });
      setName('');
      setDescription('');
      setScope(RoleScope.LAB);
      await onCreated(m);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create role');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="New role">
      <form onSubmit={submit}>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Callout tone="danger">{error}</Callout>
          </div>
        )}
        <div className="split">
          <Field label="Role name">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={60}
              required
              placeholder="e.g. Bureau Reviewer"
            />
          </Field>
          <Field label="Scope" hint="The data boundary — this cannot be changed later.">
            <Select value={scope} onChange={(e) => setScope(e.target.value as RoleScope)}>
              <option value={RoleScope.BUREAU}>{scopeLabel(RoleScope.BUREAU)}</option>
              <option value={RoleScope.LAB}>{scopeLabel(RoleScope.LAB)}</option>
            </Select>
          </Field>
        </div>
        <Field label="Description" hint="Optional. Capabilities are set in the matrix below after creating.">
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
        </Field>
        <Button type="submit" disabled={busy || name.trim().length < 2}>
          <Plus size={16} /> Create role
        </Button>
      </form>
    </Card>
  );
}

/** Flat map of grants → the set of capability keys currently on for each role. */
type GrantDraft = Record<string, Set<string>>;

function draftFromMatrix(matrix: PermissionMatrix): GrantDraft {
  const draft: GrantDraft = {};
  for (const role of matrix.roles) {
    const keys = new Set<string>();
    for (const group of matrix.groups) {
      for (const cap of group.capabilities) {
        if (matrix.grants[cap.key]?.[role.name]) keys.add(cap.key);
      }
    }
    draft[role.name] = keys;
  }
  return draft;
}

function EditablePermissionMatrix({
  matrix,
  roles,
  onSaved,
}: {
  matrix: PermissionMatrix;
  roles: RoleSummary[];
  onSaved: (next: PermissionMatrix) => Promise<void>;
}) {
  const [draft, setDraft] = useState<GrantDraft>(() => draftFromMatrix(matrix));
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromMatrix(matrix));
    setError(null);
  }, [matrix]);

  const memberCount = useMemo(
    () => new Map<string, number>(roles.map((r) => [r.name, r.memberCount])),
    [roles],
  );

  // A non-revocable capability's checkbox is locked off-toggling when this role
  // is the last active holder of it (mirrors the server's anti-lockout rule).
  const isLocked = useCallback(
    (capKey: string, roleName: string): boolean => {
      if (!NON_REVOCABLE_CAPABILITIES.includes(capKey)) return false;
      if (!draft[roleName]?.has(capKey)) return false;
      const heldElsewhere = matrix.roles.some(
        (r) =>
          r.name !== roleName &&
          (memberCount.get(r.name) ?? 0) > 0 &&
          draft[r.name]?.has(capKey),
      );
      if (heldElsewhere) return false;
      return (memberCount.get(roleName) ?? 0) > 0;
    },
    [draft, matrix.roles, memberCount],
  );

  function toggle(capKey: string, roleName: string) {
    if (isLocked(capKey, roleName)) return;
    setDraft((prev) => {
      const next: GrantDraft = { ...prev, [roleName]: new Set(prev[roleName]) };
      if (next[roleName].has(capKey)) next[roleName].delete(capKey);
      else next[roleName].add(capKey);
      return next;
    });
  }

  function dirtyFor(roleName: string): { added: string[]; removed: string[] } {
    const original = new Set<string>();
    for (const group of matrix.groups)
      for (const cap of group.capabilities)
        if (matrix.grants[cap.key]?.[roleName]) original.add(cap.key);
    const current = draft[roleName] ?? new Set<string>();
    const added = [...current].filter((k) => !original.has(k));
    const removed = [...original].filter((k) => !current.has(k));
    return { added, removed };
  }

  async function save(roleName: string) {
    const { removed } = dirtyFor(roleName);
    if (
      removed.length > 0 &&
      !window.confirm(
        `Removing ${removed.length} ${removed.length === 1 ? 'capability' : 'capabilities'} will immediately revoke that access for everyone with this role. Continue?`,
      )
    ) {
      return;
    }
    setError(null);
    setSavingRole(roleName);
    try {
      const next = await api.patch<PermissionMatrix>(
        `/roles/${encodeURIComponent(roleName)}/permissions`,
        { capabilityKeys: [...(draft[roleName] ?? [])] },
      );
      await onSaved(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save permissions');
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <>
      {error && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
      <div className="table-scroll">
        <table className="table perm-matrix">
          <thead>
            <tr>
              <th>Capability</th>
              {matrix.roles.map((r) => (
                <th key={r.name} style={{ textAlign: 'center' }} title={r.description}>
                  {r.label}
                  <span className="perm-matrix__rolescope">
                    {r.scope === RoleScope.BUREAU ? 'Bureau' : 'Lab'}
                    {!r.isActive && ' · inactive'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.groups.map((group) => (
              <GroupRows
                key={group.group}
                group={group}
                roles={matrix.roles}
                draft={draft}
                isLocked={isLocked}
                onToggle={toggle}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="perm-matrix__group">
              <td />
              {matrix.roles.map((r) => {
                const { added, removed } = dirtyFor(r.name);
                const dirty = added.length > 0 || removed.length > 0;
                return (
                  <td key={r.name} style={{ textAlign: 'center' }}>
                    <Button
                      size="sm"
                      variant={dirty ? 'primary' : 'ghost'}
                      disabled={!dirty || savingRole !== null}
                      onClick={() => void save(r.name)}
                    >
                      {savingRole === r.name ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
                    </Button>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function GroupRows({
  group,
  roles,
  draft,
  isLocked,
  onToggle,
}: {
  group: PermissionMatrix['groups'][number];
  roles: PermissionMatrix['roles'];
  draft: GrantDraft;
  isLocked: (capKey: string, roleName: string) => boolean;
  onToggle: (capKey: string, roleName: string) => void;
}) {
  return (
    <>
      <tr className="perm-matrix__group">
        <td colSpan={roles.length + 1}>{group.group}</td>
      </tr>
      {group.capabilities.map((cap) => (
        <tr key={cap.key}>
          <td>
            <span style={{ fontWeight: 600 }}>{cap.label}</span>
            <span className="perm-matrix__desc">{cap.description}</span>
          </td>
          {roles.map((r) => {
            const granted = draft[r.name]?.has(cap.key) ?? false;
            const locked = isLocked(cap.key, r.name);
            return (
              <td key={r.name} style={{ textAlign: 'center' }}>
                <input
                  type="checkbox"
                  className="perm-matrix__check"
                  checked={granted}
                  disabled={locked}
                  onChange={() => onToggle(cap.key, r.name)}
                  aria-label={`${cap.label} for ${r.label}`}
                  title={locked ? 'At least one active user must keep this capability' : undefined}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function MembersCard({
  roles,
  onChanged,
}: {
  roles: RoleSummary[];
  onChanged: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string>(roles[0]?.name ?? '');
  const [members, setMembers] = useState<RoleMember[] | null>(null);
  const [labs, setLabs] = useState<Laboratory[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Keep a valid selection if roles change (e.g. a custom role was deleted).
  useEffect(() => {
    if (roles.length > 0 && !roles.some((r) => r.name === selected)) {
      setSelected(roles[0].name);
    }
  }, [roles, selected]);

  const loadMembers = useCallback(async (role: string) => {
    setMembers(null);
    const data = await api.get<RoleMember[]>(`/roles/${encodeURIComponent(role)}/members`);
    setMembers(data);
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadMembers(selected).catch((e) =>
      setError(e instanceof Error ? e.message : 'Failed to load members'),
    );
  }, [selected, loadMembers]);

  useEffect(() => {
    api
      .get<Laboratory[]>('/labs')
      .then((all) => setLabs(all.filter((l) => l.isActive)))
      .catch(() => setLabs([]));
  }, []);

  async function reload() {
    await Promise.all([loadMembers(selected), onChanged()]);
  }

  return (
    <Card title="Members">
      <p className="text-sm muted" style={{ marginTop: -4 }}>
        Assign a user to a role. Moving someone to a lab-scoped role requires choosing their
        laboratory; a bureau-scoped role clears it. You cannot change your own role.
      </p>

      <div style={{ margin: '12px 0 4px' }}>
        <SegmentedToggle
          value={selected}
          onChange={setSelected}
          options={roles.map((r) => ({ value: r.name, label: `${r.label} (${r.memberCount})` }))}
        />
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      {!members ? (
        <div style={{ padding: 20 }}>
          <Spinner />
        </div>
      ) : members.length === 0 ? (
        <div className="table__empty">No users hold this role.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Laboratory</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                currentRole={selected}
                roles={roles}
                labs={labs}
                onChanged={reload}
              />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function MemberRow({
  member,
  currentRole,
  roles,
  labs,
  onChanged,
}: {
  member: RoleMember;
  currentRole: string;
  roles: RoleSummary[];
  labs: Laboratory[];
  onChanged: () => Promise<void>;
}) {
  const { user } = useAuth();
  const isSelf = user?.id === member.id;

  const [editing, setEditing] = useState(false);
  const [targetRole, setTargetRole] = useState('');
  const [labId, setLabId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Roles a member can be moved to: any active role other than their current one.
  const options = roles.filter((r) => r.isActive && r.name !== currentRole);
  const target = roles.find((r) => r.name === targetRole);
  const needsLab = target?.scope === RoleScope.LAB;

  function begin() {
    setError(null);
    setTargetRole(options[0]?.name ?? '');
    setLabId('');
    setEditing((v) => !v);
  }

  async function assign() {
    setError(null);
    if (!targetRole) return;
    if (needsLab && !labId) {
      setError('Choose a laboratory for this lab-scoped role.');
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/roles/assignments/${member.id}`, {
        role: targetRole,
        ...(needsLab ? { laboratoryId: labId } : {}),
      });
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Assignment failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr>
        <td style={{ fontWeight: 600 }}>{member.fullName}</td>
        <td className="text-sm muted">{member.email}</td>
        <td className="text-sm muted">{member.laboratory ? member.laboratory.name : '—'}</td>
        <td>
          <Pill tone={member.isActive ? 'green' : 'slate'}>{member.isActive ? 'Active' : 'Inactive'}</Pill>
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {isSelf ? (
            <span className="text-sm muted">You</span>
          ) : (
            <Button variant="ghost" size="sm" onClick={begin} disabled={options.length === 0}>
              {editing ? 'Cancel' : 'Change role'}
            </Button>
          )}
        </td>
      </tr>
      {editing && !isSelf && (
        <tr>
          <td colSpan={5} style={{ background: 'var(--surface-muted)' }}>
            <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="New role">
                <Select
                  value={targetRole}
                  onChange={(e) => {
                    setTargetRole(e.target.value);
                    setLabId('');
                  }}
                  style={{ minWidth: 200 }}
                >
                  {options.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {needsLab && (
                <Field label="Laboratory">
                  <Select value={labId} onChange={(e) => setLabId(e.target.value)} style={{ minWidth: 200 }}>
                    <option value="">Select a laboratory…</option>
                    {labs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Button onClick={assign} disabled={busy || !targetRole}>
                Assign
              </Button>
            </div>
            {error && <div className="field__error" style={{ marginTop: 8 }}>{error}</div>}
          </td>
        </tr>
      )}
    </>
  );
}
