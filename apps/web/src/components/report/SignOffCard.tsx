'use client';

/**
 * Digital sign-off record (Phase 27). Shows the accountable, immutable approval
 * signature(s) recorded when a reviewer completed the review: who signed, when,
 * the version they signed and any note. Read-only on both the admin and lab
 * detail pages — the records themselves are append-only server-side.
 */

import { ShieldCheck } from 'lucide-react';
import type { SignOff } from '@/lib/types';
import { Card, Pill } from '@/components/ui';

export function SignOffCard({ signOffs }: { signOffs: SignOff[] }) {
  if (!signOffs || signOffs.length === 0) return null;
  return (
    <Card title="Digital sign-off" desc="The accountable approval record for this report.">
      <div className="stack" style={{ gap: 12 }}>
        {signOffs.map((s) => (
          <div
            key={s.id}
            className="builder-section"
            style={{ margin: 0, background: 'var(--surface-muted)' }}
          >
            <div className="toolbar" style={{ marginBottom: 6 }}>
              <Pill tone="green">
                <ShieldCheck size={12} /> Approved &amp; signed
              </Pill>
              <span className="timeline__tag">v{s.versionNumber}</span>
              <span className="spacer" />
              <time className="text-sm muted" dateTime={s.createdAt}>
                {new Date(s.createdAt).toLocaleString()}
              </time>
            </div>
            <div className="text-sm">
              Signed off by <strong>{s.signedBy?.fullName ?? s.confirmedName}</strong>
              {s.definitionVersion ? ` · definition v${s.definitionVersion.version}` : ''}
            </div>
            {s.note && <div className="timeline__message" style={{ marginTop: 6 }}>{s.note}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}
