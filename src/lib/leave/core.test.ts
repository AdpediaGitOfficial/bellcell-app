import { describe, expect, it } from 'vitest'
import {
  LeaveError,
  attendanceStatusFor,
  availableDays,
  carryForwardDays,
  countLeaveDays,
  datesBetween,
  isUncapped,
  leaveDays,
  requestBlockedReason,
  type Balance,
  type LeaveSpan,
  type LeaveTypeRule,
} from './core'

const casual: LeaveTypeRule = {
  name: 'Casual leave',
  isPaid: true,
  annualEntitlementDays: 12,
  allowCarryForward: false,
  carryForwardCapDays: 0,
  requiresApproval: true,
}

const earned: LeaveTypeRule = {
  name: 'Earned leave',
  isPaid: true,
  annualEntitlementDays: 15,
  allowCarryForward: true,
  carryForwardCapDays: 30,
  requiresApproval: true,
}

const lop: LeaveTypeRule = {
  name: 'Loss of pay',
  isPaid: false,
  annualEntitlementDays: 0,
  allowCarryForward: false,
  carryForwardCapDays: 0,
  requiresApproval: true,
}

const span = (
  from: string,
  to: string,
  fromPortion: LeaveSpan['fromPortion'] = 'FULL',
  toPortion: LeaveSpan['toPortion'] = 'FULL',
): LeaveSpan => ({ from, to, fromPortion, toPortion })

const balance = (over: Partial<Balance> = {}): Balance => ({
  entitledDays: 12,
  carriedForwardDays: 0,
  usedDays: 0,
  ...over,
})

describe('datesBetween', () => {
  it('is inclusive at both ends', () => {
    expect(datesBetween('2026-03-02', '2026-03-04')).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ])
  })

  it('handles a single day', () => {
    expect(datesBetween('2026-03-02', '2026-03-02')).toEqual(['2026-03-02'])
  })

  it('crosses a month boundary', () => {
    expect(datesBetween('2026-02-27', '2026-03-01')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ])
  })

  it('refuses a reversed range rather than returning nothing', () => {
    expect(() => datesBetween('2026-03-04', '2026-03-02')).toThrow(LeaveError)
  })
})

describe('leaveDays', () => {
  it('counts plain working days', () => {
    expect(countLeaveDays(span('2026-03-02', '2026-03-04'), [])).toBe(3)
  })

  it('does not charge for a holiday inside the span', () => {
    // Friday to Tuesday over a closed weekend is three days, not five.
    expect(
      countLeaveDays(span('2026-03-06', '2026-03-10'), ['2026-03-07', '2026-03-08']),
    ).toBe(3)
  })

  it('returns nothing when the whole span is holidays', () => {
    expect(countLeaveDays(span('2026-03-07', '2026-03-08'), ['2026-03-07', '2026-03-08'])).toBe(0)
  })

  it('halves the first day when someone leaves at midday', () => {
    expect(countLeaveDays(span('2026-03-02', '2026-03-04', 'SECOND_HALF'), [])).toBe(2.5)
  })

  it('halves the last day when someone returns at midday', () => {
    expect(countLeaveDays(span('2026-03-02', '2026-03-04', 'FULL', 'FIRST_HALF'), [])).toBe(2.5)
  })

  it('halves both ends', () => {
    expect(
      countLeaveDays(span('2026-03-02', '2026-03-04', 'SECOND_HALF', 'FIRST_HALF'), []),
    ).toBe(2)
  })

  it('treats a single half day as half a day', () => {
    expect(countLeaveDays(span('2026-03-02', '2026-03-02', 'FIRST_HALF'), [])).toBe(0.5)
    expect(countLeaveDays(span('2026-03-02', '2026-03-02', 'FULL', 'SECOND_HALF'), [])).toBe(0.5)
  })

  it('keeps a half-day marker when the span STARTS on a holiday', () => {
    // Holidays are removed before the markers are applied, so a request
    // that happens to begin on a Sunday does not lose its "leaves at
    // midday" marker to the Sunday.
    const days = leaveDays(span('2026-03-08', '2026-03-10', 'SECOND_HALF'), ['2026-03-08'])
    expect(days.map((d) => d.date)).toEqual(['2026-03-09', '2026-03-10'])
    expect(days[0]?.weight).toBe(0.5)
    expect(countLeaveDays(span('2026-03-08', '2026-03-10', 'SECOND_HALF'), ['2026-03-08'])).toBe(1.5)
  })

  it('never lets fractions drift', () => {
    expect(
      countLeaveDays(span('2026-03-02', '2026-03-06', 'SECOND_HALF', 'FIRST_HALF'), []),
    ).toBe(4)
  })
})

describe('balances', () => {
  it('subtracts what has been used', () => {
    expect(availableDays(balance({ usedDays: 4.5 }))).toBe(7.5)
  })

  it('adds carried-forward days', () => {
    expect(availableDays(balance({ carriedForwardDays: 3, usedDays: 2 }))).toBe(13)
  })

  it('can go negative, which is a fact worth showing rather than hiding', () => {
    expect(availableDays(balance({ usedDays: 15 }))).toBe(-3)
  })

  it('treats a zero entitlement as uncapped, not as none', () => {
    expect(isUncapped(lop)).toBe(true)
    expect(isUncapped(casual)).toBe(false)
  })
})

describe('carryForwardDays', () => {
  it('carries nothing for a type that does not allow it', () => {
    expect(carryForwardDays(casual, balance({ usedDays: 2 }))).toBe(0)
  })

  it('carries the unused remainder', () => {
    expect(carryForwardDays(earned, { entitledDays: 15, carriedForwardDays: 0, usedDays: 5 })).toBe(10)
  })

  it('applies the cap to the carried amount', () => {
    const generous = { ...earned, carryForwardCapDays: 6 }
    expect(carryForwardDays(generous, { entitledDays: 15, carriedForwardDays: 0, usedDays: 5 })).toBe(6)
  })

  it('carries nothing when the balance is overdrawn', () => {
    expect(carryForwardDays(earned, { entitledDays: 15, carriedForwardDays: 0, usedDays: 20 })).toBe(0)
  })

  it('carries everything when the cap is zero and carry-forward is on', () => {
    const uncapped = { ...earned, carryForwardCapDays: 0 }
    expect(carryForwardDays(uncapped, { entitledDays: 15, carriedForwardDays: 0, usedDays: 1 })).toBe(14)
  })
})

describe('requestBlockedReason', () => {
  const base = {
    rule: casual,
    balance: balance(),
    existing: [] as { from: string; to: string }[],
    today: '2026-03-01',
    joinedOn: null,
  }

  it('allows an ordinary request', () => {
    expect(
      requestBlockedReason({
        ...base,
        span: span('2026-03-02', '2026-03-03'),
        days: 2,
      }),
    ).toBeNull()
  })

  it('refuses a reversed range', () => {
    expect(
      requestBlockedReason({
        ...base,
        span: span('2026-03-05', '2026-03-02'),
        days: 0,
      }),
    ).toMatch(/before the first/)
  })

  it('refuses a span made entirely of holidays, and says why', () => {
    expect(
      requestBlockedReason({
        ...base,
        span: span('2026-03-07', '2026-03-08'),
        days: 0,
      }),
    ).toMatch(/holiday or weekly off/)
  })

  it('refuses more days than remain, and suggests the way out', () => {
    const reason = requestBlockedReason({
      ...base,
      balance: balance({ usedDays: 10 }),
      span: span('2026-03-02', '2026-03-06'),
      days: 5,
    })
    expect(reason).toMatch(/Only 2 days of Casual leave remain/)
    expect(reason).toMatch(/loss of pay/i)
  })

  it('allows exactly the remaining balance', () => {
    expect(
      requestBlockedReason({
        ...base,
        balance: balance({ usedDays: 10 }),
        span: span('2026-03-02', '2026-03-03'),
        days: 2,
      }),
    ).toBeNull()
  })

  it('never refuses an uncapped type for want of balance', () => {
    expect(
      requestBlockedReason({
        ...base,
        rule: lop,
        balance: { entitledDays: 0, carriedForwardDays: 0, usedDays: 99 },
        span: span('2026-03-02', '2026-03-30'),
        days: 29,
      }),
    ).toBeNull()
  })

  it('refuses an overlap with an existing request', () => {
    const reason = requestBlockedReason({
      ...base,
      existing: [{ from: '2026-03-03', to: '2026-03-05' }],
      span: span('2026-03-05', '2026-03-06'),
      days: 2,
    })
    expect(reason).toMatch(/overlaps an existing request/)
  })

  it('treats a touching-but-not-overlapping request as fine', () => {
    expect(
      requestBlockedReason({
        ...base,
        existing: [{ from: '2026-03-03', to: '2026-03-05' }],
        span: span('2026-03-06', '2026-03-07'),
        days: 2,
      }),
    ).toBeNull()
  })

  it('catches an overlap that fully contains an existing request', () => {
    expect(
      requestBlockedReason({
        ...base,
        existing: [{ from: '2026-03-10', to: '2026-03-11' }],
        span: span('2026-03-01', '2026-03-31'),
        days: 20,
      }),
    ).toMatch(/overlaps/)
  })

  it('refuses leave before the employee joined', () => {
    expect(
      requestBlockedReason({
        ...base,
        joinedOn: '2026-03-15',
        span: span('2026-03-02', '2026-03-03'),
        days: 2,
      }),
    ).toMatch(/before 2026-03-15/)
  })

  it('allows a back-dated request after joining — the office records these late', () => {
    expect(
      requestBlockedReason({
        ...base,
        today: '2026-06-01',
        span: span('2026-03-02', '2026-03-03'),
        days: 2,
      }),
    ).toBeNull()
  })
})

describe('attendanceStatusFor', () => {
  it('turns a paid type into PAID_LEAVE, which costs nothing', () => {
    expect(attendanceStatusFor(casual, 'FULL')).toBe('PAID_LEAVE')
  })

  it('turns an unpaid type into UNPAID_LEAVE, which costs a day', () => {
    expect(attendanceStatusFor(lop, 'FULL')).toBe('UNPAID_LEAVE')
  })

  it('keeps the paid/unpaid split on a HALF day', () => {
    // Mapping every half to HALF_DAY would charge 0.5 days for a PAID half
    // day — the opposite of what paid leave means.
    expect(attendanceStatusFor(casual, 'FIRST_HALF')).toBe('PAID_HALF_DAY')
    expect(attendanceStatusFor(lop, 'SECOND_HALF')).toBe('HALF_DAY')
  })
})
