import 'server-only'
import type { Prisma, StudentStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'
import { skipTake, type TableParams } from '@/lib/table/params'

export const STUDENT_SORTS = [
  'name',
  'applicationNo',
  'admissionNo',
  'admissionDate',
  'createdAt',
] as const

export const STUDENT_FILTER_KEYS = [
  'status',
  'courseId',
  'batchId',
  'classModeId',
  'dues',
] as const

export const STATUS_LABELS: Record<StudentStatus, string> = {
  APPLIED: 'Applied',
  ADMITTED: 'Admitted',
  ACTIVE: 'Active',
  PROMOTED: 'Promoted',
  COMPLETED: 'Completed',
  TRANSFERRED: 'Transferred',
  DROPPED: 'Dropped',
  CANCELLED: 'Cancelled',
}

export function buildStudentWhere(
  user: CurrentUser,
  params: TableParams,
): Prisma.StudentWhereInput {
  const where: Prisma.StudentWhereInput = {
    ...branchScope(user),
    archivedAt: null,
  }

  if (params.q) {
    where.OR = [
      { firstName: { contains: params.q, mode: 'insensitive' } },
      { lastName: { contains: params.q, mode: 'insensitive' } },
      { applicationNo: { contains: params.q, mode: 'insensitive' } },
      { admissionNo: { contains: params.q, mode: 'insensitive' } },
      { enrolmentNumber: { contains: params.q, mode: 'insensitive' } },
      { phone: { contains: params.q } },
    ]
  }

  const f = params.filters
  if (f.status) where.status = f.status as StudentStatus
  if (f.courseId) where.courseId = f.courseId
  if (f.batchId) where.batchId = f.batchId
  if (f.classModeId) where.classModeId = f.classModeId

  // "Has dues" is a relation filter rather than a stored flag, so it can
  // never drift out of step with the instalments themselves.
  if (f.dues === 'outstanding') {
    where.installments = {
      some: { status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } },
    }
  } else if (f.dues === 'overdue') {
    where.installments = { some: { status: 'OVERDUE' } }
  } else if (f.dues === 'clear') {
    where.installments = {
      every: { status: { in: ['PAID', 'WAIVED'] } },
    }
  }

  return where
}

function orderBy(params: TableParams): Prisma.StudentOrderByWithRelationInput[] {
  const dir = params.dir
  switch (params.sort) {
    case 'name':
      return [{ firstName: dir }, { lastName: dir }]
    case 'applicationNo':
      return [{ applicationNo: dir }]
    case 'admissionNo':
      return [{ admissionNo: { sort: dir, nulls: 'last' } }]
    case 'admissionDate':
      return [{ admissionDate: { sort: dir, nulls: 'last' } }]
    default:
      return [{ createdAt: dir }]
  }
}

export const studentSelect = {
  id: true,
  applicationNo: true,
  admissionNo: true,
  enrolmentNumber: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  courseYear: true,
  status: true,
  admissionDate: true,
  createdAt: true,
  course: { select: { id: true, name: true } },
  batch: { select: { id: true, name: true } },
  classMode: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  installments: {
    select: {
      duePaise: true,
      concessionPaise: true,
      lateFeePaise: true,
      paidPaise: true,
      status: true,
    },
  },
} satisfies Prisma.StudentSelect

export type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>

/** Outstanding across a student's instalments, derived not stored. */
export function duesFor(row: StudentRow): { outstandingPaise: number; hasOverdue: boolean } {
  let outstanding = 0
  let hasOverdue = false
  for (const i of row.installments) {
    const bal = Math.max(
      0,
      i.duePaise + i.lateFeePaise - i.concessionPaise - i.paidPaise,
    )
    outstanding += bal
    if (bal > 0 && i.status === 'OVERDUE') hasOverdue = true
  }
  return { outstandingPaise: outstanding, hasOverdue }
}

export async function listStudents(
  user: CurrentUser,
  params: TableParams,
): Promise<{ rows: StudentRow[]; total: number }> {
  const where = buildStudentWhere(user, params)
  const { skip, take } = skipTake(params)

  const [rows, total] = await Promise.all([
    db.student.findMany({
      where,
      select: studentSelect,
      orderBy: orderBy(params),
      skip,
      take,
    }),
    db.student.count({ where }),
  ])

  return { rows, total }
}

export async function listStudentsForExport(
  user: CurrentUser,
  params: TableParams,
): Promise<StudentRow[]> {
  return db.student.findMany({
    where: buildStudentWhere(user, params),
    select: studentSelect,
    orderBy: orderBy(params),
    take: 20_000,
  })
}

export async function studentFilterOptions() {
  const [courses, batches, classModes, religions, languages, affiliations] =
    await Promise.all([
      db.course.findMany({
        where: { archivedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, durationYears: true },
      }),
      db.batch.findMany({
        where: { archivedAt: null },
        orderBy: { startDate: 'desc' },
        select: { id: true, name: true },
      }),
      db.classMode.findMany({
        where: { archivedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      db.religion.findMany({
        where: { archivedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      db.language.findMany({
        where: { archivedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, usableAsMedium: true, usableAsSecond: true },
      }),
      db.affiliationBody.findMany({
        where: { archivedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ])

  return { courses, batches, classModes, religions, languages, affiliations }
}

export async function studentSummary(user: CurrentUser) {
  const scope = { ...branchScope(user), archivedAt: null }
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [total, active, thisMonth, withOverdue] = await Promise.all([
    db.student.count({ where: scope }),
    db.student.count({
      where: { ...scope, status: { in: ['ADMITTED', 'ACTIVE', 'PROMOTED'] } },
    }),
    db.student.count({ where: { ...scope, admissionDate: { gte: monthStart } } }),
    db.student.count({
      where: { ...scope, installments: { some: { status: 'OVERDUE' } } },
    }),
  ])

  return { total, active, thisMonth, withOverdue }
}
