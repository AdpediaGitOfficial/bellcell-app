'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Rows2, Rows3 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Density } from '@/lib/table/density'

/**
 * Admissions and accounts staff doing bulk entry live in compact mode; the
 * choice is stored in a cookie so it is applied server-side on first paint.
 */
export function DensityToggle({ density }: { density: Density }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const set = (next: Density) => {
    document.cookie = `bellcell_density=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    startTransition(() => router.refresh())
  }

  return (
    <div
      className="inline-flex rounded-lg border border-[rgb(var(--border-base))] p-0.5"
      role="group"
      aria-label="Row density"
    >
      {(
        [
          ['comfortable', Rows2, 'Comfortable rows'],
          ['compact', Rows3, 'Compact rows'],
        ] as const
      ).map(([value, Icon, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => set(value)}
          disabled={pending}
          title={label}
          aria-label={label}
          aria-pressed={density === value}
          className={cn(
            'rounded-md p-1.5',
            density === value
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'text-faint hover:text-strong',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      ))}
    </div>
  )
}
