/**
 * Payroll calculation — pure, so every rule can be tested exhaustively.
 *
 * ⚠ READ THIS BEFORE CHANGING A NUMBER.
 *
 * The quotation names "Salary Details" in its Employee intro and specifies
 * nothing further: no components, no statutory treatment, no pay cycle. So
 * this file is a design, and unlike the examination rules (ADR-024) a wrong
 * answer here is not an embarrassment — it is money owed to the Employees'
 * Provident Fund Organisation, to ESIC, or to the state.
 *
 * Three rules follow from that:
 *
 *   1. NOTHING STATUTORY IS DEDUCTED UNLESS SWITCHED ON. Every toggle in
 *      PayrollSetting defaults to false. An institute that is not registered
 *      for PF must never see PF on a payslip because a default said so.
 *   2. NO RATE IS HARD-CODED. The defaults in the schema are the statutory
 *      figures at the time of writing, but they are *editable settings*, not
 *      constants, because they change by notification and this code will
 *      outlive the current ones.
 *   3. INCOME TAX IS NOT COMPUTED HERE. See `manualTdsPaise` and ADR-034.
 *
 * Confirm the lot against Bell Cell's actual registrations before the first
 * real run — docs/open-questions.md #4.
 */

import type { SalaryCalculation, SalaryComponentKind } from '@prisma/client'

/** A component as the engine needs it, free of Prisma types. */
export interface ComponentSpec {
  id: string
  code: string
  name: string
  kind: SalaryComponentKind
  calculation: SalaryCalculation
  /** Percent, for PERCENT_OF_BASIC / PERCENT_OF_GROSS. */
  percentage: number | null
  /** Counts towards the PF/ESI wage base. */
  partOfBasic: boolean
  /** Reduced when the employee was not paid for the whole period. */
  proRated: boolean
  isStatutory: boolean
  sortOrder: number
}

/** One line of an employee's salary structure. */
export interface StructureLine {
  component: ComponentSpec
  /** Used only when calculation is FIXED. */
  amountPaise: number
}

export interface StatutoryConfig {
  pfEnabled: boolean
  pfEmployeeRate: number
  pfEmployerRate: number
  pfWageCeilingPaise: number

  esiEnabled: boolean
  esiEmployeeRate: number
  esiEmployerRate: number
  esiEligibilityPaise: number

  ptEnabled: boolean
  /** Half-yearly professional-tax slabs, ascending. */
  ptSlabs: TaxSlab[]
}

export interface TaxSlab {
  fromPaise: number
  /** Null means "and above". */
  toPaise: number | null
  amountPaise: number
}

export interface PayslipLineResult {
  componentId: string | null
  code: string
  label: string
  kind: SalaryComponentKind
  amountPaise: number
  isStatutory: boolean
  sortOrder: number
}

export interface PayslipResult {
  lines: PayslipLineResult[]
  grossPaise: number
  deductionsPaise: number
  netPaise: number
  employerContributionPaise: number
  /** The base PF was computed on, for the register. */
  pfWagePaise: number
}

export class PayrollError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayrollError'
  }
}

/**
 * Round to whole rupees.
 *
 * PF and ESI contributions are remitted in whole rupees, so a payslip that
 * shows paise on them will never agree with the challan. Earnings keep their
 * paise; only statutory figures go through this.
 *
 * ASSUMPTION: round half up. ESIC's own rule is to round UP to the next
 * rupee; that is `ceilToRupee` below and is applied to ESI specifically.
 */
export function roundToRupee(paise: number): number {
  return Math.round(paise / 100) * 100
}

export function ceilToRupee(paise: number): number {
  return Math.ceil(paise / 100) * 100
}

/**
 * Pro-rate an amount for part of a period.
 *
 * ASSUMPTION: a calendar-day basis — someone absent without pay for 3 of 30
 * days receives 27/30. The alternative (a fixed 26-day month, common where
 * Sundays are unpaid) gives a different answer, which is why
 * `PayrollSetting.standardWorkingDays` exists.
 *
 * Rounds to the nearest paisa; the remainder cannot be allowed to vanish,
 * so callers total the ROUNDED lines rather than rounding the total.
 */
export function proRate(
  amountPaise: number,
  paidDays: number,
  workingDays: number,
): number {
  if (workingDays <= 0) throw new PayrollError('Working days must be positive.')
  if (paidDays < 0) throw new PayrollError('Paid days cannot be negative.')
  if (paidDays >= workingDays) return amountPaise
  return Math.round((amountPaise * paidDays) / workingDays)
}

/**
 * Evaluate the earning side of a structure.
 *
 * Order matters: FIXED first, then PERCENT_OF_BASIC (which needs the basic
 * total), then PERCENT_OF_GROSS (which needs everything before it). A
 * percent-of-gross component therefore never counts itself.
 */
export function computeEarnings(
  lines: StructureLine[],
  paidDays: number,
  workingDays: number,
): { lines: PayslipLineResult[]; grossPaise: number; basicPaise: number } {
  const earnings = lines.filter((l) => l.component.kind === 'EARNING')

  const fixed = earnings.filter((l) => l.component.calculation === 'FIXED')
  const ofBasic = earnings.filter(
    (l) => l.component.calculation === 'PERCENT_OF_BASIC',
  )
  const ofGross = earnings.filter(
    (l) => l.component.calculation === 'PERCENT_OF_GROSS',
  )

  const out: PayslipLineResult[] = []
  const emit = (line: StructureLine, amountPaise: number) => {
    const full = line.component.proRated
      ? proRate(amountPaise, paidDays, workingDays)
      : amountPaise
    out.push({
      componentId: line.component.id,
      code: line.component.code,
      label: line.component.name,
      kind: 'EARNING',
      amountPaise: full,
      isStatutory: line.component.isStatutory,
      sortOrder: line.component.sortOrder,
    })
    return full
  }

  let basicPaise = 0
  let grossPaise = 0

  for (const line of fixed) {
    const amount = emit(line, line.amountPaise)
    grossPaise += amount
    if (line.component.partOfBasic) basicPaise += amount
  }

  // Percentages are applied to the FULL-MONTH basic and then pro-rated by
  // emit(), rather than to the already-reduced basic — otherwise a month
  // with unpaid leave would pro-rate twice.
  const fullBasic = fixed
    .filter((l) => l.component.partOfBasic)
    .reduce((s, l) => s + l.amountPaise, 0)

  for (const line of ofBasic) {
    const pct = line.component.percentage ?? 0
    const amount = emit(line, Math.round((fullBasic * pct) / 100))
    grossPaise += amount
    if (line.component.partOfBasic) basicPaise += amount
  }

  const fullGrossSoFar = fixed.reduce((s, l) => s + l.amountPaise, 0) +
    ofBasic.reduce(
      (s, l) => s + Math.round((fullBasic * (l.component.percentage ?? 0)) / 100),
      0,
    )

  for (const line of ofGross) {
    const pct = line.component.percentage ?? 0
    const amount = emit(line, Math.round((fullGrossSoFar * pct) / 100))
    grossPaise += amount
    if (line.component.partOfBasic) basicPaise += amount
  }

  return { lines: out, grossPaise, basicPaise }
}

/**
 * Provident fund.
 *
 * ASSUMPTION: computed on basic + dearness allowance (the components flagged
 * `partOfBasic`), capped at the wage ceiling. Many employers instead
 * contribute on actual wages above the ceiling; that is a setting the
 * institute must choose, not something to decide here — raise the ceiling to
 * a very large number to contribute on full wages.
 *
 * The employer's share is NOT split into EPS and EPF here: that split
 * (8.33% to the pension scheme, capped) matters to the ECR filing but not to
 * what the institute pays out, and inventing it would be a guess.
 *
 * ASSUMPTION, and a contested one: the ceiling is NOT pro-rated for a part
 * month. Someone on a 40,000 basic who takes half the month unpaid earns
 * 20,000, which is still above the 15,000 ceiling, so PF is computed on the
 * full 15,000. The other reading pro-rates the ceiling to 7,500. EPFO's own
 * guidance has been read both ways; the institute's PF consultant should
 * settle it, and only this function changes. See open question #4.
 */
export function computePf(
  pfWagePaise: number,
  config: StatutoryConfig,
): { employeePaise: number; employerPaise: number; basePaise: number } {
  if (!config.pfEnabled) {
    return { employeePaise: 0, employerPaise: 0, basePaise: 0 }
  }
  const basePaise = Math.min(pfWagePaise, config.pfWageCeilingPaise)
  return {
    basePaise,
    employeePaise: roundToRupee((basePaise * config.pfEmployeeRate) / 100),
    employerPaise: roundToRupee((basePaise * config.pfEmployerRate) / 100),
  }
}

/**
 * Employees' State Insurance.
 *
 * ASSUMPTION: eligibility is tested on GROSS for the month, and an employee
 * over the threshold is not covered at all — unlike PF, there is no cap on
 * the base. Contributions are rounded UP to the rupee, which is ESIC's own
 * rule and differs from PF's.
 *
 * NOT MODELLED: the contribution period. In reality someone who crosses the
 * threshold mid-period continues to contribute until the period ends. That
 * needs the institute's contribution-period dates — see open question #4.
 */
export function computeEsi(
  grossPaise: number,
  config: StatutoryConfig,
): { employeePaise: number; employerPaise: number; covered: boolean } {
  if (!config.esiEnabled || grossPaise > config.esiEligibilityPaise) {
    return { employeePaise: 0, employerPaise: 0, covered: false }
  }
  return {
    covered: true,
    employeePaise: ceilToRupee((grossPaise * config.esiEmployeeRate) / 100),
    employerPaise: ceilToRupee((grossPaise * config.esiEmployerRate) / 100),
  }
}

/**
 * Professional tax, from the configured slabs.
 *
 * ASSUMPTION: slabs are stated on HALF-YEARLY earnings (Kerala's basis) and
 * the figure returned is the whole half-yearly levy. Callers decide when to
 * deduct it — `professionalTaxForMonth` deducts it in the last month of each
 * half-year rather than spreading it, which is how it is actually paid.
 *
 * A state that levies monthly instead can express that by entering monthly
 * slabs and deducting every month; the slab lookup is the same.
 */
export function professionalTaxFor(
  earningsPaise: number,
  config: StatutoryConfig,
): number {
  if (!config.ptEnabled) return 0
  const slab = config.ptSlabs.find(
    (s) =>
      earningsPaise >= s.fromPaise &&
      (s.toPaise === null || earningsPaise <= s.toPaise),
  )
  return slab?.amountPaise ?? 0
}

/**
 * ASSUMPTION: professional tax falls due in September and March — the last
 * month of each Indian half-year — and is estimated from the month's gross
 * projected over six months. Projecting is a simplification; the exact levy
 * depends on what was actually earned across the half-year, which the
 * institute's accountant should check at the point of filing.
 */
export function professionalTaxForMonth(
  month: number,
  monthlyGrossPaise: number,
  config: StatutoryConfig,
): number {
  if (!config.ptEnabled) return 0
  if (month !== 3 && month !== 9) return 0
  return professionalTaxFor(monthlyGrossPaise * 6, config)
}

export interface PayslipInput {
  lines: StructureLine[]
  workingDays: number
  lopDays: number
  /** 1-12; professional tax is only levied in some months. */
  month: number
  config: StatutoryConfig
  /** From the institute's CA. Never computed here — see ADR-034. */
  manualTdsPaise?: number
}

/**
 * Build one payslip.
 *
 * Earnings first, then statutory deductions derived from them, then the
 * employer's own contributions, which are reported but never subtracted
 * from take-home.
 */
export function buildPayslip(input: PayslipInput): PayslipResult {
  const { workingDays, lopDays, config } = input

  if (workingDays <= 0) {
    throw new PayrollError('A payroll period needs at least one working day.')
  }
  if (lopDays < 0) throw new PayrollError('Loss-of-pay days cannot be negative.')
  if (lopDays > workingDays) {
    throw new PayrollError(
      `Loss-of-pay days (${lopDays}) cannot exceed the ${workingDays} working days in the period.`,
    )
  }

  const paidDays = workingDays - lopDays
  const earned = computeEarnings(input.lines, paidDays, workingDays)
  const lines: PayslipLineResult[] = [...earned.lines]

  const pf = computePf(earned.basicPaise, config)
  const esi = computeEsi(earned.grossPaise, config)
  const pt = professionalTaxForMonth(input.month, earned.grossPaise, config)
  const tds = input.manualTdsPaise ?? 0

  const addDeduction = (
    code: string,
    label: string,
    amountPaise: number,
    sortOrder: number,
  ) => {
    if (amountPaise <= 0) return
    lines.push({
      componentId: null,
      code,
      label,
      kind: 'DEDUCTION',
      amountPaise,
      isStatutory: true,
      sortOrder,
    })
  }

  addDeduction('PF_EE', 'Provident fund', pf.employeePaise, 900)
  addDeduction('ESI_EE', 'ESI', esi.employeePaise, 901)
  addDeduction('PT', 'Professional tax', pt, 902)
  addDeduction('TDS', 'Income tax (TDS)', tds, 903)

  // Non-statutory deductions from the structure — loan recovery, advances.
  for (const line of input.lines.filter((l) => l.component.kind === 'DEDUCTION')) {
    const amountPaise = line.component.proRated
      ? proRate(line.amountPaise, paidDays, workingDays)
      : line.amountPaise
    if (amountPaise <= 0) continue
    lines.push({
      componentId: line.component.id,
      code: line.component.code,
      label: line.component.name,
      kind: 'DEDUCTION',
      amountPaise,
      isStatutory: false,
      sortOrder: line.component.sortOrder,
    })
  }

  const addEmployer = (
    code: string,
    label: string,
    amountPaise: number,
    sortOrder: number,
  ) => {
    if (amountPaise <= 0) return
    lines.push({
      componentId: null,
      code,
      label,
      kind: 'EMPLOYER_CONTRIBUTION',
      amountPaise,
      isStatutory: true,
      sortOrder,
    })
  }

  addEmployer('PF_ER', 'Provident fund — employer', pf.employerPaise, 950)
  addEmployer('ESI_ER', 'ESI — employer', esi.employerPaise, 951)

  const deductionsPaise = lines
    .filter((l) => l.kind === 'DEDUCTION')
    .reduce((s, l) => s + l.amountPaise, 0)
  const employerContributionPaise = lines
    .filter((l) => l.kind === 'EMPLOYER_CONTRIBUTION')
    .reduce((s, l) => s + l.amountPaise, 0)

  const netPaise = earned.grossPaise - deductionsPaise

  // A payslip that pays out less than nothing means the deductions are
  // misconfigured. Refusing beats quietly handing someone a negative salary.
  if (netPaise < 0) {
    throw new PayrollError(
      'Deductions exceed earnings for this employee, which would mean a negative salary. Check the salary structure and any loan recovery.',
    )
  }

  return {
    lines: lines.sort((a, b) => a.sortOrder - b.sortOrder),
    grossPaise: earned.grossPaise,
    deductionsPaise,
    netPaise,
    employerContributionPaise,
    pfWagePaise: pf.basePaise,
  }
}

/** Days in a calendar month — the default working-day basis. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`
}

/**
 * The structure in force on a given date.
 *
 * A structure with no `effectiveTo` is open-ended. Picking by date rather
 * than "the latest" is what keeps a back-dated correction run from paying
 * this year's salary for last year's month.
 */
export function structureInForce<
  T extends { effectiveFrom: Date; effectiveTo: Date | null },
>(structures: T[], on: Date): T | null {
  const candidates = structures.filter(
    (s) => s.effectiveFrom <= on && (s.effectiveTo === null || s.effectiveTo >= on),
  )
  if (candidates.length === 0) return null
  // Latest effectiveFrom wins if two overlap, which the UI prevents but the
  // data cannot guarantee.
  return candidates.reduce((a, b) =>
    b.effectiveFrom > a.effectiveFrom ? b : a,
  )
}
