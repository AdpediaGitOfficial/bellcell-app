'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ExamTerm } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { NoBranchSelectedError, branchScope, writeBranchId } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'

export interface ExamState {
  error?: string
  ok?: string
}

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}
function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = orNull(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function saveScheduleAction(
  scheduleId: string | null,
  _prev: ExamState,
  formData: FormData,
): Promise<ExamState> {
  const user = await requireUser()
  assertCan(user, 'exam.schedule', scheduleId ? 'update' : 'create')

  const name = String(formData.get('name') ?? '').trim()
  const courseId = String(formData.get('courseId') ?? '')
  const startDate = parseDate(formData.get('startDate'))
  const endDate = parseDate(formData.get('endDate'))

  if (!name) return { error: 'Give the examination a name.' }
  if (!courseId) return { error: 'Choose a course.' }
  if (!startDate || !endDate) return { error: 'Enter both start and end dates.' }
  if (endDate < startDate) return { error: 'The end date cannot be before the start date.' }

  const data = {
    name,
    courseId,
    batchId: orNull(formData.get('batchId')),
    courseYear: Number.parseInt(String(formData.get('courseYear') ?? '1'), 10) || 1,
    term: (String(formData.get('term') ?? 'ANNUAL') || 'ANNUAL') as ExamTerm,
    examCentreId: orNull(formData.get('examCentreId')),
    startDate,
    endDate,
  }

  let targetId = scheduleId

  if (scheduleId) {
    const existing = await db.examSchedule.findFirst({
      where: { id: scheduleId, ...branchScope(user), archivedAt: null },
    })
    if (!existing) return { error: 'Examination not found in the current branch.' }

    await db.examSchedule.update({ where: { id: scheduleId }, data })
    await recordAudit({
      userId: user.id,
      branchId: existing.branchId,
      action: 'UPDATE',
      entityType: 'ExamSchedule',
      entityId: scheduleId,
      summary: `Updated examination "${name}"`,
    })
  } else {
    let branchId: string
    try {
      branchId = writeBranchId(user, String(formData.get('branchId') ?? ''))
    } catch (error) {
      if (error instanceof NoBranchSelectedError) {
        return { error: 'Choose which branch this examination belongs to.' }
      }
      throw error
    }

    const created = await db.examSchedule.create({ data: { ...data, branchId } })
    targetId = created.id

    await recordAudit({
      userId: user.id,
      branchId,
      action: 'CREATE',
      entityType: 'ExamSchedule',
      entityId: created.id,
      summary: `Created examination "${name}"`,
    })
  }

  revalidatePath('/exams/schedule')
  redirect(`/exams/schedule/${targetId}`)
}

/** Add a paper to the timetable. */
export async function addScheduleSubjectAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'exam.schedule', 'update')

  const scheduleId = String(formData.get('scheduleId') ?? '')
  const subjectId = String(formData.get('subjectId') ?? '')
  const examDate = parseDate(formData.get('examDate'))
  if (!scheduleId || !subjectId || !examDate) return

  const schedule = await db.examSchedule.findFirst({
    where: { id: scheduleId, ...branchScope(user), archivedAt: null },
  })
  // A published timetable is what students have been handed; changing it
  // silently is how people turn up on the wrong day.
  if (!schedule || schedule.isPublished) return

  const subject = await db.subject.findUnique({
    where: { id: subjectId },
    select: { name: true, maxMarks: true },
  })
  if (!subject) return

  const maxRaw = orNull(formData.get('maxMarks'))

  await db.examScheduleSubject.create({
    data: {
      scheduleId,
      subjectId,
      examDate,
      startTime: orNull(formData.get('startTime')),
      endTime: orNull(formData.get('endTime')),
      maxMarks: maxRaw ? Number.parseInt(maxRaw, 10) : subject.maxMarks,
    },
  })

  await recordAudit({
    userId: user.id,
    branchId: schedule.branchId,
    action: 'CREATE',
    entityType: 'ExamScheduleSubject',
    summary: `Added ${subject.name} to "${schedule.name}"`,
  })

  revalidatePath(`/exams/schedule/${scheduleId}`)
}

export async function removeScheduleSubjectAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'exam.schedule', 'update')

  const id = String(formData.get('scheduleSubjectId') ?? '')
  const row = await db.examScheduleSubject.findFirst({
    where: { id, schedule: { ...branchScope(user) } },
    include: { schedule: { select: { id: true, isPublished: true, branchId: true } } },
  })
  if (!row || row.schedule.isPublished) return

  // Refuse once marks exist against this paper — removing it would discard
  // them with no trace.
  const marksEntered = await db.examResultSubject.count({
    where: { subjectId: row.subjectId, result: { scheduleId: row.schedule.id } },
  })
  if (marksEntered > 0) return

  await db.examScheduleSubject.delete({ where: { id } })
  revalidatePath(`/exams/schedule/${row.schedule.id}`)
}

export async function publishScheduleAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'exam.schedule', 'update')

  const scheduleId = String(formData.get('scheduleId') ?? '')
  const schedule = await db.examSchedule.findFirst({
    where: { id: scheduleId, ...branchScope(user), archivedAt: null },
    include: { _count: { select: { subjects: true } } },
  })
  if (!schedule || schedule._count.subjects === 0) return

  await db.examSchedule.update({
    where: { id: scheduleId },
    data: { isPublished: !schedule.isPublished },
  })

  await recordAudit({
    userId: user.id,
    branchId: schedule.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'ExamSchedule',
    entityId: scheduleId,
    summary: `${schedule.isPublished ? 'Unpublished' : 'Published'} the timetable for "${schedule.name}"`,
  })

  revalidatePath('/exams/schedule')
  revalidatePath(`/exams/schedule/${scheduleId}`)
}
