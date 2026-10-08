/**
 * Fee engine — pure logic.
 *
 * Kept free of Prisma so it can be tested exhaustively. The database-touching
 * parts live in `service.ts` and call into these.
 *
 * The vendor quotation described fees as a single screen; everything here is
 * detail that document left undefined. Where a rule had to be invented, it is
 * flagged ASSUMPTION and listed in docs/open-questions.md #2 for the
 * institute to confirm.
 */

export const INDIAN_FY_START_MONTH = 3 // April, zero-indexed

/**
 * Indian financial year label for a date: April–March.
 * 8 Oct 2026 -> "2026-27";  5 Feb 2027 -> "2026-27".
 */
export function financialYearFor(date: Date): string {
  const year = date.getMonth() >= INDIAN_FY_START_MONTH
    ? date.getFullYear()
    : date.getFullYear() - 1
  const next = String((year + 1) % 100).padStart(2, '0')
  return `${year}-${next}`
}

export interface StructureItemInput {
  id: string
  feeTypeId: string
  feeTypeName: string
  amountPaise: number
  installmentNo: number
  dueAfterDays: number | null
  dueDate: Date | null
}

export interface GeneratedInstallment {
  feeTypeId: string
  label: string
  installmentNo: number
  dueDate: Date
  duePaise: number
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * Turn a fee structure into the concrete instalments one student owes.
 *
 * Due date precedence: an item's fixed `dueDate` (a university deadline)
 * wins over `dueAfterDays` (relative to admission). An item with neither
 * falls due on the admission date itself.
 *
 * Items sharing an instalment number are kept as separate rows rather than
 * merged, so a receipt can show "Tuition" and "Exam Fee" individually —
 * ASSUMPTION, but the alternative loses the breakdown the office needs.
 */
export function generateInstallments(
  items: StructureItemInput[],
  admissionDate: Date,
): GeneratedInstallment[] {
  return items
    .filter((i) => i.amountPaise > 0)
    .map((i) => ({
      feeTypeId: i.feeTypeId,
      label:
        i.installmentNo > 1
          ? `${i.feeTypeName} — Instalment ${i.installmentNo}`
          : i.feeTypeName,
      installmentNo: i.installmentNo,
      dueDate:
        i.dueDate ??
        (i.dueAfterDays !== null
          ? addDays(admissionDate, i.dueAfterDays)
          : addDays(admissionDate, 0)),
      duePaise: i.amountPaise,
    }))
    .sort(
      (a, b) =>
        a.installmentNo - b.installmentNo ||
        a.dueDate.getTime() - b.dueDate.getTime(),
    )
}

export interface AllocatableInstallment {
  id: string
  dueDate: Date
  installmentNo: number
  duePaise: number
  concessionPaise: number
  lateFeePaise: number
  paidPaise: number
}

export interface Allocation {
  installmentId: string
  amountPaise: number
}

/** Outstanding on one instalment. Never stored — always derived. */
export function outstandingPaise(i: AllocatableInstallment): number {
  return Math.max(
    0,
    i.duePaise + i.lateFeePaise - i.concessionPaise - i.paidPaise,
  )
}

/**
 * Spread a receipt across instalments, oldest due date first.
 *
 * FIFO is the rule institutes expect: money clears the oldest debt. The
 * caller may instead pass explicit `targetIds` when the office is collecting
 * a specific fee (an exam fee paid before an older tuition instalment).
 *
 * Returns the allocations plus any unallocated remainder, which the caller
 * must reject rather than silently keep — an unallocated rupee is money the
 * ledger has but no instalment credits.
 */
export function allocatePayment(
  amountPaise: number,
  installments: AllocatableInstallment[],
  targetIds?: string[],
): { allocations: Allocation[]; unallocatedPaise: number } {
  if (amountPaise <= 0) return { allocations: [], unallocatedPaise: 0 }

  const pool = (
    targetIds && targetIds.length > 0
      ? installments.filter((i) => targetIds.includes(i.id))
      : [...installments]
  )
    .filter((i) => outstandingPaise(i) > 0)
    .sort(
      (a, b) =>
        a.dueDate.getTime() - b.dueDate.getTime() ||
        a.installmentNo - b.installmentNo,
    )

  const allocations: Allocation[] = []
  let remaining = amountPaise

  for (const inst of pool) {
    if (remaining <= 0) break
    const take = Math.min(remaining, outstandingPaise(inst))
    if (take > 0) {
      allocations.push({ installmentId: inst.id, amountPaise: take })
      remaining -= take
    }
  }

  return { allocations, unallocatedPaise: remaining }
}

export type DerivedStatus =
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'WAIVED'

/**
 * Status of an instalment as of a date.
 *
 * Order matters: fully settled beats overdue, so an instalment paid late
 * reads PAID rather than staying red for ever.
 */
export function deriveStatus(
  i: AllocatableInstallment,
  asOf: Date,
  isWaived = false,
): DerivedStatus {
  if (isWaived) return 'WAIVED'

  const payable = i.duePaise + i.lateFeePaise - i.concessionPaise
  if (payable <= 0) return 'PAID' // fully covered by concession
  if (i.paidPaise >= payable) return 'PAID'

  const startOfDue = new Date(
    i.dueDate.getFullYear(),
    i.dueDate.getMonth(),
    i.dueDate.getDate(),
  )
  const startOfAsOf = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate())

  if (startOfAsOf > startOfDue) return 'OVERDUE'
  return i.paidPaise > 0 ? 'PARTIALLY_PAID' : 'PENDING'
}

/** Totals for a student's fee tab. */
export function summariseFees(
  installments: AllocatableInstallment[],
  asOf = new Date(),
): {
  duePaise: number
  concessionPaise: number
  lateFeePaise: number
  paidPaise: number
  outstandingPaise: number
  overduePaise: number
} {
  let due = 0
  let concession = 0
  let lateFee = 0
  let paid = 0
  let outstanding = 0
  let overdue = 0

  for (const i of installments) {
    due += i.duePaise
    concession += i.concessionPaise
    lateFee += i.lateFeePaise
    paid += i.paidPaise

    const bal = outstandingPaise(i)
    outstanding += bal
    if (bal > 0 && deriveStatus(i, asOf) === 'OVERDUE') overdue += bal
  }

  return {
    duePaise: due,
    concessionPaise: concession,
    lateFeePaise: lateFee,
    paidPaise: paid,
    outstandingPaise: outstanding,
    overduePaise: overdue,
  }
}

/** Receipt number for a branch + financial year, e.g. "RC/2026-27/0042". */
export function formatReceiptNo(
  prefix: string,
  financialYear: string,
  serial: number,
): string {
  return `${prefix}/${financialYear}/${String(serial).padStart(4, '0')}`
}
