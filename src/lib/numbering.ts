import 'server-only'
import { Prisma } from '@prisma/client'
import { financialYearFor, formatReceiptNo } from '@/lib/fees/core'

export type NumberSeries = 'RECEIPT' | 'VOUCHER'

export const SERIES_PREFIX: Record<NumberSeries, string> = {
  RECEIPT: 'RC',
  VOUCHER: 'VCH',
}

/**
 * Allocate the next document number for a branch, financial year and series.
 *
 * MUST run inside the same transaction as the document it numbers, so a
 * failed write never burns a number and leaves a hole the auditor will ask
 * about. The increment is atomic (Postgres row lock), so two people saving at
 * the same instant cannot be handed the same number.
 *
 * The only race left is two concurrent *first* documents of a series in a
 * financial year both trying to create the counter row; that surfaces as a
 * unique violation, which `withNumberRetry` absorbs.
 */
export async function nextDocumentNo(
  tx: Prisma.TransactionClient,
  branchId: string,
  date: Date,
  series: NumberSeries,
): Promise<string> {
  const financialYear = financialYearFor(date)
  const prefix = SERIES_PREFIX[series]

  const seq = await tx.receiptSequence.upsert({
    where: {
      branchId_financialYear_series: { branchId, financialYear, series },
    },
    create: { branchId, financialYear, series, prefix, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  })

  return formatReceiptNo(seq.prefix, financialYear, seq.lastNumber)
}

export async function withNumberRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const isRace =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034') // unique / write conflict
      if (!isRace) throw error
    }
  }
  throw lastError
}
