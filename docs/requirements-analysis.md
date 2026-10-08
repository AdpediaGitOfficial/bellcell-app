# Requirements analysis — Proyasis EduSuite quotation

Source: `QT_Proyasis_EduSuite_MVC_basic BELL CELL.pdf`, **pages 7–11 only**
(5 pages; the only images are the repeated Proyasis header/footer logos).

## What the document is

A **vendor's product scope**, not Bell Cell's requirements:

- The `QT_` prefix and page numbering (7–11) mark it as an excerpt from a
  **quotation** for Proyasis's off-the-shelf "EduSuite MVC (basic)" product,
  with "BELL CELL" appended as the prospect name.
- **Pages 1–6 are missing** — cover, commercials, timeline, payment terms,
  warranty/support, exclusions.
- **Nothing in the five pages is specific to Bell Cell.** Sample affiliations
  are "Calicut University, Bharathiar University"; course types and masters are
  generic. No requirement gathering has taken place.

Treat it as *"here is what our basic tier ships with"* — a baseline to measure
real needs against.

## Scope as quoted

~55 screens: 20 functional + ~19 unique masters + 13 reports + dashboard,
login and user administration.

| Module | Functional screens | Masters | Reports |
|---|---|---|---|
| I. Enquiry | Enquiry Lead (bulk), Enquiry, Call Schedule, Counselling Call Schedule, Counselling Completed Call Schedule | Enquiry Call Status, Nature of Enquiry | Enquiry Count, Enquiry Lead Count |
| II. Application | Application, Fee, Student ID Card, Affiliation & Tie-Up Payment, Generate Roll No, Return Certificate, Exam Schedule, Exam Results, Student TC, Course Completion Certificate, Course Transfer, Student Promotion, Study Materials | — | 9 global |
| III. Employee | Employee CRUD, Employee Login | Department | — |
| IV. Accounts | Daily Transaction | Account Head, Bank Account | Day Book, Payment Receipt Summary |

Cross-cutting: dashboard, responsive web, roles (super admin/admin/staff),
export to PDF/Excel/Word, Email/SMS, bulk update.

**What the vendor gets right:** the Enquiry → Counselling → Admission funnel is
well thought out, and *Return Certificate* (custody of originals sent to the
university) and *Affiliation & Tie-Up Payment* (collected-from-students vs
owed-to-university) are real pain points that generic ERPs miss. This vendor
knows the affiliated-college market.

## Defects in the document

1. **The Employee module contradicts itself.** Its intro promises "track
   Salary Details, Work Schedule" — then lists only CRUD + Login + Department.
   No payroll, attendance, leave or scheduling screens exist in the scope.
2. **Accounts is dangerously thin.** One screen and two reports. No ledgers,
   trial balance, P&L, bank reconciliation, voucher audit trail or GST/TDS.
   Critically, **it never says whether fee collection posts to Accounts** —
   if not, the books never tie to the fee register. (Closed by ADR-003.)
3. **Branches appear once, in a dashboard bullet, with no Branch master and no
   scoping anywhere.** (Closed by ADR-002.)
4. **Duplicate and garbled entries.** Master #13 "Exam center" == #15
   "Examination Centre"; "Department" listed twice; "Syllabus and Study
   Material" has no description; "Upcoming **l**" truncated in three places.
   The three Counselling schedule screens are near-identical. (ADR-004.)
5. **Fees are one bullet.** Nothing on instalment plans, concessions,
   scholarships, late fines, partial payments, refunds, receipt numbering or
   reversals — the hardest part of any institute system. (Closed by ADR-005
   and the fee engine in §5 of the schema.)
6. **Exam Results "publishes" results** with no mark entry, grade
   configuration, pass rules or hall tickets.
7. **No permission matrix.** Three roles named "e.g.". (Closed by ADR-007.)
8. **Email/SMS unquantified.** No gateway, no templates, and — for India — no
   mention of DLT sender-ID/template registration, which takes weeks and must
   be done in the institute's own name.
9. **Zero non-functional requirements.** No concurrency, uptime, backup
   frequency/retention, RPO/RTO, data migration, audit logging or password
   policy. No mention of DPDP Act 2023 obligations despite holding minors' PII.
10. **Return Certificate — the biggest legal exposure — gets four lines.**
    Custody of students' originals needs acknowledgement receipts and a
    chain-of-custody audit trail. (Closed by `CertificateCustody` +
    `CertificateCustodyEvent`.)

## Not in the quoted scope

Student/parent portal · online payment gateway · student attendance ·
timetable · biometric · library · hostel · transport · mobile app (responsive
web only) · hall tickets · internal marks · alumni/placement · inventory ·
document storage policy.

## Commercial points to settle (from the missing pages)

- Obtain **pages 1–6**: price, timeline, milestones, warranty, AMC %,
  change-request rate, exclusions.
- **Training is one 2-hour session** for a ~55-screen system across
  admissions, counselling, accounts and exam staff, with travel billed
  separately. Unrealistic — negotiate role-wise sessions, recordings and a
  written manual.
- **Hosting charges "carried by the clients"** — clarify where it is hosted,
  whether the server/domain is in Bell Cell's own account, SSL, whether
  backups are included and restorable *by the institute*, and database access.
- **Data and IP ownership**: a written right to a full database export at any
  time and on termination.
- Ask for two live client references running the same module set, ideally
  multi-branch.

## Verdict

As a *baseline product*, a reasonable fit for an affiliated/tie-up education
centre. As a *requirements document*, not usable: generic, unproofread, silent
on fee logic and accounting integration, internally contradictory on Employee,
and missing the multi-branch support its own dashboard bullet implies.

Highest-priority clarifications are tracked in
[`open-questions.md`](open-questions.md).
