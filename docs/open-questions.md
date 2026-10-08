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

4. **Is payroll/attendance in scope?** The vendor's Employee section promises
   "Salary Details, Work Schedule" and then lists no screens for either.
   **Currently out of scope here.** If it is wanted, it is a module, not a
   screen.

5. **Permission matrix sign-off.** `src/lib/rbac/matrix.ts` is a proposal.
   Print it and have the principal sign it. Specifically: should a counsellor
   see fee dues (currently yes, read-only)? Should an accountant be able to
   edit a student's course (currently no)?

## Important — needed before go-live

6. **Email/SMS.** Which gateway? Who pays per-message credits? For SMS in
   India, **DLT sender-ID and template registration must be done in Bell
   Cell's own name** and takes weeks — start it now, not at go-live.

7. **Data migration.** How many existing students/enquiries/ledger rows, in
   what format? This is usually the single biggest schedule risk.

8. **Certificate custody.** Who physically holds students' originals today,
   and is there an existing register to migrate? What acknowledgement does the
   student sign on hand-back? This is the highest legal-risk area in the
   system.

9. **Receipt numbering.** Confirm the format and whether the series resets per
   financial year (currently `RC/<FY>/<n>`, per branch, reset yearly).

10. **Exam results.** The scope says "publish the result" but defines no mark
    entry, grade configuration or pass rules. Who enters marks — the
    university's published list, or faculty? Are hall tickets needed?

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

## Explicitly out of scope in this build

Student attendance · timetable · library · hostel · transport · biometric ·
payroll · alumni/placement · inventory · mobile app (responsive web only) ·
online payment gateway · student/parent portal.
