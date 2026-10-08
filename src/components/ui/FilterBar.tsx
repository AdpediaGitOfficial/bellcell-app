'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { Search, X } from 'lucide-react'
import { Select } from './Field'

export interface FilterSpec {
  key: string
  label: string
  options: { value: string; label: string }[]
}

/**
 * One row of controls above every table. Writes to the URL, never to local
 * state, so the view is shareable and the export route can reuse it verbatim.
 */
export function FilterBar({
  basePath,
  filters,
  searchPlaceholder = 'Search…',
  children,
}: {
  basePath: string
  filters: FilterSpec[]
  searchPlaceholder?: string
  children?: React.ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [q, setQ] = useState(searchParams.get('q') ?? '')

  // Keep the box in step when the user navigates back/forward.
  useEffect(() => {
    setQ(searchParams.get('q') ?? '')
  }, [searchParams])

  const push = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(searchParams.toString())
      mutate(sp)
      sp.delete('page') // any filter change returns to page 1
      const qs = sp.toString()
      startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath))
    },
    [basePath, router, searchParams],
  )

  // Debounce typing so we don't issue a request per keystroke.
  useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (q === current) return
    const t = setTimeout(() => {
      push((sp) => {
        if (q) sp.set('q', q)
        else sp.delete('q')
      })
    }, 350)
    return () => clearTimeout(t)
  }, [q, push, searchParams])

  const activeCount =
    filters.filter((f) => searchParams.get(f.key)).length +
    (searchParams.get('q') ? 1 : 0)

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--border-base))] px-5 py-3">
      <label className="relative flex min-w-[200px] flex-1 items-center md:max-w-xs">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-faint" aria-hidden />
        <span className="sr-only">Search</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-sunken))] pl-9 pr-3 text-sm text-strong placeholder:text-faint focus:border-brand-500 focus:bg-[rgb(var(--surface-card))] focus:outline-none"
        />
      </label>

      {filters.map((f) => (
        <Select
          key={f.key}
          aria-label={f.label}
          value={searchParams.get(f.key) ?? ''}
          onChange={(e) =>
            push((sp) => {
              if (e.target.value) sp.set(f.key, e.target.value)
              else sp.delete(f.key)
            })
          }
          className="h-9 w-auto min-w-[140px] text-[13px]"
        >
          <option value="">{f.label}: All</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() =>
            startTransition(() => router.push(basePath))
          }
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-muted hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear ({activeCount})
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  )
}
