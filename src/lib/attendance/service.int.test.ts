import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import {
  approvePayrollRun,
  createPayrollRun,
  recalculatePayslip,
  reviseSalaryStructure,
} from '@/lib/payroll/service'
import { holidayDatesFor, staffLopForMonth, staffMonthSummary } from './service'

/**
 * Integration tests for attendance, and above all for the seam into payroll:
 * does a register actually change what someone is paid, and does it stop
 * doing so once the run is approved?
 */
const db = new PrismaClient()
const TAG = `att-${Date.now()}`
const R = (rupees: number) => rupees * 100

let branchId: string
let otherBranchId: string
let userId: string
let basicId: string
let present: string
let absentee: string
let halfDayer: string

const d = (day: number) => new Date(Date.UTC(2026, 6, day)) // July 2026

beforeAll(async () => {
  const branch = await db.branch.create({
    data: { code: `${TAG}-BR`, name: `${TAG} Branch` },
  })
  branchId = branch.id
  const other = await db.branch.create({
    data: { code: `${TAG}-BR2`, name: `${TAG} Other` },
  })
  otherBranchId = other.id

  const user = await db.user.create({
    data: {
      email: `${TAG}@test.local`,
      fullName: 'Attendance Test',
      passwordHash: 'x',
      role: 'ADMIN',
    },
  })
  userId = user.id

  const basic = await db.salaryComponent.create({
    data: {
      code: `${TAG}-BASIC`,
      name: 'Basic',
      kind: 'EARNING',
      partOfBasic: true,
      sortOrder: 1,
    },
  })
  basicId = basic.id

  const mk = async (code: string, first: string) =>
    (
      await db.employee.create({
        data: { branchId, employeeCode: `${TAG}-${code}`, firstName: first },
      })
    ).id

  present = await mk('P', 'Priya')
  absentee = await mk('A', 'Anil')
  halfDayer = await mk('H', 'Hari')

  for (const id of [present, absentee, halfDayer]) {
    await reviseSalaryStructure({
      employeeId: id,
      effectiveFrom: new Date('2026-01-01'),
      lines: [{ componentId: basicId, amountPaise: R(31000) }], // 1,000/day in July
      createdById: userId,
    })
  }
})

afterAll(async () => {
  await db.staffAttendance.deleteMany({ where: { branchId: { in: [branchId, otherBranchId] } } })
  await db.holiday.deleteMany({ where: { branchId: { in: [branchId, otherBranchId] } } })
  await db.holiday.deleteMany({ where: { name: { startsWith: TAG } } })
  await db.payslipLine.deleteMany({ where: { payslip: { run: { branchId } } } })
  await db.payslip.deleteMany({ where: { run: { branchId } } })
  await db.payrollRun.deleteMany({ where: { branchId } })
  await db.salaryStructureLine.deleteMany({
    where: { structure: { employee: { branchId } } },
  })
  await db.salaryStructure.deleteMany({ where: { employee: { branchId } } })
  await db.employee.deleteMany({ where: { branchId } })
  await db.branch.deleteMany({ where: { id: { in: [branchId, otherBranchId] } } })
  await db.salaryComponent.deleteMany({ where: { code: { startsWith: TAG } } })
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } })
  await db.$disconnect()
})

describe('staffLopForMonth', () => {
  beforeAll(async () => {
    const rows: { employeeId: string; day: number; status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'PAID_LEAVE' | 'HOLIDAY' }[] = []
    // Priya: present all 20 marked days.
    for (let i = 1; i <= 20; i += 1) rows.push({ employeeId: present, day: i, status: 'PRESENT' })
    // Anil: 2 absent, 1 paid leave, rest present.
    for (let i = 1; i <= 20; i += 1) {
      rows.push({
        employeeId: absentee,
        day: i,
        status: i <= 2 ? 'ABSENT' : i === 3 ? 'PAID_LEAVE' : 'PRESENT',
      })
    }
    // Hari: 3 half days.
    for (let i = 1; i <= 20; i += 1) {
      rows.push({ employeeId: halfDayer, day: i, status: i <= 3 ? 'HALF_DAY' : 'PRESENT' })
    }

    await db.staffAttendance.createMany({
      data: rows.map((r) => ({
        branchId,
        employeeId: r.employeeId,
        date: d(r.day),
        status: r.status,
        markedById: userId,
      })),
    })
  })

  it('returns no loss of pay for someone present throughout', async () => {
    const map = await staffLopForMonth(branchId, 2026, 7)
    expect(map.get(present)?.lopDays).toBe(0)
    expect(map.get(present)?.markedDays).toBe(20)
  })

  it('counts absences but not paid leave', async () => {
    const map = await staffLopForMonth(branchId, 2026, 7)
    expect(map.get(absentee)?.lopDays).toBe(2)
  })

  it('counts half days as halves', async () => {
    const map = await staffLopForMonth(branchId, 2026, 7)
    expect(map.get(halfDayer)?.lopDays).toBe(1.5)
  })

  it('leaves an unmarked employee out of the map entirely', async () => {
    // Absent from the map and "zero by decision" are different facts.
    const orphan = await db.employee.create({
      data: { branchId, employeeCode: `${TAG}-X`, firstName: 'Unmarked' },
    })
    const map = await staffLopForMonth(branchId, 2026, 7)
    expect(map.has(orphan.id)).toBe(false)
    await db.employee.delete({ where: { id: orphan.id } })
  })

  it('does not read another month', async () => {
    const map = await staffLopForMonth(branchId, 2026, 8)
    expect(map.size).toBe(0)
  })

  it('does not read another branch', async () => {
    const map = await staffLopForMonth(otherBranchId, 2026, 7)
    expect(map.size).toBe(0)
  })
})

describe('staffMonthSummary', () => {
  it('breaks the month down for one employee', async () => {
    const s = await staffMonthSummary(branchId, absentee, 2026, 7)
    expect(s.marked).toBe(20)
    expect(s.absent).toBe(2)
    expect(s.paidLeave).toBe(1)
    expect(s.lopDays).toBe(2)
  })
})

describe('holidays', () => {
  beforeAll(async () => {
    await db.holiday.create({
      data: { branchId, date: d(15), name: `${TAG} local festival` },
    })
    await db.holiday.create({
      // null branch = every branch
      data: { branchId: null, date: d(20), name: `${TAG} national holiday` },
    })
  })

  it('returns both branch-specific and institute-wide holidays', async () => {
    const dates = await holidayDatesFor(branchId, 2026, 7)
    expect(dates.sort()).toEqual(['2026-07-15', '2026-07-20'])
  })

  it('gives another branch only the institute-wide one', async () => {
    const dates = await holidayDatesFor(otherBranchId, 2026, 7)
    expect(dates).toEqual(['2026-07-20'])
  })
})

describe('payroll reads attendance', () => {
  let runId: string

  it('takes each employee’s unpaid days from the register', async () => {
    const run = await createPayrollRun({
      branchId,
      year: 2026,
      month: 7,
      createdById: userId,
    })
    runId = run.runId
    expect(run.fromAttendance).toBe(3)

    const slips = await db.payslip.findMany({
      where: { runId },
      select: { employeeId: true, lopDays: true, grossPaise: true, attendanceMarkedDays: true },
    })
    const by = (id: string) => slips.find((s) => s.employeeId === id)!

    expect(Number(by(present).lopDays)).toBe(0)
    expect(by(present).grossPaise).toBe(R(31000))

    expect(Number(by(absentee).lopDays)).toBe(2)
    expect(by(absentee).grossPaise).toBe(R(29000)) // 31,000 * 29/31

    expect(Number(by(halfDayer).lopDays)).toBe(1.5)
    expect(by(halfDayer).grossPaise).toBe(R(29500)) // 31,000 * 29.5/31
  })

  it('records how much of the month was actually marked', async () => {
    const slip = await db.payslip.findFirstOrThrow({
      where: { runId, employeeId: present },
    })
    // 20 of 31 days — visible, so a half-empty register is not mistaken for
    // a clean one.
    expect(slip.attendanceMarkedDays).toBe(20)
  })

  it('still lets the office override what the register says', async () => {
    const slip = await db.payslip.findFirstOrThrow({
      where: { runId, employeeId: absentee },
    })
    await recalculatePayslip({ payslipId: slip.id, lopDays: 1 })
    const after = await db.payslip.findUniqueOrThrow({ where: { id: slip.id } })
    expect(Number(after.lopDays)).toBe(1)
    expect(after.grossPaise).toBe(R(30000))
  })

  it('does NOT restate an approved run when attendance changes afterwards', async () => {
    await approvePayrollRun({ runId, approvedById: userId })
    const before = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } })

    // Someone corrects the register a week later.
    await db.staffAttendance.updateMany({
      where: { employeeId: present, date: { gte: d(1), lte: d(10) } },
      data: { status: 'ABSENT' },
    })

    const after = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } })
    expect(after.grossPaise).toBe(before.grossPaise)
    expect(after.netPaise).toBe(before.netPaise)

    const slip = await db.payslip.findFirstOrThrow({
      where: { runId, employeeId: present },
    })
    expect(Number(slip.lopDays)).toBe(0)
  })

  it('caps unpaid days at the length of the period', async () => {
    // A register marked on a different basis must not produce 40 unpaid
    // days in a 30-day month.
    const victim = await db.employee.create({
      data: { branchId, employeeCode: `${TAG}-CAP`, firstName: 'Capped' },
    })
    await reviseSalaryStructure({
      employeeId: victim.id,
      effectiveFrom: new Date('2026-01-01'),
      lines: [{ componentId: basicId, amountPaise: R(30000) }],
      createdById: userId,
    })
    await db.staffAttendance.createMany({
      data: Array.from({ length: 31 }, (_, i) => ({
        branchId,
        employeeId: victim.id,
        date: new Date(Date.UTC(2026, 8, i + 1)),
        status: 'ABSENT' as const,
      })),
    })

    const run = await createPayrollRun({
      branchId,
      year: 2026,
      month: 9, // 30 days
      createdById: userId,
    })
    const slip = await db.payslip.findFirstOrThrow({
      where: { runId: run.runId, employeeId: victim.id },
    })
    expect(Number(slip.lopDays)).toBe(30)
    expect(slip.grossPaise).toBe(0)
    expect(slip.netPaise).toBe(0)
  })
})
