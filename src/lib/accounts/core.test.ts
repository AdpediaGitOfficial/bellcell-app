import { describe, expect, it } from 'vitest'
import {
  balances,
  dayBookTotals,
  groupByHead,
  reconcile,
  type LedgerLine,
} from './core'

const line = (over: Partial<LedgerLine>): LedgerLine => ({
  entryDate: new Date('2026-10-08'),
  debitPaise: 0,
  creditPaise: 0,
  source: 'DAILY_TRANSACTION',
  ...over,
})

describe('dayBookTotals', () => {
  it('separates receipts from payments and carries the opening forward', () => {
    const t = dayBookTotals(120_000, [
      line({ debitPaise: 80_000, source: 'FEE_PAYMENT' }),
      line({ creditPaise: 25_000 }),
      line({ creditPaise: 15_000 }),
    ])
    expect(t).toEqual({
      openingPaise: 120_000,
      receiptsPaise: 80_000,
      paymentsPaise: 40_000,
      closingPaise: 160_000,
    })
  })

  it('always satisfies closing = opening + receipts - payments', () => {
    const cases = [
      dayBookTotals(0, []),
      dayBookTotals(-5_000, [line({ creditPaise: 1_000 })]),
      dayBookTotals(100, [line({ debitPaise: 7 }), line({ creditPaise: 900 })]),
    ]
    for (const t of cases) expect(balances(t)).toBe(true)
  })

  it('carries a negative opening balance through, rather than clamping it', () => {
    const t = dayBookTotals(-5_000, [line({ debitPaise: 1_000 })])
    expect(t.openingPaise).toBe(-5_000)
    expect(t.closingPaise).toBe(-4_000)
  })

  it('handles an entry carrying both a debit and a credit', () => {
    const t = dayBookTotals(0, [line({ debitPaise: 500, creditPaise: 200 })])
    expect(t.receiptsPaise).toBe(500)
    expect(t.paymentsPaise).toBe(200)
    expect(t.closingPaise).toBe(300)
  })
})

describe('groupByHead', () => {
  it('buckets by head and labels missing heads rather than dropping them', () => {
    const rows = groupByHead([
      line({ debitPaise: 1_000, accountHeadName: 'Student Fees' }),
      line({ debitPaise: 2_000, accountHeadName: 'Student Fees' }),
      line({ creditPaise: 500, accountHeadName: 'Rent' }),
      line({ creditPaise: 100, accountHeadName: null }),
    ])
    expect(rows.find((r) => r.label === 'Student Fees')?.receiptsPaise).toBe(3_000)
    expect(rows.find((r) => r.label === 'Rent')?.paymentsPaise).toBe(500)
    expect(rows.find((r) => r.label === 'Unclassified')?.count).toBe(1)
  })

  it('orders by total movement, biggest first', () => {
    const rows = groupByHead([
      line({ creditPaise: 100, accountHeadName: 'Small' }),
      line({ debitPaise: 9_000, accountHeadName: 'Big' }),
    ])
    expect(rows[0]!.label).toBe('Big')
  })
})

describe('reconcile', () => {
  it('shows what is still owed to the university', () => {
    const rows = reconcile(
      [
        { key: 'exam', label: 'Examination Fee', amountPaise: 300_000 },
        { key: 'reg', label: 'University Registration Fee', amountPaise: 100_000 },
      ],
      [{ key: 'exam', amountPaise: 200_000 }],
    )
    expect(rows.find((r) => r.key === 'exam')?.outstandingPaise).toBe(100_000)
    expect(rows.find((r) => r.key === 'reg')?.outstandingPaise).toBe(100_000)
  })

  it('surfaces an over-remittance as a negative, rather than hiding it at zero', () => {
    const rows = reconcile(
      [{ key: 'exam', label: 'Examination Fee', amountPaise: 100_000 }],
      [{ key: 'exam', amountPaise: 150_000 }],
    )
    expect(rows[0]!.outstandingPaise).toBe(-50_000)
  })

  it('keeps a remittance with no matching collection', () => {
    // Paying the university for something never billed to students is
    // exactly the anomaly this report should expose.
    const rows = reconcile([], [{ key: 'mystery', amountPaise: 7_000 }])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.outstandingPaise).toBe(-7_000)
  })
})
