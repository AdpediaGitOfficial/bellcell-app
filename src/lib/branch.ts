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

/** The branch a newly created record belongs to. Throws when ambiguous. */
export function writeBranchId(user: CurrentUser): string {
  if (!user.activeBranchId) {
    throw new Error('No active branch selected; cannot create branch-scoped record')
  }
  return user.activeBranchId
}

export function canAccessBranch(user: CurrentUser, branchId: string): boolean {
  if (user.role === 'SUPER_ADMIN') return true
  return user.branches.some((b) => b.id === branchId)
}
