import { describe, expect, it } from 'vitest'
import type { AttendanceStatus, StaffAttendanceStatus } from '@prisma/client'
import {
  DEFAULT_SHORTAGE_RULE,
  LOP_WEIGHT,
  attendancePercentage,
  attendedSessions,
  countsAsPresent,
  countsInDenominator,
  datesInMonth,
  heldSessions,
  isHoliday,
  lopDaysFrom,
  reducesPay,
  sessionsToReach,
  shortageBand,
  summariseStaffMonth,
  tally,
  workingDaysInMonth,
} from './core'

const S = (...xs: AttendanceStatus[]) => xs
const T = (...xs: StaffAttendanceStatus[]) => xs

describe('student status semantics', () => {
  it('counts a late arrival as present — they were in the room', () => {
    expect(countsAsPresent('LATE')).toBe(true)
    expect(countsAsPresent('PRESENT')).toBe(true)
    expect(countsAsPresent('ABSENT')).toBe(false)
  })

  it('takes an excused absence out of the denominator entirely', () => {
    // Counting it present inflates what the university sees; counting it
    // absent punishes an authorised absence.
    expect(countsInDenominator('EXCUSED')).toBe(false)
    expect(countsInDenominator('ABSENT')).toBe(true)
  })
})

describe('tally and percentage', () => {
  it('counts each status', () => {
    const t = tally(S('PRESENT', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED'))
    expect(t).toEqual({ present: 2, absent: 1, late: 1, excused: 1 })
  })

  it('excludes excused sessions from both sides', () => {
    const t = tally(S('PRESENT', 'ABSENT', 'EXCUSED', 'EXCUSED'))
    expect(heldSessions(t)).toBe(2)
    expect(attendedSessions(t)).toBe(1)
    expect(attendancePercentage(t)).toBe(50)
  })

  it('reports null rather than 0% when nothing countable was held', () => {
    // A student with no marked classes is not a defaulter.
    expect(attendancePercentage(tally(S()))).toBeNull()
    expect(attendancePercentage(tally(S('EXCUSED', 'EXCUSED')))).toBeNull()
  })

  it('rounds to two decimals', () => {
    const t = tally(S('PRESENT', 'PRESENT', 'ABSENT'))
    expect(attendancePercentage(t)).toBe(66.67)
  })

  it('gives 100 for a perfect record', () => {
    expect(attendancePercentage(tally(S('PRESENT', 'LATE')))).toBe(100)
  })

  it('gives 0 for a student who never attended', () => {
    expect(attendancePercentage(tally(S('ABSENT', 'ABSENT')))).toBe(0)
  })
})

describe('shortageBand', () => {
  it('passes a student at or above the requirement', () => {
    expect(shortageBand(75)).toBe('OK')
    expect(shortageBand(90)).toBe('OK')
  })

  it('flags the condonation range', () => {
    expect(shortageBand(74.99)).toBe('CONDONATION')
    expect(shortageBand(65)).toBe('CONDONATION')
  })

  it('flags a genuine shortage', () => {
    expect(shortageBand(64.99)).toBe('SHORT')
    expect(shortageBand(0)).toBe('SHORT')
  })

  it('distinguishes "no data" from "zero per cent"', () => {
    expect(shortageBand(null)).toBe('NO_DATA')
    expect(shortageBand(0)).toBe('SHORT')
  })

  it('takes the university’s own thresholds when they differ', () => {
    const strict = { requiredPercentage: 80, condonationPercentage: 70 }
    expect(shortageBand(75, strict)).toBe('CONDONATION')
    expect(shortageBand(75)).toBe('OK')
  })

  it('uses 75/65 by default, which is an assumption not a rule', () => {
    expect(DEFAULT_SHORTAGE_RULE).toEqual({
      requiredPercentage: 75,
      condonationPercentage: 65,
    })
  })
})

describe('sessionsToReach', () => {
  it('says nothing is needed when already clear', () => {
    expect(sessionsToReach(tally(S('PRESENT', 'PRESENT', 'PRESENT')), 75)).toBeNull()
  })

  it('works out how many consecutive sessions close the gap', () => {
    // 15 of 25 = 60%. (15+x)/(25+x) >= 0.75 -> 0.25x >= 3.75 -> x >= 15.
    const t = { present: 15, absent: 10, late: 0, excused: 0 }
    expect(sessionsToReach(t, 75)).toBe(15)
    // and check the answer is actually sufficient, not merely a number
    expect((15 + 15) / (25 + 15) * 100).toBeGreaterThanOrEqual(75)
    expect((15 + 14) / (25 + 14) * 100).toBeLessThan(75)
  })

  it('handles a student with no record yet', () => {
    expect(sessionsToReach(tally(S()), 75)).toBe(1)
  })

  it('gives up rather than looping forever on an unreachable target', () => {
    const t = { present: 0, absent: 1000, late: 0, excused: 0 }
    expect(sessionsToReach(t, 100, 50)).toBeNull()
  })
})

describe('staff loss of pay', () => {
  it('docks a full day for an unexplained absence', () => {
    expect(lopDaysFrom(T('ABSENT'))).toBe(1)
  })

  it('docks a full day for approved but unpaid leave', () => {
    expect(lopDaysFrom(T('UNPAID_LEAVE'))).toBe(1)
  })

  it('docks half a day for a half day', () => {
    expect(lopDaysFrom(T('HALF_DAY'))).toBe(0.5)
  })

  it('docks nothing for paid leave — that is the whole point of it', () => {
    expect(lopDaysFrom(T('PAID_LEAVE', 'PAID_LEAVE'))).toBe(0)
  })

  it('docks nothing for someone working elsewhere on institute business', () => {
    expect(lopDaysFrom(T('ON_DUTY'))).toBe(0)
  })

  it('never docks for a holiday, even if it was marked by mistake', () => {
    expect(lopDaysFrom(T('HOLIDAY', 'HOLIDAY'))).toBe(0)
  })

  it('treats an UNMARKED month as no loss of pay, not full absence', () => {
    // Payroll must not dock someone because the office forgot to open the
    // sheet. This is the most consequential assumption in the file.
    expect(lopDaysFrom(T())).toBe(0)
  })

  it('adds half days without floating-point drift', () => {
    expect(lopDaysFrom(T('HALF_DAY', 'HALF_DAY', 'HALF_DAY'))).toBe(1.5)
    const many = Array.from({ length: 7 }, () => 'HALF_DAY' as const)
    expect(lopDaysFrom(many)).toBe(3.5)
  })

  it('totals a realistic month', () => {
    const month = T(
      ...Array.from({ length: 20 }, () => 'PRESENT' as const),
      'PAID_LEAVE',
      'UNPAID_LEAVE',
      'HALF_DAY',
      'ABSENT',
      ...Array.from({ length: 4 }, () => 'HOLIDAY' as const),
    )
    expect(lopDaysFrom(month)).toBe(2.5)
  })

  it('agrees with the published weight table', () => {
    for (const [status, weight] of Object.entries(LOP_WEIGHT)) {
      expect(lopDaysFrom([status as StaffAttendanceStatus])).toBe(weight)
    }
  })

  it('knows which statuses cost money, for the UI to warn about', () => {
    expect(reducesPay('UNPAID_LEAVE')).toBe(true)
    expect(reducesPay('HALF_DAY')).toBe(true)
    expect(reducesPay('PAID_LEAVE')).toBe(false)
    expect(reducesPay('PRESENT')).toBe(false)
  })
})

describe('summariseStaffMonth', () => {
  it('breaks a month down and carries the loss-of-pay total', () => {
    const s = summariseStaffMonth(
      T('PRESENT', 'PRESENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HALF_DAY', 'HOLIDAY'),
    )
    expect(s).toEqual({
      marked: 6,
      present: 2,
      paidLeave: 1,
      unpaidLeave: 1,
      absent: 0,
      halfDays: 1,
      paidHalfDays: 0,
      onDuty: 0,
      holidays: 1,
      lopDays: 1.5,
    })
  })

  it('reports an empty month honestly', () => {
    expect(summariseStaffMonth(T()).marked).toBe(0)
    expect(summariseStaffMonth(T()).lopDays).toBe(0)
  })
})

describe('calendar', () => {
  it('lists every date in a month', () => {
    const d = datesInMonth(2026, 2)
    expect(d).toHaveLength(28)
    expect(d[0]).toBe('2026-02-01')
    expect(d[27]).toBe('2026-02-28')
  })

  it('knows a leap February', () => {
    expect(datesInMonth(2028, 2)).toHaveLength(29)
  })

  it('pads single-digit months and days', () => {
    expect(datesInMonth(2026, 1)[8]).toBe('2026-01-09')
  })

  it('subtracts declared holidays from the working days', () => {
    expect(workingDaysInMonth(2026, 4, [])).toBe(30)
    expect(workingDaysInMonth(2026, 4, ['2026-04-14', '2026-04-15'])).toBe(28)
  })

  it('ignores a holiday that falls outside the month', () => {
    expect(workingDaysInMonth(2026, 4, ['2026-05-01'])).toBe(30)
  })

  it('recognises a holiday date', () => {
    expect(isHoliday('2026-04-14', ['2026-04-14'])).toBe(true)
    expect(isHoliday('2026-04-13', ['2026-04-14'])).toBe(false)
  })
})

describe('the paid/unpaid split survives half days', () => {
  it('charges nothing for half a day of PAID leave', () => {
    // Found while building leave: mapping every half day to HALF_DAY
    // deducted 0.5 days for a paid half day, which is the opposite of what
    // paid leave means.
    expect(lopDaysFrom(T('PAID_HALF_DAY'))).toBe(0)
  })

  it('still charges half a day for an unpaid one', () => {
    expect(lopDaysFrom(T('HALF_DAY'))).toBe(0.5)
  })

  it('counts both kinds separately in a month summary', () => {
    const s = summariseStaffMonth(T('HALF_DAY', 'PAID_HALF_DAY', 'PAID_HALF_DAY'))
    expect(s.halfDays).toBe(1)
    expect(s.paidHalfDays).toBe(2)
    expect(s.lopDays).toBe(0.5)
  })
})
