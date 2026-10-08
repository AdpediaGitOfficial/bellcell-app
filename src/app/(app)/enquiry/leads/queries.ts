import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'
import { skipTake, type TableParams } from '@/lib/table/params'

export const LEAD_SORTS = [
  'name',
  'createdAt',
  'nextCallAt',
  'callCount',
] as const

export const LEAD_FILTER_KEYS = [
  'sourceId',
  'callStatusId',
  'courseId',
  'assignedToId',
  'due',
] as const

function startOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * The single source of truth for which leads a request may see.
 *
 * Used by the list page AND the export route, so an export can never return
 * rows the on-screen table would have filtered out — including the branch
 * scope, which is spread in here and nowhere else.
 */
export function buildLeadWhere(
  user: CurrentUser,
  params: TableParams,
): Prisma.EnquiryLeadWhereInput {
  const where: Prisma.EnquiryLeadWhereInput = {
    ...branchScope(user),
    archivedAt: null,
    convertedEnquiryId: null, // converted leads live on the Enquiries screen
  }

  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { phone: { contains: params.q } },
      { email: { contains: params.q, mode: 'insensitive' } },
    ]
  }

  const f = params.filters
  if (f.sourceId) where.sourceId = f.sourceId
  if (f.callStatusId) where.callStatusId = f.callStatusId
  if (f.courseId) where.courseId = f.courseId
  if (f.assignedToId) where.assignedToId = f.assignedToId

  const today = startOfDay()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  switch (f.due) {
    case 'overdue':
      where.nextCallAt = { lt: today }
      break
    case 'today':
      where.nextCallAt = { gte: today, lt: tomorrow }
      break
    case 'upcoming':
      where.nextCallAt = { gte: tomorrow }
      break
    case 'unscheduled':
      where.nextCallAt = null
      break
  }

  return where
}

function orderBy(params: TableParams): Prisma.EnquiryLeadOrderByWithRelationInput {
  const dir = params.dir
  switch (params.sort) {
    case 'name':
      return { name: dir }
    case 'nextCallAt':
      // Leads with no call scheduled sort last either way.
      return { nextCallAt: { sort: dir, nulls: 'last' } }
    case 'callCount':
      return { callCount: dir }
    default:
      return { createdAt: dir }
  }
}

export const leadSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  city: true,
  callCount: true,
  nextCallAt: true,
  lastCalledAt: true,
  createdAt: true,
  course: { select: { id: true, name: true } },
  source: { select: { id: true, name: true } },
  callStatus: { select: { id: true, name: true, isTerminal: true } },
  assignedTo: { select: { id: true, fullName: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.EnquiryLeadSelect

export type LeadRow = Prisma.EnquiryLeadGetPayload<{ select: typeof leadSelect }>

export async function listLeads(
  user: CurrentUser,
  params: TableParams,
): Promise<{ rows: LeadRow[]; total: number }> {
  const where = buildLeadWhere(user, params)
  const { skip, take } = skipTake(params)

  const [rows, total] = await Promise.all([
    db.enquiryLead.findMany({
      where,
      select: leadSelect,
      orderBy: orderBy(params),
      skip,
      take,
    }),
    db.enquiryLead.count({ where }),
  ])

  return { rows, total }
}

/** Unpaginated, for export. Capped so a stray click cannot exhaust memory. */
export const EXPORT_ROW_CAP = 20_000

export async function listLeadsForExport(
  user: CurrentUser,
  params: TableParams,
): Promise<LeadRow[]> {
  return db.enquiryLead.findMany({
    where: buildLeadWhere(user, params),
    select: leadSelect,
    orderBy: orderBy(params),
    take: EXPORT_ROW_CAP,
  })
}

export async function leadFilterOptions(user: CurrentUser) {
  const [sources, statuses, courses, counsellors] = await Promise.all([
    db.enquirySource.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.enquiryCallStatus.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, requiresFollowUp: true, isTerminal: true },
    }),
    db.course.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      where: {
        isActive: true,
        role: { in: ['COUNSELLOR', 'ADMIN', 'STAFF', 'SUPER_ADMIN'] },
        ...(user.role === 'SUPER_ADMIN'
          ? {}
          : { branches: { some: { branchId: user.activeBranchId ?? '__none__' } } }),
      },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true },
    }),
  ])

  return { sources, statuses, courses, counsellors }
}

/** Counts for the summary strip above the table. */
export async function leadSummary(user: CurrentUser) {
  const scope = { ...branchScope(user), archivedAt: null, convertedEnquiryId: null }
  const today = startOfDay()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [total, overdue, dueToday, unscheduled] = await Promise.all([
    db.enquiryLead.count({ where: scope }),
    db.enquiryLead.count({ where: { ...scope, nextCallAt: { lt: today } } }),
    db.enquiryLead.count({
      where: { ...scope, nextCallAt: { gte: today, lt: tomorrow } },
    }),
    db.enquiryLead.count({ where: { ...scope, nextCallAt: null } }),
  ])

  return { total, overdue, dueToday, unscheduled }
}
