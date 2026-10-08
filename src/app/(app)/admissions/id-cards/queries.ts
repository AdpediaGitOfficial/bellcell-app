import 'server-only'
import type { IdCardStatus, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'
import { skipTake, type TableParams } from '@/lib/table/params'

export const IDCARD_SORTS = ['student', 'status', 'requestedAt'] as const
export const IDCARD_FILTER_KEYS = ['status', 'courseId', 'batchId'] as const

export const IDCARD_LABELS: Record<IdCardStatus, string> = {
  REQUESTED: 'Requested',
  SENT_TO_AFFILIATION: 'Sent to university',
  RECEIVED: 'Received — not yet informed',
  STUDENT_NOTIFIED: 'Student informed',
  COLLECTED: 'Collected',
}

/**
 * The scope's sequence: request → arrives from the university → inform the
 * student → student collects it. Each step is one-way.
 */
export const IDCARD_NEXT: Record<IdCardStatus, IdCardStatus[]> = {
  REQUESTED: ['SENT_TO_AFFILIATION', 'RECEIVED'],
  SENT_TO_AFFILIATION: ['RECEIVED'],
  RECEIVED: ['STUDENT_NOTIFIED', 'COLLECTED'],
  STUDENT_NOTIFIED: ['COLLECTED'],
  COLLECTED: [],
}

export function buildIdCardWhere(
  user: CurrentUser,
  params: TableParams,
): Prisma.StudentIdCardWhereInput {
  const where: Prisma.StudentIdCardWhereInput = {
    student: { ...branchScope(user), archivedAt: null },
  }

  if (params.q) {
    where.student = {
      ...(where.student as object),
      OR: [
        { firstName: { contains: params.q, mode: 'insensitive' } },
        { lastName: { contains: params.q, mode: 'insensitive' } },
        { admissionNo: { contains: params.q, mode: 'insensitive' } },
        { applicationNo: { contains: params.q, mode: 'insensitive' } },
      ],
    }
  }

  const f = params.filters
  if (f.status) where.status = f.status as IdCardStatus
  if (f.courseId) where.student = { ...(where.student as object), courseId: f.courseId }
  if (f.batchId) where.student = { ...(where.student as object), batchId: f.batchId }

  return where
}

function orderBy(params: TableParams): Prisma.StudentIdCardOrderByWithRelationInput[] {
  const dir = params.dir
  switch (params.sort) {
    case 'student':
      return [{ student: { firstName: dir } }]
    case 'status':
      return [{ status: dir }]
    default:
      return [{ requestedAt: dir }]
  }
}

export const idCardSelect = {
  id: true,
  cardNumber: true,
  status: true,
  requestedAt: true,
  receivedAt: true,
  notifiedAt: true,
  collectedAt: true,
  validUpto: true,
  remarks: true,
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      applicationNo: true,
      admissionNo: true,
      phone: true,
      email: true,
      course: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
      branch: { select: { name: true } },
    },
  },
} satisfies Prisma.StudentIdCardSelect

export type IdCardRow = Prisma.StudentIdCardGetPayload<{ select: typeof idCardSelect }>

export async function listIdCards(
  user: CurrentUser,
  params: TableParams,
): Promise<{ rows: IdCardRow[]; total: number }> {
  const where = buildIdCardWhere(user, params)
  const { skip, take } = skipTake(params)
  const [rows, total] = await Promise.all([
    db.studentIdCard.findMany({
      where,
      select: idCardSelect,
      orderBy: orderBy(params),
      skip,
      take,
    }),
    db.studentIdCard.count({ where }),
  ])
  return { rows, total }
}

export async function idCardSummary(user: CurrentUser) {
  const scope = { student: { ...branchScope(user), archivedAt: null } }
  const [requested, sent, received, notified, collected] = await Promise.all([
    db.studentIdCard.count({ where: { ...scope, status: 'REQUESTED' } }),
    db.studentIdCard.count({ where: { ...scope, status: 'SENT_TO_AFFILIATION' } }),
    db.studentIdCard.count({ where: { ...scope, status: 'RECEIVED' } }),
    db.studentIdCard.count({ where: { ...scope, status: 'STUDENT_NOTIFIED' } }),
    db.studentIdCard.count({ where: { ...scope, status: 'COLLECTED' } }),
  ])
  return { requested, sent, received, notified, collected, awaiting: received + notified }
}

/** Students with no ID card record yet — the queue to raise requests from. */
export async function studentsWithoutCards(user: CurrentUser, limit = 200) {
  return db.student.findMany({
    where: {
      ...branchScope(user),
      archivedAt: null,
      status: { in: ['ADMITTED', 'ACTIVE', 'PROMOTED'] },
      idCards: { none: {} },
    },
    orderBy: [{ firstName: 'asc' }],
    take: limit,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      applicationNo: true,
      admissionNo: true,
      course: { select: { name: true } },
    },
  })
}
