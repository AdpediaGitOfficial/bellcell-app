'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const BASE = '/accounts/day-book'

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function DayBookControls({
  fromISO,
  toISO,
}: {
  fromISO: string
  toISO: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const go = (from: string, to: string) =>
    startTransition(() => router.push(`${BASE}?from=${from}&to=${to}`))

  const today = new Date()
  const shortcuts: [string, () => void][] = [
    ['Today', () => go(iso(today), iso(today))],
    [
      'Yesterday',
      () => {
        const d = new Date(today)
        d.setDate(d.getDate() - 1)
        go(iso(d), iso(d))
      },
    ],
    [
      'This month',
      () => {
        const start = new Date(today.getFullYear(), today.getMonth(), 1)
        go(iso(start), iso(today))
      },
    ],
  ]

  const input =
    'h-9 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] px-2.5 text-[13px] text-strong focus:border-brand-500 focus:outline-none'

  return (
    <div className="no-print flex flex-wrap items-end gap-3 border-b border-[rgb(var(--border-base))] px-5 py-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">From</span>
        <input
          type="date"
          value={fromISO}
          max={toISO}
          onChange={(e) => go(e.target.value, toISO)}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">To</span>
        <input
          type="date"
          value={toISO}
          min={fromISO}
          onChange={(e) => go(fromISO, e.target.value)}
          className={input}
        />
      </label>

      <div className="flex gap-1">
        {shortcuts.map(([label, fn]) => (
          <button
            key={label}
            type="button"
            onClick={fn}
            className="rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ml-auto">
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden />
          Print
        </Button>
      </div>
    </div>
  )
}
