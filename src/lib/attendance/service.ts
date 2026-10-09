import 'server-only'
import type { StaffAttendanceStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { lopDaysFrom, summariseStaffMonth, type StaffMonthSummary } from './core'

/**
 * Attendance as it touches the database.
 *
 * The one function that matters outside this module is
 * `staffLopForMonth` — payroll reads it, so a wrong answer here is a wrong
 * salary.
 */

function monthRange(year: number, month: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  }
}

export interface StaffLop {
  lopDays: number
  /** How many days of the month were actually marked. */
  markedDays: number
}

/**
 * Loss-of-pay days per employee for one month, keyed by employee id.
 *
 * Employees with no rows at all are simply absent from the map — the caller
 * must treat that as "no attendance recorded", not "zero loss of pay by
 * decision", because the two mean different things on screen.
 */
export async function staffLopForMonth(
  branchId: string,
  year: number,
  month: number,
): Promise<Map<string, StaffLop>> {
  const rows = await db.staffAttendance.findMany({
    where: { branchId, date: monthRange(year, month) },
    select: { employeeId: true, status: true },
  })

  const byEmployee = new Map<string, StaffAttendanceStatus[]>()
  for (const row of rows) {
    const list = byEmployee.get(row.employeeId) ?? []
    list.push(row.status)
    byEmployee.set(row.employeeId, list)
  }

  const out = new Map<string, StaffLop>()
  for (const [employeeId, statuses] of byEmployee) {
    out.set(employeeId, {
      lopDays: lopDaysFrom(statuses),
      markedDays: statuses.length,
    })
  }
  return out
}

export async function staffMonthSummary(
  branchId: string,
  employeeId: string,
  year: number,
  month: number,
): Promise<StaffMonthSummary> {
  const rows = await db.staffAttendance.findMany({
    where: { branchId, employeeId, date: monthRange(year, month) },
    select: { status: true },
  })
  return summariseStaffMonth(rows.map((r) => r.status))
}

/** Holiday dates (YYYY-MM-DD) that apply to a branch in a month. */
export async function holidayDatesFor(
  branchId: string,
  year: number,
  month: number,
): Promise<string[]> {
  const rows = await db.holiday.findMany({
    where: {
      // A null branch means the holiday applies everywhere.
      OR: [{ branchId }, { branchId: null }],
      date: monthRange(year, month),
    },
    select: { date: true },
  })
  return rows.map((r) => r.date.toISOString().slice(0, 10))
}

export async function holidayDatesBetween(
  branchId: string,
  from: Date,
  to: Date,
): Promise<string[]> {
  const rows = await db.holiday.findMany({
    where: { OR: [{ branchId }, { branchId: null }], date: { gte: from, lte: to } },
    select: { date: true },
  })
  return rows.map((r) => r.date.toISOString().slice(0, 10))
}
