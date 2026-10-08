/**
 * Day Book arithmetic — pure, so it can be tested without a database.
 *
 * Ledger sign convention (from the schema): debit = money IN, credit = money
 * OUT. Every rupee that moves posts here, whatever module caused it, which is
 * what makes the Day Book tie to the fee register (ADR-003).
 */

export interface LedgerLine {
  entryDate: Date
  debitPaise: number
  creditPaise: number
  source: string
  accountHeadName?: string | null
  bankAccountLabel?: string | null
  narration?: string | null
}

export interface DayBookTotals {
  openingPaise: number
  receiptsPaise: number
  paymentsPaise: number
  closingPaise: number
}

/**
 * Opening balance is derived from the ledger (everything strictly before the
 * window) rather than stored as a running total, so the book cannot drift and
 * a back-dated correction shows up everywhere at once. The page computes it
 * with a SQL aggregate and passes it in here.
 */
export function dayBookTotals(
  openingPaise: number,
  lines: LedgerLine[],
): DayBookTotals {
  let receipts = 0
  let payments = 0
  for (const l of lines) {
    receipts += l.debitPaise
    payments += l.creditPaise
  }
  return {
    openingPaise,
    receiptsPaise: receipts,
    paymentsPaise: payments,
    closingPaise: openingPaise + receipts - payments,
  }
}

/**
 * The identity a day book must satisfy. Surfaced on screen as a proof line,
 * so a mismatch is visible rather than silently wrong.
 */
export function balances(t: DayBookTotals): boolean {
  return t.closingPaise === t.openingPaise + t.receiptsPaise - t.paymentsPaise
}

export interface HeadTotal {
  key: string
  label: string
  receiptsPaise: number
  paymentsPaise: number
  count: number
}

/** Group the window's movement by account head, for the summary panel. */
export function groupByHead(lines: LedgerLine[]): HeadTotal[] {
  const buckets = new Map<string, HeadTotal>()
  for (const l of lines) {
    const label = l.accountHeadName ?? 'Unclassified'
    const row =
      buckets.get(label) ??
      { key: label, label, receiptsPaise: 0, paymentsPaise: 0, count: 0 }
    row.receiptsPaise += l.debitPaise
    row.paymentsPaise += l.creditPaise
    row.count += 1
    buckets.set(label, row)
  }
  return [...buckets.values()].sort(
    (a, b) =>
      b.receiptsPaise + b.paymentsPaise - (a.receiptsPaise + a.paymentsPaise),
  )
}

export const SOURCE_LABELS: Record<string, string> = {
  FEE_PAYMENT: 'Fee receipt',
  FEE_REFUND: 'Fee refund',
  DAILY_TRANSACTION: 'Daily transaction',
  AFFILIATION_PAYMENT: 'University remittance',
  OPENING_BALANCE: 'Opening balance',
  ADJUSTMENT: 'Adjustment',
}

/**
 * Affiliation reconciliation: what was collected from students under a fee
 * type payable onward, against what has actually been remitted.
 *
 * The vendor scope had both halves as separate screens and never connected
 * them, so nobody could answer "do we owe the university money?".
 */
export interface ReconciliationRow {
  key: string
  label: string
  collectedPaise: number
  remittedPaise: number
}

export function reconcile(
  collected: { key: string; label: string; amountPaise: number }[],
  remitted: { key: string; amountPaise: number }[],
): (ReconciliationRow & { outstandingPaise: number })[] {
  const byKey = new Map<string, ReconciliationRow>()

  for (const c of collected) {
    const row = byKey.get(c.key) ?? {
      key: c.key,
      label: c.label,
      collectedPaise: 0,
      remittedPaise: 0,
    }
    row.collectedPaise += c.amountPaise
    byKey.set(c.key, row)
  }

  for (const r of remitted) {
    const row = byKey.get(r.key) ?? {
      key: r.key,
      label: r.key,
      collectedPaise: 0,
      remittedPaise: 0,
    }
    row.remittedPaise += r.amountPaise
    byKey.set(r.key, row)
  }

  return [...byKey.values()]
    .map((r) => ({
      ...r,
      // Negative means over-remitted, which is as worth seeing as a shortfall.
      outstandingPaise: r.collectedPaise - r.remittedPaise,
    }))
    .sort((a, b) => b.outstandingPaise - a.outstandingPaise)
}
