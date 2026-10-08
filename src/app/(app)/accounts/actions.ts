'use server'

import { revalidatePath } from 'next/cache'
import type { AccountHeadKind, PaymentMode } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { NoBranchSelectedError, branchScope, writeBranchId } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { parseRupeesToPaise } from '@/lib/money'
import {
  AccountsError,
  recordAffiliationPayment,
  recordDailyTransaction,
  reverseDailyTransaction,
} from '@/lib/accounts/service'

export interface AccountsState {
  error?: string
  ok?: string
}

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = orNull(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function addTransactionAction(
  _prev: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  const user = await requireUser()
  assertCan(user, 'accounts.dailyTransaction', 'create')

  const transactionDate = parseDate(formData.get('transactionDate')) ?? new Date()

  let amountPaise: number
  try {
    amountPaise = parseRupeesToPaise(String(formData.get('amount') ?? ''))
  } catch {
    return { error: 'Enter a valid amount.' }
  }

  let branchId: string
  try {
    branchId = writeBranchId(user, String(formData.get('branchId') ?? ''))
  } catch (error) {
    if (error instanceof NoBranchSelectedError) {
      return { error: 'Choose which branch this transaction belongs to.' }
    }
    throw error
  }

  try {
    const result = await recordDailyTransaction({
      branchId,
      transactionDate,
      kind: String(formData.get('kind') ?? 'EXPENSE') as AccountHeadKind,
      accountHeadId: String(formData.get('accountHeadId') ?? ''),
      amountPaise,
      mode: String(formData.get('mode') ?? 'CASH') as PaymentMode,
      bankAccountId: orNull(formData.get('bankAccountId')),
      referenceNo: orNull(formData.get('referenceNo')),
      narration: orNull(formData.get('narration')),
      enteredById: user.id,
    })

    await recordAudit({
      userId: user.id,
      branchId,
      action: 'CREATE',
      entityType: 'DailyTransaction',
      entityId: result.id,
      summary: `Recorded voucher ${result.voucherNo} for ₹${(amountPaise / 100).toFixed(2)}`,
    })

    revalidatePath('/accounts/transactions')
    revalidatePath('/accounts/day-book')
    revalidatePath('/dashboard')
    return { ok: `Saved as ${result.voucherNo}.` }
  } catch (error) {
    if (error instanceof AccountsError) return { error: error.message }
    throw error
  }
}

export async function reverseTransactionAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'accounts.dailyTransaction', 'update')

  const transactionId = String(formData.get('transactionId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!reason) return

  const txn = await db.dailyTransaction.findFirst({
    where: { id: transactionId, ...branchScope(user) },
    select: { id: true, branchId: true, voucherNo: true },
  })
  if (!txn) return

  try {
    await reverseDailyTransaction({ transactionId, reason })
  } catch (error) {
    if (!(error instanceof AccountsError)) throw error
    return
  }

  await recordAudit({
    userId: user.id,
    branchId: txn.branchId,
    action: 'UPDATE',
    entityType: 'DailyTransaction',
    entityId: txn.id,
    summary: `Reversed voucher ${txn.voucherNo} — ${reason}`,
  })

  revalidatePath('/accounts/transactions')
  revalidatePath('/accounts/day-book')
}

export async function addAffiliationPaymentAction(
  _prev: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  const user = await requireUser()
  assertCan(user, 'accounts.affiliationPayment', 'create')

  const paidOn = parseDate(formData.get('paidOn')) ?? new Date()

  let amountPaise: number
  try {
    amountPaise = parseRupeesToPaise(String(formData.get('amount') ?? ''))
  } catch {
    return { error: 'Enter a valid amount.' }
  }

  let branchId: string
  try {
    branchId = writeBranchId(user, String(formData.get('branchId') ?? ''))
  } catch (error) {
    if (error instanceof NoBranchSelectedError) {
      return { error: 'Choose which branch this remittance is from.' }
    }
    throw error
  }

  const countRaw = orNull(formData.get('studentCount'))

  try {
    const result = await recordAffiliationPayment({
      branchId,
      affiliationBodyId: String(formData.get('affiliationBodyId') ?? ''),
      feeTypeId: orNull(formData.get('feeTypeId')),
      amountPaise,
      paidOn,
      mode: String(formData.get('mode') ?? 'BANK_TRANSFER') as PaymentMode,
      bankAccountId: orNull(formData.get('bankAccountId')),
      referenceNo: orNull(formData.get('referenceNo')),
      studentCount: countRaw ? Number.parseInt(countRaw, 10) : null,
      narration: orNull(formData.get('narration')),
    })

    await recordAudit({
      userId: user.id,
      branchId,
      action: 'PAYMENT',
      entityType: 'AffiliationPayment',
      entityId: result.id,
      summary: `Remitted ₹${(amountPaise / 100).toFixed(2)} to the university`,
    })

    revalidatePath('/accounts/affiliation')
    revalidatePath('/accounts/day-book')
    return { ok: 'Remittance recorded.' }
  } catch (error) {
    if (error instanceof AccountsError) return { error: error.message }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Masters: account heads and bank accounts live here rather than in the
// generic master CRUD, because both carry fields the generic form cannot.
// ---------------------------------------------------------------------------

export async function saveAccountHeadAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'masters', 'create')

  const id = orNull(formData.get('id'))
  const name = String(formData.get('name') ?? '').trim()
  const code = String(formData.get('code') ?? '').trim()
  const kind = String(formData.get('kind') ?? 'EXPENSE') as AccountHeadKind
  if (!name) return

  if (id) {
    await db.accountHead.update({ where: { id }, data: { name, kind } })
  } else {
    if (!code) return
    await db.accountHead.create({ data: { code, name, kind } })
  }

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: id ? 'UPDATE' : 'CREATE',
    entityType: 'AccountHead',
    entityId: id ?? undefined,
    summary: `${id ? 'Updated' : 'Added'} account head "${name}" (${kind.toLowerCase()})`,
  })

  revalidatePath('/accounts/transactions')
  revalidatePath('/masters/account-heads')
}

export async function saveBankAccountAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'masters', 'create')

  const id = orNull(formData.get('id'))
  const accountName = String(formData.get('accountName') ?? '').trim()
  const bankName = String(formData.get('bankName') ?? '').trim()
  const accountNumber = String(formData.get('accountNumber') ?? '').trim()
  if (!accountName || !bankName || !accountNumber) return

  const data = {
    accountName,
    bankName,
    accountNumber,
    branchName: orNull(formData.get('branchName')),
    ifsc: orNull(formData.get('ifsc')),
  }

  if (id) {
    await db.bankAccount.update({ where: { id }, data })
  } else {
    await db.bankAccount.create({ data })
  }

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: id ? 'UPDATE' : 'CREATE',
    entityType: 'BankAccount',
    entityId: id ?? undefined,
    summary: `${id ? 'Updated' : 'Added'} bank account ${bankName} ····${accountNumber.slice(-4)}`,
  })

  revalidatePath('/masters/bank-accounts')
}
