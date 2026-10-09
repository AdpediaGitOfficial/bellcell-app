import 'server-only'
import type { PaymentMode, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { recordDailyTransaction } from '@/lib/accounts/service'
import { staffLopForMonth } from '@/lib/attendance/service'
import {
  PayrollError,
  buildPayslip,
  daysInMonth,
  monthLabel,
  structureInForce,
  type ComponentSpec,
  type StatutoryConfig,
  type StructureLine,
} from './core'

export { PayrollError }

/**
 * Payroll as it touches the database.
 *
 * The calculation lives in core.ts and is pure; this file is about *when*
 * figures are allowed to change and where the money ends up.
 *
 * The governing rule: a payslip's figures are WRITTEN DOWN, not recomputed
 * on read. Once a run is approved its numbers are frozen, so raising
 * someone's salary in June cannot restate what they were paid in May.
 */

/** The last day of the month a run covers — the date structures are read on. */
function periodEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, daysInMonth(year, month), 12))
}

function toSpec(c: {
  id: string
  code: string
  name: string
  kind: ComponentSpec['kind']
  calculation: ComponentSpec['calculation']
  percentage: Prisma.Decimal | null
  partOfBasic: boolean
  proRated: boolean
  isStatutory: boolean
  sortOrder: number
}): ComponentSpec {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    kind: c.kind,
    calculation: c.calculation,
    percentage: c.percentage === null ? null : Number(c.percentage),
    partOfBasic: c.partOfBasic,
    proRated: c.proRated,
    isStatutory: c.isStatutory,
    sortOrder: c.sortOrder,
  }
}

/**
 * The branch's statutory configuration.
 *
 * A branch with no settings row gets everything switched OFF, which is the
 * only safe reading of "nobody has configured this yet".
 */
export async function statutoryConfigFor(
  branchId: string,
): Promise<StatutoryConfig & { salaryAccountHeadId: string | null; standardWorkingDays: number | null }> {
  const setting = await db.payrollSetting.findUnique({
    where: { branchId },
    include: { slabs: { orderBy: { sortOrder: 'asc' } } },
  })

  if (!setting) {
    return {
      pfEnabled: false,
      pfEmployeeRate: 0,
      pfEmployerRate: 0,
      pfWageCeilingPaise: 0,
      esiEnabled: false,
      esiEmployeeRate: 0,
      esiEmployerRate: 0,
      esiEligibilityPaise: 0,
      ptEnabled: false,
      ptSlabs: [],
      salaryAccountHeadId: null,
      standardWorkingDays: null,
    }
  }

  return {
    pfEnabled: setting.pfEnabled,
    pfEmployeeRate: Number(setting.pfEmployeeRate),
    pfEmployerRate: Number(setting.pfEmployerRate),
    pfWageCeilingPaise: setting.pfWageCeilingPaise,
    esiEnabled: setting.esiEnabled,
    esiEmployeeRate: Number(setting.esiEmployeeRate),
    esiEmployerRate: Number(setting.esiEmployerRate),
    esiEligibilityPaise: setting.esiEligibilityPaise,
    ptEnabled: setting.ptEnabled,
    ptSlabs: setting.slabs.map((s) => ({
      fromPaise: s.fromPaise,
      toPaise: s.toPaise,
      amountPaise: s.amountPaise,
    })),
    salaryAccountHeadId: setting.salaryAccountHeadId,
    standardWorkingDays: setting.standardWorkingDays,
  }
}

/** Load an employee's structure lines as the engine wants them. */
async function structureLinesFor(
  employeeId: string,
  on: Date,
): Promise<StructureLine[] | null> {
  const structures = await db.salaryStructure.findMany({
    where: { employeeId },
    include: { lines: { include: { component: true } } },
  })

  const inForce = structureInForce(structures, on)
  if (!inForce) return null

  return inForce.lines
    .filter((l) => l.component.archivedAt === null)
    .map((l) => ({
      component: toSpec(l.component),
      amountPaise: l.amountPaise,
    }))
}

export interface CreateRunInput {
  branchId: string
  year: number
  month: number
  createdById: string
  /** Overrides the calendar-day count for this run only. */
  workingDays?: number
}

/** Where a payslip's unpaid-day figure came from. */
export type LopSource = 'ATTENDANCE' | 'NONE'

/**
 * Open a payroll run and draft a payslip for everyone eligible.
 *
 * Who is included: active (or on-leave) employees of the branch who have a
 * salary structure in force on the last day of the month. Someone without a
 * structure is reported back rather than silently skipped — "why was X not
 * paid" must have an answer on screen.
 *
 * Unpaid days come from STAFF ATTENDANCE when any was marked for that month,
 * and are zero otherwise. They remain editable on the draft: attendance is
 * the starting point, not the last word, because the office may know
 * something the register does not. The run records how many days were
 * actually marked so a half-empty month is visible rather than quietly
 * generous.
 */
export async function createPayrollRun(input: CreateRunInput): Promise<{
  runId: string
  included: number
  /** How many of the included payslips took unpaid days from attendance. */
  fromAttendance: number
  skipped: { employeeId: string; employeeCode: string; name: string; reason: string }[]
}> {
  const { branchId, year, month } = input

  if (month < 1 || month > 12) throw new PayrollError('Choose a month.')
  if (year < 2000 || year > 2100) throw new PayrollError('Choose a valid year.')

  const existing = await db.payrollRun.findUnique({
    where: { branchId_year_month: { branchId, year, month } },
    select: { id: true, status: true },
  })
  if (existing) {
    throw new PayrollError(
      `A payroll run for ${monthLabel(month, year)} already exists in this branch.`,
    )
  }

  const config = await statutoryConfigFor(branchId)
  const workingDays =
    input.workingDays ?? config.standardWorkingDays ?? daysInMonth(year, month)
  if (workingDays <= 0) throw new PayrollError('Working days must be positive.')

  const on = periodEnd(year, month)

  const employees = await db.employee.findMany({
    where: {
      branchId,
      archivedAt: null,
      status: { in: ['ACTIVE', 'ON_LEAVE'] },
    },
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
    orderBy: { employeeCode: 'asc' },
  })

  const attendance = await staffLopForMonth(branchId, year, month)

  const skipped: {
    employeeId: string
    employeeCode: string
    name: string
    reason: string
  }[] = []
  const drafts: {
    employeeId: string
    lopDays: number
    markedDays: number
    result: ReturnType<typeof buildPayslip>
  }[] = []

  for (const employee of employees) {
    const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ')
    const lines = await structureLinesFor(employee.id, on)

    if (!lines || lines.length === 0) {
      skipped.push({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name,
        reason: 'No salary structure in force for this month',
      })
      continue
    }

    const marked = attendance.get(employee.id)
    // Cap at the period: a month marked on a different working-day basis
    // must not produce more unpaid days than the run has.
    const lopDays = Math.min(marked?.lopDays ?? 0, workingDays)

    try {
      drafts.push({
        employeeId: employee.id,
        lopDays,
        markedDays: marked?.markedDays ?? 0,
        result: buildPayslip({ lines, workingDays, lopDays, month, config }),
      })
    } catch (error) {
      skipped.push({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name,
        reason: error instanceof PayrollError ? error.message : 'Could not be calculated',
      })
    }
  }

  const totals = drafts.reduce(
    (acc, d) => ({
      gross: acc.gross + d.result.grossPaise,
      deductions: acc.deductions + d.result.deductionsPaise,
      net: acc.net + d.result.netPaise,
      employer: acc.employer + d.result.employerContributionPaise,
    }),
    { gross: 0, deductions: 0, net: 0, employer: 0 },
  )

  const run = await db.$transaction(async (tx) => {
    const created = await tx.payrollRun.create({
      data: {
        branchId,
        year,
        month,
        workingDays,
        createdById: input.createdById,
        grossPaise: totals.gross,
        deductionsPaise: totals.deductions,
        netPaise: totals.net,
        employerContributionPaise: totals.employer,
        headcount: drafts.length,
      },
    })

    for (const draft of drafts) {
      await tx.payslip.create({
        data: {
          runId: created.id,
          employeeId: draft.employeeId,
          workingDays,
          lopDays: draft.lopDays,
          attendanceMarkedDays: draft.markedDays,
          paidDays: workingDays - draft.lopDays,
          grossPaise: draft.result.grossPaise,
          deductionsPaise: draft.result.deductionsPaise,
          netPaise: draft.result.netPaise,
          employerContributionPaise: draft.result.employerContributionPaise,
          lines: {
            create: draft.result.lines.map((l) => ({
              componentId: l.componentId,
              label: l.label,
              kind: l.kind,
              amountPaise: l.amountPaise,
              isStatutory: l.isStatutory,
              sortOrder: l.sortOrder,
            })),
          },
        },
      })
    }

    return created
  })

  return {
    runId: run.id,
    included: drafts.length,
    fromAttendance: drafts.filter((d) => d.markedDays > 0).length,
    skipped,
  }
}

/**
 * Recompute one payslip after its unpaid days or TDS figure changed.
 *
 * Only allowed while the run is a draft. Once it is approved the figures are
 * what the institute committed to.
 */
export async function recalculatePayslip(input: {
  payslipId: string
  lopDays?: number
  manualTdsPaise?: number
  excluded?: boolean
  remarks?: string | null
}): Promise<void> {
  const payslip = await db.payslip.findUnique({
    where: { id: input.payslipId },
    include: { run: true },
  })
  if (!payslip) throw new PayrollError('Payslip not found.')
  if (payslip.run.status !== 'DRAFT') {
    throw new PayrollError(
      'This run is no longer a draft, so its figures cannot be changed. Cancel it and start a new run if a correction is needed.',
    )
  }

  const lopDays = input.lopDays ?? Number(payslip.lopDays)
  const manualTdsPaise = input.manualTdsPaise ?? payslip.manualTdsPaise
  const excluded = input.excluded ?? payslip.excluded

  const config = await statutoryConfigFor(payslip.run.branchId)
  const on = periodEnd(payslip.run.year, payslip.run.month)
  const lines = await structureLinesFor(payslip.employeeId, on)
  if (!lines) throw new PayrollError('This employee has no salary structure in force.')

  const result = excluded
    ? null
    : buildPayslip({
        lines,
        workingDays: payslip.workingDays,
        lopDays,
        month: payslip.run.month,
        config,
        manualTdsPaise,
      })

  await db.$transaction(async (tx) => {
    await tx.payslipLine.deleteMany({ where: { payslipId: payslip.id } })
    await tx.payslip.update({
      where: { id: payslip.id },
      data: {
        lopDays,
        paidDays: payslip.workingDays - lopDays,
        manualTdsPaise,
        excluded,
        remarks: input.remarks ?? payslip.remarks,
        grossPaise: result?.grossPaise ?? 0,
        deductionsPaise: result?.deductionsPaise ?? 0,
        netPaise: result?.netPaise ?? 0,
        employerContributionPaise: result?.employerContributionPaise ?? 0,
        lines: result
          ? {
              create: result.lines.map((l) => ({
                componentId: l.componentId,
                label: l.label,
                kind: l.kind,
                amountPaise: l.amountPaise,
                isStatutory: l.isStatutory,
                sortOrder: l.sortOrder,
              })),
            }
          : undefined,
      },
    })

    await refreshRunTotals(tx, payslip.runId)
  })
}

/** Re-derive a run's totals from its payslips. Never trust a running sum. */
async function refreshRunTotals(
  tx: Prisma.TransactionClient,
  runId: string,
): Promise<void> {
  const slips = await tx.payslip.findMany({
    where: { runId, excluded: false },
    select: {
      grossPaise: true,
      deductionsPaise: true,
      netPaise: true,
      employerContributionPaise: true,
    },
  })

  await tx.payrollRun.update({
    where: { id: runId },
    data: {
      headcount: slips.length,
      grossPaise: slips.reduce((s, p) => s + p.grossPaise, 0),
      deductionsPaise: slips.reduce((s, p) => s + p.deductionsPaise, 0),
      netPaise: slips.reduce((s, p) => s + p.netPaise, 0),
      employerContributionPaise: slips.reduce(
        (s, p) => s + p.employerContributionPaise,
        0,
      ),
    },
  })
}

/** Freeze a draft run. After this its figures cannot move. */
export async function approvePayrollRun(input: {
  runId: string
  approvedById: string
}): Promise<void> {
  const run = await db.payrollRun.findUnique({
    where: { id: input.runId },
    select: { id: true, status: true, headcount: true },
  })
  if (!run) throw new PayrollError('Payroll run not found.')
  if (run.status !== 'DRAFT') {
    throw new PayrollError('Only a draft run can be approved.')
  }
  if (run.headcount === 0) {
    throw new PayrollError(
      'There is nobody to pay in this run. Add salary structures first.',
    )
  }

  await db.payrollRun.update({
    where: { id: run.id },
    data: {
      status: 'APPROVED',
      approvedById: input.approvedById,
      approvedAt: new Date(),
    },
  })
}

/**
 * Pay an approved run, and post it to the books.
 *
 * ASSUMPTION about what hits the ledger: ONE expense voucher for the total
 * NET pay, plus a second for employer contributions if there are any. Not
 * the gross — the gross is never money leaving the institute. PF and ESI
 * withheld from staff leave later, when the challan is paid, and that is an
 * ordinary voucher the accountant raises then.
 *
 * Posting through `recordDailyTransaction` rather than writing ledger rows
 * directly is deliberate: the Day Book's identity holds because there is
 * exactly one way money enters the ledger.
 */
export async function payPayrollRun(input: {
  runId: string
  paidOn: Date
  mode: PaymentMode
  bankAccountId?: string | null
  referenceNo?: string | null
  enteredById: string
}): Promise<{ voucherNo: string; employerVoucherNo: string | null }> {
  const run = await db.payrollRun.findUnique({
    where: { id: input.runId },
    select: {
      id: true,
      branchId: true,
      status: true,
      month: true,
      year: true,
      netPaise: true,
      employerContributionPaise: true,
    },
  })
  if (!run) throw new PayrollError('Payroll run not found.')
  if (run.status === 'PAID') throw new PayrollError('This run has already been paid.')
  if (run.status !== 'APPROVED') {
    throw new PayrollError('Approve the run before paying it.')
  }
  if (run.netPaise <= 0) {
    throw new PayrollError('This run has nothing to pay out.')
  }

  const config = await statutoryConfigFor(run.branchId)
  const headId =
    config.salaryAccountHeadId ??
    (await db.accountHead.findFirst({
      where: { code: 'AH-SAL', archivedAt: null },
      select: { id: true },
    }))?.id

  if (!headId) {
    throw new PayrollError(
      'No salary account head is configured, so this cannot be posted to the books. Set one in payroll settings.',
    )
  }

  const period = monthLabel(run.month, run.year)

  const salary = await recordDailyTransaction({
    branchId: run.branchId,
    transactionDate: input.paidOn,
    kind: 'EXPENSE',
    accountHeadId: headId,
    amountPaise: run.netPaise,
    mode: input.mode,
    bankAccountId: input.bankAccountId ?? null,
    referenceNo: input.referenceNo ?? null,
    narration: `Salary paid for ${period}`,
    enteredById: input.enteredById,
  })

  let employerVoucherNo: string | null = null
  if (run.employerContributionPaise > 0) {
    const employer = await recordDailyTransaction({
      branchId: run.branchId,
      transactionDate: input.paidOn,
      kind: 'EXPENSE',
      accountHeadId: headId,
      amountPaise: run.employerContributionPaise,
      mode: input.mode,
      bankAccountId: input.bankAccountId ?? null,
      referenceNo: input.referenceNo ?? null,
      narration: `Employer PF/ESI contribution for ${period}`,
      enteredById: input.enteredById,
    })
    employerVoucherNo = employer.voucherNo
  }

  await db.payrollRun.update({
    where: { id: run.id },
    data: {
      status: 'PAID',
      paidAt: input.paidOn,
      paymentMode: input.mode,
      bankAccountId: input.bankAccountId ?? null,
      voucherId: salary.id,
    },
  })

  return { voucherNo: salary.voucherNo, employerVoucherNo }
}

/**
 * Cancel a run.
 *
 * A paid run is NOT cancellable here: the money has left and the voucher is
 * in the Day Book. Reverse the voucher in Accounts first — that leaves a
 * contra entry, which is what an auditor needs to see.
 */
export async function cancelPayrollRun(input: {
  runId: string
  reason: string
}): Promise<void> {
  const run = await db.payrollRun.findUnique({
    where: { id: input.runId },
    select: { id: true, status: true },
  })
  if (!run) throw new PayrollError('Payroll run not found.')
  if (run.status === 'PAID') {
    throw new PayrollError(
      'This run has been paid and posted to the books. Reverse its voucher in Accounts instead — cancelling it here would leave the ledger saying money went out that payroll says never did.',
    )
  }
  if (run.status === 'CANCELLED') throw new PayrollError('Already cancelled.')
  if (!input.reason.trim()) throw new PayrollError('Give a reason for cancelling.')

  await db.payrollRun.update({
    where: { id: run.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: input.reason.trim(),
    },
  })
}

/**
 * Replace an employee's salary structure, closing the previous one the day
 * before the new one starts.
 *
 * Never edits the old row: a payslip already issued against it must stay
 * explicable.
 */
export async function reviseSalaryStructure(input: {
  employeeId: string
  effectiveFrom: Date
  lines: { componentId: string; amountPaise: number }[]
  notes?: string | null
  createdById: string
}): Promise<{ structureId: string }> {
  if (input.lines.length === 0) {
    throw new PayrollError('A salary structure needs at least one component.')
  }
  if (input.lines.some((l) => l.amountPaise < 0)) {
    throw new PayrollError('A salary component cannot be negative.')
  }

  const clash = await db.salaryStructure.findFirst({
    where: { employeeId: input.employeeId, effectiveFrom: input.effectiveFrom },
    select: { id: true },
  })
  if (clash) {
    throw new PayrollError(
      'This employee already has a salary structure starting on that date.',
    )
  }

  const dayBefore = new Date(input.effectiveFrom)
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)

  return db.$transaction(async (tx) => {
    // Close anything still open that starts before the new one.
    await tx.salaryStructure.updateMany({
      where: {
        employeeId: input.employeeId,
        effectiveTo: null,
        effectiveFrom: { lt: input.effectiveFrom },
      },
      data: { effectiveTo: dayBefore },
    })

    const created = await tx.salaryStructure.create({
      data: {
        employeeId: input.employeeId,
        effectiveFrom: input.effectiveFrom,
        notes: input.notes ?? null,
        createdById: input.createdById,
        lines: {
          create: input.lines.map((l) => ({
            componentId: l.componentId,
            amountPaise: l.amountPaise,
          })),
        },
      },
    })

    return { structureId: created.id }
  })
}
