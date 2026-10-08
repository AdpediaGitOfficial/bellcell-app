'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current-user'
import { destroySession, setActiveBranch } from '@/lib/auth/session'
import { canAccessBranch } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'

export async function switchBranchAction(branchId: string | null): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  if (branchId === null) {
    // "All branches" is a SUPER_ADMIN-only view.
    if (user.role !== 'SUPER_ADMIN') return
    await setActiveBranch(null)
    revalidatePath('/', 'layout')
    return
  }

  if (!canAccessBranch(user, branchId)) return

  await setActiveBranch(branchId)
  revalidatePath('/', 'layout')
}

export async function signOutAction(): Promise<void> {
  const user = await getCurrentUser()
  if (user) {
    await recordAudit({
      userId: user.id,
      branchId: user.activeBranchId,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: user.id,
      summary: `${user.fullName} signed out`,
    })
  }
  await destroySession()
  redirect('/login')
}
