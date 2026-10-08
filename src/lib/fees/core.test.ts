import { describe, expect, it } from 'vitest'
import {
  allocatePayment,
  deriveStatus,
  financialYearFor,
  formatReceiptNo,
  generateInstallments,
  outstandingPaise,
  summariseFees,
  type AllocatableInstallment,
} from './core'

const d = (s: string) => new Date(`${s}T00:00:00`)

function inst(
  over: Partial<AllocatableInstallment> & { id: string; dueDate: Date },
): AllocatableInstallment {
  return {
    installmentNo: 1,
    duePaise: 0,
    concessionPaise: 0,
    lateFeePaise: 0,
    paidPaise: 0,
    ...over,
  }
}

describe('financialYearFor', () => {
  it('runs April to March', () => {
    expect(financialYearFor(d('2026-04-01'))).toBe('2026-27')
    expect(financialYearFor(d('2026-10-08'))).toBe('2026-27')
    expect(financialYearFor(d('2027-03-31'))).toBe('2026-27')
    expect(financialYearFor(d('2027-04-01'))).toBe('2027-28')
  })

  it('pads the century rollover', () => {
    expect(financialYearFor(d('2099-05-01'))).toBe('2099-00')
  })
})

describe('generateInstallments', () => {
  const admission = d('2026-06-15')

  it('uses dueAfterDays relative to admission', () => {
    const out = generateInstallments(
      [
        {
          id: '1',
          feeTypeId: 'tui',
          feeTypeName: 'Tuition Fee',
          amountPaise: 1500000,
          installmentNo: 1,
          dueAfterDays: 15,
          dueDate: null,
        },
      ],
      admission,
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.dueDate).toEqual(d('2026-06-30'))
    expect(out[0]!.label).toBe('Tuition Fee')
  })

  it('lets a fixed dueDate override dueAfterDays', () => {
    // A university deadline does not move with the admission date.
    const out = generateInstallments(
      [
        {
          id: '1',
          feeTypeId: 'exam',
          feeTypeName: 'Exam Fee',
          amountPaise: 300000,
          installmentNo: 1,
          dueAfterDays: 15,
          dueDate: d('2026-12-01'),
        },
      ],
      admission,
    )
    expect(out[0]!.dueDate).toEqual(d('2026-12-01'))
  })

  it('numbers later instalments in the label', () => {
    const out = generateInstallments(
      [
        {
          id: '2',
          feeTypeId: 'tui',
          feeTypeName: 'Tuition Fee',
          amountPaise: 1500000,
          installmentNo: 2,
          dueAfterDays: 120,
          dueDate: null,
        },
      ],
      admission,
    )
    expect(out[0]!.label).toBe('Tuition Fee — Instalment 2')
  })

  it('drops zero-amount items and sorts by instalment then due date', () => {
    const out = generateInstallments(
      [
        { id: '3', feeTypeId: 'c', feeTypeName: 'C', amountPaise: 0, installmentNo: 1, dueAfterDays: 0, dueDate: null },
        { id: '2', feeTypeId: 'b', feeTypeName: 'B', amountPaise: 100, installmentNo: 2, dueAfterDays: 60, dueDate: null },
        { id: '1', feeTypeId: 'a', feeTypeName: 'A', amountPaise: 100, installmentNo: 1, dueAfterDays: 10, dueDate: null },
      ],
      admission,
    )
    expect(out.map((i) => i.feeTypeId)).toEqual(['a', 'b'])
  })
})

describe('outstandingPaise', () => {
  it('is due + late fee - concession - paid', () => {
    expect(
      outstandingPaise(
        inst({ id: '1', dueDate: d('2026-07-01'), duePaise: 1500000, lateFeePaise: 6000, concessionPaise: 250000, paidPaise: 500000 }),
      ),
    ).toBe(756000)
  })

  it('never goes negative on overpayment', () => {
    expect(
      outstandingPaise(inst({ id: '1', dueDate: d('2026-07-01'), duePaise: 1000, paidPaise: 5000 })),
    ).toBe(0)
  })
})

describe('allocatePayment', () => {
  const a = inst({ id: 'a', dueDate: d('2026-07-01'), installmentNo: 1, duePaise: 100000 })
  const b = inst({ id: 'b', dueDate: d('2026-10-01'), installmentNo: 2, duePaise: 100000 })
  const c = inst({ id: 'c', dueDate: d('2027-01-01'), installmentNo: 3, duePaise: 100000 })

  it('clears the oldest due date first', () => {
    const { allocations, unallocatedPaise } = allocatePayment(150000, [c, a, b])
    expect(allocations).toEqual([
      { installmentId: 'a', amountPaise: 100000 },
      { installmentId: 'b', amountPaise: 50000 },
    ])
    expect(unallocatedPaise).toBe(0)
  })

  it('reports a remainder rather than silently keeping it', () => {
    // An unallocated rupee is money the ledger has that no instalment credits.
    const { allocations, unallocatedPaise } = allocatePayment(350000, [a, b, c])
    expect(allocations).toHaveLength(3)
    expect(unallocatedPaise).toBe(50000)
  })

  it('honours explicit targets over FIFO', () => {
    // The office collecting a specific exam fee must not have it swallowed
    // by an older tuition instalment.
    const { allocations } = allocatePayment(100000, [a, b, c], ['c'])
    expect(allocations).toEqual([{ installmentId: 'c', amountPaise: 100000 }])
  })

  it('skips instalments already settled', () => {
    const paid = inst({ id: 'a', dueDate: d('2026-07-01'), duePaise: 100000, paidPaise: 100000 })
    const { allocations } = allocatePayment(50000, [paid, b])
    expect(allocations).toEqual([{ installmentId: 'b', amountPaise: 50000 }])
  })

  it('accounts for concessions when deciding how much is owed', () => {
    const discounted = inst({
      id: 'a', dueDate: d('2026-07-01'), duePaise: 100000, concessionPaise: 40000,
    })
    const { allocations, unallocatedPaise } = allocatePayment(100000, [discounted])
    expect(allocations).toEqual([{ installmentId: 'a', amountPaise: 60000 }])
    expect(unallocatedPaise).toBe(40000)
  })

  it('returns nothing for a zero or negative amount', () => {
    expect(allocatePayment(0, [a]).allocations).toEqual([])
    expect(allocatePayment(-500, [a]).allocations).toEqual([])
  })
})

describe('deriveStatus', () => {
  const due = d('2026-07-01')

  it('is PENDING before the due date with nothing paid', () => {
    expect(deriveStatus(inst({ id: '1', dueDate: due, duePaise: 1000 }), d('2026-06-20'))).toBe('PENDING')
  })

  it('is PARTIALLY_PAID before the due date with something paid', () => {
    expect(
      deriveStatus(inst({ id: '1', dueDate: due, duePaise: 1000, paidPaise: 400 }), d('2026-06-20')),
    ).toBe('PARTIALLY_PAID')
  })

  it('is OVERDUE after the due date when unpaid', () => {
    expect(deriveStatus(inst({ id: '1', dueDate: due, duePaise: 1000 }), d('2026-07-02'))).toBe('OVERDUE')
  })

  it('is not overdue ON the due date', () => {
    expect(deriveStatus(inst({ id: '1', dueDate: due, duePaise: 1000 }), due)).toBe('PENDING')
  })

  it('reads PAID even when settled late', () => {
    // A late payment must not leave the row red for ever.
    expect(
      deriveStatus(inst({ id: '1', dueDate: due, duePaise: 1000, paidPaise: 1000 }), d('2026-12-01')),
    ).toBe('PAID')
  })

  it('treats a full concession as PAID', () => {
    expect(
      deriveStatus(inst({ id: '1', dueDate: due, duePaise: 1000, concessionPaise: 1000 }), d('2026-12-01')),
    ).toBe('PAID')
  })

  it('honours an explicit waiver', () => {
    expect(deriveStatus(inst({ id: '1', dueDate: due, duePaise: 1000 }), d('2026-12-01'), true)).toBe('WAIVED')
  })
})

describe('summariseFees', () => {
  it('totals the tab and separates overdue from merely outstanding', () => {
    const asOf = d('2026-08-01')
    const s = summariseFees(
      [
        inst({ id: 'a', dueDate: d('2026-07-01'), duePaise: 100000, paidPaise: 40000 }), // overdue 60000
        inst({ id: 'b', dueDate: d('2026-12-01'), duePaise: 100000 }), // outstanding, not overdue
        inst({ id: 'c', dueDate: d('2026-06-01'), duePaise: 50000, paidPaise: 50000 }), // settled
      ],
      asOf,
    )
    expect(s.duePaise).toBe(250000)
    expect(s.paidPaise).toBe(90000)
    expect(s.outstandingPaise).toBe(160000)
    expect(s.overduePaise).toBe(60000)
  })
})

describe('formatReceiptNo', () => {
  it('zero-pads the serial', () => {
    expect(formatReceiptNo('RC', '2026-27', 42)).toBe('RC/2026-27/0042')
    expect(formatReceiptNo('RC', '2026-27', 12345)).toBe('RC/2026-27/12345')
  })
})
