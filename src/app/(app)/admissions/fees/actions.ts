'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { PaymentMode } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan, can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { parseRupeesToPaise } from '@/lib/money'
import {
  FeeError,
  applyConcession,
  assignFeeStructure,
  cancelPayment,
  recordPayment,
} from '@/lib/fees/service'

export interface FeeState {
  error?: string
  ok?: string
}

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function assignStructureAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.fee', 'create')

  const studentId = String(formData.get('studentId') ?? '')
  const structureId = String(formData.get('structureId') ?? '')

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user) },
  })
  if (!student) return

  try {
    const result = await assignFeeStructure({
      studentId,
      structureId,
      assignedById: user.id,
    })
    await recordAudit({
      userId: user.id,
      branchId: student.branchId,
      action: 'CREATE',
      entityType: 'StudentFeeAssignment',
      entityId: studentId,
      summary: `Assigned a fee structure to ${student.applicationNo}: ${result.created} instalments, ₹${(result.totalPaise / 100).toFixed(2)}`,
    })
  } catch (error) {
    if (!(error instanceof FeeError)) throw error
    // Surfaced on the next render via the page's own state; assignment
    // failures here are benign (already assigned / empty structure).
  }

  revalidatePath(`/admissions/applications/${studentId}`)
  revalidatePath(`/admissions/fees/${studentId}`)
}

export async function collectPaymentAction(
  studentId: string,
  _prev: FeeState,
  formData: FormData,
): Promise<FeeState> {
  const user = await requireUser()
  assertCan(user, 'admission.fee', 'create')

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user) },
  })
  if (!student) return { error: 'Student not found in the current branch.' }

  let amountPaise: number
  try {
    amountPaise = parseRupeesToPaise(String(formData.get('amount') ?? ''))
  } catch {
    return { error: 'Enter a valid amount.' }
  }

  const dateRaw = String(formData.get('receiptDate') ?? '')
  const receiptDate = dateRaw ? new Date(dateRaw) : new Date()
  if (Number.isNaN(receiptDate.getTime())) {
    return { error: 'Enter a valid receipt date.' }
  }

  // Selected instalments, if the office is settling specific ones.
  const targets = formData.getAll('installmentIds').map(String).filter(Boolean)

  let receiptNo: string
  let paymentId: string
  try {
    const result = await recordPayment({
      studentId,
      branchId: student.branchId,
      amountPaise,
      mode: (String(formData.get('mode') ?? 'CASH') || 'CASH') as PaymentMode,
      receiptDate,
      referenceNo: orNull(formData.get('referenceNo')),
      bankAccountId: orNull(formData.get('bankAccountId')),
      remarks: orNull(formData.get('remarks')),
      collectedById: user.id,
      targetInstallmentIds: targets.length > 0 ? targets : undefined,
    })
    receiptNo = result.receiptNo
    paymentId = result.paymentId
  } catch (error) {
    if (error instanceof FeeError) return { error: error.message }
    throw error
  }

  await recordAudit({
    userId: user.id,
    branchId: student.branchId,
    action: 'PAYMENT',
    entityType: 'Payment',
    entityId: paymentId,
    summary: `Collected ₹${(amountPaise / 100).toFixed(2)} from ${student.applicationNo} — receipt ${receiptNo}`,
  })

  revalidatePath(`/admissions/applications/${studentId}`)
  revalidatePath('/admissions/fees')
  revalidatePath('/dashboard')
  redirect(`/admissions/fees/receipt/${paymentId}?new=1`)
}

export async function cancelPaymentAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  // Cancelling a receipt moves money; only roles with update on fees may.
  assertCan(user, 'admission.fee', 'update')

  const paymentId = String(formData.get('paymentId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  const bounced = formData.get('bounced') === 'on'
  if (!reason) return

  const payment = await db.payment.findFirst({
    where: { id: paymentId, ...branchScope(user) },
    include: { student: { select: { id: true, applicationNo: true } } },
  })
  if (!payment) return

  try {
    await cancelPayment({ paymentId, reason, bounced })
  } catch (error) {
    if (!(error instanceof FeeError)) throw error
    return
  }

  await recordAudit({
    userId: user.id,
    branchId: payment.branchId,
    action: 'REFUND',
    entityType: 'Payment',
    entityId: paymentId,
    summary: `${bounced ? 'Marked bounced' : 'Cancelled'} receipt ${payment.receiptNo} for ${payment.student.applicationNo} — ${reason}`,
  })

  revalidatePath(`/admissions/applications/${payment.student.id}`)
  revalidatePath(`/admissions/fees/receipt/${paymentId}`)
  revalidatePath('/dashboard')
}

export async function applyConcessionAction(
  studentId: string,
  _prev: FeeState,
  formData: FormData,
): Promise<FeeState> {
  const user = await requireUser()
  // Proposing a concession is `create`; approving it is `approve`, which the
  // matrix reserves to admins. An accountant cannot discount unilaterally.
  if (!can(user, 'admission.concession', 'approve')) {
    return { error: 'Only an administrator can approve a concession.' }
  }

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user) },
  })
  if (!student) return { error: 'Student not found in the current branch.' }

  const installmentId = String(formData.get('installmentId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!reason) return { error: 'A reason is required for every concession.' }

  let amountPaise: number
  try {
    amountPaise = parseRupeesToPaise(String(formData.get('amount') ?? ''))
  } catch {
    return { error: 'Enter a valid amount.' }
  }

  try {
    await applyConcession({
      studentId,
      installmentId,
      amountPaise,
      kind: (String(formData.get('kind') ?? 'OTHER') || 'OTHER') as 'OTHER',
      reason,
      approvedById: user.id,
    })
  } catch (error) {
    if (error instanceof FeeError) return { error: error.message }
    throw error
  }

  await recordAudit({
    userId: user.id,
    branchId: student.branchId,
    action: 'UPDATE',
    entityType: 'FeeConcession',
    entityId: installmentId,
    summary: `Approved a ₹${(amountPaise / 100).toFixed(2)} concession for ${student.applicationNo} — ${reason}`,
  })

  revalidatePath(`/admissions/applications/${studentId}`)
  revalidatePath(`/admissions/fees/${studentId}`)
  return { ok: 'Concession applied.' }
}
