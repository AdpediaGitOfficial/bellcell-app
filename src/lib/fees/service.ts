import 'server-only'
import { Prisma, type PaymentMode } from '@prisma/client'
import { db } from '@/lib/db'
import { nextDocumentNo, withNumberRetry } from '@/lib/numbering'
import {
  allocatePayment,
  deriveStatus,
  generateInstallments,
  type AllocatableInstallment,
} from './core'

export class FeeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeeError'
  }
}

type Tx = Prisma.TransactionClient

/** Fee receipts use the shared document numbering (src/lib/numbering.ts). */
export async function nextReceiptNo(
  tx: Tx,
  branchId: string,
  date: Date,
): Promise<string> {
  return nextDocumentNo(tx, branchId, date, 'RECEIPT')
}

/**
 * Assign a fee structure to a student and materialise their instalments.
 *
 * Instalments are a snapshot: later edits to the structure master do not
 * rewrite what an already-admitted student owes (ADR-005's reasoning applied
 * to fees — history must stay accurate).
 */
export async function assignFeeStructure(input: {
  studentId: string
  structureId: string
  assignedById: string
}): Promise<{ created: number; totalPaise: number }> {
  return db.$transaction(async (tx) => {
    const [student, structure] = await Promise.all([
      tx.student.findUnique({ where: { id: input.studentId } }),
      tx.feeStructure.findUnique({
        where: { id: input.structureId },
        include: { items: { include: { feeType: true } } },
      }),
    ])

    if (!student) throw new FeeError('Student not found.')
    if (!structure) throw new FeeError('Fee structure not found.')

    const already = await tx.studentFeeAssignment.findUnique({
      where: {
        studentId_structureId: {
          studentId: input.studentId,
          structureId: input.structureId,
        },
      },
    })
    if (already) throw new FeeError('This fee structure is already assigned to the student.')

    const basis = student.admissionDate ?? student.createdAt
    const generated = generateInstallments(
      structure.items.map((i) => ({
        id: i.id,
        feeTypeId: i.feeTypeId,
        feeTypeName: i.feeType.name,
        amountPaise: i.amountPaise,
        installmentNo: i.installmentNo,
        dueAfterDays: i.dueAfterDays,
        dueDate: i.dueDate,
      })),
      basis,
    )

    if (generated.length === 0) {
      throw new FeeError('This fee structure has no priced items to assign.')
    }

    const totalPaise = generated.reduce((sum, g) => sum + g.duePaise, 0)

    await tx.studentFeeAssignment.create({
      data: {
        studentId: input.studentId,
        structureId: input.structureId,
        assignedById: input.assignedById,
        totalPaise,
      },
    })

    const now = new Date()
    await tx.feeInstallment.createMany({
      data: generated.map((g) => ({
        studentId: input.studentId,
        feeTypeId: g.feeTypeId,
        label: g.label,
        installmentNo: g.installmentNo,
        dueDate: g.dueDate,
        duePaise: g.duePaise,
        status: deriveStatus(
          {
            id: '',
            dueDate: g.dueDate,
            installmentNo: g.installmentNo,
            duePaise: g.duePaise,
            concessionPaise: 0,
            lateFeePaise: 0,
            paidPaise: 0,
          },
          now,
        ),
      })),
    })

    return { created: generated.length, totalPaise }
  })
}

export interface RecordPaymentInput {
  studentId: string
  branchId: string
  amountPaise: number
  mode: PaymentMode
  receiptDate: Date
  referenceNo?: string | null
  bankAccountId?: string | null
  remarks?: string | null
  collectedById: string
  /** When set, the money settles only these instalments; otherwise FIFO. */
  targetInstallmentIds?: string[]
}

/**
 * Take money from a student.
 *
 * Everything happens in one transaction: receipt numbering, the payment,
 * its allocations, the instalment updates, and the ledger posting. If any
 * step fails, no number is burned and the books do not move.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<{
  paymentId: string
  receiptNo: string
  allocated: number
}> {
  if (input.amountPaise <= 0) {
    throw new FeeError('Enter an amount greater than zero.')
  }

  return withNumberRetry(() =>
    db.$transaction(async (tx) => {
      const rows = await tx.feeInstallment.findMany({
        where: { studentId: input.studentId, status: { not: 'WAIVED' } },
        orderBy: [{ dueDate: 'asc' }, { installmentNo: 'asc' }],
      })

      const allocatable: AllocatableInstallment[] = rows.map((r) => ({
        id: r.id,
        dueDate: r.dueDate,
        installmentNo: r.installmentNo,
        duePaise: r.duePaise,
        concessionPaise: r.concessionPaise,
        lateFeePaise: r.lateFeePaise,
        paidPaise: r.paidPaise,
      }))

      const { allocations, unallocatedPaise } = allocatePayment(
        input.amountPaise,
        allocatable,
        input.targetInstallmentIds,
      )

      // Refuse money we cannot attribute. Accepting it would put rupees in
      // the ledger that no instalment credits, and the fee register would
      // stop tying to the Day Book.
      if (unallocatedPaise > 0) {
        throw new FeeError(
          `This payment exceeds the outstanding balance by ₹${(unallocatedPaise / 100).toFixed(2)}. Reduce the amount, or raise the dues first.`,
        )
      }
      if (allocations.length === 0) {
        throw new FeeError('There is nothing outstanding to settle.')
      }

      const receiptNo = await nextReceiptNo(tx, input.branchId, input.receiptDate)

      const payment = await tx.payment.create({
        data: {
          branchId: input.branchId,
          studentId: input.studentId,
          receiptNo,
          receiptDate: input.receiptDate,
          amountPaise: input.amountPaise,
          mode: input.mode,
          referenceNo: input.referenceNo ?? null,
          bankAccountId: input.bankAccountId ?? null,
          remarks: input.remarks ?? null,
          collectedById: input.collectedById,
          allocations: { create: allocations.map((a) => ({
            installmentId: a.installmentId,
            amountPaise: a.amountPaise,
          })) },
        },
      })

      const now = new Date()
      for (const a of allocations) {
        const current = allocatable.find((i) => i.id === a.installmentId)!
        const paidPaise = current.paidPaise + a.amountPaise
        await tx.feeInstallment.update({
          where: { id: a.installmentId },
          data: {
            paidPaise,
            status: deriveStatus({ ...current, paidPaise }, now),
          },
        })
      }

      // Post to the ledger so the Day Book ties to the fee register (ADR-003).
      const feeHead = await tx.accountHead.findFirst({
        where: { code: 'AH-FEE' },
        select: { id: true },
      })

      await tx.ledgerEntry.create({
        data: {
          branchId: input.branchId,
          entryDate: input.receiptDate,
          source: 'FEE_PAYMENT',
          accountHeadId: feeHead?.id ?? null,
          bankAccountId: input.bankAccountId ?? null,
          debitPaise: input.amountPaise,
          narration: `Fee receipt ${receiptNo}`,
          paymentId: payment.id,
        },
      })

      return {
        paymentId: payment.id,
        receiptNo,
        allocated: allocations.length,
      }
    }),
  )
}

/**
 * Cancel a receipt (bounced cheque, wrong entry).
 *
 * The payment is never deleted: it is marked CANCELLED, its allocations are
 * reversed off the instalments, and a contra entry is posted to the ledger.
 * Deleting it would make the receipt series skip a number with no explanation.
 */
export async function cancelPayment(input: {
  paymentId: string
  reason: string
  bounced?: boolean
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: input.paymentId },
      include: { allocations: { include: { installment: true } } },
    })
    if (!payment) throw new FeeError('Receipt not found.')
    if (payment.status !== 'COMPLETED') {
      throw new FeeError('This receipt has already been cancelled.')
    }

    const now = new Date()
    for (const a of payment.allocations) {
      const i = a.installment
      const paidPaise = Math.max(0, i.paidPaise - a.amountPaise)
      await tx.feeInstallment.update({
        where: { id: i.id },
        data: {
          paidPaise,
          status: deriveStatus(
            {
              id: i.id,
              dueDate: i.dueDate,
              installmentNo: i.installmentNo,
              duePaise: i.duePaise,
              concessionPaise: i.concessionPaise,
              lateFeePaise: i.lateFeePaise,
              paidPaise,
            },
            now,
          ),
        },
      })
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: input.bounced ? 'BOUNCED' : 'CANCELLED',
        cancelledAt: now,
        bouncedAt: input.bounced ? now : null,
        cancelReason: input.reason,
      },
    })

    await tx.ledgerEntry.create({
      data: {
        branchId: payment.branchId,
        entryDate: now,
        source: 'ADJUSTMENT',
        creditPaise: payment.amountPaise,
        narration: `Reversal of receipt ${payment.receiptNo} — ${input.reason}`,
        paymentId: payment.id,
      },
    })
  })
}

/**
 * Record an approved concession against an instalment and re-derive status,
 * so a fully-discounted instalment stops showing as owed.
 */
export async function applyConcession(input: {
  studentId: string
  installmentId: string
  amountPaise: number
  kind: Prisma.FeeConcessionCreateInput['kind']
  reason: string
  approvedById: string
}): Promise<void> {
  if (input.amountPaise <= 0) throw new FeeError('Enter a concession greater than zero.')

  await db.$transaction(async (tx) => {
    const inst = await tx.feeInstallment.findUnique({
      where: { id: input.installmentId },
    })
    if (!inst || inst.studentId !== input.studentId) {
      throw new FeeError('Instalment not found for this student.')
    }

    const headroom = inst.duePaise + inst.lateFeePaise - inst.concessionPaise - inst.paidPaise
    if (input.amountPaise > headroom) {
      throw new FeeError(
        `The concession exceeds what is still owed on this instalment (₹${(headroom / 100).toFixed(2)}).`,
      )
    }

    const concessionPaise = inst.concessionPaise + input.amountPaise

    await tx.feeConcession.create({
      data: {
        studentId: input.studentId,
        installmentId: input.installmentId,
        kind: input.kind,
        amountPaise: input.amountPaise,
        reason: input.reason,
        approvedById: input.approvedById,
        approvedAt: new Date(),
      },
    })

    await tx.feeInstallment.update({
      where: { id: input.installmentId },
      data: {
        concessionPaise,
        status: deriveStatus(
          {
            id: inst.id,
            dueDate: inst.dueDate,
            installmentNo: inst.installmentNo,
            duePaise: inst.duePaise,
            concessionPaise,
            lateFeePaise: inst.lateFeePaise,
            paidPaise: inst.paidPaise,
          },
          new Date(),
        ),
      },
    })
  })
}
