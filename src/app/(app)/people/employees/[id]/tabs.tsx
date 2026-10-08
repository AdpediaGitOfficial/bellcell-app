import Link from 'next/link'
import { cn } from '@/lib/cn'

export const TABS = [
  { key: 'personal', label: 'Personal' },
  { key: 'education', label: 'Education' },
  { key: 'experience', label: 'Experience' },
  { key: 'languages', label: 'Language skills' },
  { key: 'access', label: 'Login & access' },
] as const

export type TabKey = (typeof TABS)[number]['key']

export function isTab(value: string | undefined): value is TabKey {
  return TABS.some((t) => t.key === value)
}

/** Tabs are links, not state — see the applications record for the rationale. */
export function RecordTabs({
  basePath,
  active,
  counts,
  hidden,
}: {
  basePath: string
  active: TabKey
  counts?: Partial<Record<TabKey, number>>
  /** Tabs the signed-in user may not see at all. */
  hidden?: TabKey[]
}) {
  const tabs = TABS.filter((t) => !hidden?.includes(t.key))
  return (
    <div
      role="tablist"
      className="scroll-slim mb-4 flex gap-1 overflow-x-auto border-b border-[rgb(var(--border-base))]"
    >
      {tabs.map((t) => {
        const isActive = t.key === active
        const count = counts?.[t.key]
        return (
          <Link
            key={t.key}
            role="tab"
            aria-selected={isActive}
            href={`${basePath}?tab=${t.key}`}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'border-brand-600 text-brand-700 dark:text-brand-400'
                : 'border-transparent text-muted hover:border-[rgb(var(--border-strong))] hover:text-strong',
            )}
          >
            {t.label}
            {count !== undefined && count > 0 && (
              <span className="numeric ml-1.5 rounded-full bg-[rgb(var(--surface-sunken))] px-1.5 py-0.5 text-[11px] text-muted">
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
