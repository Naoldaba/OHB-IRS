# OHB Integrated Report System

A centralized reporting and monitoring system for the **Oromia Regional Health Bureau**.

Regional laboratories submit laboratory reports through the system, and Bureau
administrators review submissions, provide feedback, request revisions, and
monitor reporting performance and compliance across all laboratories.

Reports are **authored by administrators through a report builder** rather than
hard-coded — new report types, fields, and business rules can be added without
code changes.

---

## Features

- **Report builder** — admins define report categories, types, sections, and
  fields through a UI; each definition is versioned and published immutably.
- **Configurable business rules** — declarative, metadata-driven field
  validation, cross-field checks, conditional show/hide/require, calculated
  fields, and submission-blocking, evaluated by a safe engine (no code/scripts).
- **Report lifecycle** — `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED`, with
  `REVISION_REQUIRED → RESUBMITTED` paths; drafts, submission history, and
  revision history are preserved.
- **Review & feedback** — section/field-level feedback, revision requests,
  sign-off, and mentions.
- **Reporting periods & requirements** — expected vs. submitted/pending/overdue
  tracking per laboratory.
- **Dashboards & analytics** — compliance, laboratory comparison, and historical
  trends based on actual submitted data.
- **Audit trail** — security-sensitive actions, submissions, reviews, feedback,
  and administration are recorded and preserved.
- **Notifications & reminders**, **attachments**, **exports** (PDF/DOCX/Excel),
  and **report import**.
- **Auth & security** — session-based login, password reset, two-factor
  authentication with recovery codes, and role/laboratory-scoped authorization
  enforced server-side.

### Roles

- **Bureau Administrator** — manages laboratories and users, reviews reports,
  provides feedback, manages reporting periods, and views analytics/audit.
- **Regional Lab Head** — creates, drafts, submits, and resubmits their
  laboratory's reports and views feedback.

---

## Tech Stack

| Layer     | Technology |
|-----------|------------|
| Monorepo  | npm workspaces |
| Backend   | NestJS 10, Prisma 5, PostgreSQL 16 |
| Frontend  | Next.js 14 (App Router), React 18, TypeScript |
| Shared    | `@ohb/shared` TypeScript package (types/utilities) |
| Auth      | `express-session` (httpOnly cookie, stored in Postgres via `connect-pg-simple`), `otplib` 2FA |
| Other     | ExcelJS, PDFKit, `docx` (exports), Nodemailer (email), `@anthropic-ai/sdk` |

---

## Project Structure

```
.
├── apps/
│   ├── api/          # NestJS backend (Prisma schema, modules, seed)
│   └── web/          # Next.js frontend (App Router)
├── packages/
│   └── shared/       # Shared TypeScript types/utilities (@ohb/shared)
├── docs/             # SRS and design assets
├── uploads/          # Local file storage (dev)
├── docker-compose.yml
└── CLAUDE.md         # Architecture, conventions, and development rules
```

The API is organized into modules including `auth`, `users`, `roles`, `labs`,
`categories`, `report-types`, `definition-versions`, `rules`, `submissions`,
`reporting-periods`, `requirements`, `analytics`, `audit`, `notifications`,
`reminders`, `export`, `report-import`, `search`, `storage`, and `mail`.

---

## Prerequisites

- **Node.js ≥ 20** (developed on v22)
- **Docker Desktop** (for the PostgreSQL container)

---

## Getting Started

> **Note:** Postgres runs in Docker on host port **5433** (not 5432) to avoid
> clashing with a native Postgres install. This matches `DATABASE_URL`.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example env file and adjust as needed. The API reads its env from
`apps/api/.env`:

```bash
cp .env.example apps/api/.env
```

The root [`.env.example`](.env.example) documents every variable (database,
API, sessions, file storage, email, seeded admin, and web).

### 3. Start the database

```bash
npm run db:up         # docker compose up -d
```

### 4. Build the shared package, generate Prisma client, migrate, and seed

```bash
npm run build:shared
npm run prisma:migrate --workspace @ohb/api   # applies migrations
npm run prisma:seed    --workspace @ohb/api   # seeds roles, labs, and users
```

### 5. Run the apps

```bash
npm run dev           # starts DB (waits for health) + API + web together
```

Or run them individually:

```bash
npm run dev:api       # NestJS API  → http://localhost:4000/api
npm run dev:web       # Next.js web → http://localhost:3000
```

---

## Seeded Logins (local dev)

| Role              | Email             | Password      | Laboratory |
|-------------------|-------------------|---------------|------------|
| Bureau Admin      | `admin@ohb.local` | `Admin@12345` | —          |
| Regional Lab Head | `labhead@ohb.local` | `Lab@12345` | Adama      |

> In local dev, if `SMTP_HOST` is unset the mailer logs messages (including
> password-reset links) to the API console instead of sending email.

---

## Common Scripts (root)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start DB + API + web concurrently |
| `npm run dev:api` | Start the API in watch mode |
| `npm run dev:web` | Start the web app in dev mode |
| `npm run build` | Build shared, API, and web |
| `npm run db:up` / `db:down` | Start / stop the Postgres container |
| `npm run prisma:migrate` | Run Prisma migrations (API workspace) |
| `npm run prisma:seed` | Seed the database (API workspace) |

API workspace also provides `prisma:generate`, `prisma:deploy`, and
`db:reset` (see [`apps/api/package.json`](apps/api/package.json)).

---

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — system architecture, conventions, data model,
  workflow, and development rules.
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) — phased implementation plan.
- [`docs/`](docs/) — Software Requirements Specification and design assets.

---

## License

Private / internal. All rights reserved.
