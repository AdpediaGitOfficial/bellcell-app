import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import {
  AccountsError,
  recordAffiliationPayment,
  recordDailyTransaction,
  reverseDailyTransaction,
} from './service'

/**
 * Integration tests for the accounts money path. Everything is namespaced to
 * this run and removed afterwards, so it is safe against a dev database that
 * already holds seed data.
 */
const db = new PrismaClient()
const TAG = `acct-${Date.now()}`

let branchId: string
let userId: string
let incomeHeadId: string
let expenseHeadId: string
let bodyId: string

beforeAll(async () => {
  const branch = await db.branch.create({
    data: { code: `${TAG}-BR`, name: `${TAG} Branch` },
  })
  branchId = branch.id

  const user = await db.user.create({
    data: {
      email: `${TAG}@test.local`,
      fullName: 'Accounts Test',
      passwordHash: 'x',
      role: 'ACCOUNTANT',
    },
  })
  userId = user.id

  const income = await db.accountHead.create({
    data: { code: `${TAG}-INC`, name: 'Donation', kind: 'INCOME' },
  })
  incomeHeadId = income.id

  const expense = await db.accountHead.create({
    data: { code: `${TAG}-EXP`, name: 'Rent', kind: 'EXPENSE' },
  })
  expenseHeadId = expense.id

  const body = await db.affiliationBody.create({
    data: { code: `${TAG}-UNI`, name: `${TAG} University` },
  })
  bodyId = body.id
})

afterAll(async () => {
  await db.ledgerEntry.deleteMany({ where: { branchId } })
  await db.dailyTransaction.deleteMany({ where: { branchId } })
  await db.affiliationPayment.deleteMany({ where: { branchId } })
  await db.receiptSequence.deleteMany({ where: { branchId } })
  await db.branch.deleteMany({ where: { id: branchId } })
  await db.accountHead.deleteMany({ where: { code: { startsWith: TAG } } })
  await db.affiliationBody.deleteMany({ where: { code: { startsWith: TAG } } })
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } })
  await db.$disconnect()
})

const DATE = new Date('2026-10-08')

describe('recordDailyTransaction', () => {
  it('numbers the voucher and posts income as a ledger debit', async () => {
    const r = await recordDailyTransaction({
      branchId,
      transactionDate: DATE,
      kind: 'INCOME',
      accountHeadId: incomeHeadId,
      amountPaise: 250_000,
      mode: 'CASH',
      enteredById: userId,
      narration: 'Alumni donation',
    })

    expect(r.voucherNo).toMatch(/^VCH\/2026-27\/\d{4}$/)

    const entry = await db.ledgerEntry.findFirst({
      where: { dailyTransactionId: r.id, source: 'DAILY_TRANSACTION' },
    })
    expect(entry?.debitPaise).toBe(250_000)
    expect(entry?.creditPaise).toBe(0)
  })

  it('posts an expense as a ledger credit', async () => {
    const r = await recordDailyTransaction({
      branchId,
      transactionDate: DATE,
      kind: 'EXPENSE',
      accountHeadId: expenseHeadId,
      amountPaise: 90_000,
      mode: 'BANK_TRANSFER',
      enteredById: userId,
    })
    const entry = await db.ledgerEntry.findFirst({
      where: { dailyTransactionId: r.id, source: 'DAILY_TRANSACTION' },
    })
    expect(entry?.creditPaise).toBe(90_000)
    expect(entry?.debitPaise).toBe(0)
  })

  it('refuses a head whose kind contradicts the entry', async () => {
    // Otherwise a "Rent" row gets counted as income and the books are wrong.
    await expect(
      recordDailyTransaction({
        branchId,
        transactionDate: DATE,
        kind: 'INCOME',
        accountHeadId: expenseHeadId,
        amountPaise: 1_000,
        mode: 'CASH',
        enteredById: userId,
      }),
    ).rejects.toThrow(/cannot be recorded as income/i)
  })

  it('refuses a zero or negative amount', async () => {
    await expect(
      recordDailyTransaction({
        branchId,
        transactionDate: DATE,
        kind: 'INCOME',
        accountHeadId: incomeHeadId,
        amountPaise: 0,
        mode: 'CASH',
        enteredById: userId,
      }),
    ).rejects.toThrow(AccountsError)
  })

  it('issues unique voucher numbers under concurrency', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        recordDailyTransaction({
          branchId,
          transactionDate: DATE,
          kind: 'INCOME',
          accountHeadId: incomeHeadId,
          amountPaise: 1_000,
          mode: 'CASH',
          enteredById: userId,
        }),
      ),
    )
    expect(new Set(results.map((r) => r.voucherNo)).size).toBe(5)
  })

  it('keeps the receipt and voucher series independent', async () => {
    // Both runs must be gapless on their own; sharing a counter would make
    // each look like it had holes.
    const seqs = await db.receiptSequence.findMany({ where: { branchId } })
    const voucher = seqs.find((s) => s.series === 'VOUCHER')
    expect(voucher?.prefix).toBe('VCH')
    expect(voucher!.lastNumber).toBeGreaterThan(1)
  })
})

describe('reverseDailyTransaction', () => {
  it('posts a mirror entry and keeps the original voucher', async () => {
    const r = await recordDailyTransaction({
      branchId,
      transactionDate: DATE,
      kind: 'EXPENSE',
      accountHeadId: expenseHeadId,
      amountPaise: 40_000,
      mode: 'CASH',
      enteredById: userId,
    })

    await reverseDailyTransaction({ transactionId: r.id, reason: 'Duplicate entry' })

    const contra = await db.ledgerEntry.findFirst({
      where: { dailyTransactionId: r.id, source: 'ADJUSTMENT' },
    })
    // An expense reverses as a debit.
    expect(contra?.debitPaise).toBe(40_000)

    const original = await db.dailyTransaction.findUnique({ where: { id: r.id } })
    expect(original?.voucherNo).toBe(r.voucherNo)
  })

  it('will not reverse the same voucher twice', async () => {
    const r = await recordDailyTransaction({
      branchId,
      transactionDate: DATE,
      kind: 'INCOME',
      accountHeadId: incomeHeadId,
      amountPaise: 5_000,
      mode: 'CASH',
      enteredById: userId,
    })
    await reverseDailyTransaction({ transactionId: r.id, reason: 'first' })
    await expect(
      reverseDailyTransaction({ transactionId: r.id, reason: 'second' }),
    ).rejects.toThrow(/already been reversed/)
  })
})

describe('recordAffiliationPayment', () => {
  it('posts a remittance as money out', async () => {
    const r = await recordAffiliationPayment({
      branchId,
      affiliationBodyId: bodyId,
      amountPaise: 500_000,
      paidOn: DATE,
      mode: 'BANK_TRANSFER',
      referenceNo: 'NEFT-TEST-1',
      studentCount: 20,
    })
    const entry = await db.ledgerEntry.findFirst({
      where: { affiliationPaymentId: r.id },
    })
    expect(entry?.creditPaise).toBe(500_000)
    expect(entry?.source).toBe('AFFILIATION_PAYMENT')
  })
})

describe('the ledger ties', () => {
  it('nets to the same figure whether read from the ledger or the source rows', async () => {
    const [ledger, txns, remits] = await Promise.all([
      db.ledgerEntry.aggregate({
        _sum: { debitPaise: true, creditPaise: true },
        where: { branchId },
      }),
      db.dailyTransaction.findMany({
        where: { branchId },
        select: { kind: true, amountPaise: true, id: true },
      }),
      db.affiliationPayment.aggregate({
        _sum: { amountPaise: true },
        where: { branchId },
      }),
    ])

    const reversedIds = new Set(
      (
        await db.ledgerEntry.findMany({
          where: { branchId, source: 'ADJUSTMENT' },
          select: { dailyTransactionId: true },
        })
      ).map((e) => e.dailyTransactionId),
    )

    const expected = txns.reduce((sum, t) => {
      if (reversedIds.has(t.id)) return sum // posted then reversed, nets to nil
      return sum + (t.kind === 'INCOME' ? t.amountPaise : -t.amountPaise)
    }, 0) - (remits._sum.amountPaise ?? 0)

    const actual = (ledger._sum.debitPaise ?? 0) - (ledger._sum.creditPaise ?? 0)
    expect(actual).toBe(expected)
  })
})
