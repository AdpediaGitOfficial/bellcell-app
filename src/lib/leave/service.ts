import 'server-only'
import type { DayPortion, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { holidayDatesBetween } from '@/lib/attendance/service'
import {
  LeaveError,
  attendanceStatusFor,
  availableDays,
  carryForwardDays,
  countLeaveDays,
  fromIso,
  leaveDays,
  requestBlockedReason,
  toIso,
  type Balance,
  type IsoDate,
  type LeaveTypeRule,
} from './core'

export { LeaveError }

/**
 * Leave as it touches the database.
 *
 * The seam worth understanding: approving a request writes STAFF ATTENDANCE
 * rows, and payroll reads those. Leave never speaks to payroll directly, so
 * there is exactly one path from "away from work" to "paid less" — the
 * register — and it is the same path whether the absence came through a
 * leave request or was marked by hand.
 */

function ruleOf(t: {
  name: string
  isPaid: boolean
  annualEntitlementDays: Prisma.Decimal
  allowCarryForward: boolean
  carryForwardCapDays: Prisma.Decimal
  requiresApproval: boolean
}): LeaveTypeRule {
  return {
    name: t.name,
    isPaid: t.isPaid,
    annualEntitlementDays: Number(t.annualEntitlementDays),
    allowCarryForward: t.allowCarryForward,
    carryForwardCapDays: Number(t.carryForwardCapDays),
    requiresApproval: t.requiresApproval,
  }
}

function balanceOf(b: {
  entitledDays: Prisma.Decimal
  carriedForwardDays: Prisma.Decimal
  usedDays: Prisma.Decimal
} | null): Balance {
  return {
    entitledDays: b ? Number(b.entitledDays) : 0,
    carriedForwardDays: b ? Number(b.carriedForwardDays) : 0,
    usedDays: b ? Number(b.usedDays) : 0,
  }
}

/**
 * The balance row for an employee / type / year, created on demand from the
 * type's entitlement.
 *
 * Created lazily rather than up front for everyone: an institute that adds
 * a leave type in June should not need a batch job before anyone can use it.
 */
export async function ensureBalance(
  tx: Prisma.TransactionClient,
  employeeId: string,
  leaveTypeId: string,
  year: number,
) {
  const existing = await tx.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  })
  if (existing) return existing

  const type = await tx.leaveType.findUniqueOrThrow({ where: { id: leaveTypeId } })
  return tx.leaveBalance.create({
    data: {
      employeeId,
      leaveTypeId,
      year,
      entitledDays: type.annualEntitlementDays,
    },
  })
}

export interface BalanceView {
  leaveTypeId: string
  code: string
  name: string
  isPaid: boolean
  uncapped: boolean
  entitledDays: number
  carriedForwardDays: number
  usedDays: number
  availableDays: number
}

/** Every leave type with this employee's standing in the given year. */
export async function balancesFor(
  employeeId: string,
  year: number,
): Promise<BalanceView[]> {
  const [types, balances] = await Promise.all([
    db.leaveType.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: 'asc' },
    }),
    db.leaveBalance.findMany({ where: { employeeId, year } }),
  ])

  const byType = new Map(balances.map((b) => [b.leaveTypeId, b]))

  return types.map((t) => {
    const stored = byType.get(t.id) ?? null
    // An employee with no row yet still has their full entitlement.
    const balance = stored
      ? balanceOf(stored)
      : { entitledDays: Number(t.annualEntitlementDays), carriedForwardDays: 0, usedDays: 0 }

    return {
      leaveTypeId: t.id,
      code: t.code,
      name: t.name,
      isPaid: t.isPaid,
      uncapped: Number(t.annualEntitlementDays) <= 0,
      ...balance,
      availableDays: availableDays(balance),
    }
  })
}

export interface ApplyInput {
  branchId: string
  employeeId: string
  leaveTypeId: string
  from: IsoDate
  to: IsoDate
  fromPortion: DayPortion
  toPortion: DayPortion
  reason?: string | null
  appliedById: string
  /** Approve in the same step. Needs the approve permission at the caller. */
  autoApprove?: boolean
}

export async function applyForLeave(input: ApplyInput): Promise<{
  requestId: string
  days: number
  status: 'PENDING' | 'APPROVED'
}> {
  const type = await db.leaveType.findFirst({
    where: { id: input.leaveTypeId, archivedAt: null },
  })
  if (!type) throw new LeaveError('Choose an active leave type.')

  const employee = await db.employee.findFirst({
    where: { id: input.employeeId, branchId: input.branchId, archivedAt: null },
    select: { id: true, dateOfJoining: true, firstName: true },
  })
  if (!employee) throw new LeaveError('Employee not found in this branch.')

  const rule = ruleOf(type)
  const holidays = await holidayDatesBetween(
    input.branchId,
    fromIso(input.from),
    fromIso(input.to),
  )

  const span = {
    from: input.from,
    to: input.to,
    fromPortion: input.fromPortion,
    toPortion: input.toPortion,
  }
  const days = countLeaveDays(span, holidays)

  // The year the leave STARTS in owns the balance. A request spanning new
  // year is rare and would need splitting; refused rather than guessed.
  const year = fromIso(input.from).getUTCFullYear()
  if (fromIso(input.to).getUTCFullYear() !== year) {
    throw new LeaveError(
      'A leave request cannot span two calendar years, because each year has its own balance. Apply for each year separately.',
    )
  }

  const existing = await db.leaveRequest.findMany({
    where: {
      employeeId: input.employeeId,
      status: { in: ['PENDING', 'APPROVED'] },
    },
    select: { fromDate: true, toDate: true },
  })

  const stored = await db.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        year,
      },
    },
  })

  const blocked = requestBlockedReason({
    rule,
    balance: stored
      ? balanceOf(stored)
      : { entitledDays: rule.annualEntitlementDays, carriedForwardDays: 0, usedDays: 0 },
    days,
    existing: existing.map((e) => ({ from: toIso(e.fromDate), to: toIso(e.toDate) })),
    span,
    today: toIso(new Date()),
    joinedOn: employee.dateOfJoining ? toIso(employee.dateOfJoining) : null,
  })
  if (blocked) throw new LeaveError(blocked)

  const approveNow = input.autoApprove === true || !type.requiresApproval

  const request = await db.$transaction(async (tx) => {
    const created = await tx.leaveRequest.create({
      data: {
        branchId: input.branchId,
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        fromDate: fromIso(input.from),
        toDate: fromIso(input.to),
        fromPortion: input.fromPortion,
        toPortion: input.toPortion,
        days,
        reason: input.reason ?? null,
        appliedById: input.appliedById,
        status: 'PENDING',
      },
    })

    if (approveNow) {
      await approveInTransaction(tx, created.id, input.appliedById, null, holidays)
    }

    return created
  })

  return { requestId: request.id, days, status: approveNow ? 'APPROVED' : 'PENDING' }
}

/**
 * Approve a request: consume the balance and write the register.
 *
 * Both happen in the caller's transaction, because a balance consumed
 * without the matching attendance rows would be a day nobody can account
 * for, and attendance written without consuming the balance would let the
 * same entitlement be spent twice.
 */
async function approveInTransaction(
  tx: Prisma.TransactionClient,
  requestId: string,
  decidedById: string,
  note: string | null,
  holidayDates?: IsoDate[],
): Promise<void> {
  const request = await tx.leaveRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { leaveType: true },
  })
  if (request.status !== 'PENDING') {
    throw new LeaveError(`This request is already ${request.status.toLowerCase()}.`)
  }

  const rule = ruleOf(request.leaveType)
  const holidays =
    holidayDates ??
    (await holidayDatesBetween(request.branchId, request.fromDate, request.toDate))

  const days = leaveDays(
    {
      from: toIso(request.fromDate),
      to: toIso(request.toDate),
      fromPortion: request.fromPortion,
      toPortion: request.toPortion,
    },
    holidays,
  )

  const year = request.fromDate.getUTCFullYear()
  const balance = await ensureBalance(tx, request.employeeId, request.leaveTypeId, year)

  await tx.leaveBalance.update({
    where: { id: balance.id },
    data: { usedDays: { increment: request.days } },
  })

  // The register is the single path to payroll, so write it here rather
  // than letting payroll consult leave directly.
  for (const day of days) {
    const status = attendanceStatusFor(rule, day.portion)
    await tx.staffAttendance.upsert({
      where: {
        employeeId_date: { employeeId: request.employeeId, date: fromIso(day.date) },
      },
      create: {
        branchId: request.branchId,
        employeeId: request.employeeId,
        date: fromIso(day.date),
        status,
        remarks: `${request.leaveType.name}${day.portion === 'FULL' ? '' : ' (half day)'}`,
        markedById: decidedById,
      },
      update: {
        status,
        remarks: `${request.leaveType.name}${day.portion === 'FULL' ? '' : ' (half day)'}`,
        markedById: decidedById,
      },
    })
  }

  await tx.leaveRequest.update({
    where: { id: request.id },
    data: {
      status: 'APPROVED',
      decidedById,
      decidedAt: new Date(),
      decisionNote: note,
    },
  })
}

export async function approveLeave(input: {
  requestId: string
  decidedById: string
  note?: string | null
}): Promise<void> {
  await db.$transaction((tx) =>
    approveInTransaction(tx, input.requestId, input.decidedById, input.note ?? null),
  )
}

export async function rejectLeave(input: {
  requestId: string
  decidedById: string
  note: string
}): Promise<void> {
  if (!input.note.trim()) {
    throw new LeaveError('Give a reason for rejecting the request.')
  }

  const request = await db.leaveRequest.findUnique({
    where: { id: input.requestId },
    select: { status: true },
  })
  if (!request) throw new LeaveError('Request not found.')
  if (request.status !== 'PENDING') {
    throw new LeaveError(`This request is already ${request.status.toLowerCase()}.`)
  }

  await db.leaveRequest.update({
    where: { id: input.requestId },
    data: {
      status: 'REJECTED',
      decidedById: input.decidedById,
      decidedAt: new Date(),
      decisionNote: input.note.trim(),
    },
  })
}

/**
 * Cancel a request, returning the balance and clearing the register.
 *
 * Only the attendance rows this leave actually wrote are removed: a day
 * someone has since corrected to ABSENT by hand is left alone, because
 * silently reverting a human correction is worse than leaving a stale row
 * the office can see.
 */
export async function cancelLeave(input: {
  requestId: string
  reason: string
}): Promise<{ clearedDays: number; keptDays: number }> {
  if (!input.reason.trim()) throw new LeaveError('Give a reason for cancelling.')

  return db.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findUniqueOrThrow({
      where: { id: input.requestId },
      include: { leaveType: true },
    })
    if (request.status === 'CANCELLED') throw new LeaveError('Already cancelled.')
    if (request.status === 'REJECTED') {
      throw new LeaveError('A rejected request has nothing to cancel.')
    }

    let clearedDays = 0
    let keptDays = 0

    if (request.status === 'APPROVED') {
      const rule = ruleOf(request.leaveType)
      const holidays = await holidayDatesBetween(
        request.branchId,
        request.fromDate,
        request.toDate,
      )
      const days = leaveDays(
        {
          from: toIso(request.fromDate),
          to: toIso(request.toDate),
          fromPortion: request.fromPortion,
          toPortion: request.toPortion,
        },
        holidays,
      )

      for (const day of days) {
        const expected = attendanceStatusFor(rule, day.portion)
        const removed = await tx.staffAttendance.deleteMany({
          where: {
            employeeId: request.employeeId,
            date: fromIso(day.date),
            status: expected,
          },
        })
        if (removed.count > 0) clearedDays += 1
        else keptDays += 1
      }

      const year = request.fromDate.getUTCFullYear()
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
      })
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { usedDays: { decrement: request.days } },
        })
      }
    }

    await tx.leaveRequest.update({
      where: { id: request.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        decisionNote: input.reason.trim(),
      },
    })

    return { clearedDays, keptDays }
  })
}

/**
 * Roll unused days into next year for every employee.
 *
 * Deliberately a button someone presses, not something that happens on the
 * first login of January: a balance that changed by itself is one nobody
 * can explain to the person whose leave it is.
 */
export async function runCarryForward(input: {
  fromYear: number
  branchId: string
}): Promise<{ moved: number; employees: number }> {
  const types = await db.leaveType.findMany({
    where: { archivedAt: null, allowCarryForward: true },
  })
  if (types.length === 0) return { moved: 0, employees: 0 }

  let moved = 0
  const touched = new Set<string>()

  for (const type of types) {
    const rule = ruleOf(type)
    const balances = await db.leaveBalance.findMany({
      where: {
        leaveTypeId: type.id,
        year: input.fromYear,
        employee: { branchId: input.branchId, archivedAt: null },
      },
    })

    for (const balance of balances) {
      const carried = carryForwardDays(rule, balanceOf(balance))
      if (carried <= 0) continue

      await db.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: balance.employeeId,
            leaveTypeId: type.id,
            year: input.fromYear + 1,
          },
        },
        create: {
          employeeId: balance.employeeId,
          leaveTypeId: type.id,
          year: input.fromYear + 1,
          entitledDays: type.annualEntitlementDays,
          carriedForwardDays: carried,
        },
        update: { carriedForwardDays: carried },
      })
      moved += carried
      touched.add(balance.employeeId)
    }
  }

  return { moved, employees: touched.size }
}
