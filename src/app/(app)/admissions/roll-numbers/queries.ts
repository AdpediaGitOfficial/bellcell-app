import 'server-only'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'
import type { SearchParams } from '@/lib/table/params'

export interface RollScope {
  courseId: string | null
  batchId: string | null
  courseYear: number
}

export function parseRollScope(sp: SearchParams): RollScope {
  const yearRaw = typeof sp.courseYear === 'string' ? Number.parseInt(sp.courseYear, 10) : 1
  return {
    courseId: typeof sp.courseId === 'string' && sp.courseId ? sp.courseId : null,
    batchId: typeof sp.batchId === 'string' && sp.batchId ? sp.batchId : null,
    courseYear: Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : 1,
  }
}

/** Sections defined for the chosen course/batch/year. */
export async function sectionsFor(user: CurrentUser, scope: RollScope) {
  if (!scope.courseId || !scope.batchId) return []
  return db.classSection.findMany({
    where: {
      ...branchScope(user),
      archivedAt: null,
      courseId: scope.courseId,
      batchId: scope.batchId,
      courseYear: scope.courseYear,
    },
    orderBy: { name: 'asc' },
    include: {
      rollNumbers: {
        where: { releasedAt: null },
        orderBy: { rollNo: 'asc' },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              applicationNo: true,
              admissionNo: true,
              status: true,
            },
          },
        },
      },
    },
  })
}

/**
 * Students in this course/batch/year who hold no live roll number —
 * the queue to allocate from.
 */
export async function unallocatedStudents(user: CurrentUser, scope: RollScope) {
  if (!scope.courseId || !scope.batchId) return []
  return db.student.findMany({
    where: {
      ...branchScope(user),
      archivedAt: null,
      courseId: scope.courseId,
      batchId: scope.batchId,
      courseYear: scope.courseYear,
      status: { in: ['ADMITTED', 'ACTIVE', 'PROMOTED'] },
      rollNumbers: { none: { releasedAt: null, courseYear: scope.courseYear } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      applicationNo: true,
      admissionNo: true,
    },
  })
}

/** Numbers freed by a drop, available to hand to someone else. */
export async function releasedNumbers(user: CurrentUser, scope: RollScope) {
  if (!scope.courseId || !scope.batchId) return []
  return db.rollNumber.findMany({
    where: {
      releasedAt: { not: null },
      courseYear: scope.courseYear,
      section: {
        ...branchScope(user),
        courseId: scope.courseId,
        batchId: scope.batchId,
        courseYear: scope.courseYear,
      },
    },
    orderBy: { rollNo: 'asc' },
    include: {
      section: { select: { id: true, name: true } },
      student: { select: { firstName: true, lastName: true } },
    },
  })
}

export async function rollFilterOptions() {
  const [courses, batches] = await Promise.all([
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
  ])
  return { courses, batches }
}
