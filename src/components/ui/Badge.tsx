import { cn } from '@/lib/cn'

export type Tone = 'neutral' | 'brand' | 'positive' | 'caution' | 'critical' | 'info'

/**
 * Status is never colour-alone: every tone ships with a text label, and
 * callers pass an icon where the distinction carries weight (overdue fees,
 * certificates not returned).
 */
const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-950 dark:text-brand-200 dark:ring-brand-800',
  positive: 'bg-positive-50 text-positive-700 ring-positive-500/25 dark:bg-positive-700/15 dark:text-positive-500',
  caution: 'bg-caution-50 text-caution-700 ring-caution-500/25 dark:bg-caution-700/15 dark:text-caution-500',
  critical: 'bg-critical-50 text-critical-700 ring-critical-500/25 dark:bg-critical-700/15 dark:text-critical-500',
  info: 'bg-info-50 text-info-700 ring-info-500/25 dark:bg-info-700/15 dark:text-info-500',
}

export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
}: {
  tone?: Tone
  children: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
