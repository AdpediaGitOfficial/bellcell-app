'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { canAccessBranch } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'

const PATH = '/masters/holidays'

export interface HolidayState {
  error?: string
  notice?: string
  values?: { name?: string; date?: string }
}

function parseDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function addHolidayAction(
  _prev: HolidayState,
  formData: FormData,
): Promise<HolidayState> {
  const user = await requireUser()
  assertCan(user, 'masters', 'create')

  const values = {
    name: String(formData.get('name') ?? '').trim(),
    date: String(formData.get('date') ?? ''),
  }
  if (!values.name) return { error: 'Give the holiday a name.', values }

  const date = parseDate(values.date)
  if (!date) return { error: 'Choose a valid date.', values }

  const branchRaw = String(formData.get('branchId') ?? '')
  // An empty branch means "every branch", which is the common case for a
  // national holiday and is why branchId is nullable.
  const branchId = branchRaw === '' ? null : branchRaw
  if (branchId && !canAccessBranch(user, branchId)) {
    return { error: 'You cannot add a holiday to that branch.', values }
  }

  try {
    await db.holiday.create({
      data: {
        branchId,
        date,
        name: values.name,
        isWeeklyOff: formData.get('isWeeklyOff') === 'on',
      },
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return {
        error: branchId
          ? 'That branch already has a holiday on that date.'
          : 'There is already an institute-wide holiday on that date.',
        values,
      }
    }
    throw error
  }

  await recordAudit({
    userId: user.id,
    branchId,
    action: 'CREATE',
    entityType: 'Holiday',
    summary: `Added holiday "${values.name}" on ${values.date}`,
  })

  revalidatePath(PATH)
  return { notice: `Added ${values.name}.` }
}

export async function deleteHolidayAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'masters', 'delete')

  const id = String(formData.get('id') ?? '')
  const holiday = await db.holiday.findUnique({
    where: { id },
    select: { id: true, name: true, date: true, branchId: true },
  })
  if (!holiday) return
  if (holiday.branchId && !canAccessBranch(user, holiday.branchId)) return

  await db.holiday.delete({ where: { id: holiday.id } })

  await recordAudit({
    userId: user.id,
    branchId: holiday.branchId,
    action: 'DELETE',
    entityType: 'Holiday',
    summary: `Removed holiday "${holiday.name}" on ${holiday.date.toISOString().slice(0, 10)}`,
  })

  revalidatePath(PATH)
}

/**
 * Materialise every occurrence of one weekday across a year as a weekly off.
 *
 * Stored as rows rather than computed from a rule, because an institute
 * works the odd Sunday and the exception has to be deletable.
 */
export async function generateWeeklyOffsAction(
  _prev: HolidayState,
  formData: FormData,
): Promise<HolidayState> {
  const user = await requireUser()
  assertCan(user, 'masters', 'create')

  const year = Number.parseInt(String(formData.get('year') ?? ''), 10)
  const weekday = Number.parseInt(String(formData.get('weekday') ?? ''), 10)
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return { error: 'Choose a valid year.' }
  }
  if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) {
    return { error: 'Choose a day of the week.' }
  }

  const branchRaw = String(formData.get('branchId') ?? '')
  const branchId = branchRaw === '' ? null : branchRaw
  if (branchId && !canAccessBranch(user, branchId)) {
    return { error: 'You cannot add holidays to that branch.' }
  }

  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const rows: { branchId: string | null; date: Date; name: string; isWeeklyOff: boolean }[] = []

  const cursor = new Date(Date.UTC(year, 0, 1))
  while (cursor.getUTCFullYear() === year) {
    if (cursor.getUTCDay() === weekday) {
      rows.push({
        branchId,
        date: new Date(cursor),
        name: `${names[weekday]} weekly off`,
        isWeeklyOff: true,
      })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  // skipDuplicates so re-running does not fail on dates already declared.
  const result = await db.holiday.createMany({ data: rows, skipDuplicates: true })

  await recordAudit({
    userId: user.id,
    branchId,
    action: 'CREATE',
    entityType: 'Holiday',
    summary: `Generated ${result.count} ${names[weekday]} weekly offs for ${year}`,
  })

  revalidatePath(PATH)
  return {
    notice:
      result.count === 0
        ? `Every ${names[weekday]} in ${year} was already marked.`
        : `Added ${result.count} ${names[weekday]}s in ${year}.`,
  }
}
