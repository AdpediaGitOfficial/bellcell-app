import { cn } from '@/lib/cn'

/**
 * Never a blank box: icon, the cause in one line, and the action that fixes
 * it. "No rows" with no next step is a dead end for the user.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto max-w-sm text-center', className)}>
      {icon && (
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(var(--surface-sunken))] text-faint">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-strong">{title}</p>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  )
}
