'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { signOutAction } from '@/app/(app)/actions'

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrator',
  ACCOUNTANT: 'Accountant',
  COUNSELLOR: 'Counsellor',
  FACULTY: 'Faculty',
  STAFF: 'Staff',
}

export function UserMenu({
  fullName,
  role,
}: {
  fullName: string
  role: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-[rgb(var(--surface-hover))]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
          {initials || <UserRound className="h-4 w-4" aria-hidden />}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-strong">{fullName}</span>
          <span className="block text-xs text-faint">
            {ROLE_LABELS[role] ?? role}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-faint" aria-hidden />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="animate-slide-down absolute right-0 z-20 mt-1 w-56 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] p-1 shadow-popover"
          >
            <div className="border-b border-[rgb(var(--border-base))] px-3 py-2">
              <p className="truncate text-sm font-medium text-strong">{fullName}</p>
              <p className="truncate text-xs text-faint">
                {ROLE_LABELS[role] ?? role}
              </p>
            </div>
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => startTransition(() => signOutAction())}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-base hover:bg-[rgb(var(--surface-hover))] disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {pending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
