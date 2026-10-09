# Open questions

Raised by the analysis of the Proyasis quotation (pages 7–11). Ordered by how
much rework the answer causes if it arrives late.

## Blocking — answer before building the relevant module

1. **How many branches does Bell Cell run, and should staff at one see
   another's data?** The build assumes multi-branch with per-user grants
   (ADR-002). If it is genuinely single-branch, we keep the model and hide
   the switcher — no rework either way, but confirm.

2. **Fee structure.** *Still the highest-rework item.* The engine is built
   and tested, but these assumptions are ours, not the institute's:
   - Structures are per **course + batch + year** (optionally per branch).
   - Payments settle the **oldest instalment first** unless the office ticks
     specific ones.
   - A payment that exceeds the balance is **refused**, not banked as an
     advance. *If the institute does take advances, this needs a design.*
   - Late fee is **per day after a grace period, with a cap** — set per
     structure; no institute numbers yet.
   - Concessions need **ADMIN approval** and cannot exceed the balance.
   - **Refunds on dropout are modelled but no policy is implemented** — who
     approves, what is non-refundable, over what period?
   Confirm each, and supply the real fee card per course.

3. **Does fee collection post to Accounts automatically?** We say yes
   (ADR-003). Confirm the institute's accountant agrees, since it changes how
   the Day Book reads.

4. **Payroll — built on assumptions; confirm before the first real run.**
   *This is now the highest-risk unanswered item, because a wrong answer is
   money owed to a statutory authority, not an embarrassing screen.* Payroll
   is built (components, dated salary structures, runs, payslips, salary
   register, posting to the Day Book). Nothing statutory is deducted until it
   is switched on, so an unanswered question costs nothing until someone
   enables it — but these must be answered before anyone does:
   - **Is the institute registered for PF?** If so, confirm the employee and
     employer rates, the establishment code, and whether contributions are on
     the wage ceiling or on full wages above it.
   - **Is it covered by ESI?** Confirm the rates and the eligibility limit.
   - **Does the PF wage ceiling pro-rate for a part month?** The code does
     NOT pro-rate it; EPFO guidance has been read both ways and the
     institute's PF consultant should settle it. One function changes.
   - **ESI contribution periods are not modelled.** Someone who crosses the
     threshold mid-period should keep contributing to the period's end. We
     test eligibility month by month. Needed?
   - **Professional tax**: the slabs are assumed half-yearly (Kerala's basis)
     and deducted in September and March. Confirm the state, the slabs and
     the basis.
   - **Pay basis**: calendar days (27/30 for three unpaid days) or a fixed
     26-day month? Set per branch; nobody has chosen.
   - **Does the employer's PF share need its EPS split** (8.33% to the
     pension scheme) for the ECR filing? Not modelled.
   - **Income tax is deliberately not computed** (ADR-034) — the monthly
     figure is typed in. Is a TDS module wanted, with Form 16 and quarterly
     returns? That is a project of its own.

4a. **Attendance — built, and every rule in it is ours.** Staff and student
   attendance both exist, and payroll now takes loss-of-pay days from the
   staff register (ADR-043). Confirm:
   - **The shortage thresholds.** 75% required and 65% condonable are
     assumptions; they are set by the affiliating university, differ between
     universities and sometimes by course. They are parameters, not
     constants — see `src/lib/attendance/core.ts`.
   - **What a shortage should DO.** Nothing currently bars a student from an
     examination, withholds a hall ticket or blocks a result (ADR-041).
     Should it, and with what appeal route?
   - **Does late count as present?** We say yes. Institutes that convert
     three lates into an absence need that rule adding.
   - **Is an excused absence out of the denominator?** We say yes — neither
     present nor penalised. Some universities count it present.
   - **Leave balances and entitlements are NOT modelled.** Whether a day is
     paid or unpaid is typed when marking it. A real leave module (casual /
     earned / medical balances, accrual, carry-forward, an approval
     workflow) is a project of its own. Wanted?
   - **Is there a weekly off?** None is assumed. The holiday master can
     generate one, but nobody has said whether the institute has one.
   - **Half days** are the only fraction supported. Hourly or period-level
     loss of pay is not.

5. **Permission matrix sign-off.** `src/lib/rbac/matrix.ts` is a proposal.
   Print it and have the principal sign it. Specifically: should a counsellor
   see fee dues (currently yes, read-only)? Should an accountant be able to
   edit a student's course (currently no)? And **who may issue logins** —
   `settings.user` is currently held by ADMIN and SUPER_ADMIN only, which
   means an office manager who maintains staff records cannot create their
   accounts (ADR-028).

## Important — needed before go-live

6. **Email/SMS.** Which gateway? Who pays per-message credits? For SMS in
   India, **DLT sender-ID and template registration must be done in Bell
   Cell's own name** and takes weeks — start it now, not at go-live.
   Until one exists, an administrator-issued one-time password travels by
   hand or by phone: it is shown on screen once and never emailed (ADR-030).

7. **Data migration.** How many existing students/enquiries/ledger rows, in
   what format? This is usually the single biggest schedule risk.

8. **Certificate custody.** Who physically holds students' originals today,
   and is there an existing register to migrate? What acknowledgement does the
   student sign on hand-back? This is the highest legal-risk area in the
   system.

9. **Receipt numbering.** Confirm the format and whether the series resets per
   financial year (currently `RC/<FY>/<n>`, per branch, reset yearly).

10. **Examination rules.** *Built on assumptions — confirm before the first
    real exam, because changing them means re-entering marks.* The scope says
    only "publish the result". Every rule below is ours, not Bell Cell's
    (all in `src/lib/exams/core.ts`, ADR-024):
    - **Grade scale**: A+ ≥ 90, A ≥ 80, B+ ≥ 70, B ≥ 60, C ≥ 50, D ≥ 40,
      else F. Is this the university's scale?
    - **Pass mark** comes from each Subject master row, defaulting to 35.
    - **Aggregation** is a straight total, *not credit-weighted*. If the
      university weights by credit, the Subject master needs a credits field
      and this changes.
    - **Every subject must be passed** to pass overall. Does Bell Cell's
      university allow a supplementary attempt in one or two papers?
    - **Withholding** is manual. A "fees due" flag is shown on the mark grid
      for information only — should unpaid fees block a result automatically?
    - **Who enters marks** — faculty, or transcription from the university's
      published list? The grid supports either.
    - **Hall tickets are still not built.** Printing the timetable page gives
      a notice, not per-student admit cards. Needed?

## To confirm — low rework cost

11. **Brand colour.** The supplied logo is `#16A6A2`; the stated brand colour
    is `#00A59F`. Tokens currently use `#00A59F`. Pick one and re-export the
    other. *(Flagged 8 Oct; still open.)*

12. **Reports.** The scope lists 13. Confirm the exact columns and filters for
    each, and which must export to PDF vs Excel vs Word.

13. **Student/parent portal and online payments** are not in the vendor scope
    and not built here. Wanted?

14. **Retention.** How long must student records, fee receipts and audit logs
    be kept? Affects backup and archival design.

15. **Account policy for staff who leave.** Archiving an employee disables
    their login and ends their sessions (ADR-030), but two questions are the
    institute's to answer: should the account be *deleted* after some period,
    and should a login expire on its own if unused for N months? Neither is
    implemented.

16. **Session length.** `SESSION_TTL_HOURS` defaults to 12 — one working day.
    Shorter is safer on a shared front-desk machine; longer is kinder to
    staff. Confirm, and confirm whether an idle timeout is wanted as well
    (currently there is none; the limit is absolute).

## Explicitly out of scope in this build

Timetable · library · hostel · transport · biometric or swipe attendance
capture (attendance is marked by hand) · leave balances and approval
workflow · automatic TDS computation and Form 16 · alumni/placement ·
inventory · mobile app (responsive web only) · online payment gateway ·
student/parent portal (so neither staff nor students can see their own
payslips or attendance — only the office can).
