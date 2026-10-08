'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { Prisma, type UserRole } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { hashPassword, passwordIssues } from '@/lib/auth/password'
import {
  ROLE_LABELS,
  accountChangeBlockedReason,
  canAssignRole,
  deactivationBlockedReason,
  generateTemporaryPassword,
} from '@/lib/rbac/roles'

/**
 * Employee Login — account administration.
 *
 * The quotation lists this as one line ("Employee Login"). It is the most
 * sensitive operation in the system: it is how a person gets to fee money
 * and students' personal data. So:
 *
 *   * It needs `settings.user` permission, NOT merely `people.employee:update`.
 *     Editing someone's qualifications and granting them access to the till
 *     are not the same act, and the matrix separates them.
 *   * Every rule lives in src/lib/rbac/roles.ts and is unit-tested, rather
 *     than being implied by whichever <option>s a form happened to render —
 *     a form is a suggestion, the server is the rule.
 *   * Passwords are never emailed or stored in clear. A one-time password is
 *     shown to the administrator once, and the account must change it on
 *     first sign-in.
 *   * Deactivating an account revokes its live sessions in the same
 *     transaction. Without that, a dismissed employee keeps working for up
 *     to SESSION_TTL_HOURS.
 */

const BASE = '/people/employees'

export interface AccessState {
  error?: string
  notice?: string
  /** Shown once, never persisted anywhere readable. */
  temporaryPassword?: string
}

async function loadTarget(employeeId: string) {
  const user = await requireUser()
  assertCan(user, 'settings.user', 'update')

  const employee = await db.employee.findFirst({
    where: { id: employeeId, ...branchScope(user), archivedAt: null },
    select: {
      id: true,
      branchId: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      status: true,
      user: { select: { id: true, email: true, role: true, isActive: true } },
    },
  })

  return { actor: user, employee }
}

/** How many SUPER_ADMINs could still administer users if we changed this one. */
async function activeSuperAdminCount(): Promise<number> {
  return db.user.count({ where: { role: 'SUPER_ADMIN', isActive: true } })
}

export async function createLoginAction(
  employeeId: string,
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const { actor, employee } = await loadTarget(employeeId)
  assertCan(actor, 'settings.user', 'create')

  if (!employee) return { error: 'Employee not found in the current branch.' }
  if (employee.user) return { error: 'This employee already has a login.' }

  // Someone who has left should not be handed a new login. Reactivating a
  // record is a deliberate step, taken on the Personal tab first.
  if (employee.status === 'RESIGNED' || employee.status === 'TERMINATED') {
    return {
      error: `${employee.firstName} is marked ${employee.status === 'RESIGNED' ? 'resigned' : 'terminated'}. Change their employment status before issuing a login.`,
    }
  }

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const role = String(formData.get('role') ?? '') as UserRole

  if (!email || !email.includes('@')) {
    return { error: 'Enter the email address this person will sign in with.' }
  }
  if (!canAssignRole(actor.role, role)) {
    return {
      error: `You cannot grant the ${ROLE_LABELS[role] ?? role} role. You may only create accounts less privileged than your own.`,
    }
  }

  const temporary = generateTemporaryPassword((n) => randomBytes(n))
  // Belt and braces: the generator is tested, but a password that slipped
  // below policy would be a silent downgrade of every account it creates.
  if (passwordIssues(temporary).length > 0) {
    return { error: 'Could not generate a compliant password. Please try again.' }
  }
  const passwordHash = await hashPassword(temporary)

  const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(' ')

  try {
    await db.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role,
        mustChangePassword: true,
        employeeId: employee.id,
        // Access is scoped to the branch the employee belongs to. Widening
        // it to other branches is a separate, explicit act in Settings.
        branches: { create: { branchId: employee.branchId, isDefault: true } },
      },
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { error: 'That email address already has an account.' }
    }
    throw error
  }

  await recordAudit({
    userId: actor.id,
    branchId: employee.branchId,
    action: 'CREATE',
    entityType: 'User',
    summary: `Created a ${ROLE_LABELS[role]} login (${email}) for employee ${employee.employeeCode}`,
  })

  revalidatePath(`${BASE}/${employeeId}`)
  return {
    notice: `Login created for ${fullName}. Hand over the one-time password below — it is not shown again, and must be changed at first sign-in.`,
    temporaryPassword: temporary,
  }
}

export async function changeRoleAction(
  employeeId: string,
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const { actor, employee } = await loadTarget(employeeId)
  if (!employee?.user) return { error: 'This employee has no login.' }

  const role = String(formData.get('role') ?? '') as UserRole
  if (role === employee.user.role) return { notice: 'Role unchanged.' }

  const blocked = accountChangeBlockedReason({
    actorId: actor.id,
    actorRole: actor.role,
    targetUserId: employee.user.id,
    targetRole: employee.user.role,
    activeSuperAdminCount: await activeSuperAdminCount(),
  })
  if (blocked) return { error: blocked }

  if (!canAssignRole(actor.role, role)) {
    return {
      error: `You cannot grant the ${ROLE_LABELS[role] ?? role} role. You may only assign roles less privileged than your own.`,
    }
  }

  const before = employee.user.role

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: employee.user!.id }, data: { role } })
    // A role change must take effect now, not when the session expires: the
    // signed-in user's permissions are read from the session's user row, so
    // revoking forces a fresh sign-in under the new role.
    await tx.session.updateMany({
      where: { userId: employee.user!.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  })

  await recordAudit({
    userId: actor.id,
    branchId: employee.branchId,
    action: 'UPDATE',
    entityType: 'User',
    entityId: employee.user.id,
    summary: `Changed ${employee.user.email} from ${ROLE_LABELS[before]} to ${ROLE_LABELS[role]}`,
    before: { role: before },
    after: { role },
  })

  revalidatePath(`${BASE}/${employeeId}`)
  return {
    notice: `Role changed to ${ROLE_LABELS[role]}. Their current sessions were ended, so the new role applies at next sign-in.`,
  }
}

export async function resetPasswordAction(
  employeeId: string,
  _prev: AccessState,
  _formData: FormData,
): Promise<AccessState> {
  const { actor, employee } = await loadTarget(employeeId)
  if (!employee?.user) return { error: 'This employee has no login.' }

  const blocked = accountChangeBlockedReason({
    actorId: actor.id,
    actorRole: actor.role,
    targetUserId: employee.user.id,
    targetRole: employee.user.role,
    activeSuperAdminCount: await activeSuperAdminCount(),
  })
  if (blocked) return { error: blocked }

  const temporary = generateTemporaryPassword((n) => randomBytes(n))
  if (passwordIssues(temporary).length > 0) {
    return { error: 'Could not generate a compliant password. Please try again.' }
  }
  const passwordHash = await hashPassword(temporary)

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: employee.user!.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        // A reset is also the remedy for a lockout, so clear the throttle.
        failedLoginCount: 0,
        lockedUntil: null,
      },
    })
    await tx.session.updateMany({
      where: { userId: employee.user!.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  })

  await recordAudit({
    userId: actor.id,
    branchId: employee.branchId,
    action: 'UPDATE',
    entityType: 'User',
    entityId: employee.user.id,
    summary: `Reset the password for ${employee.user.email} and ended their sessions`,
  })

  revalidatePath(`${BASE}/${employeeId}`)
  return {
    notice:
      'Password reset. Hand over the one-time password below — it is not shown again, and must be changed at first sign-in.',
    temporaryPassword: temporary,
  }
}

export async function setAccountActiveAction(
  employeeId: string,
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const { actor, employee } = await loadTarget(employeeId)
  if (!employee?.user) return { error: 'This employee has no login.' }

  const activate = formData.get('activate') === 'yes'
  const guard = {
    actorId: actor.id,
    actorRole: actor.role,
    targetUserId: employee.user.id,
    targetRole: employee.user.role,
    activeSuperAdminCount: await activeSuperAdminCount(),
  }

  const blocked = activate
    ? accountChangeBlockedReason(guard)
    : deactivationBlockedReason(guard)
  if (blocked) return { error: blocked }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: employee.user!.id },
      data: activate
        ? { isActive: true, failedLoginCount: 0, lockedUntil: null }
        : { isActive: false },
    })
    if (!activate) {
      // Without this, a dismissed employee stays signed in until their
      // session expires.
      await tx.session.updateMany({
        where: { userId: employee.user!.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
  })

  await recordAudit({
    userId: actor.id,
    branchId: employee.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'User',
    entityId: employee.user.id,
    summary: activate
      ? `Re-enabled the login for ${employee.user.email}`
      : `Disabled the login for ${employee.user.email} and ended their sessions`,
  })

  revalidatePath(`${BASE}/${employeeId}`)
  return {
    notice: activate
      ? 'Login re-enabled. They can sign in with their existing password.'
      : 'Login disabled and all their sessions ended.',
  }
}
