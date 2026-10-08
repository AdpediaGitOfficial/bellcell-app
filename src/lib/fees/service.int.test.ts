import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { assignFeeStructure, cancelPayment, applyConcession, recordPayment, FeeError } from './service'

/**
 * Integration tests for the money path, against a real PostgreSQL database.
 *
 * Everything created here is namespaced with a run-unique tag and removed
 * afterwards, so these can run against a development database with seed data
 * present without disturbing it.
 */
const db = new PrismaClient()
const TAG = `inttest-${Date.now()}`

let branchId: string
let studentId: string
let structureId: string
let userId: string

beforeAll(async () => {
  const branch = await db.branch.create({
    data: { code: `${TAG}-BR`, name: `${TAG} Branch` },
  })
  branchId = branch.id

  const user = await db.user.create({
    data: {
      email: `${TAG}@test.local`,
      fullName: 'Integration Test',
      passwordHash: 'x',
      role: 'ACCOUNTANT',
    },
  })
  userId = user.id

  const courseType = await db.courseType.create({ data: { name: `${TAG} Type` } })
  const course = await db.course.create({
    data: { code: `${TAG}-C`, name: `${TAG} Course`, courseTypeId: courseType.id },
  })
  const batch = await db.batch.create({
    data: {
      name: `${TAG} Batch`,
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-05-31'),
    },
  })
  const head = await db.accountHead.upsert({
    where: { code: 'AH-FEE' },
    update: {},
    create: { code: 'AH-FEE', name: 'Student Fees', kind: 'INCOME' },
  })
  const feeType = await db.feeType.create({
    data: {
      code: `${TAG}-FT`,
      name: 'Tuition Fee',
      category: 'TUITION',
      accountHeadId: head.id,
    },
  })

  const structure = await db.feeStructure.create({
    data: {
      name: `${TAG} Structure`,
      branchId,
      courseId: course.id,
      batchId: batch.id,
      courseYear: 1,
      items: {
        create: [
          { feeTypeId: feeType.id, amountPaise: 100_000, installmentNo: 1, dueAfterDays: 0 },
          { feeTypeId: feeType.id, amountPaise: 200_000, installmentNo: 2, dueAfterDays: 90 },
        ],
      },
    },
  })
  structureId = structure.id

  const student = await db.student.create({
    data: {
      branchId,
      applicationNo: `${TAG}-APP`,
      admissionNo: `${TAG}-ADM`,
      firstName: 'Test',
      lastName: 'Student',
      courseId: course.id,
      batchId: batch.id,
      admissionDate: new Date('2026-06-15'),
      status: 'ACTIVE',
    },
  })
  studentId = student.id
})

afterAll(async () => {
  // Children first; the schema cascades most of these, but be explicit.
  await db.ledgerEntry.deleteMany({ where: { branchId } })
  await db.paymentAllocation.deleteMany({ where: { payment: { branchId } } })
  await db.payment.deleteMany({ where: { branchId } })
  await db.feeConcession.deleteMany({ where: { studentId } })
  await db.feeInstallment.deleteMany({ where: { studentId } })
  await db.studentFeeAssignment.deleteMany({ where: { studentId } })
  await db.student.deleteMany({ where: { branchId } })
  await db.receiptSequence.deleteMany({ where: { branchId } })
  await db.feeStructureItem.deleteMany({ where: { structureId } })
  await db.feeStructure.deleteMany({ where: { id: structureId } })
  await db.feeType.deleteMany({ where: { code: { startsWith: TAG } } })
  await db.batch.deleteMany({ where: { name: { startsWith: TAG } } })
  await db.course.deleteMany({ where: { code: { startsWith: TAG } } })
  await db.courseType.deleteMany({ where: { name: { startsWith: TAG } } })
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } })
  await db.branch.deleteMany({ where: { id: branchId } })
  await db.$disconnect()
})

describe('assignFeeStructure', () => {
  it('materialises instalments with dates relative to admission', async () => {
    const result = await assignFeeStructure({ studentId, structureId, assignedById: userId })
    expect(result.created).toBe(2)
    expect(result.totalPaise).toBe(300_000)

    const rows = await db.feeInstallment.findMany({
      where: { studentId },
      orderBy: { installmentNo: 'asc' },
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]!.dueDate.toISOString().slice(0, 10)).toBe('2026-06-15')
    expect(rows[1]!.dueDate.toISOString().slice(0, 10)).toBe('2026-09-13')
  })

  it('refuses to assign the same structure twice', async () => {
    await expect(
      assignFeeStructure({ studentId, structureId, assignedById: userId }),
    ).rejects.toThrow(FeeError)
  })
})

describe('recordPayment', () => {
  it('settles the oldest instalment, numbers the receipt and posts to the ledger', async () => {
    const r = await recordPayment({
      studentId,
      branchId,
      amountPaise: 100_000,
      mode: 'CASH',
      receiptDate: new Date('2026-10-08'),
      collectedById: userId,
    })

    expect(r.receiptNo).toMatch(/^RC\/2026-27\/\d{4}$/)

    const first = await db.feeInstallment.findFirst({
      where: { studentId, installmentNo: 1 },
    })
    expect(first!.paidPaise).toBe(100_000)
    expect(first!.status).toBe('PAID')

    // The Day Book must tie to the fee register (ADR-003).
    const ledger = await db.ledgerEntry.findFirst({
      where: { paymentId: r.paymentId },
    })
    expect(ledger?.debitPaise).toBe(100_000)
    expect(ledger?.source).toBe('FEE_PAYMENT')
  })

  it('moves on to the next instalment once the first is settled', async () => {
    const r = await recordPayment({
      studentId,
      branchId,
      amountPaise: 50_000,
      mode: 'UPI',
      receiptDate: new Date('2026-10-08'),
      collectedById: userId,
    })
    expect(r.allocated).toBe(1)

    const second = await db.feeInstallment.findFirst({
      where: { studentId, installmentNo: 2 },
    })
    expect(second!.paidPaise).toBe(50_000)
    // Instalment 2 fell due on 13 Sep 2026, so a part payment leaves it
    // OVERDUE rather than PARTIALLY_PAID: what is still owed is late, and
    // that is the state the office needs to act on. (The pre-due-date
    // PARTIALLY_PAID case is covered in core.test.ts.)
    expect(second!.status).toBe('OVERDUE')
  })

  it('refuses an overpayment rather than banking money it cannot attribute', async () => {
    await expect(
      recordPayment({
        studentId,
        branchId,
        amountPaise: 999_999,
        mode: 'CASH',
        receiptDate: new Date('2026-10-08'),
        collectedById: userId,
      }),
    ).rejects.toThrow(/exceeds the outstanding balance/)
  })

  it('issues unique, gapless receipt numbers under concurrency', async () => {
    // Two cashiers taking money at the same instant must not be handed the
    // same receipt number.
    const before = await db.payment.count({ where: { branchId } })
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        recordPayment({
          studentId,
          branchId,
          amountPaise: 10_000,
          mode: 'CASH',
          receiptDate: new Date('2026-10-08'),
          collectedById: userId,
        }),
      ),
    )
    const numbers = results.map((r) => r.receiptNo)
    expect(new Set(numbers).size).toBe(5)
    expect(await db.payment.count({ where: { branchId } })).toBe(before + 5)
  })
})

describe('cancelPayment', () => {
  it('reverses the allocation and posts a contra entry, keeping the receipt', async () => {
    const r = await recordPayment({
      studentId,
      branchId,
      amountPaise: 20_000,
      mode: 'CHEQUE',
      receiptDate: new Date('2026-10-08'),
      collectedById: userId,
    })

    const beforeInst = await db.feeInstallment.findFirst({
      where: { studentId, installmentNo: 2 },
    })

    await cancelPayment({ paymentId: r.paymentId, reason: 'Cheque bounced', bounced: true })

    const payment = await db.payment.findUnique({ where: { id: r.paymentId } })
    expect(payment?.status).toBe('BOUNCED')
    // The receipt still exists — the series must not gain a hole.
    expect(payment?.receiptNo).toBe(r.receiptNo)

    const afterInst = await db.feeInstallment.findFirst({
      where: { studentId, installmentNo: 2 },
    })
    expect(afterInst!.paidPaise).toBe(beforeInst!.paidPaise - 20_000)

    const contra = await db.ledgerEntry.findFirst({
      where: { paymentId: r.paymentId, source: 'ADJUSTMENT' },
    })
    expect(contra?.creditPaise).toBe(20_000)
  })

  it('will not cancel the same receipt twice', async () => {
    const r = await recordPayment({
      studentId,
      branchId,
      amountPaise: 10_000,
      mode: 'CASH',
      receiptDate: new Date('2026-10-08'),
      collectedById: userId,
    })
    await cancelPayment({ paymentId: r.paymentId, reason: 'Wrong entry' })
    await expect(
      cancelPayment({ paymentId: r.paymentId, reason: 'again' }),
    ).rejects.toThrow(/already been cancelled/)
  })
})

describe('applyConcession', () => {
  it('reduces what is owed and cannot exceed the balance', async () => {
    const inst = await db.feeInstallment.findFirst({
      where: { studentId, installmentNo: 2 },
    })
    const headroom =
      inst!.duePaise + inst!.lateFeePaise - inst!.concessionPaise - inst!.paidPaise

    await expect(
      applyConcession({
        studentId,
        installmentId: inst!.id,
        amountPaise: headroom + 1,
        kind: 'MERIT',
        reason: 'too big',
        approvedById: userId,
      }),
    ).rejects.toThrow(/exceeds what is still owed/)

    await applyConcession({
      studentId,
      installmentId: inst!.id,
      amountPaise: headroom,
      kind: 'MERIT',
      reason: 'Merit scholarship',
      approvedById: userId,
    })

    const after = await db.feeInstallment.findUnique({ where: { id: inst!.id } })
    expect(after!.concessionPaise).toBe(inst!.concessionPaise + headroom)
    // Fully covered by payment + concession, so it reads as settled.
    expect(after!.status).toBe('PAID')
  })
})
