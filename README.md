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
npm run test:int    # integration tests (needs a running database)
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
- **Money moves only through `src/lib/fees/service.ts`**, inside a
  transaction. Never write `paidPaise` or a ledger row by hand.
- **Brand `#00A59F` is never a background for small white text** (3.05:1,
  fails WCAG AA). Filled controls use `brand-700`. The `Button` component does
  not expose the unsafe variant.

## Status

**Foundation** — data model (54 tables), auth + sessions, RBAC, branch
scoping, audit trail, app shell, dashboard.

**Shared list layer** — `DataTable` (sticky header and first column, density
toggle, URL-driven sort), `FilterBar`, `Pagination`, `EmptyState`, and CSV +
XLSX export. Every list screen is built from these, so the remaining modules
are mostly queries and columns.

**Enquiry module — complete:**

| Screen | What works |
|---|---|
| Leads | List, search, 5 filters, sort, pagination, add/edit, call logging, convert to enquiry, archive, export |
| Leads → Import | CSV bulk import with tolerant header matching, phone normalisation, per-row error reporting and dedupe |
| Enquiries | List + funnel summary, stage transitions, call logging, detail page with full call history |
| Call Schedule | Same engine, preset to overdue/due-today |
| Counselling | Same engine, preset to the two counselling stages (ADR-004) |
| Masters | Enquiry call status, Nature of enquiry — add/edit/archive/restore with usage counts |
| Reports | Enquiry Count and Enquiry Lead Count, grouped by counsellor/source/course/branch with conversion rates |

Unbuilt modules in the signed scope resolve to an honest "not built yet"
screen rather than a 404, and `/masters` and `/reports` mark planned entries.

**Application module — core complete:**

| Screen | What works |
|---|---|
| Applications | List with 4 filters and export, create (pre-filled from a counselled enquiry), tabbed record |
| Record tabs | Personal (full edit), Education (with certificate custody), Family (guardians), Fees, Timeline (audit-backed) |
| Fee Collection | Worklist of who owes what; collect with FIFO or targeted allocation; overpayment refused |
| Receipt | Printable A5/A4 receipt; cancel/bounce reverses allocations and posts a contra entry |
| Reports | Students Summary, Fee Collection Summary, Students Fee Summary |

**The fee engine** (`src/lib/fees/`) is the critical code: 23 unit tests on the
pure logic and 9 integration tests against a real database, covering FIFO
allocation, overpayment refusal, concurrent receipt numbering, cancellation
and concession caps.

**Admissions — complete:**

| Screen | What works |
|---|---|
| Certificates | Custody state machine with a server-side transition guard, append-only chain of custody, acknowledgement capture, bulk dispatch, export |
| ID Cards | Request → university → received → student informed → collected, with bulk steps and a logged SMS/email per student |
| Roll Numbers | Sections per course/batch/year, bulk allocation skipping taken numbers, drop-and-reallocate |
| Study Materials | Issue/return with stock that cannot go negative |
| Promotion & Transfer | Bulk promotion (final-year students complete instead), course transfer with the fee consequence captured |

**Accounts — complete:**

| Screen | What works |
|---|---|
| Daily Transactions | Income/expense vouchers with concurrency-safe numbering, reversal by contra entry, filters and period totals |
| Affiliation Payments | University remittances reconciled against what students actually paid under payable fee types |
| Day Book | Every rupee from every module, with opening/closing balances derived from the ledger and the identity proved on screen |
| Masters | Account heads (type decides direction of money) and bank accounts |

**Examinations — complete:**

| Screen | What works |
|---|---|
| Exam Schedule | Create an examination, build its timetable paper by paper, publish (which locks it), print as a notice |
| Results | Cohort mark-entry grid with absent handling, server-side validation, derived grades and overall status, withholding, publish |
| Certificates Issued | TC and course-completion certificates with gapless numbering, printable, collection recorded |
| Reports | Examination Schedule & Result Summary, Student Certificate Summary (issued + originals held) |

⚠ **Every examination rule is an assumption** — the quotation defines none of
them. They are isolated in `src/lib/exams/core.ts` and listed for
confirmation in [open question #10](docs/open-questions.md). Changing one is a
change to that single file.

---

## All four quoted modules are built

Enquiry · Application (admissions + fees) · Employee (records; payroll and
attendance were never in scope — open question #4) · Accounts.

Remaining gaps are listed in [`docs/open-questions.md`](docs/open-questions.md).
The ones that cost real rework if answered late are **#2 (fee structure)** and
**#10 (examination rules)**.

Open questions for the institute are tracked in
[`docs/open-questions.md`](docs/open-questions.md). Two of them —
**fee structure** and **whether payroll is in scope** — cause real rework if
answered late.
