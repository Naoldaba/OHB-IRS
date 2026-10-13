import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  RoleScope,
  type FeedbackSearchHit,
  type ReportTypeSearchHit,
  type SearchResults,
  type SubmissionSearchHit,
} from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';
import { SearchQueryDto } from './dto';

/** Minimum query length that runs a search; shorter/blank returns nothing. */
const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const SNIPPET_MAX = 200;

/**
 * Cross-entity full-text search (Phase 25) over report types, submissions and
 * feedback, backed by Postgres FTS (STORED GENERATED tsvector columns + GIN,
 * see migration add_full_text_search). Results are **role/lab-scoped here, in
 * the service** — a lab head only ever matches its own laboratory's submissions
 * and feedback; report-type metadata is global to both roles. The frontend is
 * never the scoping point.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(user: AuthUser, dto: SearchQueryDto): Promise<SearchResults> {
    const q = (dto.q ?? '').trim();
    const limit = Math.min(dto.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const empty: SearchResults = {
      query: q,
      reportTypes: [],
      submissions: [],
      feedback: [],
      total: 0,
    };
    if (q.length < MIN_QUERY_LENGTH) return empty;

    // A lab-scoped user is pinned to its own laboratory for the lab-scoped groups;
    // a bureau-scoped user sees across all laboratories. A lab user with no lab
    // matches nothing. report-type metadata is global to both.
    const isLab = user.scope === RoleScope.LAB;
    const labId = isLab ? user.laboratoryId ?? '__none__' : null;

    const [reportTypes, submissions, feedback] = await Promise.all([
      this.searchReportTypes(q, limit),
      this.searchSubmissions(q, limit, labId),
      this.searchFeedback(q, limit, labId),
    ]);

    return {
      query: q,
      reportTypes,
      submissions,
      feedback,
      total: reportTypes.length + submissions.length + feedback.length,
    };
  }

  // ---- Groups ---------------------------------------------------------------

  /** Report types are global metadata — visible to both roles, not lab-scoped. */
  private async searchReportTypes(
    q: string,
    limit: number,
  ): Promise<ReportTypeSearchHit[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        code: string;
        description: string | null;
        rank: number;
      }[]
    >(Prisma.sql`
      SELECT rt."id", rt."name", rt."code", rt."description",
             ts_rank(rt."searchVector", qt.qq) AS rank
      FROM "ReportType" rt
      CROSS JOIN LATERAL (SELECT websearch_to_tsquery('english', ${q}) AS qq) qt
      WHERE rt."searchVector" @@ qt.qq
      ORDER BY rank DESC, rt."name" ASC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description,
      rank: Number(r.rank),
    }));
  }

  /**
   * Submissions carry no text of their own; their searchable text is their
   * report type / laboratory / period / status, built into a tsvector at query
   * time. Lab-scoped for lab heads.
   */
  private async searchSubmissions(
    q: string,
    limit: number,
    labId: string | null,
  ): Promise<SubmissionSearchHit[]> {
    const labScope = labId ? Prisma.sql`AND s."laboratoryId" = ${labId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        status: string;
        reportTypeName: string;
        reportTypeCode: string;
        laboratoryId: string;
        laboratoryName: string;
        periodLabel: string;
        updatedAt: Date;
        rank: number;
      }[]
    >(Prisma.sql`
      SELECT s."id", s."status", s."laboratoryId", s."updatedAt",
             rt."name" AS "reportTypeName", rt."code" AS "reportTypeCode",
             l."name" AS "laboratoryName",
             p."label" AS "periodLabel",
             ts_rank(v.vec, qt.qq) AS rank
      FROM "ReportSubmission" s
      JOIN "ReportType" rt ON rt."id" = s."reportTypeId"
      JOIN "Laboratory" l ON l."id" = s."laboratoryId"
      JOIN "ReportingPeriod" p ON p."id" = s."reportingPeriodId"
      CROSS JOIN LATERAL (
        SELECT
          setweight(to_tsvector('english', coalesce(rt."name", '')), 'A') ||
          setweight(to_tsvector('simple',  coalesce(rt."code", '')), 'A') ||
          setweight(to_tsvector('simple',  coalesce(l."name", '')), 'A') ||
          setweight(to_tsvector('simple',  coalesce(l."code", '')), 'B') ||
          setweight(to_tsvector('simple',  coalesce(p."label", '')), 'B') ||
          setweight(to_tsvector('simple',  coalesce(s."status", '')), 'B') AS vec
      ) v
      CROSS JOIN LATERAL (SELECT websearch_to_tsquery('english', ${q}) AS qq) qt
      WHERE v.vec @@ qt.qq ${labScope}
      ORDER BY rank DESC, s."updatedAt" DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      reportTypeName: r.reportTypeName,
      reportTypeCode: r.reportTypeCode,
      laboratoryId: r.laboratoryId,
      laboratoryName: r.laboratoryName,
      periodLabel: r.periodLabel,
      updatedAt: r.updatedAt.toISOString(),
      rank: Number(r.rank),
    }));
  }

  /** Feedback messages. Lab-scoped for lab heads via their submission's lab. */
  private async searchFeedback(
    q: string,
    limit: number,
    labId: string | null,
  ): Promise<FeedbackSearchHit[]> {
    const labScope = labId ? Prisma.sql`AND s."laboratoryId" = ${labId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        submissionId: string;
        type: string;
        message: string;
        authorName: string;
        createdAt: Date;
        rank: number;
      }[]
    >(Prisma.sql`
      SELECT f."id", f."submissionId", f."type", f."message", f."createdAt",
             u."fullName" AS "authorName",
             ts_rank(f."searchVector", qt.qq) AS rank
      FROM "Feedback" f
      JOIN "ReportSubmission" s ON s."id" = f."submissionId"
      JOIN "User" u ON u."id" = f."authorId"
      CROSS JOIN LATERAL (SELECT websearch_to_tsquery('english', ${q}) AS qq) qt
      WHERE f."searchVector" @@ qt.qq ${labScope}
      ORDER BY rank DESC, f."createdAt" DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      id: r.id,
      submissionId: r.submissionId,
      type: r.type,
      snippet: snippet(r.message),
      authorName: r.authorName,
      createdAt: r.createdAt.toISOString(),
      rank: Number(r.rank),
    }));
  }
}

/** A plain-text excerpt of a feedback message (never HTML — no injection risk). */
function snippet(message: string): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.length > SNIPPET_MAX ? `${clean.slice(0, SNIPPET_MAX)}…` : clean;
}
