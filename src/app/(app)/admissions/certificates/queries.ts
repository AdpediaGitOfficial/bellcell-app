import 'server-only'
import type { CustodyStatus, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'
import { skipTake, type TableParams } from '@/lib/table/params'

export const CUSTODY_SORTS = ['student', 'status', 'collectedAt', 'sentAt'] as const
export const CUSTODY_FILTER_KEYS = [
  'status',
  'certificateTypeId',
  'affiliationBodyId',
  'courseId',
] as const

export const CUSTODY_LABELS: Record<CustodyStatus, string> = {
  WITH_INSTITUTE: 'Held by institute',
  SENT_FOR_VERIFICATION: 'Sent to university',
  RETURNED_FROM_AFFILIATION: 'Back from university',
  RETURNED_TO_STUDENT: 'Returned to student',
  LOST: 'Lost',
}

/** Statuses where the institute is physically responsible for the document. */
export const IN_OUR_HANDS: CustodyStatus[] = [
  'WITH_INSTITUTE',
  'SENT_FOR_VERIFICATION',
  'RETURNED_FROM_AFFILIATION',
]

/**
 * Which transitions are legal from each status.
 *
 * Encoded here rather than left to the UI, so a crafted form post cannot
 * move a document straight from "sent to university" to "returned to
 * student" without it ever coming back.
 */
export const ALLOWED_TRANSITIONS: Record<CustodyStatus, CustodyStatus[]> = {
  WITH_INSTITUTE: ['SENT_FOR_VERIFICATION', 'RETURNED_TO_STUDENT', 'LOST'],
  SENT_FOR_VERIFICATION: ['RETURNED_FROM_AFFILIATION', 'LOST'],
  RETURNED_FROM_AFFILIATION: ['RETURNED_TO_STUDENT', 'SENT_FOR_VERIFICATION', 'LOST'],
  // Terminal: once the student has it back, or it is written off, the chain
  // ends. A mistake is corrected by opening a new custody record.
  RETURNED_TO_STUDENT: [],
  LOST: [],
}

export function buildCustodyWhere(
  user: CurrentUser,
  params: TableParams,
): Prisma.CertificateCustodyWhereInput {
  const where: Prisma.CertificateCustodyWhereInput = {
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
  if (f.status) where.status = f.status as CustodyStatus
  if (f.certificateTypeId) where.certificateTypeId = f.certificateTypeId
  if (f.affiliationBodyId) where.affiliationBodyId = f.affiliationBodyId
  if (f.courseId) {
    where.student = { ...(where.student as object), courseId: f.courseId }
  }

  return where
}

function orderBy(
  params: TableParams,
): Prisma.CertificateCustodyOrderByWithRelationInput[] {
  const dir = params.dir
  switch (params.sort) {
    case 'student':
      return [{ student: { firstName: dir } }]
    case 'status':
      return [{ status: dir }]
    case 'sentAt':
      return [{ sentAt: { sort: dir, nulls: 'last' } }]
    default:
      return [{ collectedAt: { sort: dir, nulls: 'last' } }]
  }
}

export const custodySelect = {
  id: true,
  status: true,
  collectedAt: true,
  sentAt: true,
  returnedAt: true,
  handedBackAt: true,
  remarks: true,
  certificateType: { select: { id: true, name: true } },
  affiliationBody: { select: { id: true, name: true } },
  studentEducation: { select: { qualification: true } },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      applicationNo: true,
      admissionNo: true,
      phone: true,
      course: { select: { id: true, name: true } },
      branch: { select: { name: true } },
    },
  },
} satisfies Prisma.CertificateCustodySelect

export type CustodyRow = Prisma.CertificateCustodyGetPayload<{
  select: typeof custodySelect
}>

export async function listCustody(
  user: CurrentUser,
  params: TableParams,
): Promise<{ rows: CustodyRow[]; total: number }> {
  const where = buildCustodyWhere(user, params)
  const { skip, take } = skipTake(params)

  const [rows, total] = await Promise.all([
    db.certificateCustody.findMany({
      where,
      select: custodySelect,
      orderBy: orderBy(params),
      skip,
      take,
    }),
    db.certificateCustody.count({ where }),
  ])
  return { rows, total }
}

export async function listCustodyForExport(
  user: CurrentUser,
  params: TableParams,
): Promise<CustodyRow[]> {
  return db.certificateCustody.findMany({
    where: buildCustodyWhere(user, params),
    select: custodySelect,
    orderBy: orderBy(params),
    take: 20_000,
  })
}

export async function custodySummary(user: CurrentUser) {
  const scope = { student: { ...branchScope(user), archivedAt: null } }
  const [held, sent, back, returned, lost] = await Promise.all([
    db.certificateCustody.count({ where: { ...scope, status: 'WITH_INSTITUTE' } }),
    db.certificateCustody.count({ where: { ...scope, status: 'SENT_FOR_VERIFICATION' } }),
    db.certificateCustody.count({
      where: { ...scope, status: 'RETURNED_FROM_AFFILIATION' },
    }),
    db.certificateCustody.count({ where: { ...scope, status: 'RETURNED_TO_STUDENT' } }),
    db.certificateCustody.count({ where: { ...scope, status: 'LOST' } }),
  ])
  return { held, sent, back, returned, lost, inOurHands: held + sent + back }
}

export async function custodyFilterOptions() {
  const [types, bodies, courses] = await Promise.all([
    db.certificateType.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.affiliationBody.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.course.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])
  return { types, bodies, courses }
}

export async function getCustodyRecord(user: CurrentUser, id: string) {
  return db.certificateCustody.findFirst({
    where: { id, student: { ...branchScope(user), archivedAt: null } },
    include: {
      certificateType: true,
      affiliationBody: true,
      studentEducation: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          applicationNo: true,
          admissionNo: true,
          phone: true,
          course: { select: { name: true } },
          batch: { select: { name: true } },
          branch: { select: { name: true } },
        },
      },
      events: { orderBy: { occurredAt: 'desc' } },
    },
  })
}
