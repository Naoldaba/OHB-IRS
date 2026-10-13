'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  BarChart3,
  CalendarRange,
  Inbox,
  ScrollText,
  ClipboardList,
  ArrowRight,
  Plus,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { ReportStatus } from '@ohb/shared';
import { api } from '@/lib/api';
import type { ReportType, SubmissionSummary } from '@/lib/types';
import { Card, Spinner, Button, Pill } from '@/components/ui';

export default function AdminOverview() {
  const [reportTypes, setReportTypes] = useState<ReportType[] | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionSummary[] | null>(null);

  useEffect(() => {
    void api.get<ReportType[]>('/report-types').then(setReportTypes).catch(() => setReportTypes([]));
    void api
      .get<SubmissionSummary[]>('/submissions')
      .then(setSubmissions)
      .catch(() => setSubmissions([]));
  }, []);

  const loading = reportTypes === null || submissions === null;

  const types = reportTypes ?? [];
  const subs = submissions ?? [];
  const activeTypes = types.filter((t) => t.isActive).length;
  const pending = subs.filter(
    (s) =>
      s.status === ReportStatus.SUBMITTED ||
      s.status === ReportStatus.RESUBMITTED ||
      s.status === ReportStatus.UNDER_REVIEW,
  ).length;
  const approved = subs.filter((s) => s.status === ReportStatus.APPROVED).length;

  return (
    <>
      <div className="page-head">
        <div className="page-head__row">
          <div>
            <div className="micro-label">Bureau Overview · Health Informatics &amp; Laboratory Division</div>
            <h1>Reporting at a glance</h1>
            <p>
              Author report structures, open reporting periods, and review
              laboratory submissions across all zones and woredas.
            </p>
          </div>
          <div className="ov-hero-actions">
            <QuickActions />
            <Link href="/admin/report-types" style={{ textDecoration: 'none' }}>
              <Button variant="primary">
                <Plus size={16} /> Create new report
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid--3">
            <StatCard
              label="Report types"
              badge={
                activeTypes > 0 ? (
                  <Pill tone="green">Active &amp; defined</Pill>
                ) : (
                  <Pill tone="slate">None active</Pill>
                )
              }
              value={types.length}
              unit="configured schemas"
              footLabel="Active schemas"
              footValue={`${activeTypes} of ${types.length}`}
            />
            <StatCard
              label="Awaiting / in review"
              badge={
                pending > 0 ? (
                  <Pill tone="amber">Needs review</Pill>
                ) : (
                  <Pill tone="green">Queue clear</Pill>
                )
              }
              value={pending}
              unit="pending laboratory submissions"
              footLabel="Verification"
              footValue={pending > 0 ? `${pending} awaiting` : 'All processed'}
            />
            <StatCard
              label="Approved"
              badge={<Pill tone="slate">Current cycle</Pill>}
              value={approved}
              unit="approved reports this window"
              footLabel="Total submissions"
              footValue={`${subs.length}`}
            />
          </div>

          <div className="ov-section-head">
            <div className="micro-label">Core Operations &amp; Management</div>
            <div className="ov-section-hint">Select a module to manage the registry</div>
          </div>

          <div className="grid grid--2">
            <ActionCard
              href="/admin/report-types"
              icon={<FileText size={20} />}
              title="Reports & builder"
              badge={<Pill tone="slate">{`${types.length} types`}</Pill>}
              desc="Create report types and author their field structure through the builder, then publish."
              footLabel="Report registry"
              cta="Launch builder"
            />
            <ActionCard
              href="/admin/periods"
              icon={<CalendarRange size={20} />}
              title="Reporting periods"
              desc="Open the Ethiopian-calendar periods laboratories report against."
              footLabel="Reporting calendar"
              cta="Manage periods"
            />
            <ActionCard
              href="/admin/requirements"
              icon={<ClipboardList size={20} />}
              title="Reporting requirements"
              desc="Set which laboratories are expected to submit each report — the basis for compliance tracking."
              footLabel="Institutional targets"
              cta="Define mandates"
            />
            <ActionCard
              href="/admin/submissions"
              icon={<Inbox size={20} />}
              title="Submissions & review"
              badge={
                pending > 0 ? (
                  <Pill tone="amber">{`${pending} in queue`}</Pill>
                ) : (
                  <Pill tone="green">Queue clear</Pill>
                )
              }
              desc="Review submitted reports, give feedback, request revisions, and approve."
              footLabel="Workflow approval engine"
              cta="Open review desk"
            />
            <ActionCard
              href="/admin/analytics"
              icon={<BarChart3 size={20} />}
              title="Compliance dashboard"
              desc="Track expected-vs-submitted, overdue reports, lab comparison and reporting trends."
              footLabel="Zonal laboratory analytics"
              cta="View analytics"
            />
            <ActionCard
              href="/admin/audit"
              icon={<ScrollText size={20} />}
              title="Audit trail"
              badge={<Pill tone="slate">Immutable ledger</Pill>}
              desc="Review the immutable record of security-sensitive and reporting-workflow actions."
              footLabel="Tamper-evident event logs"
              cta="Inspect audit log"
            />
          </div>
        </>
      )}
    </>
  );
}

/** Hero dropdown that jumps to the most common admin destinations. */
function QuickActions() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = [
    { href: '/admin/report-types', label: 'New report type', Icon: FileText },
    { href: '/admin/submissions', label: 'Open review desk', Icon: Inbox },
    { href: '/admin/periods', label: 'Manage periods', Icon: CalendarRange },
    { href: '/admin/analytics', label: 'View compliance', Icon: BarChart3 },
  ];

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn--secondary"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Sparkles size={16} /> Quick actions <ChevronDown size={15} />
      </button>
      {open && (
        <div className="export-menu__panel" role="menu">
          {items.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              className="export-menu__item"
              onClick={() => setOpen(false)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  badge,
  value,
  unit,
  footLabel,
  footValue,
}: {
  label: string;
  badge?: React.ReactNode;
  value: number;
  unit: string;
  footLabel: string;
  footValue: string;
}) {
  return (
    <div className="card ov-stat">
      <div className="ov-stat__head">
        <div className="micro-label">{label}</div>
        {badge}
      </div>
      <div className="ov-stat__value">
        <span className="ov-stat__num">{value}</span>
        <span className="ov-stat__unit">{unit}</span>
      </div>
      <div className="ov-stat__foot">
        <span className="ov-stat__foot-label">{footLabel}</span>
        <span className="ov-stat__foot-val">{footValue}</span>
      </div>
    </div>
  );
}

function ActionCard({
  href,
  icon,
  title,
  badge,
  desc,
  footLabel,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  desc: string;
  footLabel: string;
  cta: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card className="action-card">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <span className="action-card__icon">{icon}</span>
          <ArrowRight size={16} className="spacer action-card__arrow" />
        </div>
        <div className="action-card__titlerow">
          <h2 className="card__title" style={{ fontSize: 17, marginBottom: 0 }}>
            {title}
          </h2>
          {badge}
        </div>
        <div className="card__desc" style={{ marginTop: 6, marginBottom: 0 }}>
          {desc}
        </div>
        <div className="action-card__foot">
          <span className="action-card__foot-label">{footLabel}</span>
          <span className="action-card__cta">
            {cta} <ArrowRight size={14} />
          </span>
        </div>
      </Card>
    </Link>
  );
}
