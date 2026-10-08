import 'server-only'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'
import type { SearchParams } from '@/lib/table/params'

export interface ReportRange {
  from: Date
  to: Date
  fromISO: string
  toISO: string
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Default window: this month to date. */
export function parseRange(sp: SearchParams): ReportRange {
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)

  const rawFrom = typeof sp.from === 'string' ? sp.from : ''
  const rawTo = typeof sp.to === 'string' ? sp.to : ''

  const from = rawFrom && !Number.isNaN(Date.parse(rawFrom))
    ? new Date(`${rawFrom}T00:00:00`)
    : defaultFrom
  const to = rawTo && !Number.isNaN(Date.parse(rawTo))
    ? new Date(`${rawTo}T23:59:59.999`)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  return { from, to, fromISO: iso(from), toISO: iso(to) }
}

export interface CountRow {
  key: string
  label: string
  total: number
  /** Stage breakdown, only meaningful for the enquiry report. */
  converted?: number
  lost?: number
  open?: number
}

/**
 * "Enquiry Count — total no of lead report in enquiry in call management
 * sorted by employee name and other" (vendor scope). Grouped by the dimension
 * the user picks, since "and other" in the quotation is doing a lot of work.
 */
export async function enquiryCountReport(
  user: CurrentUser,
  range: ReportRange,
  groupBy: 'counsellor' | 'source' | 'course' | 'branch',
): Promise<CountRow[]> {
  const where = {
    ...branchScope(user),
    archivedAt: null,
    createdAt: { gte: range.from, lte: range.to },
  }

  const rows = await db.enquiry.findMany({
    where,
    select: {
      stage: true,
      assignedTo: { select: { id: true, fullName: true } },
      source: { select: { id: true, name: true } },
      course: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  })

  const buckets = new Map<string, CountRow>()

  for (const r of rows) {
    const dim =
      groupBy === 'counsellor'
        ? { id: r.assignedTo?.id ?? '—', label: r.assignedTo?.fullName ?? 'Unassigned' }
        : groupBy === 'source'
          ? { id: r.source?.id ?? '—', label: r.source?.name ?? 'Not specified' }
          : groupBy === 'course'
            ? { id: r.course?.id ?? '—', label: r.course?.name ?? 'Not specified' }
            : { id: r.branch.id, label: r.branch.name }

    const row =
      buckets.get(dim.id) ??
      { key: dim.id, label: dim.label, total: 0, converted: 0, lost: 0, open: 0 }

    row.total += 1
    if (r.stage === 'CONVERTED') row.converted = (row.converted ?? 0) + 1
    else if (r.stage === 'LOST') row.lost = (row.lost ?? 0) + 1
    else row.open = (row.open ?? 0) + 1

    buckets.set(dim.id, row)
  }

  return [...buckets.values()].sort((a, b) => b.total - a.total)
}

/** "Enquiry Lead Count" — the same, over raw leads. */
export async function leadCountReport(
  user: CurrentUser,
  range: ReportRange,
  groupBy: 'counsellor' | 'source' | 'course' | 'branch',
): Promise<CountRow[]> {
  const rows = await db.enquiryLead.findMany({
    where: {
      ...branchScope(user),
      archivedAt: null,
      createdAt: { gte: range.from, lte: range.to },
    },
    select: {
      convertedEnquiryId: true,
      assignedTo: { select: { id: true, fullName: true } },
      source: { select: { id: true, name: true } },
      course: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  })

  const buckets = new Map<string, CountRow>()

  for (const r of rows) {
    const dim =
      groupBy === 'counsellor'
        ? { id: r.assignedTo?.id ?? '—', label: r.assignedTo?.fullName ?? 'Unassigned' }
        : groupBy === 'source'
          ? { id: r.source?.id ?? '—', label: r.source?.name ?? 'Not specified' }
          : groupBy === 'course'
            ? { id: r.course?.id ?? '—', label: r.course?.name ?? 'Not specified' }
            : { id: r.branch.id, label: r.branch.name }

    const row =
      buckets.get(dim.id) ?? { key: dim.id, label: dim.label, total: 0, converted: 0 }

    row.total += 1
    if (r.convertedEnquiryId) row.converted = (row.converted ?? 0) + 1

    buckets.set(dim.id, row)
  }

  return [...buckets.values()].sort((a, b) => b.total - a.total)
}
