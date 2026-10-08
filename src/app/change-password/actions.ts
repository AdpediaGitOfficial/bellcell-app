'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { hashPassword, passwordIssues, verifyPassword } from '@/lib/auth/password'
import { recordAudit } from '@/lib/audit'

export interface ChangePasswordState {
  error?: string
}

/**
 * Changing your own password.
 *
 * Reached automatically while `mustChangePassword` is set — which is how
 * every administrator-issued password starts life. The current password is
 * still required: an unattended browser should not be enough to take over
 * an account.
 */
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser()

  const current = String(formData.get('currentPassword') ?? '')
  const next = String(formData.get('newPassword') ?? '')
  const confirm = String(formData.get('confirmPassword') ?? '')

  if (next !== confirm) return { error: 'The two new passwords do not match.' }

  const issues = passwordIssues(next)
  if (issues.length > 0) {
    return { error: `The new password ${issues.join(', ')}.` }
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  })
  if (!row) return { error: 'Your account could not be read. Sign in again.' }

  if (!(await verifyPassword(current, row.passwordHash))) {
    return { error: 'Your current password is incorrect.' }
  }
  if (await verifyPassword(next, row.passwordHash)) {
    return { error: 'The new password must be different from the current one.' }
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  })

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'UPDATE',
    entityType: 'User',
    entityId: user.id,
    summary: `${user.fullName} changed their own password`,
  })

  redirect('/dashboard')
}
