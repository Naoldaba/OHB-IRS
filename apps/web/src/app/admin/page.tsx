'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, BarChart3, CalendarRange, Inbox, ArrowRight } from 'lucide-react';
import { ReportStatus } from '@ohb/shared';
import { api } from '@/lib/api';
import type { ReportType, SubmissionSummary } from '@/lib/types';
import { Card, Spinner } from '@/components/ui';

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

  const pending = (submissions ?? []).filter(
    (s) =>
      s.status === ReportStatus.SUBMITTED ||
      s.status === ReportStatus.RESUBMITTED ||
      s.status === ReportStatus.UNDER_REVIEW,
  ).length;
  const approved = (submissions ?? []).filter((s) => s.status === ReportStatus.APPROVED).length;

  return (
    <>
      <div className="page-head">
        <div className="micro-label">Bureau Overview</div>
        <h1>Reporting at a glance</h1>
        <p>
          Author report structures, open reporting periods, and review laboratory
          submissions.
        </p>
      </div>

      {loading ? (
        <div className="loading-screen">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid--3" style={{ marginBottom: 18 }}>
            <StatCard label="Report types" value={reportTypes!.length} />
            <StatCard label="Awaiting / in review" value={pending} />
            <StatCard label="Approved" value={approved} />
          </div>

          <div className="grid grid--2">
            <ActionCard
              href="/admin/report-types"
              icon={<FileText size={20} />}
              title="Reports & builder"
              desc="Create report types and author their field structure through the builder, then publish."
            />
            <ActionCard
              href="/admin/periods"
              icon={<CalendarRange size={20} />}
              title="Reporting periods"
              desc="Open the Ethiopian-calendar periods labs report against."
            />
            <ActionCard
              href="/admin/submissions"
              icon={<Inbox size={20} />}
              title="Submissions & review"
              desc="Review submitted reports, give feedback, request revisions, and approve."
            />
            <ActionCard
              href="/admin/analytics"
              icon={<BarChart3 size={20} />}
              title="Compliance dashboard"
              desc="Track expected-vs-submitted, overdue reports, lab comparison and reporting trends."
            />
          </div>
        </>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="micro-label">{label}</div>
      <div style={{ fontSize: 34, fontWeight: 700, color: 'var(--primary)', marginTop: 6 }}>
        {value}
      </div>
    </div>
  );
}

function ActionCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card className="action-card">
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <span className="action-card__icon">{icon}</span>
          <ArrowRight size={16} className="spacer" style={{ color: 'var(--text-faint)' }} />
        </div>
        <h2 className="card__title" style={{ fontSize: 17 }}>
          {title}
        </h2>
        <div className="card__desc" style={{ marginBottom: 0 }}>
          {desc}
        </div>
      </Card>
    </Link>
  );
}
