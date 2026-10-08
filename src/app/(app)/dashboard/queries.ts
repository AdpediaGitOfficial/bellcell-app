import 'server-only'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Percentage change, guarding the divide-by-zero that makes "Infinity%" tiles. */
export function pctChange(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined
  return ((current - previous) / previous) * 100
}

export async function getDashboardData(user: CurrentUser) {
  const scope = branchScope(user)
  const now = new Date()
  const monthStart = startOfMonth(now)
  const prevMonthStart = startOfMonth(addDays(monthStart, -1))
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  const windowStart = addDays(today, -29)

  const [
    activeStudents,
    admissionsThisMonth,
    admissionsPrevMonth,
    collectedThisMonth,
    collectedPrevMonth,
    overdue,
    funnelRaw,
    collectionRaw,
    todaysCalls,
    recentAdmissions,
  ] = await Promise.all([
    db.student.count({
      where: { ...scope, archivedAt: null, status: { in: ['ADMITTED', 'ACTIVE', 'PROMOTED'] } },
    }),

    db.student.count({
      where: { ...scope, archivedAt: null, admissionDate: { gte: monthStart } },
    }),
    db.student.count({
      where: {
        ...scope,
        archivedAt: null,
        admissionDate: { gte: prevMonthStart, lt: monthStart },
      },
    }),

    db.payment.aggregate({
      _sum: { amountPaise: true },
      where: { ...scope, status: 'COMPLETED', receiptDate: { gte: monthStart } },
    }),
    db.payment.aggregate({
      _sum: { amountPaise: true },
      where: {
        ...scope,
        status: 'COMPLETED',
        receiptDate: { gte: prevMonthStart, lt: monthStart },
      },
    }),

    // Outstanding on everything already past its due date.
    db.feeInstallment.aggregate({
      _sum: { duePaise: true, paidPaise: true, concessionPaise: true, lateFeePaise: true },
      where: {
        dueDate: { lt: today },
        status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
        student: { ...scope, archivedAt: null },
      },
    }),

    db.enquiry.groupBy({
      by: ['stage'],
      _count: { _all: true },
      where: { ...scope, archivedAt: null },
    }),

    db.payment.findMany({
      where: { ...scope, status: 'COMPLETED', receiptDate: { gte: windowStart } },
      select: { receiptDate: true, amountPaise: true },
    }),

    db.enquiry.findMany({
      where: {
        ...scope,
        archivedAt: null,
        stage: { notIn: ['CONVERTED', 'LOST'] },
        nextCallAt: { gte: today, lt: tomorrow },
      },
      orderBy: { nextCallAt: 'asc' },
      take: 6,
      select: {
        id: true,
        name: true,
        phone: true,
        nextCallAt: true,
        stage: true,
        course: { select: { name: true } },
      },
    }),

    db.student.findMany({
      where: { ...scope, archivedAt: null, admissionDate: { not: null } },
      orderBy: { admissionDate: 'desc' },
      take: 6,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        admissionDate: true,
        course: { select: { name: true } },
      },
    }),
  ])

  const overduePaise = Math.max(
    0,
    (overdue._sum.duePaise ?? 0) +
      (overdue._sum.lateFeePaise ?? 0) -
      (overdue._sum.concessionPaise ?? 0) -
      (overdue._sum.paidPaise ?? 0),
  )

  const stageCount = (stage: string) =>
    funnelRaw.find((r) => r.stage === stage)?._count._all ?? 0

  // The funnel is cumulative: every converted enquiry was also counselled.
  const converted = stageCount('CONVERTED')
  const counselled = stageCount('COUNSELLING_COMPLETED') + converted
  const scheduled = stageCount('COUNSELLING_SCHEDULED') + counselled
  const contacted = stageCount('CONTACTED') + scheduled
  const total = stageCount('NEW') + stageCount('LOST') + contacted

  const funnel = [
    { label: 'Total enquiries', value: total },
    { label: 'Contacted', value: contacted },
    { label: 'Counselling scheduled', value: scheduled },
    { label: 'Counselling completed', value: counselled },
    { label: 'Admitted', value: converted },
  ]

  // Bucket payments into 30 day-columns in JS; the row count here is small
  // and this keeps the query portable.
  const buckets = new Map<string, number>()
  for (let i = 0; i < 30; i += 1) {
    const d = addDays(windowStart, i)
    buckets.set(d.toISOString().slice(0, 10), 0)
  }
  for (const p of collectionRaw) {
    const key = startOfDay(p.receiptDate).toISOString().slice(0, 10)
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + p.amountPaise)
    }
  }
  const collection = [...buckets.entries()].map(([iso, paise]) => ({
    label: new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    }),
    collectedPaise: paise,
  }))

  const collectedNow = collectedThisMonth._sum.amountPaise ?? 0
  const collectedPrev = collectedPrevMonth._sum.amountPaise ?? 0

  return {
    activeStudents,
    admissionsThisMonth,
    admissionsDelta: pctChange(admissionsThisMonth, admissionsPrevMonth),
    collectedThisMonthPaise: collectedNow,
    collectedDelta: pctChange(collectedNow, collectedPrev),
    overduePaise,
    funnel,
    collection,
    todaysCalls,
    recentAdmissions,
  }
}
