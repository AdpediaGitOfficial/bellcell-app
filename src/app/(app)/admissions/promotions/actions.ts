'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { parseRupeesToPaise } from '@/lib/money'

const BASE = '/admissions/promotions'

export interface MoveState {
  error?: string
  ok?: string
}

/**
 * Promote students to the next year.
 *
 * Roll numbers are NOT carried over: they are allocated per course year, so
 * promoting releases the old number and the office allocates fresh ones for
 * the new year on the Roll Numbers screen. Carrying them silently would
 * produce duplicate numbers within a year.
 */
export async function promoteStudentsAction(
  _prev: MoveState,
  formData: FormData,
): Promise<MoveState> {
  const user = await requireUser()
  assertCan(user, 'admission.promotion', 'create')

  const studentIds = formData.getAll('studentIds').map(String).filter(Boolean)
  if (studentIds.length === 0) return { error: 'Select at least one student.' }

  const toBatchId = String(formData.get('toBatchId') ?? '').trim() || null
  const remarks = String(formData.get('remarks') ?? '').trim() || null

  const students = await db.student.findMany({
    where: { id: { in: studentIds }, ...branchScope(user), archivedAt: null },
    include: { course: { select: { durationYears: true, name: true } } },
  })
  if (students.length === 0) return { error: 'No eligible students found.' }

  let promoted = 0
  let completed = 0

  for (const s of students) {
    const nextYear = s.courseYear + 1
    const finishing = nextYear > s.course.durationYears

    await db.$transaction(async (tx) => {
      await tx.studentPromotion.create({
        data: {
          studentId: s.id,
          fromYear: s.courseYear,
          toYear: finishing ? s.courseYear : nextYear,
          batchId: toBatchId,
          promotedById: user.id,
          remarks: finishing ? `Completed ${s.course.name}` : remarks,
        },
      })

      await tx.student.update({
        where: { id: s.id },
        data: finishing
          ? { status: 'COMPLETED' }
          : {
              courseYear: nextYear,
              status: 'PROMOTED',
              ...(toBatchId ? { batchId: toBatchId } : {}),
            },
      })

      // Free the roll number held for the year just finished.
      await tx.rollNumber.updateMany({
        where: { studentId: s.id, courseYear: s.courseYear, releasedAt: null },
        data: { releasedAt: new Date() },
      })
    })

    if (finishing) completed += 1
    else promoted += 1

    await recordAudit({
      userId: user.id,
      branchId: s.branchId,
      action: 'STATUS_CHANGE',
      entityType: 'Student',
      entityId: s.id,
      summary: finishing
        ? `${s.applicationNo} completed ${s.course.name} (final year ${s.courseYear})`
        : `Promoted ${s.applicationNo} from year ${s.courseYear} to ${nextYear}`,
    })

    revalidatePath(`/admissions/applications/${s.id}`)
  }

  revalidatePath(BASE)
  revalidatePath('/admissions/roll-numbers')

  return {
    ok:
      `Promoted ${promoted} student${promoted === 1 ? '' : 's'}` +
      (completed > 0 ? `, marked ${completed} as completed.` : '.') +
      ' Roll numbers for the previous year have been freed.',
  }
}

/**
 * Move one student onto a different course.
 *
 * The fee consequence is captured explicitly rather than implied: the vendor
 * scope listed "Course transfer" with no mention of money, but changing
 * course almost always changes what is owed.
 */
export async function transferCourseAction(
  _prev: MoveState,
  formData: FormData,
): Promise<MoveState> {
  const user = await requireUser()
  assertCan(user, 'admission.promotion', 'create')

  const studentId = String(formData.get('studentId') ?? '')
  const toCourseId = String(formData.get('toCourseId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!studentId || !toCourseId) return { error: 'Choose a student and a course.' }
  if (!reason) return { error: 'A reason is required for a course transfer.' }

  let feeAdjustmentPaise = 0
  const adjRaw = String(formData.get('feeAdjustment') ?? '').trim()
  if (adjRaw) {
    try {
      feeAdjustmentPaise = parseRupeesToPaise(adjRaw)
    } catch {
      return { error: 'Enter a valid fee adjustment, or leave it blank.' }
    }
  }

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user), archivedAt: null },
    include: { course: { select: { id: true, name: true } } },
  })
  if (!student) return { error: 'Student not found in the current branch.' }
  if (student.courseId === toCourseId) {
    return { error: 'The student is already on that course.' }
  }

  const toCourse = await db.course.findUnique({
    where: { id: toCourseId },
    select: { name: true },
  })
  if (!toCourse) return { error: 'Target course not found.' }

  await db.$transaction(async (tx) => {
    await tx.courseTransfer.create({
      data: {
        studentId,
        fromCourseId: student.courseId,
        toCourseId,
        reason,
        feeAdjustmentPaise,
        approvedById: user.id,
      },
    })

    await tx.student.update({
      where: { id: studentId },
      data: { courseId: toCourseId, status: 'ACTIVE' },
    })

    // The old course's roll number no longer applies.
    await tx.rollNumber.updateMany({
      where: { studentId, releasedAt: null },
      data: { releasedAt: new Date() },
    })
  })

  await recordAudit({
    userId: user.id,
    branchId: student.branchId,
    action: 'UPDATE',
    entityType: 'Student',
    entityId: studentId,
    summary:
      `Transferred ${student.applicationNo} from ${student.course.name} to ${toCourse.name}` +
      (feeAdjustmentPaise !== 0
        ? ` with a fee adjustment of ₹${(feeAdjustmentPaise / 100).toFixed(2)}`
        : ''),
    before: { courseId: student.courseId },
    after: { courseId: toCourseId },
  })

  revalidatePath(BASE)
  revalidatePath(`/admissions/applications/${studentId}`)

  return {
    ok:
      `Transferred to ${toCourse.name}.` +
      (feeAdjustmentPaise !== 0
        ? ' The fee adjustment is recorded — apply it to the student’s instalments on the Fees tab.'
        : ''),
  }
}
