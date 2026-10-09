'use server'

import { revalidatePath } from 'next/cache'
import type { AttendanceStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan, can } from '@/lib/rbac/can'
import { branchScope, writeBranchId } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { STUDENT_STATUS_LABELS } from '@/lib/attendance/core'

const BASE = '/academics/attendance'

const STATUSES = Object.keys(STUDENT_STATUS_LABELS) as AttendanceStatus[]

function parseStatus(value: FormDataEntryValue | null): AttendanceStatus | null {
  const raw = typeof value === 'string' ? value : ''
  return STATUSES.find((s) => s === raw) ?? null
}

function parseDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function optionalId(raw: FormDataEntryValue | null): string | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  return s === '' ? null : s
}

function optionalInt(raw: FormDataEntryValue | null): number | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (s === '') return null
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

export interface SessionState {
  error?: string
  notice?: string
}

/**
 * Save a class register.
 *
 * Creates the session if it does not exist and replaces its entries. A
 * student with no posted status defaults to PRESENT, which is the opposite
 * of the staff register — and deliberately so. A class roll call marks the
 * absentees; typing "present" forty times is how attendance stops being
 * taken at all.
 */
export async function saveSessionAction(
  _prev: SessionState,
  formData: FormData,
): Promise<SessionState> {
  const user = await requireUser()
  assertCan(user, 'academics.attendance', 'create')

  const date = parseDate(String(formData.get('date') ?? ''))
  if (!date) return { error: 'Choose a valid date.' }
  if (date.getTime() > Date.now() + 86_400_000) {
    return { error: 'You cannot mark attendance for a future date.' }
  }

  const courseId = String(formData.get('courseId') ?? '')
  const batchId = String(formData.get('batchId') ?? '')
  const courseYear = Number.parseInt(String(formData.get('courseYear') ?? ''), 10)
  if (!courseId || !batchId || !Number.isFinite(courseYear)) {
    return { error: 'Choose a course, batch and year.' }
  }

  let branchId: string
  try {
    branchId = writeBranchId(user, String(formData.get('branchId') ?? ''))
  } catch {
    return {
      error:
        'Attendance is per branch, so choose a branch from the switcher above before marking it.',
    }
  }

  const sectionId = optionalId(formData.get('sectionId'))
  const subjectId = optionalId(formData.get('subjectId'))
  const period = optionalInt(formData.get('period'))

  const studentIds = formData.getAll('studentId').map(String).filter(Boolean)
  if (studentIds.length === 0) {
    return { error: 'There are no students in this class to mark.' }
  }

  const existing = await db.attendanceSession.findFirst({
    where: {
      branchId,
      courseId,
      batchId,
      courseYear,
      sectionId,
      subjectId,
      period,
      date,
    },
    select: { id: true, lockedAt: true },
  })

  // A locked sheet is read-only unless the person may update attendance —
  // which faculty can, for their own corrections, but STAFF taking a stand-in
  // roll call should not silently overwrite.
  if (existing?.lockedAt && !can(user, 'academics.attendance', 'update')) {
    return {
      error: 'This register has been locked. Ask someone who can correct attendance.',
    }
  }

  const entries = studentIds.map((studentId) => ({
    studentId,
    status: parseStatus(formData.get(`status.${studentId}`)) ?? 'PRESENT',
  }))

  const sessionId = await db.$transaction(async (tx) => {
    const session = existing
      ? await tx.attendanceSession.update({
          where: { id: existing.id },
          data: { takenById: user.id, notes: String(formData.get('notes') ?? '').trim() || null },
        })
      : await tx.attendanceSession.create({
          data: {
            branchId,
            courseId,
            batchId,
            courseYear,
            sectionId,
            subjectId,
            period,
            date,
            takenById: user.id,
            notes: String(formData.get('notes') ?? '').trim() || null,
          },
        })

    await tx.studentAttendance.deleteMany({ where: { sessionId: session.id } })
    await tx.studentAttendance.createMany({
      data: entries.map((e) => ({
        sessionId: session.id,
        studentId: e.studentId,
        status: e.status,
      })),
    })

    return session.id
  })

  const absent = entries.filter((e) => e.status === 'ABSENT').length

  await recordAudit({
    userId: user.id,
    branchId,
    action: existing ? 'UPDATE' : 'CREATE',
    entityType: 'AttendanceSession',
    entityId: sessionId,
    summary:
      `${existing ? 'Corrected' : 'Took'} attendance for ${entries.length} students on ` +
      `${date.toISOString().slice(0, 10)} — ${absent} absent`,
  })

  revalidatePath(BASE)
  return {
    notice: `Saved. ${entries.length} marked, ${absent} absent.`,
  }
}

/** Lock a sheet so a casual re-save cannot change it. */
export async function lockSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'academics.attendance', 'update')

  const id = String(formData.get('sessionId') ?? '')
  const session = await db.attendanceSession.findFirst({
    where: { id, ...branchScope(user) },
    select: { id: true, branchId: true, lockedAt: true, date: true },
  })
  if (!session) return

  await db.attendanceSession.update({
    where: { id: session.id },
    data: { lockedAt: session.lockedAt ? null : new Date() },
  })

  await recordAudit({
    userId: user.id,
    branchId: session.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'AttendanceSession',
    entityId: session.id,
    summary: `${session.lockedAt ? 'Unlocked' : 'Locked'} the register for ${session.date.toISOString().slice(0, 10)}`,
  })

  revalidatePath(BASE)
}
