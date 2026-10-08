'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { aggregate, markError, type SubjectMark } from '@/lib/exams/core'

export interface ResultState {
  error?: string
  ok?: string
  cellErrors?: Record<string, string>
}

/**
 * Save a page of mark entry.
 *
 * Marks arrive as `mark:<studentId>:<subjectId>` and absences as
 * `absent:<studentId>:<subjectId>`. Everything for one student is written in
 * a single transaction and the overall result re-derived, so a result can
 * never disagree with the subject marks it was computed from.
 */
export async function saveMarksAction(
  scheduleId: string,
  _prev: ResultState,
  formData: FormData,
): Promise<ResultState> {
  const user = await requireUser()
  assertCan(user, 'exam.result', 'update')

  const schedule = await db.examSchedule.findFirst({
    where: { id: scheduleId, ...branchScope(user), archivedAt: null },
    include: {
      subjects: {
        include: { subject: { select: { id: true, passMarks: true, name: true } } },
      },
    },
  })
  if (!schedule) return { error: 'Examination not found in the current branch.' }
  if (schedule.subjects.length === 0) return { error: 'This examination has no papers.' }

  const papers = schedule.subjects.map((p) => ({
    subjectId: p.subjectId,
    maxMarks: p.maxMarks,
    passMarks: p.subject.passMarks,
    name: p.subject.name,
  }))

  // Collect submitted values per student.
  const byStudent = new Map<string, Map<string, { marks: number | null; absent: boolean }>>()
  const cellErrors: Record<string, string> = {}

  for (const [key, raw] of formData.entries()) {
    const markMatch = /^mark:([^:]+):([^:]+)$/.exec(key)
    const absentMatch = /^absent:([^:]+):([^:]+)$/.exec(key)
    if (!markMatch && !absentMatch) continue

    const [, studentId, subjectId] = (markMatch ?? absentMatch)!
    const paper = papers.find((p) => p.subjectId === subjectId)
    if (!paper || !studentId || !subjectId) continue

    const cells = byStudent.get(studentId) ?? new Map()
    const cell = cells.get(subjectId) ?? { marks: null, absent: false }

    if (absentMatch) {
      cell.absent = true
      cell.marks = null
    } else {
      const text = String(raw).trim()
      if (text !== '') {
        const value = Number(text)
        const error = markError(Number.isFinite(value) ? value : Number.NaN, paper.maxMarks)
        if (error) {
          cellErrors[`${studentId}:${subjectId}`] = error
        } else {
          cell.marks = value
        }
      }
    }

    cells.set(subjectId, cell)
    byStudent.set(studentId, cells)
  }

  if (Object.keys(cellErrors).length > 0) {
    return {
      error: `${Object.keys(cellErrors).length} mark${Object.keys(cellErrors).length === 1 ? '' : 's'} could not be saved — see the highlighted cells.`,
      cellErrors,
    }
  }

  const withheldIds = new Set(formData.getAll('withhold').map(String))

  // Only students of this branch, course and year may be marked.
  const students = await db.student.findMany({
    where: {
      id: { in: [...byStudent.keys()] },
      ...branchScope(user),
      archivedAt: null,
      courseId: schedule.courseId,
      ...(schedule.batchId ? { batchId: schedule.batchId } : {}),
    },
    select: { id: true },
  })
  const allowed = new Set(students.map((s) => s.id))

  let saved = 0

  for (const [studentId, cells] of byStudent) {
    if (!allowed.has(studentId)) continue

    const marks: SubjectMark[] = papers.map((p) => {
      const cell = cells.get(p.subjectId)
      return {
        subjectId: p.subjectId,
        marks: cell?.marks ?? null,
        maxMarks: p.maxMarks,
        passMarks: p.passMarks,
        isAbsent: cell?.absent ?? false,
      }
    })

    const totals = aggregate(marks, { withheld: withheldIds.has(studentId) })

    await db.$transaction(async (tx) => {
      const result = await tx.examResult.upsert({
        where: { scheduleId_studentId: { scheduleId, studentId } },
        create: {
          scheduleId,
          studentId,
          totalMarks: totals.totalMarks,
          maxMarks: totals.maxMarks,
          percentage: new Prisma.Decimal(totals.percentage),
          grade: totals.grade,
          status: totals.status,
        },
        update: {
          totalMarks: totals.totalMarks,
          maxMarks: totals.maxMarks,
          percentage: new Prisma.Decimal(totals.percentage),
          grade: totals.grade,
          status: totals.status,
        },
      })

      for (const m of marks) {
        await tx.examResultSubject.upsert({
          where: {
            resultId_subjectId: { resultId: result.id, subjectId: m.subjectId },
          },
          create: {
            resultId: result.id,
            subjectId: m.subjectId,
            marks: m.marks,
            maxMarks: m.maxMarks,
            isAbsent: m.isAbsent,
          },
          update: {
            marks: m.marks,
            maxMarks: m.maxMarks,
            isAbsent: m.isAbsent,
          },
        })
      }
    })

    saved += 1
  }

  await recordAudit({
    userId: user.id,
    branchId: schedule.branchId,
    action: 'UPDATE',
    entityType: 'ExamResult',
    entityId: scheduleId,
    summary: `Entered marks for ${saved} student${saved === 1 ? '' : 's'} in "${schedule.name}"`,
  })

  revalidatePath(`/exams/results/${scheduleId}`)
  revalidatePath('/exams/results')

  return { ok: `Saved marks for ${saved} student${saved === 1 ? '' : 's'}.` }
}

/**
 * Publish or unpublish results.
 *
 * Publishing is what makes a result visible as final, so it refuses while
 * any mark is still unentered — a half-entered result published as "fail" is
 * worse than no result at all.
 */
export async function publishResultsAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'exam.result', 'approve')

  const scheduleId = String(formData.get('scheduleId') ?? '')
  const schedule = await db.examSchedule.findFirst({
    where: { id: scheduleId, ...branchScope(user), archivedAt: null },
    include: {
      subjects: { select: { subjectId: true } },
      results: { include: { subjects: { select: { marks: true, isAbsent: true } } } },
    },
  })
  if (!schedule || schedule.results.length === 0) return

  const paperCount = schedule.subjects.length
  const unpublishing = schedule.results.some((r) => r.publishedAt !== null)

  if (!unpublishing) {
    const incomplete = schedule.results.some(
      (r) =>
        r.subjects.length < paperCount ||
        r.subjects.some((s) => s.marks === null && !s.isAbsent),
    )
    if (incomplete) return
  }

  await db.examResult.updateMany({
    where: { scheduleId },
    data: { publishedAt: unpublishing ? null : new Date() },
  })

  await recordAudit({
    userId: user.id,
    branchId: schedule.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'ExamResult',
    entityId: scheduleId,
    summary: `${unpublishing ? 'Unpublished' : 'Published'} results for "${schedule.name}" (${schedule.results.length} students)`,
  })

  revalidatePath(`/exams/results/${scheduleId}`)
  revalidatePath('/exams/results')
}
