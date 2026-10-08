import 'server-only'
import type { AccountHeadKind, PaymentMode } from '@prisma/client'
import { db } from '@/lib/db'
import { nextDocumentNo, withNumberRetry } from '@/lib/numbering'

export class AccountsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountsError'
  }
}

/**
 * Record a day-to-day income or expense.
 *
 * The voucher number, the transaction and the ledger posting happen in one
 * transaction, so a failure never burns a number and never leaves the books
 * half-moved.
 */
export async function recordDailyTransaction(input: {
  branchId: string
  transactionDate: Date
  kind: AccountHeadKind
  accountHeadId: string
  amountPaise: number
  mode: PaymentMode
  bankAccountId?: string | null
  referenceNo?: string | null
  narration?: string | null
  enteredById: string
}): Promise<{ id: string; voucherNo: string }> {
  if (input.amountPaise <= 0) {
    throw new AccountsError('Enter an amount greater than zero.')
  }

  const head = await db.accountHead.findUnique({
    where: { id: input.accountHeadId },
    select: { id: true, kind: true, name: true, archivedAt: true },
  })
  if (!head || head.archivedAt) {
    throw new AccountsError('Choose an active account head.')
  }
  // The head decides whether this is money in or out; letting the two
  // disagree is how a "Salary" row ends up counted as income.
  if (head.kind !== input.kind) {
    throw new AccountsError(
      `"${head.name}" is an ${head.kind.toLowerCase()} head, so it cannot be recorded as ${input.kind.toLowerCase()}.`,
    )
  }

  return withNumberRetry(() =>
    db.$transaction(async (tx) => {
      const voucherNo = await nextDocumentNo(
        tx,
        input.branchId,
        input.transactionDate,
        'VOUCHER',
      )

      const txn = await tx.dailyTransaction.create({
        data: {
          branchId: input.branchId,
          voucherNo,
          transactionDate: input.transactionDate,
          kind: input.kind,
          accountHeadId: input.accountHeadId,
          amountPaise: input.amountPaise,
          mode: input.mode,
          bankAccountId: input.bankAccountId ?? null,
          referenceNo: input.referenceNo ?? null,
          narration: input.narration ?? null,
          enteredById: input.enteredById,
        },
      })

      await tx.ledgerEntry.create({
        data: {
          branchId: input.branchId,
          entryDate: input.transactionDate,
          source: 'DAILY_TRANSACTION',
          accountHeadId: input.accountHeadId,
          bankAccountId: input.bankAccountId ?? null,
          // Income is a debit (money in); expense is a credit (money out).
          debitPaise: input.kind === 'INCOME' ? input.amountPaise : 0,
          creditPaise: input.kind === 'EXPENSE' ? input.amountPaise : 0,
          narration: `${voucherNo} — ${head.name}${input.narration ? `: ${input.narration}` : ''}`,
          dailyTransactionId: txn.id,
        },
      })

      return { id: txn.id, voucherNo }
    }),
  )
}

/**
 * Reverse a daily transaction.
 *
 * Like receipts, the row is kept and a contra entry posted rather than the
 * original being deleted — a vanished voucher number is unexplainable.
 */
export async function reverseDailyTransaction(input: {
  transactionId: string
  reason: string
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const txn = await tx.dailyTransaction.findUnique({
      where: { id: input.transactionId },
      include: { accountHead: { select: { name: true } } },
    })
    if (!txn) throw new AccountsError('Transaction not found.')

    const already = await tx.ledgerEntry.count({
      where: { dailyTransactionId: txn.id, source: 'ADJUSTMENT' },
    })
    if (already > 0) throw new AccountsError('This voucher has already been reversed.')

    await tx.ledgerEntry.create({
      data: {
        branchId: txn.branchId,
        entryDate: new Date(),
        source: 'ADJUSTMENT',
        accountHeadId: txn.accountHeadId,
        bankAccountId: txn.bankAccountId,
        // Mirror image of the original posting.
        debitPaise: txn.kind === 'EXPENSE' ? txn.amountPaise : 0,
        creditPaise: txn.kind === 'INCOME' ? txn.amountPaise : 0,
        narration: `Reversal of ${txn.voucherNo} (${txn.accountHead.name}) — ${input.reason}`,
        dailyTransactionId: txn.id,
      },
    })
  })
}

/** Remit money to the affiliating university. */
export async function recordAffiliationPayment(input: {
  branchId: string
  affiliationBodyId: string
  feeTypeId?: string | null
  amountPaise: number
  paidOn: Date
  mode: PaymentMode
  bankAccountId?: string | null
  referenceNo?: string | null
  studentCount?: number | null
  narration?: string | null
}): Promise<{ id: string }> {
  if (input.amountPaise <= 0) {
    throw new AccountsError('Enter an amount greater than zero.')
  }

  const body = await db.affiliationBody.findUnique({
    where: { id: input.affiliationBodyId },
    select: { name: true },
  })
  if (!body) throw new AccountsError('Choose an affiliating body.')

  return db.$transaction(async (tx) => {
    const payment = await tx.affiliationPayment.create({
      data: {
        branchId: input.branchId,
        affiliationBodyId: input.affiliationBodyId,
        feeTypeId: input.feeTypeId ?? null,
        amountPaise: input.amountPaise,
        paidOn: input.paidOn,
        mode: input.mode,
        bankAccountId: input.bankAccountId ?? null,
        referenceNo: input.referenceNo ?? null,
        studentCount: input.studentCount ?? null,
        narration: input.narration ?? null,
      },
    })

    const head = await tx.accountHead.findFirst({
      where: { code: 'AH-UNIV' },
      select: { id: true },
    })

    await tx.ledgerEntry.create({
      data: {
        branchId: input.branchId,
        entryDate: input.paidOn,
        source: 'AFFILIATION_PAYMENT',
        accountHeadId: head?.id ?? null,
        bankAccountId: input.bankAccountId ?? null,
        creditPaise: input.amountPaise, // money out
        narration: `Remittance to ${body.name}${input.referenceNo ? ` (${input.referenceNo})` : ''}`,
        affiliationPaymentId: payment.id,
      },
    })

    return { id: payment.id }
  })
}
