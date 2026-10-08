import { cn } from '@/lib/cn'
import { Card } from './Card'

export interface StatTileProps {
  label: string
  value: string
  /** Signed percentage change. Omit when there is no comparable prior period. */
  deltaPct?: number
  /**
   * REQUIRED whenever deltaPct is given. A delta with no comparison window
   * ("+12.4%") is unreadable - the reference dashboard makes this mistake on
   * every tile. See docs/design-system.md §5.3.
   */
  comparison?: string
  /** When true, a rise is bad (e.g. overdue fees) and is coloured critical. */
  inverse?: boolean
  icon: React.ReactNode
  tint: 'brand' | 'violet' | 'amber' | 'rose'
  children?: React.ReactNode
}

const TINTS = {
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
} as const

export function StatTile({
  label,
  value,
  deltaPct,
  comparison,
  inverse = false,
  icon,
  tint,
  children,
}: StatTileProps) {
  const hasDelta = typeof deltaPct === 'number' && Number.isFinite(deltaPct)
  const rising = hasDelta && deltaPct > 0
  const good = hasDelta ? (inverse ? !rising : rising) : null

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            TINTS[tint],
          )}
          aria-hidden
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-muted">{label}</p>
          <p className="numeric mt-1 text-2xl font-semibold tracking-tight text-strong">
            {value}
          </p>

          {hasDelta && (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-xs">
              <span
                className={cn(
                  'numeric font-medium',
                  good
                    ? 'text-positive-600 dark:text-positive-500'
                    : 'text-critical-600 dark:text-critical-500',
                )}
              >
                {/* Arrow + sign, so direction is never colour-alone. */}
                {rising ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
              </span>
              <span className="text-faint">{comparison}</span>
            </p>
          )}
        </div>

        {children && <div className="shrink-0 self-end">{children}</div>}
      </div>
    </Card>
  )
}
