'use client'

import { useState, useTransition } from 'react'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { switchBranchAction } from '@/app/(app)/actions'

export interface BranchOption {
  id: string
  name: string
  code: string
}

/**
 * Branch scoping is visible at all times, because "which centre am I looking
 * at?" is the question behind every number on screen. The vendor scope had no
 * Branch master at all - see docs/decisions.md ADR-002.
 */
export function BranchSwitcher({
  branches,
  activeBranchId,
  allowAll,
}: {
  branches: BranchOption[]
  activeBranchId: string | null
  allowAll: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const active = branches.find((b) => b.id === activeBranchId)
  const label = active ? active.name : allowAll ? 'All branches' : 'Select branch'

  if (branches.length <= 1 && !allowAll) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border-base))] px-3 py-2 text-sm text-muted">
        <Building2 className="h-4 w-4 text-brand-600" aria-hidden />
        {label}
      </span>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] px-3 py-2 text-sm font-medium text-strong hover:bg-[rgb(var(--surface-hover))] disabled:opacity-60"
      >
        <Building2 className="h-4 w-4 text-brand-600" aria-hidden />
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown className="h-4 w-4 text-faint" aria-hidden />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <ul
            role="listbox"
            className="animate-slide-down absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] p-1 shadow-popover"
          >
            {allowAll && (
              <Option
                label="All branches"
                selected={activeBranchId === null}
                onSelect={() =>
                  startTransition(async () => {
                    await switchBranchAction(null)
                    setOpen(false)
                  })
                }
              />
            )}
            {branches.map((b) => (
              <Option
                key={b.id}
                label={b.name}
                hint={b.code}
                selected={b.id === activeBranchId}
                onSelect={() =>
                  startTransition(async () => {
                    await switchBranchAction(b.id)
                    setOpen(false)
                  })
                }
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Option({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string
  hint?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
          selected
            ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-200'
            : 'text-base hover:bg-[rgb(var(--surface-hover))]',
        )}
      >
        <span className="min-w-0 truncate">
          {label}
          {hint && <span className="ml-1.5 text-faint">{hint}</span>}
        </span>
        {selected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
      </button>
    </li>
  )
}
