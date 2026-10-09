/**
 * Attendance rules — pure, so they can be tested exhaustively.
 *
 * ⚠ EVERY RULE HERE IS AN ASSUMPTION.
 *
 * Attendance was explicitly out of scope in the quotation, which means there
 * is not even a vendor opinion to argue with. The rules below are a
 * defensible default for an Indian affiliated institute. Two of them have
 * real consequences if wrong:
 *
 *   * the shortage threshold decides who is barred from an examination;
 *   * the loss-of-pay mapping decides what comes out of someone's salary.
 *
 * Both are isolated here so the institute can change them in one file, and
 * both are listed for confirmation in docs/open-questions.md #4a.
 */

import type { AttendanceStatus, StaffAttendanceStatus } from '@prisma/client'

// ---------------------------------------------------------------- students

/**
 * ASSUMPTION: LATE counts as present.
 *
 * Someone who turned up late was in the room. Institutes that convert three
 * lates into an absence do it as a separate monthly adjustment, not in the
 * percentage, and that is not modelled.
 */
export function countsAsPresent(status: AttendanceStatus): boolean {
  return status === 'PRESENT' || status === 'LATE'
}

/**
 * ASSUMPTION: EXCUSED leaves the denominator entirely.
 *
 * A student on approved medical leave or representing the institute at a
 * tournament is neither present nor penalised. Counting it as present would
 * inflate the figure the university sees; counting it absent would punish an
 * authorised absence. Removing it from both sides is the honest reading, and
 * is why `heldSessions` is not simply the session count.
 */
export function countsInDenominator(status: AttendanceStatus): boolean {
  return status !== 'EXCUSED'
}

export interface AttendanceTally {
  present: number
  absent: number
  late: number
  excused: number
}

export const EMPTY_TALLY: AttendanceTally = {
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
}

export function tally(statuses: AttendanceStatus[]): AttendanceTally {
  const out = { ...EMPTY_TALLY }
  for (const s of statuses) {
    if (s === 'PRESENT') out.present += 1
    else if (s === 'ABSENT') out.absent += 1
    else if (s === 'LATE') out.late += 1
    else out.excused += 1
  }
  return out
}

/** Sessions that count towards the percentage. */
export function heldSessions(t: AttendanceTally): number {
  return t.present + t.absent + t.late
}

export function attendedSessions(t: AttendanceTally): number {
  return t.present + t.late
}

/**
 * Attendance percentage, rounded to two decimals.
 *
 * Returns null when nothing countable was held: a student with no sessions
 * has no percentage, and reporting 0% would make them look like a defaulter
 * when the truth is that no class was marked.
 */
export function attendancePercentage(t: AttendanceTally): number | null {
  const held = heldSessions(t)
  if (held === 0) return null
  return Math.round((attendedSessions(t) / held) * 10000) / 100
}

export type ShortageBand = 'OK' | 'CONDONATION' | 'SHORT' | 'NO_DATA'

export interface ShortageRule {
  /** At or above this, no problem. */
  requiredPercentage: number
  /** At or above this but below required, condonable on payment of a fee. */
  condonationPercentage: number
}

/**
 * ASSUMPTION: 75% required, 65% condonable.
 *
 * These are the most common figures at Indian universities, but they are set
 * by the AFFILIATING BODY, not by the institute, and they differ between
 * universities and sometimes between courses. They are a parameter for that
 * reason — nothing in this file hard-codes them.
 */
export const DEFAULT_SHORTAGE_RULE: ShortageRule = {
  requiredPercentage: 75,
  condonationPercentage: 65,
}

export function shortageBand(
  percentage: number | null,
  rule: ShortageRule = DEFAULT_SHORTAGE_RULE,
): ShortageBand {
  if (percentage === null) return 'NO_DATA'
  if (percentage >= rule.requiredPercentage) return 'OK'
  if (percentage >= rule.condonationPercentage) return 'CONDONATION'
  return 'SHORT'
}

/**
 * How many more consecutive sessions the student must attend to reach the
 * requirement. Null when they are already there, or when it cannot be
 * reached within a sane number of sessions.
 *
 * Useful precisely because "you are at 68%" tells a student nothing
 * actionable, whereas "attend the next 14 and you are clear" does.
 */
export function sessionsToReach(
  t: AttendanceTally,
  target: number,
  maxLookahead = 500,
): number | null {
  const held = heldSessions(t)
  const attended = attendedSessions(t)
  if (held > 0 && (attended / held) * 100 >= target) return null

  for (let extra = 1; extra <= maxLookahead; extra += 1) {
    if (((attended + extra) / (held + extra)) * 100 >= target) return extra
  }
  return null
}

// ------------------------------------------------------------------- staff

/**
 * ASSUMPTION: how each staff status maps to loss of pay.
 *
 *   ABSENT         1 day   — absent with no approved leave
 *   UNPAID_LEAVE   1 day   — approved, but unpaid
 *   HALF_DAY       0.5 day — half a day away, unpaid
 *   PAID_HALF_DAY  0       — half a day away against PAID leave. Costs
 *                            nothing: paid leave is paid whether it is a
 *                            whole day or half of one.
 *   PAID_LEAVE     0       — the whole point of paid leave
 *   ON_DUTY        0       — working, just not here
 *   PRESENT        0
 *   HOLIDAY        0       — never a deduction, even if marked by mistake
 *
 * LEAVE BALANCES ARE NOT MODELLED. Whether a particular day of leave is paid
 * is a judgement the office makes when marking it, not something this system
 * works out from an entitlement — there is no leave policy to work from. See
 * open question #4a.
 */
export const LOP_WEIGHT: Record<StaffAttendanceStatus, number> = {
  ABSENT: 1,
  UNPAID_LEAVE: 1,
  HALF_DAY: 0.5,
  PAID_HALF_DAY: 0,
  PAID_LEAVE: 0,
  ON_DUTY: 0,
  PRESENT: 0,
  HOLIDAY: 0,
}

/**
 * Loss-of-pay days for a month.
 *
 * ASSUMPTION, and the important one: a day that was never marked counts as
 * PRESENT, not absent. Payroll must not dock someone because the office
 * forgot to open the attendance sheet on a Tuesday. The run screen says how
 * many days were actually marked, so a half-empty month is visible rather
 * than silently generous.
 */
export function lopDaysFrom(statuses: StaffAttendanceStatus[]): number {
  const total = statuses.reduce((sum, s) => sum + (LOP_WEIGHT[s] ?? 0), 0)
  // Half days are the only fractions, so this cannot drift.
  return Math.round(total * 2) / 2
}

export interface StaffMonthSummary {
  marked: number
  present: number
  paidLeave: number
  unpaidLeave: number
  absent: number
  /** Unpaid half days — the ones that cost money. */
  halfDays: number
  paidHalfDays: number
  onDuty: number
  holidays: number
  lopDays: number
}

export function summariseStaffMonth(
  statuses: StaffAttendanceStatus[],
): StaffMonthSummary {
  const count = (s: StaffAttendanceStatus) =>
    statuses.filter((x) => x === s).length

  return {
    marked: statuses.length,
    present: count('PRESENT'),
    paidLeave: count('PAID_LEAVE'),
    unpaidLeave: count('UNPAID_LEAVE'),
    absent: count('ABSENT'),
    halfDays: count('HALF_DAY'),
    paidHalfDays: count('PAID_HALF_DAY'),
    onDuty: count('ON_DUTY'),
    holidays: count('HOLIDAY'),
    lopDays: lopDaysFrom(statuses),
  }
}

// ----------------------------------------------------------------- calendar

/** Every date in a month, as YYYY-MM-DD in UTC. */
export function datesInMonth(year: number, month: number): string[] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: days }, (_, i) => isoDate(year, month, i + 1))
}

export function isoDate(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * Working days in a month: calendar days less declared holidays.
 *
 * ASSUMPTION: this is NOT what payroll divides by. Payroll pro-rates on
 * calendar days or on a fixed standard (ADR-037), because that is how a
 * monthly salary works — a month with four Sundays does not pay less than
 * one with five. This figure is for the attendance screens, to tell an
 * office how many days they were supposed to mark.
 */
export function workingDaysInMonth(
  year: number,
  month: number,
  holidayDates: string[],
): number {
  const holidays = new Set(holidayDates)
  return datesInMonth(year, month).filter((d) => !holidays.has(d)).length
}

/** True when the date is a declared holiday or weekly off. */
export function isHoliday(date: string, holidayDates: string[]): boolean {
  return holidayDates.includes(date)
}

export const STUDENT_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  EXCUSED: 'Excused',
}

export const STAFF_STATUS_LABELS: Record<StaffAttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HALF_DAY: 'Half day (unpaid)',
  PAID_HALF_DAY: 'Half day (paid)',
  PAID_LEAVE: 'Paid leave',
  UNPAID_LEAVE: 'Unpaid leave',
  ON_DUTY: 'On duty',
  HOLIDAY: 'Holiday',
}

/** The statuses that reduce pay, for the UI to warn about. */
export function reducesPay(status: StaffAttendanceStatus): boolean {
  return LOP_WEIGHT[status] > 0
}
