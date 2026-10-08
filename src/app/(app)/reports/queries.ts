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

// ---------------------------------------------------------------------------
// Application-module reports
// ---------------------------------------------------------------------------

export interface StudentSummaryRow {
  key: string
  label: string
  total: number
  active: number
  completed: number
  dropped: number
}

/** "Students Summary" — headcount by course, batch, status or branch. */
export async function studentsSummaryReport(
  user: CurrentUser,
  range: ReportRange,
  groupBy: 'course' | 'batch' | 'branch' | 'classMode',
): Promise<StudentSummaryRow[]> {
  const rows = await db.student.findMany({
    where: {
      ...branchScope(user),
      archivedAt: null,
      createdAt: { gte: range.from, lte: range.to },
    },
    select: {
      status: true,
      course: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      classMode: { select: { id: true, name: true } },
    },
  })

  const buckets = new Map<string, StudentSummaryRow>()

  for (const r of rows) {
    const dim =
      groupBy === 'course'
        ? { id: r.course.id, label: r.course.name }
        : groupBy === 'batch'
          ? { id: r.batch.id, label: r.batch.name }
          : groupBy === 'classMode'
            ? { id: r.classMode?.id ?? '—', label: r.classMode?.name ?? 'Not specified' }
            : { id: r.branch.id, label: r.branch.name }

    const row =
      buckets.get(dim.id) ??
      { key: dim.id, label: dim.label, total: 0, active: 0, completed: 0, dropped: 0 }

    row.total += 1
    if (['ADMITTED', 'ACTIVE', 'PROMOTED'].includes(r.status)) row.active += 1
    else if (r.status === 'COMPLETED') row.completed += 1
    else if (['DROPPED', 'CANCELLED', 'TRANSFERRED'].includes(r.status)) row.dropped += 1

    buckets.set(dim.id, row)
  }

  return [...buckets.values()].sort((a, b) => b.total - a.total)
}

export interface MoneyRow {
  key: string
  label: string
  count: number
  amountPaise: number
}

/**
 * "Fee collection summary" — what was actually received in the period,
 * read from completed payments. Cancelled and bounced receipts are excluded,
 * which is the number that should tie to the Day Book.
 */
export async function feeCollectionReport(
  user: CurrentUser,
  range: ReportRange,
  groupBy: 'mode' | 'course' | 'branch' | 'collector' | 'day',
): Promise<MoneyRow[]> {
  const rows = await db.payment.findMany({
    where: {
      ...branchScope(user),
      status: 'COMPLETED',
      receiptDate: { gte: range.from, lte: range.to },
    },
    select: {
      amountPaise: true,
      mode: true,
      receiptDate: true,
      branch: { select: { id: true, name: true } },
      collectedBy: { select: { id: true, fullName: true } },
      student: { select: { course: { select: { id: true, name: true } } } },
    },
  })

  const buckets = new Map<string, MoneyRow>()

  for (const r of rows) {
    const dim =
      groupBy === 'mode'
        ? { id: r.mode, label: r.mode.replace('_', ' ') }
        : groupBy === 'course'
          ? { id: r.student.course.id, label: r.student.course.name }
          : groupBy === 'collector'
            ? { id: r.collectedBy?.id ?? '—', label: r.collectedBy?.fullName ?? 'Unknown' }
            : groupBy === 'day'
              ? {
                  id: r.receiptDate.toISOString().slice(0, 10),
                  label: r.receiptDate.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }),
                }
              : { id: r.branch.id, label: r.branch.name }

    const row = buckets.get(dim.id) ?? { key: dim.id, label: dim.label, count: 0, amountPaise: 0 }
    row.count += 1
    row.amountPaise += r.amountPaise
    buckets.set(dim.id, row)
  }

  const out = [...buckets.values()]
  return groupBy === 'day'
    ? out.sort((a, b) => a.key.localeCompare(b.key))
    : out.sort((a, b) => b.amountPaise - a.amountPaise)
}

export interface StudentFeeRow {
  studentId: string
  name: string
  admissionNo: string
  course: string
  batch: string
  duePaise: number
  concessionPaise: number
  paidPaise: number
  outstandingPaise: number
  overdue: boolean
}

/**
 * "Students fee summary" — the per-student ledger the office chases from.
 * Ignores the date range: an outstanding balance is a present-tense fact.
 */
export async function studentFeeReport(
  user: CurrentUser,
  onlyOutstanding: boolean,
): Promise<StudentFeeRow[]> {
  const students = await db.student.findMany({
    where: {
      ...branchScope(user),
      archivedAt: null,
      ...(onlyOutstanding
        ? { installments: { some: { status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } } } }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      applicationNo: true,
      admissionNo: true,
      course: { select: { name: true } },
      batch: { select: { name: true } },
      installments: {
        select: {
          duePaise: true,
          concessionPaise: true,
          lateFeePaise: true,
          paidPaise: true,
          status: true,
        },
      },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 5000,
  })

  return students.map((s) => {
    let due = 0
    let concession = 0
    let paid = 0
    let outstanding = 0
    let overdue = false

    for (const i of s.installments) {
      due += i.duePaise + i.lateFeePaise
      concession += i.concessionPaise
      paid += i.paidPaise
      const bal = Math.max(
        0,
        i.duePaise + i.lateFeePaise - i.concessionPaise - i.paidPaise,
      )
      outstanding += bal
      if (bal > 0 && i.status === 'OVERDUE') overdue = true
    }

    return {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName ?? ''}`.trim(),
      admissionNo: s.admissionNo ?? s.applicationNo,
      course: s.course.name,
      batch: s.batch.name,
      duePaise: due,
      concessionPaise: concession,
      paidPaise: paid,
      outstandingPaise: outstanding,
      overdue,
    }
  })
}
