import { describe, expect, it } from 'vitest'
import {
  balancePaise,
  formatPaise,
  formatPaiseShort,
  groupIndian,
  lateFeeFor,
  parseRupeesToPaise,
} from './money'

describe('parseRupeesToPaise', () => {
  it('parses plain and formatted rupee input', () => {
    expect(parseRupeesToPaise('1250')).toBe(125000)
    expect(parseRupeesToPaise('1,250.50')).toBe(125050)
    expect(parseRupeesToPaise('₹1,250.50')).toBe(125050)
    expect(parseRupeesToPaise(1250.5)).toBe(125050)
    expect(parseRupeesToPaise('')).toBe(0)
  })

  it('rounds rather than truncating, so a paisa is never lost', () => {
    expect(parseRupeesToPaise('0.005')).toBe(1)
    expect(parseRupeesToPaise('99.994')).toBe(9999)
    expect(parseRupeesToPaise('99.995')).toBe(10000)
  })

  it('rejects junk instead of silently producing NaN', () => {
    expect(() => parseRupeesToPaise('abc')).toThrow()
    expect(() => parseRupeesToPaise('12.3.4')).toThrow()
  })
})

describe('groupIndian', () => {
  it('groups in lakhs/crores, not thousands', () => {
    expect(groupIndian(999)).toBe('999')
    expect(groupIndian(1234)).toBe('1,234')
    expect(groupIndian(1234567)).toBe('12,34,567')
    expect(groupIndian(123456789)).toBe('12,34,56,789')
  })
})

describe('formatPaise', () => {
  it('renders two decimals and the rupee symbol', () => {
    expect(formatPaise(125050)).toBe('₹1,250.50')
    expect(formatPaise(100)).toBe('₹1.00')
    expect(formatPaise(0)).toBe('₹0.00')
    expect(formatPaise(-125050)).toBe('-₹1,250.50')
  })
})

describe('formatPaiseShort', () => {
  it('uses lakh/crore units that Indian institutes actually read', () => {
    // Paise in, so: 4,86,00,000 paise = Rs 4.86 lakh
    expect(formatPaiseShort(48_600_000)).toBe('₹4.9L')
    // Rs 1 crore = 10,00,00,000 paise
    expect(formatPaiseShort(1_000_000_000)).toBe('₹1Cr')
    // Rs 10 lakh
    expect(formatPaiseShort(100_000_000)).toBe('₹10L')
    expect(formatPaiseShort(500_000)).toBe('₹5K')
    expect(formatPaiseShort(5_000)).toBe('₹50')
  })
})

describe('balancePaise', () => {
  it('derives outstanding from due + late fee - concession - paid', () => {
    expect(
      balancePaise({ duePaise: 1500000, concessionPaise: 0, lateFeePaise: 0, paidPaise: 0 }),
    ).toBe(1500000)
    expect(
      balancePaise({ duePaise: 1500000, concessionPaise: 250000, lateFeePaise: 0, paidPaise: 500000 }),
    ).toBe(750000)
  })

  it('never goes negative when an overpayment is allocated', () => {
    expect(
      balancePaise({ duePaise: 100000, concessionPaise: 0, lateFeePaise: 0, paidPaise: 150000 }),
    ).toBe(0)
  })
})

describe('lateFeeFor', () => {
  const policy = { graceDays: 7, lateFeePerDayPaise: 2000, lateFeeMaxPaise: 200000 }

  it('charges nothing inside the grace period', () => {
    expect(lateFeeFor(new Date('2026-10-01'), new Date('2026-10-05'), policy)).toBe(0)
    expect(lateFeeFor(new Date('2026-10-01'), new Date('2026-10-08'), policy)).toBe(0)
  })

  it('charges per day once grace has elapsed', () => {
    // 10 days late, 7 forgiven => 3 chargeable days at Rs 20
    expect(lateFeeFor(new Date('2026-10-01'), new Date('2026-10-11'), policy)).toBe(6000)
  })

  it('honours the cap', () => {
    expect(lateFeeFor(new Date('2026-01-01'), new Date('2026-12-31'), policy)).toBe(200000)
  })

  it('is disabled when no per-day rate is configured', () => {
    expect(
      lateFeeFor(new Date('2026-01-01'), new Date('2026-12-31'), {
        graceDays: 0,
        lateFeePerDayPaise: 0,
        lateFeeMaxPaise: 0,
      }),
    ).toBe(0)
  })
})
