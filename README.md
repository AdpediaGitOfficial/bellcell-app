# Bell Cell EduSuite

Institute management for **Bell Cell Group of Institutions** — enquiry,
admissions, examinations and accounts.

Built from the scope in the Proyasis EduSuite quotation (pages 7–11), with the
gaps in that document closed deliberately rather than inherited. See
[`docs/requirements-analysis.md`](docs/requirements-analysis.md) for the
analysis and [`docs/decisions.md`](docs/decisions.md) for where and why this
build diverges.

## Stack

| | |
|---|---|
| Runtime | Node 22 |
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| Database | PostgreSQL 16 via Prisma 6 |
| Styling | Tailwind CSS 3, brand tokens in `tailwind.config.ts` |
| Tests | Vitest |

## Getting started

Requires Node 22 and a running PostgreSQL 16. No Docker needed.

```bash
# 1. Create the database (once)
createdb bellcell
psql -c "CREATE ROLE bellcell LOGIN PASSWORD 'bellcell' CREATEDB;"
psql -c "ALTER DATABASE bellcell OWNER TO bellcell;"

# 2. Configure
cp .env.example .env
# edit DATABASE_URL, then generate a secret:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# paste it into SESSION_SECRET

# 3. Install, migrate, seed
npm install
npm run db:migrate
npm run db:seed

# 4. Run
npm run dev        # http://localhost:3000
```

### Demo accounts (seed data only — never in production)

| Email | Role |
|---|---|
| `admin@bellcell.test` | Super Admin |
| `principal@bellcell.test` | Admin |
| `accounts@bellcell.test` | Accountant |
| `counsellor@bellcell.test` | Counsellor |
| `faculty@bellcell.test` | Faculty |
| `frontdesk@bellcell.test` | Staff |

Password for all: `BellCell@2026`

Sign in as different roles to see the sidebar change — navigation is filtered
by the permission matrix, so a counsellor has no Accounts section at all.

## Scripts

```bash
npm run dev         # dev server
npm run build       # production build
npm run check       # typecheck + lint + tests
npm run db:migrate  # create/apply a migration
npm run db:seed     # seed demo data (idempotent)
npm run db:studio   # browse the database
```

## Project layout

```
prisma/schema.prisma      54-table data model, documented by section
src/lib/
  money.ts                integer-paise money handling  (ADR-005)
  branch.ts               multi-branch scoping          (ADR-002)
  rbac/matrix.ts          THE permission matrix         (ADR-007)
  audit.ts                append-only audit trail
  charts/palette.ts       validated chart palette       (ADR-009)
src/components/           shell, ui primitives, charts
src/app/(app)/            authenticated application
docs/                     analysis, decisions, design system, open questions
```

## Conventions that matter

- **Money is always integer paise**, in a field named `*Paise`. Never a float.
- **Never write a bare `where` on a branch-scoped table.** Spread
  `branchScope(user)` into it.
- **Every write calls `recordAudit`.**
- **Brand `#00A59F` is never a background for small white text** (3.05:1,
  fails WCAG AA). Filled controls use `brand-700`. The `Button` component does
  not expose the unsafe variant.

## Status

Built: data model, auth + sessions, RBAC, branch scoping, audit trail, app
shell, dashboard.

Next: Enquiry module screens (leads with bulk import, enquiries, call
schedule, counselling), then the shared `DataTable` + export layer that the
remaining ~50 screens depend on.

Open questions for the institute are tracked in
[`docs/open-questions.md`](docs/open-questions.md).
