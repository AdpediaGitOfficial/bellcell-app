import 'server-only'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'
import {
  attendancePercentage,
  shortageBand,
  tally,
  type ShortageRule,
} from '@/lib/attendance/core'

/** Course / batch / year combinations that actually have students. */
export async function classOptions(user: CurrentUser) {
  const [courses, batches, sections, subjects] = await Promise.all([
    db.course.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, durationYears: true },
    }),
    db.batch.findMany({
      where: { archivedAt: null },
      orderBy: [{ isCurrent: 'desc' }, { name: 'desc' }],
      select: { id: true, name: true, isCurrent: true },
    }),
    db.classSection.findMany({
      where: { archivedAt: null, ...branchScope(user) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, courseId: true, batchId: true, courseYear: true },
    }),
    db.subject.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, courseId: true, courseYear: true },
    }),
  ])
  return { courses, batches, sections, subjects }
}

export interface ClassKey {
  courseId: string
  batchId: string
  courseYear: number
  sectionId: string | null
  subjectId: string | null
  period: number | null
}

/** The students a session should contain. */
export async function studentsForClass(user: CurrentUser, key: ClassKey) {
  return db.student.findMany({
    where: {
      ...branchScope(user),
      archivedAt: null,
      courseId: key.courseId,
      batchId: key.batchId,
      courseYear: key.courseYear,
      status: { in: ['ADMITTED', 'ACTIVE', 'PROMOTED'] },
      ...(key.sectionId
        ? { rollNumbers: { some: { sectionId: key.sectionId } } }
        : {}),
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      applicationNo: true,
      rollNumbers: {
        where: key.sectionId ? { sectionId: key.sectionId } : undefined,
        select: { rollNo: true },
        take: 1,
      },
    },
  })
}

export async function findSession(
  user: CurrentUser,
  key: ClassKey,
  date: Date,
) {
  const scope = branchScope(user)
  if (!scope.branchId) return null
  return db.attendanceSession.findFirst({
    where: {
      branchId: scope.branchId,
      courseId: key.courseId,
      batchId: key.batchId,
      courseYear: key.courseYear,
      sectionId: key.sectionId,
      subjectId: key.subjectId,
      period: key.period,
      date,
    },
    include: {
      entries: { select: { studentId: true, status: true, remarks: true } },
      takenBy: { select: { fullName: true } },
    },
  })
}

export async function recentSessions(user: CurrentUser, limit = 15) {
  return db.attendanceSession.findMany({
    where: branchScope(user),
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: {
      course: { select: { name: true } },
      batch: { select: { name: true } },
      section: { select: { name: true } },
      subject: { select: { name: true } },
      takenBy: { select: { fullName: true } },
      _count: { select: { entries: true } },
    },
  })
}

export interface RegisterRow {
  studentId: string
  name: string
  admissionNo: string
  rollNo: number | null
  present: number
  absent: number
  late: number
  excused: number
  held: number
  percentage: number | null
  band: ReturnType<typeof shortageBand>
}

/**
 * Per-student attendance across a date window.
 *
 * One query for the whole cohort rather than one per student; the tally is
 * done in TypeScript so the same `core.ts` rules apply as everywhere else
 * (a SQL COUNT would quietly re-implement them and drift).
 */
export async function registerFor(
  user: CurrentUser,
  key: Omit<ClassKey, 'sectionId' | 'subjectId' | 'period'> & { sectionId: string | null },
  from: Date,
  to: Date,
  rule?: ShortageRule,
): Promise<{ rows: RegisterRow[]; sessionCount: number }> {
  const scope = branchScope(user)

  const sessions = await db.attendanceSession.findMany({
    where: {
      ...scope,
      courseId: key.courseId,
      batchId: key.batchId,
      courseYear: key.courseYear,
      ...(key.sectionId ? { sectionId: key.sectionId } : {}),
      date: { gte: from, lte: to },
    },
    select: {
      id: true,
      entries: { select: { studentId: true, status: true } },
    },
  })

  const byStudent = new Map<string, ReturnType<typeof tally>>()
  const statuses = new Map<string, Parameters<typeof tally>[0]>()
  for (const session of sessions) {
    for (const entry of session.entries) {
      const list = statuses.get(entry.studentId) ?? []
      list.push(entry.status)
      statuses.set(entry.studentId, list)
    }
  }
  for (const [studentId, list] of statuses) byStudent.set(studentId, tally(list))

  const students = await studentsForClass(user, {
    ...key,
    subjectId: null,
    period: null,
  })

  const rows: RegisterRow[] = students.map((s) => {
    const t = byStudent.get(s.id) ?? { present: 0, absent: 0, late: 0, excused: 0 }
    const held = t.present + t.absent + t.late
    const percentage = attendancePercentage(t)
    return {
      studentId: s.id,
      name: [s.firstName, s.lastName].filter(Boolean).join(' '),
      admissionNo: s.admissionNo ?? s.applicationNo,
      rollNo: s.rollNumbers[0]?.rollNo ?? null,
      present: t.present,
      absent: t.absent,
      late: t.late,
      excused: t.excused,
      held,
      percentage,
      band: shortageBand(percentage, rule),
    }
  })

  return { rows, sessionCount: sessions.length }
}
