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
# edit DATABASE_URL. There is no secret to generate: a session cookie
# carries an opaque random token and the server stores only its SHA-256,
# so there is no payload to sign.

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
npm run build       # production build, then assembles .next/standalone
npm run start       # run the standalone build (what the server runs)
npm run check       # typecheck + lint + tests
npm run db:migrate  # create/apply a migration (development only)
npm run db:deploy   # apply committed migrations (what production runs)
npm run db:seed     # seed demo data (idempotent) — never on production
npm run db:studio   # browse the database
npm run test:int    # integration tests (needs a running database)
npm run deploy      # npm ci + db:deploy + build, in that order
```

`build` ends by running `scripts/assemble-standalone.mjs`, which copies
`.next/static` and `public` into `.next/standalone`. Next.js omits them, and
without them the app serves HTML with no CSS or JavaScript — a missing copy
that looks like a broken deployment. It is wired as `postbuild` so it cannot
be skipped, and CI asserts the result exists.

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
src/middleware.ts         security headers + per-request CSP nonce
deploy/                   systemd unit, nginx site, backup + restore drill
scripts/                  assemble-standalone.mjs (the postbuild step)
docs/                     analysis, decisions, design system, open questions
```

## Conventions that matter

- **Money is always integer paise**, in a field named `*Paise`. Never a float.
- **Never write a bare `where` on a branch-scoped table.** Spread
  `branchScope(user)` into it.
- **Every write calls `recordAudit`.**
- **Every page under `src/app/(app)` starts with `requirePageUser(resource)`.**
  `src/app/(app)/guards.test.ts` fails the build otherwise. Hiding a nav item
  is not access control (ADR-031).
- **Logins are administered only through `src/lib/rbac/roles.ts`** — role
  ceilings, self-modification and the last-super-admin guard live there, with
  tests (ADR-029).
- **Payroll figures are written down, never recomputed on read.** A rate
  change must not restate what someone was already paid (ADR-033).
- **Only net pay and the employer's own contribution reach the ledger** —
  never the gross, which is not an outflow (ADR-035).
- **An unmarked attendance day costs nobody anything.** The system fails in
  the direction that does not take money from people by accident (ADR-039).
- **Attendance rules live in `src/lib/attendance/core.ts`** — the shortage
  thresholds belong to the affiliating university, so they are parameters,
  and nothing acts on them automatically (ADR-041).
- **Leave writes the attendance register; it never calls payroll.** One path
  from an absence to a deduction, so two sources can never disagree
  (ADR-045).
- **An action's outcome must outlive whatever triggered it.** If a server
  action changes the state that decides whether its own button renders, put
  the `useActionState` above that decision — this has silently swallowed a
  one-time password, a voucher number and a confirmation (ADR-051).
- **Money moves only through `src/lib/fees/service.ts`**, inside a
  transaction. Never write `paidPaise` or a ledger row by hand.
- **Brand `#00A59F` is never a background for small white text** (3.05:1,
  fails WCAG AA). Filled controls use `brand-700`. The `Button` component does
  not expose the unsafe variant.

## Deploying

Plain **Node 22 + PostgreSQL 16 on one Linux server**. No Docker, no
container runtime, no orchestrator. The deployable artefact is
`.next/standalone/` — about 110 MB against ~980 MB of `node_modules`, so a
release is a directory copy and a service restart.

**[`docs/deployment.md`](docs/deployment.md) is the runbook**: eight numbered
steps from a bare Ubuntu box to a working login, then upgrading, rolling
back, operating, and what is still missing before a real go-live.

| | |
|---|---|
| Process | `node .next/standalone/server.js` under systemd (`deploy/bellcell.service`) |
| Front | nginx + certbot (`deploy/nginx.conf`), app bound to `127.0.0.1` |
| Health | `GET /api/health` — `200` when it can query Postgres, `503` when it cannot, recovering without a restart |
| Migrations | `prisma migrate deploy` only. Never `migrate dev` or `db push` against production — both can rewrite the schema |
| Backups | `deploy/backup.sh` nightly, `deploy/restore-drill.sh` quarterly |
| CI | `.github/workflows/ci.yml` — typecheck, lint, unit, integration, build, and a boot-and-health smoke test |

Three things worth knowing before you read the runbook:

- **There is no session secret to configure.** `.env.example` once asked for
  a `SESSION_SECRET` that no code ever read; it is gone. A setting nobody
  uses is worse than no setting, because the next person assumes it protects
  something.
- **nginx overwrites `X-Forwarded-For`** with the real peer address rather
  than appending to it, because the login throttle counts failures per
  address and a client-supplied header would let an attacker pick a fresh
  address per request.
- **Never run `npm run db:seed` on production.** It writes a demo institute
  with logins whose password is published in this file.

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

**Employee — complete:**

| Screen | What works |
|---|---|
| Employees | List with status / department / has-a-login filters, search, summary tiles, export |
| Record tabs | Personal (full edit), Education, Experience, Language skills (read/write/speak separately), Login & access |
| Login & access | Issue a login within the actor's role ceiling, change role, reset to a one-time password, disable — each revoking live sessions |
| Change password | Forced on first sign-in after an administrator issues or resets a password; also reachable from the account menu |
| Masters | Departments, with codes and employee counts |

Archiving an employee who holds a login disables that account and ends its
sessions in the same transaction — an archived employee with a live login is
exactly the gap nobody notices.

**Payroll — complete:**

| Screen | What works |
|---|---|
| Payroll | Run list with net paid to date, and a standing count of staff who have no salary structure and would be skipped |
| Payroll run | A drafted payslip per employee, unpaid-days entry, who was left out and why, approve, pay, cancel with a reason |
| Payslip | Printable earnings/deductions sheet, with employer contributions shown separately as *not* a deduction |
| Salary register | Per-run XLSX/CSV with a column per component that actually appeared |
| Employee → Salary | Dated salary structures with full history; a revision closes the old one rather than editing it |
| Payroll settings | PF, ESI and professional tax switched on per branch with their own rates, ceilings and slabs |
| Masters | Salary components — fixed, percent-of-basic or percent-of-gross, with PF-wage-base and pro-rating flags |

**The payroll engine** (`src/lib/payroll/`) is the critical code here: 45 unit
tests on the pure calculation and 20 integration tests against a real
database, covering pro-rating, the PF wage ceiling, ESI's eligibility cut-off
and round-up rule, professional-tax slabs, dated structures, frozen approved
runs, and what reaches the ledger.

⚠ **Nothing statutory is deducted until someone switches it on** (ADR-032),
because the opposite default silently withholds money an unregistered
institute would never remit. ⚠ **Income tax is not computed** (ADR-034) — the
monthly figure is entered from the institute's accountant, for reasons the
settings screen states.

**Attendance — complete:**

| Screen | What works |
|---|---|
| Student Attendance | Bookmarkable class picker (course / batch / year / section / subject / period / date), one-tap marking cycling present → absent → late → excused, mark-all shortcuts, lockable sheets |
| Register & shortage | Percentages over a date range against the university's thresholds, Clear / Condonation / Short, how many consecutive sessions would clear a short student, XLSX/CSV export |
| Staff Attendance | Daily sheet with paid and unpaid leave distinguished, statuses that cost money flagged on the row, a month-to-date summary showing exactly what payroll will read |
| Masters → Holidays | Declared holidays per branch or institute-wide, plus generated weekly offs |

**Attendance feeds payroll.** Opening a run reads that month's staff register
and seeds each payslip's unpaid days from it, capped at the period and still
editable on the draft. Once the run is approved it is frozen, so correcting
attendance in May does not restate March's payslips (ADR-043).

⚠ **An unmarked day costs nobody anything** (ADR-039) — a forgotten register
must not dock salaries — so the run says how much of the month was actually
marked rather than letting an empty register look like a clean one.
⚠ **Nothing bars a student from an examination.** The register reports
Clear / Condonation / Short against the affiliating university's thresholds
and acts on none of it (ADR-041).

**Leave — complete:**

| Screen | What works |
|---|---|
| Leave | Approval queue, record a request on behalf of staff, approve / reject with a reason, cancel with the balance returned, carry-forward |
| Employee → Leave | Balances per type for the year, uncapped types shown as uncapped, and the whole history |
| Masters → Leave types | Entitlement, paid or unpaid, carry-forward cap, whether approval is needed |

**Leave completes the chain.** Approving a request writes `PAID_LEAVE` or
`UNPAID_LEAVE` onto the staff attendance register, and payroll reads the
register — so there is exactly one path from "away from work" to "paid
less", whichever route the absence came by (ADR-045). The **leave type**
decides paid or unpaid, not whoever happens to be at the desk (ADR-046).

⚠ **Holidays inside a leave span cost nothing** (ADR-047) — Friday to
Tuesday over a closed weekend is three days, not five. ⚠ **Carry-forward is
a button somebody presses**, never automatic: a balance that changed by
itself cannot be explained to the person whose leave it is (ADR-048).
⚠ **There is no self-service portal** — the office records leave on behalf
of staff, and faculty cannot reach the screen at all.

---

### Deployment and hardening

| | |
|---|---|
| Standalone build | `output: 'standalone'` plus a `postbuild` step that copies `.next/static` and `public` in (ADR-052) |
| Health check | `GET /api/health`, unauthenticated, runs `SELECT 1`, recovers without a restart (ADR-053) |
| CSP | Per-request nonce in `src/middleware.ts`, no `unsafe-inline` on scripts (ADR-054) |
| Login throttle | Per-address as well as per-account, so one password tried across every email is caught (ADR-055) |
| Runbook | [`docs/deployment.md`](docs/deployment.md), with systemd, nginx, nightly backups and a quarterly restore drill |
| CI | `.github/workflows/ci.yml` — the whole check suite plus a boot-and-health smoke test |

What deployment is **not** is a decision about the policy questions below.
Nothing statutory deducts until someone switches it on, so the build is safe
to install and demonstrate; it is not safe to run a real payroll on
assumptions. `docs/deployment.md` ends with the list of what the institute
still has to supply.

---

## All four quoted modules are built

Enquiry · Application (admissions + fees) · Employee (records, logins,
payroll, attendance and leave) · Accounts — plus student attendance, which
the quotation never asked for but an affiliated institute needs.

Remaining gaps are tracked in
[`docs/open-questions.md`](docs/open-questions.md). Three of them matter more
than the rest:

- **#4 payroll** — now the highest risk, because a wrong statutory answer is
  money owed to the EPFO, ESIC or the state. Nothing is deducted until the
  institute switches it on, so the cost of the question stays at zero until
  someone does.
- **#2 fee structure** — the most rework if answered late.
- **#10 examination rules** — every grading rule is ours, not Bell Cell's.
