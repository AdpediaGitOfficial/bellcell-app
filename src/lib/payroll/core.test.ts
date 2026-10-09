import { describe, expect, it } from 'vitest'
import {
  PayrollError,
  buildPayslip,
  ceilToRupee,
  computeEarnings,
  computeEsi,
  computePf,
  daysInMonth,
  professionalTaxFor,
  professionalTaxForMonth,
  proRate,
  roundToRupee,
  structureInForce,
  type ComponentSpec,
  type StatutoryConfig,
  type StructureLine,
} from './core'

const R = (rupees: number) => rupees * 100

function component(over: Partial<ComponentSpec> & { code: string }): ComponentSpec {
  return {
    id: `c-${over.code}`,
    name: over.code,
    kind: 'EARNING',
    calculation: 'FIXED',
    percentage: null,
    partOfBasic: false,
    proRated: true,
    isStatutory: false,
    sortOrder: 0,
    ...over,
  }
}

const BASIC = component({ code: 'BASIC', name: 'Basic', partOfBasic: true, sortOrder: 1 })
const DA = component({ code: 'DA', name: 'Dearness allowance', partOfBasic: true, sortOrder: 2 })
const HRA = component({
  code: 'HRA',
  name: 'House rent allowance',
  calculation: 'PERCENT_OF_BASIC',
  percentage: 40,
  sortOrder: 3,
})

/** Everything off — the shape an unconfigured institute has. */
const OFF: StatutoryConfig = {
  pfEnabled: false,
  pfEmployeeRate: 12,
  pfEmployerRate: 12,
  pfWageCeilingPaise: R(15000),
  esiEnabled: false,
  esiEmployeeRate: 0.75,
  esiEmployerRate: 3.25,
  esiEligibilityPaise: R(21000),
  ptEnabled: false,
  ptSlabs: [],
}

const ON: StatutoryConfig = {
  ...OFF,
  pfEnabled: true,
  esiEnabled: true,
  ptEnabled: true,
  ptSlabs: [
    { fromPaise: 0, toPaise: R(11999), amountPaise: 0 },
    { fromPaise: R(12000), toPaise: R(17999), amountPaise: R(120) },
    { fromPaise: R(18000), toPaise: R(29999), amountPaise: R(180) },
    { fromPaise: R(30000), toPaise: null, amountPaise: R(300) },
  ],
}

const structure = (lines: [ComponentSpec, number][]): StructureLine[] =>
  lines.map(([component, amountPaise]) => ({ component, amountPaise }))

describe('rounding', () => {
  it('rounds statutory amounts to whole rupees', () => {
    expect(roundToRupee(123_49)).toBe(123_00)
    expect(roundToRupee(123_50)).toBe(124_00)
  })

  it('rounds ESI up, which is ESIC’s own rule and not the same as PF’s', () => {
    expect(ceilToRupee(123_01)).toBe(124_00)
    expect(ceilToRupee(123_00)).toBe(123_00)
  })
})

describe('proRate', () => {
  it('pays the full amount when nothing was lost', () => {
    expect(proRate(R(30000), 30, 30)).toBe(R(30000))
  })

  it('reduces by calendar days', () => {
    expect(proRate(R(30000), 27, 30)).toBe(R(27000))
  })

  it('pays nothing for a month entirely unpaid', () => {
    expect(proRate(R(30000), 0, 30)).toBe(0)
  })

  it('refuses a period with no working days rather than dividing by zero', () => {
    expect(() => proRate(R(1000), 0, 0)).toThrow(PayrollError)
  })
})

describe('computeEarnings', () => {
  it('totals fixed components', () => {
    const result = computeEarnings(
      structure([[BASIC, R(20000)], [DA, R(5000)]]),
      30,
      30,
    )
    expect(result.grossPaise).toBe(R(25000))
    expect(result.basicPaise).toBe(R(25000))
  })

  it('computes a percentage component off basic + DA, not off gross', () => {
    const result = computeEarnings(
      structure([[BASIC, R(20000)], [DA, R(5000)], [HRA, 0]]),
      30,
      30,
    )
    // 40% of 25,000 = 10,000
    expect(result.grossPaise).toBe(R(35000))
    expect(result.basicPaise).toBe(R(25000)) // HRA is not part of basic
  })

  it('does not pro-rate twice when a percentage component meets unpaid leave', () => {
    // 3 days unpaid out of 30. HRA must be 40% of the FULL basic, then
    // reduced once — not 40% of an already-reduced basic.
    const result = computeEarnings(
      structure([[BASIC, R(20000)], [DA, R(5000)], [HRA, 0]]),
      27,
      30,
    )
    expect(result.grossPaise).toBe(R(31500)) // 35,000 * 27/30
  })

  it('leaves a non-pro-rated component whole during unpaid leave', () => {
    const reimbursement = component({
      code: 'REIMB',
      name: 'Phone reimbursement',
      proRated: false,
      sortOrder: 5,
    })
    const result = computeEarnings(
      structure([[BASIC, R(20000)], [reimbursement, R(1000)]]),
      15,
      30,
    )
    expect(result.grossPaise).toBe(R(10000) + R(1000))
  })

  it('applies a percent-of-gross component to what came before it, never to itself', () => {
    const bonus = component({
      code: 'SPL',
      name: 'Special allowance',
      calculation: 'PERCENT_OF_GROSS',
      percentage: 10,
      sortOrder: 4,
    })
    const result = computeEarnings(
      structure([[BASIC, R(20000)], [bonus, 0]]),
      30,
      30,
    )
    expect(result.grossPaise).toBe(R(22000))
  })
})

describe('computePf', () => {
  it('deducts nothing at all when PF is not switched on', () => {
    expect(computePf(R(25000), OFF)).toEqual({
      employeePaise: 0,
      employerPaise: 0,
      basePaise: 0,
    })
  })

  it('computes 12% of the wage base', () => {
    const pf = computePf(R(10000), ON)
    expect(pf.employeePaise).toBe(R(1200))
    expect(pf.employerPaise).toBe(R(1200))
  })

  it('caps the base at the wage ceiling', () => {
    const pf = computePf(R(40000), ON)
    expect(pf.basePaise).toBe(R(15000))
    expect(pf.employeePaise).toBe(R(1800)) // 12% of 15,000, not of 40,000
  })

  it('contributes on full wages when the ceiling is raised out of the way', () => {
    const pf = computePf(R(40000), { ...ON, pfWageCeilingPaise: R(10_000_000) })
    expect(pf.employeePaise).toBe(R(4800))
  })

  it('does NOT pro-rate the ceiling for a part month — a contested reading, pinned here', () => {
    // 40,000 basic, half the month unpaid -> 20,000 earned, still over the
    // 15,000 ceiling, so PF stays at 12% of 15,000. If the institute's PF
    // consultant says the ceiling pro-rates too, this test is what changes.
    expect(computePf(R(20000), ON).basePaise).toBe(R(15000))
    expect(computePf(R(20000), ON).employeePaise).toBe(R(1800))
  })

  it('rounds the contribution to a whole rupee so it matches the challan', () => {
    // 12% of 12,345.67 = 1,481.4804
    const pf = computePf(1_234_567, ON)
    expect(pf.employeePaise % 100).toBe(0)
    expect(pf.employeePaise).toBe(R(1481))
  })
})

describe('computeEsi', () => {
  it('deducts nothing when ESI is not switched on', () => {
    expect(computeEsi(R(15000), OFF).covered).toBe(false)
  })

  it('covers an employee under the eligibility threshold', () => {
    const esi = computeEsi(R(20000), ON)
    expect(esi.covered).toBe(true)
    expect(esi.employeePaise).toBe(R(150)) // 0.75%
    expect(esi.employerPaise).toBe(R(650)) // 3.25%
  })

  it('does not cover an employee above the threshold — the base is not capped', () => {
    const esi = computeEsi(R(25000), ON)
    expect(esi.covered).toBe(false)
    expect(esi.employeePaise).toBe(0)
  })

  it('treats the threshold as inclusive', () => {
    expect(computeEsi(R(21000), ON).covered).toBe(true)
    expect(computeEsi(R(21001), ON).covered).toBe(false)
  })

  it('rounds up rather than to nearest', () => {
    // 0.75% of 10,001 = 75.0075 -> 76
    expect(computeEsi(R(10001), ON).employeePaise).toBe(R(76))
  })
})

describe('professional tax', () => {
  it('is zero when not switched on', () => {
    expect(professionalTaxFor(R(200000), OFF)).toBe(0)
  })

  it('picks the matching slab', () => {
    expect(professionalTaxFor(R(15000), ON)).toBe(R(120))
    expect(professionalTaxFor(R(25000), ON)).toBe(R(180))
  })

  it('uses the open-ended top slab', () => {
    expect(professionalTaxFor(R(500000), ON)).toBe(R(300))
  })

  it('charges nothing below the first threshold', () => {
    expect(professionalTaxFor(R(5000), ON)).toBe(0)
  })

  it('falls due only in the last month of each half-year', () => {
    const gross = R(5000) // x6 = 30,000 -> top slab
    expect(professionalTaxForMonth(3, gross, ON)).toBe(R(300))
    expect(professionalTaxForMonth(9, gross, ON)).toBe(R(300))
    expect(professionalTaxForMonth(4, gross, ON)).toBe(0)
    expect(professionalTaxForMonth(12, gross, ON)).toBe(0)
  })
})

describe('buildPayslip', () => {
  const lines = structure([[BASIC, R(20000)], [DA, R(5000)], [HRA, 0]])

  it('pays gross with no deductions at an unconfigured institute', () => {
    const slip = buildPayslip({ lines, workingDays: 30, lopDays: 0, month: 4, config: OFF })
    expect(slip.grossPaise).toBe(R(35000))
    expect(slip.deductionsPaise).toBe(0)
    expect(slip.netPaise).toBe(R(35000))
    expect(slip.employerContributionPaise).toBe(0)
  })

  it('never invents a statutory deduction from a default', () => {
    const slip = buildPayslip({ lines, workingDays: 30, lopDays: 0, month: 4, config: OFF })
    expect(slip.lines.some((l) => l.isStatutory)).toBe(false)
  })

  it('deducts PF on basic + DA once switched on', () => {
    const slip = buildPayslip({ lines, workingDays: 30, lopDays: 0, month: 4, config: ON })
    const pf = slip.lines.find((l) => l.code === 'PF_EE')
    // Basic + DA is 25,000, over the 15,000 ceiling -> 12% of 15,000
    expect(pf?.amountPaise).toBe(R(1800))
  })

  it('leaves ESI off a salary above the threshold', () => {
    const slip = buildPayslip({ lines, workingDays: 30, lopDays: 0, month: 4, config: ON })
    expect(slip.lines.find((l) => l.code === 'ESI_EE')).toBeUndefined()
  })

  it('applies ESI to a salary under the threshold', () => {
    const small = structure([[BASIC, R(8000)], [DA, R(2000)]])
    const slip = buildPayslip({ lines: small, workingDays: 30, lopDays: 0, month: 4, config: ON })
    expect(slip.lines.find((l) => l.code === 'ESI_EE')?.amountPaise).toBe(R(75))
    expect(slip.lines.find((l) => l.code === 'ESI_ER')?.amountPaise).toBe(R(325))
  })

  it('reports employer contributions without taking them from take-home', () => {
    const small = structure([[BASIC, R(8000)], [DA, R(2000)]])
    const slip = buildPayslip({ lines: small, workingDays: 30, lopDays: 0, month: 4, config: ON })
    const employee = R(1200) + R(75) // PF 12% of 10,000, ESI 0.75%
    expect(slip.deductionsPaise).toBe(employee)
    expect(slip.netPaise).toBe(R(10000) - employee)
    expect(slip.employerContributionPaise).toBe(R(1200) + R(325))
  })

  it('balances: gross minus deductions equals net, every time', () => {
    for (const lop of [0, 1, 3.5, 15, 29]) {
      const slip = buildPayslip({ lines, workingDays: 30, lopDays: lop, month: 9, config: ON })
      expect(slip.grossPaise - slip.deductionsPaise).toBe(slip.netPaise)
    }
  })

  it('reduces PF along with the wage when there is unpaid leave', () => {
    const small = structure([[BASIC, R(8000)], [DA, R(2000)]])
    const full = buildPayslip({ lines: small, workingDays: 30, lopDays: 0, month: 4, config: ON })
    const half = buildPayslip({ lines: small, workingDays: 30, lopDays: 15, month: 4, config: ON })
    expect(half.grossPaise).toBe(full.grossPaise / 2)
    expect(half.lines.find((l) => l.code === 'PF_EE')?.amountPaise).toBe(R(600))
  })

  it('carries a manual TDS figure through untouched', () => {
    const slip = buildPayslip({
      lines,
      workingDays: 30,
      lopDays: 0,
      month: 4,
      config: ON,
      manualTdsPaise: R(2500),
    })
    expect(slip.lines.find((l) => l.code === 'TDS')?.amountPaise).toBe(R(2500))
  })

  it('refuses rather than paying a negative salary', () => {
    const loan = component({ code: 'LOAN', name: 'Loan recovery', kind: 'DEDUCTION', sortOrder: 10 })
    expect(() =>
      buildPayslip({
        lines: structure([[BASIC, R(10000)], [loan, R(50000)]]),
        workingDays: 30,
        lopDays: 0,
        month: 4,
        config: OFF,
      }),
    ).toThrow(/negative salary/)
  })

  it('refuses more unpaid days than the period has', () => {
    expect(() =>
      buildPayslip({ lines, workingDays: 30, lopDays: 31, month: 4, config: ON }),
    ).toThrow(/cannot exceed/)
  })

  it('refuses negative unpaid days', () => {
    expect(() =>
      buildPayslip({ lines, workingDays: 30, lopDays: -1, month: 4, config: ON }),
    ).toThrow(PayrollError)
  })

  it('charges professional tax only in a due month', () => {
    const march = buildPayslip({ lines, workingDays: 31, lopDays: 0, month: 3, config: ON })
    const april = buildPayslip({ lines, workingDays: 30, lopDays: 0, month: 4, config: ON })
    expect(march.lines.find((l) => l.code === 'PT')?.amountPaise).toBe(R(300))
    expect(april.lines.find((l) => l.code === 'PT')).toBeUndefined()
  })
})

describe('daysInMonth', () => {
  it('knows the short months', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 1)).toBe(31)
  })

  it('knows a leap February', () => {
    expect(daysInMonth(2028, 2)).toBe(29)
  })
})

describe('structureInForce', () => {
  const a = { id: 'a', effectiveFrom: new Date('2025-04-01'), effectiveTo: new Date('2026-03-31') }
  const b = { id: 'b', effectiveFrom: new Date('2026-04-01'), effectiveTo: null }

  it('picks the structure that was in force, not merely the latest', () => {
    expect(structureInForce([a, b], new Date('2025-09-15'))?.id).toBe('a')
    expect(structureInForce([a, b], new Date('2026-09-15'))?.id).toBe('b')
  })

  it('returns nothing for a date before any structure existed', () => {
    expect(structureInForce([a, b], new Date('2024-01-01'))).toBeNull()
  })

  it('treats the boundary dates as inclusive', () => {
    expect(structureInForce([a, b], new Date('2026-03-31'))?.id).toBe('a')
    expect(structureInForce([a, b], new Date('2026-04-01'))?.id).toBe('b')
  })
})
