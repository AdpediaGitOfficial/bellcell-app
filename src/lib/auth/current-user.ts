import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { UserRole } from '@prisma/client'
import { db } from '@/lib/db'
import { hashToken, readSessionToken } from './session'
import type { Principal } from '@/lib/rbac/can'

export interface CurrentUser extends Principal {
  id: string
  email: string
  fullName: string
  role: UserRole
  /** Branches this user may act in. SUPER_ADMIN sees all. */
  branches: { id: string; name: string; code: string }[]
  /** The branch currently selected in this session. */
  activeBranchId: string | null
  overrides: Record<string, boolean>
}

/**
 * Resolves the signed-in user for the current request. Wrapped in React
 * `cache` so the many components that need it cause one query per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readSessionToken()
  if (!token) return null

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          overrides: true,
          branches: { include: { branch: true } },
        },
      },
    },
  })

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null
  if (!session.user.isActive) return null

  const user = session.user

  const branches =
    user.role === 'SUPER_ADMIN'
      ? await db.branch.findMany({
          where: { archivedAt: null },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, code: true },
        })
      : user.branches.map((ub) => ({
          id: ub.branch.id,
          name: ub.branch.name,
          code: ub.branch.code,
        }))

  const overrides: Record<string, boolean> = {}
  for (const o of user.overrides) overrides[o.permission] = o.granted

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    branches,
    // For a SUPER_ADMIN, a NULL session branch means "All branches" and must
    // NOT fall back to the first branch. For everyone else it means "not
    // chosen yet", so we default them into their first permitted branch.
    activeBranchId:
      session.branchId ??
      (user.role === 'SUPER_ADMIN' ? null : (branches[0]?.id ?? null)),
    overrides,
  }
})

/** Use in every protected page/layout. Redirects to login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}
