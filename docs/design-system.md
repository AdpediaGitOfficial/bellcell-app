# Bell Cell EduSuite — Design System

Status: proposed, awaiting sign-off.
Reference supplied by client: `docs/reference-dashboard.webp`.
Logo: `public/brand/bellcell-logo.png`.

---

## 1. The pattern: **Console shell + Document workspace**

The supplied reference is a *soft SaaS admin dashboard* — fixed icon+label
sidebar, pill search bar, 4-up KPI row with pastel icon tiles and sparklines,
2-up chart row, 3-up list/action row. It is a good look and we keep it.

But it is a **dashboard template, not an ERP shell**. Roughly 90% of Bell Cell's
~55 screens are dense master/list/detail tables and long multi-tab forms
(Application alone carries Personal / Fee / Family / Education sections). The
reference shows **no tables and no forms at all**. Adopting it as-is would leave
the hard 90% undesigned.

So the system has **two modes sharing one shell**:

| Mode | Used by | Character |
|---|---|---|
| **Console** | Dashboard, the 13 reports | The reference's look — airy, KPI tiles, charts, activity lists. Read-only, scan-first. |
| **Workspace** | Every master, list, record and form (~50 screens) | Dense, keyboard-first, table-led. Information-first, decoration-last. |

One sidebar, one topbar, one type scale, one colour system across both. Only
density and content rhythm change.

---

## 2. Information architecture

The reference's nav (Students, Teachers, Classes, Attendance, Timetable,
Library, Transport) is a **K-12 school**. Bell Cell's actual scope is an
institute/admissions ERP. Notably the reference has **no lead/enquiry funnel at
all** — which is Bell Cell's first module and its revenue engine.

Proposed sidebar, grouped, mapped to the signed scope:

```
  Dashboard

  ENQUIRY
    Leads                     (bulk import + follow-up)
    Enquiries
    Call Schedule             (pending / upcoming)
    Counselling               (one screen, stage filter — see ADR-004)

  ADMISSIONS
    Applications
    Fee Collection
    ID Cards
    Roll Numbers
    Certificates (custody)    ← "Return Certificate"
    Study Materials

  EXAMINATIONS
    Exam Schedule
    Results
    Certificates issued       (TC, course completion)

  ACCOUNTS
    Daily Transactions
    Affiliation Payments
    Day Book

  PEOPLE
    Employees

  REPORTS                     (all 13, one index with filter chips)

  MASTERS                     (19 masters, one index — not 19 nav items)
  SETTINGS                    (users, roles, branches, templates)
```

Two rules that keep the sidebar from becoming a 55-item list:
- **Masters and Reports each get ONE nav entry** leading to a searchable index
  page of cards. Masters are visited rarely; they must not outweigh daily work.
- Max 2 levels. No flyout menus — they are unusable on tablets, which is what
  front-desk counselling staff will use.

---

## 3. Colour

### 3.1 Brand

| Token | Value | Use |
|---|---|---|
| `brand-500` | `#00A59F` | Accents, active nav, borders, icons, focus ring, large display text |
| `brand-700` | `#007C77` | **Filled buttons / anything with small white text** |
| charcoal | `#282828` | Logo lockup wordmark, strongest headings |

> ⚠ **Contrast rule — non-negotiable.**
> White on `#00A59F` = **3.05:1**, which FAILS WCAG AA for normal text.
> White on `#007C77` = **5.07:1**, which passes.
> Therefore brand-500 is never a background for small white text. Filled
> buttons use brand-700. This is enforced by the `Button` component — there is
> no `variant="brand500-filled"`.

> ⚠ **Logo colour mismatch — needs a decision.**
> The supplied logo file is `#16A6A2`. The stated brand colour is `#00A59F`.
> They are one perceptual step apart but will read as a seam where the logo
> sits against brand chrome in the sidebar. Pick one and re-export the other.
> Current code assumes `#00A59F`.

### 3.2 Chart palette — validated, do not substitute by eye

Generated and checked with the palette validator (lightness band, chroma floor,
CVD separation across all pairs, normal-vision floor, contrast vs surface).

**Light mode — all six checks PASS:**

| Slot | Hex | Typical series |
|---|---|---|
| 1 | `#00958F` | Primary / current period |
| 2 | `#7C3AED` | Comparison / previous period |
| 3 | `#C2850D` | Third series |
| 4 | `#BE123C` | Fourth series |

**Dark mode — all six checks PASS (re-stepped, not flipped):**

`#0FA9A2` · `#8B5CF6` · `#C2850D` · `#E11D48`

**Hard limit: four categorical hues.** Because the brand *is* teal, blue and
green are both unusable as categorical slots — teal↔sky measured ΔE 11.6 for
normal vision, teal↔lime 15.1, and amber↔lime 4.9 under protanopia. A 5th
category folds into **“Other”**, or the chart becomes small multiples.

**Two flaws in the reference's own chart colours, which we do not copy:**
1. Its donut pairs teal with pink. Measured **ΔE 3.1 under deuteranopia** — the
   two slices are indistinguishable to roughly 8% of men. 
2. Its donut encodes *ordered* data (Excellent → Good → Average → Needs
   Attention) with *categorical* hues, half of which are two steps of the same
   teal. Ordered data takes a **single-hue sequential ramp** (`brand-200`
   → `brand-800`), not a hue salad.

### 3.3 Status — reserved, never reused as a series colour

`positive #059669` · `caution #D97706` · `critical #DC2626` · `info #2563EB`

Always paired with an icon and a text label, never colour alone. These matter:
fee overdue, certificate not returned, result withheld.

---

## 4. Type, space, shape

| | |
|---|---|
| **Family** | System UI stack (zero webfont latency; renders Malayalam/Tamil names correctly) |
| **Scale** | 11 / 12 / 14 / 16 / 20 / 24 / 32 — 14px is the workspace body size |
| **Numerals** | `font-variant-numeric: tabular-nums` on **every** money, count and date column |
| **Space** | 4px base; 24px page gutter; 16px card padding (workspace) / 24px (console) |
| **Radius** | 8px controls · 14px cards · 9999px pills+search |
| **Elevation** | Two levels only: `shadow-card` resting, `shadow-popover` for menus/modals. No shadow on table rows. |

---

## 5. Component inventory

Twenty components cover all ~55 screens. Build these once:

**Shell** — `Sidebar`, `Topbar`, `BranchSwitcher`, `UserMenu`, `PageHeader`, `Breadcrumb`

**Data** — `DataTable`, `FilterBar`, `Pagination`, `ExportMenu`, `StatusBadge`, `EmptyState`, `StatTile`, `Chart`

**Input** — `Button`, `Field` (label+control+error+hint), `Select`, `DatePicker`, `MoneyInput`, `FormSection`, `StickyActionBar`

**Feedback** — `Toast`, `ConfirmDialog`, `PermissionGate`

### 5.1 `DataTable` — the single most important component

The reference offers no guidance here, yet it carries 90% of the product.

- Sticky header; **sticky first column** (student name) on horizontal scroll.
- Right-aligned, tabular-figure money columns. Left-aligned text. Centred status.
- Row height 44px comfortable / 36px compact (**density toggle, persisted per
  user** — admissions staff doing bulk entry will live in compact).
- Zebra striping **off**; 1px `border-base` row separators instead. Striping
  fights the status badges.
- Selection checkboxes only where a bulk action genuinely exists (lead
  assignment, fee reminders) — not everywhere.
- Every table ships: column sort, a `FilterBar` above it, server-side
  pagination, and an `ExportMenu`. The scope demands PDF/Excel/Word export on
  "most reports" — so export is a table-level primitive, not a per-report build.
- Empty state is never a blank box: icon + one line of cause + the primary
  action ("No leads match these filters — Clear filters / Import leads").

### 5.2 Record pages

Application/Student is a long record. Pattern: **tabbed record page**, tabs
`Personal · Education · Family · Fees · Documents · Timeline`, with:
- a **sticky summary rail** (photo, name, admission no, course, status, dues) so
  the identity never scrolls away,
- a **sticky bottom action bar** with Save/Cancel + unsaved-changes guard,
- a **Timeline tab** fed by the audit log — who changed what, when. This is the
  answer to every "who marked this fee paid?" dispute.

### 5.3 Console (dashboard) composition

Keep the reference's rhythm, with the content corrected to Bell Cell's reality:

- **Row 1 — KPI tiles (4):** Active Students · Admissions This Month ·
  Fee Collected (MTD) · **Fee Overdue**. The last one is the number that
  actually runs an institute, and the reference has no equivalent.
- **Row 2 — Enquiry funnel (wide) + Fee collection vs target (narrow).** The
  funnel is the single most valuable chart Bell Cell can have and is absent
  from the reference entirely.
- **Row 3 — Today's follow-up calls · Recent admissions · Quick actions.**

Each KPI tile: pastel icon tile, label, big tabular number, delta with
direction + explicit comparison window ("vs last month"), optional sparkline.
**Never a delta without its comparison window** — "+12.4%" alone is unreadable.

---

## 6. Non-negotiable states

Every screen defines all five: **loading** (skeleton matching final layout, not
a spinner) · **empty** · **error** (with retry) · **permission-denied** (the
RBAC matrix will hide/disable a lot) · **success**.

---

## 7. Print

Receipts, ID cards, TCs, course-completion certificates and the Day Book are
printed. `@media print` is already in `globals.css`: `.no-print` strips chrome,
backgrounds go white. Receipts must print on A5 and plain A4.

---

## 8. Responsive

The scope promises responsive. Realistically:
- **≥1280px** — full shell. Where admissions/accounts staff work.
- **768–1279px** — sidebar collapses to 72px icons. Tablet, counselling desk.
- **<768px** — tables become stacked cards; data entry is intentionally
  de-scoped. Nobody admits a student on a phone.
