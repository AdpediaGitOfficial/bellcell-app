import { requireUser } from '@/lib/auth/current-user'
import { canView } from '@/lib/rbac/can'
import { NAV } from '@/lib/nav'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  // The nav is filtered by permission, so a counsellor never sees Accounts
  // and an empty group never renders a bare heading.
  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => canView(user, item.resource)),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="flex min-h-screen">
      <Sidebar groups={groups} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          fullName={user.fullName}
          role={user.role}
          branches={user.branches}
          activeBranchId={user.activeBranchId}
          allowAllBranches={user.role === 'SUPER_ADMIN'}
        />
        <main className="flex-1 px-4 py-6 md:px-6 md:py-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
