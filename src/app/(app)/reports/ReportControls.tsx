'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Select } from '@/components/ui/Field'

const GROUPS = [
  { value: 'counsellor', label: 'Counsellor' },
  { value: 'source', label: 'Source' },
  { value: 'course', label: 'Course' },
  { value: 'branch', label: 'Branch' },
]

/**
 * Date range + grouping, written to the URL so the export route reproduces
 * exactly what is on screen.
 */
export function ReportControls({
  basePath,
  fromISO,
  toISO,
  groupBy,
}: {
  basePath: string
  fromISO: string
  toISO: string
  groupBy: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const push = (key: string, value: string) => {
    const sp = new URLSearchParams(searchParams.toString())
    if (value) sp.set(key, value)
    else sp.delete(key)
    startTransition(() => router.push(`${basePath}?${sp.toString()}`))
  }

  const input =
    'h-9 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] px-2.5 text-[13px] text-strong focus:border-brand-500 focus:outline-none'

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-[rgb(var(--border-base))] px-5 py-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">From</span>
        <input
          type="date"
          value={fromISO}
          max={toISO}
          onChange={(e) => push('from', e.target.value)}
          className={input}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">To</span>
        <input
          type="date"
          value={toISO}
          min={fromISO}
          onChange={(e) => push('to', e.target.value)}
          className={input}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Group by</span>
        <Select
          value={groupBy}
          onChange={(e) => push('groupBy', e.target.value)}
          className="h-9 w-auto min-w-[150px] text-[13px]"
        >
          {GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
      </label>
    </div>
  )
}
