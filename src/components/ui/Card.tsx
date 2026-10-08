import { cn } from '@/lib/cn'

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('surface-card rounded-card shadow-card', className)}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-5 pt-5 pb-3',
        className,
      )}
    >
      <h2 className="text-base font-semibold text-strong">{title}</h2>
      {action}
    </div>
  )
}
