'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { recordAudit } from '@/lib/audit'

const PATH = '/masters/leave-types'

export interface LeaveTypeState {
  error?: string
  ok?: boolean
  values?: Record<string, string>
}

function days(raw: FormDataEntryValue | null, fallback = '0'): Prisma.Decimal | null {
  const s = String(raw ?? '').trim() || fallback
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n) || n < 0 || n > 365) return null
  // Half days are the finest grain anywhere else, so keep that here too.
  return new Prisma.Decimal((Math.round(n * 2) / 2).toFixed(2))
}

export async function saveLeaveTypeAction(
  _prev: LeaveTypeState,
  formData: FormData,
): Promise<LeaveTypeState> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  assertCan(user, 'masters', id ? 'update' : 'create')

  const values = {
    code: String(formData.get('code') ?? '').trim().toUpperCase(),
    name: String(formData.get('name') ?? '').trim(),
    annualEntitlementDays: String(formData.get('annualEntitlementDays') ?? ''),
    carryForwardCapDays: String(formData.get('carryForwardCapDays') ?? ''),
  }

  if (!values.name) return { error: 'Give the leave type a name.', values }
  if (!id && !values.code) return { error: 'Give the leave type a short code.', values }

  const entitlement = days(values.annualEntitlementDays)
  if (entitlement === null) {
    return { error: 'The annual entitlement must be between 0 and 365 days.', values }
  }
  const cap = days(values.carryForwardCapDays)
  if (cap === null) {
    return { error: 'The carry-forward cap must be between 0 and 365 days.', values }
  }

  const data = {
    name: values.name,
    isPaid: formData.get('isPaid') === 'on',
    annualEntitlementDays: entitlement,
    allowCarryForward: formData.get('allowCarryForward') === 'on',
    carryForwardCapDays: cap,
    requiresApproval: formData.get('requiresApproval') === 'on',
    sortOrder: Number.parseInt(String(formData.get('sortOrder') ?? '0'), 10) || 0,
  }

  try {
    if (id) {
      // Changing isPaid does NOT restate leave already approved: those days
      // are already written on the register and, if a payroll run has been
      // approved, already paid. The change applies from now on.
      await db.leaveType.update({ where: { id }, data })
    } else {
      await db.leaveType.create({ data: { ...data, code: values.code } })
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { error: 'That code is already used by another leave type.', values }
    }
    throw error
  }

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: id ? 'UPDATE' : 'CREATE',
    entityType: 'LeaveType',
    entityId: id || undefined,
    summary: `${id ? 'Updated' : 'Added'} leave type "${values.name}" (${data.isPaid ? 'paid' : 'unpaid'})`,
  })

  revalidatePath(PATH)
  return { ok: true }
}

export async function archiveLeaveTypeAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'masters', 'delete')

  const id = String(formData.get('id') ?? '')
  const type = await db.leaveType.findUnique({ where: { id }, select: { name: true } })
  if (!type) return

  await db.leaveType.update({ where: { id }, data: { archivedAt: new Date() } })

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'ARCHIVE',
    entityType: 'LeaveType',
    entityId: id,
    summary: `Archived leave type "${type.name}"`,
  })

  revalidatePath(PATH)
}

export async function restoreLeaveTypeAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'masters', 'update')
  const id = String(formData.get('id') ?? '')
  await db.leaveType.update({ where: { id }, data: { archivedAt: null } })
  revalidatePath(PATH)
}
