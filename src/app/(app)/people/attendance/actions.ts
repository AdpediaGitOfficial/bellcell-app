'use server'

import { revalidatePath } from 'next/cache'
import type { StaffAttendanceStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { branchScope, writeBranchId } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { STAFF_STATUS_LABELS } from '@/lib/attendance/core'

const BASE = '/people/attendance'

const STATUSES = Object.keys(STAFF_STATUS_LABELS) as StaffAttendanceStatus[]

function parseStatus(value: FormDataEntryValue | null): StaffAttendanceStatus | null {
  const raw = typeof value === 'string' ? value : ''
  return STATUSES.find((s) => s === raw) ?? null
}

/** Date-only, at UTC midnight, so a @db.Date column round-trips cleanly. */
function parseDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface StaffAttendanceState {
  error?: string
  notice?: string
}

/**
 * Save a whole day's staff register in one go.
 *
 * The form posts `status.<employeeId>` per row. An employee left blank is
 * left UNMARKED rather than defaulted to present: an unmarked day costs
 * nothing in payroll, and inventing a presence record is worse than having
 * none (see src/lib/attendance/core.ts).
 */
export async function saveStaffDayAction(
  _prev: StaffAttendanceState,
  formData: FormData,
): Promise<StaffAttendanceState> {
  const user = await requireUser()
  assertCan(user, 'people.staffAttendance', 'create')

  const dateRaw = String(formData.get('date') ?? '')
  const date = parseDate(dateRaw)
  if (!date) return { error: 'Choose a valid date.' }
  if (date.getTime() > Date.now() + 86_400_000) {
    return { error: 'You cannot mark attendance for a future date.' }
  }

  let branchId: string
  try {
    branchId = writeBranchId(user, String(formData.get('branchId') ?? ''))
  } catch {
    return {
      error:
        'Staff attendance is per branch, so choose a branch from the switcher above before marking it.',
    }
  }

  const employees = await db.employee.findMany({
    where: { branchId, archivedAt: null, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
    select: { id: true },
  })

  let marked = 0
  let cleared = 0

  await db.$transaction(async (tx) => {
    for (const employee of employees) {
      const status = parseStatus(formData.get(`status.${employee.id}`))
      const remarks = String(formData.get(`remarks.${employee.id}`) ?? '').trim() || null

      if (!status) {
        // Explicitly blanked — remove the row rather than storing a guess.
        const removed = await tx.staffAttendance.deleteMany({
          where: { employeeId: employee.id, date },
        })
        cleared += removed.count
        continue
      }

      await tx.staffAttendance.upsert({
        where: { employeeId_date: { employeeId: employee.id, date } },
        create: {
          branchId,
          employeeId: employee.id,
          date,
          status,
          remarks,
          markedById: user.id,
        },
        update: { status, remarks, markedById: user.id, branchId },
      })
      marked += 1
    }
  })

  await recordAudit({
    userId: user.id,
    branchId,
    action: 'UPDATE',
    entityType: 'StaffAttendance',
    summary:
      `Marked staff attendance for ${dateRaw} — ${marked} recorded` +
      (cleared > 0 ? `, ${cleared} cleared` : ''),
  })

  revalidatePath(BASE)
  return {
    notice:
      `Saved. ${marked} of ${employees.length} marked for ${dateRaw}` +
      (cleared > 0 ? `, ${cleared} cleared.` : '.'),
  }
}

/**
 * Mark everyone present for a day in one click, skipping anyone already
 * marked so a correction is not undone.
 */
export async function markAllPresentAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'people.staffAttendance', 'create')

  const date = parseDate(String(formData.get('date') ?? ''))
  if (!date) return

  const scope = branchScope(user)
  if (!scope.branchId) return

  const employees = await db.employee.findMany({
    where: {
      branchId: scope.branchId,
      archivedAt: null,
      status: { in: ['ACTIVE', 'ON_LEAVE'] },
      attendance: { none: { date } },
    },
    select: { id: true },
  })

  if (employees.length > 0) {
    await db.staffAttendance.createMany({
      data: employees.map((e) => ({
        branchId: scope.branchId!,
        employeeId: e.id,
        date,
        status: 'PRESENT' as const,
        markedById: user.id,
      })),
      skipDuplicates: true,
    })
  }

  await recordAudit({
    userId: user.id,
    branchId: scope.branchId,
    action: 'UPDATE',
    entityType: 'StaffAttendance',
    summary: `Marked ${employees.length} staff present for ${date.toISOString().slice(0, 10)}`,
  })

  revalidatePath(BASE)
}
