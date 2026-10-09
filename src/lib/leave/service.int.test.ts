import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { createPayrollRun, reviseSalaryStructure } from '@/lib/payroll/service'
import { staffLopForMonth } from '@/lib/attendance/service'
import {
  LeaveError,
  applyForLeave,
  approveLeave,
  balancesFor,
  cancelLeave,
  rejectLeave,
  runCarryForward,
} from './service'

/**
 * Integration tests for leave, and above all for the chain it completes:
 * an approved leave writes the register, and the register is what payroll
 * charges for.
 */
const db = new PrismaClient()
const TAG = `lv-${Date.now()}`
const R = (rupees: number) => rupees * 100

let branchId: string
let userId: string
let basicId: string
let casualId: string
let lopId: string
let earnedId: string
let alice: string
let bob: string

beforeAll(async () => {
  const branch = await db.branch.create({
    data: { code: `${TAG}-BR`, name: `${TAG} Branch` },
  })
  branchId = branch.id

  const user = await db.user.create({
    data: { email: `${TAG}@test.local`, fullName: 'Leave Test', passwordHash: 'x', role: 'ADMIN' },
  })
  userId = user.id

  const basic = await db.salaryComponent.create({
    data: { code: `${TAG}-BASIC`, name: 'Basic', kind: 'EARNING', partOfBasic: true },
  })
  basicId = basic.id

  casualId = (
    await db.leaveType.create({
      data: { code: `${TAG}-CL`, name: 'Casual leave', isPaid: true, annualEntitlementDays: 12 },
    })
  ).id
  lopId = (
    await db.leaveType.create({
      data: { code: `${TAG}-LOP`, name: 'Loss of pay', isPaid: false, annualEntitlementDays: 0 },
    })
  ).id
  earnedId = (
    await db.leaveType.create({
      data: {
        code: `${TAG}-EL`,
        name: 'Earned leave',
        isPaid: true,
        annualEntitlementDays: 15,
        allowCarryForward: true,
        carryForwardCapDays: 10,
      },
    })
  ).id

  const mk = async (code: string, first: string) =>
    (
      await db.employee.create({
        data: {
          branchId,
          employeeCode: `${TAG}-${code}`,
          firstName: first,
          dateOfJoining: new Date('2026-01-01'),
        },
      })
    ).id

  alice = await mk('A', 'Alice')
  bob = await mk('B', 'Bob')

  for (const id of [alice, bob]) {
    await reviseSalaryStructure({
      employeeId: id,
      effectiveFrom: new Date('2026-01-01'),
      lines: [{ componentId: basicId, amountPaise: R(30000) }], // 1,000/day in June
      createdById: userId,
    })
  }

  // A holiday inside one of the spans below.
  await db.holiday.create({
    data: { branchId, date: new Date('2026-06-10T00:00:00.000Z'), name: `${TAG} holiday` },
  })
})

afterAll(async () => {
  await db.leaveRequest.deleteMany({ where: { branchId } })
  await db.leaveBalance.deleteMany({ where: { employee: { branchId } } })
  await db.leaveType.deleteMany({ where: { code: { startsWith: TAG } } })
  await db.staffAttendance.deleteMany({ where: { branchId } })
  await db.holiday.deleteMany({ where: { branchId } })
  await db.payslipLine.deleteMany({ where: { payslip: { run: { branchId } } } })
  await db.payslip.deleteMany({ where: { run: { branchId } } })
  await db.payrollRun.deleteMany({ where: { branchId } })
  await db.salaryStructureLine.deleteMany({ where: { structure: { employee: { branchId } } } })
  await db.salaryStructure.deleteMany({ where: { employee: { branchId } } })
  await db.employee.deleteMany({ where: { branchId } })
  await db.branch.deleteMany({ where: { id: branchId } })
  await db.salaryComponent.deleteMany({ where: { code: { startsWith: TAG } } })
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } })
  await db.$disconnect()
})

describe('balancesFor', () => {
  it('gives a new employee their full entitlement without needing a row first', async () => {
    const balances = await balancesFor(alice, 2026)
    const cl = balances.find((b) => b.leaveTypeId === casualId)
    expect(cl?.availableDays).toBe(12)
    expect(cl?.usedDays).toBe(0)
  })

  it('marks a zero-entitlement type as uncapped rather than exhausted', async () => {
    const balances = await balancesFor(alice, 2026)
    expect(balances.find((b) => b.leaveTypeId === lopId)?.uncapped).toBe(true)
  })
})

describe('applyForLeave', () => {
  it('counts working days, skipping a holiday in the middle', async () => {
    // 8 to 12 June, with 10 June a holiday -> 4 days.
    const r = await applyForLeave({
      branchId,
      employeeId: alice,
      leaveTypeId: casualId,
      from: '2026-06-08',
      to: '2026-06-12',
      fromPortion: 'FULL',
      toPortion: 'FULL',
      appliedById: userId,
    })
    expect(r.days).toBe(4)
    expect(r.status).toBe('PENDING')
  })

  it('does not touch the balance until it is approved', async () => {
    const balances = await balancesFor(alice, 2026)
    expect(balances.find((b) => b.leaveTypeId === casualId)?.usedDays).toBe(0)
  })

  it('refuses an overlapping request', async () => {
    await expect(
      applyForLeave({
        branchId,
        employeeId: alice,
        leaveTypeId: casualId,
        from: '2026-06-12',
        to: '2026-06-15',
        fromPortion: 'FULL',
        toPortion: 'FULL',
        appliedById: userId,
      }),
    ).rejects.toThrow(/overlaps/)
  })

  it('refuses more than the entitlement, naming what is left', async () => {
    await expect(
      applyForLeave({
        branchId,
        employeeId: bob,
        leaveTypeId: casualId,
        from: '2026-07-01',
        to: '2026-07-31',
        fromPortion: 'FULL',
        toPortion: 'FULL',
        appliedById: userId,
      }),
    ).rejects.toThrow(/Only 12 days of Casual leave remain/)
  })

  it('allows the same span on an UNCAPPED type', async () => {
    const r = await applyForLeave({
      branchId,
      employeeId: bob,
      leaveTypeId: lopId,
      from: '2026-07-01',
      to: '2026-07-31',
      fromPortion: 'FULL',
      toPortion: 'FULL',
      appliedById: userId,
    })
    expect(r.days).toBe(31)
    await cancelLeave({ requestId: r.requestId, reason: 'test cleanup' })
  })

  it('refuses leave before the employee joined', async () => {
    await expect(
      applyForLeave({
        branchId,
        employeeId: alice,
        leaveTypeId: casualId,
        from: '2025-12-20',
        to: '2025-12-21',
        fromPortion: 'FULL',
        toPortion: 'FULL',
        appliedById: userId,
      }),
    ).rejects.toThrow(/before 2026-01-01/)
  })

  it('refuses a request spanning two years rather than guessing which balance pays', async () => {
    await expect(
      applyForLeave({
        branchId,
        employeeId: alice,
        leaveTypeId: casualId,
        from: '2026-12-28',
        to: '2027-01-03',
        fromPortion: 'FULL',
        toPortion: 'FULL',
        appliedById: userId,
      }),
    ).rejects.toThrow(/two calendar years/)
  })
})

describe('approveLeave writes the register', () => {
  let requestId: string

  beforeAll(async () => {
    const pending = await db.leaveRequest.findFirstOrThrow({
      where: { employeeId: alice, status: 'PENDING' },
    })
    requestId = pending.id
    await approveLeave({ requestId, decidedById: userId })
  })

  it('consumes the balance', async () => {
    const balances = await balancesFor(alice, 2026)
    const cl = balances.find((b) => b.leaveTypeId === casualId)
    expect(cl?.usedDays).toBe(4)
    expect(cl?.availableDays).toBe(8)
  })

  it('writes PAID_LEAVE on every working day of the span', async () => {
    const rows = await db.staffAttendance.findMany({
      where: { employeeId: alice },
      orderBy: { date: 'asc' },
    })
    expect(rows.map((r) => r.date.toISOString().slice(0, 10))).toEqual([
      '2026-06-08',
      '2026-06-09',
      '2026-06-11',
      '2026-06-12',
    ])
    expect(rows.every((r) => r.status === 'PAID_LEAVE')).toBe(true)
  })

  it('writes NOTHING on the holiday inside the span', async () => {
    const onHoliday = await db.staffAttendance.findFirst({
      where: { employeeId: alice, date: new Date('2026-06-10T00:00:00.000Z') },
    })
    expect(onHoliday).toBeNull()
  })

  it('names the leave type on the register, so the row explains itself', async () => {
    const row = await db.staffAttendance.findFirstOrThrow({
      where: { employeeId: alice, date: new Date('2026-06-08T00:00:00.000Z') },
    })
    expect(row.remarks).toBe('Casual leave')
  })

  it('refuses to approve twice', async () => {
    await expect(approveLeave({ requestId, decidedById: userId })).rejects.toThrow(
      /already approved/,
    )
  })

  it('costs NOTHING in payroll, because the leave is paid', async () => {
    const lop = await staffLopForMonth(branchId, 2026, 6)
    expect(lop.get(alice)?.lopDays).toBe(0)
    expect(lop.get(alice)?.markedDays).toBe(4)
  })
})

describe('an UNPAID leave reaches the payslip', () => {
  it('charges the salary for every day of it', async () => {
    const r = await applyForLeave({
      branchId,
      employeeId: bob,
      leaveTypeId: lopId,
      from: '2026-06-15',
      to: '2026-06-17',
      fromPortion: 'FULL',
      toPortion: 'FULL',
      appliedById: userId,
    })
    await approveLeave({ requestId: r.requestId, decidedById: userId })

    const rows = await db.staffAttendance.findMany({ where: { employeeId: bob } })
    expect(rows.every((x) => x.status === 'UNPAID_LEAVE')).toBe(true)

    const run = await createPayrollRun({
      branchId,
      year: 2026,
      month: 6,
      createdById: userId,
    })
    const slip = await db.payslip.findFirstOrThrow({
      where: { runId: run.runId, employeeId: bob },
    })
    expect(Number(slip.lopDays)).toBe(3)
    expect(slip.grossPaise).toBe(R(27000)) // 30,000 * 27/30

    const paid = await db.payslip.findFirstOrThrow({
      where: { runId: run.runId, employeeId: alice },
    })
    expect(Number(paid.lopDays)).toBe(0)
    expect(paid.grossPaise).toBe(R(30000))
  })
})

describe('a PAID half day costs nothing', () => {
  it('records PAID_HALF_DAY, not HALF_DAY', async () => {
    const r = await applyForLeave({
      branchId,
      employeeId: alice,
      leaveTypeId: casualId,
      from: '2026-09-07',
      to: '2026-09-07',
      fromPortion: 'FIRST_HALF',
      toPortion: 'FULL',
      appliedById: userId,
    })
    expect(r.days).toBe(0.5)
    await approveLeave({ requestId: r.requestId, decidedById: userId })

    const row = await db.staffAttendance.findFirstOrThrow({
      where: { employeeId: alice, date: new Date('2026-09-07T00:00:00.000Z') },
    })
    expect(row.status).toBe('PAID_HALF_DAY')

    // The whole point: half a day of PAID leave is still paid.
    const lop = await staffLopForMonth(branchId, 2026, 9)
    expect(lop.get(alice)?.lopDays).toBe(0)
  })

  it('still consumes half a day of the entitlement', async () => {
    const balances = await balancesFor(alice, 2026)
    expect(balances.find((b) => b.leaveTypeId === casualId)?.usedDays).toBe(4.5)
  })
})

describe('rejectLeave', () => {
  it('insists on a reason', async () => {
    const r = await applyForLeave({
      branchId,
      employeeId: bob,
      leaveTypeId: casualId,
      from: '2026-10-05',
      to: '2026-10-06',
      fromPortion: 'FULL',
      toPortion: 'FULL',
      appliedById: userId,
    })
    await expect(
      rejectLeave({ requestId: r.requestId, decidedById: userId, note: '   ' }),
    ).rejects.toThrow(LeaveError)

    await rejectLeave({
      requestId: r.requestId,
      decidedById: userId,
      note: 'Examination duty that week',
    })
    const after = await db.leaveRequest.findUniqueOrThrow({ where: { id: r.requestId } })
    expect(after.status).toBe('REJECTED')
  })

  it('leaves the balance and the register untouched', async () => {
    const balances = await balancesFor(bob, 2026)
    expect(balances.find((b) => b.leaveTypeId === casualId)?.usedDays).toBe(0)
    const rows = await db.staffAttendance.count({
      where: { employeeId: bob, date: new Date('2026-10-05T00:00:00.000Z') },
    })
    expect(rows).toBe(0)
  })
})

describe('cancelLeave', () => {
  it('returns the balance and clears the register', async () => {
    const r = await applyForLeave({
      branchId,
      employeeId: bob,
      leaveTypeId: casualId,
      from: '2026-11-02',
      to: '2026-11-04',
      fromPortion: 'FULL',
      toPortion: 'FULL',
      appliedById: userId,
    })
    await approveLeave({ requestId: r.requestId, decidedById: userId })
    expect(
      (await balancesFor(bob, 2026)).find((b) => b.leaveTypeId === casualId)?.usedDays,
    ).toBe(3)

    const result = await cancelLeave({ requestId: r.requestId, reason: 'Trip called off' })
    expect(result.clearedDays).toBe(3)
    expect(result.keptDays).toBe(0)

    expect(
      (await balancesFor(bob, 2026)).find((b) => b.leaveTypeId === casualId)?.usedDays,
    ).toBe(0)
    expect(
      await db.staffAttendance.count({
        where: { employeeId: bob, date: new Date('2026-11-02T00:00:00.000Z') },
      }),
    ).toBe(0)
  })

  it('does NOT revert a day somebody has since corrected by hand', async () => {
    const r = await applyForLeave({
      branchId,
      employeeId: bob,
      leaveTypeId: casualId,
      from: '2026-11-09',
      to: '2026-11-10',
      fromPortion: 'FULL',
      toPortion: 'FULL',
      appliedById: userId,
    })
    await approveLeave({ requestId: r.requestId, decidedById: userId })

    // The office finds out they were actually absent without leave.
    await db.staffAttendance.updateMany({
      where: { employeeId: bob, date: new Date('2026-11-09T00:00:00.000Z') },
      data: { status: 'ABSENT' },
    })

    const result = await cancelLeave({ requestId: r.requestId, reason: 'Reclassified' })
    expect(result.clearedDays).toBe(1)
    expect(result.keptDays).toBe(1)

    // The hand-made correction survives.
    const kept = await db.staffAttendance.findFirstOrThrow({
      where: { employeeId: bob, date: new Date('2026-11-09T00:00:00.000Z') },
    })
    expect(kept.status).toBe('ABSENT')
  })

  it('insists on a reason', async () => {
    const r = await applyForLeave({
      branchId,
      employeeId: bob,
      leaveTypeId: casualId,
      from: '2026-11-16',
      to: '2026-11-16',
      fromPortion: 'FULL',
      toPortion: 'FULL',
      appliedById: userId,
    })
    await expect(cancelLeave({ requestId: r.requestId, reason: ' ' })).rejects.toThrow(
      LeaveError,
    )
  })
})

describe('runCarryForward', () => {
  it('moves unused days into next year, capped', async () => {
    await db.leaveBalance.create({
      data: {
        employeeId: alice,
        leaveTypeId: earnedId,
        year: 2026,
        entitledDays: 15,
        usedDays: 2,
      },
    })

    const result = await runCarryForward({ fromYear: 2026, branchId })
    expect(result.employees).toBeGreaterThanOrEqual(1)

    const next = await db.leaveBalance.findUniqueOrThrow({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: alice,
          leaveTypeId: earnedId,
          year: 2027,
        },
      },
    })
    // 13 unused, capped at 10.
    expect(Number(next.carriedForwardDays)).toBe(10)
    expect(Number(next.entitledDays)).toBe(15)
  })

  it('does not carry a type that forbids it', async () => {
    const next = await db.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: alice,
          leaveTypeId: casualId,
          year: 2027,
        },
      },
    })
    expect(next).toBeNull()
  })
})
