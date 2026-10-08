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

---

## ADR-010 — Creating a record in "All branches" mode asks which branch

**Context.** A `SUPER_ADMIN` viewing "All branches" has no single branch in
context, so `writeBranchId` had nothing to write and threw — breaking every
create path with a 500.

**Decision.** `writeBranchId(user, explicit?)` accepts an explicit branch, and
create forms render a required Branch picker when `needsBranchChoice(user)`.
The submitted value is validated against the user's own branches, so a
tampered form cannot write into a centre the user has no access to.

**Why.** Failing closed is right for reads (ADR-002); for writes it has to be
a question, not an error. Defaulting to "the first branch" would silently file
a lead under the wrong centre, which is worse than asking.

---

## ADR-011 — One generic implementation for the 19 masters

**Decision.** `masters/actions.ts` plus `MasterTable.tsx` serve every master
screen; each master page is a thin wrapper supplying its rows and labels.

**Why.** The masters are structurally identical — a name, occasionally a flag
or two, add/edit/archive. Nineteen near-copies would be nineteen places to fix
the same bug. The index page at `/masters` keeps them to one nav entry.

---

## ADR-012 — Instalments are a snapshot, not a view of the structure

**Decision.** Assigning a fee structure materialises concrete
`FeeInstallment` rows. Later edits to the structure master do not rewrite
what an already-admitted student owes.

**Why.** Correcting next year's fee card must not silently re-bill last
year's students. The same reasoning as ADR-008: history stays accurate.

**Cost.** A genuine correction to an existing student's dues is a deliberate
act (concession, or an adjusted instalment), not a master edit. That is the
intended friction.

---

## ADR-013 — A payment that cannot be fully allocated is refused

**Decision.** `recordPayment` spreads money across instalments oldest-first
(or across explicitly chosen ones) and **rejects** the payment if any rupee
is left unallocated.

**Why.** Accepting it would put money in the ledger that no instalment
credits, and the fee register would stop tying to the Day Book — the exact
failure ADR-003 exists to prevent. The cashier is told the overpayment amount
and asked to reduce it or raise the dues first.

**Verified.** `src/lib/fees/service.int.test.ts` asserts the rejection, and a
SQL check confirms completed payments, ledger debits, allocations and
instalment `paidPaise` all agree to the rupee.

---

## ADR-014 — Receipts are cancelled, never deleted

**Decision.** Cancelling reverses the allocations, posts a contra ledger
entry, and marks the payment CANCELLED or BOUNCED. The row and its receipt
number stay.

**Why.** A deleted receipt leaves a hole in the number series that nobody can
explain to an auditor. Receipt numbers are allocated inside the payment's own
transaction, so a failed payment never burns one either.

---

## ADR-015 — Concessions require approval, and cannot exceed the balance

**Decision.** Applying a concession needs `admission.concession:approve`,
which the matrix grants only to ADMIN and SUPER_ADMIN. An accountant may
propose but not approve. The amount is capped at what is still owed on that
instalment, and every concession stores its reason and approver.

**Why.** A discount is money the institute chooses not to collect. Letting
whoever handles the cash also grant it removes the only control over it.
