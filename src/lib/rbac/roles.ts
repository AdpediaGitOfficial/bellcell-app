import type { UserRole } from '@prisma/client'

/**
 * Role assignment rules.
 *
 * The quotation's Employee module lists "Employee Login" as a single line.
 * Creating logins is the most sensitive thing in the system — it is how
 * someone gets access to fee money and students' personal data — so the
 * rules are explicit here and unit-tested, rather than implied by whichever
 * options a form happens to render.
 */

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrator',
  ACCOUNTANT: 'Accountant',
  COUNSELLOR: 'Counsellor',
  FACULTY: 'Faculty',
  STAFF: 'Staff',
}

/** Highest first. Position in this list is the privilege ceiling. */
export const ROLE_RANK: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'ACCOUNTANT',
  'COUNSELLOR',
  'FACULTY',
  'STAFF',
]

export function rankOf(role: UserRole): number {
  return ROLE_RANK.indexOf(role)
}

/**
 * Which roles an actor may grant.
 *
 * RULE: nobody can create an account more privileged than their own, and
 * only a SUPER_ADMIN can mint another SUPER_ADMIN. Without this, an ADMIN
 * could promote themselves to SUPER_ADMIN via a second account and shed
 * every restriction the matrix places on them.
 */
export function assignableRoles(actor: UserRole): UserRole[] {
  if (actor === 'SUPER_ADMIN') return [...ROLE_RANK]
  return ROLE_RANK.filter((r) => rankOf(r) > rankOf(actor))
}

export function canAssignRole(actor: UserRole, target: UserRole): boolean {
  return assignableRoles(actor).includes(target)
}

export interface AccountGuardInput {
  actorId: string
  actorRole: UserRole
  targetUserId: string
  targetRole: UserRole
  /** How many active SUPER_ADMINs exist, this target included. */
  activeSuperAdminCount: number
}

/**
 * Whether the actor may change this account at all (role, active state,
 * password). Returns a reason when not, so the UI can say why rather than
 * silently hiding the control.
 */
export function accountChangeBlockedReason(
  input: AccountGuardInput,
): string | null {
  // Self-modification: you may not change your own role or lock yourself
  // out. Resetting your own password is done from the account menu, not here.
  if (input.actorId === input.targetUserId) {
    return 'You cannot change your own access from here.'
  }

  // You may not touch an account at or above your own level.
  if (rankOf(input.targetRole) <= rankOf(input.actorRole) && input.actorRole !== 'SUPER_ADMIN') {
    return `Only a ${ROLE_LABELS.SUPER_ADMIN} can change a ${ROLE_LABELS[input.targetRole]} account.`
  }

  return null
}

/**
 * Whether deactivating this account is safe.
 *
 * Deactivating the last active SUPER_ADMIN locks everyone out of user
 * administration permanently, with no way back through the UI.
 */
export function deactivationBlockedReason(
  input: AccountGuardInput,
): string | null {
  const base = accountChangeBlockedReason(input)
  if (base) return base

  if (input.targetRole === 'SUPER_ADMIN' && input.activeSuperAdminCount <= 1) {
    return 'This is the last active Super Admin. Promote someone else first, or nobody will be able to administer users.'
  }

  return null
}

/**
 * A readable one-time password for a new or reset account.
 *
 * Deliberately avoids characters that are misread when a password is written
 * on paper and handed over, which is how these are actually distributed.
 */
export function generateTemporaryPassword(
  randomBytes: (n: number) => Uint8Array,
): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I or O
  const lower = 'abcdefghijkmnpqrstuvwxyz' // no l or o
  const digits = '23456789' // no 0 or 1
  const all = upper + lower + digits

  const bytes = randomBytes(16)
  const pick = (set: string, i: number) => set[bytes[i]! % set.length]!

  // Guarantee the policy is met regardless of what the random bytes give.
  const core = [pick(upper, 0), pick(lower, 1), pick(digits, 2)]
  for (let i = 3; i < 12; i += 1) core.push(pick(all, i))

  return core.join('')
}
