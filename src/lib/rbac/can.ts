import type { UserRole } from '@prisma/client'
import { MATRIX } from './matrix'
import type { Action, Permission, Resource } from './resources'

export interface Principal {
  role: UserRole
  /** Explicit per-user exceptions, from user_permission_overrides. */
  overrides?: Record<string, boolean>
}

/**
 * The single authorisation entry point.
 *
 * Order of precedence:
 *   1. An explicit DENY override always wins, even over SUPER_ADMIN.
 *   2. SUPER_ADMIN is allowed everything else.
 *   3. An explicit GRANT override.
 *   4. The role matrix.
 */
export function can(
  principal: Principal,
  resource: Resource,
  action: Action,
): boolean {
  const key: Permission = `${resource}:${action}`
  const override = principal.overrides?.[key]

  if (override === false) return false
  if (principal.role === 'SUPER_ADMIN') return true
  if (override === true) return true

  const allowed = MATRIX[principal.role]?.[resource]
  return allowed?.includes(action) ?? false
}

/** True when the principal can see the resource at all (drives nav). */
export function canView(principal: Principal, resource: Resource): boolean {
  return can(principal, resource, 'view')
}

/** Throwing variant for use at the top of a Server Action. */
export class ForbiddenError extends Error {
  constructor(
    public readonly resource: Resource,
    public readonly action: Action,
  ) {
    super(`Not permitted: ${resource}:${action}`)
    this.name = 'ForbiddenError'
  }
}

export function assertCan(
  principal: Principal,
  resource: Resource,
  action: Action,
): void {
  if (!can(principal, resource, action)) {
    throw new ForbiddenError(resource, action)
  }
}
