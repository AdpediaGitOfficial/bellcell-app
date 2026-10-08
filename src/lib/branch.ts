import 'server-only'
import type { CurrentUser } from '@/lib/auth/current-user'

/**
 * Branch scoping.
 *
 * Every tenant-scoped query MUST go through this helper. Forgetting a
 * `branchId` filter is the single easiest way to leak one centre's students
 * into another's screens, so the rule is: never write a bare `where` on a
 * branch-scoped table - spread `branchScope(user)` into it.
 */
export function branchScope(user: CurrentUser): { branchId?: string } {
  // A SUPER_ADMIN viewing "All branches" gets an unscoped read.
  if (user.role === 'SUPER_ADMIN' && user.activeBranchId === null) return {}
  if (!user.activeBranchId) {
    // A non-super user with no branch assigned can see nothing, rather than
    // everything. Failing closed is the only safe default here.
    return { branchId: '__none__' }
  }
  return { branchId: user.activeBranchId }
}

/**
 * Raised when a record must be created but no single branch is in context —
 * which happens whenever a SUPER_ADMIN is viewing "All branches". Callers
 * catch this and ask the user which branch, rather than failing with a 500.
 */
export class NoBranchSelectedError extends Error {
  constructor() {
    super('No active branch selected; cannot create branch-scoped record')
    this.name = 'NoBranchSelectedError'
  }
}

/**
 * The branch a newly created record belongs to.
 *
 * `explicit` comes from a branch picker that create forms render when the
 * user is in all-branches mode. It is validated against the user's own
 * branches, so a tampered form value cannot write into another centre.
 */
export function writeBranchId(
  user: CurrentUser,
  explicit?: string | null,
): string {
  if (explicit) {
    if (!canAccessBranch(user, explicit)) throw new NoBranchSelectedError()
    return explicit
  }
  if (!user.activeBranchId) throw new NoBranchSelectedError()
  return user.activeBranchId
}

/** True when create forms must ask the user to pick a branch. */
export function needsBranchChoice(user: CurrentUser): boolean {
  return user.activeBranchId === null && user.branches.length > 0
}

export function canAccessBranch(user: CurrentUser, branchId: string): boolean {
  if (user.role === 'SUPER_ADMIN') return true
  return user.branches.some((b) => b.id === branchId)
}
