# Architecture Decision Records

Each entry records a point where this build **deliberately diverges** from the
Proyasis EduSuite quotation (`QT_Proyasis_EduSuite_MVC_basic BELL CELL`, pages
7–11), and why.

---

## ADR-001 — Build on Node/Next.js, not ASP.NET MVC

**Context.** The quotation's filename says "MVC", implying ASP.NET MVC.

**Decision.** TypeScript throughout: Next.js 15 (App Router) + Prisma +
PostgreSQL 16.

**Why.** One language across server and client for a small team; Server Actions
remove most API boilerplate across ~55 CRUD screens; Prisma migrations give a
reviewable schema history. No .NET runtime is present in the target
environment.

**Cost.** Nobody on the team gets to reuse ASP.NET experience; server-rendered
React has a learning curve for form-heavy screens.

---

## ADR-002 — Multi-branch from day one

**Context.** The vendor scope promises a "Dashboard to see an overall idea
about the progress of different **branches**", but ships no Branch master and
no branch scoping anywhere in its module list.

**Decision.** `Branch` is a first-class entity. Every tenant-scoped table
carries `branchId`. All reads go through `branchScope(user)`; all writes
through `writeBranchId(user)`. Users are granted branches via `UserBranch`;
`SUPER_ADMIN` can view "All branches".

**Why.** Retrofitting tenancy after data exists is a migration nightmare, and
the alternative is one centre seeing another's students and fee figures.

**Note.** `branchScope` **fails closed**: a non-super user with no branch sees
nothing, rather than everything.

---

## ADR-003 — Every rupee posts to a single ledger

**Context.** The vendor scope has Fee collection in the Application module and
"Daily Transaction" in Accounts, and never says whether the two connect. If
they don't, the Day Book cannot reconcile to the fee register.

**Decision.** One `LedgerEntry` journal. Fee receipts, refunds, daily
income/expense and affiliation remittances all post to it. The Day Book is one
query over that table.

**Why.** It makes "what did we collect today?" and "what do the books say we
collected today?" the same number by construction.

---

## ADR-004 — Three counselling screens collapse into one

**Context.** The scope lists *Call Schedule*, *Counselling Call Schedule* and
*Counselling Completed Call Schedule* as three separate screens with
near-identical descriptions.

**Decision.** One Call Schedule screen with a stage filter, backed by a single
`EnquiryFollowUp` table and an `EnquiryStage` enum.

**Why.** They differ only by which stage they filter on. Three codebases for
one screen is three times the bugs.

**Reversible.** If the institute wants three menu entries for muscle memory,
they become three saved filters over the same screen — not three screens.

---

## ADR-005 — Money is integer paise, never a float

**Decision.** Every monetary column is `Int`, named `*Paise`. Formatting and
parsing live in `src/lib/money.ts`.

**Why.** `0.1 + 0.2 !== 0.3`. A fee register that drifts a paisa per row will
not tie to the Day Book, and the institute will not trust either.

**Limit.** Int32 caps a single row at ₹2.14 crore, which is far above any
single fee instalment. Aggregates are summed in the database.

---

## ADR-006 — Minimise the PII we hold

**Decision.** Only the last four digits of Aadhaar are stored
(`aadhaarLast4`). Original certificates are tracked by *custody record*, not by
scanning and storing the document.

**Why.** India's DPDP Act 2023 applies to this data, much of it belonging to
minors. The cheapest way to survive a breach is not to hold the data.

---

## ADR-007 — Permission matrix in code, exceptions in the database

**Context.** The scope names three example roles and defines no matrix.

**Decision.** `src/lib/rbac/matrix.ts` holds role → resource → actions, in
version control and unit-tested. Per-user exceptions live in
`user_permission_overrides`. An explicit DENY beats everything, including
`SUPER_ADMIN`.

**Why.** A permission model that can be changed by a database UPDATE with no
review is not a permission model. This one can be diffed, reviewed and printed
as the annexure the institute should actually sign.

---

## ADR-008 — Masters are archived, never deleted

**Context.** The scope says masters allow "add/edit/delete/view".

**Decision.** Masters carry `archivedAt`. Nothing referenced by a student
record is ever hard-deleted.

**Why.** Deleting the course a 2019 graduate was admitted to rewrites history
and breaks every historical report.

---

## ADR-009 — Four categorical chart colours, and no more

**Decision.** The validated palette has exactly four categorical hues per mode
(`src/lib/charts/palette.ts`). A fifth series folds into "Other" or the chart
becomes small multiples. Ordered data uses the single-hue sequential teal ramp.

**Why.** Because the brand *is* teal, blue and green are unusable as
categorical slots — measured teal↔sky ΔE 11.6 for normal vision and
amber↔lime 4.9 under protanopia. The supplied reference dashboard pairs teal
with pink at ΔE 3.1 under deuteranopia, which ~8% of men cannot distinguish.
See `docs/design-system.md` §3.2.
