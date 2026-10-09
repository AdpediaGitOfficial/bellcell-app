import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import {
  PayrollError,
  approvePayrollRun,
  cancelPayrollRun,
  createPayrollRun,
  payPayrollRun,
  recalculatePayslip,
  reviseSalaryStructure,
  statutoryConfigFor,
} from './service'

/**
 * Integration tests for payroll against a real database.
 *
 * The questions worth answering here are the ones a pure test cannot: does
 * the money that leaves payroll match the money that reaches the ledger, and
 * does an approved run actually refuse to move?
 */
const db = new PrismaClient()
const TAG = `pay-${Date.now()}`
const R = (rupees: number) => rupees * 100

let branchId: string
let userId: string
let salaryHeadId: string
let basicId: string
let daId: string
let hraId: string
let employeeA: string
let employeeB: string
let employeeNoStructure: string

beforeAll(async () => {
  const branch = await db.branch.create({
    data: { code: `${TAG}-BR`, name: `${TAG} Branch` },
  })
  branchId = branch.id

  const user = await db.user.create({
    data: {
      email: `${TAG}@test.local`,
      fullName: 'Payroll Test',
      passwordHash: 'x',
      role: 'ADMIN',
    },
  })
  userId = user.id

  const head = await db.accountHead.create({
    data: { code: `${TAG}-SAL`, name: 'Salary', kind: 'EXPENSE' },
  })
  salaryHeadId = head.id

  const basic = await db.salaryComponent.create({
    data: { code: `${TAG}-BASIC`, name: 'Basic', kind: 'EARNING', partOfBasic: true, sortOrder: 1 },
  })
  basicId = basic.id
  const da = await db.salaryComponent.create({
    data: { code: `${TAG}-DA`, name: 'DA', kind: 'EARNING', partOfBasic: true, sortOrder: 2 },
  })
  daId = da.id
  const hra = await db.salaryComponent.create({
    data: {
      code: `${TAG}-HRA`,
      name: 'HRA',
      kind: 'EARNING',
      calculation: 'PERCENT_OF_BASIC',
      percentage: 40,
      sortOrder: 3,
    },
  })
  hraId = hra.id

  const mk = async (code: string, first: string) =>
    (
      await db.employee.create({
        data: { branchId, employeeCode: `${TAG}-${code}`, firstName: first, status: 'ACTIVE' },
      })
    ).id

  employeeA = await mk('E1', 'Asha')
  employeeB = await mk('E2', 'Biju')
  employeeNoStructure = await mk('E3', 'Chandra')

  await reviseSalaryStructure({
    employeeId: employeeA,
    effectiveFrom: new Date('2026-01-01'),
    lines: [
      { componentId: basicId, amountPaise: R(20000) },
      { componentId: daId, amountPaise: R(5000) },
      { componentId: hraId, amountPaise: 0 },
    ],
    createdById: userId,
  })

  await reviseSalaryStructure({
    employeeId: employeeB,
    effectiveFrom: new Date('2026-01-01'),
    lines: [
      { componentId: basicId, amountPaise: R(8000) },
      { componentId: daId, amountPaise: R(2000) },
    ],
    createdById: userId,
  })
})

afterAll(async () => {
  await db.payslipLine.deleteMany({
    where: { payslip: { run: { branchId } } },
  })
  await db.payslip.deleteMany({ where: { run: { branchId } } })
  await db.payrollRun.deleteMany({ where: { branchId } })
  await db.salaryStructureLine.deleteMany({
    where: { structure: { employee: { branchId } } },
  })
  await db.salaryStructure.deleteMany({ where: { employee: { branchId } } })
  await db.payrollTaxSlab.deleteMany({ where: { setting: { branchId } } })
  await db.payrollSetting.deleteMany({ where: { branchId } })
  await db.ledgerEntry.deleteMany({ where: { branchId } })
  await db.dailyTransaction.deleteMany({ where: { branchId } })
  await db.receiptSequence.deleteMany({ where: { branchId } })
  await db.employee.deleteMany({ where: { branchId } })
  await db.branch.deleteMany({ where: { id: branchId } })
  await db.salaryComponent.deleteMany({ where: { code: { startsWith: TAG } } })
  await db.accountHead.deleteMany({ where: { code: { startsWith: TAG } } })
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } })
  await db.$disconnect()
})

describe('statutoryConfigFor', () => {
  it('switches everything OFF for a branch nobody has configured', async () => {
    const config = await statutoryConfigFor(branchId)
    expect(config.pfEnabled).toBe(false)
    expect(config.esiEnabled).toBe(false)
    expect(config.ptEnabled).toBe(false)
  })
})

describe('createPayrollRun', () => {
  it('drafts a payslip per employee with a structure, and says who it skipped', async () => {
    const run = await createPayrollRun({
      branchId,
      year: 2026,
      month: 4,
      createdById: userId,
    })

    expect(run.included).toBe(2)
    expect(run.skipped).toHaveLength(1)
    expect(run.skipped[0]?.employeeId).toBe(employeeNoStructure)
    expect(run.skipped[0]?.reason).toMatch(/No salary structure/)

    const stored = await db.payrollRun.findUnique({
      where: { id: run.runId },
      include: { payslips: true },
    })
    expect(stored?.workingDays).toBe(30) // April
    expect(stored?.payslips).toHaveLength(2)
    // A: 20,000 + 5,000 + 40% of 25,000 = 35,000. B: 10,000.
    expect(stored?.grossPaise).toBe(R(45000))
    expect(stored?.netPaise).toBe(R(45000)) // nothing configured, nothing deducted
  })

  it('refuses a second run for the same month and branch', async () => {
    await expect(
      createPayrollRun({ branchId, year: 2026, month: 4, createdById: userId }),
    ).rejects.toThrow(/already exists/)
  })

  it('writes the component breakdown down rather than recomputing it later', async () => {
    const slip = await db.payslip.findFirst({
      where: { employeeId: employeeA, run: { year: 2026, month: 4 } },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
    expect(slip?.lines.map((l) => l.label)).toEqual(['Basic', 'DA', 'HRA'])
    expect(slip?.lines.find((l) => l.label === 'HRA')?.amountPaise).toBe(R(10000))
  })
})

describe('recalculatePayslip', () => {
  it('reduces pay for unpaid days and moves the run total with it', async () => {
    const slip = await db.payslip.findFirstOrThrow({
      where: { employeeId: employeeA, run: { year: 2026, month: 4 } },
    })

    await recalculatePayslip({ payslipId: slip.id, lopDays: 3 })

    const after = await db.payslip.findUniqueOrThrow({ where: { id: slip.id } })
    expect(after.grossPaise).toBe(R(31500)) // 35,000 * 27/30
    expect(Number(after.paidDays)).toBe(27)

    const run = await db.payrollRun.findUniqueOrThrow({ where: { id: slip.runId } })
    expect(run.grossPaise).toBe(R(31500) + R(10000))
  })

  it('takes an employee out of the run without deleting their payslip', async () => {
    const slip = await db.payslip.findFirstOrThrow({
      where: { employeeId: employeeB, run: { year: 2026, month: 4 } },
    })
    await recalculatePayslip({ payslipId: slip.id, excluded: true })

    const run = await db.payrollRun.findUniqueOrThrow({ where: { id: slip.runId } })
    expect(run.headcount).toBe(1)
    expect(run.grossPaise).toBe(R(31500))

    // and back again
    await recalculatePayslip({ payslipId: slip.id, excluded: false })
    const restored = await db.payrollRun.findUniqueOrThrow({ where: { id: slip.runId } })
    expect(restored.headcount).toBe(2)
  })

  it('refuses more unpaid days than the month has', async () => {
    const slip = await db.payslip.findFirstOrThrow({
      where: { employeeId: employeeA, run: { year: 2026, month: 4 } },
    })
    await expect(
      recalculatePayslip({ payslipId: slip.id, lopDays: 45 }),
    ).rejects.toThrow(/cannot exceed/)
  })
})

describe('statutory deductions once configured', () => {
  it('applies PF and ESI to a run created after the settings exist', async () => {
    await db.payrollSetting.create({
      data: {
        branchId,
        pfEnabled: true,
        esiEnabled: true,
        salaryAccountHeadId: salaryHeadId,
      },
    })

    const run = await createPayrollRun({
      branchId,
      year: 2026,
      month: 5,
      createdById: userId,
    })

    const slipB = await db.payslip.findFirstOrThrow({
      where: { employeeId: employeeB, runId: run.runId },
      include: { lines: true },
    })
    // B earns 10,000: PF 12% = 1,200; ESI 0.75% = 75.
    expect(slipB.deductionsPaise).toBe(R(1275))
    expect(slipB.netPaise).toBe(R(8725))
    expect(slipB.employerContributionPaise).toBe(R(1200) + R(325))

    const slipA = await db.payslip.findFirstOrThrow({
      where: { employeeId: employeeA, runId: run.runId },
    })
    // A earns 35,000, over the ESI threshold: PF only, on the 15,000 ceiling.
    expect(slipA.deductionsPaise).toBe(R(1800))
  })

  it('leaves an already-drafted run alone when the settings change', async () => {
    // April was drafted before PF existed and must not acquire it silently.
    const april = await db.payrollRun.findFirstOrThrow({
      where: { branchId, year: 2026, month: 4 },
    })
    expect(april.deductionsPaise).toBe(0)
  })
})

describe('approve and pay', () => {
  let mayRunId: string

  beforeAll(async () => {
    mayRunId = (
      await db.payrollRun.findFirstOrThrow({ where: { branchId, year: 2026, month: 5 } })
    ).id
  })

  it('refuses to pay a run that has not been approved', async () => {
    await expect(
      payPayrollRun({
        runId: mayRunId,
        paidOn: new Date('2026-06-01'),
        mode: 'BANK_TRANSFER',
        enteredById: userId,
      }),
    ).rejects.toThrow(/Approve the run/)
  })

  it('freezes the figures on approval', async () => {
    await approvePayrollRun({ runId: mayRunId, approvedById: userId })

    const slip = await db.payslip.findFirstOrThrow({ where: { runId: mayRunId } })
    await expect(
      recalculatePayslip({ payslipId: slip.id, lopDays: 2 }),
    ).rejects.toThrow(/no longer a draft/)
  })

  it('posts net pay and employer contributions to the ledger, and the two agree', async () => {
    const before = await db.payrollRun.findUniqueOrThrow({ where: { id: mayRunId } })

    const result = await payPayrollRun({
      runId: mayRunId,
      paidOn: new Date('2026-06-01'),
      mode: 'BANK_TRANSFER',
      enteredById: userId,
      referenceNo: 'NEFT-001',
    })

    expect(result.voucherNo).toMatch(/^VCH\//)
    expect(result.employerVoucherNo).toMatch(/^VCH\//)

    const entries = await db.ledgerEntry.findMany({
      where: { branchId, source: 'DAILY_TRANSACTION' },
    })
    const credited = entries.reduce((s, e) => s + e.creditPaise, 0)

    // What left the institute is net pay plus the employer's own share —
    // NOT the gross, which includes money withheld from staff.
    expect(credited).toBe(before.netPaise + before.employerContributionPaise)
    expect(entries.every((e) => e.debitPaise === 0)).toBe(true)
  })

  it('will not pay the same run twice', async () => {
    await expect(
      payPayrollRun({
        runId: mayRunId,
        paidOn: new Date('2026-06-01'),
        mode: 'CASH',
        enteredById: userId,
      }),
    ).rejects.toThrow(/already been paid/)
  })

  it('refuses to cancel a paid run, because the ledger would then disagree', async () => {
    await expect(
      cancelPayrollRun({ runId: mayRunId, reason: 'mistake' }),
    ).rejects.toThrow(/Reverse its voucher/)
  })
})

describe('cancelPayrollRun', () => {
  it('cancels a draft with a reason', async () => {
    const run = await createPayrollRun({
      branchId,
      year: 2026,
      month: 6,
      createdById: userId,
    })
    await cancelPayrollRun({ runId: run.runId, reason: 'Opened by mistake' })

    const after = await db.payrollRun.findUniqueOrThrow({ where: { id: run.runId } })
    expect(after.status).toBe('CANCELLED')
    expect(after.cancelReason).toBe('Opened by mistake')
  })

  it('insists on a reason', async () => {
    const run = await createPayrollRun({
      branchId,
      year: 2026,
      month: 7,
      createdById: userId,
    })
    await expect(
      cancelPayrollRun({ runId: run.runId, reason: '  ' }),
    ).rejects.toThrow(PayrollError)
  })
})

describe('reviseSalaryStructure', () => {
  it('closes the previous structure instead of editing it', async () => {
    await reviseSalaryStructure({
      employeeId: employeeB,
      effectiveFrom: new Date('2026-08-01'),
      lines: [
        { componentId: basicId, amountPaise: R(12000) },
        { componentId: daId, amountPaise: R(3000) },
      ],
      createdById: userId,
      notes: 'Annual revision',
    })

    const structures = await db.salaryStructure.findMany({
      where: { employeeId: employeeB },
      orderBy: { effectiveFrom: 'asc' },
    })
    expect(structures).toHaveLength(2)
    expect(structures[0]?.effectiveTo?.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(structures[1]?.effectiveTo).toBeNull()
  })

  it('pays the OLD rate for a month before the revision, even though the run is drafted after it', async () => {
    // The point of dating structures: this run is created now, but it
    // covers February, so it must find the structure in force then.
    const run = await createPayrollRun({
      branchId,
      year: 2026,
      month: 2,
      createdById: userId,
    })
    const slip = await db.payslip.findFirstOrThrow({
      where: { employeeId: employeeB, runId: run.runId },
    })
    expect(slip.grossPaise).toBe(R(10000)) // the old structure, not 15,000
  })

  it('pays the new rate for a month after it', async () => {
    const run = await createPayrollRun({
      branchId,
      year: 2026,
      month: 9,
      createdById: userId,
    })
    const slip = await db.payslip.findFirstOrThrow({
      where: { employeeId: employeeB, runId: run.runId },
    })
    expect(slip.grossPaise).toBe(R(15000))
  })

  it('refuses two structures starting on the same day', async () => {
    await expect(
      reviseSalaryStructure({
        employeeId: employeeB,
        effectiveFrom: new Date('2026-08-01'),
        lines: [{ componentId: basicId, amountPaise: R(1) }],
        createdById: userId,
      }),
    ).rejects.toThrow(/already has a salary structure/)
  })
})
