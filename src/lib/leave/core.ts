/**
 * Leave rules — pure, so they can be tested exhaustively.
 *
 * ⚠ EVERY RULE HERE IS AN ASSUMPTION. There is no leave policy to work from:
 * the quotation never mentioned leave, and the attendance module shipped
 * with paid-versus-unpaid as a dropdown choice with nothing behind it.
 *
 * The consequential ones:
 *
 *   * whether a holiday inside a leave span consumes entitlement;
 *   * whether a request may exceed the balance;
 *   * what happens to unused days at the year end.
 *
 * All three are in this file, and all three are listed in
 * docs/open-questions.md #4b.
 */

import type { DayPortion } from '@prisma/client'

/** A date as YYYY-MM-DD. Leave is whole-day business; times never enter. */
export type IsoDate = string

export class LeaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LeaveError'
  }
}

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

export function fromIso(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

/** Every date from `from` to `to` inclusive. */
export function datesBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const start = fromIso(from)
  const end = fromIso(to)
  if (end < start) throw new LeaveError('The end date is before the start date.')

  const out: IsoDate[] = []
  const cursor = new Date(start)
  // A thousand days is far longer than any sane leave request and stops a
  // bad date range from spinning.
  for (let i = 0; i <= 1000 && cursor <= end; i += 1) {
    out.push(toIso(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  if (cursor <= end) {
    throw new LeaveError('That date range is too long to be a leave request.')
  }
  return out
}

export const PORTION_WEIGHT: Record<DayPortion, number> = {
  FULL: 1,
  FIRST_HALF: 0.5,
  SECOND_HALF: 0.5,
}

export interface LeaveSpan {
  from: IsoDate
  to: IsoDate
  fromPortion: DayPortion
  toPortion: DayPortion
}

export interface LeaveDay {
  date: IsoDate
  /** 1 for a whole day, 0.5 for a half. Holidays never appear here. */
  weight: number
  portion: DayPortion
}

/**
 * The working days a leave span actually consumes.
 *
 * ASSUMPTION: a declared holiday or weekly off inside the span costs
 * NOTHING. Taking Friday to Tuesday over a weekend consumes three days, not
 * five. The opposite rule exists (some employers count calendar days for
 * long leave) and would be a different function; this is the reading that
 * does not penalise someone for the institute being shut.
 *
 * A half-day marker on the first or last date halves that date only. A
 * single-day request may be a half day by setting both portions.
 */
export function leaveDays(span: LeaveSpan, holidayDates: IsoDate[]): LeaveDay[] {
  const holidays = new Set(holidayDates)
  // Holidays are removed FIRST, then the half-day markers are applied to
  // the first and last working day that remain. Applying them to the raw
  // range would lose a "leaves at midday" marker whenever the span happened
  // to start on a Sunday.
  const working = datesBetween(span.from, span.to).filter((d) => !holidays.has(d))
  if (working.length === 0) return []

  const single = working.length === 1

  return working.map((date, index) => {
    let portion: DayPortion = 'FULL'
    if (single) {
      // One working day: either marker halves it.
      portion =
        span.fromPortion !== 'FULL'
          ? span.fromPortion
          : span.toPortion !== 'FULL'
            ? span.toPortion
            : 'FULL'
    } else if (index === 0) {
      portion = span.fromPortion
    } else if (index === working.length - 1) {
      portion = span.toPortion
    }

    return { date, portion, weight: PORTION_WEIGHT[portion] }
  })
}

/** Total days consumed, to the half. */
export function countLeaveDays(span: LeaveSpan, holidayDates: IsoDate[]): number {
  const total = leaveDays(span, holidayDates).reduce((s, d) => s + d.weight, 0)
  return Math.round(total * 2) / 2
}

// ---------------------------------------------------------------- balances

export interface Balance {
  entitledDays: number
  carriedForwardDays: number
  usedDays: number
}

export function availableDays(balance: Balance): number {
  return (
    Math.round(
      (balance.entitledDays + balance.carriedForwardDays - balance.usedDays) * 2,
    ) / 2
  )
}

export interface LeaveTypeRule {
  name: string
  isPaid: boolean
  /** Zero means uncapped. */
  annualEntitlementDays: number
  allowCarryForward: boolean
  carryForwardCapDays: number
  requiresApproval: boolean
}

/**
 * ASSUMPTION: an UNCAPPED type (entitlement 0) is never short.
 *
 * Loss of pay is the obvious case — an employee can always take unpaid
 * leave, because the consequence is the deduction itself rather than a
 * refusal. Paid types carry a real entitlement and run out.
 */
export function isUncapped(rule: LeaveTypeRule): boolean {
  return rule.annualEntitlementDays <= 0
}

export interface RequestCheck {
  rule: LeaveTypeRule
  balance: Balance
  days: number
  /** Spans of existing PENDING or APPROVED requests for this employee. */
  existing: { from: IsoDate; to: IsoDate }[]
  span: LeaveSpan
  /** Today, so a back-dated request can be flagged. */
  today: IsoDate
  /** The employee's joining date, if known. */
  joinedOn?: IsoDate | null
}

/**
 * Why a request cannot be made, or null.
 *
 * Returns a reason rather than a boolean so the screen can say what is
 * wrong, which is the difference between a form people can use and one they
 * guess at.
 */
export function requestBlockedReason(input: RequestCheck): string | null {
  const { span, days, rule, balance } = input

  if (fromIso(span.to) < fromIso(span.from)) {
    return 'The last day of leave is before the first.'
  }

  if (days <= 0) {
    return 'Every day in that range is a holiday or weekly off, so there is no leave to take.'
  }

  if (input.joinedOn && span.from < input.joinedOn) {
    return `That is before ${input.joinedOn}, when this employee joined.`
  }

  // Overlap, inclusive on both ends: two requests covering the same day
  // would consume the balance twice and write the register twice.
  for (const other of input.existing) {
    if (span.from <= other.to && other.from <= span.to) {
      return `This overlaps an existing request from ${other.from} to ${other.to}.`
    }
  }

  if (!isUncapped(rule)) {
    const available = availableDays(balance)
    if (days > available) {
      return `Only ${available} day${available === 1 ? '' : 's'} of ${rule.name} remain, and this asks for ${days}. Apply for loss of pay instead, or reduce the dates.`
    }
  }

  return null
}

/**
 * ASSUMPTION about carry-forward: unused days roll into next year only for
 * types that allow it, capped, and the cap applies to the CARRIED amount —
 * not to the resulting total. An institute that caps the total instead needs
 * this one function changed.
 *
 * Nothing calls this automatically. Rolling a year over is a deliberate act
 * someone performs at the year end, because doing it silently on the first
 * login of January is how balances become inexplicable.
 */
export function carryForwardDays(
  rule: LeaveTypeRule,
  balance: Balance,
): number {
  if (!rule.allowCarryForward) return 0
  const unused = Math.max(0, availableDays(balance))
  if (rule.carryForwardCapDays <= 0) return unused
  return Math.min(unused, rule.carryForwardCapDays)
}

/**
 * The staff-attendance status an approved day of this type produces.
 *
 * This is the whole point of the module: a leave TYPE decides paid or
 * unpaid, rather than whoever happens to be marking the register that
 * morning.
 */
export function attendanceStatusFor(
  rule: LeaveTypeRule,
  portion: DayPortion,
): 'PAID_LEAVE' | 'UNPAID_LEAVE' | 'HALF_DAY' | 'PAID_HALF_DAY' {
  // The paid/unpaid split has to survive the half-day case. Mapping every
  // half to HALF_DAY would charge 0.5 days for a PAID half day, which is
  // the opposite of what paid leave means; mapping it to PAID_LEAVE would
  // lose the fact that they were only away half the day. Hence a distinct
  // PAID_HALF_DAY, weighted zero.
  if (portion !== 'FULL') {
    return rule.isPaid ? 'PAID_HALF_DAY' : 'HALF_DAY'
  }
  return rule.isPaid ? 'PAID_LEAVE' : 'UNPAID_LEAVE'
}

export const STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
} as const

export const PORTION_LABELS: Record<DayPortion, string> = {
  FULL: 'Full day',
  FIRST_HALF: 'First half',
  SECOND_HALF: 'Second half',
}
