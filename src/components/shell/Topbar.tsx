import { Search } from 'lucide-react'
import { BranchSwitcher, type BranchOption } from './BranchSwitcher'
import { UserMenu } from './UserMenu'

export function Topbar({
  fullName,
  role,
  branches,
  activeBranchId,
  allowAllBranches,
}: {
  fullName: string
  role: string
  branches: BranchOption[]
  activeBranchId: string | null
  allowAllBranches: boolean
}) {
  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))]/90 px-4 backdrop-blur md:px-6">
      <label className="relative hidden min-w-0 flex-1 items-center sm:flex md:max-w-md">
        <Search
          className="pointer-events-none absolute left-3 h-4 w-4 text-faint"
          aria-hidden
        />
        <span className="sr-only">Search</span>
        <input
          type="search"
          placeholder="Search students, enquiries, receipts…"
          className="h-10 w-full rounded-full border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-sunken))] pl-9 pr-4 text-sm text-strong placeholder:text-faint focus:border-brand-500 focus:bg-[rgb(var(--surface-card))] focus:outline-none"
        />
      </label>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <BranchSwitcher
          branches={branches}
          activeBranchId={activeBranchId}
          allowAll={allowAllBranches}
        />
        <div className="h-6 w-px bg-[rgb(var(--border-base))]" aria-hidden />
        <UserMenu fullName={fullName} role={role} />
      </div>
    </header>
  )
}
