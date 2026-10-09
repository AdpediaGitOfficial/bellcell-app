'use server'

import { revalidatePath } from 'next/cache'
import type { DayPortion } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan, can } from '@/lib/rbac/can'
import { branchScope, writeBranchId } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import {
  LeaveError,
  applyForLeave,
  approveLeave,
  cancelLeave,
  rejectLeave,
  runCarryForward,
} from '@/lib/leave/service'

const BASE = '/people/leave'

export interface LeaveState {
  error?: string
  notice?: string
  values?: Record<string, string>
}

const PORTIONS: DayPortion[] = ['FULL', 'FIRST_HALF', 'SECOND_HALF']

function portion(value: FormDataEntryValue | null): DayPortion {
  const raw = typeof value === 'string' ? value : ''
  return PORTIONS.find((p) => p === raw) ?? 'FULL'
}

function iso(value: FormDataEntryValue | null): string {
  const raw = typeof value === 'string' ? value : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
}

export async function applyLeaveAction(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const user = await requireUser()
  assertCan(user, 'people.leave', 'create')

  const values = {
    employeeId: String(formData.get('employeeId') ?? ''),
    leaveTypeId: String(formData.get('leaveTypeId') ?? ''),
    from: iso(formData.get('from')),
    to: iso(formData.get('to')),
    reason: String(formData.get('reason') ?? ''),
  }

  if (!values.employeeId) return { error: 'Choose an employee.', values }
  if (!values.leaveTypeId) return { error: 'Choose a leave type.', values }
  if (!values.from || !values.to) return { error: 'Choose both dates.', values }

  let branchId: string
  try {
    branchId = writeBranchId(user, String(formData.get('branchId') ?? ''))
  } catch {
    return {
      error:
        'Leave is recorded per branch, so choose a branch from the switcher above.',
      values,
    }
  }

  // Approving in the same step is a separate permission from recording.
  const wantsImmediate = formData.get('approveNow') === 'on'
  const mayApprove = can(user, 'people.leave', 'approve')
  if (wantsImmediate && !mayApprove) {
    return {
      error: 'You can record a request, but someone else has to approve it.',
      values,
    }
  }

  let result
  try {
    result = await applyForLeave({
      branchId,
      employeeId: values.employeeId,
      leaveTypeId: values.leaveTypeId,
      from: values.from,
      to: values.to,
      fromPortion: portion(formData.get('fromPortion')),
      toPortion: portion(formData.get('toPortion')),
      reason: values.reason.trim() || null,
      appliedById: user.id,
      autoApprove: wantsImmediate && mayApprove,
    })
  } catch (error) {
    if (error instanceof LeaveError) return { error: error.message, values }
    throw error
  }

  const employee = await db.employee.findUnique({
    where: { id: values.employeeId },
    select: { employeeCode: true },
  })

  await recordAudit({
    userId: user.id,
    branchId,
    action: 'CREATE',
    entityType: 'LeaveRequest',
    entityId: result.requestId,
    summary: `Recorded ${result.days} day(s) of leave for ${employee?.employeeCode ?? 'an employee'} from ${values.from}${result.status === 'APPROVED' ? ', approved immediately' : ''}`,
  })

  revalidatePath(BASE)
  return {
    notice:
      result.status === 'APPROVED'
        ? `Approved. ${result.days} day(s) recorded on the attendance register, which is what payroll reads.`
        : `Recorded ${result.days} day(s). It is pending a decision.`,
  }
}

async function requestInScope(requestId: string) {
  const user = await requireUser()
  const request = await db.leaveRequest.findFirst({
    where: { id: requestId, ...branchScope(user) },
    select: {
      id: true,
      branchId: true,
      days: true,
      employee: { select: { employeeCode: true } },
      leaveType: { select: { name: true } },
    },
  })
  return { user, request }
}

export async function decideLeaveAction(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const { user, request } = await requestInScope(String(formData.get('requestId') ?? ''))
  assertCan(user, 'people.leave', 'approve')
  if (!request) return { error: 'Request not found in the current branch.' }

  const decision = String(formData.get('decision') ?? '')
  const note = String(formData.get('note') ?? '')

  try {
    if (decision === 'approve') {
      await approveLeave({ requestId: request.id, decidedById: user.id, note: note || null })
    } else if (decision === 'reject') {
      await rejectLeave({ requestId: request.id, decidedById: user.id, note })
    } else {
      return { error: 'Choose approve or reject.' }
    }
  } catch (error) {
    if (error instanceof LeaveError) return { error: error.message }
    throw error
  }

  await recordAudit({
    userId: user.id,
    branchId: request.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'LeaveRequest',
    entityId: request.id,
    summary: `${decision === 'approve' ? 'Approved' : 'Rejected'} ${request.days} day(s) of ${request.leaveType.name} for ${request.employee.employeeCode}`,
  })

  revalidatePath(BASE)
  return {
    notice:
      decision === 'approve'
        ? 'Approved, and written to the attendance register.'
        : 'Rejected. Nothing was deducted and the register is untouched.',
  }
}

export async function cancelLeaveAction(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const { user, request } = await requestInScope(String(formData.get('requestId') ?? ''))
  assertCan(user, 'people.leave', 'update')
  if (!request) return { error: 'Request not found in the current branch.' }

  let result
  try {
    result = await cancelLeave({
      requestId: request.id,
      reason: String(formData.get('reason') ?? ''),
    })
  } catch (error) {
    if (error instanceof LeaveError) return { error: error.message }
    throw error
  }

  await recordAudit({
    userId: user.id,
    branchId: request.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'LeaveRequest',
    entityId: request.id,
    summary:
      `Cancelled ${request.days} day(s) of ${request.leaveType.name} for ${request.employee.employeeCode}` +
      (result.keptDays > 0
        ? ` — ${result.keptDays} register day(s) left alone because they had been changed by hand`
        : ''),
  })

  revalidatePath(BASE)
  return {
    notice:
      `Cancelled. The balance is back and ${result.clearedDays} day(s) cleared from the register.` +
      (result.keptDays > 0
        ? ` ${result.keptDays} day(s) were left alone because somebody had already changed them by hand.`
        : ''),
  }
}

export async function carryForwardAction(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const user = await requireUser()
  assertCan(user, 'people.leave', 'approve')

  const fromYear = Number.parseInt(String(formData.get('fromYear') ?? ''), 10)
  if (!Number.isFinite(fromYear) || fromYear < 2000 || fromYear > 2100) {
    return { error: 'Choose a valid year to carry forward from.' }
  }

  const scope = branchScope(user)
  if (!scope.branchId) {
    return { error: 'Choose a branch from the switcher above first.' }
  }

  const result = await runCarryForward({ fromYear, branchId: scope.branchId })

  await recordAudit({
    userId: user.id,
    branchId: scope.branchId,
    action: 'UPDATE',
    entityType: 'LeaveBalance',
    summary: `Carried ${result.moved} day(s) forward from ${fromYear} for ${result.employees} employee(s)`,
  })

  revalidatePath(BASE)
  return {
    notice:
      result.employees === 0
        ? `Nothing to carry forward from ${fromYear}.`
        : `Carried ${result.moved} day(s) forward into ${fromYear + 1} for ${result.employees} employee(s).`,
  }
}
