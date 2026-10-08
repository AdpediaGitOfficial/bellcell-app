import 'server-only'
import type { EnquiryStage, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'
import { skipTake, type TableParams } from '@/lib/table/params'

export const ENQUIRY_SORTS = [
  'name',
  'enquiryNo',
  'createdAt',
  'nextCallAt',
  'stage',
  'callCount',
] as const

export const ENQUIRY_FILTER_KEYS = [
  'stage',
  'sourceId',
  'callStatusId',
  'courseId',
  'assignedToId',
  'due',
] as const

export const STAGE_LABELS: Record<EnquiryStage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  COUNSELLING_SCHEDULED: 'Counselling scheduled',
  COUNSELLING_COMPLETED: 'Counselling completed',
  CONVERTED: 'Admitted',
  LOST: 'Lost',
}

export const OPEN_STAGES: EnquiryStage[] = [
  'NEW',
  'CONTACTED',
  'COUNSELLING_SCHEDULED',
  'COUNSELLING_COMPLETED',
]

function startOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Shared by the Enquiries, Call Schedule and Counselling screens.
 *
 * Those three are one query with different preset stage/due filters — see
 * ADR-004, where the vendor's three near-identical screens collapse into one
 * implementation.
 */
export function buildEnquiryWhere(
  user: CurrentUser,
  params: TableParams,
  preset: { stages?: EnquiryStage[]; dueOnly?: boolean } = {},
): Prisma.EnquiryWhereInput {
  const where: Prisma.EnquiryWhereInput = {
    ...branchScope(user),
    archivedAt: null,
  }

  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { phone: { contains: params.q } },
      { email: { contains: params.q, mode: 'insensitive' } },
      { enquiryNo: { contains: params.q, mode: 'insensitive' } },
    ]
  }

  const f = params.filters
  const stageFilter = f.stage as EnquiryStage | undefined

  if (stageFilter) {
    // A user-chosen stage must stay inside the screen's preset, so the
    // Counselling screen can never be filtered into showing lost enquiries.
    where.stage =
      preset.stages && !preset.stages.includes(stageFilter)
        ? { in: preset.stages }
        : stageFilter
  } else if (preset.stages) {
    where.stage = { in: preset.stages }
  }

  if (f.sourceId) where.sourceId = f.sourceId
  if (f.callStatusId) where.callStatusId = f.callStatusId
  if (f.courseId) where.courseId = f.courseId
  if (f.assignedToId) where.assignedToId = f.assignedToId

  const today = startOfDay()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const due = f.due ?? (preset.dueOnly ? 'pending' : undefined)
  switch (due) {
    case 'overdue':
      where.nextCallAt = { lt: today }
      break
    case 'today':
      where.nextCallAt = { gte: today, lt: tomorrow }
      break
    case 'upcoming':
      where.nextCallAt = { gte: tomorrow }
      break
    case 'pending':
      // Everything already due or due today — the Call Schedule default.
      where.nextCallAt = { lt: tomorrow }
      break
    case 'unscheduled':
      where.nextCallAt = null
      break
  }

  return where
}

function orderBy(params: TableParams): Prisma.EnquiryOrderByWithRelationInput {
  const dir = params.dir
  switch (params.sort) {
    case 'name':
      return { name: dir }
    case 'enquiryNo':
      return { enquiryNo: dir }
    case 'stage':
      return { stage: dir }
    case 'callCount':
      return { callCount: dir }
    case 'nextCallAt':
      return { nextCallAt: { sort: dir, nulls: 'last' } }
    default:
      return { createdAt: dir }
  }
}

export const enquirySelect = {
  id: true,
  enquiryNo: true,
  name: true,
  phone: true,
  email: true,
  city: true,
  stage: true,
  callCount: true,
  nextCallAt: true,
  lastCalledAt: true,
  counsellingScheduledAt: true,
  counsellingCompletedAt: true,
  createdAt: true,
  studentId: true,
  course: { select: { id: true, name: true } },
  source: { select: { id: true, name: true } },
  callStatus: { select: { id: true, name: true, isTerminal: true } },
  assignedTo: { select: { id: true, fullName: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.EnquirySelect

export type EnquiryRow = Prisma.EnquiryGetPayload<{ select: typeof enquirySelect }>

export async function listEnquiries(
  user: CurrentUser,
  params: TableParams,
  preset?: { stages?: EnquiryStage[]; dueOnly?: boolean },
): Promise<{ rows: EnquiryRow[]; total: number }> {
  const where = buildEnquiryWhere(user, params, preset)
  const { skip, take } = skipTake(params)

  const [rows, total] = await Promise.all([
    db.enquiry.findMany({
      where,
      select: enquirySelect,
      orderBy: orderBy(params),
      skip,
      take,
    }),
    db.enquiry.count({ where }),
  ])

  return { rows, total }
}

export async function listEnquiriesForExport(
  user: CurrentUser,
  params: TableParams,
  preset?: { stages?: EnquiryStage[]; dueOnly?: boolean },
): Promise<EnquiryRow[]> {
  return db.enquiry.findMany({
    where: buildEnquiryWhere(user, params, preset),
    select: enquirySelect,
    orderBy: orderBy(params),
    take: 20_000,
  })
}

/** Funnel counts for the summary strip. */
export async function enquirySummary(user: CurrentUser) {
  const scope = { ...branchScope(user), archivedAt: null }
  const today = startOfDay()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [byStage, overdue, dueToday] = await Promise.all([
    db.enquiry.groupBy({
      by: ['stage'],
      _count: { _all: true },
      where: scope,
    }),
    db.enquiry.count({
      where: { ...scope, stage: { in: OPEN_STAGES }, nextCallAt: { lt: today } },
    }),
    db.enquiry.count({
      where: {
        ...scope,
        stage: { in: OPEN_STAGES },
        nextCallAt: { gte: today, lt: tomorrow },
      },
    }),
  ])

  const count = (s: EnquiryStage) =>
    byStage.find((r) => r.stage === s)?._count._all ?? 0

  return {
    total: byStage.reduce((sum, r) => sum + r._count._all, 0),
    open: OPEN_STAGES.reduce((sum, s) => sum + count(s), 0),
    converted: count('CONVERTED'),
    lost: count('LOST'),
    overdue,
    dueToday,
  }
}
