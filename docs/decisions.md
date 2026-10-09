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

---

## ADR-016 — Certificate custody is a state machine with an append-only log

**Context.** The quotation gave "Return Certificate" four lines. It is the
highest legal-risk area in the system: the institute physically holds
students' original SSLC, Plus Two and degree certificates.

**Decision.**
- `ALLOWED_TRANSITIONS` in `certificates/queries.ts` is the **server-side**
  guard. The action consults it before writing, so hiding a menu option is
  never the only thing preventing an illegal move — notably, a document
  cannot go from "sent to university" straight to "returned to student".
- Every movement appends a `CertificateCustodyEvent` (never updates one) and
  an audit entry naming who moved it.
- Handing back to a student **requires** a "received by" name.
- "Returned to student" and "Lost" are terminal; a mistake is corrected by
  opening a new custody record, not by rewriting history.
- A qualification cannot be deleted from a student's Education tab while the
  institute still holds the original.

**Why.** The question this screen must answer at any moment is "where is this
student's original, and who had it last?". Anything less is not a custody
record.

---

## ADR-017 — Notifications are recorded before a gateway exists

**Decision.** `src/lib/notify.ts` writes a `NotificationLog` row for every
message the system would send, marked SKIPPED while no gateway is configured.

**Why.** The screens then behave exactly as they will once a gateway is
wired in; the institute can see the message volume it is about to pay for;
and nothing is silently lost in the meantime. For SMS in India, DLT
sender-ID and template registration must be completed in Bell Cell's own
name first — see docs/open-questions.md #6.

---

## ADR-018 — Roll numbers belong to a course year, and promotion frees them

**Decision.** `RollNumber` is unique per (section, number, course year).
Promoting a student releases the number held for the year they are leaving;
new numbers are allocated for the new year on the Roll Numbers screen.
Transferring course also frees the number, since it belonged to the old
course.

**Why.** Carrying a number forward silently would produce duplicates within a
year. Releasing rather than deleting keeps the record of who held what.

**Note.** Reallocating a freed number deletes the released row before
creating the new one, because the unique constraint does not exempt released
rows. The history survives in the audit log, which recorded the release.

---

## ADR-019 — Issuing study material cannot take stock negative

**Decision.** The issue happens inside a transaction that checks availability
and increments `stockIssued`; it is refused if it would exceed `stockTotal`.
A `stockTotal` of 0 means "not tracked" and skips the check.

**Why.** If the register can disagree with the shelf, the "study material
issue summary" report becomes fiction.

---

## ADR-020 — The Day Book derives its balances, and proves the identity on screen

**Decision.** Opening balance is computed from the ledger (everything strictly
before the window, as a SQL aggregate) rather than stored as a running total.
The page renders the identity as a visible line:

> Balanced: opening + receipts − payments = closing

**Why.** A stored running balance drifts the moment anything is back-dated or
corrected, and the drift is silent. Deriving it means there is one source of
truth; printing the identity means a mismatch is visible to whoever is looking
at the book, not discovered at audit.

**Verified.** The browser pass asserts the line reads "Balanced"; a SQL
cross-check confirms the on-screen figures equal
`sum(debit) − sum(credit)` per branch, and that **no ledger row exists without
a source document** (payment, refund, voucher or remittance).

---

## ADR-021 — One numbering helper, separate series per document type

**Context.** Fee receipts already had concurrency-safe numbering. Vouchers
needed the same guarantee.

**Decision.** `ReceiptSequence` gained a `series` discriminator
(`RECEIPT` → RC, `VOUCHER` → VCH) and the logic moved to
`src/lib/numbering.ts`, which both modules now call.

**Why.** Each run must be gapless **on its own** — sharing one counter would
make both series look full of holes. Two sequences, one implementation, so
the atomic-increment-plus-retry behaviour cannot diverge between them.

---

## ADR-022 — An account head's type decides the direction of money

**Decision.** `recordDailyTransaction` refuses an entry whose `kind`
contradicts the chosen head's `kind`. The form only offers heads of the
selected type, and the server enforces the same rule.

**Why.** Otherwise a "Rent" voucher can be filed as income and the books are
quietly wrong. The UI filter is a convenience; the server check is the
guarantee.

---

## ADR-023 — Affiliation remittances reconcile against what students paid

**Context.** The quotation had "Affiliation & Tie-Up Payment" as a bare entry
screen, unconnected to fee collection, so nobody could answer "do we still
owe the university money?".

**Decision.** Fee types carry `isPayableToAffiliation`. The screen sums what
students actually paid against those fee types and compares it with what has
been remitted, per fee type.

**Why.** That subtraction is the entire point of the screen. An
over-remittance shows as a negative rather than being clamped to zero, and a
remittance recorded without a fee type is called out separately as excluded
from the reconciliation — both are anomalies worth seeing.

---

## ADR-024 — Every examination rule is an assumption, isolated in one file

**Context.** The quotation says only "this module is to publish the result of
exams conducted". It defines no grade scale, no pass rule, no aggregation, and
nothing about absence or withheld results.

**Decision.** All of it lives in `src/lib/exams/core.ts`, marked as
assumptions, with 16 unit tests pinning the behaviour. Changing a rule is a
change to one file, not a hunt through the screens.

**The assumptions, each needing confirmation (open question #10):**
- A seven-band grade scale on the overall percentage (A+ ≥ 90 … F < 40).
- A subject is passed on its **own** pass mark from the Subject master, not a
  fixed 35% — a practical paper may need 50.
- The overall total is a **straight sum of marks, not credit-weighted**. No
  master carries credits today.
- A student must pass **every** subject to pass overall. Many universities
  allow a supplementary attempt in one or two papers instead; that is a
  regulation question, not a software one.
- **Absent is distinct from zero.** Absent counts toward the denominator but
  contributes no marks, and a student absent in every paper reads ABSENT
  rather than FAIL.
- A result with any mark still unentered is **never** reported as passed.

---

## ADR-025 — Publishing locks, and refuses on incomplete data

**Decision.** Publishing a timetable stops papers being added or removed.
Publishing results locks the mark grid, and is refused outright while any
mark is unentered. Both are reversible by unpublishing.

**Why.** A published timetable is what students have been handed; changing it
silently is how people turn up on the wrong day. A half-entered result
published as "fail" is worse than no result at all.

**Also guarded:** a paper cannot be removed from a timetable once marks exist
against it, because that would discard them with no trace.

---

## ADR-026 — Mark validation is enforced on the server, not just the input

**Decision.** `markError` runs server-side on every submitted cell. The grid's
`max`/`min`/`step` attributes are a convenience on top.

**Why.** The browser's constraint validation is trivially bypassed. Verified
by stripping those attributes at runtime and confirming the server still
refuses, cell by cell, with a reason attached to the offending input.

---

## ADR-027 — A TC cannot be issued while the institute holds the originals

**Decision.** Issuing a Transfer Certificate is refused if any
`CertificateCustody` row for that student is still WITH_INSTITUTE,
SENT_FOR_VERIFICATION or RETURNED_FROM_AFFILIATION. The message names how
many documents are held.

**Why.** Handing a student their leaving certificate is exactly the moment
their originals should go back. Letting the two paths run independently is
how an institute ends up holding documents for someone who left two years
ago — which ADR-016 exists to prevent.

**Related:** a completion certificate is refused for a student who has not
reached the final year of their course.

---

## ADR-028 — Issuing a login needs `settings.user`, not `people.employee:update`

**Decision.** The Employee record's "Login & access" tab is gated on
`settings.user` (create/update), separately from the permission that edits the
personnel record. A user with `people.employee:update` and nothing else can
record someone's degree but cannot give them a login; the tab is not rendered
at all.

**Why.** The quotation lists "Employee Login" as one line among Education
Details and Language Known, as though they were the same kind of data entry.
They are not: one records a fact about a person, the other grants access to
fee money and students' personal data. Collapsing them means anyone who can
fix a typo in a designation can also mint an Accountant account.

**Cost.** Two permissions to think about on one screen, and an administrator
who can edit staff records may still have to ask someone else to create the
login.

---

## ADR-029 — Role assignment has a ceiling, and the rules are unit-tested

**Decision.** `src/lib/rbac/roles.ts` holds every account-administration
rule, with 17 unit tests:

* nobody may grant a role at or above their own; only a `SUPER_ADMIN` may
  mint another `SUPER_ADMIN`;
* nobody may change their own access from the Employees screen;
* nobody may change an account at or above their own level;
* the last active `SUPER_ADMIN` cannot be deactivated.

The form renders only the assignable roles, **and** the server re-checks.

**Why.** Without a ceiling, an `ADMIN` creates a second account as
`SUPER_ADMIN`, signs into it, and every restriction in the matrix is gone.
Rules that live only in which `<option>`s a form renders are not rules —
verified by adding a `SUPER_ADMIN` option to the DOM by hand and confirming
the server refused it.

The last-super-admin guard exists because the alternative is unrecoverable:
there is no screen left that could undo it.

---

## ADR-030 — Administrators issue one-time passwords; they never see or set a real one

**Decision.** Creating a login, and resetting one, generates a 12-character
password, shows it to the administrator **once**, and sets
`mustChangePassword`. The `(app)` layout then redirects that account to
`/change-password` and nowhere else until it chooses its own. The generator
omits `I`, `O`, `l`, `0` and `1`, because these passwords are written on paper
and handed over.

A reset also clears any lockout and revokes every live session, as does a role
change and a deactivation.

**Why.** An administrator who types a colleague's password knows it
afterwards, and an audit trail cannot tell the two of them apart. A one-time
password that the system forces to be replaced keeps "who did this"
answerable.

Revoking sessions matters more than it looks: without it, a dismissed
employee keeps working for up to `SESSION_TTL_HOURS`, and a demotion does not
take effect until their session happens to expire.

**Cost.** No email gateway is configured (open question #7), so the password
travels by hand or by phone. The screen says so rather than pretending
otherwise.

---

## ADR-031 — Every page in the `(app)` group authorises itself, and a test proves it

**Decision.** `requirePageUser(resource, action)` is the first line of every
page under `src/app/(app)`. `src/app/(app)/guards.test.ts` reads every
`page.tsx` and fails the build if one does not call it. Exemptions live in a
named list in that test, with a reason.

**Why.** This was a real defect, not a hypothetical. Detail pages checked
`can(...)`, but **seventeen list pages did not** — they relied on the sidebar
to hide them. A FACULTY account could type `/people/employees` and read the
whole staff directory, including who holds a login. Found by signing in as a
freshly created Faculty user during a browser pass, not by reading the code.

Hiding a nav item is not access control. A guard that each page must remember
is a guard that will be forgotten, so the test exists to make forgetting
impossible.

**Cost.** One more thing for a new page to do, and a test that will fail
noisily for anyone who adds a page without it — which is the point.

---

## ADR-032 — Payroll deducts nothing statutory until someone switches it on

**Decision.** Every statutory toggle in `PayrollSetting` defaults to `false`,
and a branch with no settings row at all is treated as everything-off. PF, ESI
and professional tax appear on a payslip only after a person with approval
rights has enabled them and entered the rate. The rates shipped in the schema
are defaults for a *form field*, not constants in the calculation.

**Why.** The two possible defaults are not symmetrical. Defaulting PF **on**
means an institute that is not registered with the EPFO silently withholds
12% of its staff's pay and remits it nowhere — money taken from people under
a false description. Defaulting **off** means an institute that *is*
registered sees a payslip with no PF on it, which is conspicuous and gets
fixed on the first run.

Rates also change by notification, and this code will outlive the current
ones. A hard-coded 12% would quietly become wrong; a settings field with 12%
in it stays visibly editable.

**Cost.** A first run at a registered institute will be wrong until someone
visits the settings screen. The run page therefore says, in as many words,
that no statutory deductions are configured and links to the settings.

---

## ADR-033 — Salary structures are dated, and a revision never rewrites history

**Decision.** `SalaryStructure` carries `effectiveFrom` / `effectiveTo` and a
revision **creates a new row**, closing the previous one the day before. A
payroll run reads the structure in force on the last day of the month it
covers — not the newest one. Payslip figures are additionally written down as
`PayslipLine` rows rather than recomputed on read.

**Why.** Both halves are needed, and for different reasons.

Dating fixes the back-dated run: payroll for March, drafted in May after an
April raise, must pay March's salary. Picking "the latest structure" gets this
wrong, and the error is invisible — the number simply looks like a number.

Storing the computed lines fixes the opposite direction: an auditor opening
last year's payslip must see what was actually paid, even though the rates,
the ceiling and the structure have all moved since. A payslip that recalculates
itself on read is not a record of anything.

**Cost.** More rows, and a settings change does not retroactively fix a
mistake in an already-drafted run. Cancelling and re-opening the run is the
remedy, which is also the honest audit trail.

---

## ADR-034 — Income tax is not computed; the monthly figure is entered

**Decision.** There is no TDS engine. `Payslip.manualTdsPaise` holds a figure
the accountant types in, and the payroll settings screen says why.

**Why.** Monthly TDS on salary depends on the employee's choice between the
old and new regime, their declared investments and rent, their other income,
their previous employer's figures, and a projection over the remaining
financial year that gets revised as declarations arrive. A plausible-looking
automatic number would be wrong for most staff, and the consequence is not a
cosmetic error — it is a wrong return filed in the institute's name.

A blank field that the institute's accountant fills from their own working is
less impressive and more correct. If the institute later wants this automated,
it is a module with its own sign-off, not a formula.

**Cost.** Someone types a number every month. The payslip and the salary
register carry it like any other deduction.

---

## ADR-035 — Only money that actually leaves the institute reaches the ledger

**Decision.** Paying a run posts **two** expense vouchers through
`recordDailyTransaction`: one for total **net pay**, one for the employer's own
PF/ESI contribution. The **gross is never posted**. PF and ESI withheld from
staff reach the ledger later, as an ordinary voucher, when the challan is paid.

**Why.** Gross pay is not an outflow. ₹1,00,000 of gross with ₹12,000 withheld
means ₹88,000 left the bank this month and ₹12,000 is a liability sitting
with the institute until the challan clears. Posting the gross would overstate
expenditure in the month of payroll and then double-count when the challan is
actually paid.

Posting through the accounts service rather than writing ledger rows directly
is the same rule as everywhere else: there is exactly one way money enters the
ledger, which is why the Day Book's identity holds.

**Verified**, not assumed: an integration test adds up every ledger credit the
run produced and asserts it equals net + employer contribution, with ESI
active so that the employee and employer figures differ and the two cannot be
confused. A SQL cross-check on the demo data shows ledger money-out of
₹3,71,577.11 against a gross of ₹3,70,787.11 — close enough to look right and
different enough to prove the distinction is real.

**Cost.** The Day Book shows salary in two lines, not one, and the statutory
remittance appears in a later month. Both are what the books should say.

---

## ADR-036 — Preparing payroll and approving it are different permissions

**Decision.** `people.payroll` splits by action. An `ACCOUNTANT` has
view/create/update/export: they open the run, enter unpaid days, fix the
figures. Only `approve` — held by `ADMIN` and `SUPER_ADMIN` — can freeze a
run, record its payment, or change the statutory rates. Approving also freezes
the figures: after it, unpaid days and TDS cannot be edited at all.

**Why.** Payroll is the largest recurring payment an institute makes, and the
person who computes what everyone is owed should not be the person who
releases it. This is the same separation the matrix already applies to fee
concessions (ADR-005), applied to the bigger number.

Freezing on approval is what makes the approval mean something. An approval
that leaves the figures editable approves nothing.

**Cost.** Two people are needed to run payroll, and a correction after
approval means cancelling the run and opening a new one. The run page says so
before you approve.

---

## ADR-037 — Unpaid days are entered on the run, not counted from attendance

**Decision.** Each payslip carries `lopDays`, typed in on the run screen.
There is no attendance capture, and the payroll screens say so.

**Why.** Attendance is explicitly out of scope (open question #4 and the
out-of-scope list), and payroll cannot wait for it: a month's salary has to be
paid whether or not a register exists. Entering the loss-of-pay days is what
every institute of this size does anyway, from a leave ledger kept in the
office.

Pro-rating is on a **calendar-day** basis — 27/30 for three unpaid days — with
`standardWorkingDays` available for institutes that pay on a 26-day month
instead. Both are assumptions and both are in one function.

**Cost.** A typo in unpaid days is a wrong payslip, which is why the figure is
re-validated on the server (proved by stripping the input's `max` attribute at
runtime and confirming 99 unpaid days in a 31-day month is still refused) and
why approval freezes it. If attendance is later built, it feeds this field
rather than replacing it.
